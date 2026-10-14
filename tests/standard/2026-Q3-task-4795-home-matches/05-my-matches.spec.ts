/**
 * US-4795 — my-matches (doc 5/5 US-4640).
 * POST /sport-events/my-matches/locale/{locale}/type/{type}
 *
 * Dùng bộ yêu thích mẫu trong doc (8 đội + 1 trận).
 *
 * CHẠY: npx playwright test tests/standard/2026-Q3-task-4795-home-matches/05-my-matches.spec.ts --project=chrome
 */
import { test, expect } from '@playwright/test';
import { post, vnDate, myMatches, SAMPLE_FAVORITES, SAMPLE_FAVORITES_2, FINISHED_CODES, INPROGRESS_TYPE } from './lib/home-client';

const STALE_CODES = [0, 1, 15, 60, 70, 80, 90];
const PAST_DAYS = [-1, -2, -3, -4, -5, -6, -7].map(vnDate);
const FUTURE_DAYS = [1, 2, 3, 4, 5, 6, 7].map(vnDate);

/** Ngày YYYY-MM-DD của timestamp theo múi giờ IANA. */
const dayIn = (ts: number, tz: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ts * 1000);

function makeIsFav(favorites: typeof SAMPLE_FAVORITES) {
  const favTeams = new Set(favorites.teamsFavorite);
  return (e: any) => favTeams.has(e.homeTeam?.id) || favTeams.has(e.awayTeam?.id) || favorites.matchesFavorite.includes(e.id);
}

async function collect(request: any, type: string, dates: string[], favorites: typeof SAMPLE_FAVORITES, locale = 'VN') {
  const out: Array<{ date: string; body: any }> = [];
  for (const date of dates) {
    const { body } = await post(request, myMatches(type, locale), { ...favorites, startDate: date });
    out.push({ date, body });
  }
  return out;
}

// 2 bộ yêu thích khác hẳn nhau (đội lớn châu Âu vs đội giải nhỏ/châu lục
// khác) — tăng độ phủ data thật: bug chỉ lộ ra với 1 số đội/giải cụ thể sẽ
// không bị che khuất bởi chỉ 1 bộ mẫu duy nhất.
const FAVORITE_SETS = [
  { label: 'bộ 1 (đội lớn châu Âu)', favorites: SAMPLE_FAVORITES },
  { label: 'bộ 2 (đội giải nhỏ/đa châu lục)', favorites: SAMPLE_FAVORITES_2 },
];

test.describe('my-matches · validate & trường hợp rỗng', () => {
  test('không có yêu thích → events [], size 50', async ({ request }) => {
    const { body } = await post(request, myMatches('all'), { startDate: vnDate(0) });
    expect(body).toMatchObject({ code: 1, data: { events: [], pagination: { page: 1, size: 50, total: 0 } } });
  });

  test('thiếu startDate → HTTP 422', async ({ request }) => {
    const { status, body } = await post(request, myMatches('all'), SAMPLE_FAVORITES);
    expect(status).toBe(422);
    expect(body.errors).toHaveProperty('startDate');
  });

  test('type sai → HTTP 422', async ({ request }) => {
    const { status, body } = await post(request, myMatches('xyz'), { ...SAMPLE_FAVORITES, startDate: vnDate(0) });
    expect(status).toBe(422);
    expect(body.errors).toHaveProperty('type');
  });
});

