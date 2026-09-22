/**
 * TEST FILE: check_socket.spec.ts
 *
 * MỤC ĐÍCH: Kết nối MQTT broker, subscribe topic match cụ thể,
 *   nhận payload zlib → decode JSON → validate incident ordering.
 *54cvbml3lp6qvp4 ----- id var
 * CHẠY:
 *   npx playwright test tests/check_socket.spec.ts --project=chrome
 */

import { test, expect } from '@playwright/test';
import * as zlib from 'zlib';
import * as fs   from 'fs';
import * as path from 'path';
import * as mqtt from 'mqtt';

// ─── CẤU HÌNH ──────────────────────────────────────────────────────────────

const MQTT_URL      =  process.env.MQTT_HOST ? `mqtt://${process.env.MQTT_HOST}` : '';
const MQTT_USERNAME = 'football';
const MQTT_PASSWORD   = process.env.MQTT_PASSWORD || 'football';
const MATCH_ID        = '623z28leo3gpvx5';
const MATCH_TOPIC     = `fb-live-v1/match/${MATCH_ID}`;
const BROADCAST_TOPIC = 'fb-live-v1';   // broadcast tất cả match đang live

const WAIT_MS       = 60_000;    // chờ tối đa 1 phút
const RESULTS_DIR   = path.join(__dirname, '..', 'results');

// ─── KIỂU DỮ LIỆU ──────────────────────────────────────────────────────────

interface Incident {
  incidentType: string;
  period:       number;
  time:         number;
  timeSec:      number;
  addedTime?:   number;
  length?:      number;
}

interface IncidentUpdate {
  start_index:   number;
  source?:       string;
  changed_items: Incident[];
}

interface MatchPayload {
  id:               string;
  incident_update?: IncidentUpdate;
  score?:           unknown;
}

interface DecodedMessage {
  ts:           string;
  topic:        string;
  payloadBytes: number;
  inflateMethod:string;
  liveCount?:   number;
  matches:      MatchPayload[];
  decoded?:     unknown;
}

// ─── HELPER ────────────────────────────────────────────────────────────────

