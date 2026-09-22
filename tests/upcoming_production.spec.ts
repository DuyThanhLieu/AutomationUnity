/**
 * TEST FILE: upcoming_production.spec.ts
 *
 * MỤC ĐÍCH: Kiểm tra production API cross-check với DB
 *   - Completeness: events + otherCompetitions = pagination.total
 *   - DB vs API: NOT_STARTED trong DB = total từ API
 *   - Locale VN (Việt Nam) và BR (Brazil/São Paulo UTC-3)
 *   - Timezone boundary: trận 21:00–23:59 SP không bị mất
 *
 * PRODUCTION:
 *   POST https://api.unik8s.com/api/v2/sport/football/scheduled-events-pagination-v2/{date}/locale/{locale}/type/{type}?language=en
 *   Body: { sortByMatchTime: false }
 *
 * DB: api_ts @ <DB_PROD_HOST> (readonly) — nguồn sự thật
 *
 * CHẠY:
 *   npx playwright test tests/upcoming_production.spec.ts --project=chrome
 */

import { test, expect, type APIRequestContext } from '@playwright/test';
import { Client } from 'pg';

// ─── CẤU HÌNH ──────────────────────────────────────────────────────────────

const PROD_API = 'https://api.unik8s.com/api/v2/sport/football';

const DB_CONFIG = {
  host: process.env.DB_PROD_HOST || '', port: 5432,
  user: 'readonly', password: process.env.DB_PROD_PASSWORD || '',
  database: 'api_ts', connectionTimeoutMillis: 30000,
};

/** São Paulo offset: UTC-3 (cố định, không đổi giờ mùa hè từ 2019) */
const SP_OFFSET_H = -3;

// ─── HELPER ────────────────────────────────────────────────────────────────

async function callProdAPI(
  request: APIRequestContext,
  date: string,
  locale: string,
  type: string,
  sortByMatchTime = false,
  extraBody: object = {},
) {
  const res = await request.post(
    `${PROD_API}/scheduled-events-pagination-v2/${date}/locale/${locale}/type/${type}?language=en`,
    { data: { sortByMatchTime, ...extraBody } },
  );
  return res.json();
}

/** events.length + sum(otherCompetitions[i].match_count) */
function countTotal(data: { events?: unknown[]; otherCompetitions?: { match_count: number }[] }): number {
  return (data.events?.length ?? 0) +
    (data.otherCompetitions ?? []).reduce((s, oc) => s + (oc.match_count ?? 0), 0);
}

/** "Ngày D theo múi giờ SP" từ một timestamp UTC (ms). */
function toSPDate(utcMs: number = Date.now()): string {
  return new Date(utcMs + SP_OFFSET_H * 3600_000).toISOString().slice(0, 10);
}

/** Unix timestamp của 00:00 SP = 03:00 UTC của ngày dateStr. */
function spMidnightUTC(dateStr: string): number {
  return Math.floor(new Date(`${dateStr}T03:00:00Z`).getTime() / 1000);
}


/** Ngày tiếp theo (YYYY-MM-DD) */
function nextDay(dateStr: string): string {
  return new Date(new Date(`${dateStr}T12:00:00Z`).getTime() + 86_400_000)
    .toISOString().slice(0, 10);
}

// ─── TEST SUITE ─────────────────────────────────────────────────────────────

