/**
 * US-900 (Jira gốc: UTD-900) — [API][Football] Tách Player + Honor thành
 * service riêng. Nguồn: getJiraIssue UTD-900 (2026-08-28), bảng "Consolidated
 * endpoint list" — 19 dòng, single source of truth (thay thế US-3370 cũ đã gộp).
 *
 * Domain test chính thức (Slack, Robert Ng, "Hôm qua 11:51"):
 *   https://staging-player-svc.uniscore.vn/
 * Sau khi test API xong sẽ chuyển lại dùng opta-api.uniscore.vn để test giao
 * diện — ĐÃ XÁC NHẬN qua header x-service-name: opta-api.uniscore.vn cũng trả
 * "staging-api-football-players" cho path /player/ và /coach/ (route sẵn
 * sang Go), khác "staging-opta-api" mà path /odds/ trên cùng domain vẫn trả.
 * Đây là cutover có chủ đích, không phải nhầm lẫn kiến trúc.
 *
 * Mẫu cố định: Corentin Tolisso (q69zrnleeejrah5), Lyon, Ligue 1 — đã verify
 * xuyên suốt PXG-18, US-3369.
 */

export const GO_STAGING = 'https://staging-player-svc.uniscore.vn/api/v2/football';
export const NESTJS_LEGACY = 'https://opta-api.uniscore.vn/api/v2/football';

export const SAMPLE_PLAYER_ID = 'q69zrnleeejrah5'; // Corentin Tolisso
export const SAMPLE_TOURNAMENT_ID = 'bm0nxitovzu9p9u'; // Ligue 1
export const SAMPLE_SEASON_ID = '2es0s3ko448ntnv'; // mùa 2025-2026 (season nội bộ frontend)

export type EndpointRow = {
  row: number;
  reqPerDay: number;
  method: 'GET' | 'GET+HEAD';
  path: (p: { playerId: string; tournamentId: string; seasonId: string }) => string;
  handler: string;
  task: string;
  aliasNeeded: string;
  note?: string;
};

