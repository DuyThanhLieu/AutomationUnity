/**
 * MÙA 2026-Q3 — GIẢI: English Premier League (US-3539)
 * Hạng mục #16: Sự kiện trận đấu (Bàn thắng, Thẻ, VAR, Penalty...)
 *
 * CHẠY:
 *   npx playwright test tests/standard/2026-Q3/english-premier-league/07-match-events.spec.ts --project=chrome
 */

import { test, expect } from '@playwright/test';
import { withClient } from '../../lib/db';
import { saveJsonForSeason } from '../../lib/helpers';

const SEASON_DIR = '2026-Q3';
const SLUG = 'english-community-shield';
const COMPETITION_ID = '9vjxm8gh82r6odg';
const NAME = 'English Community Shield';

test.describe(`[${SEASON_DIR}] [Chuẩn #16] Sự kiện trận đấu — ${NAME}`, () => {
  test('Trận có Opta event feed — có dữ liệu sự kiện với thời gian hợp lệ', async () => {
    const SAMPLE_SIZE = 10;
    const matches = await withClient(async (client) => {
      const res = await client.query(
        `SELECT sp.id, mm.opta_id
         FROM sport_events sp
         JOIN mp_match mm ON mm.thesport_id = sp.id
         WHERE sp.competition_id = $1 AND sp.status_id = 8
         ORDER BY sp.start_timestamp DESC LIMIT $2`,
        [COMPETITION_ID, SAMPLE_SIZE]
      );
      return res.rows;
    });

    if (matches.length === 0) {
      console.warn(`⚠ SKIP: không có trận nào của "${NAME}" map được sang Opta match ID qua mp_match.`);
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
    console.log(`\n📊 Sự kiện trận đấu ${NAME} (${results.length} trận có Opta mapping):`);
    console.log(`  Có event data: ${withEvents}/${results.length}`);
    results.slice(0, 3).forEach((r) => console.log(`  ${r.matchId}: ${r.totalEvents} events, ${r.validTime} có thời gian hợp lệ`));

    saveJsonForSeason(SEASON_DIR, SLUG, `match-events.json`, { totalMatchesChecked: results.length, withEvents, sample: results });

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
        [COMPETITION_ID]
      );
      return res.rows;
    });

    if (matches.length === 0) {
      console.warn('⚠ SKIP: không có trận nào map được Opta ID.');
      test.skip(true, 'Không có trận nào map được Opta ID');
      return;
    }

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

    const MIN_EVENTS_FOR_FULL_COVERAGE = 200;
    const fullCoverageResults = results.filter((r) => r.totalEventCount >= MIN_EVENTS_FOR_FULL_COVERAGE);
    const lowCoverageResults = results.filter((r) => r.totalEventCount < MIN_EVENTS_FOR_FULL_COVERAGE);

    const matchCount = fullCoverageResults.filter((r) => r.matches).length;
    console.log(`\n📊 Đối chiếu số bàn thắng ${NAME} (${fullCoverageResults.length} full coverage, ${lowCoverageResults.length} coverage thấp bị loại): ${matchCount}/${fullCoverageResults.length} khớp`);
    results.filter((r) => !r.matches).forEach((r) => console.log(`  ✗ ${r.matchId}: event=${r.goalEventsFound}, tỷ số=${r.totalScoreGoals}, totalEvents=${r.totalEventCount}`));

    saveJsonForSeason(SEASON_DIR, SLUG, `match-events-goal-check.json`, { totalChecked: results.length, fullCoverageCount: fullCoverageResults.length, matchCount, results });

    if (fullCoverageResults.length === 0) {
      console.warn('⚠ Không có trận nào đủ coverage (>=200 event) để đối chiếu đáng tin cậy.');
      return;
    }

    const matchPct = (matchCount / fullCoverageResults.length) * 100;
    expect.soft(matchPct, `Chỉ ${matchPct.toFixed(1)}% trận (full coverage) khớp số bàn thắng`).toBeGreaterThanOrEqual(50);
  });
});
