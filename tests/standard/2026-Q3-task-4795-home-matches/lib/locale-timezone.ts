/**
 * Bảng ánh xạ locale (mã quốc gia trang Home dùng) → múi giờ IANA chuẩn, dùng
 * làm "nguồn sự thật độc lập" để phát hiện bug tính sai ngày trận đấu theo
 * locale — PHÁT HIỆN THẬT từ phiên QA 2026-10-15: locale KH (Campuchia) thiếu
 * config timezone trong hệ thống, khiến trận đá sau nửa đêm giờ địa phương bị
 * xếp nhầm sang ngày hôm trước (ví dụ Bodo/Glimt vs Dortmund đá 02:00 sáng giờ
 * Campuchia ngày 15/10 lại bị trả về trong response của ngày 14/10). Dev đã
 * hotfix KH, nhưng rà soát thêm phát hiện 4 locale khác ĐANG ĐƯỢC ADMIN CẤU
 * HÌNH THẬT (bảng admin_hot_league_locale trong DB football) nhưng CŨNG THIẾU
 * cùng 1 loại config: CI (Côte d'Ivoire), CM (Cameroon), GH (Ghana),
 * LA (Laos).
 *
 * QUAN TRỌNG: KHÔNG dùng tham số `offset` của chính API để verify (test sẽ tự
 * xác nhận cùng 1 lỗi mà hệ thống đang mắc phải — verify vô nghĩa). Phải dùng
 * nguồn ĐỘC LẬP: Intl API của chính Node.js runtime đọc từ IANA timezone
 * database (tz database), tự động xử lý cả giờ mùa hè (DST) — ví dụ GB hiện
 * đang +1 (BST) thay vì +0 vì đang mùa hè, US đang -4 (EDT) thay vì -5.
 */

/** 15 locale thật đang được admin cấu hình (bảng admin_hot_league_locale,
 *  DB football @ 10.96.0.5) — đây là tập locale ĐÁNG TIN CẬY NHẤT để biết hệ
 *  thống đang thực sự phục vụ ai, hơn hẳn việc đoán qua danh sách ISO. */
export const REAL_ADMIN_LOCALES = ['BR', 'CI', 'CM', 'GB', 'GH', 'ID', 'IT', 'KH', 'LA', 'MY', 'NG', 'PH', 'SG', 'TH', 'VN'];

/** Mọi locale có trong file config timezone_by_locale phía server (55 locale,
 *  xác nhận qua Allan Unity ngày 2026-10-15) + 4 locale admin cấu hình nhưng
 *  server thiếu config (CI/CM/GH/LA) — gộp lại để quét được TOÀN BỘ, không bỏ
 *  sót trường hợp nào, kể cả locale server chưa biết tới. */
export const LOCALE_TIMEZONE: Record<string, string> = {
  US: 'America/New_York', GB: 'Europe/London', AU: 'Australia/Sydney', CA: 'America/Toronto',
  NZ: 'Pacific/Auckland', IE: 'Europe/Dublin', FR: 'Europe/Paris', DE: 'Europe/Berlin',
  ES: 'Europe/Madrid', IT: 'Europe/Rome', PT: 'Europe/Lisbon', NL: 'Europe/Amsterdam',
  BE: 'Europe/Brussels', SE: 'Europe/Stockholm', DK: 'Europe/Copenhagen', NO: 'Europe/Oslo',
  FI: 'Europe/Helsinki', PL: 'Europe/Warsaw', CZ: 'Europe/Prague', HU: 'Europe/Budapest',
  AT: 'Europe/Vienna', CH: 'Europe/Zurich', GR: 'Europe/Athens', JP: 'Asia/Tokyo',
  CN: 'Asia/Shanghai', KR: 'Asia/Seoul', TW: 'Asia/Taipei', HK: 'Asia/Hong_Kong',
  TH: 'Asia/Bangkok', VN: 'Asia/Ho_Chi_Minh', KH: 'Asia/Phnom_Penh', IN: 'Asia/Kolkata',
  SG: 'Asia/Singapore', MY: 'Asia/Kuala_Lumpur', ID: 'Asia/Jakarta', PH: 'Asia/Manila',
  IL: 'Asia/Jerusalem', TR: 'Europe/Istanbul', SA: 'Asia/Riyadh', AE: 'Asia/Dubai',
  QA: 'Asia/Qatar', MX: 'America/Mexico_City', BR: 'America/Sao_Paulo', AR: 'America/Argentina/Buenos_Aires',
  CL: 'America/Santiago', CO: 'America/Bogota', PE: 'America/Lima', ZA: 'Africa/Johannesburg',
  EG: 'Africa/Cairo', MA: 'Africa/Casablanca', NG: 'Africa/Lagos', KE: 'Africa/Nairobi',
  RU: 'Europe/Moscow', UA: 'Europe/Kyiv', BY: 'Europe/Minsk',
  // 4 locale admin cấu hình thật nhưng server đang thiếu config (xác nhận lỗi 2026-10-15):
  CI: 'Africa/Abidjan', CM: 'Africa/Douala', GH: 'Africa/Accra', LA: 'Asia/Vientiane',
};

/** Offset UTC hiện tại (giờ, có thể lẻ như 5.5 hoặc 7) của 1 locale, tính qua
 *  Intl API — tự động đúng cả khi đang DST, không hard-code số cố định (số
 *  cố định sẽ sai vào mùa hè ở các nước có DST như GB/US/EU). */
export function getStandardUtcOffsetHours(locale: string, atDate: Date = new Date()): number | null {
  const tz = LOCALE_TIMEZONE[locale];
  if (!tz) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' }).formatToParts(atDate);
    const offsetStr = parts.find((p) => p.type === 'timeZoneName')?.value; // vd "GMT+07:00"
    const m = offsetStr?.match(/GMT([+-])(\d{2}):(\d{2})/);
    if (!m) return null;
    const sign = m[1] === '+' ? 1 : -1;
    return sign * (parseInt(m[2], 10) + parseInt(m[3], 10) / 60);
  } catch {
    return null;
  }
}

/** Ngày YYYY-MM-DD theo đúng giờ địa phương chuẩn (IANA tz) của 1 locale, cho
 *  1 unix timestamp (giây) — đây là "sự thật" độc lập để so với ngày mà API
 *  trang Home thực tế xếp trận vào. */
export function localDateFor(locale: string, unixSeconds: number): string | null {
  const tz = LOCALE_TIMEZONE[locale];
  if (!tz) return null;
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(unixSeconds * 1000);
  } catch {
    return null;
  }
}
