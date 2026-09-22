/**
 * TEST FILE: lineup_order_check.spec.ts
 * check data match_lineup các player toạ độ x y
 * BUG: Players trong home_lineups/away_lineups (bảng match_lineups) có thể bị
 * sai thứ tự vì migrate data "đập thẳng" từ thesport, không sort lại. Cơ chế
 * hiển thị hiện tại dựa trên thứ tự xuất hiện trong mảng JSONB, nên nếu data
 * gốc không đúng thứ tự thì UI cũng sai theo (đây cũng là lý do staging đúng
 * nhưng prod sai — do skip-upsert khi so dữ liệu không đổi).
 *
 * Logic sort ĐÚNG (đồng bộ với tool fix_lineup_order bản 2 — formation-based,
 * KHÔNG dùng field `position` hay ngưỡng y cố định nữa):
 *   field `position` và suy luận G/D/M/F qua ngưỡng y cố định (y<=20/45/85)
 *   đã được xác nhận KHÔNG đáng tin — ví dụ Kimmich bị gắn nhãn "M" trong khi
 *   đứng ở hàng thủ (y=32); một trận 4-1-4-1 có 2 tiền vệ ngang hàng nhưng bị
 *   gắn nhãn D và F khác nhau.
 *
 *   Cách tính thứ tự đúng, chỉ dựa vào first=1, formation, và (x, y):
 *     1. Thủ môn = cầu thủ đá chính có y NHỎ NHẤT (không dựa nhãn position).
 *     2. Các cầu thủ đá chính còn lại (outfield) sort theo y tăng dần.
 *     3. Dùng chuỗi formation của chính trận đó (VD "4-2-3-1", từ hàng thủ ->
 *        tấn công) để biết chính xác số cầu thủ mỗi hàng, cắt outfield theo
 *        đúng số đó thành từng hàng.
 *     4. Trong mỗi hàng, sort theo x tăng dần.
 *     5. Fallback: nếu formation rỗng/không parse được, hoặc tổng số ở các
 *        hàng không khớp số cầu thủ outfield thực tế (thẻ đỏ, lỗi data...)
 *        thì sort toàn bộ outfield theo (y, x) không chia hàng.
 *   Dự bị (first != 1) giữ nguyên thứ tự gốc, xếp sau cùng (không so sánh).
 *
 * Test này KHÔNG sort lại rồi ghi đè — chỉ đối chiếu thứ tự thực tế trong DB
 * (những gì sẽ hiển thị) với thứ tự đúng tính toán được, để đo mức độ sai
 * hiện tại trên data thật.
 *
 * CHẠY:
 *   npx playwright test tests/lineup_order_check.spec.ts --project=chrome
 */

import { test, expect } from '@playwright/test';
import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

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

const BATCH_SIZE      = 5000;  // số trận / lần query (keyset pagination theo sport_event_id)
const MAX_SAVED_DETAIL = 5000; // giới hạn số mismatch chi tiết lưu vào JSON (tránh file quá lớn)

// ─── KIỂU DỮ LIỆU ──────────────────────────────────────────────────────────

interface LineupPlayer {
  x: number;
  y: number;
  id: string;
  name: string;
  first: number;
  position: string;
  [key: string]: unknown;
}

interface LineupRow {
  sport_event_id: string;
  home_lineups:   LineupPlayer[] | null;
  away_lineups:   LineupPlayer[] | null;
  home_formation: string | null;
  away_formation: string | null;
}

interface Mismatch {
  matchId:     string;
  team:        'home' | 'away';
  expectedIds: string[];
  actualIds:   string[];
}

// ─── LOGIC SORT (đối chiếu backend — formation-based, xem doc đầu file) ─────

/**
 * Parse chuỗi formation (VD "4-2-3-1") thành mảng số cầu thủ mỗi hàng,
 * theo thứ tự từ hàng thủ -> hàng tấn công: "4-2-3-1" -> [4, 2, 3, 1].
 * Số này CHƯA tính thủ môn (thủ môn luôn tách riêng, xử lý ở expectedOrder).
 * Trả về null nếu formation rỗng hoặc có phần tử không phải số dương
 * (data lỗi/không parse được) — expectedOrder sẽ tự fallback khi gặp null.
 */
function parseFormationRows(formation: string | null | undefined): number[] | null {
  const f = formation?.trim();
  if (!f) return null;
  const parts = f.split('-');
  const rows: number[] = [];
  for (const p of parts) {
    const n = Number(p.trim());
    if (!Number.isFinite(n) || n <= 0) return null;
    rows.push(n);
  }
  return rows;
}

