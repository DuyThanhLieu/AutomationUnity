/**
 * TEST FILE: check_US[1311]_staging.spec.ts
 *
 * MỤC ĐÍCH: Verify hình áo (team shirt) hiển thị trên UI là ĐÚNG, đối chiếu
 * cả 3 nguồn: (1) API thật đang serve cho UI, (2) DB (bảng team_shirt),
 * (3) file ảnh design gốc (từ design team, tải về local từ Google Drive).
 *
 * GỒM 2 TEST:
 *   TEST 1 — team_id đúng team (không bị gán nhầm), verify qua /encode + /event.
 *   TEST 2 — hình áo (link + màu + number style) mà API /lineups THẬT SỰ trả
 *            về cho UI phải khớp với DB, và phải có file design tương ứng.
 *
 * CƠ CHẾ 2 TẦNG ID (quan trọng, phát hiện được khi làm task này):
 *   - API /event/{encodedMatchId}         -> homeTeam.id / awayTeam.id là id
 *     ĐÃ ENCODE (khác hoàn toàn raw id trong DB, KHÔNG so trực tiếp được).
 *   - API /event/{encodedMatchId}/lineups -> field teamShirtLink chứa RAW
 *     team_id (vì đây chính là path CDN sinh ra từ team_shirt.team_id).
 *   - API /encode/{rawId} chuyển 1 raw id (match id HOẶC team id) sang dạng
 *     encoded — verified: encode(team_id DB) === homeTeam.id/awayTeam.id
 *     trả về từ /event cho đúng trận đó.
 *
 * QUY TRÌNH TEST 1 — verify từng team_id trong team_shirt:
 *   1. Tìm 1 trận (sport_events) có team_id này là home_team_id hoặc
 *      away_team_id (lấy trận gần nhất theo start_timestamp).
 *   2. Encode sport_event_id của trận đó -> gọi /event/{encoded} lấy
 *      homeTeam.id / awayTeam.id (encoded) + tên team theo phía tương ứng.
 *   3. Encode chính team_id đang verify -> so với id ở bước 2 (đúng phía
 *      home/away theo dữ liệu DB). Khớp -> team_id hợp lệ.
 *   4. Tên team giữa DB (ts_teams.name) và API có thể khác cách viết (VD
 *      "Newcastle United" vs "Newcastle") — CHỈ log tham khảo, KHÔNG tính
 *      là lỗi vì đây không phải bug id.
 *
 * QUY TRÌNH TEST 2 — verify MÀU ÁO hiển thị trên UI đúng RULE ƯU TIÊN:
 *   Có 2 nguồn màu áo cho 1 trận đấu:
 *     (a) opta_match_lineup.kit.colour1 — màu THẬT mà Opta báo cáo team đó
 *         mặc trong CHÍNH trận này (type: "home"/"away"/"third").
 *     (b) team_shirt.team_shirt_color — màu THIẾT KẾ cố định của team đó do
 *         design team cung cấp, kèm team_shirt_link (ảnh CDN) nếu đã upload.
 *   RULE ƯU TIÊN (theo yêu cầu nghiệp vụ): nếu team_shirt CÓ team_shirt_link
 *   (đã map CDN) cho đúng loại áo (home/away) mà Opta báo -> UI phải ưu tiên
 *   hiển thị theo CDN (team_shirt_color), BỎ QUA màu opta dù có khác. Chỉ khi
 *   KHÔNG có CDN link cho loại áo đó thì mới fallback dùng màu opta.
 *
 *   opta_match_lineup dùng ID CỦA OPTA (match_id, contestant_id), KHÁC hệ id
 *   thesports đang dùng trong sport_events/team_shirt — phải map qua 2 bảng:
 *     - mp_team  (thesport_id <-> opta_id)  — map team
 *     - mp_match (thesport_id <-> opta_id)  — map trận đấu
 *
 *   Với mỗi team_id trong team_shirt:
 *   1. Lấy opta_id của team qua mp_team. Không có -> 'no_opta_mapping'.
 *   2. Lấy tối đa 5 trận gần nhất (sport_events) của team này. Với mỗi trận:
 *      a. Map sport_event_id -> opta match_id qua mp_match (bỏ qua trận nếu
 *         không có mapping, thử trận tiếp theo).
 *      b. Query opta_match_lineup.kit WHERE match_id + contestant_id đúng
 *         cặp trên. Bỏ qua nếu không có kit, hoặc kit.type = "third" (ngoài
 *         phạm vi test này — team_shirt chỉ quản lý home/away).
 *      c. Tìm dòng team_shirt của team_id với side = kit.type (nếu trùng
 *         link nhiều dòng, ưu tiên dòng color không null).
 *      d. Tính "màu mong đợi" theo rule ưu tiên: có team_shirt_link cho side
 *         đó -> mong đợi = team_shirt_color; không có link -> mong đợi =
 *         opta kit.colour1.
 *      e. Gọi /event/{encoded}/lineups lấy teamShirtColor mà API THỰC SỰ trả
 *         về cho ĐÚNG PHÍA CỦA TRẬN ĐÓ (home/away theo sport_events — khác
 *         khái niệm với kit.type, xem lưu ý dưới), so với màu mong đợi ở (d).
 *      f. Tìm được đủ dữ liệu (kit + màu API) -> dừng, không cần thử thêm trận.
 *   3. Nếu thử hết 5 trận vẫn không đủ dữ liệu -> phân loại theo nguyên nhân
 *      cụ thể (không có opta mapping / không có kit home|away / không lấy
 *      được màu API) để không lẫn với case "sai màu" thật sự.
 *
 *   LƯU Ý PHÂN BIỆT 2 KHÁI NIỆM "SIDE": kit.type (home/away/third) là LOẠI ÁO
 *   team mặc trong trận đó; còn home/away CỦA TRẬN (sport_events.home_team_id)
 *   là team đang đá sân nhà hay sân khách — 1 team đá sân khách vẫn có thể
 *   mặc áo "home" nếu không đụng màu với đối thủ. API /lineups trả dữ liệu
 *   theo home/away CỦA TRẬN (data.home / data.away), nên khi lấy teamShirtColor
 *   thực tế phải dùng đúng field này, còn khi tra cứu màu "mong đợi" trong
 *   team_shirt/opta lại phải dùng kit.type — không được lẫn lộn 2 khái niệm.
 *
 * LƯU Ý: bảng ts_matches hiện RỖNG (0 dòng) — trận đấu bóng đá nằm ở bảng
 * sport_events (multi-sport, lọc theo home_team_id/away_team_id), không
 * phải ts_matches.
 *
 * CHẠY (phải escape [ ] vì Playwright coi argument là regex):
 *   npx playwright test "tests/check_US\[1311\]_staging.spec.ts" --project=chrome
 */

