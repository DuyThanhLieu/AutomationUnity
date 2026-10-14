/**
 * US-4795 — bug CHỈ lộ ra khi so sánh data CÙNG 1 trận giữa 2 LẦN CHẠY DAILY
 * KHÁC NHAU (hôm qua vs hôm nay), không phải trong 1 lần gọi API đơn lẻ. Đây
 * là lớp test không thể viết được nếu chỉ test API tại 1 thời điểm — tận dụng
 * đúng lợi thế "chạy mỗi ngày, data mỗi ngày khác nhau" mà các file 01-09
 * chưa khai thác (chúng đều so sánh trong CÙNG 1 lần gọi: V1 vs V2, UI vs
 * API, locale A vs locale B).
 *
 * CƠ CHẾ: đọc file baseline (./.baseline/matches.json, committed từ lần chạy
 * TRƯỚC), gọi lại API hôm nay cho đúng những trận đó + vài ngày gần đây, so
 * sánh, rồi ghi đè baseline mới cho lần chạy KẾ TIẾP đọc. Workflow .github
 * chịu trách nhiệm commit lại file baseline sau mỗi lần chạy (xem bước
 * "Commit baseline" trong us-4795-home-matches-daily.yml).
 *
 * QUAN TRỌNG: lần chạy ĐẦU TIÊN (chưa có baseline, hoặc baseline rỗng) mọi
 * test so sánh đều tự skip — đây không phải lỗi, chỉ là chưa có gì để so
 * sánh. Giá trị thật của file này tích luỹ dần qua nhiều ngày chạy liên tiếp.
 *
 * CHẠY: npx playwright test tests/standard/2026-Q3-task-4795-home-matches/10-cross-day-regression.spec.ts --project=chrome
 */
import { test, expect } from '@playwright/test';
import { post, vnDate, scheduledV2 } from './lib/home-client';
import { loadBaseline, saveBaseline, toSnapshot, pruneOldEntries, type Baseline, type MatchSnapshot } from './lib/baseline';

const TODAY = vnDate(0);
const RECENT_DATES = [vnDate(-3), vnDate(-2), vnDate(-1), TODAY, vnDate(1), vnDate(2)];
const NOW_ISO = new Date().toISOString();

/** Gom toàn bộ events trong vài ngày gần đây 1 lần, dùng chung cho mọi test
 *  trong file (tránh gọi lại API nhiều lần cho cùng 1 việc). */
async function collectRecent(request: any): Promise<{ byId: Map<string, any>; byDate: Map<string, any[]> }> {
  const byId = new Map<string, any>();
  const byDate = new Map<string, any[]>();
  for (const date of RECENT_DATES) {
    const { body } = await post(request, scheduledV2(date, 'VN', 'all', 'en'));
    if (body.code !== 1) continue;
    byDate.set(date, body.data.events);
    for (const e of body.data.events) byId.set(e.id, e);
  }
  return { byId, byDate };
}

test.describe.configure({ mode: 'serial' }); // baseline đọc/ghi tuần tự, tránh race giữa các test cùng file

let oldBaseline: Baseline;
let current: { byId: Map<string, any>; byDate: Map<string, any[]> };

test.beforeAll(async ({ request }) => {
  oldBaseline = loadBaseline();
  current = await collectRecent(request);
});

