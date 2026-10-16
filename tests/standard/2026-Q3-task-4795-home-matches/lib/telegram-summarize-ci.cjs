// Giống telegram-summarize.cjs, dùng riêng cho GitHub Actions workflow: đọc
// test-results.json/test-stderr.log ở CWD (không phải workdir tuỳ chỉnh) và
// ghi thêm GITHUB_OUTPUT (failed, status) để step sau dùng.
//
// Tách khỏi YAML (trước đây nhúng trực tiếp trong `run: | node -e "..."`) vì
// cùng rủi ro vỡ cú pháp khi chuỗi JS dài/phức tạp nhúng trong YAML multiline
// — đã tái hiện thật ở bản dùng cho run-tests.sh (SyntaxError: Unexpected end
// of input dù chạy độc lập không lỗi). Xem ghi chú đầy đủ ở telegram-summarize.cjs.
//
// Dùng: node telegram-summarize-ci.cjs
const fs = require('fs');

let data;
try {
  data = JSON.parse(fs.readFileSync('test-results.json', 'utf8'));
} catch (e) {
  const stderr = fs.existsSync('test-stderr.log') ? fs.readFileSync('test-stderr.log', 'utf8').slice(0, 1500) : '';
  fs.writeFileSync(
    'telegram-message.html',
    '⚠️ <b>US-4795 Home Matches</b>\nKhông sinh được report (crash trước khi chạy test).\n\n<pre>' +
      (e.message + '\n' + stderr).replace(/&/g, '&amp;').replace(/</g, '&lt;') +
      '</pre>'
  );
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, 'failed=1\nstatus=crash\n');
  }
  console.log('CRASH — xem telegram-message.html');
  process.exit(0);
}

// File endpoint theo đúng tên spec, giữ thứ tự doc US-4640
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
// Giữ lại tên describe block cha (vd 'scheduled-v2 · VN · 2026-10-14 · all')
// — đây chính là nơi chứa ngày/locale cụ thể bug xảy ra, bị mất nếu chỉ lấy
// spec.title (tên test con, không có ngày).
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
lines.push((allOk ? '✅' : '⚠️') + ' <b>US-4795 — Home Matches Daily Check</b>');
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
  // thành 1 dòng — tránh spam Telegram khi 1 bug lặp qua nhiều locale.
  // Whitelist locale THẬT (từ lib/locale-timezone.ts) thay vì đoán theo pattern
  // "2-3 chữ hoa liền" — pattern đoán từng bắt nhầm từ tiếng Anh viết hoa
  // trong tên test (vd "API") thành locale giả.
  const KNOWN_LOCALES = ['US','GB','AU','CA','NZ','IE','FR','DE','ES','IT','PT','NL','BE','SE','DK','NO','FI','PL','CZ','HU','AT','CH','GR','JP','CN','KR','TW','HK','TH','VN','KH','IN','SG','MY','ID','PH','IL','TR','SA','AE','QA','MX','BR','AR','CL','CO','PE','ZA','EG','MA','NG','KE','RU','UA','BY','CI','CM','GH','LA'];
  const LOCALE_RE = new RegExp('\\b(?:' + KNOWN_LOCALES.join('|') + ')\\b(?!\\w)', 'g');
  // Tên test thường in kèm cả múi giờ IANA ngay sau mã locale, vd "locale GB
  // (giờ địa phương Europe/London)" — phải thay cả chuỗi timezone thì các
  // dòng cùng 1 bug (chỉ khác locale) mới được gộp đúng vào 1 nhóm.
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
    lines.push('… và ' + (groupList.length - MAX_SHOWN) + ' loại bug khác (xem report đầy đủ)');
  }
  if (allFailTitles.length !== groupList.length) {
    lines.push('<i>(' + groupList.length + ' loại bug, tổng ' + allFailTitles.length + ' case fail trước khi gộp)</i>');
  }
}

fs.writeFileSync('telegram-message.html', lines.join('\n'));
console.log('Passed: ' + expected + ', Failed: ' + unexpected + ', Skipped: ' + skipped);
if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, 'failed=' + unexpected + '\nstatus=' + (allOk ? 'passed' : 'failed') + '\n');
}
