/**
 * TEST FILE: checkapi_vsdbOptasub[1311].spec.ts
 *
 * MỤC ĐÍCH: So sánh ĐƠN GIẢN, KHÔNG lồng logic ưu tiên CDN — chỉ trả lời:
 *   "API /lineups đang trả teamShirtColor là gì" so với
 *   "DB (opta_match_lineup.kit.colour1) đang lưu Opta báo màu gì cho ĐÚNG
 *   trận + đúng team đó".
 *
 * ĐÃ SỬA: bản trước lấy danh sách team để check từ bảng team_shirt, nhưng
 * team_shirt hiện đang RỖNG (0 dòng, phát hiện 2026-07-21 — có thể ai đó
 * đang xử lý dọn duplicate rows và giữa quá trình migrate/reload) nên test
 * cũ luôn ra total=0, không check được gì. Bản này lấy danh sách TRỰC TIẾP
 * từ opta_match_lineup (qua các trận gần nhất trong sport_events + mp_match),
 * KHÔNG còn phụ thuộc team_shirt để chạy — team_shirt chỉ còn dùng làm
 * tham khảo phụ (hasCdnLink) khi có data, không chặn test nếu rỗng.
 *
 * KHÁC VỚI check_US[1311]_staging.spec.ts (TEST 2 — rule ưu tiên CDN > opta):
 * file đó tính "màu mong đợi" theo rule ưu tiên (có CDN thì bỏ qua opta) rồi
 * mới so với API. File NÀY không quan tâm rule ưu tiên — so THẲNG API vs DB
 * Opta, để tự nhìn ra: khi nào 2 bên khớp (không có CDN override, hoặc CDN
 * trùng màu opta) và khi nào lệch (có thể do CDN đang override — cần chéo
 * kiểm với team_shirt.team_shirt_link để phân biệt override hợp lệ với bug
 * thật). Không tự kết luận PASS/FAIL — chỉ để lộ ra khớp/lệch quan sát được.
 *
 * MAPPING ID (opta_match_lineup dùng id của Opta, khác thesports id):
 *   - mp_team  (thesport_id <-> opta_id)  — map team_id sang opta contestant_id
 *   - mp_match (thesport_id <-> opta_id)  — map sport_event_id sang opta match_id
 *   - opta_match_lineup.kit = { id, type: "home"|"away"|"third", colour1, colour2? }
 *
 * QUY TRÌNH — driven theo TRẬN (không theo team), quét TOÀN BỘ (không giới hạn):
 *   1. Lấy TOÀN BỘ trận ĐÃ ĐÁ (start_timestamp < now) mà opta_match_lineup ĐÃ
 *      CÓ kit.colour1 hợp lệ (type home/away) — xuất phát từ opta_match_lineup
 *      JOIN mp_match JOIN sport_events, không LIMIT, sắp start_timestamp giảm dần.
 *   2. Với mỗi trận: query opta_match_lineup WHERE match_id = opta_match_id
 *      của trận đó -> có thể ra 2 dòng (1 home, 1 away theo kit.type) hoặc
 *      hơn (kit "third" nếu có, bỏ qua vì team_shirt/API không có khái
 *      niệm áo thứ 3).
 *   3. Với mỗi dòng kit hợp lệ (type home/away, có colour1):
 *      a. Map contestant_id -> team_id (thesports) qua mp_team (reverse).
 *      b. Không map được team_id, hoặc team_id đó không khớp cả
 *         home_team_id/away_team_id của trận (data lệch) -> bỏ qua, log riêng.
 *      c. fixtureSide = team_id trùng home_team_id hay away_team_id CỦA TRẬN
 *         (khác kit.type — xem lưu ý phân biệt 2 khái niệm "side" ở
 *         check_US[1311]_staging.spec.ts).
 *   4. Encode sport_event_id (1 lần/trận, dùng lại cho cả 2 kit của trận đó)
 *      -> gọi /event/{encoded}/lineups?language=en 1 lần -> lấy
 *      teamShirtColor của data.home và data.away trong CÙNG 1 response.
 *   5. So kit.colour1 (DB opta) với teamShirtColor (API) theo đúng fixtureSide
 *      cho từng kit -> match/mismatch.
 *   6. team_shirt (nếu có data) chỉ dùng để gắn thêm hasCdnLink tham khảo —
 *      không dùng để lọc/chặn kết quả.
 *
 * CHẠY:
 *   npx playwright test "tests/checkapi_vsdbOptasub\[1311\].spec.ts" --project=chrome
 */

import { test, expect } from '@playwright/test';
import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

const RESULTS_DIR = path.join(__dirname, '..', 'results');

