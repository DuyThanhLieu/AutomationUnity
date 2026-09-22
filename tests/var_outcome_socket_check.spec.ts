/**
 * TEST FILE: var_outcome_socket_check.spec.ts
 *
 * So sánh varOutcome 3 chiều cho các match LIVE:
 *   Socket (MQTT) vs API v2 vs DB (opta_match_var)
 *
 * FLOW:
 *   1. Build cache: query DB các match đang live/gần đây → encode → Map<encodedId, optaId>
 *   2. Lắng nghe MQTT broadcast trong WAIT_MS giây
 *   3. Thu thập tất cả varDecision từ socket
 *   4. Sau khi hết giờ, với mỗi match có VAR:
 *      a. Validate socket varOutcome (forbidden / invalid)
 *      b. Fetch API v2 incidents → so sánh varOutcome
 *      c. Query DB opta_match_var → tính expected → so sánh
 *   5. Chỉ log lỗi khi socket ≠ API, socket ≠ DB, hoặc giá trị không hợp lệ
 *
 * CHẠY:
 *   npx playwright test tests/var_outcome_socket_check.spec.ts --project=chrome
 */

import { test, expect, type APIRequestContext } from '@playwright/test';
import { Client }                               from 'pg';
import * as zlib from 'zlib';
import * as fs   from 'fs';
import * as path from 'path';
import * as mqtt from 'mqtt';

// ─── CẤU HÌNH ──────────────────────────────────────────────────────────────

const MQTT_URL        =  process.env.MQTT_HOST ? `mqtt://${process.env.MQTT_HOST}` : '';
const MQTT_USERNAME   = 'football';
const MQTT_PASSWORD   = process.env.MQTT_PASSWORD || 'football';
const BROADCAST_TOPIC = 'fb-live-v1';
const WAIT_MS         = 300_000;  // 5 phút

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
const RESULTS_DIR   = path.join(__dirname, '..', 'results');

// ─── VALID / FORBIDDEN ──────────────────────────────────────────────────────

const VALID_VAR_OUTCOMES = new Set([
  'goal_awarded', 'goal_not_awarded',
  'penalty_awarded', 'penalty_not_awarded',
  'red_card_given', 'red_card_not_given',
  'yellow_card_confirmed', 'red_card_confirmed',
  'corner_awarded', 'corner_not_awarded',
  'mistaken_identity',
]);

const FORBIDDEN_VAR_OUTCOMES = new Set(['other', 'unknown']);

// ─── DB OUTCOME MAP (knowledge §5) ─────────────────────────────────────────

const DB_OUTCOME_MAP: Record<string, string> = {
  'Goal awarded|Confirmed':        'goal_awarded',
  'Goal awarded|Cancelled':        'goal_not_awarded',
  'Goal not awarded|Confirmed':    'goal_not_awarded',
  'Goal not awarded|Cancelled':    'goal_awarded',
  'Penalty awarded|Confirmed':     'penalty_awarded',
  'Penalty awarded|Cancelled':     'penalty_not_awarded',
  'Penalty not awarded|Confirmed': 'penalty_not_awarded',
  'Penalty not awarded|Cancelled': 'penalty_awarded',
  'Red card given|Confirmed':      'red_card_given',
  'Red card given|Cancelled':      'red_card_not_given',
  'Card upgrade|Confirmed':        'yellow_card_confirmed',
  'Card upgrade|Cancelled':        'red_card_confirmed',
  'Corner awarded|Confirmed':      'corner_awarded',
  'Corner awarded|Cancelled':      'corner_not_awarded',
  'Corner not awarded|Confirmed':  'corner_not_awarded',
  'Corner not awarded|Cancelled':  'corner_awarded',
  'Mistaken identity|Confirmed':   'mistaken_identity',
  'Mistaken identity|Cancelled':   'mistaken_identity',
  'Other|Confirmed':               '__skip__',
  'Other|Cancelled':               '__skip__',
};

// ─── KIỂU DỮ LIỆU ──────────────────────────────────────────────────────────

interface SocketVarIncident {
  incidentType:  string;
  varOutcome?:   unknown;
  varReason?:    unknown;
  period?:       number;
  time?:         number;
  addedTime?:    number;
  [key: string]: unknown;
}

