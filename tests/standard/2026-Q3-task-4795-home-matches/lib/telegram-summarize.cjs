// Tóm tắt kết quả test (test-results.json từ Playwright JSON reporter) thành
// tin nhắn Telegram HTML, gộp các fail CÙNG LOẠI BUG (chỉ khác locale/ngày)
// thành 1 dòng để không spam nhóm khi 1 bug lặp qua nhiều locale.
//
// TÁCH RA FILE RIÊNG (không còn là chuỗi trong node -e của run-tests.sh) vì
// chuỗi JS nhúng trong bash dễ vỡ cú pháp khi code dài/phức tạp — đã tái hiện
// thật 1 lần: node -e báo "SyntaxError: Unexpected end of input" dù chạy
// cùng đoạn JS này như 1 file độc lập hoàn toàn không lỗi. Nguyên nhân chính
// xác chưa xác định (nghi ngờ bash xử lý 1 tổ hợp ký tự nào đó trong chuỗi
// dài), nhưng tách file loại bỏ hẳn rủi ro này.
//
// Dùng: node telegram-summarize.cjs <workdir>
//   <workdir> phải chứa test-results.json (và tuỳ chọn test-stderr.log).
//   Script ghi kết quả vào <workdir>/telegram-message.html.
const fs = require('fs');

const workdir = process.argv[2];
if (!workdir) {
  console.error('Thiếu tham số workdir. Dùng: node telegram-summarize.cjs <workdir>');
  process.exit(1);
}

let data;
try {
  data = JSON.parse(fs.readFileSync(workdir + '/test-results.json', 'utf8'));
} catch (e) {
  const stderr = fs.existsSync(workdir + '/test-stderr.log') ? fs.readFileSync(workdir + '/test-stderr.log', 'utf8').slice(0, 1500) : '';
  fs.writeFileSync(
    workdir + '/telegram-message.html',
    '⚠️ <b>US-4795 Home Matches</b> (chạy tay)\nKhông sinh được report (crash trước khi chạy test).\n\n<pre>' +
      (e.message + '\n' + stderr).replace(/&/g, '&amp;').replace(/</g, '&lt;') +
      '</pre>'
  );
  console.log('CRASH — xem ' + workdir + '/telegram-message.html');
  process.exit(0);
}

const FILE_LABEL = [
  ['01-scheduled-v2.spec.ts', 'scheduled-v2'],
  ['02-scheduled-v1.spec.ts', 'scheduled-v1'],
  ['03-live-v1.spec.ts', 'live-v1'],
  ['04-live-v2.spec.ts', 'live-v2'],
  ['05-my-matches.spec.ts', 'my-matches'],
  ['06-ui-vs-api.spec.ts', 'ui-vs-api'],
  ['07-data-integrity.spec.ts', 'data-integrity'],
  ['08-live-and-rare-cases.spec.ts', 'live-rare-cases'],
  ['09-ui-navigation.spec.ts', 'ui-navigation'],
  ['10-cross-day-regression.spec.ts', 'cross-day-regression'],
  ['11-ui-daily-user-journey.spec.ts', 'ui-daily-journey'],
  ['12-cross-day-extended.spec.ts', 'cross-day-extended'],
  ['13-extended-coverage.spec.ts', 'extended-coverage'],
  ['14-full-locale-matrix.spec.ts', 'locale-matrix'],
  ['15-db-cross-check.spec.ts', 'db-cross-check'],
  ['16-locale-date-boundary.spec.ts', 'locale-date-boundary'],
  ['17-date-boundary-all-tabs.spec.ts', 'date-boundary-all-tabs'],
  ['18-scheduled-v2-deep-invariants.spec.ts', 'deep-invariants'],
  ['19-scheduled-v1-gaps.spec.ts', 'scheduled-v1-gaps'],
  ['20-scheduled-v1-full-coverage.spec.ts', 'scheduled-v1-full'],
  ['21-my-matches-ui.spec.ts', 'my-matches-ui'],
];
const byFile = new Map(FILE_LABEL.map(([f]) => [f, { passed: 0, failed: 0, skipped: 0, failTitles: [] }]));

function fileOf(spec) {
  return (spec.file || '').split('/').pop();
}
// Giữ tên describe cha (vd 'scheduled-v2 · VN · 2026-10-14 · all') — chứa
// ngày/locale cụ thể bug xảy ra, mất nếu chỉ lấy spec.title.
function walk(suite, describePath) {
  for (const spec of suite.specs || []) {
    const bucket = byFile.get(fileOf(spec));
    const fullTitle = describePath ? describePath + ' › ' + spec.title : spec.title;
    for (const t of spec.tests || []) {
      for (const r of t.results || []) {
        if (!bucket) continue;
        if (r.status === 'passed') bucket.passed++;
        else if (r.status === 'skipped') bucket.skipped++;
        else {
          bucket.failed++;
          bucket.failTitles.push(fullTitle);
        }
      }
    }
  }
  for (const s of suite.suites || []) {
    const nextPath = /\.spec\.ts$/.test(s.title) ? describePath : describePath ? describePath + ' › ' + s.title : s.title;
    walk(s, nextPath);
  }
}
for (const s of data.suites || []) walk(s, null);

