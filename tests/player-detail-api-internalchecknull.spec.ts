/**
 * TEST FILE: player-detail-api-internalchecknull.spec.ts
 *
 * BUG: Khi dùng API internal (staging-nginx-internal) để lấy chi tiết cầu thủ,
 * 1 số player detail trả về data=null dù API public (opta-api) vẫn có data đầy
 * đủ cho CÙNG 1 player ID. Do HTTP status luôn là 200 (silent-fail), lỗi này
 * KHÔNG bị catch bởi các check HTTP status thông thường.
 *
 * NGUYÊN NHÂN (theo báo cáo dev - @Robert Ng, 2026-08-04): caching DTO không
 * khớp giữa 2 nguồn. Internal API (NestJS) và service khác dùng CHUNG 1 cache
 * layer, nhưng lưu DTO ở format khác nhau — khi Nest đọc lại cache do service
 * khác ghi, không parse được nên trả code=-1, data=null thay vì throw lỗi rõ
 * ràng.
 *
 * ẢNH HƯỞNG TRÊN FRONTEND: khi player bị bug này, trang chi tiết cầu thủ trả
 * về HTTP 404 "Page not found" thật sự cho user (đã verify bằng screenshot),
 * không chỉ là thiếu field — đây là broken page hoàn toàn.
 *
 * SO SÁNH 2 API (cùng 1 player ID):
 *   Internal: https://staging-nginx-internal.uniscore.vn/api/v1/football/player/{id}?language=en
 *     -> response format: { code, data, message } — code=-1 là dấu hiệu bug
 *        (không phải "not found" bình thường, vì "not found" trả code=2).
 *   Public:   https://opta-api.uniscore.vn/api/v2/football/player/{id}?language=en
 *     -> response format: { code, error_code, message, data: { player: {...} } }
 *
 * LƯU Ý QUAN TRỌNG khi viết assertion: CẢ 2 API LUÔN TRẢ HTTP 200 kể cả khi
 * lỗi — không được check qua res.status(), phải check trực tiếp field
 * `data` trong response body có null hay không.
 *
 * ĐÃ KHẢO SÁT (2026-08-04): test hàng loạt 47 player ID lấy từ lineup 1 trận
 * đấu thật (CA Huracan vs Atletico Tucuman) qua API internal — KHÔNG player
 * nào khác trong nhóm này bị null (chỉ thấy code khác nhau: 1, 3 — nhưng đều
 * CÓ data đầy đủ, code số không phải dấu hiệu lỗi, chỉ field `data: null` mới
 * là lỗi thật). Vậy bug này là case cụ thể/hiếm, không phải lỗi toàn hệ
 * thống — test file này tập trung vào đúng case đã biết + verify cơ chế
 * so sánh 2 API để dev dùng lại khi cần check thêm player khác.
 *
 * CHẠY:
 *   npx playwright test tests/player-detail-api-internalchecknull.spec.ts --project=chrome
 *
 * Kết quả lưu tại: results/player-detail-internal-vs-public.json
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

const RESULTS_DIR = path.join(__dirname, '..', 'results');
const INTERNAL_API_BASE = 'https://staging-nginx-internal.uniscore.vn/api/v1/football/player';
const PUBLIC_API_BASE = 'https://opta-api.uniscore.vn/api/v2/football/player';
const WEB_BASE = 'https://staging.uniscore.vn/en/football/player';

function saveJson(filename: string, data: unknown): void {
  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.writeFileSync(path.join(RESULTS_DIR, filename), JSON.stringify(data, null, 2), 'utf-8');
  console.log(`Đã lưu: results/${filename}`);
}

interface PlayerApiResult {
  ok: boolean;
  status: number;
  code?: number;
  hasData: boolean;
  raw?: any;
}

function fetchJson(url: string): Promise<PlayerApiResult> {
  return new Promise((resolve) => {
    const req = https
      .get(url, { timeout: 15000 }, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          try {
            const json = JSON.parse(body);
            resolve({
              ok: true,
              status: res.statusCode ?? 0,
              code: json.code,
              hasData: json.data !== null && json.data !== undefined,
              raw: json,
            });
          } catch {
            resolve({ ok: false, status: res.statusCode ?? 0, hasData: false });
          }
        });
      })
      .on('error', () => resolve({ ok: false, status: 0, hasData: false }));

    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, status: 0, hasData: false });
    });
  });
}

// Case bug đã xác nhận từ báo cáo thực tế — player Eliano Reijnders.
const KNOWN_BUG_CASES = [
  { id: '6hqac9lq8pzzvme', slug: 'eliano-reijnders', name: 'Eliano Reijnders' },
];

// Nhóm player đối chứng (KHÔNG bug) — lấy từ lineup thật, dùng để verify cơ
// chế so sánh 2 API hoạt động đúng cho case bình thường (tránh false positive
// nếu sau này ai đó nới lỏng assertion sai cách).
const CONTROL_CASES = [
  { id: 'cq0afilwr8jr31c', name: 'Hernan Galindez' },
  { id: 'b1ta1lllroqevff', name: 'Fabio Pereyra' },
];

test.describe('Player Detail API — Internal trả null trong khi Public có data', () => {
  test.setTimeout(0);

  test('[1] Case bug đã biết: Internal API trả data=null, Public API vẫn có data đầy đủ', async () => {
    const results: Array<{ id: string; name: string; internal: PlayerApiResult; public_: PlayerApiResult }> = [];

    for (const p of KNOWN_BUG_CASES) {
      const [internal, public_] = await Promise.all([
        fetchJson(`${INTERNAL_API_BASE}/${p.id}?language=en`),
        fetchJson(`${PUBLIC_API_BASE}/${p.id}?language=en`),
      ]);
      results.push({ id: p.id, name: p.name, internal, public_ });

      console.log(`\n[1] ${p.name} (${p.id})`);
      console.log(`  Internal: HTTP=${internal.status} code=${internal.code} hasData=${internal.hasData}`);
      console.log(`  Public:   HTTP=${public_.status} code=${public_.code} hasData=${public_.hasData}`);
    }

    saveJson('player-detail-internal-vs-public.json', { results });

    for (const r of results) {
      // Đây là ASSERTION CHÍNH của bug report: xác nhận hiện tượng discrepancy
      // vẫn còn tồn tại. Nếu dev đã fix, internal.hasData sẽ = true và test
      // này sẽ FAIL — đúng ý nghĩa, báo hiệu cần cập nhật lại test theo trạng
      // thái đã fix (đổi expect thành hasData=true).
      expect(r.public_.hasData, `Public API phải LUÔN có data cho player ${r.name} (${r.id}) — nếu fail nghĩa là player này không còn tồn tại/data nguồn đã đổi, cần chọn case khác`).toBe(true);

      expect.soft(
        r.internal.hasData,
        `[BUG ĐANG TỒN TẠI] Internal API trả data=null cho player ${r.name} (${r.id}) trong khi Public API có đầy đủ data. ` +
          `Nguyên nhân theo dev: cache DTO không khớp giữa NestJS và service khác dùng chung cache layer. ` +
          `Internal response: ${JSON.stringify(r.internal.raw)}`
      ).toBe(true);
    }
  });

  test('[2] Frontend: trang player detail trả 404 khi player bị bug cache', async ({ page }) => {
    for (const p of KNOWN_BUG_CASES) {
      const url = `${WEB_BASE}/${p.slug}/${p.id}`;
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(3000);

      const is404 = await page.getByText('404', { exact: false }).count();
      const pageNotFoundText = await page.getByText('Page not found', { exact: false }).count();

      console.log(`\n[2] ${p.name}: URL=${url} HTTP=${response?.status()} has404Badge=${is404 > 0} hasNotFoundText=${pageNotFoundText > 0}`);

      saveJson(`player-detail-frontend-${p.id}.json`, {
        url,
        httpStatus: response?.status(),
        has404Badge: is404 > 0,
        hasNotFoundText: pageNotFoundText > 0,
      });

      // ASSERTION báo hiệu bug đang tồn tại ở tầng frontend (không phải chỉ
      // API) — nếu dev fix cache, trang sẽ load đúng info cầu thủ, is404 sẽ
      // về 0 và soft-assertion dưới đây FAIL (đúng ý nghĩa: cần retest/update).
      expect.soft(
        is404 > 0 || pageNotFoundText > 0,
        `[BUG ĐANG TỒN TẠI] Trang chi tiết cầu thủ ${p.name} hiển thị 404 do internal API trả null. URL: ${url}`
      ).toBe(true);
    }
  });

  test('[3] Đối chứng: player KHÔNG bug — cả 2 API đều có data khớp nhau', async () => {
    const results: Array<{ id: string; name: string; internalHasData: boolean; publicHasData: boolean }> = [];

    for (const p of CONTROL_CASES) {
      const [internal, public_] = await Promise.all([
        fetchJson(`${INTERNAL_API_BASE}/${p.id}?language=en`),
        fetchJson(`${PUBLIC_API_BASE}/${p.id}?language=en`),
      ]);
      results.push({ id: p.id, name: p.name, internalHasData: internal.hasData, publicHasData: public_.hasData });
      console.log(`\n[3] ${p.name} (${p.id}): internal.hasData=${internal.hasData} public.hasData=${public_.hasData}`);
    }

    saveJson('player-detail-control-group.json', { results });

    for (const r of results) {
      expect(r.internalHasData, `Player đối chứng ${r.name} (${r.id}) phải có data ở Internal API — nếu fail nghĩa là bug đã lan rộng ra thêm player khác, cần điều tra thêm`).toBe(true);
      expect(r.publicHasData, `Player đối chứng ${r.name} (${r.id}) phải có data ở Public API`).toBe(true);
    }
  });
});