import { test, expect } from '@playwright/test';
import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as https from 'https';
import { execFileSync } from 'child_process';

const RESULTS_DIR = path.join(__dirname, '..', 'results');

function saveJson(filename: string, data: unknown): void {
  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.writeFileSync(path.join(RESULTS_DIR, filename), JSON.stringify(data, null, 2), 'utf-8');
  console.log(`Đã lưu: results/${filename}`);
}

// ─── CẤU HÌNH ──────────────────────────────────────────────────────────────

const DB_CONFIG = {
  host:                    process.env.DB_PROD_HOST || '',
  port:                    5432,
  user:                    'readonly',
  password:                process.env.DB_PROD_PASSWORD || '',
  database:                'api_ts',
  connectionTimeoutMillis: 30_000,
};

const ENCODE_BASE = 'https://opta-api.uniscore.vn/api/v1';
const EVENT_BASE  = 'https://opta-api.uniscore.vn/api/v2';

// Số trận gần nhất thử tối đa cho mỗi team ở TEST 2 — 1 team có thể mặc áo
// home hoặc away tuỳ trận (không nhất thiết theo home/away CỦA TRẬN), nên
// phải thử vài trận mới chắc chắn "vớ" được cả 2 loại áo nếu cần.
const MAX_MATCHES_PER_TEAM = 5;

// ─── KIỂU DỮ LIỆU ──────────────────────────────────────────────────────────

type VerifyStatus =
  | 'verified'            // encode(team_id) khớp id API trả về cho đúng phía home/away
  | 'id_mismatch'         // không khớp -> team_id trong DB có thể bị gán sai team
  | 'no_match_found'      // không tìm được trận nào trong sport_events chứa team_id này
  | 'encode_match_failed' // gọi /encode cho sport_event_id thất bại
  | 'event_api_failed';   // gọi /event/{id} thất bại hoặc response thiếu data.event

interface VerifyResult {
  team_id:        string;
  name:           string | null;
  status:         VerifyStatus;
  side?:          'home' | 'away';
  sport_event_id?: string;
  encodedMatchId?: string | null;
  encodedRawId?:   string | null;
  apiTeamId?:      string;
  apiTeamName?:    string;
  nameMatch?:      boolean;
}

