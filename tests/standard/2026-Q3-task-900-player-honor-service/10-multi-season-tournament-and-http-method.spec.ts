/**
 * US-900 — Mở rộng thêm: nhiều mùa giải khác nhau (không chỉ 2025-2026),
 * nhiều giải đấu khác Ligue 1 (Bundesliga, Champions League — sự nghiệp
 * Tolisso ở Bayern Munich trước khi về Lyon), HTTP method không hợp lệ, và
 * query param lạ/không tài liệu hoá. Theo đúng pattern đã dùng thành công ở
 * coach-migration (US-3369, file 08/09/12) nhưng chưa áp dụng cho player.
 *
 * CHẠY:
 *   npx playwright test tests/standard/2026-Q3-task-900-player-honor-service/10-multi-season-tournament-and-http-method.spec.ts --project=chrome
 */

import { test, expect } from '@playwright/test';
import { GO_STAGING, NESTJS_LEGACY, SAMPLE_PLAYER_ID } from './00-endpoints-registry';

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

// 3 mùa/giải khác nhau trong sự nghiệp Tolisso — Ligue 1 mùa trước, Bundesliga
// (thời Bayern Munich, khác hẳn Ligue 1), Champions League (giải cup xuyên quốc gia).
const SEASON_TOURNAMENT_SAMPLES = [
  { label: 'Ligue 1 2024-2025 (mùa trước, không phải mùa mặc định 2025-2026)', tournamentId: 'bm0nxitovzu9p9u', seasonId: 's5ofw4ko1ebn5ek' },
  { label: 'Bundesliga 2021-2022 (giải khác hoàn toàn, thời Bayern Munich)', tournamentId: 'jz5xx7noo6txee9', seasonId: 'jy2us9tolyzn7fj' },
  { label: 'UEFA Champions League 2021-2022 (giải cup xuyên quốc gia)', tournamentId: 'c9dxsq8o5wt1o5r', seasonId: 'no03wnpog6grah5' },
];

test.describe('[US-900] Mở rộng — nhiều mùa giải + nhiều giải đấu khác nhau (statistics/overall)', () => {
  for (const sample of SEASON_TOURNAMENT_SAMPLES) {
    test(`${sample.label} — data khớp giữa Go staging và NestJS legacy`, async ({ request }) => {
      const path = `/player/${SAMPLE_PLAYER_ID}/unique-tournament/${sample.tournamentId}/season/${sample.seasonId}/statistics/overall?language=en`;
      const goRes = await request.get(`${GO_STAGING}${path}`);
      const legacyRes = await request.get(`${NESTJS_LEGACY}${path}`);

      expect(goRes.status()).toBe(200);
      expect(legacyRes.status()).toBe(200);

      const goBody = await goRes.json();
      const legacyBody = await legacyRes.json();

      console.log(`  ${sample.label}: matches go=${goBody.data?.statistics?.matches}, legacy=${legacyBody.data?.statistics?.matches}`);
      expect(stableStringify(goBody.data)).toBe(stableStringify(legacyBody.data));

      // Verify riêng field xG (đã fix BUG-2) — vẫn đúng ở mùa/giải KHÁC, không
      // chỉ ở mùa 2025-2026 Ligue 1 đã test trước đó.
      expect(goBody.data.statistics.xgOverall, `${sample.label}: xgOverall phải khớp (verify BUG-2 đã fix vẫn đúng ở giải/mùa khác)`).toBe(legacyBody.data.statistics.xgOverall);
    });
  }
});

test.describe('[US-900] Case biên — HTTP method không hợp lệ trên route player', () => {
  const PATH = `/player/${SAMPLE_PLAYER_ID}/summary?language=en`;

  for (const method of ['post', 'put', 'delete', 'patch'] as const) {
    test(`${method.toUpperCase()} /player/:id/summary — 2 domain phải trả cùng HTTP status`, async ({ request }) => {
      const goRes = await request[method](`${GO_STAGING}${PATH}`);
      const legacyRes = await request[method](`${NESTJS_LEGACY}${PATH}`);
      console.log(`  ${method.toUpperCase()}: go=${goRes.status()}, legacy=${legacyRes.status()}`);
      expect(goRes.status()).toBe(legacyRes.status());
    });
  }

  test('HEAD /player/:id/summary (route KHÔNG có CheckTab, khác team-honors/individual-awards) — 2 domain phải xử lý giống nhau', async ({ request }) => {
    const goRes = await request.head(`${GO_STAGING}${PATH}`);
    const legacyRes = await request.head(`${NESTJS_LEGACY}${PATH}`);
    console.log(`  HEAD (route không có CheckTab chính thức): go=${goRes.status()}, legacy=${legacyRes.status()}`);
    expect(goRes.status()).toBe(legacyRes.status());
  });

  test('OPTIONS /player/:id/summary — 2 domain phải trả cùng HTTP status (preflight CORS)', async ({ request }) => {
    const goRes = await request.fetch(`${GO_STAGING}${PATH}`, { method: 'OPTIONS' });
    const legacyRes = await request.fetch(`${NESTJS_LEGACY}${PATH}`, { method: 'OPTIONS' });
    console.log(`  OPTIONS: go=${goRes.status()}, legacy=${legacyRes.status()}`);
    expect(goRes.status()).toBe(legacyRes.status());
  });
});

test.describe('[US-900] Case biên — query param lạ/không tài liệu hoá', () => {
  const EXTRA_QUERIES = ['&page=2', '&limit=5', '&sort=desc', '&include=all', '&fields=name'];

  for (const query of EXTRA_QUERIES) {
    test(`/player/:id/summary?language=en${query} — query lạ bị bỏ qua nhất quán giữa 2 domain`, async ({ request }) => {
      const baseline = await request.get(`${NESTJS_LEGACY}/player/${SAMPLE_PLAYER_ID}/summary?language=en`);
      const goWithQuery = await request.get(`${GO_STAGING}/player/${SAMPLE_PLAYER_ID}/summary?language=en${query}`);
      const legacyWithQuery = await request.get(`${NESTJS_LEGACY}/player/${SAMPLE_PLAYER_ID}/summary?language=en${query}`);

      const baselineBody = await baseline.json();
      const goBody = await goWithQuery.json();
      const legacyBody = await legacyWithQuery.json();

      expect(goWithQuery.status()).toBe(200);
      expect(legacyWithQuery.status()).toBe(200);
      expect(stableStringify(goBody.data), `Go: query "${query}" không được ảnh hưởng data`).toBe(stableStringify(baselineBody.data));
      expect(stableStringify(legacyBody.data), `Legacy: query "${query}" không được ảnh hưởng data`).toBe(stableStringify(baselineBody.data));
    });
  }

  test('language KHÔNG hợp lệ (vd "xx") — 2 domain xử lý giống nhau (fallback hay giữ nguyên)', async ({ request }) => {
    const goRes = await request.get(`${GO_STAGING}/player/${SAMPLE_PLAYER_ID}/summary?language=xx`);
    const legacyRes = await request.get(`${NESTJS_LEGACY}/player/${SAMPLE_PLAYER_ID}/summary?language=xx`);
    console.log(`  language=xx: go status=${goRes.status()}, legacy status=${legacyRes.status()}`);
    expect(goRes.status()).toBe(legacyRes.status());
  });
});