function decodePayload(buf: Buffer): { json: unknown; inflateMethod: string } {
  const text = buf.toString('utf8');
  if (/^[{[]/.test(text.trim())) {
    return { json: JSON.parse(text), inflateMethod: 'plain-json' };
  }
  try {
    const out = zlib.inflateSync(buf).toString('utf8');
    return { json: JSON.parse(out), inflateMethod: 'zlib-inflate-rfc1950' };
  } catch {
    const out = zlib.inflateRawSync(buf).toString('utf8');
    return { json: JSON.parse(out), inflateMethod: 'deflate-raw' };
  }
}

function applyUpdate(prev: Incident[], startIndex: number, changed: Incident[]): Incident[] {
  const next = prev.slice();
  const si   = Math.max(0, Math.trunc(Number(startIndex) || 0));
  next.splice(si, Infinity, ...changed);
  return next;
}

function saveJson(filename: string, data: unknown): void {
  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.writeFileSync(path.join(RESULTS_DIR, filename), JSON.stringify(data, null, 2), 'utf-8');
  console.log(`Đã lưu: results/${filename}`);
}

const PERIOD_LABEL: Record<number, string> = {
  1: 'hiệp 1', 2: 'hiệp 2', 3: 'hiệp phụ 1', 4: 'hiệp phụ 2',
};

function checkIncidentOrder(incidents: Incident[]): string[] {
  const bugs: string[] = [];
  for (const p of [1, 2, 3, 4]) {
    const inPeriod   = incidents.filter(i => i.period === p);
    const injuryTime = inPeriod.find(i => i.incidentType === 'injuryTime');
    if (!injuryTime) continue;
    const addedEvts  = inPeriod.filter(i => i.addedTime && i.addedTime > 0);
    for (const evt of addedEvts) {
      if (evt.timeSec < injuryTime.timeSec) {
        bugs.push(
          `[${PERIOD_LABEL[p] ?? `period ${p}`}] ${evt.incidentType} ` +
          `@ ${evt.time}+${evt.addedTime}' (timeSec=${evt.timeSec}) ` +
          `< injuryTime.timeSec=${injuryTime.timeSec} [length=${injuryTime.length}min]`
        );
      }
    }
  }
  return bugs;
}

// ─── TEST ──────────────────────────────────────────────────────────────────

test.describe('MQTT — fb-live-v1 incidents check', () => {
  test.setTimeout(WAIT_MS + 30_000);

  test(`Subscribe ${MATCH_TOPIC} và validate incidents`, async () => {
    const messages: DecodedMessage[] = [];
    let   incidents: Incident[]      = [];
    const bugs: string[]             = [];

    console.log(`\nKết nối MQTT: ${MQTT_URL}`);
    console.log(`Subscribe: ${MATCH_TOPIC}`);
    console.log(`Chờ tối đa ${WAIT_MS / 1000}s...\n`);

    await new Promise<void>((resolve, reject) => {
      const client = mqtt.connect(MQTT_URL, {
        username:        MQTT_USERNAME,
        password:        MQTT_PASSWORD,
        clientId:        `playwright-check-${Date.now()}`,
        reconnectPeriod: 0,
        connectTimeout:  15_000,
      });

      const timer = setTimeout(() => {
        console.log(`\nHết ${WAIT_MS / 1000}s — tổng ${messages.length} messages nhận được`);
        client.end(true);
        resolve();
      }, WAIT_MS);

      client.on('connect', () => {
        console.log('[mqtt] Connected OK');
        const topicsToSub = [MATCH_TOPIC, BROADCAST_TOPIC];
        client.subscribe(topicsToSub, { qos: 0 }, (err) => {
          if (err) {
            clearTimeout(timer);
            client.end(true);
            reject(new Error(`Subscribe failed: ${err.message}`));
          } else {
            console.log(`[mqtt] Subscribed: ${topicsToSub.join(', ')}`);
          }
        });
      });

      client.on('message', (topic, payload) => {
        const buf = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
        let decoded: { json: unknown; inflateMethod: string };

        try {
          decoded = decodePayload(buf);
        } catch (e) {
          console.error(`[mqtt] Decode failed: ${(e as Error).message}`);
          return;
        }

        const data    = decoded.json as Record<string, unknown>;
        const matches = (Array.isArray(data?.matches) ? data.matches : []) as MatchPayload[];

        const entry: DecodedMessage = {
          ts:            new Date().toISOString(),
          topic,
          payloadBytes:  buf.length,
          inflateMethod: decoded.inflateMethod,
          liveCount:     data?.['live-count'] as number | undefined,
          matches,
          decoded:       data,  // LOG_FULL_DECODED_JSON=1
        };
        messages.push(entry);

        // Xử lý incident_update
        for (const m of matches) {
          const upd = m?.incident_update;
          if (!upd || m.id !== MATCH_ID) continue;

          const changed = Array.isArray(upd.changed_items) ? upd.changed_items : [];
          incidents     = applyUpdate(incidents, upd.start_index, changed);

          const newBugs = checkIncidentOrder(incidents);
          bugs.push(...newBugs);

          console.log(
            `[incident_update] start_index=${upd.start_index}`,
            `changed=${changed.length}`,
            `total=${incidents.length}`,
            `last=${incidents.at(-1)?.incidentType ?? '-'}`,
            newBugs.length ? `BUGS: ${newBugs.length}` : 'OK'
          );

          newBugs.forEach(b => console.error(`  ❌ ${b}`));
        }
      });

      client.on('error', (err) => {
        console.error('[mqtt] Error:', err.message);
        clearTimeout(timer);
        client.end(true);
        reject(err);
      });

      client.on('offline', () => console.error('[mqtt] Offline'));
      client.on('close',   () => console.log('[mqtt] Connection closed'));
    });

    // ── Lưu kết quả ────────────────────────────────────────────────────────
    const summary = {
      match:       MATCH_ID,
      topic:       MATCH_TOPIC,
      broker:      MQTT_URL,
      waitSeconds: WAIT_MS / 1000,
      messagesReceived: messages.length,
      finalIncidentCount: incidents.length,
      bugsFound:   bugs.length,
      bugs,
      runAt:       new Date().toISOString(),
    };

    saveJson(`socket-${MATCH_ID}.json`,          { summary, messages });
    saveJson(`socket-${MATCH_ID}-incidents.json`, incidents);

    // ── Báo cáo ─────────────────────────────────────────────────────────────
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`TỔNG KẾT — ${MATCH_TOPIC}`);
    console.log(`${'═'.repeat(60)}`);
    console.log(`  Messages nhận được : ${messages.length}`);
    console.log(`  Incidents hiện tại : ${incidents.length}`);
    console.log(`  Bugs phát hiện     : ${bugs.length}`);
    if (bugs.length) bugs.forEach(b => console.error(`  ❌ ${b}`));
    console.log(`${'═'.repeat(60)}`);

    // FAIL nếu 0 messages: match không live, sai topic, hoặc broker từ chối kết nối.
    // Kiểm tra: match có đang diễn ra không? MATCH_ID có đúng không?
    // Broadcast fb-live-v1 vẫn trống → broker hoặc credentials sai.
    expect(messages.length, 'Không nhận được message nào từ MQTT — kiểm tra broker/topic').toBeGreaterThan(0);

    // SOFT FAIL: test vẫn chạy tiếp dù có bug, kết quả in ra cuối cùng.
    expect.soft(bugs.length, `${bugs.length} bugs addedTime/injuryTime ordering`).toBe(0);
  });
});

// npx playwright test tests/check_socket.spec.ts --project=chrome
