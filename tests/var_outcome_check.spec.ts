/**
 * TEST FILE: var_outcome_check.spec.ts
 *
 * So sánh varOutcome giữa API v2 incidents và DB (opta_match_var)
 * cho TẤT CẢ 51 trận WC2026 đã kết thúc.
 *
 * DB: opta_match_var (type + decision → expected varOutcome)
 * API: /api/v2/football/event/{encodedId}/incidents → actual varOutcome
 *
 * Chỉ log lỗi khi:
 *   - DB có VAR mà API không trả incident đó (db_only)
 *   - API có varDecision mà DB không có (api_only)
 *   - Hai bên có nhưng varOutcome khác nhau (outcome_mismatch)
 *   - API trả varOutcome không hợp lệ (api_invalid)
 *
 * Outcome matrix (knowledge §5):
 *   Goal awarded    + Confirmed → goal_awarded        | Cancelled → goal_not_awarded
 *   Goal not awarded+ Confirmed → goal_not_awarded    | Cancelled → goal_awarded
 *   Penalty awarded + Confirmed → penalty_awarded     | Cancelled → penalty_not_awarded
 *   Penalty not awarded+Confirmed→penalty_not_awarded | Cancelled → penalty_awarded
 *   Red card given  + Confirmed → red_card_given      | Cancelled → red_card_not_given
 *   Card upgrade    + Confirmed → yellow_card_confirmed| Cancelled→ red_card_confirmed
 *   Corner awarded  + Confirmed → corner_awarded      | Cancelled → corner_not_awarded
 *   Corner not awarded+Confirmed→ corner_not_awarded  | Cancelled → corner_awarded
 *   Mistaken identity (any)    → mistaken_identity
 *   Other (any)                → mistaken_identity   (fallback, knowledge §11.3 — cần qualifier 436/365 để xác định corner context, không có trong opta_match_var)
 *
 * CHẠY:
 *   npx playwright test tests/var_outcome_check.spec.ts --project=chrome
 * 26 trận có VAR, 42 incidents tổng cộng, sắp xếp từ nhiều nhất:

VAR	Trận	Link
4	Canada vs Qatar	5z3v0bl2xv24vu6
3	Spain vs Cabo Verde	4m9appl6tdjpr6b
3	Argentina vs Austria	go6v7ils8gjfrxk
2	9 trận	...
1	14 trận	...
Canada vs Qatar (4 VAR) và Argentina vs Austria (3 × Penalty not awarded|Cancelled) là những trận nhiều VAR nhất để test trên UI.
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
  connectionTimeoutMillis: 30_000,
};

const ENCODE_BASE   = 'https://opta-api.uniscore.vn/api/v1';
const INCIDENT_BASE = 'https://opta-api.uniscore.vn/api/v2';

const WC2026_COMPETITION_ID = '70excpe1synn9kadnbppahdn7';
const WC2026_CALENDAR_ID    = '873cbl9cd9butm4air0mugxzo';

const RESULTS_DIR = path.join(__dirname, '..', 'results');
const BATCH_SIZE  = 5;

// ─── VALID OUTCOMES (knowledge §9) ─────────────────────────────────────────

const VALID_VAR_OUTCOMES = new Set([
  'goal_awarded', 'goal_not_awarded',
  'penalty_awarded', 'penalty_not_awarded',
  'red_card_given', 'red_card_not_given',
  'yellow_card_confirmed', 'red_card_confirmed',
  'corner_awarded', 'corner_not_awarded',
  'mistaken_identity',
]);

const FORBIDDEN_VAR_OUTCOMES = new Set(['other', 'unknown']);

// ─── DB TYPE+DECISION → EXPECTED varOutcome ────────────────────────────────

const DB_OUTCOME_MAP: Record<string, string> = {
  'Goal awarded|Confirmed':       'goal_awarded',
  'Goal awarded|Cancelled':       'goal_not_awarded',
  'Goal not awarded|Confirmed':   'goal_not_awarded',
  'Goal not awarded|Cancelled':   'goal_awarded',
  'Penalty awarded|Confirmed':    'penalty_awarded',
  'Penalty awarded|Cancelled':    'penalty_not_awarded',
  'Penalty not awarded|Confirmed':'penalty_not_awarded',
  'Penalty not awarded|Cancelled':'penalty_awarded',
  'Red card given|Confirmed':     'red_card_given',
  'Red card given|Cancelled':     'red_card_not_given',
  'Card upgrade|Confirmed':       'yellow_card_confirmed',
  'Card upgrade|Cancelled':       'red_card_confirmed',
  'Corner awarded|Confirmed':     'corner_awarded',
  'Corner awarded|Cancelled':     'corner_not_awarded',
  'Corner not awarded|Confirmed': 'corner_not_awarded',
  'Corner not awarded|Cancelled': 'corner_awarded',
  // 333 — Mistaken identity (decision không quan trọng)
  'Mistaken identity|Confirmed':  'mistaken_identity',
  'Mistaken identity|Cancelled':  'mistaken_identity',
  // 334 — Other: không map cứng — skip outcome_mismatch (xem dbToExpectedOutcome)
  // context cần qualifier 436/365, không có trong opta_match_var (knowledge §11.3)
  'Other|Cancelled':              '__skip__',
  'Other|Confirmed':              '__skip__',
};

function dbToExpectedOutcome(type: string, decision: string): string {
  return DB_OUTCOME_MAP[`${type}|${decision}`] ?? 'unknown';
}

// ─── KIỂU DỮ LIỆU ──────────────────────────────────────────────────────────

interface MatchRow {
  opta_id:     string;
  thesport_id: string;
}

interface DbVarRow {
  opta_event_id: string | null;
  type:          string;
  decision:      string;
  period_id:     number;
  time_min:      number;
  player_name:   string;
}

interface ApiIncident {
  incidentType:  string;
  varOutcome?:   unknown;
  varReason?:    unknown;
  period?:       number;
  time?:         number;
  addedTime?:    number;
  isHome?:       boolean;
  [key: string]: unknown;
}

type MismatchType =
  | 'db_only'            // DB có VAR, API không trả
  | 'api_only'           // API có varDecision, DB không có
  | 'outcome_mismatch'   // cả hai có nhưng varOutcome khác nhau
  | 'api_forbidden'      // API trả "other" hoặc "unknown" — không được hiện trên UI/API
  | 'api_invalid'        // API trả varOutcome không hợp lệ / missing field
  | 'api_has_var_reason'; // API có field varReason (sai naming)

interface Mismatch {
  type:          MismatchType;
  period:        number | null;
  timeMin:       number | null;
  playerName?:   string;
  expectedOutcome?: string;
  actualOutcome?:   unknown;
  detail:        string;
  // filled in after check
  matchId?:      string;
  thesportId?:   string;
  encodedId?:    string;
  incidentsUrl?: string;
}

interface MatchCheckResult {
  opta_id:      string;
  thesport_id:  string;
  encodedId:    string | null;
  incidentsUrl: string | null;
  dbVarCount:   number;
  apiVarCount:  number;
  mismatches:   Mismatch[];
  status:       'ok' | 'mismatch' | 'no_var' | 'encode_error' | 'api_error';
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

async function getApiIncidents(request: APIRequestContext, encodedId: string): Promise<ApiIncident[]> {
  try {
    const res = await request.get(`${INCIDENT_BASE}/football/event/${encodedId}/incidents`);
    if (!res.ok()) return [];
    const json = await res.json();
    return json?.data?.incidents ?? [];
  } catch {
    return [];
  }
}

async function getDbVarRows(db: Client, optaMatchId: string): Promise<DbVarRow[]> {
  const res = await db.query<DbVarRow>(`
    SELECT DISTINCT ON (opta_event_id)
      opta_event_id,
      type,
      decision,
      period_id,
      time_min,
      player_name
    FROM opta_match_var
    WHERE match_id = $1
    ORDER BY opta_event_id, last_updated DESC NULLS LAST
  `, [optaMatchId]);
  return res.rows;
}

/** API incident time: tính effective minute (time + addedTime nếu có) */
function apiEffectiveTime(inc: ApiIncident): number {
  return (inc.time ?? 0) + (inc.addedTime ?? 0);
}