const { expected = 0, unexpected = 0, skipped = 0 } = data.stats || {};
const ranAt = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });
const vnToday = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const allOk = unexpected === 0;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

const lines = [];
lines.push((allOk ? '✅' : '⚠️') + ' <b>US-4795 — Home Matches</b> (chạy tay)');
lines.push('🕗 ' + esc(ranAt) + ' (giờ VN) · 📅 Data ngày: ' + vnToday);
lines.push('');
lines.push('<b>Tổng:</b> ✅ ' + expected + ' pass · ❌ ' + unexpected + ' fail · ⏭ ' + skipped + ' skip');
lines.push('');
lines.push('<b>Theo endpoint:</b>');
for (const [file, label] of FILE_LABEL) {
  const b = byFile.get(file);
  const icon = b.failed > 0 ? '❌' : '✅';
  lines.push(icon + ' <b>' + label + '</b> — ' + b.passed + ' pass, ' + b.failed + ' fail, ' + b.skipped + ' skip');
}

const allFailTitles = FILE_LABEL.flatMap(([f]) => byFile.get(f).failTitles);
if (allFailTitles.length) {
  // Gom các fail CÙNG MỘT LOẠI BUG (chỉ khác locale/ngày trong tên describe)
  // thành 1 dòng — tránh spam Telegram khi 1 bug lặp qua nhiều locale (vd
  // date-boundary fail ở GB, IE, PT đều là CÙNG 1 bug, không phải 3 bug
  // riêng). Thay mã locale (2-3 chữ hoa liền, đứng riêng 1 từ) và ngày
  // YYYY-MM-DD bằng placeholder làm "khoá nhóm" — 2 dòng chỉ khác các phần
  // này được coi là cùng 1 nhóm.
  // Whitelist locale THẬT (từ lib/locale-timezone.ts) thay vì đoán theo pattern
  // "2-3 chữ hoa liền" — pattern đoán từng bắt nhầm từ tiếng Anh viết hoa
  // trong tên test (vd "API" trong "...phải được API xếp đúng ngày") thành
  // locale giả, làm sai cả khoá nhóm lẫn danh sách variant hiển thị.
  const KNOWN_LOCALES = ['US','GB','AU','CA','NZ','IE','FR','DE','ES','IT','PT','NL','BE','SE','DK','NO','FI','PL','CZ','HU','AT','CH','GR','JP','CN','KR','TW','HK','TH','VN','KH','IN','SG','MY','ID','PH','IL','TR','SA','AE','QA','MX','BR','AR','CL','CO','PE','ZA','EG','MA','NG','KE','RU','UA','BY','CI','CM','GH','LA'];
  const LOCALE_RE = new RegExp('\\b(?:' + KNOWN_LOCALES.join('|') + ')\\b(?!\\w)', 'g');
  // Tên test (file 16/17/20) thường in kèm cả múi giờ IANA ngay sau mã locale,
  // vd "locale GB (giờ địa phương Europe/London)" — nếu chỉ thay mã locale mà
  // không thay luôn chuỗi timezone, các dòng cùng 1 bug (chỉ khác locale) vẫn
  // bị coi là nhóm khác nhau vì phần Continent/City còn lại khác nhau.
  const TZ_RE = /\b[A-Z][a-zA-Z_]+\/[A-Za-z_]+\b/g;
  function groupKey(title) {
    return title.replace(/\b\d{4}-\d{2}-\d{2}\b/g, '{ngay}').replace(TZ_RE, '{tz}').replace(LOCALE_RE, '{locale}');
  }
  const groups = new Map(); // key -> { sample, variants: Set }
  for (const t of allFailTitles) {
    const key = groupKey(t);
    if (!groups.has(key)) groups.set(key, { sample: t, variants: new Set() });
    const caught = [...t.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)].map((m) => m[0]).concat([...t.matchAll(LOCALE_RE)].map((m) => m[0]));
    for (const c of caught) groups.get(key).variants.add(c);
  }
  lines.push('');
  lines.push('<b>Chi tiết fail (đã gộp theo loại bug):</b>');
  const MAX_SHOWN = 15;
  const groupList = [...groups.values()];
  for (const g of groupList.slice(0, MAX_SHOWN)) {
    const variantList = [...g.variants];
    const suffix =
      variantList.length > 1
        ? ' — ' + variantList.length + ' locale/ngay: ' + variantList.slice(0, 8).join(', ') + (variantList.length > 8 ? '...' : '')
        : '';
    lines.push('• ' + esc(g.sample) + esc(suffix));
  }
  if (groupList.length > MAX_SHOWN) {
    lines.push('… và ' + (groupList.length - MAX_SHOWN) + ' loại bug khác (xem report đầy đủ: npx playwright show-report)');
  }
  if (allFailTitles.length !== groupList.length) {
    lines.push('<i>(' + groupList.length + ' loại bug, tổng ' + allFailTitles.length + ' case fail trước khi gộp)</i>');
  }
}

fs.writeFileSync(workdir + '/telegram-message.html', lines.join('\n'));
console.log('Passed: ' + expected + ', Failed: ' + unexpected + ', Skipped: ' + skipped);
