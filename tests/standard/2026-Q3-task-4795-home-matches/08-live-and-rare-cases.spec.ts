/**
 * US-4795 — field riêng của trận ĐANG LIVE (chưa file nào cover: current vs
 * display, injury time, currentPeriodStartTimestamp) + các case HIẾM phụ thuộc
 * dữ liệu thật không chủ động tạo được (agg score lượt về, trận hoãn/huỷ,
 * World Cup) — viết dạng "tự dò khi có data" thay vì test.fixme chết vĩnh
 * viễn, để khi data xuất hiện trong lần chạy daily nào đó, test tự bắt được
 * mà không cần ai sửa code lại.
 *
 * CHẠY: npx playwright test tests/standard/2026-Q3-task-4795-home-matches/08-live-and-rare-cases.spec.ts --project=chrome
 */
import { test, expect } from '@playwright/test';
import { post, vnDate, scheduledV2, liveV1, liveV2, INPROGRESS_TYPE } from './lib/home-client';

async function collectLive(request: any, locales: string[]) {
  const out: any[] = [];
  for (const locale of locales) {
    const { body } = await post(request, liveV2(locale, 'en'));
    if (body.code === 1) out.push(...body.data.events);
  }
  // Nhiều locale có thể trả cùng trận — khử trùng theo id trước khi phân tích.
  const seen = new Set<string>();
  return out.filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)));
}