test.describe('cross-day · tỷ số trận đã finished KHÔNG được đổi sau khi baseline đã ghi nhận', () => {
  test('mọi trận finished trong baseline cũ, nếu vẫn finished hôm nay, phải giữ nguyên tỷ số', () => {
    const finishedBefore = Object.values(oldBaseline).filter((s) => s.statusType === 'finished');
    test.skip(finishedBefore.length === 0, 'Baseline chưa có trận finished nào để so sánh (có thể là lần chạy đầu tiên)');

    const bad: string[] = [];
    let compared = 0;
    for (const snap of finishedBefore) {
      const now = current.byId.get(snap.id);
      if (!now) continue; // trận ngoài cửa sổ ngày đang quét hôm nay — không phải lỗi, bỏ qua (xem test "biến mất" riêng)
      if (now.status.type !== 'finished') continue; // đổi trạng thái khỏi finished là chuyện khác (hiếm, không phải scope test này)
      compared++;
      const nowHome = now.homeScore?.display ?? null;
      const nowAway = now.awayScore?.display ?? null;
      if (nowHome !== snap.homeDisplay || nowAway !== snap.awayDisplay) {
        bad.push(
          `${snap.id} (${snap.homeTeam} vs ${snap.awayTeam}, ${snap.date}): baseline ghi ${snap.homeDisplay}-${snap.awayDisplay} ` +
          `(lúc ${snap.lastSeenAt}) nhưng hôm nay trả ${nowHome}-${nowAway} — tỷ số trận ĐÃ KẾT THÚC bị đổi sau khi ghi nhận`
        );
      }
    }
    test.skip(compared === 0, 'Không có trận nào trong baseline còn nằm trong cửa sổ ngày quét hôm nay để đối chiếu');
    expect(bad).toEqual([]);
  });

  test('startTimestamp của trận đã ghi nhận trong baseline không âm thầm đổi (trừ khi vẫn chưa đá)', () => {
    const entries = Object.values(oldBaseline);
    test.skip(entries.length === 0, 'Baseline rỗng (lần chạy đầu tiên)');

    const bad: string[] = [];
    let compared = 0;
    for (const snap of entries) {
      const now = current.byId.get(snap.id);
      if (!now) continue;
      // Trận CHƯA ĐÁ có thể dời lịch hợp lệ (thông báo trước) — chỉ coi là bug
      // khi trận ĐÃ TỪNG finished/inprogress (tức giờ đá thật đã xảy ra rồi)
      // mà startTimestamp vẫn bị ghi đè khác đi, hoặc khi trận not_started mà
      // giờ đá mới lại ở QUÁ KHỨ so với giờ cũ (dời lùi về trước, bất thường).
      if (snap.statusType === 'finished' || snap.statusType === 'inprogress') {
        compared++;
        if (now.startTimestamp !== snap.startTimestamp) {
          bad.push(`${snap.id} (${snap.homeTeam} vs ${snap.awayTeam}): đã ${snap.statusType} nhưng startTimestamp đổi từ ${snap.startTimestamp} → ${now.startTimestamp}`);
        }
      }
    }
    test.skip(compared === 0, 'Không có trận finished/inprogress nào trong baseline để đối chiếu startTimestamp');
    expect(bad).toEqual([]);
  });
});

test.describe('cross-day · trận không được biến mất khỏi lịch sử', () => {
  test('trận finished trong baseline cũ, đúng ngày đó vẫn còn nằm trong cửa sổ quét hôm nay → phải vẫn xuất hiện', () => {
    // Chỉ xét trận có `date` còn nằm trong RECENT_DATES hôm nay — nếu baseline
    // đã trôi ra khỏi cửa sổ ±3 ngày thì "không thấy" là bình thường (đã quét
    // ra ngoài phạm vi), không phải bug.
    const inWindow = Object.values(oldBaseline).filter((s) => s.statusType === 'finished' && RECENT_DATES.includes(s.date));
    test.skip(inWindow.length === 0, 'Không có trận finished nào trong baseline còn nằm trong cửa sổ ngày quét hôm nay');

    const missing = inWindow.filter((s) => !current.byId.has(s.id));
    const report = missing.map((s) => `${s.id} (${s.homeTeam} vs ${s.awayTeam}, ${s.tournament}, ngày ${s.date}) — ghi nhận lần đầu ${s.firstSeenAt}, lần cuối thấy ${s.lastSeenAt}`);
    // Cho phép sai số rất nhỏ (dữ liệu API có thể dọn trận lỗi/trùng hiếm gặp)
    // nhưng phần lớn phải còn nguyên — đây là tín hiệu MẤT DỮ LIỆU thật nếu tỷ
    // lệ cao, nghiêm trọng hơn nhiều so với 1 bug hiển thị UI thông thường.
    const threshold = Math.max(1, Math.ceil(inWindow.length * 0.02));
    expect(report.length, `${report.length}/${inWindow.length} trận finished đã ghi nhận trước đó BIẾN MẤT khỏi API hôm nay:\n${report.join('\n')}`).toBeLessThanOrEqual(threshold);
  });
});

