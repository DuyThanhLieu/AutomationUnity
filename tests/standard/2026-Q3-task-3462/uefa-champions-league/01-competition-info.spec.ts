/**
 * MÙA 2026-Q3 — GIẢI: English Premier League (US-3541)
 * Hạng mục #1: Giải đấu (Tên, Logo, Mùa giải, Thể thức)
 *
 * File này HARD-CODE cho ĐÚNG 1 giải, KHÔNG dùng biến môi trường như bản
 * template (tests/standard/_template/01-competition-info.spec.ts). Khi có
 * mùa mới, copy từ _template/, không copy từ đây.
 *
 * CHẠY:
 *   npx playwright test tests/standard/2026-Q3/english-premier-league/01-competition-info.spec.ts --project=chrome
 */

import { test, expect } from '@playwright/test';
import { withClient } from '../../lib/db';
import { loadCompetitionContext } from '../../lib/competition-context';
import { isValidImageUrl, saveJsonForSeason } from '../../lib/helpers';

const SEASON_DIR = '2026-Q3';
const SLUG = 'uefa-champions-league';
const COMPETITION_ID = 'z8yomo4h7wq0j6l';
const NAME = 'UEFA Champions League';

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
});
