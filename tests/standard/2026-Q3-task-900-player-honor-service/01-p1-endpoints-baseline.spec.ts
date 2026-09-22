/**
 * US-900 — [GoLang] Teams/Players/Coach Domain, nhánh Player + Honor.
 * Migrate 22 endpoint player-entity từ opta-api (NestJS) sang api-football-players (Go).
 * (Task tracking gốc: US-2433 / parent epic — đổi số hiển thị thành US-900 theo yêu cầu.)
 *
 * File này verify baseline NestJS HIỆN TẠI cho nhóm P1 (11 endpoint traffic
 * cao nhất, 4k-20k req/24h) — dùng làm baseline đối chiếu khi Go bắt đầu tiếp
 * nhận traffic. Go service CHƯA có host công khai tại thời điểm viết (giống
 * tình trạng Go odds ở US-898) nên KHÔNG so sánh Go vs NestJS ở file này.
 *
 * Mẫu cố định: Corentin Tolisso (q69zrnleeejrah5) — đã verify nhiều lần trong
 * task Player xG (PXG-18): opta_id=al6dgtinz0ki8uj8wrvc7fg2c, thesport
 * team_id=8y39mp1hg8lmojx (Lyon), Ligue 1 (bm0nxitovzu9p9u), mùa 2025-2026
 * (season_id=2es0s3ko448ntnv, 30 trận thật theo seasonal_statistics_players).
 *
 * 3 endpoint blocked bởi schema gap theo doc (player_honor, transfers còn là
 * stub table) — vẫn viết test để BIẾT rõ trạng thái hiện tại (route chưa tồn
 * tại/501, hay đã trả data thật rồi), không bỏ qua.
 *
 * CHẠY:
 *   npx playwright test tests/standard/2026-Q3-task-900-player-honor-service/01-p1-endpoints-baseline.spec.ts --project=chrome
 */

import { test, expect } from '@playwright/test';
import { PLAYER_BASE, SAMPLE_PLAYER_ID, SAMPLE_TOURNAMENT_ID, SAMPLE_SEASON_ID, getJson } from './lib/player-client';

const BASE = PLAYER_BASE.staging;
const PID = SAMPLE_PLAYER_ID;