test.describe('cross-day · trận không được kẹt mãi ở 1 trạng thái "treo"', () => {
  const STALE_CODES = [0, 1, 15, 60, 70, 80, 90];
  test('trận đã treo (chưa đá/hoãn/gián đoạn) từ ≥3 ngày trước baseline, hôm nay vẫn còn treo y hệt → nghi ngờ data chết', () => {
    const now = Date.now();
    const staleOld = Object.values(oldBaseline).filter((s) => {
      if (!STALE_CODES.includes(s.statusCode)) return false;
      const firstSeenMs = new Date(s.firstSeenAt).getTime();
      return (now - firstSeenMs) / 86_400_000 >= 3; // đã treo liên tục ít nhất 3 ngày kể từ lần đầu ghi nhận
    });
    test.skip(staleOld.length === 0, 'Chưa có trận nào treo đủ lâu (≥3 ngày) trong baseline để kiểm tra — bình thường ở vài lần chạy đầu');

    const stillStale = staleOld.filter((s) => {
      const nowEvent = current.byId.get(s.id);
      return nowEvent && STALE_CODES.includes(nowEvent.status.code) && nowEvent.status.code === s.statusCode;
    });
    const report = stillStale.map((s) => `${s.id} (${s.homeTeam} vs ${s.awayTeam}): kẹt ở status.code=${s.statusCode} liên tục từ ${s.firstSeenAt} tới nay (startTimestamp gốc ${new Date(s.startTimestamp * 1000).toISOString()})`);
    // Đây là CẢNH BÁO cần người xem lại thủ công, không hẳn lúc nào cũng là
    // bug code (có thể do trận thật sự bị huỷ vĩnh viễn và nguồn dữ liệu cố ý
    // giữ nguyên) — nhưng đáng được liệt kê ra để QA/dev xác nhận, không nên
    // im lặng bỏ qua. Không hard-fail cứng, chỉ báo khi số lượng bất thường.
    if (report.length > 0) {
      test.info().annotations.push({ type: 'stale-data-warning', description: report.join('\n') });
    }
    expect(report.length, `${report.length} trận treo liên tục ≥3 ngày không có tiến triển — cần xem lại thủ công:\n${report.join('\n')}`).toBeLessThanOrEqual(5);
  });
});

test.describe('cross-day · otherCompetitions không giảm đột ngột bất thường giữa 2 ngày liên tiếp', () => {
  test('tổng match_count hôm nay không thấp hơn quá nhiều so với hôm qua cùng khung giờ (phát hiện mất dữ liệu diện rộng)', async ({ request }) => {
    const [todayRes, yesterdayRes] = await Promise.all([
      post(request, scheduledV2(TODAY, 'VN', 'all', 'en')),
      post(request, scheduledV2(vnDate(-1), 'VN', 'all', 'en')),
    ]);
    test.skip(todayRes.body.code !== 1 || yesterdayRes.body.code !== 1, 'API không trả code 1 cho 1 trong 2 ngày');
    const sumToday = todayRes.body.data.otherCompetitions.reduce((s: number, g: any) => s + g.match_count, 0) + todayRes.body.data.events.length;
    const sumYesterday = yesterdayRes.body.data.otherCompetitions.reduce((s: number, g: any) => s + g.match_count, 0) + yesterdayRes.body.data.events.length;
    test.skip(sumYesterday < 20, 'Hôm qua có quá ít trận để làm mốc so sánh đáng tin cậy');
    // Số trận/ngày dao động tự nhiên theo lịch thi đấu thật (cuối tuần nhiều
    // hơn giữa tuần) — không đặt ngưỡng cứng tuyệt đối, chỉ bắt sụt giảm RẤT
    // lớn (>70%) kiểu đặc trưng của lỗi pipeline/mất kết nối nguồn dữ liệu,
    // không phải biến động lịch thi đấu bình thường.
    const dropRatio = 1 - sumToday / sumYesterday;
    expect(dropRatio, `Tổng trận hôm nay (${sumToday}) giảm ${(dropRatio * 100).toFixed(0)}% so với hôm qua (${sumYesterday}) — nghi ngờ mất dữ liệu diện rộng, không phải biến động lịch thi đấu thường`).toBeLessThan(0.7);
  });
});

test.afterAll(() => {
  // Ghi baseline MỚI cho lần chạy KẾ TIẾP đọc — gộp baseline cũ (giữ
  // firstSeenAt gốc) với toàn bộ trận vừa quét được hôm nay, rồi prune bớt
  // entry đã quá cũ để file không phình to vô hạn theo thời gian.
  const merged: Baseline = { ...oldBaseline };
  for (const [date, events] of current.byDate.entries()) {
    for (const e of events) {
      merged[e.id] = toSnapshot(e, date, NOW_ISO, oldBaseline[e.id]);
    }
  }
  const pruned = pruneOldEntries(merged, TODAY, 14);
  saveBaseline(pruned);
});
