/**
 * UTD-899 — helper so sánh API Competition: NestJS cũ vs Go mới trên staging.
 * Registry route theo file test case TESTCASE_UTD899_CompetitionService.xlsx (45 route, 34 subtask).
 */
import type { APIRequestContext } from '@playwright/test';

export const HOSTS = {
  old: process.env.OLD_HOST || 'https://opta-api.uniscore.vn',
  new: process.env.NEW_HOST || 'https://test-go-staging-api.uniscore.vn',
};
export const FOOTBALL = '/api/v2/football';

export type Sample = {
  key: string;
  name: string;
  competition: string;
  season: string; // mùa đã kết thúc — data ổn định
  stage: string; // stage của mùa đã kết thúc
  currentSeason: string; // mùa đang diễn ra — cho next/last/transfers
  groupSlug?: string; // chỉ giải có vòng bảng
  team: string; // team id thật (BXH hoặc, nếu không có BXH, đội trong 1 trận đã kết thúc) — dùng cho latest-matches
  player: string; // player id thật (top-players) — dùng cho heatmap
};

export const SAMPLES: Sample[] = [
  { key: 'UCL', name: 'UEFA Champions League', competition: 'c9dxsq8o5wt1o5r', season: 'c9dxsq8ov73r5s2', stage: 'gk7aeql6867r6iv', currentSeason: 'n97akmlchp8sjyf', team: 'c467w80old4rt8p', player: 'sybadnlgm0gsdt6' },
  { key: 'EPL', name: 'Premier League', competition: 'mfiws1aoh0uztg4', season: 'o014smcorpas6pk', stage: 'o8tzjgl6h32s006', currentSeason: 'cq0afilqgkgr31c', team: 'c467w80old4rt8p', player: '5z3v0blgl20rq93' },
  { key: 'ACL2', name: 'AFC Champions League 2', competition: '87dyw5ro5pgni6u', season: 'neo1xasoewzr6iv', stage: 'mx7a61lnd2rse70', currentSeason: 'o8tzjglugp3s006', groupSlug: 'group-a', team: '6hqac9ldvknrihp', player: 'a8qv3rl79y1n7fj' },
  // Mở rộng phạm vi test (data đa dạng hơn để tìm thêm bug): World Cup thật (cup lớn, có vòng bảng, mùa 2022 đã kết thúc)
  { key: 'WC22', name: 'World Cup 2022', competition: 'nq8prta4pwtedsb', season: 'jy2us9tome0n7fj', stage: '1ztvu6l949mr5s2', currentSeason: 'h5bhxp8oojcr35v', groupSlug: 'group-a', team: '2es0s3kohj8ntnv', player: 'a8qv3rld71zn7fj' },
  // Cup knockout quốc nội (không có vòng bảng, không có stage cụ thể — khác hẳn 4 giải trên) để test route stage với data rỗng/khác dạng
  { key: 'FACUP', name: 'FA Cup', competition: '1z88sr5o1v9ntsd', season: 'jqcfxzpo4wnsdt6', stage: 'jqcfxzpo4wnsdt6', currentSeason: '270vqal4txys6pk', team: '1z88sr5ov30ntsd', player: 'cq0afilwv7zwv78' },
];

/** newOnly: route chỉ tồn tại ở Go (API cũ không có / 404 / 500) — không so sánh, chỉ kiểm tra Go trả 200 hợp lệ. */
export type Route = { task: string; name: string; method: 'GET' | 'HEAD'; path: string; volatile?: boolean; newOnly?: boolean };

const L = '?language=en';