/** Key khớp: period|timeMin — dùng để so sánh DB row vs API incident */
function matchKey(period: number, timeMin: number): string {
  return `${period}|${timeMin}`;
}

async function checkOneMatch(
  request: APIRequestContext,
  db:      Client,
  match:   MatchRow,
): Promise<MatchCheckResult> {
  const base: MatchCheckResult = {
    opta_id:      match.opta_id,
    thesport_id:  match.thesport_id,
    encodedId:    null,
    incidentsUrl: null,
    dbVarCount:   0,
    apiVarCount:  0,
    mismatches:   [],
    status:       'no_var',
  };

  // Lấy DB VAR rows (deduplicated by opta_event_id)
  const dbRows    = await getDbVarRows(db, match.opta_id);
  base.dbVarCount = dbRows.length;

  // Encode thesport_id
  const encodedId = await encodeId(request, match.thesport_id);
  if (!encodedId) {
    return { ...base, status: 'encode_error' };
  }
  base.encodedId    = encodedId;
  base.incidentsUrl = `${INCIDENT_BASE}/football/event/${encodedId}/incidents`;

  // Lấy API incidents
  const allIncidents  = await getApiIncidents(request, encodedId);
  if (allIncidents.length === 0 && dbRows.length === 0) {
    return { ...base, status: 'no_var' };
  }

  const apiVarList    = allIncidents.filter(i => i.incidentType === 'varDecision');
  base.apiVarCount    = apiVarList.length;

  // Nếu cả hai đều không có VAR → skip
  if (dbRows.length === 0 && apiVarList.length === 0) {
    return { ...base, status: 'no_var' };
  }

  const mismatches: Mismatch[] = [];

  // ── Build maps ───────────────────────────────────────────────────────────

  // DB: period|time → expected outcome
  const dbMap = new Map<string, { expected: string; row: DbVarRow }>();
  for (const row of dbRows) {
    const key      = matchKey(row.period_id, row.time_min);
    const expected = dbToExpectedOutcome(row.type, row.decision);
    dbMap.set(key, { expected, row });
  }

  // API: period|time → actual outcome
  const apiMap = new Map<string, { actual: unknown; inc: ApiIncident }>();
  for (const inc of apiVarList) {
    const key = matchKey(inc.period ?? 0, apiEffectiveTime(inc));
    apiMap.set(key, { actual: inc.varOutcome, inc });
  }

  // ── Validate API incidents (naming, field, value) ────────────────────────
  for (const [key, { actual, inc }] of apiMap) {
    if ('varReason' in inc && inc.varReason !== undefined) {
      mismatches.push({
        type:   'api_has_var_reason',
        period: inc.period ?? null,
        timeMin: apiEffectiveTime(inc),
        actualOutcome: actual,
        detail: `field 'varReason' không được phép (key=${key})`,
      });
      continue;
    }
    if (!('varOutcome' in inc)) {
      mismatches.push({
        type:   'api_invalid',
        period: inc.period ?? null,
        timeMin: apiEffectiveTime(inc),
        detail: `thiếu field varOutcome (key=${key})`,
      });
      continue;
    }
    if (actual !== null && actual !== undefined) {
      if (typeof actual === 'string' && FORBIDDEN_VAR_OUTCOMES.has(actual)) {
        // "other" hoặc "unknown" không được hiện trên UI/API — phải resolve thành giá trị cụ thể
        mismatches.push({
          type:   'api_forbidden',
          period: inc.period ?? null,
          timeMin: apiEffectiveTime(inc),
          actualOutcome: actual,
          detail: `varOutcome="${actual}" bị cấm — không được hiện trên UI/API (key=${key})`,
        });
      } else if (typeof actual !== 'string' || !/^[a-z0-9_]+$/.test(actual) || !VALID_VAR_OUTCOMES.has(actual)) {
        mismatches.push({
          type:   'api_invalid',
          period: inc.period ?? null,
          timeMin: apiEffectiveTime(inc),
          actualOutcome: actual,
          detail: `varOutcome="${actual}" không hợp lệ (key=${key})`,
        });
      }
    }
  }

  // ── DB có VAR mà API không có ────────────────────────────────────────────
  for (const [key, { expected, row }] of dbMap) {
    if (expected === '__skip__') continue; // Other: skip
    if (!apiMap.has(key)) {
      mismatches.push({
        type:            'db_only',
        period:          row.period_id,
        timeMin:         row.time_min,
        playerName:      row.player_name,
        expectedOutcome: expected,
        detail:          `DB: ${row.type}|${row.decision} → "${expected}", API không trả (key=${key})`,
      });
    }
  }

  // ── API có VAR mà DB không có ────────────────────────────────────────────
  for (const [key, { actual, inc }] of apiMap) {
    if (!dbMap.has(key)) {
      mismatches.push({
        type:         'api_only',
        period:       inc.period ?? null,
        timeMin:      apiEffectiveTime(inc),
        actualOutcome: actual,
        detail:       `API trả varOutcome="${actual}", DB không có (key=${key})`,
      });
    }
  }

  // ── Cả hai có nhưng outcome khác nhau ────────────────────────────────────
  for (const [key, { expected, row }] of dbMap) {
    const apiEntry = apiMap.get(key);
    if (!apiEntry) continue;
    // Other type: không đủ context từ opta_match_var để so sánh — bỏ qua
    if (expected === '__skip__') continue;
    const actual = apiEntry.actual ?? null;
    if (String(actual) !== expected && actual !== null) {
      mismatches.push({
        type:            'outcome_mismatch',
        period:          row.period_id,
        timeMin:         row.time_min,
        playerName:      row.player_name,
        expectedOutcome: expected,
        actualOutcome:   actual,
        detail: `DB="${expected}" ≠ API="${actual}" (${row.type}|${row.decision}, key=${key})`,
      });
    }
  }

  return {
    ...base,
    mismatches,
    status: mismatches.length > 0 ? 'mismatch' : (dbRows.length > 0 || apiVarList.length > 0 ? 'ok' : 'no_var'),
  };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function saveJson(filename: string, data: unknown): void {
  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.writeFileSync(path.join(RESULTS_DIR, filename), JSON.stringify(data, null, 2), 'utf-8');
  console.log(`Đã lưu: results/${filename}`);
}

// ─── TEST SUITE ─────────────────────────────────────────────────────────────

test.describe('VAR WC2026 — API v2 vs DB (opta_match_var)', () => {

  test.setTimeout(600_000); // 10 phút cho 51 trận

  let db: Client;
  let matches: MatchRow[] = [];

  test.beforeAll(async () => {
    db = new Client(DB_CONFIG);
    await db.connect();

    const res = await db.query<MatchRow>(`
      SELECT mi.id          AS opta_id,
             m.thesport_id
      FROM   opta_match_info mi
      JOIN   mp_match m ON m.opta_id = mi.id
      WHERE  mi.competition_id         = $1
        AND  mi.tournament_calendar_id = $2
        AND  mi.period_id              = 14
      ORDER  BY mi.id
    `, [WC2026_COMPETITION_ID, WC2026_CALENDAR_ID]);

    matches = res.rows;
    console.log(`\nWC2026 finished matches: ${matches.length}`);
  });

  test.afterAll(async () => {
    await db.end();
  });

  // ── Test 1: xác nhận DB ──────────────────────────────────────────────────

  test('DB: tổng số trận WC2026 đã kết thúc', async () => {
    console.log(`competition_id         = ${WC2026_COMPETITION_ID}`);
    console.log(`tournament_calendar_id = ${WC2026_CALENDAR_ID}`);
    console.log(`Tổng trận period_id=14 = ${matches.length}`);
    expect(matches.length, 'Không tìm thấy trận WC2026').toBeGreaterThan(0);
  });

  // ── Test 2: check toàn bộ ────────────────────────────────────────────────

  test('So sánh varOutcome: API v2 vs opta_match_var — tất cả 51 trận', async ({ request }) => {

    const allResults:    MatchCheckResult[] = [];
    const allMismatches: Mismatch[]         = [];

    let noVarCount    = 0;
    let encodeErrors  = 0;
    let matchedOk     = 0;
    let mismatchCount = 0;

    for (const batch of chunk(matches, BATCH_SIZE)) {
      const results = await Promise.all(batch.map(m => checkOneMatch(request, db, m)));

      for (const r of results) {
        allResults.push(r);

        // Log mỗi trận
        const dbLabel  = r.dbVarCount  > 0 ? `DB=${r.dbVarCount}VAR`  : 'DB=0VAR';
        const apiLabel = r.apiVarCount > 0 ? `API=${r.apiVarCount}VAR` : 'API=0VAR';

        const apiUrl = r.encodedId
          ? `${INCIDENT_BASE}/football/event/${r.encodedId}/incidents`
          : null;

        if (r.status === 'encode_error') {
          encodeErrors++;
          console.error(`  ❌ ENCODE_ERROR  ${r.opta_id}`);
        } else if (r.status === 'no_var') {
          noVarCount++;
          console.log(`  ⚪ NO_VAR        ${r.opta_id}  ${apiUrl}`);
        } else if (r.status === 'mismatch') {
          mismatchCount++;
          console.error(`  ❌ MISMATCH [${r.mismatches.length}]  ${r.opta_id} (${dbLabel}, ${apiLabel})`);
          console.error(`       🔗 ${apiUrl}`);
          for (const mm of r.mismatches) {
            console.error(`       [${mm.type}] p${mm.period}' ${mm.timeMin}min${mm.playerName ? ' '+mm.playerName : ''} — ${mm.detail}`);
          }
          allMismatches.push(...r.mismatches.map(mm => ({
            ...mm,
            matchId:      r.opta_id,
            thesportId:   r.thesport_id,
            encodedId:    r.encodedId ?? undefined,
            incidentsUrl: apiUrl ?? undefined,
          })));
        } else {
          matchedOk++;
          console.log(`  ✓  OK           ${r.opta_id} (${dbLabel}, ${apiLabel})  ${apiUrl}`);
        }
      }

      console.log(`  → ${allResults.length}/${matches.length} done`);
    }

    // ── Lưu kết quả ──────────────────────────────────────────────────────────
    const today   = new Date().toISOString().slice(0, 10);
    const byType  = allMismatches.reduce((acc, m) => {
      acc[m.type] = (acc[m.type] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const summary = {
      runAt:          new Date().toISOString(),
      competition:    WC2026_COMPETITION_ID,
      calendar:       WC2026_CALENDAR_ID,
      totalMatches:   matches.length,
      noVar:          noVarCount,
      encodeErrors,
      matchedOk,
      mismatchMatches: mismatchCount,
      totalMismatches: allMismatches.length,
      byType,
    };

    saveJson(`var-wc2026-check-${today}.json`,
      { summary, results: allResults, mismatches: allMismatches });

    if (allMismatches.length > 0) {
      saveJson('var-wc2026-mismatches-latest.json', { summary, mismatches: allMismatches });
    }

    // ── Báo cáo ───────────────────────────────────────────────────────────────
    console.log(`\n${'═'.repeat(60)}`);
    console.log('TỔNG KẾT — VAR WC2026 API v2 vs DB');
    console.log(`${'═'.repeat(60)}`);
    console.log(`  Tổng trận          : ${matches.length}`);
    console.log(`  Không có VAR       : ${noVarCount}`);
    console.log(`  Encode lỗi         : ${encodeErrors}`);
    console.log(`  Khớp OK            : ${matchedOk}`);
    console.log(`  Trận có mismatch   : ${mismatchCount}`);
    console.log(`  Mismatch tổng      : ${allMismatches.length}`);
    if (Object.keys(byType).length) {
      for (const [t, n] of Object.entries(byType)) {
        console.log(`    ${t.padEnd(22)}: ${n}`);
      }
    }
    console.log(`${'═'.repeat(60)}`);

    // ── Assertions (soft để thấy hết lỗi) ────────────────────────────────────
    const dbOnly       = allMismatches.filter(m => m.type === 'db_only');
    const apiOnly      = allMismatches.filter(m => m.type === 'api_only');
    const mismatch     = allMismatches.filter(m => m.type === 'outcome_mismatch');
    const apiForbidden = allMismatches.filter(m => m.type === 'api_forbidden');
    const apiInvalid   = allMismatches.filter(m => m.type === 'api_invalid');
    const wrongField   = allMismatches.filter(m => m.type === 'api_has_var_reason');

    // CRITICAL: "other" và "unknown" tuyệt đối không được hiện trên UI/API
    if (apiForbidden.length > 0) {
      apiForbidden.forEach(m =>
        console.error(`  🚨 FORBIDDEN varOutcome="${m.actualOutcome}" match=${m.matchId} p${m.period}' ${m.timeMin}min`)
      );
    }
    expect.soft(apiForbidden.length, `${apiForbidden.length} VAR trả "other"/"unknown" — không được hiện trên UI`).toBe(0);

    expect.soft(dbOnly.length,     `${dbOnly.length} VAR trong DB mà API không trả`).toBe(0);
    expect.soft(apiOnly.length,    `${apiOnly.length} VAR chỉ có API, DB không có`).toBe(0);
    expect.soft(mismatch.length,   `${mismatch.length} VAR có varOutcome khác nhau API vs DB`).toBe(0);
    expect.soft(apiInvalid.length, `${apiInvalid.length} VAR có varOutcome không hợp lệ`).toBe(0);
    expect.soft(wrongField.length, `${wrongField.length} VAR có field varReason (sai naming)`).toBe(0);
  });
});
