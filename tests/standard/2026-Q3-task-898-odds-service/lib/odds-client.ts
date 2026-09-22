/**
 * Helper gọi API odds theo tài liệu US-898 (qc-endpoints.md).
 * 3 base URL: dev (NestJS), staging (NestJS), Go local (:8090, APP_PORT).
 * Tất cả route đều GET, không auth, không body.
 */
import type { APIRequestContext } from '@playwright/test';

export const ODDS_BASE = {
  dev: 'https://dev-api.uniscore.vn/api/v1',
  staging: 'https://opta-api.uniscore.vn/api/v1',
  goLocal: 'http://localhost:8090/api/v1',
} as const;

export type OddsBaseKey = keyof typeof ODDS_BASE;

/** Mẫu cố định — 2 trận có odds data thật, dùng xuyên suốt bộ test để so sánh Go vs NestJS. */
export const SAMPLE_EVENTS = ['o6jamrl14v24w7q', 'o6jamrl1ryc2w7q'] as const;

/** 17 market_id theo bảng trong doc. */
export const MARKET_IDS = [
  '3in1',
  'hdp',
  'std1x2',
  'tx',
  'cornerTx',
  'score',
  'doubleChance',
  'firstTeamToScore',
  'btts',
  'goalsOddEven',
  'teamGoalTx',
  'teamGoalTxHome',
  'teamGoalTxAway',
  'euroHdp',
  'corner1x2',
  'totalGoals',
  'halfFull',
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
