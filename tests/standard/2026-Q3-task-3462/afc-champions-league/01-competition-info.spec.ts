/**
 * MÙA 2026-Q3 — GIẢI: AFC Champions League (US-3537)
 * Hạng mục #1: Giải đấu (Tên, Logo, Mùa giải, Thể thức)
 *
 * File này HARD-CODE cho ĐÚNG 1 giải, KHÔNG dùng biến môi trường như bản
 * template (tests/standard/_template/01-competition-info.spec.ts). Khi có
 * mùa mới, copy từ _template/, không copy từ đây.
 *
 * CHẠY:
 *   npx playwright test tests/standard/2026-Q3-task-3462/afc-champions-league/01-competition-info.spec.ts --project=chrome
 */

import { test, expect } from '@playwright/test';
import { withClient } from '../../lib/db';
import { loadCompetitionContext } from '../../lib/competition-context';
import { isValidImageUrl, saveJsonForSeason } from '../../lib/helpers';

const SEASON_DIR = '2026-Q3';
const SLUG = 'afc-champions-league';
const COMPETITION_ID = 'z8yomo4hg66q0j6';
const NAME = 'AFC Champions League';

test.describe(`[${SEASON_DIR}] [Chuẩn #1] Giải đấu — ${NAME}`, () => {
  test('Thông tin cơ bản trong DB hợp lệ', async () => {
    const row = await withClient(async (client) => {
      const res = await client.query(
        `SELECT id, name, short_name, logo, type, tier, cur_season, cur_stage, cur_round, round_count, is_top_league
         FROM competitions WHERE id = $1`,
        [COMPETITION_ID]
      );
      return res.rows[0];
    });

    expect(row, `competitionId "${COMPETITION_ID}" (${NAME}) không tồn tại trong DB`).toBeTruthy();

    const detail = {
      id: row.id,
      name: row.name,
      shortName: row.short_name,
      logo: row.logo,
      logoValid: isValidImageUrl(row.logo),
      type: row.type,
      typeLabel: row.type === 1 ? 'league' : row.type === 2 ? 'cup' : 'unknown',
      hasCurrentSeason: !!row.cur_season,
      roundCount: row.round_count,
      isTopLeague: row.is_top_league,
    };

    console.log(`\n📊 ${detail.name} (${COMPETITION_ID}):`);
    console.log(`  type=${detail.typeLabel} logoValid=${detail.logoValid} hasSeason=${detail.hasCurrentSeason} rounds=${detail.roundCount}`);

    saveJsonForSeason(SEASON_DIR, SLUG, `competition-info.json`, detail);

    expect.soft(detail.name, 'Thiếu tên giải').toBeTruthy();
    expect.soft(['league', 'cup'].includes(detail.typeLabel), `Type không xác định: ${detail.type}`).toBe(true);

    if (detail.isTopLeague) {
      expect.soft(detail.logoValid, `Logo không hợp lệ: ${detail.logo}`).toBe(true);
      expect.soft(detail.hasCurrentSeason, 'Chưa có cur_season — giải chưa sẵn sàng cho mùa mới').toBe(true);
      if (detail.typeLabel === 'league') {
        expect.soft(detail.roundCount, 'Giải league phải có round_count > 1').toBeGreaterThan(1);
      }
    } else {
      if (!detail.logoValid) console.warn(`⚠ Giải nhỏ "${detail.name}": logo không hợp lệ (${detail.logo}) — không assert cứng`);
      if (!detail.hasCurrentSeason) console.warn(`⚠ Giải nhỏ "${detail.name}": chưa có cur_season — không assert cứng`);
    }
  });

  test('Context Opta mapping — dùng để các hạng mục khác (BXH...) biết có chạy được không', async () => {
    const ctx = await loadCompetitionContext(COMPETITION_ID);
    saveJsonForSeason(SEASON_DIR, SLUG, `competition-context.json`, ctx);
    saveJsonForSeason(SEASON_DIR, SLUG, `context.json`, ctx);

    console.log(`\n📊 Opta mapping (${NAME}): optaCompetitionId=${ctx.optaCompetitionId ?? 'KHÔNG CÓ'}, season=${ctx.optaSeasonName ?? '—'}, hasStandingsData=${ctx.hasStandingsData}`);
  });

  test('Metadata giải — màu thương hiệu, đội vô địch nhiều nhất, đội đang giữ cúp', async () => {
    const row = await withClient(async (client) => {
      const res = await client.query(`SELECT primary_color, secondary_color, most_titles, title_holder, newcomers FROM competitions WHERE id = $1`, [COMPETITION_ID]);
      return res.rows[0];
    });

    const mostTitlesTeamIds = Array.isArray(row.most_titles?.[0]) ? row.most_titles[0] : [];
    const titleHolderTeamId = row.title_holder?.[0] ?? null;
    const teamIdsToCheck = [...mostTitlesTeamIds, titleHolderTeamId].filter(Boolean);

    if (teamIdsToCheck.length === 0) {
      console.warn(`⚠ SKIP: "${NAME}" không có most_titles/title_holder để kiểm tra.`);
      test.skip(true, 'Không có metadata most_titles/title_holder');
      return;
    }

    const foundTeams = await withClient(async (client) => {
      const res = await client.query(`SELECT id, name FROM ts_teams WHERE id = ANY($1)`, [teamIdsToCheck]);
      return res.rows;
    });

    console.log(`\n📊 Metadata ${NAME}: most_titles=${row.most_titles?.[1]} lần (team_id=${mostTitlesTeamIds.join(',')}), title_holder=${titleHolderTeamId}`);
    console.log(`  team_id tham chiếu: ${foundTeams.length}/${teamIdsToCheck.length} hợp lệ — ${foundTeams.map((t) => t.name).join(', ')}`);

    saveJsonForSeason(SEASON_DIR, SLUG, `competition-metadata.json`, { mostTitlesCount: row.most_titles?.[1], teamIdsChecked: teamIdsToCheck.length, teamIdsFound: foundTeams.length, foundTeams });

    expect(foundTeams.length, `${teamIdsToCheck.length - foundTeams.length}/${teamIdsToCheck.length} team_id trong most_titles/title_holder KHÔNG tồn tại thật trong ts_teams — dữ liệu tham chiếu mồ côi`).toBe(teamIdsToCheck.length);
  });
});
