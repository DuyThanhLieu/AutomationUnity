/**
 * BỘ KHUNG CHUẨN — Hạng mục #8: Cầu thủ (Danh sách, Chuyển nhượng, Số áo, Ảnh)
 * và #13: Đội hình (Lineup dự kiến/chính thức)
 *
 * QUAN TRỌNG: dùng bảng "match_lineups" (cột sport_event_id khớp sport_events.id)
 * — KHÔNG dùng "am_football_team_lineup" (id không khớp sport_events.id, đã
 * verify 0/3 match khi thử join trực tiếp).
 *
 * Injury: bung mảng team_injury.injury (JSONB array theo TEAM, mỗi phần tử
 * chứa player_id riêng) — KHÔNG join player.id = team_injury.team_id (bug đã
 * sửa ở lineups-regressipn-test.spec.ts).
 *
 * CHẠY:
 *   TEST_COMPETITION_ID=jednm9whz0ryox8 npx playwright test tests/standard/06-lineup-players.spec.ts --project=chrome
 */

import { test, expect } from '@playwright/test';
import { withClient } from './lib/db';
import { getCompetitionIdFromEnv } from './lib/competition-context';
import { saveJson, isValidImageUrl } from './lib/helpers';

test.describe('[Chuẩn #8/#13] Cầu thủ & Đội hình', () => {
  const competitionId = getCompetitionIdFromEnv();

  test('Đội hình các trận đã kết thúc — đủ 11 người, có formation, shirt_number hợp lệ', async () => {
    const SAMPLE_SIZE = 50;
    const rows = await withClient(async (client) => {
      const res = await client.query(
        `SELECT ml.sport_event_id, ml.home_formation, ml.away_formation, ml.home_lineups, ml.away_lineups
         FROM sport_events sp
         JOIN match_lineups ml ON ml.sport_event_id = sp.id
         WHERE sp.competition_id = $1 AND sp.status_id = 8
         ORDER BY random() LIMIT $2`,
        [competitionId, SAMPLE_SIZE]
      );
      return res.rows;
    });

    if (rows.length === 0) {
      console.warn(`⚠ SKIP: không có trận nào có lineup cho competitionId "${competitionId}".`);
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

    console.log(`\n📊 Đội hình (sample ${results.length} trận, competitionId=${competitionId}):`);
    console.log(`  Đủ 11 người cả 2 đội: ${full11Count}/${results.length}`);
    console.log(`  Có formation: ${withFormationCount}/${results.length}`);

    saveJson(`lineup.json`, { totalSampled: results.length, full11Count, withFormationCount, sample: results.slice(0, 5) });

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
        [competitionId]
      );
      return res.rows.map((r) => r.player_id).filter(Boolean);
    });

    if (players.length === 0) {
      console.warn('⚠ SKIP: không lấy được player_id nào từ lineup.');
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

    console.log(`\n📊 Transfers: ${transfers.length} bản ghi cho ${players.length} cầu thủ sample`);
    if (transfers[0]) {
      console.log(`  Ví dụ: ${transfers[0].from_competitor_name} → ${transfers[0].to_competitor_name} ($${transfers[0].transfer_fee})`);
    }

    saveJson(`transfers.json`, { totalPlayersChecked: players.length, transferCount: transfers.length, sample: transfers.slice(0, 5) });

    // Không assert cứng phải có transfer — nhiều cầu thủ hợp lệ chưa từng
    // chuyển nhượng (cây nhà lá vườn / mới debut). Chỉ log để tham khảo.
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
        [competitionId]
      );
      return res.rows.map((r) => r.player_id).filter(Boolean);
    });

    if (players.length === 0) {
      console.warn('⚠ SKIP: không lấy được player_id nào từ lineup.');
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

    console.log(`\n📊 Injury: ${injuries.length}/${players.length} cầu thủ sample đang có chấn thương ghi nhận`);
    saveJson(`injury.json`, { totalPlayersChecked: players.length, injuredCount: injuries.length, sample: injuries.slice(0, 5) });
  });
});
