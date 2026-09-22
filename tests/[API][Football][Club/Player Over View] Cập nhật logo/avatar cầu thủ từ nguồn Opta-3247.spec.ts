/**
 * TEST FILE: [API][Football][Club/Player Over View] Cập nhật logo/avatar cầu thủ từ nguồn Opta-3247.spec.ts
 *
 * TICKET: US-3247 — Cập nhật logo/avatar cầu thủ lấy từ nguồn Opta.
 *
 * NGUỒN EXPECTED: file Excel "Opta Avatar Mapping Report" (tải về local
 *   ~/Downloads/Opta Avatar Mapping Report.xlsx), sheet "Player Detail"
 *   (8,522 dòng) — mỗi dòng là 1 cầu thủ, cột quan trọng:
 *     - opta_id        : id ảnh gốc bên Opta
 *     - thesport_id     : id cầu thủ bên thesports — CHỈ có khi category = "mapped"
 *     - category       : "mapped" | "unmapped_name" | "only_opta_id"
 *         + mapped         -> đã map được sang thesport_id, ảnh PHẢI có trên staging
 *         + unmapped_name  -> có tên nhưng không map được id -> KHÔNG có thesport_id để check
 *         + only_opta_id   -> chỉ có opta_id, không có tên/map -> KHÔNG có thesport_id để check
 *     - dest_path      : đường dẫn ảnh đích dạng "{league}/{team_dir}/{thesport_id}.png"
 *
 * PHẠM VI TEST: chỉ check nhóm "mapped" (có thesport_id) — đây là nhóm DUY
 *   NHẤT có đủ thông tin để verify trên staging. 2 nhóm còn lại không có
 *   thesport_id nên không có gì để gọi API/CDN.
 *
 * ENDPOINT ẢNH AVATAR TRÊN STAGING (tìm được qua network trace trang player
 * thật staging.uniscore.vn/football/player/{slug}/{id}):
 *   GET https://img-stag.uniscore.vn/__opta/football/player/{thesport_id}/image/{small|medium}
 *   - Có prefix "__opta" — ĐÂY MỚI LÀ endpoint đúng ảnh nguồn Opta (khác với
 *     endpoint không có "__opta" mà app dùng để hiển thị UI — endpoint đó
 *     LUÔN trả 200 kèm ảnh fallback mặc định ngay cả khi truyền id giả, nên
 *     KHÔNG dùng được để phân biệt mapped/chưa mapped).
 *   - 200 + ảnh thật (size khác nhau theo từng cầu thủ, đã verify 4 mẫu:
 *     26KB-32KB, không phải ảnh dùng chung) -> avatar đã lên staging đúng.
 *   - 404 -> avatar CHƯA có trên staging cho thesport_id đó (dù Excel báo đã
 *     map) -> lệch giữa Excel report và staging thật, cần báo lại.
 *   - Đã verify: truyền opta_id (thay vì thesport_id) hoặc id giả bất kỳ ->
 *     404 (không fallback), nên 200 là tín hiệu đáng tin cậy.
 *
 * CHẠY (phải escape [ ] và / vì Playwright coi argument là regex/path):
 *   npx playwright test "tests/[API][Football][Club-Player Over View] Cập nhật logo-avatar cầu thủ từ nguồn Opta-3247.spec.ts" --project=chrome
 *   (hoặc dùng -g để chạy theo tên test, tránh phải escape path phức tạp)
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as https from 'https';
import * as xlsx from 'xlsx';

// LƯU Ý: file test này nằm sâu hơn bình thường vì tên file có ký tự "/" tạo
// thành thư mục con thật (tests/[API][Football][Club/Player Over View].../...spec.ts)
// -> path.join(__dirname, '..', 'results') sẽ tính SAI, ra 1 thư mục "results"
// lạc bên trong tests/[API][Football][Club/. Dùng process.cwd() (luôn là gốc
// project khi chạy `npx playwright test`) để không phụ thuộc độ sâu __dirname.
const RESULTS_DIR = path.join(process.cwd(), 'results');

function saveJson(filename: string, data: unknown): void {
  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.writeFileSync(path.join(RESULTS_DIR, filename), JSON.stringify(data, null, 2), 'utf-8');
  console.log(`Đã lưu: results/${filename}`);
}

// ─── CẤU HÌNH ──────────────────────────────────────────────────────────────

const EXCEL_PATH = path.join(os.homedir(), 'Downloads', 'Opta Avatar Mapping Report.xlsx');
// Chỉ check production — đã curl thử cả 3 domain (kể cả staging img-stag.uniscore.vn),
// behavior giống hệt nhau (__opta trả 404 đúng khi id không map, 200 ảnh thật khi có map).
const IMAGE_DOMAINS = ['img.uniscore.com', 'img.uniscore.cc'];
const IMAGE_SIZE = 'medium'; // small | medium — đã verify medium trả cùng ảnh, dùng medium cho gần với UI thật

function imageUrl(domain: string, thesportId: string): string {
  return `https://${domain}/__opta/football/player/${thesportId}/image/${IMAGE_SIZE}`;
}

// ─── KIỂU DỮ LIỆU ──────────────────────────────────────────────────────────

interface PlayerDetailRow {
  league: string;
  team_dir: string;
  opta_id: string;
  opta_name: string;
  thesport_id?: string;
  thesport_name?: string;
  category: 'mapped' | 'unmapped_name' | 'only_opta_id';
  src_path: string;
  dest_path?: string;
}

interface CheckResult {
  league: string;
  team_dir: string;
  thesport_id: string;
  thesport_name?: string;
  status: 'ok' | 'missing' | 'error';
  httpStatus?: number;
  contentLength?: number;
}

// ─── HELPER: HEAD REQUEST ───────────────────────────────────────────────────

function httpHead(url: string): Promise<{ status: number; contentLength?: number }> {
  return new Promise((resolve) => {
    const req = https.request(url, { method: 'HEAD', timeout: 15_000 }, (res) => {
      const len = res.headers['content-length'];
      resolve({ status: res.statusCode ?? 0, contentLength: len ? Number(len) : undefined });
      res.resume();
    });
    req.on('error', () => resolve({ status: 0 }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0 }); });
    req.end();
  });
}

// Chạy tối đa `concurrency` request song song thay vì tuần tự — 7,899 player
// tuần tự sẽ rất chậm, bottleneck là network round-trip không phải CPU.
async function runPool<T>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<void>): Promise<void> {
  let next = 0;
  async function runNext(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runNext));
}

// ─── TEST SUITE ─────────────────────────────────────────────────────────────

test.describe('US-3247 — Avatar cầu thủ từ nguồn Opta trên staging', () => {

  test.setTimeout(0);

  const hasExcel = fs.existsSync(EXCEL_PATH);
  let mappedRows: PlayerDetailRow[] = [];
  let categoryCounts: Record<string, number> = {};

  test.beforeAll(() => {
    if (!hasExcel) return;
    const wb = xlsx.readFile(EXCEL_PATH);
    const sheet = wb.Sheets['Player Detail'];
    const rows = xlsx.utils.sheet_to_json<PlayerDetailRow>(sheet, { defval: null });

    for (const r of rows) {
      categoryCounts[r.category] = (categoryCounts[r.category] ?? 0) + 1;
    }
    mappedRows = rows.filter(r => r.category === 'mapped' && r.thesport_id);
  });

  for (const domain of IMAGE_DOMAINS) {
  test(`Mỗi player "mapped" trong Excel phải có avatar Opta thật trên ${domain} (__opta endpoint trả 200)`, async () => {
    test.skip(!hasExcel, `Không tìm thấy file Excel (${EXCEL_PATH}) — cần tải "Opta Avatar Mapping Report.xlsx" về Downloads trước khi chạy test này.`);

    console.log('Phân bố category trong Player Detail:', categoryCounts);
    console.log(`Số player "mapped" cần check trên ${domain}: ${mappedRows.length}`);

    const results: CheckResult[] = [];
    let scanned = 0;

    const CONCURRENCY = 30;
    await runPool(mappedRows, CONCURRENCY, async (row) => {
      scanned++;
      if (scanned % 500 === 0) {
        console.log(`  → ${scanned}/${mappedRows.length} player | missing=${results.filter(r => r.status === 'missing').length}`);
      }

      const url = imageUrl(domain, row.thesport_id!);
      const res = await httpHead(url);

      results.push({
        league: row.league,
        team_dir: row.team_dir,
        thesport_id: row.thesport_id!,
        thesport_name: row.thesport_name,
        status: res.status === 200 ? 'ok' : res.status === 404 ? 'missing' : 'error',
        httpStatus: res.status,
        contentLength: res.contentLength,
      });
    });

    const missing = results.filter(r => r.status === 'missing');
    const errors = results.filter(r => r.status === 'error');

    const missingByLeague = new Map<string, number>();
    missing.forEach(m => missingByLeague.set(m.league, (missingByLeague.get(m.league) ?? 0) + 1));

    const summary = {
      domain,
      categoryCounts,
      totalMappedChecked: results.length,
      ok: results.filter(r => r.status === 'ok').length,
      missing: missing.length,
      error: errors.length,
      missingByLeague: Object.fromEntries(missingByLeague),
    };

    console.log(`\n${'═'.repeat(70)}`);
    console.log(`KẾT QUẢ: Avatar Opta trên ${domain}/__opta cho nhóm "mapped"`);
    console.log(`${'═'.repeat(70)}`);
    console.log(summary);

    missing.slice(0, 50).forEach(m =>
      console.log(`[MISSING] league=${m.league} team_dir=${m.team_dir} thesport_id=${m.thesport_id} (${m.thesport_name}) -> HTTP ${m.httpStatus}`)
    );
    errors.forEach(e =>
      console.log(`[ERROR] league=${e.league} thesport_id=${e.thesport_id} -> HTTP ${e.httpStatus}`)
    );

    saveJson(`opta-avatar-check-${domain}.json`, { summary, missing, errors });

    expect.soft(
      missing.length,
      `${missing.length}/${results.length} player "mapped" trong Excel nhưng avatar KHÔNG có trên ${domain} (__opta endpoint trả 404) — xem results/opta-avatar-check-${domain}.json`
    ).toBe(0);

    expect.soft(errors.length, `${errors.length} request lỗi (timeout/network) khi check avatar trên ${domain}`).toBe(0);
  });
  }
});
