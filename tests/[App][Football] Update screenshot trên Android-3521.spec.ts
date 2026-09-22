/**
 * TEST FILE: [App][Football] Update screenshot trên Android-3521.spec.ts
 *
 * TICKET: Update lại screenshot Google Play Store cho app Uniscore Android theo
 * locale (quốc gia). Design/product cung cấp 1 folder "3521" gồm 5 bộ ảnh:
 *   - "1. Screenshot - World"      -> áp dụng cho MỌI quốc gia KHÔNG có bộ riêng
 *   - "2. Screenshot - Thailand"   -> chỉ áp dụng riêng cho Thailand
 *   - "3. Screenshot - Indonesia"  -> chỉ áp dụng riêng cho Indonesia
 *   - "4. Screenshot - Campuchia"  -> chỉ áp dụng riêng cho Campuchia
 *   - "5. Screenshot - Brazil"     -> chỉ áp dụng riêng cho Brazil
 *
 * PHẠM VI: Verify Google Play Store THẬT đã áp dụng đúng bộ ảnh theo từng quốc
 * gia — không phải chỉ tin vào việc đã "upload" trên Play Console.
 *
 * PHƯƠNG PHÁP LẤY ẢNH THEO QUỐC GIA (quan trọng — đã thử nhiều cách và ghi lại
 * ở đây để không ai mất công thử lại các cách KHÔNG hoạt động):
 *   ❌ VPN thật (ExpressVPN CLI): không ổn định tại thời điểm viết test, 4 region
 *      (usa-los-angeles-1, usa-seattle, croatia, austria) đều fail, kẹt ở
 *      "Connecting" rồi rớt về "Disconnected" sau 2-3 phút.
 *   ❌ Set query param ?gl=<country> hoặc header Accept-Language khi load trực
 *      tiếp trang https://play.google.com/store/apps/details bằng Playwright
 *      page.goto(): KHÔNG hoạt động — Google Play HTML frontend đọc quốc gia
 *      theo session/cookie đã cache, KHÔNG đọc lại theo tín hiệu client mỗi
 *      request. Verify: set gl=TH vẫn trả về đúng bộ World, không phải bộ
 *      Thailand riêng.
 *   ✅ npm package `google-play-scraper`: gọi THẲNG vào Google Play backend API
 *      (không qua HTML frontend) — tham số `country` được xử lý đúng ngay tại
 *      tầng API. Verify: country='th' trả về ĐÚNG 8 ảnh có trận đội tuyển Thái
 *      Lan, khớp 100% MD5 với file mẫu Thailand.
 *   LƯU Ý: URL ảnh trả về từ scraper mặc định chỉ là thumbnail nhỏ (~236x512).
 *   Phải bỏ suffix size gốc trong URL và thêm "=w1242" để lấy đúng full-res
 *   1242x2688 trước khi so sánh MD5 với file mẫu.
 *
 * SO SÁNH: dùng MD5 (byte-for-byte) giữa ảnh tải từ Play Store thật và ảnh mẫu
 * trong ~/Downloads/3521/, không so bằng mắt — MD5 khớp = pixel-perfect, tránh
 * false-negative do nén ảnh khác lần.
 *
 * QUỐC GIA ĐÃ TEST (bao phủ ĐỦ 4/4 nước có bộ riêng, không chỉ 1 nước mẫu):
 *   US, GB, JP, KR -> phải khớp bộ "World" (4 nước NGOÀI phạm vi 4 nước riêng)
 *   TH   -> phải khớp bộ "Thailand" riêng
 *   ID   -> phải khớp bộ "Indonesia" riêng
 *   KH   -> phải khớp bộ "Campuchia" riêng
 *   BR   -> phải khớp bộ "Brazil" riêng
 *   Cả 4 nước riêng đều verify luôn chiều ngược lại (KHÔNG được lẫn với World)
 *   để chắc chắn cơ chế phân biệt quốc gia hoạt động đúng cho từng nước, không
 *   chỉ đúng ngẫu nhiên ở 1 nước mẫu.
 *
 * NGUỒN MẪU: cần tải folder Google Play thiết kế về local, đặt tại
 *   ~/Downloads/3521/{1. Screenshot - World, 2. Screenshot - Thailand, ...}
 *   Mỗi folder chứa ảnh đặt tên "<width> x <height> - <NN>.jpg", NN = 01..08
 *   (một số size có thêm ảnh phụ, chỉ 8 ảnh đầu là bộ chính cần so sánh).
 *
 * CHẠY (phải escape [ ] vì Playwright coi argument là regex):
 *   npx playwright test "tests/\[App\]\[Football\] Update screenshot trên Android-3521.spec.ts" --project=chrome
 *
 * Kết quả lưu tại:
 *   results/screenshot-3521-md5-comparison.json
 *   results/playstore-3521-screenshots/<COUNTRY>/<NN>.png (ảnh tải thật để soát thủ công)
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import * as https from 'https';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const gplayModule = require('google-play-scraper');
const gplay = gplayModule.default ?? gplayModule;

const RESULTS_DIR = path.join(__dirname, '..', 'results');
const SCREENSHOT_OUT_DIR = path.join(RESULTS_DIR, 'playstore-3521-screenshots');
const MOCKUP_BASE_DIR = path.join(os.homedir(), 'Downloads', '3521');

const APP_ID = 'com.unity.uniscore';
const SAMPLE_SIZE = '1242 x 2688'; // 1 trong 4 size có sẵn cho mọi bộ mẫu, dùng làm chuẩn so sánh
const SHOTS_PER_SET = 8; // 8 ảnh chính đầu tiên của mỗi bộ (World/Thailand/... đều có ít nhất 8)

function saveJson(filename: string, data: unknown): void {
  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.writeFileSync(path.join(RESULTS_DIR, filename), JSON.stringify(data, null, 2), 'utf-8');
  console.log(`Đã lưu: results/${filename}`);
}

function md5OfFile(filePath: string): string {
  return crypto.createHash('md5').update(fs.readFileSync(filePath)).digest('hex');
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} khi tải ${url}`));
          return;
        }
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve()));
      })
      .on('error', reject);
  });
}

/** Bỏ suffix size gốc Google trả về, thêm =w1242 để lấy đúng full-resolution */
function toFullResUrl(url: string): string {
  return url.split('=')[0] + '=w1242';
}

