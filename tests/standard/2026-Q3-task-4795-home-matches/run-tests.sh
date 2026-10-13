#!/usr/bin/env bash
# Chạy tay bộ test US-4795 (trang Home, 5 endpoint theo doc US-4640) và
# gửi kết quả vào nhóm Telegram — giống hệt workflow daily trên GitHub Actions.
#
# Dùng:
#   ./tests/standard/2026-Q3-task-4795-home-matches/run-tests.sh            # chạy + báo Telegram
#   ./tests/standard/2026-Q3-task-4795-home-matches/run-tests.sh --no-telegram   # chỉ chạy, không gửi Telegram
#
# Cần biến môi trường (lấy trong 1Password/ghi chú riêng, không commit):
#   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID

set -uo pipefail
cd "$(dirname "$0")/../../.."

SEND_TELEGRAM=1
if [[ "${1:-}" == "--no-telegram" ]]; then
  SEND_TELEGRAM=0
fi

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

echo "==> Chạy test US-4795 (scheduled-v1/v2, live-v1/v2, my-matches)..."
PLAYWRIGHT_JSON_OUTPUT_NAME="$WORKDIR/test-results.json" \
  npx playwright test tests/standard/2026-Q3-task-4795-home-matches/ \
    --project=chrome \
    --reporter=list,json,html \
    2> "$WORKDIR/test-stderr.log"
TEST_EXIT_CODE=$?

echo ""
echo "==> Tổng hợp kết quả..."
node -e "
  const fs = require('fs');
  const workdir = process.argv[1];
  let data;
  try {
    data = JSON.parse(fs.readFileSync(workdir + '/test-results.json', 'utf8'));
  } catch (e) {
    const stderr = fs.existsSync(workdir + '/test-stderr.log') ? fs.readFileSync(workdir + '/test-stderr.log', 'utf8').slice(0, 1500) : '';
    fs.writeFileSync(workdir + '/telegram-message.html', '⚠️ <b>US-4795 Home Matches</b> (chạy tay)\nKhông sinh được report (crash trước khi chạy test).\n\n<pre>' + (e.message + '\n' + stderr).replace(/&/g,'&amp;').replace(/</g,'&lt;') + '</pre>');
    console.log('CRASH — xem ' + workdir + '/telegram-message.html');
    process.exit(0);
  }

  const FILE_LABEL = [
    ['01-scheduled-v2.spec.ts', 'scheduled-v2'],
    ['02-scheduled-v1.spec.ts', 'scheduled-v1'],
    ['03-live-v1.spec.ts', 'live-v1'],
    ['04-live-v2.spec.ts', 'live-v2'],
    ['05-my-matches.spec.ts', 'my-matches'],
  ];
  const byFile = new Map(FILE_LABEL.map(([f]) => [f, { passed: 0, failed: 0, skipped: 0, failTitles: [] }]));

  function fileOf(spec) { return (spec.file || '').split('/').pop(); }
  function walk(suite) {
    for (const spec of suite.specs || []) {
      const bucket = byFile.get(fileOf(spec));
      for (const t of spec.tests || []) {
        for (const r of t.results || []) {
          if (!bucket) continue;
          if (r.status === 'passed') bucket.passed++;
          else if (r.status === 'skipped') bucket.skipped++;
          else { bucket.failed++; bucket.failTitles.push(spec.title); }
        }
      }
    }
    for (const s of suite.suites || []) walk(s);
  }
  for (const s of data.suites || []) walk(s);

  const { expected = 0, unexpected = 0, skipped = 0 } = data.stats || {};
  const ranAt = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });
  const allOk = unexpected === 0;
  const esc = (s) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');

  const lines = [];
  lines.push((allOk ? '✅' : '⚠️') + ' <b>US-4795 — Home Matches</b> (chạy tay)');
  lines.push('🕗 ' + esc(ranAt) + ' (giờ VN)');
  lines.push('');
  lines.push('<b>Tổng:</b> ✅ ' + expected + ' pass · ❌ ' + unexpected + ' fail · ⏭ ' + skipped + ' skip');
  lines.push('');
  lines.push('<b>Theo endpoint:</b>');
  for (const [file, label] of FILE_LABEL) {
    const b = byFile.get(file);
    const icon = b.failed > 0 ? '❌' : '✅';
    lines.push(icon + ' <b>' + label + '</b> — ' + b.passed + ' pass, ' + b.failed + ' fail, ' + b.skipped + ' skip');
  }
  const allFailTitles = FILE_LABEL.flatMap(([f, label]) => byFile.get(f).failTitles.map((t) => '[' + label + '] ' + t));
  if (allFailTitles.length) {
    lines.push('');
    lines.push('<b>Chi tiết fail:</b>');
    for (const t of allFailTitles) lines.push('• ' + esc(t));
  }
  fs.writeFileSync(workdir + '/telegram-message.html', lines.join('\n'));
  console.log('Passed: ' + expected + ', Failed: ' + unexpected + ', Skipped: ' + skipped);
" "$WORKDIR"

echo ""
cat "$WORKDIR/telegram-message.html"
echo ""
echo ""

if [[ "$SEND_TELEGRAM" -eq 1 ]]; then
  if [[ -z "${TELEGRAM_BOT_TOKEN:-}" || -z "${TELEGRAM_CHAT_ID:-}" ]]; then
    echo "==> Bỏ qua gửi Telegram: thiếu biến môi trường TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID"
  else
    printf '\n\n🔗 Report HTML đầy đủ: npx playwright show-report' >> "$WORKDIR/telegram-message.html"
    echo "==> Gửi kết quả vào nhóm Telegram..."
    curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
      --data-urlencode "parse_mode=HTML" \
      --data-urlencode "text@${WORKDIR}/telegram-message.html" > /dev/null
    echo "==> Đã gửi."
  fi
else
  echo "==> --no-telegram: không gửi thông báo."
fi

echo ""
echo "==> Xem report HTML đầy đủ: npx playwright show-report"
exit $TEST_EXIT_CODE