function saveJson(filename: string, data: unknown): void {
  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.writeFileSync(path.join(RESULTS_DIR, filename), JSON.stringify(data, null, 2), 'utf-8');
  console.log(`Đã lưu: results/${filename}`);
}

// ─── CẤU HÌNH ──────────────────────────────────────────────────────────────

const DB_CONFIG = {
  host:                    process.env.DB_HOST || '',
  port:                    6432,
  user:                    'readonly',
  password:                process.env.DB_PASSWORD || '',
  database:                'football',
  ssl:                     { rejectUnauthorized: false },
  connectionTimeoutMillis: 30_000,
};

const ENCODE_BASE = 'https://opta-api.uniscore.vn/api/v1'; // encode vẫn internal
const EVENT_BASE  = 'https://api.unik8s.com/api/v2';       // lineups → PROD

// ─── KIỂU DỮ LIỆU ──────────────────────────────────────────────────────────

type CheckStatus =
  | 'match'              // API teamShirtColor === DB opta kit.colour1
  | 'mismatch'            // khác nhau — xem hasCdnLink để đoán nguyên nhân (log, không tự kết luận bug)
  | 'team_id_map_failed'  // contestant_id không map được team_id, hoặc team_id không khớp home/away của trận
  | 'no_api_color';       // có kit hợp lệ nhưng API không trả teamShirtColor cho phía đó

interface CheckResult {
  sport_event_id: string;
  kitType:      'home' | 'away'; // kit.type từ opta (loại áo)
  contestant_id: string;
  team_id?:      string;
  teamName?:     string | null;
  fixtureSide?:  'home' | 'away'; // team đá sân nhà/khách CỦA TRẬN (dùng để đọc đúng field trong response /lineups)
  status:        CheckStatus;
  dbOptaColor?:  string;          // opta_match_lineup.kit.colour1
  apiColor?:     string;          // teamShirtColor API /lineups trả về
  hasCdnLink?:   boolean;         // THAM KHẢO — team_shirt có link cho kitType này không (team_shirt có thể đang rỗng -> luôn false)
}

// ─── HELPER: GỌI API ────────────────────────────────────────────────────────

function httpGetText(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        if (res.statusCode !== 200) return resolve(null);
        resolve(data.trim());
      });
    }).on('error', () => resolve(null));
  });
}

function httpGetJson(url: string): Promise<{ ok: boolean; json?: any }> {
  return new Promise((resolve) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        if (res.statusCode !== 200) return resolve({ ok: false });
        try { resolve({ ok: true, json: JSON.parse(data) }); }
        catch { resolve({ ok: false }); }
      });
    }).on('error', () => resolve({ ok: false }));
  });
}

async function encodeId(rawId: string): Promise<string | null> {
  return httpGetText(`${ENCODE_BASE}/encode/${rawId}`);
}

// Chạy tối đa `concurrency` task song song thay vì tuần tự từng trận một —
// bottleneck thật là round-trip HTTP (encode + lineups) mỗi trận, không phải
// CPU, nên chạy song song giảm thời gian gần theo tỉ lệ concurrency.
async function runPool<T>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<void>): Promise<void> {
  let next = 0;
  async function runNext(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runNext));
}

// ─── TEST SUITE ─────────────────────────────────────────────────────────────