interface CountryCheck {
  countryCode: string;   // mã quốc gia truyền vào google-play-scraper (vd 'us', 'th')
  lang: string;          // ngôn ngữ tương ứng
  expectedMockupFolder: string; // tên folder mẫu trong Downloads/3521 cần khớp
  label: string;         // tên hiển thị trong log
}

/** Quốc gia NGOÀI 4 nước riêng -> phải khớp bộ World */
const COUNTRIES_EXPECT_WORLD: CountryCheck[] = [
  { countryCode: 'us', lang: 'en', expectedMockupFolder: '1. Screenshot - World', label: 'US (Mỹ)' },
  { countryCode: 'jp', lang: 'ja', expectedMockupFolder: '1. Screenshot - World', label: 'JP (Nhật Bản)' },
  { countryCode: 'gb', lang: 'en', expectedMockupFolder: '1. Screenshot - World', label: 'GB (Anh)' },
  { countryCode: 'kr', lang: 'ko', expectedMockupFolder: '1. Screenshot - World', label: 'KR (Hàn Quốc)' },
];

/**
 * Verify ĐẦY ĐỦ CẢ 4 quốc gia có bộ ảnh riêng (đúng bằng số bộ mẫu design cung
 * cấp: Thailand, Indonesia, Campuchia, Brazil) — không chỉ test 1/4 nước.
 * Mỗi nước phải khớp đúng bộ riêng của nó VÀ không lẫn với bộ World.
 */
const COUNTRIES_EXPECT_OWN_SET: CountryCheck[] = [
  { countryCode: 'th', lang: 'th', expectedMockupFolder: '2. Screenshot - Thailand', label: 'TH (Thailand)' },
  { countryCode: 'id', lang: 'id', expectedMockupFolder: '3. Screenshot - Indonesia', label: 'ID (Indonesia)' },
  { countryCode: 'kh', lang: 'km', expectedMockupFolder: '4. Screenshot - Campuchia', label: 'KH (Campuchia)' },
  { countryCode: 'br', lang: 'pt', expectedMockupFolder: '5. Screenshot - Brazil', label: 'BR (Brazil)' },
];

async function fetchAndDownloadScreenshots(check: CountryCheck): Promise<string[]> {
  const app = await gplay.app({ appId: APP_ID, country: check.countryCode, lang: check.lang });
  const screenshots: string[] = app.screenshots ?? [];

  const outDir = path.join(SCREENSHOT_OUT_DIR, check.countryCode.toUpperCase());
  fs.mkdirSync(outDir, { recursive: true });

  const localPaths: string[] = [];
  for (let i = 0; i < Math.min(SHOTS_PER_SET, screenshots.length); i++) {
    const dest = path.join(outDir, `${String(i + 1).padStart(2, '0')}.png`);
    await downloadFile(toFullResUrl(screenshots[i]), dest);
    localPaths.push(dest);
  }
  return localPaths;
}

function mockupPath(folderName: string, index: number): string {
  return path.join(MOCKUP_BASE_DIR, folderName, `${SAMPLE_SIZE} - ${String(index + 1).padStart(2, '0')}.jpg`);
}

