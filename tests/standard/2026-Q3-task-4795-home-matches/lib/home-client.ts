/**
 * US-4795 — helper gọi 5 endpoint trang Home (service api-football-home-matches, Go)
 * theo tài liệu US-4640: docs/US-4640-home-matches/*.md
 *
 * Host prod theo docs: api.uni-score.com (có gạch ngang). api.uniscore.com là
 * NestJS cũ — không dùng để đối chiếu.
 */
import type { APIRequestContext } from '@playwright/test';

export const HOME_BASE = process.env.HOME_API_BASE || 'https://api.uni-score.com/api/v2/sport/football';

/** Bộ yêu thích mẫu dùng trong doc my-matches: Arsenal, Liverpool, Real Madrid, Barcelona, Bayern, Inter, Hà Nội, Vancouver FC + trận Xelaju – Antigua. */
export const SAMPLE_FAVORITES = {
  teamsFavorite: [
    'c467w80old4rt8p', 'jqcfxzpoe8jsdt6', 'h5bhxp8o914r35v', 'h5bhxp8o920r35v',
    'bm0nxitory5s3t6', '2es0s3kohl5ntnv', 'go6v7illv9zntnv', 'o6jamrlugwos3t6',
  ],
  matchesFavorite: ['n97akmln2d9mwnv'],
};

/** Bộ yêu thích thứ 2 — đa dạng giải/châu lục khác với SAMPLE_FAVORITES (vốn
 *  thiên về đội lớn châu Âu), để tăng độ phủ data: bug chỉ xảy ra với đội ở
 *  giải nhỏ/châu lục khác (vd AFC Champions League 2, giải Úc) sẽ không bị
 *  bộ favorites đầu che khuất. */
export const SAMPLE_FAVORITES_2 = {
  teamsFavorite: [
    'ykcv4il1h7as1xj', // Persib (AFC Champions League 2)
    'q69zrnl93jyrah5', // Melbourne Victory (AFC Champions League 2)
    'c467w80ox69rt8p', // Galatasaray (UEFA Champions League)
    '2wogs0kowdms1xj', // Atl. Madrid (UEFA Champions League)
    '2es0s3koh8hntnv', // Viking (UEFA Champions League)
    'nkb1x23odwzse70', // Villarreal (UEFA Champions League)
  ],
  matchesFavorite: [] as string[],
};

export const FINISHED_CODES = [100, 110, 120];
export const INPROGRESS_TYPE = 'inprogress';

export type ApiResult = { status: number; body: any };

export async function post(request: APIRequestContext, path: string, body: unknown = {}): Promise<ApiResult> {
  const res = await request.post(`${HOME_BASE}${path}`, { data: body, headers: { 'Content-Type': 'application/json' } });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    // body không phải JSON — caller tự xử lý
  }
  return { status: res.status(), body: json };
}

/** Ngày YYYY-MM-DD theo giờ VN (UTC+7), lệch `offsetDays` so với hôm nay. */
export function vnDate(offsetDays = 0): string {
  return new Date(Date.now() + 7 * 3600_000 + offsetDays * 86400_000).toISOString().slice(0, 10);
}

export const scheduledV2 = (date: string, locale = 'VN', type = 'all', lang = 'vi') =>
  `/scheduled-events-pagination-v2/${date}/locale/${locale}/type/${type}?language=${lang}`;
export const scheduledV1 = (date: string, locale = 'VN', type = 'all', lang = 'vi') =>
  `/scheduled-events-pagination/${date}/locale/${locale}/type/${type}?language=${lang}`;
export const liveV1 = (locale = 'VN', lang = 'vi') => `/events/live/locale/${locale}?language=${lang}`;
export const liveV2 = (locale = 'VN', lang = 'vi') => `/events/live-v2/locale/${locale}?language=${lang}`;
export const myMatches = (type: string, locale = 'VN', lang = 'vi') =>
  `/sport-events/my-matches/locale/${locale}/type/${type}?language=${lang}`;

/** Các trận gợi ý (suggestion = 1) phải nằm liền nhau ở đầu mảng. Trả về index đầu tiên vi phạm, -1 nếu đúng. */
export function firstSuggestionViolation(events: any[]): number {
  let inBlock = true;
  for (let i = 0; i < events.length; i++) {
    const sug = events[i].tournament?.suggestion === 1;
    if (!sug) inBlock = false;
    else if (!inBlock) return i;
  }
  return -1;
}

/** Trận cùng khoá suggestion|group_id phải đứng liền nhau (gom bảng UOB-613). Trả về danh sách khoá bị tách. */
export function brokenGroups(events: any[], groupOf: (e: any) => string | undefined = (e) => e.tournament?.group_id): string[] {
  const last = new Map<string, number>();
  const broken = new Set<string>();
  events.forEach((e, i) => {
    const g = groupOf(e);
    if (!g) return;
    const key = `${e.tournament?.suggestion ?? 0}|${g}`;
    if (last.has(key) && last.get(key) !== i - 1) broken.add(key);
    last.set(key, i);
  });
  return [...broken];
}

/** Giải xuất hiện thành nhiều đoạn không liền nhau. */
export function splitCompetitions(events: any[]): string[] {
  const seen = new Set<string>();
  const split = new Set<string>();
  events.forEach((e, i) => {
    const id = e.tournament?.id;
    if (i > 0 && events[i - 1].tournament?.id === id) return;
    if (seen.has(id)) split.add(id);
    seen.add(id);
  });
  return [...split];
}

export function duplicateIds(events: any[]): string[] {
  const seen = new Set<string>();
  return events.map((e) => e.id).filter((id) => (seen.has(id) ? true : (seen.add(id), false)));
}

export function isSortedAsc(nums: number[]): boolean {
  return nums.every((n, i) => i === 0 || n >= nums[i - 1]);
}