/** 45 route của UTD-899, dựng path theo data mẫu. Route không áp dụng cho mẫu (vd groups khi giải không có bảng) bị bỏ. */
export function routesFor(s: Sample): Route[] {
  const { competition: c, season: se, stage: st, currentSeason: cur } = s;
  const r: Route[] = [
    { task: 'UTD-1129', name: 'Chi tiết giải', method: 'GET', path: `/unique-tournament/${c}${L}` },
    { task: 'UTD-1130', name: 'Danh sách mùa', method: 'GET', path: `/unique-tournament/${c}/seasons${L}` },
    { task: 'UTD-1131', name: 'Đội vô địch mùa', method: 'GET', path: `/unique-tournament/${c}/season/${se}${L}` },
    { task: 'UTD-1132', name: 'Nhà vô địch', method: 'GET', path: `/unique-tournament/${c}/season/${se}/champions${L}` },
    { task: 'UTD-1133', name: 'Giải liên quan', method: 'GET', path: `/unique-tournament/${c}/related-competitions${L}` },
    { task: 'UTD-1134', name: 'Thống kê tổng quan mùa', method: 'GET', path: `/unique-tournament/${c}/season/${se}/overview-statistics${L}` },
    { task: 'UTD-1140', name: 'Trận mới nhất', method: 'GET', path: `/unique-tournament/${c}/events`, volatile: true },
    { task: 'UTD-1141', name: 'Trận live', method: 'GET', path: `/unique-tournament/${c}/events/live${L}`, volatile: true },
    { task: 'UTD-1142', name: 'Trận sắp diễn ra p1', method: 'GET', path: `/unique-tournament/${c}/events/upcoming/page/1${L}`, volatile: true },
    { task: 'UTD-1143', name: 'Trận đã kết thúc p1', method: 'GET', path: `/unique-tournament/${c}/seasons/${se}/events/finished/page/1${L}` },
    { task: 'UTD-1144', name: 'Trận kế tiếp (mùa hiện tại)', method: 'GET', path: `/unique-tournament/season/${cur}/events/next/1`, volatile: true },
    { task: 'UTD-1145', name: 'Trận gần nhất (mùa hiện tại)', method: 'GET', path: `/unique-tournament/season/${cur}/events/last/1`, volatile: true },
    { task: 'UTD-1146', name: 'Trận theo vòng 1', method: 'GET', path: `/unique-tournament/${c}/season/${se}/events/round/1${L}` },
    { task: 'UTD-1147', name: 'Trận theo vòng trong stage', method: 'GET', path: `/unique-tournament/${c}/season/${se}/stage/${st}/events/round/1${L}` },
    { task: 'UTD-1148', name: 'Trận theo stage', method: 'GET', path: `/tournament/${c}/season/${se}/stage/${st}/events` },
    { task: 'UTD-1149', name: 'Trận nổi bật', method: 'GET', path: `/unique-tournament/${c}/featured-events${L}`, volatile: true },
    { task: 'UTD-1150', name: 'BXH shortcut', method: 'GET', path: `/unique-tournament/${c}/standings${L}`, volatile: true },
    { task: 'UTD-1152', name: 'Stage có BXH', method: 'GET', path: `/season/${se}/standings/stages${L}` },
    { task: 'UTD-1154', name: 'Top cầu thủ overall', method: 'GET', path: `/unique-tournament/${c}/season/${se}/top-players/overall${L}` },
    { task: 'UTD-1154', name: 'Top cầu thủ overall-v2', method: 'GET', path: `/unique-tournament/${c}/season/${se}/top-players/overall-v2` },
    { task: 'UTD-1154', name: 'Top cầu thủ overall/old', method: 'GET', path: `/unique-tournament/${c}/season/${se}/top-players/overall/old` },
    { task: 'UTD-1155', name: 'Top cầu thủ/trận', method: 'GET', path: `/unique-tournament/${c}/season/${se}/top-players-per-game/all/overall${L}` },
    { task: 'UTD-1155', name: 'Top cầu thủ/trận v2', method: 'GET', path: `/unique-tournament/${c}/season/${se}/top-players-per-game/all/overall-v2${L}` },
    { task: 'UTD-1156', name: 'Top đội overall', method: 'GET', path: `/unique-tournament/${c}/season/${se}/top-teams/overall${L}` },
    { task: 'UTD-1156', name: 'Top đội overall-v2', method: 'GET', path: `/unique-tournament/${c}/season/${se}/top-teams/overall-v2${L}` },
    { task: 'UTD-1156', name: 'Top đội overall/old', method: 'GET', path: `/unique-tournament/${c}/season/${se}/top-teams/overall/old` },
    { task: 'UTD-1157', name: 'Metadata thống kê mùa', method: 'GET', path: `/unique-tournament/${c}/season/${se}/statistics/info`, newOnly: true },
    { task: 'UTD-1158', name: 'Danh sách vòng', method: 'GET', path: `/unique-tournament/${c}/season/${se}/rounds`, newOnly: true },
    { task: 'UTD-1158', name: 'Danh sách vòng v2', method: 'GET', path: `/unique-tournament/${c}/season/${se}/rounds/v2`, newOnly: true },
    { task: 'UTD-1159', name: 'Bảng đấu', method: 'GET', path: `/unique-tournament/${c}/season/${se}/groups${L}` },
    { task: 'UTD-1161', name: 'Highlight mùa (route rút gọn)', method: 'GET', path: `/competition/${c}/season/${se}/highlight`, newOnly: true },
    { task: 'UTD-1161', name: 'Highlight mùa VN p1', method: 'GET', path: `/competition/${c}/season/${se}/highlight/locale/VN/page/1${L}` },
    { task: 'UTD-1162', name: 'Chuyển nhượng (mùa hiện tại)', method: 'GET', path: `/unique-tournament/${c}/${cur}/transfers${L}` },
  ];
  for (const type of ['total', 'home', 'away']) {
    r.push({ task: 'UTD-1151', name: `BXH theo mùa ${type}`, method: 'GET', path: `/unique-tournament/${c}/season/${se}/standings/${type}${L}` });
  }
  r.push(
    { task: 'UTD-1153', name: 'Team-events unique-tournament', method: 'GET', path: `/unique-tournament/${c}/season/${se}/team-events/total${L}` },
    { task: 'UTD-1153', name: 'Team-events tournament', method: 'GET', path: `/tournament/${c}/season/${se}/team-events/total${L}` },
    { task: 'UTD-1153', name: 'Team-events tournament/stage', method: 'GET', path: `/tournament/${c}/season/${se}/stage/${st}/team-events/total${L}` },
    { task: 'UTD-1153', name: 'Team-events unique-tournament/stage', method: 'GET', path: `/unique-tournament/${c}/season/${se}/stage/${st}/team-events/total${L}` },
  );
  if (s.groupSlug) {
    r.push({ task: 'UTD-1160', name: `Trận của bảng ${s.groupSlug}`, method: 'GET', path: `/unique-tournament/${c}/season/${se}/stage/${st}/events/groups/${s.groupSlug}${L}` });
  }
  // 5 API mới phát hiện 29/09/2026 (traffic thật, chưa có subtask lúc đó) — nay đã có subtask UTD-1196→1200 (tạo 30/09/2026).
  r.push(
    { task: 'UTD-1196', name: 'Trận gần đây của đội trong giải (latest-matches)', method: 'GET', path: `/unique-tournaments/${c}/seasons/${se}/team/${s.team}/latest-matches` },
    { task: 'UTD-1197', name: 'Đội hình tiêu biểu theo vòng (team-of-the-week/rounds)', method: 'GET', path: `/unique-tournament/${c}/season/${se}/team-of-the-week/rounds` },
    { task: 'UTD-1198', name: 'Nhà vô địch hiện tại (current-champions)', method: 'GET', path: `/competition/${c}/current-champions` },
    { task: 'UTD-1199', name: 'Đội nhiều danh hiệu nhất (most-titles)', method: 'GET', path: `/competition/${c}/most-titles` },
    { task: 'UTD-1200', name: 'Heatmap cầu thủ (heatmap)', method: 'GET', path: `/competition/${c}/season/${se}/player/${s.player}/heatmap` },
  );
  return r;
}