test.describe('API teamShirtColor vs DB opta_match_lineup.kit.colour1 (driven theo trận, không phụ thuộc team_shirt)', () => {

  test.setTimeout(0);

  let db: Client;

  test.beforeAll(async () => {
    db = new Client(DB_CONFIG);
    await db.connect();
  });

  test.afterAll(async () => {
    await db.end();
  });

  test('teamShirtColor mà API /lineups trả về phải khớp opta_match_lineup.kit.colour1 lưu trong DB cho đúng trận', async () => {
    // Lấy TOÀN BỘ trận ĐÃ ĐÁ (start_timestamp < now) mà opta_match_lineup ĐÃ
    // CÓ kit home/away hợp lệ — xuất phát từ opta_match_lineup (không phải
    // sport_events) để tránh quét lãng phí các trận chưa có kit (trước đó
    // quét ngẫu nhiên 500 trận gần nhất theo sport_events thì chỉ 458 có kit,
    // rất phí; đi từ opta_match_lineup trước sẽ luôn có kit ngay).
    const nowTs = Math.floor(Date.now() / 1000);
    const matchesRes = await db.query<{ sport_event_id: string; home_team_id: string; away_team_id: string; opta_match_id: string }>(`
      SELECT DISTINCT sp.id AS sport_event_id, sp.home_team_id, sp.away_team_id, mm.opta_id AS opta_match_id, sp.start_timestamp
      FROM   opta_match_lineup oml
      JOIN   mp_match mm ON mm.opta_id = oml.match_id
      JOIN   sport_events sp ON sp.id = mm.thesport_id
      WHERE  sp.start_timestamp < $1
        AND  oml.kit->>'colour1' IS NOT NULL
        AND  oml.kit->>'type' IN ('home', 'away')
      ORDER  BY sp.start_timestamp DESC
    `, [nowTs]);
    console.log(`\nTổng trận lấy để quét (đã có kit hợp lệ trong opta_match_lineup): ${matchesRes.rows.length}`);

    // team_shirt CHỈ dùng tham khảo (hasCdnLink) — nếu rỗng thì mọi hasCdnLink = false, không chặn test
    const shirtLinksRes = await db.query<{ team_id: string; team_shirt_link: string | null }>(`
      SELECT team_id, team_shirt_link FROM team_shirt
    `);
    console.log(`team_shirt hiện có: ${shirtLinksRes.rows.length} dòng (0 = đang rỗng, chỉ ảnh hưởng hasCdnLink tham khảo)`);
    const hasCdnLink = (team_id: string, side: 'home' | 'away') =>
      shirtLinksRes.rows.some(r => r.team_id === team_id && r.team_shirt_link?.toLowerCase().endsWith(`/${side}.webp`));

    // Preload TOÀN BỘ dữ liệu cần tra cứu bằng vài query gộp — thay vì query
    // opta_match_lineup/mp_team/ts_teams LẶP LẠI cho từng trận/từng kit (cách
    // cũ tốn hàng chục nghìn round-trip DB tuần tự, rất chậm).
    const optaMatchIds = matchesRes.rows.map(m => m.opta_match_id);
    const lineupRowsRes = await db.query<{ match_id: string; contestant_id: string; kit: { type?: string; colour1?: string } }>(`
      SELECT match_id, contestant_id, kit FROM opta_match_lineup WHERE match_id = ANY($1::text[])
    `, [optaMatchIds]);
    const kitsByMatchId = new Map<string, typeof lineupRowsRes.rows>();
    for (const row of lineupRowsRes.rows) {
      if (!kitsByMatchId.has(row.match_id)) kitsByMatchId.set(row.match_id, []);
      kitsByMatchId.get(row.match_id)!.push(row);
    }

    // 1 opta_id có thể có NHIỀU dòng trong mp_team (vd cùng 1 contestant_id Opta
    // nhưng thesports lại tách 2 bản ghi team khác nhau) — giữ Map<opta_id, thesport_id[]>
    // thay vì 1-1, để không ghi đè mất dòng đúng khi có trùng.
    const mpTeamRes = await db.query<{ opta_id: string; thesport_id: string }>(`SELECT opta_id, thesport_id FROM mp_team`);
    const teamIdsByContestantId = new Map<string, string[]>();
    for (const r of mpTeamRes.rows) {
      if (!teamIdsByContestantId.has(r.opta_id)) teamIdsByContestantId.set(r.opta_id, []);
      teamIdsByContestantId.get(r.opta_id)!.push(r.thesport_id);
    }

    const teamsRes = await db.query<{ id: string; name: string | null }>(`SELECT id, name FROM ts_teams`);
    const teamNameById = new Map(teamsRes.rows.map(r => [r.id, r.name]));

    console.log(`Preload xong: ${lineupRowsRes.rows.length} dòng opta_match_lineup, ${teamIdsByContestantId.size} mp_team, ${teamNameById.size} ts_teams`);

    const results: CheckResult[] = [];
    let matchesWithKit = 0;
    let scanned = 0;

    const CONCURRENCY = 20; // số trận gọi API song song — bottleneck là network round-trip, không phải CPU
    await runPool(matchesRes.rows, CONCURRENCY, async (match) => {
      scanned++;
      if (scanned % 500 === 0) {
        console.log(`  → ${scanned}/${matchesRes.rows.length} trận | matchesWithKit=${matchesWithKit} | checks=${results.length} | mismatch=${results.filter(r => r.status === 'mismatch').length}`);
      }

      const kitRows = kitsByMatchId.get(match.opta_match_id) ?? [];
      const validKits = kitRows.filter(r => r.kit?.colour1 && (r.kit.type === 'home' || r.kit.type === 'away'));
      if (validKits.length === 0) return; // trận này chưa có kit data từ opta -> bỏ qua, thử trận khác

      matchesWithKit++;

      // encode 1 lần / trận, dùng lại cho cả 2 kit (home + away) của trận đó
      const encodedMatchId = await encodeId(match.sport_event_id);
      const lineupsRes = encodedMatchId ? await httpGetJson(`${EVENT_BASE}/football/event/${encodedMatchId}/lineups?language=en`) : { ok: false };

      for (const row of validKits) {
        const kit = row.kit;
        const kitType = kit.type as 'home' | 'away';

        // 1 contestant_id có thể map ra NHIỀU team_id ứng viên (mp_team trùng
        // dòng) — chọn ứng viên nào TRÙNG home/away của chính trận đang xét,
        // thay vì chỉ lấy 1 dòng bất kỳ (tránh bỏ sót dòng đúng khi bị trùng).
        const candidateTeamIds = teamIdsByContestantId.get(row.contestant_id) ?? [];
        const team_id = candidateTeamIds.find(id => id === match.home_team_id || id === match.away_team_id);
        const fixtureSide: 'home' | 'away' | undefined =
          team_id === match.home_team_id ? 'home' : team_id === match.away_team_id ? 'away' : undefined;

        if (!team_id || !fixtureSide) {
          results.push({
            sport_event_id: match.sport_event_id, kitType, contestant_id: row.contestant_id,
            team_id, status: 'team_id_map_failed',
          });
          continue;
        }

        const teamName = teamNameById.get(team_id) ?? null;

        const apiColor = lineupsRes.ok ? lineupsRes.json?.data?.[fixtureSide]?.teamShirtColor : null;
        if (!apiColor) {
          results.push({
            sport_event_id: match.sport_event_id, kitType, contestant_id: row.contestant_id,
            team_id, teamName, fixtureSide, status: 'no_api_color', dbOptaColor: kit.colour1,
          });
          continue;
        }

        results.push({
          sport_event_id: match.sport_event_id, kitType, contestant_id: row.contestant_id,
          team_id, teamName, fixtureSide,
          status: kit.colour1!.toLowerCase() === apiColor.toLowerCase() ? 'match' : 'mismatch',
          dbOptaColor: kit.colour1,
          apiColor,
          hasCdnLink: hasCdnLink(team_id, kitType),
        });
      }
    });

    const summary = {
      totalMatchesScanned:  matchesRes.rows.length,
      matchesWithOptaKit:   matchesWithKit,
      totalKitChecks:       results.length,
      match:                results.filter(r => r.status === 'match').length,
      mismatch:             results.filter(r => r.status === 'mismatch').length,
      team_id_map_failed:   results.filter(r => r.status === 'team_id_map_failed').length,
      no_api_color:         results.filter(r => r.status === 'no_api_color').length,
      mismatch_with_cdn_link:    results.filter(r => r.status === 'mismatch' && r.hasCdnLink === true).length,
      mismatch_without_cdn_link: results.filter(r => r.status === 'mismatch' && r.hasCdnLink === false).length,
      team_shirt_row_count: shirtLinksRes.rows.length, // 0 nghĩa là team_shirt đang rỗng lúc chạy test này
    };

    console.log(`\n${'═'.repeat(70)}`);
    console.log('KẾT QUẢ SO SÁNH: API teamShirtColor vs DB opta_match_lineup.kit.colour1 (driven theo trận)');
    console.log(`${'═'.repeat(70)}`);
    console.log(summary);

    const mapFailed = results.filter(r => r.status === 'team_id_map_failed');
    mapFailed.forEach(m => console.log(`\n[MAP_FAILED] match=${m.sport_event_id} kitType=${m.kitType} contestant_id=${m.contestant_id} -> team_id=${m.team_id ?? '(không map được)'}`));

    const mismatches = results.filter(r => r.status === 'mismatch');
    mismatches.forEach(m => {
      console.log(`\n[MISMATCH] match=${m.sport_event_id} team_id=${m.team_id} (${m.teamName}) kitType=${m.kitType} fixtureSide=${m.fixtureSide}`);
      console.log(`  dbOptaColor=${m.dbOptaColor}  apiColor=${m.apiColor}  hasCdnLink=${m.hasCdnLink} (${m.hasCdnLink ? 'có thể do CDN override — kiểm tra thêm team_shirt' : 'KHÔNG có CDN — đáng nghi, nên điều tra riêng'})`);
    });

    saveJson('checkapi-vsdb-opta-color.json', { summary, results });

    // Không assert cứng 0 mismatch — mismatch có CDN link là override hợp lệ, không phải bug.
    // Assert cho nhóm đáng nghi: mismatch mà KHÔNG có CDN link nào cả, và nhóm map thất bại (data lệch thật).
    expect.soft(
      summary.mismatch_without_cdn_link,
      `${summary.mismatch_without_cdn_link}/${results.length} kit KHÔNG có CDN link nhưng API teamShirtColor vẫn khác opta_match_lineup.kit.colour1 — đáng nghi, cần điều tra`
    ).toBe(0);

    expect.soft(
      mapFailed.length,
      `${mapFailed.length}/${results.length} kit KHÔNG map được contestant_id -> team_id đúng home/away của trận (mp_team thiếu mapping, hoặc data lệch)`
    ).toBe(0);
  });
});
