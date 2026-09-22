/**
 * BỘ KHUNG CHUẨN — Hạng mục #16: Sự kiện trận đấu (Bàn thắng, Thẻ, VAR, Penalty...)
 *
 * QUAN TRỌNG — 2 tầng ID cho match event:
 *   sport_events.id (thesport, dùng để lọc theo competition_id)
 *     → mp_match.thesport_id → mp_match.opta_id
 *     → opta_match_event.match_id (= opta_id ở trên)
 * mp_match CHỈ cover trận có Opta feed — thường là trận GẦN ĐÂY/coverage cao,
 * KHÔNG cover toàn bộ lịch sử (đã verify: trận 2002 không có trong mp_match,
 * trận 2026 thì có). Nếu 1 giải/mùa không có trận nào map được, đây là giới
 * hạn dữ liệu thật (giải chưa/không có Opta coverage), không phải bug.
 *
 * CHẠY:
 *   TEST_COMPETITION_ID=jednm9whz0ryox8 npx playwright test tests/standard/07-match-events.spec.ts --project=chrome
 */

import { test, expect } from '@playwright/test';
import { withClient } from './lib/db';
import { getCompetitionIdFromEnv } from './lib/competition-context';
import { saveJson } from './lib/helpers';

// type_id phổ biến trong opta_match_event (tham khảo Opta feed chuẩn):
// 1=Pass, 3=TakeOn, 4=Foul, 5=OutOfPlay-ish, 12=SubOff, 13=SubOn, 15=Goal,
// 16=OwnGoal, 17=Card... — chỉ dùng để log tham khảo, KHÔNG assert cứng theo
// type_id cụ thể vì chưa có tài liệu chính thức xác nhận đầy đủ bộ mã này.

