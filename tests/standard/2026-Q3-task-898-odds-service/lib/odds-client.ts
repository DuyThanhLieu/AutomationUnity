/**
 * Helper gọi API odds theo tài liệu US-898, cập nhật theo bản
 * qc-endpoints-reference-v2.md (nguồn: nhánh dev @ 29d3d34, probe 2026-10-05).
 *
 * DOMAIN: `dev-api.uniscore.vn/api/v1` ĐÃ LÀ GO THẬT (có field error_code).
 * `opta-api.uniscore.vn/api/v1` là NestJS thật (không có error_code) — baseline
 * duy nhất dùng để so sánh. Domain `test-go-staging-api.uniscore.vn` (goStaging)
 * đã bị loại khỏi test theo yêu cầu (xem ghi chú ở ODDS_BASE.goStaging).
 *
 * KẾT LUẬN QUAN TRỌNG (07/10/2026) — rút lại Bug #1 "Go thiếu field iv":
 * Đã verify lại bằng 40 trận có company=1 (ngày 04-06/10/2026): TẤT CẢ 12 trận
 * bị thiếu iv đều là trận đá NGÀY 04/10 (trước mốc reindex ES 05/10 nêu trong
 * doc), 28 trận đá từ 05/10 trở đi đều có iv đầy đủ — khớp 100%, không một
 * ngoại lệ. Đây là hành vi ĐÚNG THEO THIẾT KẾ (lịch sử 9 market mới trên dev chỉ
 * có từ 05/10), KHÔNG PHẢI bug. Khi test field iv, LUÔN dùng
 * SAMPLE_EVENTS_SINCE_OCT05 (hoặc trận đá từ 05/10 trở đi), KHÔNG dùng
 * SAMPLE_EVENTS cũ cho mục đích này.
 */
import type { APIRequestContext } from '@playwright/test';

export const ODDS_BASE = {
  /** NestJS thật — KHÔNG có field error_code. Baseline chính để so sánh. */
  staging: 'https://opta-api.uniscore.vn/api/v1',
  /** Go thật trên "dev" — CÓ error_code. Tên domain gây hiểu lầm (vẫn là dev-api.*) nhưng đã chạy Go. */
  goDev: 'https://dev-api.uniscore.vn/api/v1',
  /**
   * BỎ KHỎI DANH SÁCH TEST (07/10/2026, theo yêu cầu) — domain Go #1 trên staging.
   * Lý do: phát hiện 1 sample event (o6jamrl14v24w7q) bị thiếu field "iv" RIÊNG
   * trên domain này (cache cục bộ lỗi), trong khi 5/6 event khác test được đều
   * bình thường và domain goDev hoàn toàn sạch cho cùng sample event. Kết luận
   * "9/13 market thiếu iv có hệ thống" dựa trên domain này đã bị RÚT LẠI vì sai
   * do mẫu không đại diện. Giữ lại hằng số để tham khảo nhưng KHÔNG đưa vào
   * GO_TARGETS khi test.
   */
  goStaging: 'https://test-go-staging-api.uniscore.vn/api/v2',
  /** Go local, chỉ dùng khi ai đó tự chạy `go run .` với APP_PORT=8090. */
  goLocal: 'http://localhost:8090/api/v1',
} as const;

export type OddsBaseKey = keyof typeof ODDS_BASE;

/**
 * Mẫu MỞ RỘNG (07/10/2026) — tăng từ 2 lên 6 event để tránh lặp lại sai lầm
 * trước đó (kết luận bug "thiếu iv có hệ thống" chỉ dựa trên 1 sample event
 * không đại diện, trong khi 5/6 event khác test đều bình thường). Toàn bộ 6
 * event đã verify có odds data thật, nhiều company, qua nhiều market.
 */
export const SAMPLE_EVENTS = [
  'o6jamrl14v24w7q',
  'o6jamrl1ryc2w7q',
  'cq0afilnm9syv78',
  '623z28lelp7xvx5',
  '270vqalr7xh6w0m',
  'gk7aeqls10m1v0f',
] as const;