/** Route không phụ thuộc giải — test 1 lần. */
export const GLOBAL_ROUTES: Route[] = [
  { task: 'UTD-1135', name: 'Toàn bộ unique tournament', method: 'GET', path: `/unique-tournament/all` },
  { task: 'UTD-1136', name: 'Danh sách tất cả giải', method: 'GET', path: `/competitions` },
  { task: 'UTD-1137', name: 'Top leagues', method: 'GET', path: `/competition/top-leagues` },
  { task: 'UTD-1138', name: 'Top leagues VN', method: 'GET', path: `/competition/top-leagues/lang/VN${L}` },
  { task: 'UTD-1138', name: 'Top leagues GB', method: 'GET', path: `/competition/top-leagues/lang/GB${L}` },
];

export type Res = { status: number; body: any; text: string; ms: number; headers: Record<string, string> };

export async function call(request: APIRequestContext, host: string, path: string, method: 'GET' | 'HEAD' = 'GET', prefix = FOOTBALL): Promise<Res> {
  const t = Date.now();
  const res = method === 'HEAD'
    ? await request.head(host + prefix + path, { maxRedirects: 0 })
    : await request.get(host + prefix + path, { maxRedirects: 0 });
  const ms = Date.now() - t;
  const text = method === 'HEAD' ? '' : await res.text();
  let body: any = null;
  try {
    body = JSON.parse(text);
  } catch {
    // không phải JSON
  }
  return { status: res.status(), body, text, ms, headers: res.headers() };
}

