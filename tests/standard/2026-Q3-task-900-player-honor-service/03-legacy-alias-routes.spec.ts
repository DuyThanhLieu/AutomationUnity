/**
 * US-900 — [GoLang] Teams/Players/Coach Domain, nhánh Player + Honor.
 * (Task tracking gốc: US-2433.)
 *
 * File này verify các route legacy alias (/api/v2/player/... KHÔNG có segment
 * "football/") — theo doc, hầu hết đã "dead" (~0 traffic) nhưng 4 route vẫn
 * mang traffic thật và PHẢI được giữ lại (route cả 2 dạng về cùng 1 Go
 * handler, hoặc redirect 301) khi cutover sang Go — mất alias = vỡ client cũ
 * đang gọi trực tiếp dạng không có "football/".
 *
 * CHẠY:
 *   npx playwright test tests/standard/2026-Q3-task-900-player-honor-service/03-legacy-alias-routes.spec.ts --project=chrome
 */

import { test, expect } from '@playwright/test';
import { PLAYER_BASE, SAMPLE_PLAYER_ID, SAMPLE_TOURNAMENT_ID, SAMPLE_SEASON_ID, getJson } from './lib/player-client';

const BASE = PLAYER_BASE.staging;
const PID = SAMPLE_PLAYER_ID;

test.describe('[US-900] 4 alias route CÓ traffic thật — PHẢI giữ lại khi cutover Go', () => {
  test('alias (582/24h) /player/:ref_id/attribute-overviews — cùng data với canonical .../football/player/.../attribute-overviews', async ({ request }) => {
    const canonical = await getJson(request, BASE, `/player/${PID}/attribute-overviews?language=en`);
    const aliasRes = await request.get(`https://opta-api.uniscore.vn/api/v2/player/${PID}/attribute-overviews?language=en`);
    expect(aliasRes.status()).toBe(200);
    const aliasBody = await aliasRes.json();
    expect(aliasBody.data).toEqual(canonical.body.data);
  });

  test('alias (488/24h) /player/:ref_id — cùng data với canonical .../football/player/:ref_id', async ({ request }) => {
    const canonical = await getJson(request, BASE, `/player/${PID}?language=en`);
    const aliasRes = await request.get(`https://opta-api.uniscore.vn/api/v2/player/${PID}?language=en`);
    expect(aliasRes.status()).toBe(200);
    const aliasBody = await aliasRes.json();
    expect(aliasBody.data.player.id).toBe(canonical.body.data.player.id);
  });

  test('alias (406/24h — legacy BUSIER hơn canonical 363/24h, cần điều tra client trước khi sunset) /player/.../statistics/overall (+overall-v2) — cùng data', async ({ request }) => {
    const canonical = await getJson(request, BASE, `/player/${PID}/unique-tournament/${SAMPLE_TOURNAMENT_ID}/season/${SAMPLE_SEASON_ID}/statistics/overall?language=en`);
    const aliasRes = await request.get(
      `https://opta-api.uniscore.vn/api/v2/player/${PID}/unique-tournament/${SAMPLE_TOURNAMENT_ID}/season/${SAMPLE_SEASON_ID}/statistics/overall?language=en`
    );
    expect(aliasRes.status()).toBe(200);
    const aliasBody = await aliasRes.json();
    expect(aliasBody.data).toEqual(canonical.body.data);
    // GHI CHÚ QUAN TRỌNG từ doc: route legacy này (406 req/24h) có traffic
    // CAO HƠN route canonical (363 req/24h) — nghĩa là có ít nhất 1 client
    // đang gọi thẳng dạng alias làm chính, không phải fallback hiếm gặp.
    // KHÔNG được sunset alias này trước khi xác định rõ client đó là ai.
  });

  test('alias (22/24h) /player/:ref_id/statistics/seasons — cùng data với canonical', async ({ request }) => {
    const canonical = await getJson(request, BASE, `/player/${PID}/statistics/seasons?language=en`);
    const aliasRes = await request.get(`https://opta-api.uniscore.vn/api/v2/player/${PID}/statistics/seasons?language=en`);
    expect(aliasRes.status()).toBe(200);
    const aliasBody = await aliasRes.json();
    expect(aliasBody.data).toEqual(canonical.body.data);
  });
});

test.describe('[US-900] Borderline — 0/24h nhưng có traffic trong ~3.2d, alias hoá cho an toàn', () => {
  test('/player/:id/transfer-history — route vẫn tồn tại (200), chưa provably dead', async ({ request }) => {
    const aliasRes = await request.get(`https://opta-api.uniscore.vn/api/v2/player/${PID}/transfer-history?language=en`);
    expect(aliasRes.status()).toBe(200);
  });
});

test.describe('[US-900] "Dead, droppable" theo doc — route vẫn tồn tại (200) nhưng traffic ~0, GHI NHẬN trạng thái thật trước khi ai đó tự ý xoá', () => {
  test('/player/:ref_id/characteristics (alias) — vẫn 200, chỉ traffic ~0', async ({ request }) => {
    const aliasRes = await request.get(`https://opta-api.uniscore.vn/api/v2/player/${PID}/characteristics?language=en`);
    expect(aliasRes.status()).toBe(200);
  });

  test('/player/.../statistics/overall-v2 (alias) — vẫn 200, chỉ traffic ~0', async ({ request }) => {
    const aliasRes = await request.get(
      `https://opta-api.uniscore.vn/api/v2/player/${PID}/unique-tournament/${SAMPLE_TOURNAMENT_ID}/season/${SAMPLE_SEASON_ID}/statistics/overall-v2?language=en`
    );
    expect(aliasRes.status()).toBe(200);
  });

  // /player/:ref_id/events/last/:page (alias) — KHÔNG test ở đây vì doc liệt
  // kê route NÀY (events/last) là "dead, droppable" dưới dạng alias, nhưng
  // route CANONICAL (có football/) lại là 1 trong 2 endpoint traffic cao nhất
  // toàn bộ domain (22,313 req/24h, đã test ở file 01). Không nhầm 2 route này.
});

test.describe('[US-900] /api/v1/ twins — ~1 req/route/3 ngày theo doc, cần quyết định rõ ràng khi cutover Go', () => {
  test('GET /api/v1/football/player/:ref_id — vẫn resolve (API_VERSIONS=1,2 ở prod)', async ({ request }) => {
    const res = await request.get(`https://opta-api.uniscore.vn/api/v1/football/player/${PID}?language=en`);
    // Không assert cứng status vì doc chỉ nói "cũng resolve" — chỉ ghi nhận để
    // QUYẾT ĐỊNH rõ ràng: Go có serve v1 không, hay nginx trả 410 (theo doc,
    // đây là quyết định CẦN ĐƯỢC ĐƯA RA, chưa có sẵn câu trả lời để assert).
    console.log(`  /api/v1/football/player/${PID} -> HTTP ${res.status()}`);
  });
});
