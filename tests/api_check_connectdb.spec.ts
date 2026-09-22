/**
 * TEST FILE: api_check_connectdb.spec.ts
 *
 * MỤC ĐÍCH:
 *   Kiểm tra TOÀN BỘ data trong DB với filter:
 *     - opta_match_info: coverage_level IN ('13','15'), period_id = 14
 *     - JOIN mp_match để lấy thesport_id
 *   Sau đó gọi API validate logic bù giờ hiệp 2.
 *
 * SỐ LƯỢNG: ~11,183 trận — xử lý song song 10 trận/lượt
 *
 * LUỒNG:
 *   DB: opta_match_info JOIN mp_match
 *     → GET /encode/{thesport_id}            → encoded ID
 *     → GET /football/event/{id}/incidents   → danh sách sự kiện
 *     → Filter period=2 → check thứ tự bù giờ
 *
 * OUTPUT:
 *   results/incidents-check-YYYY-MM-DD.json  — toàn bộ kết quả chi tiết
 *   results/incidents-check-bugs.json        — chỉ các trận bị lỗi
 *
 * CHẠY:
 *   npx playwright test tests/api_check_connectdb.spec.ts --project=chrome
 */

import { test, expect, type APIRequestContext } from '@playwright/test';
import { Client }                               from 'pg';
import * as fs                                  from 'fs';
import * as path                                from 'path';

// ─── CẤU HÌNH ──────────────────────────────────────────────────────────────

const DB_CONFIG = {
  host:                    process.env.DB_PROD_HOST || '',
  port:                    5432,
  user:                    'readonly',
  password:                process.env.DB_PROD_PASSWORD || '',
  database:                'api_ts',
  connectionTimeoutMillis: 30000,
};

const API_BASE   = 'https://opta-api.uniscore.vn/api/v1';
const RESULTS_DIR = path.join(__dirname, '..', 'results');

/**
 * Số trận xử lý song song cùng lúc.
 * Tăng → nhanh hơn nhưng dễ bị rate-limit.
 * Giảm → chậm hơn nhưng ổn định hơn.
 */
const BATCH_SIZE = 10;

// ─── KIỂU DỮ LIỆU ──────────────────────────────────────────────────────────

interface Incident {
  incidentType: string;
  period:       number;
  time:         number;
  timeSec:      number;
  addedTime?:   number;
  length?:      number;
}

interface MatchRow {
  opta_id:        string;
  thesport_id:    string;
  coverage_level: string;
}

type CheckStatus =
  | 'ok'             // thứ tự bù giờ đúng
  | 'bug'            // addedTime event xảy ra TRƯỚC injuryTime → sai
  | 'no_injury_time' // không có thông báo bù giờ → skip
  | 'no_added_time'  // có thông báo nhưng không có sự kiện bù giờ → skip
  | 'no_p2'          // không có incident hiệp 2 → bất thường
  | 'api_error';     // lỗi API (encode hoặc incidents)

interface CheckResult {
  opta_id:        string;
  thesport_id:    string;
  coverage_level: string;
  encodedId:      string | null;
  status:         CheckStatus;
  injuryTimeSec:  number | null;  // timeSec của injuryTime announcement
  bugs:           string[];       // chi tiết các sự kiện sai thứ tự
}

// ─── HELPER ────────────────────────────────────────────────────────────────

/** Gọi /encode/{thesportId} → trả encoded ID hoặc null nếu lỗi */
async function encodeId(request: APIRequestContext, thesportId: string): Promise<string | null> {
  try {
    const res = await request.get(`${API_BASE}/encode/${thesportId}`);
    if (!res.ok()) return null;
    return (await res.text()).trim();
  } catch {
    return null;
  }
}

/** Gọi /football/event/{encodedId}/incidents → trả mảng incidents hoặc [] nếu lỗi */
async function getIncidents(request: APIRequestContext, encodedId: string): Promise<Incident[]> {
  try {
    const res = await request.get(`${API_BASE}/football/event/${encodedId}/incidents`);
    if (!res.ok()) return [];
    const json = await res.json();
    return json?.data?.incidents ?? [];
  } catch {
    return [];
  }
}

/**
 * Periods cần kiểm tra:
 *   2 = hiệp 2 (45–90')
 *   3 = hiệp phụ 1 (90–105')
 *   4 = hiệp phụ 2 (105–120')
 */
const PERIODS_TO_CHECK = [1, 2, 3, 4];
const PERIOD_LABEL: Record<number, string> = { 1: 'hiệp 1', 2: 'hiệp 2', 3: 'hiệp phụ 1', 4: 'hiệp phụ 2' };

/**
 * Kiểm tra logic bù giờ cho tất cả các hiệp có bù giờ (2, 3, 4).
 * incidents API trả newest→oldest (timeSec giảm dần).
 * Với mỗi hiệp: injuryTime.timeSec phải THẤP HƠN các addedTime events.
 * Nếu addedTime event.timeSec < injuryTime.timeSec → BUG.
 */