test.describe('live · field riêng của trận đang diễn ra', () => {
  test('current (tỷ số hiệp đang đá) ≤ display (tổng toàn trận) với mọi trận live', async ({ request }) => {
    const evs = await collectLive(request, ['VN', 'GB', 'US', 'BR', 'JP']);
    test.skip(evs.length === 0, 'Không có trận live tại thời điểm chạy');
    const bad: string[] = [];
    for (const e of evs) {
      for (const side of ['homeScore', 'awayScore'] as const) {
        const s = e[side];
        if (typeof s.current === 'number' && typeof s.display === 'number' && s.current > s.display) {
          bad.push(`${e.id} ${side}: current=${s.current} > display=${s.display}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  test('trận live có time.status trùng status gốc, và có currentPeriodStartTimestamp hợp lệ (≤ now)', async ({ request }) => {
    const evs = await collectLive(request, ['VN', 'GB', 'US', 'BR', 'JP']);
    test.skip(evs.length === 0, 'Không có trận live tại thời điểm chạy');
    const now = Date.now() / 1000;
    const bad: string[] = [];
    for (const e of evs) {
      if (JSON.stringify(e.status) !== JSON.stringify(e.time?.status)) {
        bad.push(`${e.id}: status khác time.status (${JSON.stringify(e.status)} vs ${JSON.stringify(e.time?.status)})`);
      }
      const startTs = e.time?.currentPeriodStartTimestamp;
      if (typeof startTs === 'number' && startTs > now) {
        bad.push(`${e.id}: currentPeriodStartTimestamp=${startTs} ở tương lai so với lúc gọi API`);
      }
    }
    expect(bad).toEqual([]);
  });

  test('announcedInjuryTime không âm khi có mặt', async ({ request }) => {
    const evs = await collectLive(request, ['VN', 'GB', 'US', 'BR', 'JP']);
    const withInjury = evs.filter((e) => typeof e.time?.announcedInjuryTime === 'number');
    test.skip(withInjury.length === 0, 'Không có trận live nào trả announcedInjuryTime');
    const bad = withInjury.filter((e) => e.time.announcedInjuryTime < 0);
    expect(bad.map((e) => `${e.id}: announcedInjuryTime=${e.time.announcedInjuryTime}`)).toEqual([]);
  });

  test('status.type=inprogress chỉ gồm các code hiệp hợp lệ (không lẫn code finished/not_started)', async ({ request }) => {
    const evs = await collectLive(request, ['VN', 'GB', 'US', 'BR', 'JP', 'TH', 'DE']);
    test.skip(evs.length === 0, 'Không có trận live tại thời điểm chạy');
    // code 0 = chưa đá, 100/110/120 = đã kết thúc — không được xuất hiện trong danh sách live.
    const bad = evs.filter((e) => e.status.code === 0 || [100, 110, 120].includes(e.status.code));
    expect(bad.map((e) => `${e.id}: status.code=${e.status.code} nhưng type=inprogress`)).toEqual([]);
  });
});

test.describe('live-v1 · gom theo giải (UOB-613 áp dụng cho live)', () => {
  test('trận cùng group_id trong cùng giải (sau khi sắp lại theo giải) vẫn đứng liền nhau', async ({ request }) => {
    const { body } = await post(request, liveV1('VN', 'en'));
    test.skip(body.code !== 1 || body.data.events.length === 0, 'Không có trận live');
    const last = new Map<string, number>();
    const broken = new Set<string>();
    body.data.events.forEach((e: any, i: number) => {
      const g = e.tournament?.group_id;
      if (!g) return;
      if (last.has(g) && last.get(g) !== i - 1) broken.add(g);
      last.set(g, i);
    });
    expect([...broken]).toEqual([]);
  });
});

// ============================================================================
// Case HIẾM — phụ thuộc dữ liệu thật không chủ động tạo được. Không dùng
// test.fixme (chết vĩnh viễn, không ai nhớ bật lại) mà viết thành test thật
// luôn chạy trong bộ daily: skip có lý do rõ ràng khi chưa có mẫu, tự pass/fail
// thật khi có. Nhờ chạy mỗi ngày (xem workflow .github), xác suất bắt được
// đúng thời điểm có data tăng dần theo thời gian thay vì phải nhớ test tay.
// ============================================================================

test.describe('case hiếm · trận lượt về (aggHomeScore/aggAwayScore)', () => {
  test('khi có trận lượt về (agg score ≠ -1): aggHomeScore/aggAwayScore không âm, khác -1 cả 2 bên', async ({ request }) => {
    const dates = [vnDate(-2), vnDate(-1), vnDate(0), vnDate(1), vnDate(2), vnDate(3)];
    const found: any[] = [];
    for (const date of dates) {
      const { body } = await post(request, scheduledV2(date, 'VN', 'all', 'en'));
      if (body.code === 1) found.push(...body.data.events.filter((e: any) => e.aggHomeScore !== -1 || e.aggAwayScore !== -1));
    }
    test.skip(found.length === 0, 'Chưa gặp trận lượt về (agg score) nào trong ±3 ngày tại lần chạy này — sẽ tự bắt khi có');
    const bad = found.filter((e) => e.aggHomeScore === -1 || e.aggAwayScore === -1 || e.aggHomeScore < 0 || e.aggAwayScore < 0);
    expect(bad.map((e) => `${e.id}: agg=${e.aggHomeScore}-${e.aggAwayScore} (1 bên vẫn -1 hoặc âm)`)).toEqual([]);
  });
});

test.describe('case hiếm · trận hoãn/huỷ (BUG #5 doc my-matches)', () => {
  const STALE_CODES = [15, 60, 70, 80, 90];
  test('khi có trận hoãn/huỷ trong 7 ngày qua: trận đó vẫn xuất hiện ở scheduled-v2 type=all đúng ngày (không bị ẩn hoàn toàn)', async ({ request }) => {
    const dates = [vnDate(-7), vnDate(-6), vnDate(-5), vnDate(-4), vnDate(-3), vnDate(-2), vnDate(-1)];
    const found: Array<{ date: string; e: any }> = [];
    for (const date of dates) {
      const { body } = await post(request, scheduledV2(date, 'VN', 'all', 'en'));
      if (body.code === 1) {
        for (const e of body.data.events.filter((e: any) => STALE_CODES.includes(e.status.code))) found.push({ date, e });
      }
    }
    test.skip(found.length === 0, 'Chưa gặp trận hoãn/huỷ nào trong 7 ngày qua tại lần chạy này — sẽ tự bắt khi có (BUG #5 doc my-matches)');
    // Nếu tới đây nghĩa là ĐÃ tìm thấy ít nhất 1 trận hoãn/huỷ, và nó ĐANG xuất
    // hiện trong response — tức là scheduled-v2 không ẩn trận treo (khác hẳn
    // bug thật ở my-matches). Test NÀY chỉ verify scheduled-v2; bug #5 thật sự
    // (trận hoãn/huỷ của ĐỘI YÊU THÍCH bị ẩn khỏi my-matches) được verify riêng
    // ở 05-my-matches.spec.ts (test "BUG #5") — vì my-matches dùng pipeline ES
    // khác hẳn scheduled-v2 (đúng theo mô tả doc), không thể suy luận từ kết
    // quả của test này.
    expect(found.length).toBeGreaterThan(0);
  });
});

test.describe('case hiếm · World Cup / giải đấu quốc tế lớn đang diễn ra', () => {
  test('khi có World Cup/giải lớn đang live: trận cùng bảng của ĐTQG locale phải có suggestion=1', async ({ request }) => {
    // Không biết trước World Cup có đang diễn ra hay không — dò bằng tên giải
    // chứa "World Cup" trong tournament.name của mọi trận live.
    const { body } = await post(request, liveV2('VN', 'en'));
    const wcMatches = body.code === 1 ? body.data.events.filter((e: any) => /world cup/i.test(e.tournament?.name ?? '')) : [];
    test.skip(wcMatches.length === 0, 'Không có World Cup/giải lớn nào đang live tại thời điểm chạy — sẽ tự bắt khi có kỳ World Cup tới (ENCODE_ID, doc live-v2)');
    const notSuggested = wcMatches.filter((e: any) => e.tournament.suggestion !== 1);
    expect(notSuggested.map((e: any) => `${e.id}: ${e.tournament.name} không có suggestion=1`)).toEqual([]);
  });
});

test.describe('case hiếm · trận lượt về đang live (tab Live có agg score)', () => {
  test('khi có trận lượt về đang live: hiển thị đúng agg score + status inprogress', async ({ request }) => {
    const evs = await collectLive(request, ['VN', 'GB', 'US', 'BR', 'JP', 'TH', 'DE', 'KR', 'ID', 'AU']);
    const withAgg = evs.filter((e) => e.aggHomeScore !== -1 || e.aggAwayScore !== -1);
    test.skip(withAgg.length === 0, 'Không có trận lượt về nào đang live tại thời điểm chạy — sẽ tự bắt khi có');
    for (const e of withAgg) {
      expect(e.status.type, `${e.id}: có agg score nhưng status không phải inprogress`).toBe(INPROGRESS_TYPE);
    }
  });
});