for (const { label, favorites } of FAVORITE_SETS) {
  const isFav = makeIsFav(favorites);

  test.describe(`my-matches · VN · theo type · ${label}`, () => {
    test('all (7 ngày qua): chỉ trận của yêu thích, trong đúng ngày VN, không trận treo', async ({ request }) => {
      const days = await collect(request, 'all', PAST_DAYS, favorites);
      const total = days.reduce((s, d) => s + d.body.data.events.length, 0);
      test.skip(total === 0, `Đội yêu thích (${label}) không có trận nào trong 7 ngày qua`);
      for (const { date, body } of days) {
        expect(body.code).toBe(1);
        for (const e of body.data.events) {
          expect(isFav(e), `${date} ${e.id} không thuộc yêu thích`).toBe(true);
          expect(STALE_CODES, `${date} ${e.id} là trận treo`).not.toContain(e.status.code);
          // ngày đã qua: trận phải bắt đầu trong ngày VN của startDate
          expect(dayIn(e.startTimestamp, 'Asia/Ho_Chi_Minh'), `${e.id} sai ngày`).toBe(date);
        }
      }
    });

    test('finish (7 ngày qua): chỉ trận kết thúc 100/110/120', async ({ request }) => {
      const days = await collect(request, 'finish', PAST_DAYS, favorites);
      const evs = days.flatMap((d) => d.body.data.events);
      test.skip(evs.length === 0, `Không có trận kết thúc trong 7 ngày qua (${label})`);
      expect(evs.filter((e) => !FINISHED_CODES.includes(e.status.code)).map((e) => e.status.code)).toEqual([]);
      expect(evs.every(isFav)).toBe(true);
    });

    test('upcoming (7 ngày tới): chỉ trận chưa đá (0)', async ({ request }) => {
      const days = await collect(request, 'upcoming', FUTURE_DAYS, favorites);
      const evs = days.flatMap((d) => d.body.data.events);
      test.skip(evs.length === 0, `Không có trận sắp đá trong 7 ngày tới (${label})`);
      expect(evs.filter((e) => e.status.code !== 0).map((e) => e.status.code)).toEqual([]);
      expect(evs.every(isFav)).toBe(true);
    });

    test('live: chỉ trận yêu thích đang diễn ra, gom theo giải', async ({ request }) => {
      const { body } = await post(request, myMatches('live'), { ...favorites, startDate: vnDate(0) });
      expect(body.code).toBe(1);
      const evs = body.data.events;
      test.skip(evs.length === 0, `Không có trận yêu thích đang live (${label})`);
      expect(evs.every(isFav)).toBe(true);
      expect(evs.every((e: any) => e.status.type === INPROGRESS_TYPE)).toBe(true);
      const blocks = evs.map((e: any) => e.tournament.id).filter((c: string, i: number, a: string[]) => i === 0 || a[i - 1] !== c);
      expect(new Set(blocks).size).toBe(blocks.length);
    });

    test('response dùng homeScore.display (có mặt khi trận đã kết thúc)', async ({ request }) => {
      const days = await collect(request, 'finish', PAST_DAYS, favorites);
      const evs = days.flatMap((d) => d.body.data.events);
      test.skip(evs.length === 0, `Không có trận kết thúc (${label})`);
      for (const e of evs) {
        expect(typeof e.homeScore.display).toBe('number');
        expect(typeof e.awayScore.display).toBe('number');
        expect(e).toHaveProperty('aggHomeScore');
      }
    });
  });
}

test.describe('my-matches · bug đã báo fix', () => {
  test('BUG #4: GB tính ngày theo giờ Anh (BST), không theo UTC', async ({ request }) => {
    const days = await collect(request, 'all', PAST_DAYS, SAMPLE_FAVORITES, 'GB');
    const evs = days.flatMap((d) => d.body.data.events.map((e: any) => ({ date: d.date, e })));
    // Chỉ trận đá 23:00–00:00 UTC mới phân biệt được UTC và BST; không có thì test không có ý nghĩa.
    const boundary = evs.filter(({ e }) => new Date(e.startTimestamp * 1000).getUTCHours() === 23);
    test.skip(boundary.length === 0, 'Không có trận nào đá 23:00–00:00 UTC trong 7 ngày qua để phân biệt UTC/BST');
    for (const { date, e } of boundary) {
      expect(dayIn(e.startTimestamp, 'Europe/London'), `${e.id} bị xếp theo ngày UTC`).toBe(date);
    }
  });

  test.fixme('BUG #5: trận hoãn/huỷ của đội yêu thích ở ngày đã qua vẫn hiện ở type=all', async () => {
    // Cần 1 trận hoãn/huỷ thật của đội trong SAMPLE_FAVORITES (id + ngày) để khẳng định
    // trận đó có trong response type=all của đúng ngày. Bổ sung id khi có mẫu.
  });
});