async function checkMatch(
  request:  APIRequestContext,
  match:    MatchRow,
): Promise<CheckResult> {
  const base: CheckResult = {
    opta_id:        match.opta_id,
    thesport_id:    match.thesport_id,
    coverage_level: match.coverage_level,
    encodedId:      null,
    status:         'api_error',
    injuryTimeSec:  null,
    bugs:           [],
  };

  const encoded = await encodeId(request, match.thesport_id);
  if (!encoded) return base;
  base.encodedId = encoded;

  const incidents = await getIncidents(request, encoded);
  if (incidents.length === 0) return base;

  const bugs: string[] = [];
  let anyPeriodFound    = false;
  let anyInjuryFound    = false;
  let anyAddedTimeFound = false;

  for (const p of PERIODS_TO_CHECK) {
    const periodIncs = incidents.filter(i => i.period === p);
    if (periodIncs.length === 0) continue;
    anyPeriodFound = true;

    const injuryTimeEvent = periodIncs.find(i => i.incidentType === 'injuryTime');
    if (!injuryTimeEvent) continue;
    anyInjuryFound = true;
    if (!base.injuryTimeSec) base.injuryTimeSec = injuryTimeEvent.timeSec;

    const addedEvents = periodIncs.filter(i => i.addedTime && i.addedTime > 0);
    if (addedEvents.length === 0) continue;
    anyAddedTimeFound = true;

    for (const evt of addedEvents) {
      if (evt.timeSec < injuryTimeEvent.timeSec) {
        bugs.push(
          `[${PERIOD_LABEL[p]}] ${evt.incidentType} @ ${evt.time}+${evt.addedTime}' ` +
          `(timeSec=${evt.timeSec}) < injuryTime.timeSec=${injuryTimeEvent.timeSec} ` +
          `[length=${injuryTimeEvent.length}min]`
        );
      }
    }
  }

  if (!anyPeriodFound)    return { ...base, status: 'no_p2' };
  if (!anyInjuryFound)    return { ...base, status: 'no_injury_time' };
  if (!anyAddedTimeFound) return { ...base, status: 'no_added_time' };

  return { ...base, status: bugs.length > 0 ? 'bug' : 'ok', bugs };
}

/** Chia mảng thành các chunk nhỏ để xử lý song song */
function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

/** Lưu JSON ra file, tạo thư mục nếu chưa có */
function saveJson(filename: string, data: unknown): void {
  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const filepath = path.join(RESULTS_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`\n💾 Đã lưu: results/${filename}`);
}

// ─── TEST SUITE ─────────────────────────────────────────────────────────────

