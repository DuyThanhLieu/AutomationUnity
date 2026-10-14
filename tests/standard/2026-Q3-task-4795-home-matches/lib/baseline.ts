/**
 * Baseline xuyên ngày — lưu lại 1 "ảnh chụp gọn" của từng trận sau mỗi lần
 * chạy daily, commit vào repo. Lần chạy SAU đọc lại baseline của lần TRƯỚC để
 * so sánh theo thời gian — bắt được lớp bug mà test 1-lần-chạy không bao giờ
 * thấy được, vì chúng chỉ lộ ra khi so 2 thời điểm khác nhau của CÙNG 1 trận:
 *
 *   - Tỷ số 1 trận đã "finished" hôm qua lại đổi khác ở lần gọi hôm nay (dữ
 *     liệu bị ghi đè sai, hoặc cache/ES không đồng bộ vĩnh viễn).
 *   - Trận biến mất hoàn toàn khỏi lịch sử (hôm qua có id đó, hôm nay gọi lại
 *     đúng range ngày thì không còn) — khác "trận hoãn" (vẫn còn, chỉ đổi
 *     status), đây là mất dữ liệu thật.
 *   - startTimestamp của 1 trận đổi giờ SAU KHI đã từng ghi nhận (dời lịch
 *     ngầm không thông báo, hoặc bug ghi đè timestamp sai).
 *   - Trận kẹt ở cùng 1 status/score suốt nhiều ngày liên tiếp dù đã quá xa
 *     ngày thi đấu gốc (dữ liệu "chết", không có pipeline cập nhật/dọn dẹp).
 *
 * Lưu dưới dạng JSON gọn (không phải response đầy đủ) để diff file trong git
 * dễ đọc và không phình to theo thời gian. Baseline được COMMIT vào repo bởi
 * chính workflow .github sau mỗi lần chạy — xem bước "Commit baseline" trong
 * workflow.
 */
import * as fs from 'fs';
import * as path from 'path';

export type MatchSnapshot = {
  id: string;
  date: string; // ngày VN mà trận được ghi nhận thuộc về (vnDate dùng khi gọi API)
  statusCode: number;
  statusType: string;
  homeDisplay: number | null;
  awayDisplay: number | null;
  startTimestamp: number;
  homeTeam: string;
  awayTeam: string;
  tournament: string;
  firstSeenAt: string; // ISO timestamp lần đầu baseline ghi nhận trận này
  lastSeenAt: string;
};

export type Baseline = Record<string, MatchSnapshot>; // key = event id

const BASELINE_DIR = path.join(__dirname, '..', '.baseline');
const BASELINE_FILE = path.join(BASELINE_DIR, 'matches.json');

export function loadBaseline(): Baseline {
  try {
    return JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

export function saveBaseline(baseline: Baseline): void {
  fs.mkdirSync(BASELINE_DIR, { recursive: true });
  // Sắp key theo id để diff git ổn định, dễ review — tránh thứ tự ngẫu nhiên
  // theo insertion order làm mỗi lần ghi đè gây diff toàn file.
  const sorted: Baseline = {};
  for (const id of Object.keys(baseline).sort()) sorted[id] = baseline[id];
  fs.writeFileSync(BASELINE_FILE, JSON.stringify(sorted, null, 2) + '\n');
}

export function toSnapshot(e: any, date: string, nowIso: string, existing?: MatchSnapshot): MatchSnapshot {
  return {
    id: e.id,
    date,
    statusCode: e.status.code,
    statusType: e.status.type,
    homeDisplay: typeof e.homeScore?.display === 'number' ? e.homeScore.display : null,
    awayDisplay: typeof e.awayScore?.display === 'number' ? e.awayScore.display : null,
    startTimestamp: e.startTimestamp,
    homeTeam: e.homeTeam.shortName,
    awayTeam: e.awayTeam.shortName,
    tournament: e.tournament?.name ?? '?',
    firstSeenAt: existing?.firstSeenAt ?? nowIso,
    lastSeenAt: nowIso,
  };
}

/** Baseline chỉ giữ trận trong cửa sổ ±N ngày quanh hôm nay — tránh file phình
 *  to vô hạn theo thời gian (trận quá cũ không còn giá trị theo dõi tiếp). */
export function pruneOldEntries(baseline: Baseline, vnToday: string, keepDays = 14): Baseline {
  const todayMs = new Date(vnToday + 'T00:00:00Z').getTime();
  const pruned: Baseline = {};
  for (const [id, snap] of Object.entries(baseline)) {
    const snapMs = new Date(snap.date + 'T00:00:00Z').getTime();
    const diffDays = Math.abs(todayMs - snapMs) / 86_400_000;
    if (diffDays <= keepDays) pruned[id] = snap;
  }
  return pruned;
}