/**
 * Tính thứ tự ĐÚNG mong đợi cho 1 đội (home hoặc away) của 1 trận.
 * Đây là hàm cốt lõi — logic y hệt tool fix_lineup_order bản 2 (formation-based),
 * KHÔNG dùng field `position` (đã xác nhận không đáng tin qua case Kimmich, 4-1-4-1).
 *
 * Các bước:
 *   B1. Lọc cầu thủ đá chính (first === 1). Dự bị (first !== 1) không tham gia
 *       so sánh thứ tự — bị bỏ qua hoàn toàn ở đây (test chỉ verify starters).
 *   B2. Xác định THỦ MÔN = cầu thủ đá chính có toạ độ y NHỎ NHẤT trong cả đội.
 *       Sân bóng đá luôn vẽ với thủ môn đứng sâu nhất (y nhỏ nhất) nên đây là
 *       tín hiệu đáng tin hơn nhiều so với field `position` hay đoán qua ngưỡng y.
 *   B3. Các cầu thủ còn lại (outfield = starters trừ thủ môn) được sort tăng
 *       dần theo y — tức từ hàng gần khung thành nhất (hậu vệ) đến hàng xa nhất
 *       (tiền đạo), CHƯA quan tâm x ở bước này.
 *   B4. Parse chuỗi formation của trận (VD "4-2-3-1" -> [4,2,3,1]). Nếu parse
 *       được VÀ tổng các số này khớp đúng số cầu thủ outfield thực tế thì cắt
 *       mảng đã sort-theo-y ở B3 thành từng "hàng" theo đúng số lượng đó
 *       (hàng 1 = 4 hậu vệ gần khung thành nhất, hàng 2 = 2 tiền vệ phòng ngự,
 *       ...), rồi trong TỪNG HÀNG sort riêng theo x tăng dần (trái sang phải).
 *       Sort theo hàng trước rồi mới theo x là điểm khác biệt quan trọng: 2 cầu
 *       thủ có y gần bằng nhau nhưng thuộc 2 hàng khác nhau (VD 1 tiền vệ phòng
 *       ngự sâu và 1 tiền vệ tấn công) sẽ không bị trộn x lẫn lộn giữa 2 hàng.
 *   B5. FALLBACK: nếu formation rỗng/không parse được, hoặc tổng số ở các hàng
 *       KHÔNG khớp số cầu thủ outfield thực tế (vd bị thẻ đỏ nên đá thiếu người,
 *       hoặc data formation bị lỗi/không đồng bộ với số cầu thủ first=1 thực
 *       tế) — bỏ qua việc chia hàng, sort thẳng toàn bộ outfield theo (y tăng
 *       dần, tie-break x tăng dần).
 *   B6. Kết quả cuối = [thủ môn, ...outfield đã sort ở B4 hoặc B5].
 */
function expectedOrder(players: LineupPlayer[], formation: string | null | undefined): LineupPlayer[] {
  const starters = players.filter(p => p.first === 1); // B1: chỉ xét đá chính

  if (starters.length === 0) return [];

  // B2: thủ môn = y nhỏ nhất trong nhóm đá chính (không dựa field `position`)
  let gk = starters[0];
  for (const p of starters) {
    if (p.y < gk.y) gk = p;
  }

  // B3: outfield = starters trừ thủ môn, sort theo y tăng dần (hàng gần -> xa khung thành)
  const outfield = starters.filter(p => p !== gk);
  const byY = [...outfield].sort((a, b) => a.y - b.y);

  const rows    = parseFormationRows(formation);
  const rowSum  = rows ? rows.reduce((a, b) => a + b, 0) : -1;

  let ordered: LineupPlayer[];
  if (rows && rowSum === outfield.length) {
    // B4: formation hợp lệ và khớp số người -> cắt theo từng hàng, sort x trong mỗi hàng
    ordered = [];
    let pos = 0;
    for (const rowSize of rows) {
      const row = byY.slice(pos, pos + rowSize).sort((a, b) => a.x - b.x);
      ordered.push(...row);
      pos += rowSize;
    }
  } else {
    // B5: fallback — formation thiếu/không khớp số người -> sort (y, x) không chia hàng
    ordered = [...outfield].sort((a, b) => (a.y !== b.y ? a.y - b.y : a.x - b.x));
  }

  return [gk, ...ordered]; // B6
}

/**
 * Thứ tự THỰC TẾ đang lưu trong DB (chính là thứ tự sẽ hiển thị lên UI) —
 * chỉ lọc cầu thủ đá chính (first === 1), GIỮ NGUYÊN thứ tự xuất hiện trong
 * mảng JSONB gốc, không sort lại gì cả. Dùng để so sánh 1-1 với expectedOrder().
 */
function actualStarterOrder(players: LineupPlayer[]): LineupPlayer[] {
  return players.filter(p => p.first === 1);
}

// ─── TEST SUITE ─────────────────────────────────────────────────────────────