type ShirtColorCheckStatus =
  | 'ok'                 // màu API trả về khớp màu mong đợi theo rule ưu tiên (CDN > opta)
  | 'color_mismatch'     // màu API trả về KHÔNG khớp màu mong đợi -> rule ưu tiên bị vi phạm
  | 'no_opta_mapping'    // team_id không có mapping opta_id (mp_team)
  | 'no_opta_kit'        // thử hết các trận vẫn không có kit home/away nào từ opta_match_lineup
  | 'no_api_data'        // có kit hợp lệ nhưng không lấy được teamShirtColor thật từ /lineups
  | 'no_match_found';    // team_id không xuất hiện trong sport_events

interface DbShirtRow {
  side:  'home' | 'away' | null; // suy từ suffix URL, null nếu không parse được
  color: string | null;
  numberStyle: number | null;
  link:  string | null;
}

interface ShirtColorCheckResult {
  team_id:  string;
  name:     string | null;
  status:   ShirtColorCheckStatus;
  triedMatches: number;
  sport_event_id?: string;
  kitSide?:        'home' | 'away';  // loại áo (kit.type từ opta) đang xét cho trận này
  fixtureSide?:    'home' | 'away';  // team đá sân nhà/khách CỦA TRẬN này (khác kitSide — xem doc đầu file)
  optaColor?:      string;           // opta_match_lineup.kit.colour1
  hasCdnLink?:     boolean;          // team_shirt có team_shirt_link cho kitSide này không
  dbColor?:        string | null;    // team_shirt_color của dòng DB tương ứng kitSide
  expectedColor?:  string | null;    // màu mong đợi theo rule ưu tiên (CDN color nếu có link, else opta color)
  apiColor?:       string;           // teamShirtColor API /lineups thực sự trả về (theo fixtureSide)
  apiLink?:        string;
  colorMatch?:     boolean;
}

// ─── HELPER: GỌI API (encode / event detail) ───────────────────────────────

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

/** Encode 1 raw id (match id hoặc team id) sang dạng encoded dùng trong API public */
async function encodeId(rawId: string): Promise<string | null> {
  return httpGetText(`${ENCODE_BASE}/encode/${rawId}`);
}

/** "https://.../team-shirt/{id}/home.webp" -> 'home'. null nếu không parse được đuôi. */
function sideFromLink(link: string | null | undefined): 'home' | 'away' | null {
  const m = link?.match(/\/(home|away)\.webp$/i);
  return m ? (m[1].toLowerCase() as 'home' | 'away') : null;
}

/**
 * Giải nén mọi file .zip nằm trực tiếp trong DESIGN_DIR ra DESIGN_CACHE_DIR
 * (mỗi giải đấu 1 file zip, xem chat — Bundesliga.zip, WC 2026.zip, ...).
 * Ảnh design nằm BÊN TRONG các zip này, không phải file rời trong DESIGN_DIR.
 * Luôn giải nén lại (-o) để tránh dùng cache cũ nếu design team cập nhật file.
 */
function extractDesignZips(): void {
  if (!fs.existsSync(DESIGN_CACHE_DIR)) fs.mkdirSync(DESIGN_CACHE_DIR, { recursive: true });
  const zips = fs.readdirSync(DESIGN_DIR).filter(f => f.toLowerCase().endsWith('.zip'));
  for (const zip of zips) {
    try {
      execFileSync('unzip', ['-q', '-o', path.join(DESIGN_DIR, zip), '-d', DESIGN_CACHE_DIR, '-x', '__MACOSX/*']);
    } catch {
      // 1 zip lỗi (hỏng/không phải zip thật) không nên chặn cả test — bỏ qua, phần
      // design-check của các team thuộc zip đó sẽ tự nhiên báo designFileFound=false
    }
  }
}

/** Quét đệ quy 1 thư mục, gộp vào map "team_id:side" -> đường dẫn file */
function walkDesignDir(dir: string, map: Map<string, string>): void {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { walkDesignDir(full, map); continue; }
    const m = entry.name.match(/^([a-z0-9]{10,20})_.+_(Home|Away)(?:-\d+)?\.(png|webp|jpg|jpeg)$/i);
    if (!m) continue;
    const key = `${m[1]}:${m[2].toLowerCase()}`;
    if (!map.has(key)) map.set(key, full); // giữ file đầu tiên gặp nếu trùng
  }
}

