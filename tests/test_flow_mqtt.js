/**
 * test_flow_mqtt.js
 *
 * MQTT subscriber — nhận dữ liệu football live từ EMQX, xử lý incidents, ghi log ra file.
 *
 * CHẠY:
 *   node tests/test_flow_mqtt.js
 *   Ctrl+C để dừng.
 *
 * CẤU HÌNH: tạo file .env cạnh script này (xem phần CONFIG bên dưới).
 */

'use strict';

const mqtt   = require('mqtt');
const zlib   = require('node:zlib');
const fs     = require('node:fs');
const path   = require('node:path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '.env') });

// ═══════════════════════════════════════════════════════════════
// CONFIG — đọc từ .env, fallback về giá trị mặc định
// ═══════════════════════════════════════════════════════════════

const CONFIG = {
  // MQTT broker
  mqttUrl:      process.env.MQTT_URL      || 'mqtt://localhost:1883',
  mqttUsername: process.env.MQTT_USERNAME || '',
  mqttPassword: process.env.MQTT_PASSWORD || '',

  // Topics
  broadcastTopic:   process.env.BROADCAST_TOPIC    || 'fb-live-v1',          // tất cả match đang live
  legacyCsvTopic:   process.env.FB_LIVE_TOPIC      || 'fb-live',             // score CSV cũ
  matchTopicPrefix: process.env.MATCH_TOPIC_PREFIX || 'fb-live-v1/match/',
  matchId:          process.env.MATCH_ID           || '',                     // để trống = không sub topic riêng

  // Thư mục output
  logDir:       process.env.LOG_DIR       || path.join(__dirname, 'logs'),
  incidentsDir: process.env.INCIDENTS_DIR || path.join(__dirname, 'logs', 'incidents'),
  scoresDir:    process.env.SCORES_DIR    || path.join(__dirname, 'logs', 'scores'),

  // Log nâng cao (mặc định tắt)
  enableLegacyLogs:  (process.env.ENABLE_LEGACY_LOGS  || '0') === '1', // bật: ghi flow_*.json + multi_*.json
  logFormat:         process.env.LOG_FORMAT            || 'json-array', // 'json-array' | 'ndjson'
  logFullDecoded:    (process.env.LOG_FULL_DECODED_JSON || '0') === '1',
  logRawBase64:      (process.env.LOG_RAW_BASE64       || '0') === '1',
  logRawBase64Limit: Number(process.env.LOG_RAW_BASE64_LIMIT || 4096),
  flushEvery:        Number(process.env.LOG_FLUSH_EVERY_MESSAGES       || 10),
  multiFlushEvery:   Number(process.env.MULTI_LOG_FLUSH_EVERY_MESSAGES || 10),

  // Push về server sau mỗi incident update (tuỳ chọn)
  ingestUrl:    (process.env.INGEST_URL    || '').trim(),
  ingestSecret: (process.env.INGEST_SECRET || '').trim(),
};

// ═══════════════════════════════════════════════════════════════
// KHỞI TẠO THƯ MỤC OUTPUT
// ═══════════════════════════════════════════════════════════════

fs.mkdirSync(CONFIG.logDir,       { recursive: true });
fs.mkdirSync(CONFIG.incidentsDir, { recursive: true });
fs.mkdirSync(CONFIG.scoresDir,    { recursive: true });

// ═══════════════════════════════════════════════════════════════
// STATE — dữ liệu tích lũy trong bộ nhớ
// ═══════════════════════════════════════════════════════════════

const state = {
  incidentsByMatch: new Map(),   // matchId → Incident[]   (mảng incidents hiện tại của mỗi match)
  matchIncidentLogs: new Map(),  // matchId → Event[]      (lịch sử mọi incident_update nhận được)
  matchScoreLogs: new Map(),     // matchId → Event[]      (lịch sử mọi score update nhận được)
  allMessages: [],               // toàn bộ messages (dùng khi ENABLE_LEGACY_LOGS=1)
  multiMessages: [],             // messages có changed_items > 1 (dùng khi ENABLE_LEGACY_LOGS=1)
  receivedCount: 0,
};

// ═══════════════════════════════════════════════════════════════
// DECODE PAYLOAD
// Server nén payload bằng zlib (RFC1950). Thử lần lượt 3 cách.
// ═══════════════════════════════════════════════════════════════

function decodePayload(payload) {
  const buf = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);

  // Thử 1: plain JSON (không nén)
  const rawText = buf.toString('utf8');
  if (/^[{[]/.test(rawText.trim())) {
    return { json: JSON.parse(rawText), method: 'plain-json' };
  }

  // Thử 2: zlib inflate RFC1950 (format chính của server)
  try {
    const text = zlib.inflateSync(buf).toString('utf8');
    return { json: JSON.parse(text), method: 'zlib-rfc1950' };
  } catch (_) {}

  // Thử 3: deflate raw (fallback)
  const text = zlib.inflateRawSync(buf).toString('utf8');
  return { json: JSON.parse(text), method: 'deflate-raw' };
}

// ═══════════════════════════════════════════════════════════════
// PARSE SCORE
// Server gửi score dưới 2 format tuỳ topic.
// ═══════════════════════════════════════════════════════════════

/**
 * Parse mảng score JSON:
 * [id, statusCode, home[7], away[7], kickoffTs, note]
 * home/away[7] = [score, halftime, red, yellow, corner, overtime, penalty]
 */
function parseScoreJson(raw) {
  if (!Array.isArray(raw)) return null;
  const parseSide = (arr) => {
    const a = Array.isArray(arr) ? arr : [];
    return { score: a[0], halftime: a[1], red: a[2], yellow: a[3], corner: a[4], overtime: a[5], penalty: a[6] };
  };
  return {
    matchId:    raw[0],
    statusCode: raw[1],
    home:       parseSide(raw[2]),
    away:       parseSide(raw[3]),
    kickoffTs:  raw[4],
    note:       raw[5],
  };
}

/**
 * Parse score CSV từ topic fb-live (legacy):
 * matchId,status,h0..h6,a0..a6,kickoffTs,note,liveCount
 */
function parseScoreCsv(text) {
  if (typeof text !== 'string' || !text.trim()) return null;
  const p = text.trim().split(',');
  if (p.length < 19) return null;
  const n = (s) => { const v = Number(s); return Number.isFinite(v) ? v : s; };
  const parseSide = (arr) => ({ score: arr[0], halftime: arr[1], red: arr[2], yellow: arr[3], corner: arr[4], overtime: arr[5], penalty: arr[6] });
  return {
    matchId:    p[0],
    statusCode: n(p[1]),
    home:       parseSide([p[2], p[3], p[4], p[5], p[6], p[7], p[8]].map(n)),
    away:       parseSide([p[9], p[10], p[11], p[12], p[13], p[14], p[15]].map(n)),
    kickoffTs:  n(p[16]),
    note:       p[17],
    liveCount:  n(p[18]),
  };
}

// ═══════════════════════════════════════════════════════════════
// INCIDENT UPDATE
// Server gửi: { start_index, changed_items }
// Client áp dụng: incidents.splice(start_index, Infinity, ...changed_items)
//
// Ví dụ:
//   start_index=0, changed=[A,B,C] → xóa hết, thay bằng [A,B,C]
//   start_index=5, changed=[F,G]   → giữ [0..4], xóa từ 5, thêm [F,G]
// ═══════════════════════════════════════════════════════════════

function applyIncidentUpdate(prevIncidents, startIndex, changedItems) {
  const incidents = Array.isArray(prevIncidents) ? prevIncidents.slice() : [];
  const changed   = Array.isArray(changedItems) ? changedItems : [];
  let si          = Math.max(0, Math.trunc(Number(startIndex) || 0));

  // Kiểm tra server gửi đủ tail chưa.
  // Nếu start_index ở giữa mảng, changed_items phải bao gồm toàn bộ phần đuôi
  // từ start_index trở đi — nếu không, splice sẽ xóa mất dữ liệu.
  const errors = [];
  const tailLen = si < incidents.length ? incidents.length - si : 0;
  if (tailLen > 0 && changed.length < tailLen) {
    errors.push({
      code:    'ERR_MISSING_TAIL',
      message: `Server gửi start_index=${si} nhưng changed_items chỉ có ${changed.length} phần tử, cần ít nhất ${tailLen} — client sẽ mất dữ liệu`,
    });
  }

  incidents.splice(si, Infinity, ...changed);
  return { nextIncidents: incidents, errors };
}

// ═══════════════════════════════════════════════════════════════
// GHI FILE
// ═══════════════════════════════════════════════════════════════

function writeJson(filePath, data) {
  try { fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8'); } catch (_) {}
}

// Ghi lịch sử incidents của 1 match ra file (ghi đè toàn bộ mỗi lần)
function flushIncidentLog(matchId) {
  const events = state.matchIncidentLogs.get(matchId) || [];
  writeJson(path.join(CONFIG.incidentsDir, `${matchId}.json`), {
    matchId,
    generatedAt:  new Date().toISOString(),
    messageCount: events.length,
    events,
  });
}

// Ghi lịch sử score của 1 match ra file
function flushScoreLog(matchId) {
  const events = state.matchScoreLogs.get(matchId) || [];
  writeJson(path.join(CONFIG.scoresDir, `${matchId}.json`), {
    matchId,
    generatedAt:  new Date().toISOString(),
    messageCount: events.length,
    events,
  });
}

// Ghi toàn bộ messages (flow log) — chỉ dùng khi ENABLE_LEGACY_LOGS=1
const flowLogFile  = CONFIG.logDir + `/flow_${Date.now()}.json`;
const multiLogFile = CONFIG.logDir + `/multi_${Date.now()}.json`;
let lastFlushAll   = 0;
let lastFlushMulti = 0;

function flushAllMessages() {
  writeJson(flowLogFile, { generatedAt: new Date().toISOString(), messageCount: state.allMessages.length, messages: state.allMessages });
  lastFlushAll = state.allMessages.length;
}

function flushMultiMessages() {
  writeJson(multiLogFile, { generatedAt: new Date().toISOString(), messageCount: state.multiMessages.length, messages: state.multiMessages });
  lastFlushMulti = state.multiMessages.length;
}

// ═══════════════════════════════════════════════════════════════
// PUSH VỀ SERVER (tuỳ chọn)
// Nếu INGEST_URL được set → POST dữ liệu incidents lên server sau mỗi update
// ═══════════════════════════════════════════════════════════════

function pushToIngestServer(matchId) {
  if (!CONFIG.ingestUrl) return;
  const events  = state.matchIncidentLogs.get(matchId) || [];
  const headers = { 'Content-Type': 'application/json' };
  if (CONFIG.ingestSecret) headers['x-ingest-secret'] = CONFIG.ingestSecret;
  fetch(CONFIG.ingestUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ matchId, generatedAt: new Date().toISOString(), messageCount: events.length, events }),
  }).catch(() => {});
}