test.describe('FULL CHECK — opta_match_info + mp_match + incidents API (period 2)', () => {

  let db: Client;
  let allMatches: MatchRow[] = [];

  // 30 phút — đủ cho ~11,000 trận với batch song song
  test.setTimeout(1_800_000);

  test.beforeAll(async () => {
    db = new Client(DB_CONFIG);
    await db.connect();

    // Lấy TOÀN BỘ matches (không LIMIT)
    const res = await db.query<MatchRow>(`
      SELECT o.id              AS opta_id,
             m.thesport_id,
             o.coverage_level
      FROM   opta_match_info o
      JOIN   mp_match m ON m.opta_id = o.id
      WHERE  o.coverage_level IN ('13', '15')
        AND  o.period_id = 14
      ORDER  BY o.id
    `);
    allMatches = res.rows;
    console.log(`\nTổng số trận cần kiểm tra: ${allMatches.length}`);
  });

  test.afterAll(async () => {
    await db.end();
  });

  // ── TEST 1 ────────────────────────────────────────────────────────────────
  /**
   * Xác nhận số lượng record đúng với filter đã chọn.
   * coverage_level '13'/'15' = Opta coverage đầy đủ.
   * period_id=14 = trận đã kết thúc (Played/Awarded).
   */
  test('DB: xác nhận tổng số match theo filter', async () => {
    console.log(`\nFilter: coverage_level IN ('13','15') AND period_id=14`);
    console.log(`Tổng: ${allMatches.length} trận`);

    const byCoverage = allMatches.reduce((acc, m) => {
      acc[m.coverage_level] = (acc[m.coverage_level] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    console.log(`  coverage_level='13': ${byCoverage['13'] ?? 0} trận`);
    console.log(`  coverage_level='15': ${byCoverage['15'] ?? 0} trận`);

    expect(allMatches.length).toBeGreaterThan(0);
  });

  // ── TEST 2 — LOGIC CHÍNH ──────────────────────────────────────────────────
  /**
   * KIỂM TRA TOÀN BỘ: encode API + incidents API + logic bù giờ hiệp 2
   *
   * Xử lý song song BATCH_SIZE=10 trận/lượt.
   * Mỗi trận:
   *   1. GET /encode/{thesport_id}          → encoded ID
   *   2. GET /football/event/{id}/incidents → incidents
   *   3. Filter period=2, tìm injuryTime, kiểm tra addedTime events
   *
   * Kết quả lưu vào:
   *   results/incidents-check-<date>.json  — tất cả
   *   results/incidents-check-bugs.json    — chỉ bugs
   */
  test('FULL CHECK: period 2 added time logic — toàn bộ DB', async ({ request }) => {
    const results: CheckResult[] = [];
    const batches = chunk(allMatches, BATCH_SIZE);
    const total   = allMatches.length;
    let   processed = 0;

    console.log(`\nBắt đầu kiểm tra ${total} trận (${batches.length} batch × ${BATCH_SIZE} song song)...\n`);

    for (const batch of batches) {
      // Xử lý song song trong batch
      const batchResults = await Promise.all(
        batch.map(match => checkMatch(request, match))
      );
      results.push(...batchResults);
      processed += batch.length;

      // Log tiến trình mỗi 500 trận
      if (processed % 500 === 0 || processed === total) {
        const bugs = results.filter(r => r.status === 'bug').length;
        const pct  = ((processed / total) * 100).toFixed(1);
        console.log(`  [${pct}%] ${processed}/${total} trận — bugs phát hiện: ${bugs}`);
      }
    }

    // ── Tổng kết ────────────────────────────────────────────────────────────
    const ok          = results.filter(r => r.status === 'ok').length;
    const bugList     = results.filter(r => r.status === 'bug');
    const noInjury    = results.filter(r => r.status === 'no_injury_time').length;
    const noAddedTime = results.filter(r => r.status === 'no_added_time').length;
    const noP2        = results.filter(r => r.status === 'no_p2').length;
    const apiError    = results.filter(r => r.status === 'api_error').length;

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`TỔNG KẾT — KIỂM TRA BÙ GIỜ HIỆP 2 (${results.length} trận)`);
    console.log(`${'═'.repeat(60)}`);
    console.log(`  ✅ OK — thứ tự đúng                      : ${ok}`);
    console.log(`  ❌ BUG — addedTime trước injuryTime       : ${bugList.length}`);
    console.log(`  ⏭  Không có thông báo bù giờ (skip)      : ${noInjury}`);
    console.log(`  ⏭  Không có sự kiện bù giờ (skip)        : ${noAddedTime}`);
    console.log(`  ⚠  Không có incident hiệp 2              : ${noP2}`);
    console.log(`  ⚠  Lỗi API (encode/incidents)            : ${apiError}`);
    console.log(`${'═'.repeat(60)}`);

    if (bugList.length > 0) {
      console.warn(`\n⚠ ${bugList.length} trận bị lỗi thứ tự bù giờ:`);
      bugList.slice(0, 20).forEach(m => {  // In tối đa 20 bug đầu
        console.warn(`  opta_id=${m.opta_id} | encoded=${m.encodedId}`);
        m.bugs.forEach(b => console.warn(`    → ${b}`));
      });
      if (bugList.length > 20) {
        console.warn(`  ... và ${bugList.length - 20} trận khác (xem file bugs.json)`);
      }
    }

    // ── Lưu kết quả ra file ─────────────────────────────────────────────────
    const dateStr = new Date().toISOString().slice(0, 10);

    // File tổng hợp — summary + toàn bộ bugs
    saveJson(`incidents-check-${dateStr}.json`, {
      runAt:    new Date().toISOString(),
      filter:   "coverage_level IN ('13','15') AND period_id=14",
      total:    results.length,
      summary: { ok, bug: bugList.length, noInjury, noAddedTime, noP2, apiError },
      bugs:     bugList,
    });

    // File chỉ bugs — dễ đọc khi cần investigate
    if (bugList.length > 0) {
      saveJson('incidents-check-bugs.json', bugList.map(m => ({
        opta_id:       m.opta_id,
        thesport_id:   m.thesport_id,
        coverage:      m.coverage_level,
        encodedId:     m.encodedId,
        incidents_url: `${API_BASE}/football/event/${m.encodedId}/incidents`,
        bugs:          m.bugs,
      })));
    }

    // Logic bug chính — hard assertion: không được có trận nào sai thứ tự bù giờ
    expect.soft(
      bugList.length,
      `${bugList.length} trận có sự kiện addedTime xuất hiện TRƯỚC injuryTime`
    ).toBe(0);

    // noP2 = incidents API chưa load data (không phải lỗi logic) → chỉ log, không fail
    if (noP2 > 0) {
      console.warn(`\n⚠ ${noP2} trận period_id=14 không có incident hiệp 2 trong API — có thể data chưa được sync`);
    }
  });

});
// npx playwright test tests/api_check_connectdb.spec.ts --project=chrome 2>&1
