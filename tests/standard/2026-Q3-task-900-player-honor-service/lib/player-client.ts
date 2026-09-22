/**
 * Helper gọi API player-entity theo tài liệu US-2433 (migrate 22 endpoint
 * NestJS opta-api -> Go api-football-players). Nguồn: doc phân tích endpoint
 * player-domain-endpoints.md (parent epic US-2433).
 */
import type { APIRequestContext } from '@playwright/test';

export const PLAYER_BASE = {
  // NestJS legacy — dùng làm baseline đối chiếu.
  staging: 'https://opta-api.uniscore.vn/api/v2/football',
  // Go service (api-football-players) — domain test chính thức theo thông báo
  // Robert Ng (UTD-900, Slack): 19 endpoint player đã có trên staging tại đây.
  // Sau khi test API xong, domain FE sẽ chuyển dùng opta-api.uniscore.vn (đã
  // route sẵn sang Go cho path /player/ và /coach/ — xác nhận qua header
  // x-service-name: staging-api-football-players ở cả 2 domain, khác hẳn
  // staging-opta-api mà route /odds/ trên cùng opta-api.uniscore.vn vẫn trả).
  goStaging: 'https://staging-player-svc.uniscore.vn/api/v2/football',
} as const;

/** Mẫu cố định — Corentin Tolisso, đã verify nhiều lần trong task Player xG (US-898/PXG-18). */
export const SAMPLE_PLAYER_ID = 'q69zrnleeejrah5';
export const SAMPLE_TOURNAMENT_ID = 'bm0nxitovzu9p9u'; // Ligue 1
export const SAMPLE_SEASON_ID = '2es0s3ko448ntnv'; // mùa 2025-2026

export async function getJson(request: APIRequestContext, base: string, path: string): Promise<{ status: number; body: any }> {
  const res = await request.get(`${base}${path}`);
  const status = res.status();
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    // để null, caller tự xử lý nếu route không trả JSON hợp lệ
  }
  return { status, body };
}

export async function headStatus(request: APIRequestContext, base: string, path: string): Promise<number> {
  const res = await request.head(`${base}${path}`);
  return res.status();
}
