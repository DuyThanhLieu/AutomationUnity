/**
 * MÙA 2026-Q3 — GIẢI: English Premier League (US-3538)
 * Hạng mục #6: Chi tiết trận đấu (Tổng quan, H2H)
 *
 * CHẠY:
 *   npx playwright test tests/standard/2026-Q3/english-premier-league/04-h2h.spec.ts --project=chrome
 */

import { test, expect } from '@playwright/test';
import { withClient } from '../../lib/db';
import { saveJsonForSeason } from '../../lib/helpers';

const SEASON_DIR = '2026-Q3';
const SLUG = 'uefa-super-cup';
const COMPETITION_ID = 'p3glrw7h1wqdyjv';
const NAME = 'UEFA Super Cup';

interface H2HRecord {
  teamA: string;
  teamB: string;
  totalMatches: number;
  teamAWins: number;
  draws: number;
  teamBWins: number;
  teamAGoals: number;
  teamBGoals: number;
}

function calculateH2H(teamA: string, teamB: string, matches: any[]): H2HRecord {
  const h2hMatches = matches.filter(
    (m) => (m.home_team_id === teamA && m.away_team_id === teamB) || (m.home_team_id === teamB && m.away_team_id === teamA)
  );
  let teamAWins = 0, draws = 0, teamBWins = 0, teamAGoals = 0, teamBGoals = 0;
  for (const m of h2hMatches) {
    const home = m.home_score ?? 0;
    const away = m.away_score ?? 0;
    if (m.home_team_id === teamA) {
      teamAGoals += home; teamBGoals += away;
      if (home > away) teamAWins++; else if (home < away) teamBWins++; else draws++;
    } else {
      teamAGoals += away; teamBGoals += home;
      if (away > home) teamAWins++; else if (away < home) teamBWins++; else draws++;
    }
  }
  return { teamA, teamB, totalMatches: h2hMatches.length, teamAWins, draws, teamBWins, teamAGoals, teamBGoals };
}

test.describe(`[${SEASON_DIR}] [Chuẩn #6] H2H — ${NAME}`, () => {
  test('Tính H2H từ các trận đã kết thúc trong DB', async () => {
    const matches = await withClient(async (client) => {
      const res = await client.query(
        `SELECT id, home_team_id, away_team_id,
                (sport_event_status -> 'home_score' ->> 'regular_score')::int as home_score,
                (sport_event_status -> 'away_score' ->> 'regular_score')::int as away_score,
                start_timestamp
         FROM sport_events
         WHERE competition_id = $1 AND status_id = 8
         ORDER BY start_timestamp DESC LIMIT 500`,
        [COMPETITION_ID]
      );
      return res.rows;
    });

    expect(matches.length, `Không có trận đã kết thúc nào cho "${NAME}"`).toBeGreaterThan(0);

    const teamPairs = new Set<string>();
    for (const m of matches.slice(0, 30)) {
      teamPairs.add([m.home_team_id, m.away_team_id].sort().join('|'));
    }

    const h2hRecords: H2HRecord[] = [];
    for (const pair of [...teamPairs].slice(0, 10)) {
      const [teamA, teamB] = pair.split('|');
      const h2h = calculateH2H(teamA, teamB, matches);
      if (h2h.totalMatches > 0) h2hRecords.push(h2h);
    }

    console.log(`\n📊 H2H ${NAME}: ${matches.length} trận, ${h2hRecords.length} cặp đối đầu`);
    h2hRecords.slice(0, 3).forEach((h) => console.log(`  ${h.teamA} vs ${h.teamB}: ${h.teamAWins}W-${h.draws}D-${h.teamBWins}L (${h.teamAGoals}:${h.teamBGoals})`));

    saveJsonForSeason(SEASON_DIR, SLUG, `h2h.json`, { totalMatches: matches.length, h2hRecords });

    expect.soft(h2hRecords.length, 'Không tính được cặp H2H nào').toBeGreaterThan(0);
  });

  test('Thống kê tổng quan: home win rate, tổng bàn thắng, TB bàn/trận', async () => {
    const stats = await withClient(async (client) => {
      const res = await client.query(
        `SELECT
           COUNT(*) as total_matches,
           COUNT(CASE WHEN (sport_event_status -> 'home_score' ->> 'regular_score')::int > (sport_event_status -> 'away_score' ->> 'regular_score')::int THEN 1 END) as home_wins,
           COUNT(CASE WHEN (sport_event_status -> 'home_score' ->> 'regular_score')::int = (sport_event_status -> 'away_score' ->> 'regular_score')::int THEN 1 END) as draws,
           SUM((sport_event_status -> 'home_score' ->> 'regular_score')::int) as total_home_goals,
           SUM((sport_event_status -> 'away_score' ->> 'regular_score')::int) as total_away_goals
         FROM sport_events WHERE competition_id = $1 AND status_id = 8`,
        [COMPETITION_ID]
      );
      return res.rows[0];
    });

    const totalMatches = parseInt(stats.total_matches, 10);
    expect(totalMatches, 'Không có trận nào để tính thống kê').toBeGreaterThan(0);

    const avgGoals = (parseInt(stats.total_home_goals ?? 0, 10) + parseInt(stats.total_away_goals ?? 0, 10)) / totalMatches;
    console.log(`\n📊 Tổng quan ${NAME}: ${totalMatches} trận, home_wins=${stats.home_wins}, draws=${stats.draws}, TB bàn/trận=${avgGoals.toFixed(2)}`);

    saveJsonForSeason(SEASON_DIR, SLUG, `h2h-overview.json`, { ...stats, avgGoalsPerMatch: avgGoals.toFixed(2) });

    expect.soft(avgGoals, `TB bàn/trận = ${avgGoals.toFixed(2)} — bất thường cho bóng đá (kỳ vọng 1-6)`).toBeGreaterThan(0.3);
    expect.soft(avgGoals, `TB bàn/trận = ${avgGoals.toFixed(2)} — bất thường cho bóng đá (kỳ vọng 1-6)`).toBeLessThan(8);
  });
});
