import { test, expect } from '@playwright/test';
import * as dotenv from 'dotenv';

dotenv.config();

const EMAIL    = process.env.GOOGLE_EMAIL    ?? '';
const PASSWORD = process.env.GOOGLE_PASSWORD ?? '';

// Daily check: đăng nhập uniscore.com bằng Google OAuth
// Chạy: npx playwright test tests/login_daily_check.spec.ts --project=chrome --headed
test('đăng nhập uniscore.com bằng Google OAuth', async ({ page }) => {

  // ── 1. Mở trang chủ ────────────────────────────────────────────────────────
  await page.goto('https://uniscore.com/');
  await page.waitForLoadState('networkidle');

  // ── 2. Mở dialog đăng nhập ─────────────────────────────────────────────────
  await page.getByRole('button').nth(1).click();
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });
  await page.getByRole('dialog').getByRole('button', { name: 'Đăng nhập' }).click();

  // ── 3. Click "Đăng nhập bằng Google" — mở popup OAuth ─────────────────────
  const popupPromise = page.waitForEvent('popup');
  await page.locator('div').filter({ hasText: /^Đăng nhập bằng Google$/ }).nth(1).click();
  const popup = await popupPromise;
  await popup.waitForLoadState('networkidle');

  // ── 4. Nhập email ──────────────────────────────────────────────────────────
  const emailBox = popup.getByRole('textbox', { name: /Email|số điện thoại/i });
  await emailBox.waitFor({ state: 'visible', timeout: 10000 });
  await emailBox.fill(EMAIL);
  await popup.getByRole('button', { name: 'Tiếp theo' }).click();
  await popup.waitForLoadState('networkidle');

  // ── 5. Nhập mật khẩu ──────────────────────────────────────────────────────
  // Google có thể hiện "Thử cách khác" nếu passkey được đề xuất trước
  const tryAnotherWay = popup.getByRole('button', { name: /Thử cách khác/i });
  if (await tryAnotherWay.isVisible({ timeout: 3000 }).catch(() => false)) {
    await tryAnotherWay.click();
    await popup.waitForLoadState('networkidle');
    await popup.getByRole('link', { name: /Nhập mật khẩu/i }).click();
    await popup.waitForLoadState('networkidle');
  }

  const passwordBox = popup.getByRole('textbox', { name: /mật khẩu/i });
  await passwordBox.waitFor({ state: 'visible', timeout: 10000 });
  await passwordBox.fill(PASSWORD);
  await passwordBox.press('Enter');
  await popup.waitForLoadState('networkidle');

  // ── 6. Xử lý màn hình "Continue" nếu Google yêu cầu consent ───────────────
  const continueBtn = popup.getByRole('button', { name: /Continue/i });
  if (await continueBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await continueBtn.click();
  }

  // ── 7. Chờ popup đóng và trang chính cập nhật ─────────────────────────────
  await popup.waitForEvent('close', { timeout: 15000 }).catch(() => {
    // Popup có thể đã đóng trước khi event bắt được — không fail
  });
  await page.waitForLoadState('networkidle');

  // ── 8. Verify đăng nhập thành công ────────────────────────────────────────
  // Kiểm tra nút avatar/user xuất hiện (thay thế nút login)
  // hoặc không còn thấy nút "Đăng nhập" ban đầu
  const loginButton = page.getByRole('button').nth(1);
  const loginText   = await loginButton.textContent().catch(() => '');

  // Có thể verify bằng nhiều cách — dùng soft assert để log đủ thông tin
  expect.soft(page.url()).not.toContain('error');
  expect.soft(loginText?.toLowerCase()).not.toContain('đăng nhập');

  console.log('✓ URL sau login:', page.url());
  console.log('✓ Button text:', loginText?.trim());
});
