/**
 * Baseline riêng cho tầng UI (khác lib/baseline.ts — baseline đó lưu field API
 * thô để check data integrity; file này lưu đúng những gì USER THẬT nhìn thấy
 * trên trang, dùng cho kịch bản "user quay lại xem trang mỗi ngày").
 *
 * Tách riêng 2 baseline vì mục đích khác nhau: 1 bên hỏi "data có đúng không",
 * bên này hỏi "trải nghiệm xem qua nhiều ngày có nhất quán với người dùng thật
 * không" — 1 bug có thể chỉ lộ ở UI (vd render cache cũ) mà API vẫn đúng, hoặc
 * ngược lại.
 */
import * as fs from 'fs';
import * as path from 'path';

export type UiMatchSnapshot = {
  id: string;
  date: string;
  /** 'upcoming' | 'live' | 'finished' suy ra từ chính UI (badge/giờ hiển thị), không phải status API. */
  uiState: 'upcoming' | 'live' | 'finished';
  homeTeam: string;
  awayTeam: string;
  scoreText: string | null; // vd "2 - 1", null nếu chưa đá
  seenAt: string;
};

export type UiBaseline = Record<string, UiMatchSnapshot>;

const DIR = path.join(__dirname, '..', '.baseline');
const FILE = path.join(DIR, 'ui-matches.json');

export function loadUiBaseline(): UiBaseline {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return {};
  }
}

export function saveUiBaseline(baseline: UiBaseline): void {
  fs.mkdirSync(DIR, { recursive: true });
  const sorted: UiBaseline = {};
  for (const id of Object.keys(baseline).sort()) sorted[id] = baseline[id];
  fs.writeFileSync(FILE, JSON.stringify(sorted, null, 2) + '\n');
}

export function pruneUiBaseline(baseline: UiBaseline, vnToday: string, keepDays = 10): UiBaseline {
  const todayMs = new Date(vnToday + 'T00:00:00Z').getTime();
  const pruned: UiBaseline = {};
  for (const [id, snap] of Object.entries(baseline)) {
    const diffDays = Math.abs(todayMs - new Date(snap.date + 'T00:00:00Z').getTime()) / 86_400_000;
    if (diffDays <= keepDays) pruned[id] = snap;
  }
  return pruned;
}

/** Tiến trình hợp lệ của 1 trận theo thời gian: chỉ được tiến tới, không lùi. */
const STATE_ORDER: Record<UiMatchSnapshot['uiState'], number> = { upcoming: 0, live: 1, finished: 2 };
export function isValidProgression(from: UiMatchSnapshot['uiState'], to: UiMatchSnapshot['uiState']): boolean {
  return STATE_ORDER[to] >= STATE_ORDER[from];
}
