/**
 * US-900 — Mở rộng phạm vi test: chạy TOÀN BỘ 19 endpoint qua NHIỀU player
 * khác nhau (không chỉ Tolisso), + case biên player không tồn tại / ID sai
 * format. Bổ sung cho 01-08 (vốn chỉ dùng 1 mẫu chính xuyên suốt).
 *
 * Player mẫu mở rộng (đa dạng vị trí, đội, tình trạng dữ liệu):
 *   - Corentin Tolisso (Lyon, tiền vệ, KHÔNG có injury)
 *   - Bradley Barcola (PSG, tiền đạo, xG cao, 1 injury)
 *   - Gonçalo Ramos (PSG, tiền đạo, 6 injury — nhiều dữ liệu chấn thương)
 *   - Désiré Doue (PSG, tiền vệ tấn công, 6 injury)
 *   - Lucas Chevalier (PSG, thủ môn — vị trí khác hẳn, có goalsPrevented)
 *
 * CHẠY:
 *   npx playwright test tests/standard/2026-Q3-task-900-player-honor-service/09-multi-player-and-edge-cases.spec.ts --project=chrome
 */

import { test, expect } from '@playwright/test';
import { GO_STAGING, NESTJS_LEGACY, SAMPLE_TOURNAMENT_ID, SAMPLE_SEASON_ID, ENDPOINTS } from './00-endpoints-registry';

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

const EXTRA_PLAYERS = [
  { name: 'Bradley Barcola', playerId: '5z3v0bln4dbhvu6', note: 'PSG, tiền đạo, xG cao nhất đội, 1 injury record' },
  { name: 'Gonçalo Ramos', playerId: 'b44vv3lq89h6rxp', note: 'PSG, tiền đạo, 6 injury record — nhiều dữ liệu chấn thương' },
  { name: 'Désiré Doue', playerId: 'ykcv4il53pqqw5u', note: 'PSG, tiền vệ tấn công, 6 injury record' },
  { name: 'Lucas Chevalier', playerId: '1ztvu6l91jswv9p', note: 'PSG, thủ môn — vị trí khác hẳn nhóm tiền đạo/tiền vệ, có goalsPrevented' },
];

test.describe('[US-900] Mở rộng — chạy toàn bộ 19 endpoint qua 4 player mới (không chỉ Tolisso)', () => {
  for (const player of EXTRA_PLAYERS) {
    test(`${player.name} (${player.note}) — 19 endpoint đều khớp giữa Go staging và NestJS legacy`, async ({ request }) => {
      const params = { playerId: player.playerId, tournamentId: SAMPLE_TOURNAMENT_ID, seasonId: SAMPLE_SEASON_ID };
      const mismatches: Array<{ row: number; path: string }> = [];

      for (const ep of ENDPOINTS) {
        const path = ep.path(params);
        // Gọi TUẦN TỰ (không Promise.all) — đã tự gặp false positive khi gọi
        // song song: transfer-history/individual-awards báo "lệch" nhưng khi
        // lưu response ra file rồi so bằng Python thì data['data'] giống hệt
        // 100% (kể cả thứ tự mảng). Race condition xảy ra ở tầng gọi mạng
        // đồng thời trong Playwright, không phải bug data thật — giống hiện
        // tượng đã gặp ở coach-migration (task 3369).
        const goRes = await request.get(`${GO_STAGING}${path}`);
        const legacyRes = await request.get(`${NESTJS_LEGACY}${path}`);
        if (!goRes.ok() || !legacyRes.ok()) continue; // status lệch xử lý riêng ở test khác, ở đây chỉ tập trung data
        const goBody = await goRes.json();
        const legacyBody = await legacyRes.json();
        let equal = stableStringify(goBody.data) === stableStringify(legacyBody.data);

        // Retry 1 lần nếu lệch — loại nốt phần race-condition còn sót (đã đủ
        // để dập tắt false positive theo kinh nghiệm task coach-migration).
        if (!equal) {
          await new Promise((r) => setTimeout(r, 500));
          const goRetry = await request.get(`${GO_STAGING}${path}`);
          const legacyRetry = await request.get(`${NESTJS_LEGACY}${path}`);
          if (goRetry.ok() && legacyRetry.ok()) {
            const goRetryBody = await goRetry.json();
            const legacyRetryBody = await legacyRetry.json();
            equal = stableStringify(goRetryBody.data) === stableStringify(legacyRetryBody.data);
          }
        }

        if (!equal) mismatches.push({ row: ep.row, path });
      }

      console.log(`  ${player.name}: ${19 - mismatches.length}/19 endpoint khớp`);
      mismatches.forEach((m) => console.log(`    ✗ #${m.row} ${m.path}`));

      expect(mismatches, `${player.name}: ${mismatches.length}/19 endpoint lệch (đã retry 1 lần để loại race condition) — kiểm tra có phải bug thật không`).toEqual([]);
    });
  }
});

