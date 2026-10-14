/**
 * Baseline riêng cho my-matches (tab "trận của tôi") — theo dõi xuyên ngày
 * đúng những gì 1 user đã BẤM FOLLOW thật sự quan tâm: trận/đội yêu thích của
 * CHÍNH HỌ, không phải toàn bộ lịch thi đấu như lib/baseline.ts. Đây là tab có
 * lưu lượng cao nhất theo doc US-4640 (1.73 triệu request/ngày) nên bug ở đây
 * ảnh hưởng nhiều user nhất — nhưng lại là tab DUY NHẤT phụ thuộc input
 * (teamsFavorite/matchesFavorite) nên không thể dùng chung baseline với các
 * endpoint công khai khác.
 */
import * as fs from 'fs';
import * as path from 'path';

export type FavMatchSnapshot = {
  id: string;
  date: string;
  statusCode: number;
  statusType: string;
  homeDisplay: number | null;
  awayDisplay: number | null;
  homeTeam: string;
  awayTeam: string;
  firstSeenAt: string;
  lastSeenAt: string;
};

export type FavBaseline = Record<string, FavMatchSnapshot>;

const DIR = path.join(__dirname, '..', '.baseline');
const FILE = path.join(DIR, 'my-matches.json');

export function loadFavBaseline(): FavBaseline {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return {};
  }
}

export function saveFavBaseline(baseline: FavBaseline): void {
  fs.mkdirSync(DIR, { recursive: true });
  const sorted: FavBaseline = {};
  for (const id of Object.keys(baseline).sort()) sorted[id] = baseline[id];
  fs.writeFileSync(FILE, JSON.stringify(sorted, null, 2) + '\n');
}

export function toFavSnapshot(e: any, date: string, nowIso: string, existing?: FavMatchSnapshot): FavMatchSnapshot {
  return {
    id: e.id,
    date,
    statusCode: e.status.code,
    statusType: e.status.type,
    homeDisplay: typeof e.homeScore?.display === 'number' ? e.homeScore.display : null,
    awayDisplay: typeof e.awayScore?.display === 'number' ? e.awayScore.display : null,
    homeTeam: e.homeTeam.shortName,
    awayTeam: e.awayTeam.shortName,
    firstSeenAt: existing?.firstSeenAt ?? nowIso,
    lastSeenAt: nowIso,
  };
}

export function pruneFavBaseline(baseline: FavBaseline, vnToday: string, keepDays = 14): FavBaseline {
  const todayMs = new Date(vnToday + 'T00:00:00Z').getTime();
  const pruned: FavBaseline = {};
  for (const [id, snap] of Object.entries(baseline)) {
    const diffDays = Math.abs(todayMs - new Date(snap.date + 'T00:00:00Z').getTime()) / 86_400_000;
    if (diffDays <= keepDays) pruned[id] = snap;
  }
  return pruned;
}