/** DESIGN_DIR chứa file .zip theo giải đấu -> giải nén ra cache rồi quét, trả về Map<"team_id:side", đường dẫn file> */
function loadDesignMap(): Map<string, string> {
  const map = new Map<string, string>();
  if (!fs.existsSync(DESIGN_DIR)) return map;

  extractDesignZips();
  walkDesignDir(DESIGN_CACHE_DIR, map); // ảnh trong các zip đã giải nén
  walkDesignDir(DESIGN_DIR, map);       // phòng trường hợp có file rời chưa nén, không ghi đè key đã có

  return map;
}

// ─── TEST SUITE ─────────────────────────────────────────────────────────────

test.describe('team_shirt.team_id — verify qua API thật (encode + event detail)', () => {

  test.setTimeout(0); // không giới hạn — số team_id không lớn nhưng mỗi team cần 2-3 lượt gọi API

  let db: Client;

  test.beforeAll(async () => {
    db = new Client(DB_CONFIG);
    await db.connect();
  });

  test.afterAll(async () => {
    await db.end();
  });

  test('Mỗi team_id trong team_shirt phải encode ra đúng homeTeam.id/awayTeam.id của ít nhất 1 trận thật', async () => {
    const teamsRes = await db.query<{ team_id: string; name: string | null }>(`
      SELECT DISTINCT ts.team_id, t.name
      FROM   team_shirt ts
      LEFT   JOIN ts_teams t ON t.id = ts.team_id
      ORDER  BY ts.team_id
    `);
    console.log(`\nTổng team_id duy nhất trong team_shirt: ${teamsRes.rows.length}`);

    const results: VerifyResult[] = [];

    for (const { team_id, name } of teamsRes.rows) {
      // B1: tìm 1 trận gần nhất có team_id này là home hoặc away (bảng sport_events, KHÔNG phải ts_matches — bảng đó rỗng)
      const matchRes = await db.query<{ sport_event_id: string; home_team_id: string; away_team_id: string }>(`
        SELECT id AS sport_event_id, home_team_id, away_team_id
        FROM   sport_events
        WHERE  home_team_id = $1 OR away_team_id = $1
        ORDER  BY start_timestamp DESC
        LIMIT  1
      `, [team_id]);

      if (matchRes.rows.length === 0) {
        results.push({ team_id, name, status: 'no_match_found' });
        continue;
      }

      const match = matchRes.rows[0];
      const side: 'home' | 'away' = match.home_team_id === team_id ? 'home' : 'away';

      // B2: encode sport_event_id -> gọi /event để lấy homeTeam.id/awayTeam.id (dạng encoded)
      const encodedMatchId = await encodeId(match.sport_event_id);
      if (!encodedMatchId) {
        results.push({ team_id, name, status: 'encode_match_failed', sport_event_id: match.sport_event_id });
        continue;
      }

      const eventRes = await httpGetJson(`${EVENT_BASE}/football/event/${encodedMatchId}`);
      const event = eventRes.ok ? eventRes.json?.data?.event : null;
      if (!event) {
        results.push({ team_id, name, status: 'event_api_failed', sport_event_id: match.sport_event_id, encodedMatchId });
        continue;
      }

      const apiTeam = side === 'home' ? event.homeTeam : event.awayTeam;

      // B3: encode chính team_id đang verify -> so với id API trả về đúng phía home/away
      const encodedRawId = await encodeId(team_id);
      const idMatch   = encodedRawId === apiTeam?.id;
      const nameMatch = !!(name && apiTeam?.name && name.toLowerCase() === apiTeam.name.toLowerCase());

      results.push({
        team_id, name,
        status: idMatch ? 'verified' : 'id_mismatch',
        side,
        sport_event_id: match.sport_event_id,
        encodedMatchId,
        encodedRawId,
        apiTeamId:   apiTeam?.id,
        apiTeamName: apiTeam?.name,
        nameMatch,
      });
    }

    const summary = {
      total:               results.length,
      verified:            results.filter(r => r.status === 'verified').length,
      id_mismatch:         results.filter(r => r.status === 'id_mismatch').length,
      no_match_found:      results.filter(r => r.status === 'no_match_found').length,
      encode_match_failed: results.filter(r => r.status === 'encode_match_failed').length,
      event_api_failed:    results.filter(r => r.status === 'event_api_failed').length,
      name_mismatch_only:  results.filter(r => r.status === 'verified' && !r.nameMatch).length, // khác cách viết tên, KHÔNG phải bug id
    };

    console.log(`\n${'═'.repeat(70)}`);
    console.log('KẾT QUẢ VERIFY team_id QUA API THẬT');
    console.log(`${'═'.repeat(70)}`);
    console.log(summary);

    const idMismatches = results.filter(r => r.status === 'id_mismatch');
    idMismatches.forEach(m => {
      console.log(`\n[ID_MISMATCH] team_id=${m.team_id} (${m.name}) side=${m.side}`);
      console.log(`  encode(team_id) = ${m.encodedRawId}  vs  api ${m.side}Team.id = ${m.apiTeamId} (${m.apiTeamName})`);
    });

    saveJson('team-id-api-verify.json', { summary, results });

    expect.soft(
      idMismatches.length,
      `${idMismatches.length}/${results.length} team_id KHÔNG khớp id trả về từ API thật — có thể bị gán nhầm team trong bảng team_shirt`
    ).toBe(0);
  });
});

