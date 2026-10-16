#!/usr/bin/env bash
# Chạy tay bộ test US-4795 (trang Home, 5 endpoint theo doc US-4640) và
# gửi kết quả vào nhóm Telegram — giống hệt workflow daily trên GitHub Actions.
#
# Dùng:
#   ./tests/standard/2026-Q3-task-4795-home-matches/run-tests.sh            # chạy + báo Telegram
#   ./tests/standard/2026-Q3-task-4795-home-matches/run-tests.sh --no-telegram   # chỉ chạy, không gửi Telegram
#
# Cần biến môi trường TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID — tự đọc từ file
# .env ở gốc repo nếu có (không commit, xem .gitignore), hoặc set sẵn trước khi gọi script.

set -uo pipefail
cd "$(dirname "$0")/../../.."

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

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
node "$(dirname "$0")/lib/telegram-summarize.cjs" "$WORKDIR"

echo ""
cat "$WORKDIR/telegram-message.html"
echo ""
echo ""

if [[ ! -f "$WORKDIR/telegram-message.html" ]]; then
  echo "==> LỖI: không tạo được telegram-message.html (xem log tổng hợp kết quả phía trên) — DỪNG, không gửi Telegram để tránh gửi tin nhắn rỗng/sai."
  exit 1
fi

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
