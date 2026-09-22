/**
 * TEST FILE: incidents_production.spec.ts
 *
 * MỤC ĐÍCH: Kiểm tra production incidents API cross-check với DB
 *   - DB filter: opta_match_info coverage_level IN ('13','15'), period_id=14
 *   - Encode  : GET https://opta-api.uniscore.vn/api/v1/encode/{thesport_id}
 *   - Incidents: GET https://api.unik8s.com/api/v2/football/event/{id}/incidents
 *
 * KIỂM TRA:
 *   1. Số lượng match từ DB filter
 *   2. Logic bù giờ hiệp 2 — addedTime events phải sau injuryTime announcement
 *
 * OUTPUT:
 *   results/incidents-prod-YYYY-MM-DD.json  — tổng kết + bugs chi tiết
 *   results/incidents-prod-bugs.json        — chỉ các trận bị lỗi
 *
 * CHẠY:
 *   npx playwright test tests/incidents_production.spec.ts --project=chrome
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

const ENCODE_BASE = 'https://opta-api.uniscore.vn/api/v1';
const PROD_BASE   = 'https://api.unik8s.com/api/v2';
const RESULTS_DIR = path.join(__dirname, '..', 'results');

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
  | 'ok'
  | 'bug'
  | 'no_injury_time'
  | 'no_added_time'
  | 'no_p2'
  | 'api_error';

interface CheckResult {
  opta_id:        string;
  thesport_id:    string;
  coverage_level: string;
  encodedId:      string | null;
  status:         CheckStatus;
  injuryTimeSec:  number | null;
  bugs:           string[];
}

// ─── HELPER ────────────────────────────────────────────────────────────────

async function encodeId(request: APIRequestContext, thesportId: string): Promise<string | null> {
  try {
    const res = await request.get(`${ENCODE_BASE}/encode/${thesportId}`);
    if (!res.ok()) return null;
    return (await res.text()).trim();
  } catch {
    return null;
  }
}

async function getIncidents(request: APIRequestContext, encodedId: string): Promise<Incident[]> {
  try {
    const res = await request.get(`${PROD_BASE}/football/event/${encodedId}/incidents`);
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
  request: APIRequestContext,
  match:   MatchRow,
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

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

function saveJson(filename: string, data: unknown): void {
  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.writeFileSync(path.join(RESULTS_DIR, filename), JSON.stringify(data, null, 2), 'utf-8');
  console.log(`\n💾 Đã lưu: results/${filename}`);
}

// ─── TEST SUITE ─────────────────────────────────────────────────────────────

test.describe('[PROD] Incidents API — bù giờ hiệp 2 (production)', () => {

  let db: Client;
  let allMatches: MatchRow[] = [];

  test.setTimeout(1_800_000);

  test.beforeAll(async () => {
    db = new Client(DB_CONFIG);
    await db.connect();

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

  // ── TEST 2 — PRODUCTION INCIDENTS LOGIC ───────────────────────────────────
  /**
   * KIỂM TRA TOÀN BỘ: encode + production incidents + logic bù giờ hiệp 2
   *
   * Mỗi trận:
   *   1. GET https://api.unik8s.com/api/v2/encode/{thesport_id}          → encoded ID
   *   2. GET https://api.unik8s.com/api/v2/football/event/{id}/incidents → incidents
   *   3. Filter period=2 → kiểm tra addedTime sau injuryTime
   */
  test('FULL CHECK: production incidents — logic bù giờ hiệp 2', async ({ request }) => {
    const results: CheckResult[] = [];
    const batches   = chunk(allMatches, BATCH_SIZE);
    const total     = allMatches.length;
    let   processed = 0;

    console.log(`\nBắt đầu kiểm tra ${total} trận (${batches.length} batch × ${BATCH_SIZE} song song)...`);
    console.log(`  Encode  : ${ENCODE_BASE}/encode/{id}`);
    console.log(`  Incidents: ${PROD_BASE}/football/event/{id}/incidents\n`);

    for (const batch of batches) {
      const batchResults = await Promise.all(
        batch.map(match => checkMatch(request, match))
      );
      results.push(...batchResults);
      processed += batch.length;

      if (processed % 500 === 0 || processed === total) {
        const bugs = results.filter(r => r.status === 'bug').length;
        const pct  = ((processed / total) * 100).toFixed(1);
        console.log(`  [${pct}%] ${processed}/${total} — bugs: ${bugs}`);
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
    console.log(`TỔNG KẾT — PRODUCTION INCIDENTS (${results.length} trận)`);
    console.log(`${'═'.repeat(60)}`);
    console.log(`  ✅ OK — thứ tự đúng                      : ${ok}`);
    console.log(`  ❌ BUG — addedTime trước injuryTime       : ${bugList.length}`);
    console.log(`  ⏭  Không có thông báo bù giờ (skip)      : ${noInjury}`);
    console.log(`  ⏭  Không có sự kiện bù giờ (skip)        : ${noAddedTime}`);
    console.log(`  ⚠  Không có incident hiệp 2              : ${noP2}`);
    console.log(`  ⚠  Lỗi API production (encode/incidents) : ${apiError}`);
    console.log(`${'═'.repeat(60)}`);

    if (bugList.length > 0) {
      console.warn(`\n⚠ ${bugList.length} trận BUG thứ tự bù giờ trên production:\n`);
      bugList.forEach((m, i) => {
        console.warn(`  [${i + 1}] opta_id=${m.opta_id} | encoded=${m.encodedId}`);
        console.warn(`      ${PROD_BASE}/football/event/${m.encodedId}/incidents`);
        m.bugs.forEach(b => console.warn(`      → ${b}`));
      });
    }

    // ── Lưu kết quả ─────────────────────────────────────────────────────────
    const dateStr = new Date().toISOString().slice(0, 10);

    saveJson(`incidents-prod-${dateStr}.json`, {
      runAt:   new Date().toISOString(),
      filter:  "coverage_level IN ('13','15') AND period_id=14",
      total:   results.length,
      summary: { ok, bug: bugList.length, noInjury, noAddedTime, noP2, apiError },
      bugs:    bugList,
    });

    if (bugList.length > 0) {
      saveJson('incidents-prod-bugs.json', bugList.map(m => ({
        opta_id:       m.opta_id,
        thesport_id:   m.thesport_id,
        coverage:      m.coverage_level,
        encodedId:     m.encodedId,
        incidents_url: `${PROD_BASE}/football/event/${m.encodedId}/incidents`,
        bugs:          m.bugs,
      })));
    }

    expect.soft(
      bugList.length,
      `${bugList.length} trận có addedTime TRƯỚC injuryTime trên production`
    ).toBe(0);

    if (noP2 > 0) {
      console.warn(`\n⚠ ${noP2} trận không có incident hiệp 2 trong production — data có thể chưa sync`);
    }
  });

});

// npx playwright test tests/incidents_production.spec.ts --project=chrome