test.describe('[US-900] P1 — 11 endpoint traffic cao nhất (baseline NestJS hiện tại)', () => {
  test('#1 (15,901 req/24h) GET /player/:id/transfer-history — US-3384, schema "transfers" còn stub theo doc', async ({ request }) => {
    const { status, body } = await getJson(request, BASE, `/player/${PID}/transfer-history?language=en`);
    expect(status).toBe(200);
    expect(body).toHaveProperty('code');
    expect(body).toHaveProperty('data');
    console.log(`  transfer-history code=${body.code}, data type=${Array.isArray(body.data) ? 'array' : typeof body.data}`);
  });

  test('#2 (15,583 req/24h) GET /player/:player_id/summary — US-3385', async ({ request }) => {
    const { status, body } = await getJson(request, BASE, `/player/${PID}/summary?language=en`);
    expect(status).toBe(200);
    expect(body).toHaveProperty('data');
    console.log(`  summary keys: ${Object.keys(body.data ?? {}).join(', ')}`);
  });

  test('#3 (9,370 req/24h) GET /player/:ref_id/characteristics — US-3386', async ({ request }) => {
    const { status, body } = await getJson(request, BASE, `/player/${PID}/characteristics?language=en`);
    expect(status).toBe(200);
    expect(body).toHaveProperty('data');
  });

  test('#4 (9,272 req/24h) GET /player/:player_id/honors — US-3388, schema "player_honor" còn stub theo doc (blocks 25,816 req/24h tổng)', async ({ request }) => {
    const { status, body } = await getJson(request, BASE, `/player/${PID}/honors?language=en`);
    expect(status).toBe(200);
    expect(body).toHaveProperty('data');
    console.log(`  honors code=${body.code}, data=${JSON.stringify(body.data).slice(0, 200)}`);
  });

  test('#5 (9,268 req/24h) GET /player/:player_id/national/statistics — US-3387', async ({ request }) => {
    const { status, body } = await getJson(request, BASE, `/player/${PID}/national/statistics?language=en`);
    expect(status).toBe(200);
    expect(body).toHaveProperty('data');
  });

  test('#6 (8,282 req/24h) GET /player/:player_id/team-honors — US-3389, có HEAD CheckTab twin cùng path (thiếu HEAD = tab im lặng biến mất)', async ({ request }) => {
    const { status, body } = await getJson(request, BASE, `/player/${PID}/team-honors?language=en`);
    expect(status).toBe(200);
    expect(body).toHaveProperty('data');
    const head = await request.head(`${BASE}/player/${PID}/team-honors?language=en`);
    console.log(`  GET status=${status} (code=${body.code}), HEAD status=${head.status()}`);
    // Quy tắc HEAD CheckTab (verify chéo với case individual-awards ở #7):
    // GET có data -> HEAD 200 (hiện tab); GET rỗng -> HEAD 204 (ẩn tab lặng lẽ).
    if (body.data === null || body.code === 2) {
      expect(head.status(), 'GET rỗng thì HEAD phải là 204').toBe(204);
    } else {
      expect(head.status(), 'GET có data thì HEAD phải là 200').toBe(200);
    }
  });

  test('#7 (8,262 req/24h) GET /player/:player_id/individual-awards — US-3390, có HEAD CheckTab twin', async ({ request }) => {
    const { status, body } = await getJson(request, BASE, `/player/${PID}/individual-awards?language=en`);
    expect(status).toBe(200);
    expect(body).toHaveProperty('data');
    const head = await request.head(`${BASE}/player/${PID}/individual-awards?language=en`);
    // Đã verify: mẫu Tolisso KHÔNG có individual award nào (body.data=null,
    // code=2) — HEAD trả 204 trong trường hợp này là ĐÚNG/nhất quán với GET
    // rỗng, không phải bug (khác 4/5 endpoint HEAD CheckTab khác đều 200 vì
    // Tolisso CÓ data ở team-honors/team-career/national-team-career/summary-career).
    // Khi Go port lại, phải giữ đúng quy tắc: HEAD=200 khi GET có data,
    // HEAD=204 khi GET rỗng — KHÔNG hard-code 200 cho mọi trường hợp.
    console.log(`  GET status=${status} (code=${body.code}, data=${JSON.stringify(body.data)}), HEAD status=${head.status()}`);
    if (body.data === null || body.code === 2) {
      expect(head.status(), 'GET rỗng (data=null) thì HEAD phải là 204, không phải 200').toBe(204);
    } else {
      expect(head.status(), 'GET có data thì HEAD phải là 200').toBe(200);
    }
  });

  test('#8 (8,178 req/24h) GET /player/:player_id/injury (PARTIAL) — US-3391', async ({ request }) => {
    const { status, body } = await getJson(request, BASE, `/player/${PID}/injury?language=en`);
    expect(status).toBe(200);
    expect(body).toHaveProperty('data');
  });

  test('#9 (8,158 req/24h) GET /player/:ref_id/attribute-overviews — US-3392, dùng để verify radar chart FE (task-3574 đã dùng endpoint này)', async ({ request }) => {
    const { status, body } = await getJson(request, BASE, `/player/${PID}/attribute-overviews?language=en`);
    expect(status).toBe(200);
    expect(body.data).toHaveProperty('playerAttributeOverviews');
    expect(body.data).toHaveProperty('averageAttributeOverviews');
  });

  test('#10 (5,423 req/24h — Beyla wildcard bucket, đọc nhầm thành 0 nếu xem theo route) GET /player/:player_id/unique-tournament/:c/season/:s/statistics/overall-v2 — NEEDS SUB-TASK, schema "seasonal_statistics_players" còn stub', async ({ request }) => {
    const { status, body } = await getJson(request, BASE, `/player/${PID}/unique-tournament/${SAMPLE_TOURNAMENT_ID}/season/${SAMPLE_SEASON_ID}/statistics/overall-v2?language=en`);
    expect(status).toBe(200);
    expect(body.data).toHaveProperty('statistics');
    // Đối chiếu với số liệu đã verify chắc chắn ở task Player xG (US-898/PXG-18):
    // Tolisso Lyon Ligue 1 2025-2026 có đúng 30 trận theo seasonal_statistics_players.
    expect(body.data.statistics.matches, 'matches phải khớp 30 trận thật đã verify qua DB ở task PXG-18').toBe(30);
  });

  test('#11 (4,602 req/24h) GET /player/:player_id/competition/:c/season/:s/stats/page/:page — US-3393 (đây là nơi sống của US-3393 gốc)', async ({ request }) => {
    const { status, body } = await getJson(request, BASE, `/player/${PID}/competition/${SAMPLE_TOURNAMENT_ID}/season/${SAMPLE_SEASON_ID}/stats/page/1?language=en`);
    expect(status).toBe(200);
    expect(body).toHaveProperty('data');
    console.log(`  stats/page code=${body.code}, data keys=${Object.keys(body.data ?? {}).join(', ')}`);
  });
});

test.describe('[US-900] 2 endpoint đã port Go, cutover ingress còn PENDING (traffic 57,052 req/24h vẫn 100% qua NestJS)', () => {
  test('GET /player/:ref_id — 34,739 req/24h, findOnePlayer', async ({ request }) => {
    const { status, body } = await getJson(request, BASE, `/player/${PID}?language=en`);
    expect(status).toBe(200);
    expect(body.data).toHaveProperty('player');
    expect(body.data.player.id).toBe(PID);
  });

  test('GET /player/:ref_id/events/last/:page — 22,313 req/24h, findPlayerLastEvents', async ({ request }) => {
    const { status, body } = await getJson(request, BASE, `/player/${PID}/events/last/1?language=en`);
    expect(status).toBe(200);
    expect(body).toHaveProperty('data');
  });
});
