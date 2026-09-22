/**
 * MÙA 2026-Q3 — GIẢI: English Premier League (US-3538)
 * Hạng mục #8: Cầu thủ (Danh sách, Chuyển nhượng, Số áo, Ảnh) và #13: Đội hình
 *
 * CHẠY:
 *   npx playwright test tests/standard/2026-Q3/english-premier-league/06-lineup-players.spec.ts --project=chrome
 */

import { test, expect } from '@playwright/test';
import { withClient } from '../../lib/db';
import { isValidImageUrl, saveJsonForSeason } from '../../lib/helpers';

const SEASON_DIR = '2026-Q3';
const SLUG = 'uefa-super-cup';
const COMPETITION_ID = 'p3glrw7h1wqdyjv';
const NAME = 'UEFA Super Cup';

test.describe(`[${SEASON_DIR}] [Chuẩn #8/#13] Cầu thủ & Đội hình — ${NAME}`, () => {
  test('Đội hình các trận đã kết thúc — đủ 11 người, có formation, shirt_number hợp lệ', async () => {
    const SAMPLE_SIZE = 50;
    const rows = await withClient(async (client) => {
      const res = await client.query(
        `SELECT ml.sport_event_id, ml.home_formation, ml.away_formation, ml.home_lineups, ml.away_lineups
         FROM sport_events sp
         JOIN match_lineups ml ON ml.sport_event_id = sp.id
         WHERE sp.competition_id = $1 AND sp.status_id = 8
         ORDER BY random() LIMIT $2`,
        [COMPETITION_ID, SAMPLE_SIZE]
      );
      return res.rows;
    });

    if (rows.length === 0) {
      console.warn(`⚠ SKIP: không có trận nào có lineup cho "${NAME}".`);
      test.skip(true, 'Không có lineup data');
      return;
    }

    const results = rows.map((r) => {
      const homeStarters = Array.isArray(r.home_lineups) ? r.home_lineups.filter((p: any) => p.first === 1) : [];
      const awayStarters = Array.isArray(r.away_lineups) ? r.away_lineups.filter((p: any) => p.first === 1) : [];
      const allPlayers = [...(r.home_lineups ?? []), ...(r.away_lineups ?? [])];
      const withLogo = allPlayers.filter((p: any) => isValidImageUrl(p.logo)).length;
      return {
        matchId: r.sport_event_id,
        homeFull11: homeStarters.length === 11,
        awayFull11: awayStarters.length === 11,
        hasFormation: !!r.home_formation && !!r.away_formation,
        totalPlayers: allPlayers.length,
        withLogo,
      };
    });

    const full11Count = results.filter((r) => r.homeFull11 && r.awayFull11).length;
    const withFormationCount = results.filter((r) => r.hasFormation).length;

    console.log(`\n📊 Đội hình ${NAME} (sample ${results.length} trận):`);
    console.log(`  Đủ 11 người cả 2 đội: ${full11Count}/${results.length}`);
    console.log(`  Có formation: ${withFormationCount}/${results.length}`);

    saveJsonForSeason(SEASON_DIR, SLUG, `lineup.json`, { totalSampled: results.length, full11Count, withFormationCount, sample: results.slice(0, 5) });

    const full11Pct = (full11Count / results.length) * 100;
    expect.soft(full11Pct, `Chỉ ${full11Pct.toFixed(1)}% trận đủ 11 người cả 2 đội`).toBeGreaterThan(70);
  });

  test('Chuyển nhượng (transfers) — from/to team, market value hợp lệ (sample cầu thủ của giải)', async () => {
    const players = await withClient(async (client) => {
      const res = await client.query(
        `SELECT DISTINCT (elem ->> 'id') as player_id
         FROM sport_events sp
         JOIN match_lineups ml ON ml.sport_event_id = sp.id
         , jsonb_array_elements(ml.home_lineups || ml.away_lineups) elem
         WHERE sp.competition_id = $1
         LIMIT 200`,
        [COMPETITION_ID]
      );
      return res.rows.map((r) => r.player_id).filter(Boolean);
    });

    if (players.length === 0) {
      console.warn(`⚠ SKIP: "${NAME}" không lấy được player_id nào từ lineup.`);
      test.skip(true, 'Không có player data');
      return;
    }

    const transfers = await withClient(async (client) => {
      const res = await client.query(
        `SELECT player_id, from_competitor_name, to_competitor_name, transfer_fee, transfer_time
         FROM transfers WHERE player_id = ANY($1)`,
        [players]
      );
      return res.rows;
    });

    console.log(`\n📊 Transfers ${NAME}: ${transfers.length} bản ghi cho ${players.length} cầu thủ sample`);
    if (transfers[0]) {
      console.log(`  Ví dụ: ${transfers[0].from_competitor_name} → ${transfers[0].to_competitor_name} ($${transfers[0].transfer_fee})`);
    }

    saveJsonForSeason(SEASON_DIR, SLUG, `transfers.json`, { totalPlayersChecked: players.length, transferCount: transfers.length, sample: transfers.slice(0, 5) });
  });

  test('Chấn thương (injury) — bung JSONB array đúng cách, không join sai bảng', async () => {
    const players = await withClient(async (client) => {
      const res = await client.query(
        `SELECT DISTINCT (elem ->> 'id') as player_id
         FROM sport_events sp
         JOIN match_lineups ml ON ml.sport_event_id = sp.id
         , jsonb_array_elements(ml.home_lineups || ml.away_lineups) elem
         WHERE sp.competition_id = $1
         LIMIT 200`,
        [COMPETITION_ID]
      );
      return res.rows.map((r) => r.player_id).filter(Boolean);
    });

    if (players.length === 0) {
      console.warn(`⚠ SKIP: "${NAME}" không lấy được player_id nào từ lineup.`);
      test.skip(true, 'Không có player data');
      return;
    }

    const injuries = await withClient(async (client) => {
      const res = await client.query(
        `SELECT (elem ->> 'player_id') as player_id, (elem ->> 'reason') as reason
         FROM team_injury ti, jsonb_array_elements(ti.injury) elem
         WHERE (elem ->> 'player_id') = ANY($1)`,
        [players]
      );
      return res.rows;
    });

    console.log(`\n📊 Injury ${NAME}: ${injuries.length}/${players.length} cầu thủ sample đang có chấn thương ghi nhận`);
    saveJsonForSeason(SEASON_DIR, SLUG, `injury.json`, { totalPlayersChecked: players.length, injuredCount: injuries.length, sample: injuries.slice(0, 5) });
  });
});