test.describe('team_shirt — màu áo hiển thị UI phải đúng RULE ƯU TIÊN (CDN team_shirt > opta kit color)', () => {

  test.setTimeout(0);

  let db: Client;

  test.beforeAll(async () => {
    db = new Client(DB_CONFIG);
    await db.connect();
  });

  test.afterAll(async () => {
    await db.end();
  });

  test('teamShirtColor API trả về phải khớp: team_shirt_color nếu có CDN link, ngược lại fallback opta_match_lineup.kit.colour1', async () => {
    const teamsRes = await db.query<{ team_id: string; name: string | null }>(`
      SELECT DISTINCT ts.team_id, t.name
      FROM   team_shirt ts
      LEFT   JOIN ts_teams t ON t.id = ts.team_id
      ORDER  BY ts.team_id
    `);
    console.log(`\nTổng team_id duy nhất trong team_shirt: ${teamsRes.rows.length}`);

    const results: ShirtColorCheckResult[] = [];

    for (const { team_id, name } of teamsRes.rows) {
      const mpTeamRes = await db.query<{ opta_id: string }>(`SELECT opta_id FROM mp_team WHERE thesport_id = $1`, [team_id]);
      if (mpTeamRes.rows.length === 0) {
        results.push({ team_id, name, status: 'no_opta_mapping', triedMatches: 0 });
        continue;
      }
      const optaTeamId = mpTeamRes.rows[0].opta_id;

      const dbRowsRes = await db.query<{ team_shirt_color: string | null; team_shirt_link: string | null }>(`
        SELECT team_shirt_color, team_shirt_link FROM team_shirt WHERE team_id = $1
      `, [team_id]);
      const dbRows: DbShirtRow[] = dbRowsRes.rows.map(r => ({
        side: sideFromLink(r.team_shirt_link), color: r.team_shirt_color, numberStyle: null, link: r.team_shirt_link,
      }));

      const matchesRes = await db.query<{ sport_event_id: string; home_team_id: string; away_team_id: string }>(`
        SELECT id AS sport_event_id, home_team_id, away_team_id
        FROM   sport_events
        WHERE  home_team_id = $1 OR away_team_id = $1
        ORDER  BY start_timestamp DESC
        LIMIT  $2
      `, [team_id, MAX_MATCHES_PER_TEAM]);

      if (matchesRes.rows.length === 0) {
        results.push({ team_id, name, status: 'no_match_found', triedMatches: 0 });
        continue;
      }

      let resolved: ShirtColorCheckResult | null = null;
      let tried = 0;
      let sawHomeAwayKit = false; // để phân biệt no_opta_kit (chưa từng thấy kit home/away) vs no_api_data (có kit nhưng API không trả màu)

      for (const match of matchesRes.rows) {
        tried++;

        const mpMatchRes = await db.query<{ opta_id: string }>(`SELECT opta_id FROM mp_match WHERE thesport_id = $1`, [match.sport_event_id]);
        if (mpMatchRes.rows.length === 0) continue; // trận này không map được sang opta -> thử trận khác
        const optaMatchId = mpMatchRes.rows[0].opta_id;

        const kitRes = await db.query<{ kit: { type?: string; colour1?: string } }>(`
          SELECT kit FROM opta_match_lineup WHERE match_id = $1 AND contestant_id = $2
        `, [optaMatchId, optaTeamId]);
        const kit = kitRes.rows[0]?.kit;
        if (!kit?.colour1 || (kit.type !== 'home' && kit.type !== 'away')) continue; // không có kit, hoặc kit "third" (ngoài phạm vi test)

        sawHomeAwayKit = true;
        const kitSide = kit.type as 'home' | 'away';

        // team_shirt có thể có nhiều dòng trùng side (data cũ chưa dọn) — ưu tiên dòng có link + color đầy đủ nhất
        const sideCandidates = dbRows.filter(r => r.side === kitSide);
        const dbRow = sideCandidates.find(r => r.link !== null && r.color !== null) ?? sideCandidates.find(r => r.link !== null) ?? sideCandidates[0];

        const hasCdnLink = !!dbRow?.link;
        // RULE ƯU TIÊN: có CDN link cho đúng loại áo -> ưu tiên màu team_shirt; không có -> fallback màu opta
        const expectedColor = hasCdnLink ? dbRow!.color : kit.colour1;

        const fixtureSide: 'home' | 'away' = match.home_team_id === team_id ? 'home' : 'away';
        const encodedMatchId = await encodeId(match.sport_event_id);
        if (!encodedMatchId) continue;

        const lineupsRes = await httpGetJson(`${EVENT_BASE}/football/event/${encodedMatchId}/lineups?language=en`);
        const apiSideObj = lineupsRes.ok ? lineupsRes.json?.data?.[fixtureSide] : null;
        const apiColor = apiSideObj?.teamShirtColor;
        if (!apiColor) continue; // API chưa có màu cho trận này -> thử trận khác

        const colorMatch = (expectedColor?.toLowerCase() ?? null) === apiColor.toLowerCase();

        resolved = {
          team_id, name,
          status: colorMatch ? 'ok' : 'color_mismatch',
          triedMatches: tried,
          sport_event_id: match.sport_event_id,
          kitSide, fixtureSide,
          optaColor: kit.colour1,
          hasCdnLink,
          dbColor: dbRow?.color ?? null,
          expectedColor: expectedColor ?? null,
          apiColor,
          apiLink: apiSideObj?.teamShirtLink,
          colorMatch,
        };
        break; // đủ dữ liệu để verify -> dừng, không cần thử thêm trận
      }

      if (resolved) {
        results.push(resolved);
      } else {
        results.push({ team_id, name, status: sawHomeAwayKit ? 'no_api_data' : 'no_opta_kit', triedMatches: tried });
      }
    }

    const summary = {
      total:            results.length,
      ok:               results.filter(r => r.status === 'ok').length,
      color_mismatch:   results.filter(r => r.status === 'color_mismatch').length,
      no_opta_mapping:  results.filter(r => r.status === 'no_opta_mapping').length,
      no_opta_kit:      results.filter(r => r.status === 'no_opta_kit').length,
      no_api_data:      results.filter(r => r.status === 'no_api_data').length,
      no_match_found:   results.filter(r => r.status === 'no_match_found').length,
      // trong số "ok", bao nhiêu case thực sự đang dùng fallback (không có CDN) — để biết rule ưu tiên có được exercise hay chỉ toàn case có CDN
      ok_via_cdn:      results.filter(r => r.status === 'ok' && r.hasCdnLink === true).length,
      ok_via_opta_fallback: results.filter(r => r.status === 'ok' && r.hasCdnLink === false).length,
    };

    console.log(`\n${'═'.repeat(70)}`);
    console.log('KẾT QUẢ CHECK MÀU ÁO — RULE ƯU TIÊN (CDN team_shirt > opta kit color)');
    console.log(`${'═'.repeat(70)}`);
    console.log(summary);

    const mismatches = results.filter(r => r.status === 'color_mismatch');
    mismatches.forEach(m => {
      console.log(`\n[COLOR_MISMATCH] team_id=${m.team_id} (${m.name}) match=${m.sport_event_id} kitSide=${m.kitSide} fixtureSide=${m.fixtureSide}`);
      console.log(`  hasCdnLink=${m.hasCdnLink}  dbColor=${m.dbColor}  optaColor=${m.optaColor}  expected=${m.expectedColor}`);
      console.log(`  apiColor (thực tế UI hiển thị)=${m.apiColor}  -> KHÔNG khớp expected, rule ưu tiên bị vi phạm`);
    });

    saveJson('team-shirt-color-priority-check.json', { summary, results });

    expect.soft(
      mismatches.length,
      `${mismatches.length}/${results.length} team_id có màu áo API trả về SAI so với rule ưu tiên (CDN team_shirt_color phải thắng opta kit color khi có link)`
    ).toBe(0);
  });
});