// ═══════════════════════════════════════════════════════════════
// XỬ LÝ MESSAGE
// ═══════════════════════════════════════════════════════════════

function handleScoreCsvMessage(topic, payload) {
  const text   = Buffer.isBuffer(payload) ? payload.toString('utf8') : String(payload);
  const parsed = parseScoreCsv(text);
  if (!parsed) { console.error('[fb-live] parse CSV thất bại:', text.slice(0, 80)); return; }

  const { matchId, statusCode, home, away, kickoffTs, liveCount } = parsed;
  const event = { ts: new Date().toISOString(), topic, raw_csv: text, score: parsed, liveCount };

  const existing = state.matchScoreLogs.get(matchId) || [];
  existing.push(event);
  state.matchScoreLogs.set(matchId, existing);
  flushScoreLog(matchId);

  console.log(`[score-csv] match=${matchId} status=${statusCode} home=${home.score} away=${away.score} kickoff=${kickoffTs} live=${liveCount}`);
}

function handleJsonMessage(topic, payload) {
  const buf = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);

  let decoded, inflateMethod;
  try {
    ({ json: decoded, method: inflateMethod } = decodePayload(buf));
  } catch (e) {
    console.error(`[mqtt] decode thất bại topic=${topic}:`, e.message);
    return;
  }

  const matches = Array.isArray(decoded?.matches) ? decoded.matches : [];
  if (matches.length === 0) return;

  // 1. Xử lý score của từng match trong message
  for (const m of matches) {
    if (!m?.id || !m?.score) continue;
    const score = parseScoreJson(m.score);
    if (!score) continue;

    const event = { ts: new Date().toISOString(), topic, source: m.source, liveCount: decoded['live-count'], score };
    const existing = state.matchScoreLogs.get(m.id) || [];
    existing.push(event);
    state.matchScoreLogs.set(m.id, existing);
    flushScoreLog(m.id);

    console.log(`[score] match=${m.id} status=${score.statusCode} home=${score.home.score} away=${score.away.score} source=${m.source || ''}`);
  }

  // 2. Xử lý incident_update của từng match trong message
  for (const m of matches) {
    const upd = m?.incident_update;
    if (!m?.id || !upd) continue;

    const prev              = state.incidentsByMatch.get(m.id) || [];
    const { nextIncidents, errors } = applyIncidentUpdate(prev, upd.start_index, upd.changed_items);
    state.incidentsByMatch.set(m.id, nextIncidents);

    const changed      = Array.isArray(upd.changed_items) ? upd.changed_items : [];
    const lastIncident = nextIncidents.at(-1);
    const hasGoal      = changed.some(i => i?.incidentType === 'goal');

    // Log lỗi nếu server gửi thiếu tail
    if (errors.length) {
      console.error(`[incident_update] ERR match=${m.id} start=${upd.start_index} changed=${changed.length} →`, errors[0].message);
    }

    console.log(
      `[incident_update] match=${m.id}`,
      `start=${upd.start_index}`,
      `changed=${changed.length}`,
      `total=${nextIncidents.length}`,
      lastIncident ? `last=${lastIncident.incidentType}` : '',
      hasGoal ? '⚽ GOAL' : '',
      errors.length ? `⚠ errors=${errors.length}` : '',
    );

    // Ghi vào log theo match
    const logEntry = {
      ts:    new Date().toISOString(),
      topic,
      ...(hasGoal   ? { goal_simulation: true } : {}),
      ...(errors.length ? { errors } : {}),
      incident_update: { start_index: upd.start_index, source: upd.source, changed_items: changed },
    };
    const existing = state.matchIncidentLogs.get(m.id) || [];
    existing.push(logEntry);
    state.matchIncidentLogs.set(m.id, existing);
    flushIncidentLog(m.id);
    pushToIngestServer(m.id);
  }

  // 3. Legacy logs (chỉ khi ENABLE_LEGACY_LOGS=1)
  if (!CONFIG.enableLegacyLogs) return;

  const entry = {
    ts:            new Date().toISOString(),
    received:      state.receivedCount,
    topic,
    payloadBytes:  buf.length,
    inflateMethod,
    liveCount:     decoded['live-count'],
    matches: matches.map(m => ({
      id: m?.id,
      incident_update: {
        start_index:         m?.incident_update?.start_index,
        source:              m?.incident_update?.source,
        changed_items_count: Array.isArray(m?.incident_update?.changed_items) ? m.incident_update.changed_items.length : 0,
        changed_items:       m?.incident_update?.changed_items,
      },
    })),
    ...(CONFIG.logFullDecoded  ? { decoded } : {}),
    ...(CONFIG.logRawBase64 && buf.length ? { rawBase64_prefix: buf.slice(0, CONFIG.logRawBase64Limit).toString('base64') } : {}),
  };

  state.allMessages.push(entry);
  if (state.allMessages.length - lastFlushAll >= CONFIG.flushEvery) flushAllMessages();

  // Multi-log: chỉ lưu messages có changed_items > 1
  const hasMulti = matches.some(m => Array.isArray(m?.incident_update?.changed_items) && m.incident_update.changed_items.length > 1);
  if (hasMulti) {
    state.multiMessages.push(entry);
    if (state.multiMessages.length - lastFlushMulti >= CONFIG.multiFlushEvery) flushMultiMessages();
  }
}