test.describe('[PROD] Upcoming API — DB cross-check (VN + São Paulo timezone)', () => {

  let db: Client;
  test.setTimeout(30_000);

  test.beforeAll(async () => {
    db = new Client(DB_CONFIG);
    await db.connect();
  });

  test.afterAll(async () => {
    await db.end();
  });

  // ── TEST 1 ────────────────────────────────────────────────────────────────
  /**
   * [PROD / VN] Completeness hôm nay với locale=VN.
   * events + sum(match_count) phải bằng pagination.total.
   */
  test('[VN] Today: completeness check (events + otherComps = total)', async ({ request }) => {
    const today = new Date().toISOString().slice(0, 10);
    const json  = await callProdAPI(request, today, 'VN', 'upcoming');
    const data  = json.data;
    const total   = data?.pagination?.total ?? 0;
    const counted = countTotal(data);

    console.log(`\n[PROD/VN] Today (${today}):`);
    console.log(`  events=${data?.events?.length} + otherComps=${data?.otherCompetitions?.length} nhóm`);
    console.log(`  counted=${counted} | API.total=${total}`);

    expect(json.code, 'code phải là 1').toBe(1);
    if (total > 0) {
      expect.soft(
        Math.abs(counted - total),
        `Completeness sai: counted=${counted} vs total=${total}`,
      ).toBeLessThanOrEqual(5);
    }
  });

  // ── TEST 2 ────────────────────────────────────────────────────────────────
  /**
   * [PROD / VN] DB vs API: đếm NOT_STARTED hôm nay (UTC 00:00–23:59).
   * status_id IN (0,1) = chưa đá.
   */
  test('[VN] Today: DB NOT_STARTED count must match API total', async ({ request }) => {
    const today = new Date().toISOString().slice(0, 10);

    // Production API dùng UTC day boundary (00:00 → 24:00 UTC) cho date param,
    // không phải VN timezone boundary. Tolerance cao hơn vì matches đang live
    // (vừa chuyển từ NOT_STARTED→LIVE) sẽ tạo chênh lệch nhỏ theo thời gian thực.
    const winStart = Math.floor(new Date(`${today}T00:00:00Z`).getTime() / 1000);
    const winEnd   = winStart + 86_400;

    const dbRes = await db.query<{ not_started: string }>(
      `SELECT COUNT(*) FILTER (WHERE status_id IN (0, 1)) AS not_started
       FROM sport_events
       WHERE start_timestamp >= $1 AND start_timestamp < $2`,
      [winStart, winEnd],
    );
    const dbCount = Number(dbRes.rows[0].not_started);

    const json     = await callProdAPI(request, today, 'VN', 'upcoming');
    const apiTotal = json.data?.pagination?.total ?? 0;

    console.log(`\n[PROD/VN] Today (${today}):`);
    console.log(`  UTC window     : ${new Date(winStart*1000).toISOString()} → ${new Date(winEnd*1000).toISOString()}`);
    console.log(`  DB not_started : ${dbCount}`);
    console.log(`  API total      : ${apiTotal}`);
    console.log(`  Diff           : ${Math.abs(apiTotal - dbCount)}`);

    // Tolerance 15: chênh lệch nhỏ do matches đang chuyển trạng thái live
    expect.soft(
      Math.abs(apiTotal - dbCount),
      `MISSING: DB=${dbCount} vs API=${apiTotal} — diff=${Math.abs(apiTotal - dbCount)} (ngưỡng 15)`,
    ).toBeLessThanOrEqual(15);
  });

  // ── TEST 3 ────────────────────────────────────────────────────────────────
  /**
   * [PROD / BR] Completeness ngày mai theo múi giờ São Paulo (UTC-3).
   * events + sum(match_count) phải bằng pagination.total.
   */
  test('[BR/SP] Tomorrow: completeness check', async ({ request }) => {
    const tomorrowSP = toSPDate(Date.now() + 86_400_000);
    const json = await callProdAPI(request, tomorrowSP, 'BR', 'upcoming');
    const data  = json.data;
    const total   = data?.pagination?.total ?? 0;
    const counted = countTotal(data);

    console.log(`\n[PROD/BR] SP Tomorrow (${tomorrowSP}):`);
    console.log(`  events=${data?.events?.length} + otherComps=${data?.otherCompetitions?.length} nhóm`);
    console.log(`  counted=${counted} | API.total=${total}`);

    expect(json.code, 'code phải là 1').toBe(1);
    if (total > 0) {
      expect.soft(
        Math.abs(counted - total),
        `Completeness sai: counted=${counted} vs total=${total}`,
      ).toBeLessThanOrEqual(5);
    }
  });

  // ── TEST 4 — CORE BUG CHECK ───────────────────────────────────────────────
  /**
   * [PROD / BR] DB NOT_STARTED trong cửa sổ São Paulo phải = API total.
   *
   * Cửa sổ UTC cho "ngày mai SP":
   *   [tomorrowSP 03:00 UTC, tomorrowSP+1 03:00 UTC)
   *
   * BUG nếu API dùng UTC boundary:
   *   Trận 00:00–02:59 UTC của tomorrowSP+1 (=21:00–23:59 SP) bị mất.
   */
  test('[BR/SP] Tomorrow: DB NOT_STARTED (SP window) must match API total', async ({ request }) => {
    const tomorrowSP = toSPDate(Date.now() + 86_400_000);

    // Cửa sổ UTC = ngày mai SP (03:00 UTC ngày D → 03:00 UTC ngày D+1)
    const winStart = spMidnightUTC(tomorrowSP);
    const winEnd   = spMidnightUTC(nextDay(tomorrowSP));

    const dbRes = await db.query<{ total: string; not_started: string }>(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE status_id IN (0, 1)) AS not_started
       FROM sport_events
       WHERE start_timestamp >= $1 AND start_timestamp < $2`,
      [winStart, winEnd],
    );
    const dbTotal      = Number(dbRes.rows[0].total);
    const dbNotStarted = Number(dbRes.rows[0].not_started);

    const json     = await callProdAPI(request, tomorrowSP, 'BR', 'upcoming');
    const apiTotal   = json.data?.pagination?.total ?? 0;
    const apiEvents  = json.data?.events?.length ?? 0;
    const apiOthers  = (json.data?.otherCompetitions ?? [])
      .reduce((s: number, oc: { match_count: number }) => s + (oc.match_count ?? 0), 0);
    const apiCounted = apiEvents + apiOthers;

    console.log(`\n[PROD/BR] SP Tomorrow: ${tomorrowSP}`);
    console.log(`  UTC window  : ${new Date(winStart * 1000).toISOString()} → ${new Date(winEnd * 1000).toISOString()}`);
    console.log(`  DB total    : ${dbTotal} (not_started: ${dbNotStarted})`);
    console.log(`  API total   : ${apiTotal}`);
    console.log(`  API counted : events(${apiEvents}) + otherComps(${apiOthers}) = ${apiCounted}`);
    console.log(`  Diff DB↔API : ${Math.abs(apiTotal - dbNotStarted)}`);

    // DB not_started = API total (cho phép ±5 vì race condition live matches)
    expect.soft(
      Math.abs(apiTotal - dbNotStarted),
      `MISSING MATCHES: DB=${dbNotStarted} vs API=${apiTotal} — lệch ${Math.abs(apiTotal - dbNotStarted)} trận`,
    ).toBeLessThanOrEqual(5);

    // Completeness bên trong API
    expect.soft(
      Math.abs(apiCounted - apiTotal),
      `API completeness sai: counted=${apiCounted} vs total=${apiTotal}`,
    ).toBeLessThanOrEqual(5);
  });

  // ── TEST 5 ────────────────────────────────────────────────────────────────
  /**
   * [PROD / BR] Boundary: trận 21:00–23:59 SP (=00:00–02:59 UTC ngày D+2)
   * phải được tính vào ngày mai SP, không bị bỏ sót.
   */
  test('[BR/SP] Boundary 21:00–23:59 SP must be included in tomorrow total', async ({ request }) => {
    const tomorrowSP  = toSPDate(Date.now() + 86_400_000);
    const dayAfterSP  = nextDay(tomorrowSP);

    // Boundary = 00:00–02:59 UTC của ngày kế sau ngày mai SP
    const boundaryStart = spMidnightUTC(dayAfterSP);  // 03:00 UTC ngày D+1 - 3h = 00:00 UTC ngày D+2
    const boundaryEnd   = boundaryStart + 3 * 3600;    // + 3 tiếng

    const bdRes = await db.query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt
       FROM sport_events
       WHERE start_timestamp >= $1 AND start_timestamp < $2
         AND status_id IN (0, 1)`,
      [boundaryStart, boundaryEnd],
    );
    const boundaryCount = Number(bdRes.rows[0].cnt);

    console.log(`\n[PROD/BR] Boundary window:`);
    console.log(`  ${new Date(boundaryStart * 1000).toISOString()} → ${new Date(boundaryEnd * 1000).toISOString()}`);
    console.log(`  = 21:00–23:59 SP của ngày mai (${tomorrowSP})`);
    console.log(`  DB matches in boundary: ${boundaryCount}`);

    if (boundaryCount === 0) {
      console.log('  Không có trận boundary — skip check này');
      return;
    }

    const json     = await callProdAPI(request, tomorrowSP, 'BR', 'upcoming');
    const apiTotal = json.data?.pagination?.total ?? 0;

    console.log(`  API total=${apiTotal} phải >= boundaryCount=${boundaryCount}`);

    expect(
      apiTotal,
      `BUG TIMEZONE: API total=${apiTotal} nhỏ hơn boundary=${boundaryCount}. Trận 21:00–23:59 SP bị mất!`,
    ).toBeGreaterThanOrEqual(boundaryCount);
  });

  // ── TEST 6 ────────────────────────────────────────────────────────────────
  /**
   * [PROD] Completeness hôm nay + ngày mai cho cả VN và BR.
   * Tổng hợp nhanh 4 API calls để verify không có locale nào bị lỗi.
   */
  test('[PROD] Multi-locale completeness: VN + BR (today + tomorrow)', async ({ request }) => {
    const today      = new Date().toISOString().slice(0, 10);
    const tomorrowSP = toSPDate(Date.now() + 86_400_000);

    const cases = [
      { label: 'VN Today',     locale: 'VN', date: today      },
      { label: 'VN Tomorrow',  locale: 'VN', date: tomorrowSP },
      { label: 'BR Today SP',  locale: 'BR', date: toSPDate() },
      { label: 'BR Tomorrow SP', locale: 'BR', date: tomorrowSP },
    ];

    console.log('\n[PROD] Multi-locale summary:');
    for (const c of cases) {
      const json    = await callProdAPI(request, c.date, c.locale, 'upcoming');
      const data    = json.data;
      const total   = data?.pagination?.total ?? 0;
      const counted = countTotal(data);

      console.log(`  ${c.label.padEnd(16)} (${c.date}) | events=${data?.events?.length ?? 0} + groups=${data?.otherCompetitions?.length ?? 0} = ${counted} | total=${total}`);

      expect.soft(json.code, `${c.label}: code phải 1`).toBe(1);
      if (total > 0) {
        expect.soft(
          Math.abs(counted - total),
          `${c.label}: counted=${counted} ≠ total=${total}`,
        ).toBeLessThanOrEqual(5);
      }
    }
  });

});

// npx playwright test tests/upcoming_production.spec.ts --project=chrome