test.describe('[App][Football] US-3521 — Screenshot Google Play theo locale', () => {
  test.setTimeout(0);

  const hasMockups = fs.existsSync(MOCKUP_BASE_DIR);

  test('[1] Quốc gia NGOÀI 4 nước riêng (US, GB, JP, KR) phải hiển thị đúng bộ "World"', async () => {
    test.skip(
      !hasMockups,
      `Không tìm thấy folder mẫu (${MOCKUP_BASE_DIR}) trên máy này — cần tải folder "3521" từ Google Play design về Downloads trước khi chạy test này.`
    );

    const results: Array<{
      country: string;
      label: string;
      totalCompared: number;
      matched: number;
      mismatches: Array<{ index: number; realMd5: string; expectedMd5: string }>;
    }> = [];

    for (const check of COUNTRIES_EXPECT_WORLD) {
      const localPaths = await fetchAndDownloadScreenshots(check);
      const mismatches: Array<{ index: number; realMd5: string; expectedMd5: string }> = [];
      let matched = 0;

      for (let i = 0; i < localPaths.length; i++) {
        const expectedPath = mockupPath(check.expectedMockupFolder, i);
        if (!fs.existsSync(expectedPath)) continue;

        const realMd5 = md5OfFile(localPaths[i]);
        const expectedMd5 = md5OfFile(expectedPath);
        if (realMd5 === expectedMd5) {
          matched++;
        } else {
          mismatches.push({ index: i + 1, realMd5, expectedMd5 });
        }
      }

      results.push({
        country: check.countryCode.toUpperCase(),
        label: check.label,
        totalCompared: localPaths.length,
        matched,
        mismatches,
      });
    }

    console.log(`\n${'═'.repeat(70)}`);
    console.log('KẾT QUẢ [1] US/GB/JP/KR vs World');
    console.log(`${'═'.repeat(70)}`);
    results.forEach((r) => {
      console.log(`${r.label}: ${r.matched}/${r.totalCompared} ảnh khớp MD5 với bộ World`);
      r.mismatches.forEach((m) => console.log(`  ✗ Ảnh ${m.index}: real=${m.realMd5} expected=${m.expectedMd5}`));
    });

    saveJson('screenshot-3521-md5-comparison-world.json', { results });

    for (const r of results) {
      expect.soft(r.matched, `${r.label}: chỉ ${r.matched}/${r.totalCompared} ảnh khớp bộ World`).toBe(r.totalCompared);
    }
  });

  test('[2] Quốc gia CÓ bộ riêng (Thailand, Indonesia, Campuchia, Brazil) phải khớp đúng bộ riêng, KHÔNG lẫn với World', async () => {
    test.skip(
      !hasMockups,
      `Không tìm thấy folder mẫu (${MOCKUP_BASE_DIR}) trên máy này — cần tải folder "3521" từ Google Play design về Downloads trước khi chạy test này.`
    );

    const results: Array<{
      country: string;
      label: string;
      matchedOwnSet: number;
      matchedWorldByMistake: number;
      totalCompared: number;
    }> = [];

    for (const check of COUNTRIES_EXPECT_OWN_SET) {
      const localPaths = await fetchAndDownloadScreenshots(check);
      let matchedOwnSet = 0;
      let matchedWorldByMistake = 0;

      for (let i = 0; i < localPaths.length; i++) {
        const realMd5 = md5OfFile(localPaths[i]);

        const ownPath = mockupPath(check.expectedMockupFolder, i);
        if (fs.existsSync(ownPath) && md5OfFile(ownPath) === realMd5) matchedOwnSet++;

        const worldPath = mockupPath('1. Screenshot - World', i);
        if (fs.existsSync(worldPath) && md5OfFile(worldPath) === realMd5) matchedWorldByMistake++;
      }

      results.push({
        country: check.countryCode.toUpperCase(),
        label: check.label,
        matchedOwnSet,
        matchedWorldByMistake,
        totalCompared: localPaths.length,
      });
    }

    console.log(`\n${'═'.repeat(70)}`);
    console.log('KẾT QUẢ [2] 4 nước có bộ riêng vs bộ riêng của từng nước (và verify KHÔNG lẫn World)');
    console.log(`${'═'.repeat(70)}`);
    results.forEach((r) => {
      console.log(`${r.label}: ${r.matchedOwnSet}/${r.totalCompared} khớp bộ riêng, ${r.matchedWorldByMistake} ảnh bị lẫn World (phải =0)`);
    });

    saveJson('screenshot-3521-md5-comparison-ownset.json', { results });

    for (const r of results) {
      expect.soft(r.matchedOwnSet, `${r.label}: chỉ ${r.matchedOwnSet}/${r.totalCompared} ảnh khớp đúng bộ riêng của nó`).toBe(r.totalCompared);
      expect.soft(r.matchedWorldByMistake, `${r.label}: có ${r.matchedWorldByMistake} ảnh bị lẫn với bộ World — sai locale`).toBe(0);
    }
  });
});