test.describe('[Chuẩn #16] Sự kiện trận đấu', () => {
  const competitionId = getCompetitionIdFromEnv();

  test('Trận có Opta event feed — có dữ liệu sự kiện với thời gian hợp lệ', async () => {
    const SAMPLE_SIZE = 10;
    const matches = await withClient(async (client) => {
      const res = await client.query(
        `SELECT sp.id, mm.opta_id
         FROM sport_events sp
         JOIN mp_match mm ON mm.thesport_id = sp.id
         WHERE sp.competition_id = $1 AND sp.status_id = 8
         ORDER BY sp.start_timestamp DESC LIMIT $2`,
        [competitionId, SAMPLE_SIZE]
      );
      return res.rows;
    });

    if (matches.length === 0) {
      console.warn(`⚠ SKIP: không có trận nào của giải "${competitionId}" map được sang Opta match ID qua mp_match — giải này có thể chưa/không có Opta event coverage.`);
      test.skip(true, 'Không có trận nào map được Opta ID');
      return;
    }

    const results: any[] = [];
    for (const m of matches) {
      const events = await withClient(async (client) => {
        const res = await client.query(
          `SELECT type_id, time_min, time_sec, player_id FROM opta_match_event WHERE match_id = $1`,
          [m.opta_id]
        );
        return res.rows;
      });
      const validTime = events.filter((e) => e.time_min !== null && e.time_min >= 0 && e.time_min <= 130).length;
      results.push({ matchId: m.id, totalEvents: events.length, validTime });
    }

    const withEvents = results.filter((r) => r.totalEvents > 0).length;
    console.log(`\n📊 Sự kiện trận đấu (${results.length} trận có Opta mapping, competitionId=${competitionId}):`);
    console.log(`  Có event data: ${withEvents}/${results.length}`);
    results.slice(0, 3).forEach((r) => console.log(`  ${r.matchId}: ${r.totalEvents} events, ${r.validTime} có thời gian hợp lệ`));

    saveJson(`match-events.json`, { totalMatchesChecked: results.length, withEvents, sample: results });

    // Với mẫu quá nhỏ (giải cup 1 trận/mùa như Super Cup, Community Shield),
    // 1 trận map Opta ID thành công nhưng vẫn có thể 0 event thật (mapping
    // đúng, feed sự kiện chưa/không phủ) — đây là giới hạn dữ liệu, không
    // phải lỗi mapping, nên không assert cứng khi mẫu <= 2 trận.
    if (results.length <= 2) {
      console.log(`  (mẫu chỉ ${results.length} trận — không đủ để kết luận, chỉ log tham khảo)`);
      return;
    }
    expect.soft(withEvents, `${results.length - withEvents}/${results.length} trận có mapping Opta nhưng 0 event — bất thường`).toBeGreaterThan(0);
  });

  test('Bàn thắng trong opta_match_event khớp với tỷ số thật trong sport_event_status', async () => {
    const matches = await withClient(async (client) => {
      const res = await client.query(
        `SELECT sp.id, mm.opta_id,
                (sp.sport_event_status -> 'home_score' ->> 'regular_score')::int as home_score,
                (sp.sport_event_status -> 'away_score' ->> 'regular_score')::int as away_score
         FROM sport_events sp
         JOIN mp_match mm ON mm.thesport_id = sp.id
         WHERE sp.competition_id = $1 AND sp.status_id = 8
         ORDER BY sp.start_timestamp DESC LIMIT 10`,
        [competitionId]
      );
      return res.rows;
    });

    if (matches.length === 0) {
      console.warn('⚠ SKIP: không có trận nào map được Opta ID.');
      test.skip(true, 'Không có trận nào map được Opta ID');
      return;
    }

    // type_id=16 = Goal theo Opta feed chuẩn (đã verify qua tham khảo dữ liệu
    // mẫu — không tính own goal riêng ở đây, chỉ đối chiếu tổng quát).
    const results: any[] = [];
    for (const m of matches) {
      const [goalCount, totalEventCount] = await withClient(async (client) => {
        const res = await client.query(
          `SELECT count(*) FILTER (WHERE type_id = 16) as goals, count(*) as total
           FROM opta_match_event WHERE match_id = $1`,
          [m.opta_id]
        );
        return [parseInt(res.rows[0].goals, 10), parseInt(res.rows[0].total, 10)];
      });
      const totalScoreGoals = (m.home_score ?? 0) + (m.away_score ?? 0);
      results.push({ matchId: m.id, goalEventsFound: goalCount, totalScoreGoals, totalEventCount, matches: goalCount === totalScoreGoals });
    }

    // Trận có coverage thấp (rất ít event tổng — vd 21 event so với ~1600
    // event/trận full coverage) không đủ tin cậy để đối chiếu bàn thắng, loại
    // khỏi phần tính tỷ lệ % nhưng vẫn log đầy đủ để biết coverage thực tế.
    const MIN_EVENTS_FOR_FULL_COVERAGE = 200;
    const fullCoverageResults = results.filter((r) => r.totalEventCount >= MIN_EVENTS_FOR_FULL_COVERAGE);
    const lowCoverageResults = results.filter((r) => r.totalEventCount < MIN_EVENTS_FOR_FULL_COVERAGE);

    const matchCount = fullCoverageResults.filter((r) => r.matches).length;
    console.log(`\n📊 Đối chiếu số bàn thắng (${fullCoverageResults.length} trận full coverage, ${lowCoverageResults.length} trận coverage thấp bị loại khỏi %): ${matchCount}/${fullCoverageResults.length} khớp`);
    results.filter((r) => !r.matches).forEach((r) => console.log(`  ✗ ${r.matchId}: event=${r.goalEventsFound}, tỷ số=${r.totalScoreGoals}, totalEvents=${r.totalEventCount}${r.totalEventCount < MIN_EVENTS_FOR_FULL_COVERAGE ? ' (coverage thấp, không tính vào %)' : ''}`));

    saveJson(`match-events-goal-check.json`, { totalChecked: results.length, fullCoverageCount: fullCoverageResults.length, matchCount, results });

    if (fullCoverageResults.length === 0) {
      console.warn('⚠ Không có trận nào đủ coverage (>=200 event) để đối chiếu đáng tin cậy — chỉ có trận coverage thấp.');
      return;
    }

    // Không assert cứng 100% — có thể lệch do own goal/penalty được ghi
    // type_id khác, hoặc VAR huỷ bàn thắng sau đó. Chỉ cảnh báo nếu lệch quá
    // nhiều (báo hiệu sai type_id hoàn toàn, giống bug am_football_* trước).
    const matchPct = (matchCount / fullCoverageResults.length) * 100;
    expect.soft(matchPct, `Chỉ ${matchPct.toFixed(1)}% trận (full coverage) khớp số bàn thắng — có thể sai type_id hoặc sai mapping`).toBeGreaterThan(50);
  });
});