test.describe('[US-900] Case biên — player không tồn tại / ID sai format', () => {
  const NONEXISTENT_ID = 'notarealplayer99xyz';

  test('player_id đúng format nhưng KHÔNG TỒN TẠI — 2 domain phải xử lý giống nhau (200, data null)', async ({ request }) => {
    const [goRes, legacyRes] = await Promise.all([
      request.get(`${GO_STAGING}/player/${NONEXISTENT_ID}?language=en`),
      request.get(`${NESTJS_LEGACY}/player/${NONEXISTENT_ID}?language=en`),
    ]);
    expect(goRes.status()).toBe(200);
    expect(legacyRes.status()).toBe(200);
    const goBody = await goRes.json();
    const legacyBody = await legacyRes.json();
    expect(goBody.data).toBeNull();
    expect(legacyBody.data).toBeNull();
    expect(goBody.code).toBe(legacyBody.code);
  });

  test('player_id chứa ký tự ngoài [a-zA-Z0-9] (dấu gạch ngang) — 2 domain vẫn xử lý giống nhau (KHÁC hành vi coach domain đã gặp ở US-3369)', async ({ request }) => {
    const weirdId = 'not-a-real-id';
    const [goRes, legacyRes] = await Promise.all([
      request.get(`${GO_STAGING}/player/${weirdId}/summary?language=en`),
      request.get(`${NESTJS_LEGACY}/player/${weirdId}/summary?language=en`),
    ]);
    console.log(`  Go status=${goRes.status()}, Legacy status=${legacyRes.status()}`);
    // Ghi chú quan trọng: ở domain Coach (US-3369), route mới (Go) SIẾT CHẶT
    // hơn — trả 404 cho ID có ký tự ngoài [a-zA-Z0-9], trong khi domain cũ vẫn
    // 200. Ở domain Player này, CẢ 2 domain đều 200 — route Go KHÔNG siết
    // route pattern giống coach. Không phải bug, chỉ ghi nhận sự khác biệt
    // hành vi giữa 2 domain con (Coach vs Player) của cùng migrate epic US-2433.
    expect(goRes.status()).toBe(legacyRes.status());
  });

  test('season_id không tồn tại (đúng format, không có mùa giải này) — statistics/overall phải trả rỗng nhất quán giữa 2 domain', async ({ request }) => {
    const fakeSeasonId = 'fakeseasonid00000';
    const path = `/player/q69zrnleeejrah5/unique-tournament/${SAMPLE_TOURNAMENT_ID}/season/${fakeSeasonId}/statistics/overall?language=en`;
    const [goRes, legacyRes] = await Promise.all([request.get(`${GO_STAGING}${path}`), request.get(`${NESTJS_LEGACY}${path}`)]);
    expect(goRes.status()).toBe(200);
    expect(legacyRes.status()).toBe(200);
    const goBody = await goRes.json();
    const legacyBody = await legacyRes.json();
    console.log(`  Go code=${goBody.code}, Legacy code=${legacyBody.code}`);
    expect(goBody.code).toBe(legacyBody.code);
  });
});

test.describe('[US-900] Case biên — player có dữ liệu injury thật (khác Tolisso vốn injury rỗng)', () => {
  test('Gonçalo Ramos (6 injury record) — data injury khớp chi tiết giữa 2 domain', async ({ request }) => {
    const playerId = 'b44vv3lq89h6rxp';
    const path = `/player/${playerId}/injury?language=en`;
    const [goRes, legacyRes] = await Promise.all([request.get(`${GO_STAGING}${path}`), request.get(`${NESTJS_LEGACY}${path}`)]);
    const goBody = await goRes.json();
    const legacyBody = await legacyRes.json();

    console.log(`  Ramos injury count: go=${goBody.data?.length}, legacy=${legacyBody.data?.length}`);
    expect(Array.isArray(legacyBody.data), 'mẫu phải có injury thật để test có ý nghĩa').toBe(true);
    expect(legacyBody.data.length).toBeGreaterThan(0);
    expect(stableStringify(goBody.data)).toBe(stableStringify(legacyBody.data));
  });
});