/**
 * 22 market_id theo tài liệu cập nhật 2026-10-05 (qc-endpoints-reference-v2.md).
 * Tăng từ 17 lên 22: thêm cornerHdp, lastTeamToScore, cardHdp, cardStd1x2, cardTx.
 *
 * LƯU Ý QUAN TRỌNG: 9 market mới (cornerHdp, doubleChance, firstTeamToScore,
 * lastTeamToScore, btts, goalsOddEven, totalGoals, halfFull, euroHdp, corner1x2,
 * teamGoalTx*, cardHdp, cardStd1x2, cardTx — nhóm "market mới" theo doc) chỉ có
 * lịch sử ES từ 2026-10-05 (index bị xoá & tạo lại ngày đó do mapping cũ sai).
 * Test field `iv` cho các market này PHẢI dùng trận đá từ 2026-10-05 trở đi —
 * trận trước ngày đó ĐÚNG LÀ thiếu iv, không phải bug.
 */
export const MARKET_IDS = [
  '3in1',
  'hdp',
  'std1x2',
  'tx',
  'score',
  'cornerTx',
  'cornerHdp',
  'doubleChance',
  'firstTeamToScore',
  'lastTeamToScore',
  'btts',
  'goalsOddEven',
  'totalGoals',
  'halfFull',
  'teamGoalTx',
  'teamGoalTxHome',
  'teamGoalTxAway',
  'euroHdp',
  'corner1x2',
  'cardHdp',
  'cardStd1x2',
  'cardTx',
] as const;

/** Market thuộc nhóm "mới" — chỉ có data iv đầy đủ từ 2026-10-05 trở đi, xem ghi chú ở MARKET_IDS. */
export const NEW_MARKETS_SINCE_OCT05 = [
  'cornerHdp',
  'doubleChance',
  'firstTeamToScore',
  'lastTeamToScore',
  'btts',
  'goalsOddEven',
  'totalGoals',
  'halfFull',
  'teamGoalTx',
  'teamGoalTxHome',
  'teamGoalTxAway',
  'euroHdp',
  'corner1x2',
  'cardHdp',
  'cardStd1x2',
  'cardTx',
] as const;

/**
 * Trận mẫu đá từ 2026-10-05 trở đi, đã verify có company data thật qua nhiều
 * market (kể cả nhóm market mới). Dùng để test iv thay vì SAMPLE_EVENTS cũ
 * (các trận đó đá trước 05/10 nên sẽ thiếu iv một cách HỢP LỆ cho 9+ market mới).
 */
export const SAMPLE_EVENTS_SINCE_OCT05 = [
  '270vqalr6dgww0m',
  '54cvbml3t991vp4',
  'sybadnlf24ahwhq',
  'o6jamrl1o1rhw7q',
  '7xdat6l3o3hkv72',
] as const;

/** provider_id hợp lệ theo doc. */
export const PROVIDER_IDS = [1, 3, 4, 7, 8, 9, 12, 14, 17, 18, 19, 22, 23, 24, 31, 35, 42, 45, 47, 48, 49, 50] as const;

export async function getJson(request: APIRequestContext, base: string, path: string): Promise<{ status: number; body: any }> {
  const res = await request.get(`${base}${path}`);
  const status = res.status();
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    // một số route (market_all lạ, param sai) vẫn trả JSON hợp lệ theo doc — nếu parse lỗi thì để null, caller tự xử lý
  }
  return { status, body };
}

/**
 * Kiểm tra Go local (:8090) có đang chạy không — dùng để quyết định skip nhánh
 * so sánh Go vs NestJS thay vì để cả file test treo/timeout dài.
 */
export async function isGoLocalUp(request: APIRequestContext): Promise<boolean> {
  try {
    const res = await request.get(`${ODDS_BASE.goLocal}/football/event/${SAMPLE_EVENTS[0]}/odds/half/0/market/hdp`, { timeout: 3000 });
    return res.ok() || res.status() < 500;
  } catch {
    return false;
  }
}

/**
 * Kiểm tra 1 base URL có phải Go thật không, bằng đúng tiêu chí tài liệu gốc:
 * Go luôn có field "error_code" trong response, NestJS thì không.
 */
export async function isGoByErrorCodeField(request: APIRequestContext, base: string): Promise<boolean> {
  try {
    const res = await request.get(`${base}/football/event/${SAMPLE_EVENTS[0]}/odds/half/0/market/hdp`, { timeout: 5000 });
    if (!res.ok() && res.status() >= 500) return false;
    const body = await res.json().catch(() => null);
    return !!body && Object.prototype.hasOwnProperty.call(body, 'error_code');
  } catch {
    return false;
  }
}
