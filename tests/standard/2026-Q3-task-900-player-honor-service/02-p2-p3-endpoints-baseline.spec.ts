/**
 * US-900 — [GoLang] Teams/Players/Coach Domain, nhánh Player + Honor.
 * (Task tracking gốc: US-2433.)
 *
 * File này verify baseline NestJS cho nhóm P2 (2 endpoint, 700-1.2k req/24h)
 * và P3 (4 endpoint, <700 req/24h) + 3 HEAD CheckTab còn lại (team-career,
 * national-team-career, summary-career) chưa cover ở file 01.
 *
 * Mẫu cố định: Corentin Tolisso (q69zrnleeejrah5) — xem chi tiết ở file 01.
 *
 * CHẠY:
 *   npx playwright test tests/standard/2026-Q3-task-900-player-honor-service/02-p2-p3-endpoints-baseline.spec.ts --project=chrome
 */

import { test, expect } from '@playwright/test';
import { PLAYER_BASE, SAMPLE_PLAYER_ID, SAMPLE_TOURNAMENT_ID, SAMPLE_SEASON_ID, getJson } from './lib/player-client';

const BASE = PLAYER_BASE.staging;
const PID = SAMPLE_PLAYER_ID;

test.describe('[US-900] P2 — 2 endpoint (700-1.2k req/24h)', () => {
  test('#12 (938 req/24h) GET /player/transfer-market/period/:period/sort/:sort/page/:page — US-3394', async ({ request }) => {
    const { status, body } = await getJson(request, BASE, `/player/transfer-market/period/all/sort/date/page/1?language=en`);
    expect(status).toBe(200);
    expect(body).toHaveProperty('data');
    console.log(`  transfer-market code=${body.code}, data keys=${Object.keys(body.data ?? {}).join(', ')}`);
  });

  test('#13 (796 req/24h) GET /player/:ref_id/statistics/seasons — US-3395, schema "seasonal_statistics_players" còn stub theo doc, có alias legacy (22/24h)', async ({ request }) => {
    const { status, body } = await getJson(request, BASE, `/player/${PID}/statistics/seasons?language=en`);
    expect(status).toBe(200);
    expect(body).toHaveProperty('data');
    console.log(`  statistics/seasons code=${body.code}, data=${JSON.stringify(body.data).slice(0, 200)}`);
  });
});

test.describe('[US-900] P3 — 4 endpoint (<700 req/24h)', () => {
  test('#14 (363 req/24h) GET /player/:player_id/unique-tournament/:c/season/:s/statistics/overall — NEEDS SUB-TASK, camelCase (KHÁC #10 overall-v2 dùng snake_case, cùng data)', async ({ request }) => {
    const { status, body } = await getJson(request, BASE, `/player/${PID}/unique-tournament/${SAMPLE_TOURNAMENT_ID}/season/${SAMPLE_SEASON_ID}/statistics/overall?language=en`);
    expect(status).toBe(200);
    expect(body.data).toHaveProperty('statistics');
    const stats = body.data.statistics;
    // Đã verify (2026-08-27): overall (non-v2) trả camelCase (playerId,
    // minutesPlayed, redCards...), overall-v2 trả snake_case (player_id,
    // minutes_played, red_cards...) — CÙNG data thật (matches=30 cả 2 bên),
    // chỉ khác convention đặt tên field. Đây là lý do tồn tại song song 2
    // endpoint (handler tên "findPlayerSeasonalStats" vs "...SnakeCase").
    expect(stats).toHaveProperty('playerId');
    expect(stats).not.toHaveProperty('player_id');
    expect(stats.matches, 'matches phải khớp 30 trận thật, giống hệt overall-v2 (chỉ khác field naming convention)').toBe(30);
  });

  test('#15 (89 req/24h) GET/HEAD /player/:player_id/summary-career — US-3398', async ({ request }) => {
    const { status, body } = await getJson(request, BASE, `/player/${PID}/summary-career?language=en`);
    expect(status).toBe(200);
    expect(body).toHaveProperty('data');
    const head = await request.head(`${BASE}/player/${PID}/summary-career?language=en`);
    console.log(`  GET status=${status} (code=${body.code}), HEAD status=${head.status()}`);
    if (body.data === null || body.code === 2) {
      expect(head.status(), 'GET rỗng thì HEAD phải là 204').toBe(204);
    } else {
      expect(head.status(), 'GET có data thì HEAD phải là 200').toBe(200);
    }
  });

  test('#16 (88 req/24h) GET/HEAD /player/:player_id/team-career — US-3396, có alias legacy busier hơn canonical ở #14', async ({ request }) => {
    const { status, body } = await getJson(request, BASE, `/player/${PID}/team-career?language=en`);
    expect(status).toBe(200);
    expect(body).toHaveProperty('data');
    const head = await request.head(`${BASE}/player/${PID}/team-career?language=en`);
    console.log(`  GET status=${status} (code=${body.code}), HEAD status=${head.status()}`);
    if (body.data === null || body.code === 2) {
      expect(head.status(), 'GET rỗng thì HEAD phải là 204').toBe(204);
    } else {
      expect(head.status(), 'GET có data thì HEAD phải là 200').toBe(200);
    }
  });

  test('#17 (71 req/24h) GET/HEAD /player/:player_id/national-team-career — US-3397', async ({ request }) => {
    const { status, body } = await getJson(request, BASE, `/player/${PID}/national-team-career?language=en`);
    expect(status).toBe(200);
    expect(body).toHaveProperty('data');
    const head = await request.head(`${BASE}/player/${PID}/national-team-career?language=en`);
    console.log(`  GET status=${status} (code=${body.code}), HEAD status=${head.status()}`);
    if (body.data === null || body.code === 2) {
      expect(head.status(), 'GET rỗng thì HEAD phải là 204').toBe(204);
    } else {
      expect(head.status(), 'GET có data thì HEAD phải là 200').toBe(200);
    }
  });
});

test.describe('[US-900] Đối chiếu chéo — overall vs overall-v2 phải CÙNG data thật, chỉ khác field naming', () => {
  test('matches, goals, assists... giống hệt giữa 2 endpoint, chỉ camelCase vs snake_case', async ({ request }) => {
    const overall = await getJson(request, BASE, `/player/${PID}/unique-tournament/${SAMPLE_TOURNAMENT_ID}/season/${SAMPLE_SEASON_ID}/statistics/overall?language=en`);
    const overallV2 = await getJson(request, BASE, `/player/${PID}/unique-tournament/${SAMPLE_TOURNAMENT_ID}/season/${SAMPLE_SEASON_ID}/statistics/overall-v2?language=en`);

    const s1 = overall.body.data.statistics;
    const s2 = overallV2.body.data.statistics;

    expect(s1.matches).toBe(s2.matches);
    expect(s1.goals).toBe(s2.goals);
    expect(s1.assists).toBe(s2.assists);
    expect(s1.redCards).toBe(s2.red_cards);
    expect(s1.minutesPlayed).toBe(s2.minutes_played);
  });
  
});