// ═══════════════════════════════════════════════════════════════
// MQTT CONNECTION
// ═══════════════════════════════════════════════════════════════

const topics = [CONFIG.broadcastTopic, CONFIG.legacyCsvTopic];
if (CONFIG.matchId) topics.push(`${CONFIG.matchTopicPrefix}${CONFIG.matchId}`);

const client = mqtt.connect(CONFIG.mqttUrl, {
  clientId:        `flow-mqtt-${Date.now()}`,
  username:        CONFIG.mqttUsername || undefined,
  password:        CONFIG.mqttPassword || undefined,
  reconnectPeriod: 1000,
});

console.log(`\nKết nối MQTT: ${CONFIG.mqttUrl}`);
console.log(`Topics: ${topics.join(', ')}`);
if (CONFIG.matchId) console.log(`Match cụ thể: ${CONFIG.matchId}`);
console.log('Ctrl+C để dừng.\n');

client.on('connect', () => {
  console.log('[mqtt] Kết nối thành công');
  client.subscribe(topics, { qos: 0 }, (err) => {
    if (err) console.error('[mqtt] Subscribe thất bại:', err.message);
    else     console.log('[mqtt] Đã subscribe xong');
  });
});

client.on('message', (topic, payload) => {
  state.receivedCount++;
  if (topic === CONFIG.legacyCsvTopic) {
    handleScoreCsvMessage(topic, payload);
  } else {
    handleJsonMessage(topic, payload);
  }
});

client.on('offline',   () => console.error('[mqtt] Offline — mất kết nối'));
client.on('reconnect', () => console.log('[mqtt] Đang reconnect...'));
client.on('error',     (err) => console.error('[mqtt] Lỗi:', err.message));

// ═══════════════════════════════════════════════════════════════
// CLEANUP khi Ctrl+C
// ═══════════════════════════════════════════════════════════════

process.on('SIGINT', () => {
  console.log(`\nDừng — đã nhận ${state.receivedCount} messages`);
  if (CONFIG.enableLegacyLogs) {
    flushAllMessages();
    flushMultiMessages();
    console.log(`Đã lưu: ${flowLogFile}`);
    console.log(`Đã lưu: ${multiLogFile}`);
  }
  client.end(true);
  process.exit(0);
});