test.describe('Match Lineups — thứ tự first=1 phải đúng theo formation + (x, y)', () => {

  test.setTimeout(0); // không giới hạn — quét toàn bộ DB

  let db: Client;

  test.beforeAll(async () => {
    db = new Client(DB_CONFIG);
    await db.connect();
  });

  test.afterAll(async () => {
    await db.end();
  });

  test('Đối chiếu thứ tự thực tế vs thứ tự đúng — TOÀN BỘ trận trong DB', async () => {
    const countRes = await db.query<{ total: string }>(`
      SELECT COUNT(*) AS total
      FROM   match_lineups
      WHERE  (home_lineups IS NOT NULL AND jsonb_array_length(home_lineups) > 0)
          OR (away_lineups IS NOT NULL AND jsonb_array_length(away_lineups) > 0)
    `);
    const totalRows = Number(countRes.rows[0].total);
    console.log(`\nTổng số trận có lineup data trong DB: ${totalRows}`);

    const mismatches: Mismatch[] = [];
    let checkedTeams   = 0;
    let skippedNoData  = 0;
    let rowsProcessed  = 0;
    let lastId         = '';

    for (;;) {
      const res = await db.query<LineupRow>(`
        SELECT sport_event_id, home_lineups, away_lineups, home_formation, away_formation
        FROM   match_lineups
        WHERE  sport_event_id > $1
          AND  ((home_lineups IS NOT NULL AND jsonb_array_length(home_lineups) > 0)
             OR (away_lineups IS NOT NULL AND jsonb_array_length(away_lineups) > 0))
        ORDER  BY sport_event_id
        LIMIT  $2
      `, [lastId, BATCH_SIZE]);

      if (res.rows.length === 0) break;

      for (const row of res.rows) {
        const sides: Array<['home' | 'away', LineupPlayer[] | null, string | null]> = [
          ['home', row.home_lineups, row.home_formation],
          ['away', row.away_lineups, row.away_formation],
        ];

        for (const [team, lineups, formation] of sides) {
          if (!lineups || lineups.length === 0) continue; // đội này không có data lineup -> bỏ qua

          const actual = actualStarterOrder(lineups); // thứ tự thực tế trong DB (first=1, giữ nguyên thứ tự)
          if (actual.length === 0) {
            skippedNoData++; // không có cầu thủ đá chính nào (toàn dự bị/data rỗng) — không có gì để so sánh
            continue;
          }

          checkedTeams++;

          const expected    = expectedOrder(lineups, formation); // thứ tự ĐÚNG, tính lại từ formation + (x,y)
          const actualIds   = actual.map(p => p.id);
          const expectedIds = expected.map(p => p.id);

          // So khớp toàn bộ mảng id theo đúng vị trí (không phải so tập hợp) —
          // chỉ cần lệch thứ tự 1 cặp id (dù cùng 1 tập cầu thủ) đã tính là mismatch,
          // vì đây là bug về THỨ TỰ hiển thị, không phải bug thiếu/thừa cầu thủ.
          if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) {
            mismatches.push({ matchId: row.sport_event_id, team, expectedIds, actualIds });
          }
        }
      }

      rowsProcessed += res.rows.length;
      lastId = res.rows[res.rows.length - 1].sport_event_id;
      console.log(`  → ${rowsProcessed}/${totalRows} trận | checked=${checkedTeams} | mismatch=${mismatches.length} | skip=${skippedNoData}`);
    }

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`Tổng trận đã quét      : ${rowsProcessed}`);
    console.log(`Lineup đã check        : ${checkedTeams}`);
    console.log(`Skip (ko có cầu thủ đá chính): ${skippedNoData}`);
    console.log(`Sai thứ tự              : ${mismatches.length}`);
    console.log(`${'═'.repeat(60)}`);

    mismatches.slice(0, 30).forEach(m => {
      console.log(`\n[${m.team}] match=${m.matchId}`);
      console.log(`  expected: ${m.expectedIds.join(', ')}`);
      console.log(`  actual  : ${m.actualIds.join(', ')}`);
    });

    if (mismatches.length > 0) {
      const savedDetail = mismatches.slice(0, MAX_SAVED_DETAIL);
      saveJson('lineup-order-mismatches.json', {
        runAt: new Date().toISOString(),
        totalRowsProcessed: rowsProcessed,
        checkedTeams,
        skippedNoData,
        mismatchCount: mismatches.length,
        savedDetailCount: savedDetail.length,
        droppedDetailCount: mismatches.length - savedDetail.length,
        mismatches: savedDetail,
      });
      if (mismatches.length > MAX_SAVED_DETAIL) {
        console.log(`\n⚠ Chỉ lưu chi tiết ${MAX_SAVED_DETAIL}/${mismatches.length} mismatch đầu tiên vào JSON (tránh file quá lớn) — tổng số thật là ${mismatches.length}.`);
      }
    }

    if (mismatches.length > 30) {
      console.log(`\n... còn ${mismatches.length - 30} mismatch khác (xem results/lineup-order-mismatches.json)`);
    }

    expect.soft(
      mismatches.length,
      `${mismatches.length}/${checkedTeams} lineup có thứ tự first=1 SAI so với logic GK(y min) -> outfield chia hàng theo formation (y,x asc)`
    ).toBe(0);
  });
});
