/**
 * Auto-check: tìm các giá trị "stages.name" (DB) có khả năng CHƯA ĐƯỢC DỊCH
 * trên FE — tái hiện từ bug user báo (label "advancing_match" hiển thị raw
 * key thay vì text dịch, trong màn Match Detail > Head to Head).
 *
 * CƠ CHẾ ĐÃ XÁC NHẬN (qua network request thật trên staging):
 *   1. DB bảng "stages", cột "name" lưu text gốc tiếng Anh (vd "advancing match").
 *   2. FE build translation key bằng cách lowercase + thay ký tự đặc biệt
 *      bằng "_" (vd "advancing match" -> "advancing_match").
 *   3. FE gọi GET /api/v2/locale/en?language=en — trả về object JSON phẳng
 *      {key: text dịch}, khoảng 7000+ entries. Nếu build ra key mà KHÔNG có
 *      trong object này, FE fallback hiển thị NGUYÊN key (lỗi "chưa dịch").
 *
 * ⚠️ LƯU Ý QUAN TRỌNG — RULE CHUYỂN ĐỔI KHÔNG HOÀN TOÀN NHẤT QUÁN:
 *   Khảo sát thực tế cho thấy một số entry trong locale xử lý ký tự đặc biệt
 *   KHÁC NHAU tuỳ trường hợp — vd "1/8 Final" -> "18_final" (bỏ dấu "/" và
 *   số liền nhau), nhưng "Copa Sudamericana 1/16-finals" ->
 *   "copa_sudamericana_1/16_finals" (GIỮ NGUYÊN dấu "/"). Script này dùng
 *   RULE ĐƠN GIẢN (lowercase, thay mọi ký tự không phải a-z0-9 bằng "_",
 *   gộp "_" liên tiếp, trim "_" đầu/cuối) — ĐÂY LÀ DANH SÁCH NGHI VẤN, CẦN
 *   TỰ RÀ LẠI TỪNG CASE TRÊN UI THẬT TRƯỚC KHI BÁO DEV, không phải kết luận
 *   cuối cùng. Case "advancing match" đã verify đúng 100% qua UI thật (ảnh
 *   screenshot user cung cấp) nên rule cơ bản là đúng hướng, nhưng số lượng
 *   130 case có thể lẫn false positive do rule chưa khớp 100% các case đặc
 *   biệt (số La Mã, dấu gạch chéo, khoảng trắng kiểu Unicode như （）).
 *
 * CHẠY: node tests/standard/2026-Q3-task-translation-missing-stages/01-scan-untranslated-stages.mjs
 * (cần export biến môi trường DB_HOST, DB_USER, DB_PASSWORD, DB_NAME trước,
 *  xem .env ở project root — port cố định 5432, ssl: false)
 */
import { Client } from 'pg';
import { writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCALE_API = 'https://opta-api.uniscore.vn/api/v2/locale/en?language=en';

function toKey(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/'/g, '_s')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

async function main() {
  const localeRes = await fetch(LOCALE_API);
  const localeBody = await localeRes.json();
  const localeKeys = new Set(Object.keys(localeBody.data ?? {}));
  console.log(`Locale "en" loaded: ${localeKeys.size} keys`);

  const client = new Client({
    host: process.env.DB_HOST,
    port: 5432,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: false,
  });
  await client.connect();

  const res = await client.query(`SELECT DISTINCT name FROM stages WHERE name IS NOT NULL AND name != ''`);
  console.log(`Total distinct stage names in DB: ${res.rows.length}`);

  const missing = [];
  for (const row of res.rows) {
    const key = toKey(row.name);
    if (!localeKeys.has(key)) {
      missing.push({ stageName: row.name, expectedKey: key });
    }
  }

  console.log(`NGHI VẤN chưa dịch (rule đơn giản, CẦN TỰ RÀ LẠI): ${missing.length}`);

  const outPath = path.join(__dirname, 'missing-stage-translations.json');
  writeFileSync(outPath, JSON.stringify(missing, null, 1));
  console.log(`Đã lưu: ${outPath}`);

  await client.end();
}

main();