/** JSON có sắp key, giữ nguyên thứ tự mảng. */
export function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${stable((v as any)[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

/** Liệt kê tối đa `limit` điểm khác nhau giữa 2 giá trị. */
export function diff(a: any, b: any, path = 'data', out: string[] = [], limit = 8): string[] {
  if (out.length >= limit) return out;
  if (Array.isArray(a) !== Array.isArray(b) || typeof a !== typeof b || (a === null) !== (b === null)) {
    out.push(`${path}: kiểu khác (${a === null ? 'null' : Array.isArray(a) ? 'array' : typeof a} vs ${b === null ? 'null' : Array.isArray(b) ? 'array' : typeof b})`);
    return out;
  }
  if (Array.isArray(a)) {
    if (a.length !== b.length) out.push(`${path}: số phần tử ${a.length} vs ${b.length}`);
    for (let i = 0; i < Math.min(a.length, b.length) && out.length < limit; i++) {
      if (stable(a[i]) !== stable(b[i])) diff(a[i], b[i], `${path}[${i}]`, out, limit);
    }
    return out;
  }
  if (a && typeof a === 'object') {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (out.length >= limit) break;
      if (!(k in b)) out.push(`${path}.${k}: chỉ có ở API cũ`);
      else if (!(k in a)) out.push(`${path}.${k}: chỉ có ở API mới`);
      else if (stable(a[k]) !== stable(b[k])) diff(a[k], b[k], `${path}.${k}`, out, limit);
    }
    return out;
  }
  if (a !== b) out.push(`${path}: ${JSON.stringify(a)?.slice(0, 60)} vs ${JSON.stringify(b)?.slice(0, 60)}`);
  return out;
}

/** Phần data để so sánh — bỏ `code` (1 = cache miss, 3 = cache hit, phụ thuộc thời điểm gọi). */
export const payload = (r: Res) => (r.body && typeof r.body === 'object' && 'data' in r.body ? r.body.data : r.body ?? r.text);

const SNAKE = (k: string) => k.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase());

/** Đổi key camelCase → snake_case đệ quy, để so sánh data giữa Go (camelCase) và NestJS (snake_case) bỏ qua khác biệt naming convention đã biết. */
export function toSnakeKeys(v: any): any {
  if (Array.isArray(v)) return v.map(toSnakeKeys);
  if (v && typeof v === 'object') {
    const out: any = {};
    for (const k of Object.keys(v)) out[SNAKE(k)] = toSnakeKeys(v[k]);
    return out;
  }
  return v;
}

/** So sánh cùng tập phần tử, không quan tâm thứ tự. */
export function sameSet(a: any[], b: any[]): boolean {
  if (a.length !== b.length) return false;
  const sa = a.map(stable).sort();
  const sb = b.map(stable).sort();
  return sa.every((x, i) => x === sb[i]);
}