/** Đúng 19 dòng theo bảng "Consolidated endpoint list" của UTD-900. */
export const ENDPOINTS: EndpointRow[] = [
  { row: 1, reqPerDay: 34739, method: 'GET', path: ({ playerId }) => `/player/${playerId}?language=en`, handler: 'findOnePlayer', task: 'cutover pending', aliasNeeded: 'Yes (488/24h)' },
  { row: 2, reqPerDay: 22313, method: 'GET', path: ({ playerId }) => `/player/${playerId}/events/last/1?language=en`, handler: 'findPlayerLastEvents', task: 'cutover pending', aliasNeeded: 'No' },
  { row: 3, reqPerDay: 15901, method: 'GET', path: ({ playerId }) => `/player/${playerId}/transfer-history?language=en`, handler: 'findPlayerTransferHistory', task: 'US-3384', aliasNeeded: 'Borderline (7/~3.2d)', note: 'schema "transfers" — stub table, gate task' },
  { row: 4, reqPerDay: 15583, method: 'GET', path: ({ playerId }) => `/player/${playerId}/summary?language=en`, handler: 'findPlayerSummary', task: 'US-3385', aliasNeeded: 'No' },
  { row: 5, reqPerDay: 9370, method: 'GET', path: ({ playerId }) => `/player/${playerId}/characteristics?language=en`, handler: 'findPlayerCharacteristics', task: 'US-3386', aliasNeeded: 'No' },
  { row: 6, reqPerDay: 9272, method: 'GET', path: ({ playerId }) => `/player/${playerId}/honors?language=en`, handler: 'findPlayerHornor', task: 'US-3388', aliasNeeded: 'No', note: 'schema "player_honor" — stub table theo doc, nhưng đã có data thật khi test' },
  { row: 7, reqPerDay: 9268, method: 'GET', path: ({ playerId }) => `/player/${playerId}/national/statistics?language=en`, handler: 'findPlayerNationalStatistics', task: 'US-3387', aliasNeeded: 'No' },
  { row: 8, reqPerDay: 8282, method: 'GET+HEAD', path: ({ playerId }) => `/player/${playerId}/team-honors?language=en`, handler: 'findPlayerTeamHonors + CheckTab', task: 'US-3389', aliasNeeded: 'No', note: 'thiếu HEAD = tab im lặng biến mất trên FE' },
  { row: 9, reqPerDay: 8262, method: 'GET+HEAD', path: ({ playerId }) => `/player/${playerId}/individual-awards?language=en`, handler: 'findPlayerIndividualHonors + CheckTab', task: 'US-3390', aliasNeeded: 'No' },
  { row: 10, reqPerDay: 8178, method: 'GET', path: ({ playerId }) => `/player/${playerId}/injury?language=en`, handler: 'findPlayerInjury', task: 'US-3391', aliasNeeded: 'No', note: 'PARTIAL theo doc' },
  { row: 11, reqPerDay: 8158, method: 'GET', path: ({ playerId }) => `/player/${playerId}/attribute-overviews?language=en`, handler: 'findPlayerAttributeOverview', task: 'US-3392', aliasNeeded: 'Yes (582/24h)' },
  { row: 12, reqPerDay: 5423, method: 'GET', path: ({ playerId, tournamentId, seasonId }) => `/player/${playerId}/unique-tournament/${tournamentId}/season/${seasonId}/statistics/overall-v2?language=en`, handler: 'findPlayerSeasonalStatsSnakeCase', task: 'NEEDS SUB-TASK', aliasNeeded: 'No (legacy dead)', note: 'Beyla wildcard bucket — đọc nhầm =0 nếu xem theo route riêng' },
  { row: 13, reqPerDay: 4602, method: 'GET', path: ({ playerId, tournamentId, seasonId }) => `/player/${playerId}/competition/${tournamentId}/season/${seasonId}/stats/page/1?language=en`, handler: 'findPlayerStats', task: 'US-3393', aliasNeeded: 'No' },
  { row: 14, reqPerDay: 938, method: 'GET', path: () => `/player/transfer-market/period/all/sort/date/page/1?language=en`, handler: 'findPlayerTransferMarket', task: 'US-3394', aliasNeeded: 'No' },
  { row: 15, reqPerDay: 796, method: 'GET', path: ({ playerId }) => `/player/${playerId}/statistics/seasons?language=en`, handler: 'findPlayerStatsSeasons', task: 'US-3395', aliasNeeded: 'Yes (22/24h)', note: 'schema "seasonal_statistics_players" stub theo doc' },
  { row: 16, reqPerDay: 363, method: 'GET', path: ({ playerId, tournamentId, seasonId }) => `/player/${playerId}/unique-tournament/${tournamentId}/season/${seasonId}/statistics/overall?language=en`, handler: 'findPlayerSeasonalStats', task: 'NEEDS SUB-TASK', aliasNeeded: 'Yes (406/24h — legacy busier hơn canonical)' },
  { row: 17, reqPerDay: 89, method: 'GET+HEAD', path: ({ playerId }) => `/player/${playerId}/summary-career?language=en`, handler: 'getPlayerSummaryCareer + CheckTab', task: 'US-3398', aliasNeeded: 'No' },
  { row: 18, reqPerDay: 88, method: 'GET+HEAD', path: ({ playerId }) => `/player/${playerId}/team-career?language=en`, handler: 'getPlayerTeamCareers + CheckTab', task: 'US-3396', aliasNeeded: 'No' },
  { row: 19, reqPerDay: 71, method: 'GET+HEAD', path: ({ playerId }) => `/player/${playerId}/national-team-career?language=en`, handler: 'getPlayerNationalTeamCareer + CheckTab', task: 'US-3397', aliasNeeded: 'No' },
];

/** 4 alias route (không có segment "football/") có traffic thật, phải giữ khi cutover. */
export const ALIAS_ROUTES: Array<{ reqPerDay: number; path: (p: { playerId: string; tournamentId: string; seasonId: string }) => string; canonicalRow: number }> = [
  { reqPerDay: 582, path: ({ playerId }) => `/player/${playerId}/attribute-overviews?language=en`, canonicalRow: 11 },
  { reqPerDay: 488, path: ({ playerId }) => `/player/${playerId}?language=en`, canonicalRow: 1 },
  { reqPerDay: 406, path: ({ playerId, tournamentId, seasonId }) => `/player/${playerId}/unique-tournament/${tournamentId}/season/${seasonId}/statistics/overall?language=en`, canonicalRow: 16 },
  { reqPerDay: 22, path: ({ playerId }) => `/player/${playerId}/statistics/seasons?language=en`, canonicalRow: 15 },
];
