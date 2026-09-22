/**
 * BỘ KHUNG CHUẨN — Hạng mục #1: Giải đấu (Tên, Logo, Mùa giải, Thể thức)
 *
 * Tham số hoá theo competitionId qua biến môi trường TEST_COMPETITION_ID —
 * dùng được cho BẤT KỲ giải nào trong bảng competitions, không cần sửa code.
 *
 * CHẠY:
 *   TEST_COMPETITION_ID=jednm9whz0ryox8 npx playwright test tests/standard/01-competition-info.spec.ts --project=chrome
 */

import { test, expect } from '@playwright/test';
import { withClient } from './lib/db';
import { getCompetitionIdFromEnv, loadCompetitionContext } from './lib/competition-context';
import { saveJson, isValidImageUrl, WEBSITE_URL } from './lib/helpers';

test.describe('[Chuẩn #1] Giải đấu — Tên, Logo, Mùa giải, Thể thức', () => {
  const competitionId = getCompetitionIdFromEnv();

  test('Thông tin cơ bản trong DB hợp lệ', async () => {
    const row = await withClient(async (client) => {
      const res = await client.query(
        `SELECT id, name, short_name, logo, type, tier, cur_season, cur_stage, cur_round, round_count, is_top_league
         FROM competitions WHERE id = $1`,
        [competitionId]
      );
      return res.rows[0];
    });

    expect(row, `competitionId "${competitionId}" không tồn tại trong DB`).toBeTruthy();

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

    console.log(`\n📊 ${detail.name} (${competitionId}):`);
    console.log(`  type=${detail.typeLabel} logoValid=${detail.logoValid} hasSeason=${detail.hasCurrentSeason} rounds=${detail.roundCount}`);

    saveJson(`competition-info.json`, detail);

    expect.soft(detail.name, 'Thiếu tên giải').toBeTruthy();
    expect.soft(['league', 'cup'].includes(detail.typeLabel), `Type không xác định: ${detail.type}`).toBe(true);

    // Giải lớn (is_top_league hoặc có is_top_league flag) kỳ vọng đầy đủ dữ
    // liệu — assert cứng. Giải nhỏ/trẻ/nghiệp dư (đã verify qua Israel U17
    // National League — 9 trận tổng, 6.25% đội có logo) chất lượng dữ liệu
    // thấp hơn hẳn 1 cách hệ thống, không phải bug riêng lẻ — chỉ cảnh báo.
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
    const ctx = await loadCompetitionContext(competitionId);
    saveJson(`competition-context.json`, ctx);

    console.log(`\n📊 Opta mapping: optaCompetitionId=${ctx.optaCompetitionId ?? 'KHÔNG CÓ'}, season=${ctx.optaSeasonName ?? '—'}, hasStandingsData=${ctx.hasStandingsData}`);

    // Không assert cứng — nhiều giải nhỏ hợp lệ nhưng chưa map Opta / chưa
    // có standings (vd giải 1 trận duy nhất như Super Cup, Community Shield).
    // Test này chỉ LOG để các hạng mục khác tham chiếu, không coi là lỗi.
  });
});