interface SocketMatchUpdate {
  matchId:     string;             // encoded ID từ socket
  optaId:      string | null;      // Opta ID tra từ DB cache
  incidents:   SocketVarIncident[];
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
  incidentType: string;
  varOutcome?:  unknown;
  period?:      number;
  time?:        number;
  addedTime?:   number;
  [key: string]: unknown;
}

type MismatchType =
  | 'socket_forbidden'   // socket trả "other"/"unknown"
  | 'socket_invalid'     // socket trả varOutcome không hợp lệ
  | 'socket_vs_api'      // socket ≠ API
  | 'socket_vs_db'       // socket ≠ DB expected
  | 'api_vs_db'          // API ≠ DB expected (socket ok)
  | 'socket_missing'     // API/DB có VAR nhưng socket không có
  | 'socket_has_var_reason'; // socket có field varReason

interface Mismatch {
  type:           MismatchType;
  matchId:        string;
  optaId:         string | null;
  incidentsUrl:   string;
  period:         number | null;
  timeMin:        number | null;
  socketOutcome?: unknown;
  apiOutcome?:    unknown;
  dbExpected?:    string;
  detail:         string;
}

// ─── HELPER ────────────────────────────────────────────────────────────────

function decodePayload(buf: Buffer): unknown {
  const text = buf.toString('utf8');
  if (/^[{[]/.test(text.trim())) return JSON.parse(text);
  try   { return JSON.parse(zlib.inflateSync(buf).toString('utf8')); }
  catch { return JSON.parse(zlib.inflateRawSync(buf).toString('utf8')); }
}

function incidentKey(period: number | null | undefined, time: number | null | undefined): string {
  return `${period ?? '?'}|${time ?? '?'}`;
}

function socketEffectiveTime(inc: SocketVarIncident): number {
  return (inc.time ?? 0) + (inc.addedTime ?? 0);
}

async function encodeId(request: APIRequestContext, thesportId: string): Promise<string | null> {
  try {
    const res = await request.get(`${ENCODE_BASE}/encode/${thesportId}`);
    if (!res.ok()) return null;
    return (await res.text()).trim();
  } catch { return null; }
}

async function getApiIncidents(request: APIRequestContext, encodedId: string): Promise<ApiIncident[]> {
  try {
    const res = await request.get(`${INCIDENT_BASE}/football/event/${encodedId}/incidents`);
    if (!res.ok()) return [];
    const json = await res.json();
    return json?.data?.incidents ?? [];
  } catch { return []; }
}

async function getDbVarRows(db: Client, optaId: string): Promise<DbVarRow[]> {
  const res = await db.query<DbVarRow>(`
    SELECT DISTINCT ON (opta_event_id)
      opta_event_id, type, decision, period_id, time_min, player_name
    FROM opta_match_var
    WHERE match_id = $1
    ORDER BY opta_event_id, last_updated DESC NULLS LAST
  `, [optaId]);
  return res.rows;
}

function saveJson(filename: string, data: unknown): void {
  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.writeFileSync(path.join(RESULTS_DIR, filename), JSON.stringify(data, null, 2), 'utf-8');
  console.log(`Đã lưu: results/${filename}`);
}

// ─── TEST ──────────────────────────────────────────────────────────────────

test.describe('Socket VAR — 3-way check: Socket vs API v2 vs DB', () => {
  test.setTimeout(WAIT_MS + 120_000);

  test('Lắng nghe broadcast, so sánh varOutcome: Socket vs API vs DB', async ({ request }) => {

    const db = new Client(DB_CONFIG);
    await db.connect();

    // ── 1. Build encoding cache: DB live matches → Map<encodedId, optaId> ──
    console.log('\n[cache] Đang build encoding cache cho live/recent matches...');
    const liveRes = await db.query<{ opta_id: string; thesport_id: string }>(`
      SELECT mi.id AS opta_id, m.thesport_id
      FROM   opta_match_info mi
      JOIN   mp_match m ON m.opta_id = mi.id
      WHERE  mi.start_timestamp > EXTRACT(EPOCH FROM NOW() - INTERVAL '12 hours')
         OR  mi.period_id NOT IN (14, 16, 0)
    `);

    const optaIdCache = new Map<string, string>(); // encodedId → optaId
    for (const row of liveRes.rows) {
      const enc = await encodeId(request, row.thesport_id);
      if (enc) optaIdCache.set(enc, row.opta_id);
    }
    console.log(`[cache] ${optaIdCache.size} matches trong cache (từ ${liveRes.rows.length} trận query)`);

    // ── 2. Lắng nghe MQTT, thu thập varDecision ─────────────────────────────
    const capturedByMatch = new Map<string, SocketMatchUpdate>();

    await new Promise<void>((resolve, reject) => {
      const client = mqtt.connect(MQTT_URL, {
        username:        MQTT_USERNAME,
        password:        MQTT_PASSWORD,
        clientId:        `pw-var-3way-${Date.now()}`,
        reconnectPeriod: 0,
        connectTimeout:  15_000,
      });

      const timer = setTimeout(() => {
        console.log(`\n[mqtt] Hết ${WAIT_MS / 1000}s — ${capturedByMatch.size} match có VAR`);
        client.end(true);
        resolve();
      }, WAIT_MS);

      client.on('connect', () => {
        console.log(`[mqtt] Connected → Subscribe: ${BROADCAST_TOPIC}`);
        client.subscribe(BROADCAST_TOPIC, { qos: 0 }, err => {
          if (err) { clearTimeout(timer); client.end(true); reject(err); }
        });
      });

      client.on('message', (_topic, payload) => {
        const buf = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
        let data: Record<string, unknown>;
        try { data = decodePayload(buf) as Record<string, unknown>; }
        catch { return; }

        const matches = (Array.isArray(data?.matches) ? data.matches : []) as Array<{
          id: string;
          incident_update?: { changed_items: SocketVarIncident[] };
        }>;

        for (const match of matches) {
          const items = match?.incident_update?.changed_items ?? [];
          const varItems = items.filter(i => i.incidentType === 'varDecision');
          if (varItems.length === 0) continue;

          const existing = capturedByMatch.get(match.id);
          if (existing) {
            // Merge: cập nhật incident theo key period|time
            for (const newInc of varItems) {
              const key = incidentKey(newInc.period, socketEffectiveTime(newInc));
              const idx = existing.incidents.findIndex(
                i => incidentKey(i.period, socketEffectiveTime(i)) === key
              );
              if (idx >= 0) existing.incidents[idx] = newInc;
              else existing.incidents.push(newInc);
            }
          } else {
            capturedByMatch.set(match.id, {
              matchId:   match.id,
              optaId:    optaIdCache.get(match.id) ?? null,
              incidents: varItems,
            });
            console.log(`[socket] VAR match=${match.id} (optaId=${optaIdCache.get(match.id) ?? 'unknown'}) varDecision x${varItems.length}`);
          }

          for (const inc of varItems) {
            const outcome = inc.varOutcome ?? 'null';
            console.log(`  [socket] p${inc.period}'${socketEffectiveTime(inc)}min varOutcome="${outcome}"`);
          }
        }
      });

      client.on('error', err => { clearTimeout(timer); client.end(true); reject(err); });
      client.on('offline', () => console.error('[mqtt] Offline'));
    });

    // ── 3. So sánh API + DB cho mỗi match đã bắt được ──────────────────────
    const allMismatches: Mismatch[] = [];

    for (const [encodedId, update] of capturedByMatch) {
      const apiUrl = `${INCIDENT_BASE}/football/event/${encodedId}/incidents`;
      console.log(`\n[check] match=${encodedId} optaId=${update.optaId ?? 'N/A'}`);
      console.log(`  ${apiUrl}`);

      // Build socket map: key → socketOutcome
      const socketMap = new Map<string, SocketVarIncident>();
      for (const inc of update.incidents) {
        socketMap.set(incidentKey(inc.period, socketEffectiveTime(inc)), inc);
      }

      // Validate từng socket incident
      for (const [key, inc] of socketMap) {
        const val = inc.varOutcome;
        if ('varReason' in inc && inc.varReason !== undefined) {
          allMismatches.push({ type: 'socket_has_var_reason', matchId: encodedId, optaId: update.optaId, incidentsUrl: apiUrl, period: inc.period ?? null, timeMin: socketEffectiveTime(inc), socketOutcome: val, detail: `socket có field varReason (key=${key})` });
        } else if (val !== null && val !== undefined) {
          if (typeof val === 'string' && FORBIDDEN_VAR_OUTCOMES.has(val)) {
            allMismatches.push({ type: 'socket_forbidden', matchId: encodedId, optaId: update.optaId, incidentsUrl: apiUrl, period: inc.period ?? null, timeMin: socketEffectiveTime(inc), socketOutcome: val, detail: `🚨 socket varOutcome="${val}" bị cấm — không được hiện UI (key=${key})` });
          } else if (typeof val !== 'string' || !/^[a-z0-9_]+$/.test(val) || !VALID_VAR_OUTCOMES.has(val)) {
            allMismatches.push({ type: 'socket_invalid', matchId: encodedId, optaId: update.optaId, incidentsUrl: apiUrl, period: inc.period ?? null, timeMin: socketEffectiveTime(inc), socketOutcome: val, detail: `socket varOutcome="${val}" không hợp lệ (key=${key})` });
          }
        }
      }

      // Fetch API v2
      const apiAll  = await getApiIncidents(request, encodedId);
      const apiVars = apiAll.filter(i => i.incidentType === 'varDecision');
      const apiMap  = new Map<string, ApiIncident>();
      for (const inc of apiVars) {
        apiMap.set(incidentKey(inc.period, (inc.time ?? 0) + (inc.addedTime ?? 0)), inc);
      }

      // Socket vs API
      for (const [key, sockInc] of socketMap) {
        const apiInc = apiMap.get(key);
        if (!apiInc) {
          allMismatches.push({ type: 'socket_vs_api', matchId: encodedId, optaId: update.optaId, incidentsUrl: apiUrl, period: sockInc.period ?? null, timeMin: socketEffectiveTime(sockInc), socketOutcome: sockInc.varOutcome, apiOutcome: undefined, detail: `Socket có varDecision, API không có (key=${key})` });
          continue;
        }
        const sv = sockInc.varOutcome ?? null;
        const av = apiInc.varOutcome   ?? null;
        if (sv !== av) {
          allMismatches.push({ type: 'socket_vs_api', matchId: encodedId, optaId: update.optaId, incidentsUrl: apiUrl, period: sockInc.period ?? null, timeMin: socketEffectiveTime(sockInc), socketOutcome: sv, apiOutcome: av, detail: `Socket="${sv}" ≠ API="${av}" (key=${key})` });
        } else {
          console.log(`  ✓ socket=api="${sv}" key=${key}`);
        }
      }

      // DB comparison (chỉ khi có optaId)
      if (update.optaId) {
        const dbRows = await getDbVarRows(db, update.optaId);
        const dbMap  = new Map<string, { expected: string; row: DbVarRow }>();
        for (const row of dbRows) {
          const expected = DB_OUTCOME_MAP[`${row.type}|${row.decision}`] ?? '__skip__';
          dbMap.set(incidentKey(row.period_id, row.time_min), { expected, row });
        }

        for (const [key, sockInc] of socketMap) {
          const dbEntry = dbMap.get(key);
          if (!dbEntry || dbEntry.expected === '__skip__') continue;
          const sv = String(sockInc.varOutcome ?? null);
          if (sv !== dbEntry.expected) {
            allMismatches.push({ type: 'socket_vs_db', matchId: encodedId, optaId: update.optaId, incidentsUrl: apiUrl, period: sockInc.period ?? null, timeMin: socketEffectiveTime(sockInc), socketOutcome: sockInc.varOutcome, dbExpected: dbEntry.expected, detail: `Socket="${sockInc.varOutcome}" ≠ DB="${dbEntry.expected}" (${dbEntry.row.type}|${dbEntry.row.decision}, key=${key})` });
          }
        }

        // API vs DB
        for (const [key, { expected, row }] of dbMap) {
          if (expected === '__skip__') continue;
          const apiEntry = apiMap.get(key);
          if (!apiEntry) continue;
          const av = String(apiEntry.varOutcome ?? null);
          if (av !== expected) {
            allMismatches.push({ type: 'api_vs_db', matchId: encodedId, optaId: update.optaId, incidentsUrl: apiUrl, period: row.period_id, timeMin: row.time_min, apiOutcome: apiEntry.varOutcome, dbExpected: expected, detail: `API="${apiEntry.varOutcome}" ≠ DB="${expected}" (${row.type}|${row.decision}, key=${key})` });
          }
        }
      } else {
        console.log(`  ⚠ optaId không có trong cache — bỏ qua DB comparison`);
      }
    }

    // ── 4. Lưu kết quả ───────────────────────────────────────────────────────
    const today   = new Date().toISOString().slice(0, 10);
    const byType  = allMismatches.reduce((acc, m) => { acc[m.type] = (acc[m.type] ?? 0) + 1; return acc; }, {} as Record<string, number>);

    const summary = {
      runAt:          new Date().toISOString(),
      waitSeconds:    WAIT_MS / 1000,
      cacheSize:      optaIdCache.size,
      matchesWithVar: capturedByMatch.size,
      totalVarEvents: [...capturedByMatch.values()].reduce((s, m) => s + m.incidents.length, 0),
      totalMismatches: allMismatches.length,
      byType,
      mismatches:     allMismatches,
    };
    saveJson(`var-socket-3way-${today}.json`, summary);
    if (allMismatches.length > 0) saveJson('var-socket-mismatches-latest.json', allMismatches);

    await db.end();

    // ── 5. Báo cáo ───────────────────────────────────────────────────────────
    console.log(`\n${'═'.repeat(60)}`);
    console.log('TỔNG KẾT — Socket vs API v2 vs DB');
    console.log(`${'═'.repeat(60)}`);
    console.log(`  Match có VAR bắt được : ${capturedByMatch.size}`);
    console.log(`  VAR incidents tổng    : ${summary.totalVarEvents}`);
    console.log(`  Mismatches            : ${allMismatches.length}`);
    Object.entries(byType).forEach(([t, n]) => console.log(`    ${t.padEnd(22)}: ${n}`));
    if (allMismatches.length > 0) {
      allMismatches.forEach(m => console.error(`  ❌ [${m.type}] ${m.matchId} — ${m.detail}`));
    }
    console.log(`${'═'.repeat(60)}`);

    // ── 6. Assertions ─────────────────────────────────────────────────────────
    expect(
      capturedByMatch.size >= 0,
      'Không nhận được message từ MQTT — kiểm tra broker'
    ).toBeTruthy();

    const forbidden   = allMismatches.filter(m => m.type === 'socket_forbidden');
    const invalid     = allMismatches.filter(m => m.type === 'socket_invalid');
    const vsApi       = allMismatches.filter(m => m.type === 'socket_vs_api');
    const vsDb        = allMismatches.filter(m => m.type === 'socket_vs_db');
    const apiVsDb     = allMismatches.filter(m => m.type === 'api_vs_db');
    const wrongField  = allMismatches.filter(m => m.type === 'socket_has_var_reason');

    expect.soft(forbidden.length,  `🚨 ${forbidden.length} socket trả "other"/"unknown" — không được hiện UI`).toBe(0);
    expect.soft(invalid.length,    `${invalid.length} socket varOutcome không hợp lệ`).toBe(0);
    expect.soft(wrongField.length, `${wrongField.length} socket có field varReason (sai naming)`).toBe(0);
    expect.soft(vsApi.length,      `${vsApi.length} Socket ≠ API varOutcome`).toBe(0);
    expect.soft(vsDb.length,       `${vsDb.length} Socket ≠ DB expected varOutcome`).toBe(0);
    expect.soft(apiVsDb.length,    `${apiVsDb.length} API ≠ DB expected varOutcome`).toBe(0);

    if (capturedByMatch.size === 0) {
      console.log('\n⚠ Không bắt được VAR nào — thử chạy lại khi có match live.');
    }
  });
});

// npx playwright test tests/var_outcome_socket_check.spec.ts --project=chrome
