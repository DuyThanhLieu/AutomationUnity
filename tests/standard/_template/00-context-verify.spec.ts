/**
 * VERIFY MODULE NỀN TẢNG: competition-context.ts
 *
 * File này KHÔNG phải test hạng mục — nó verify chính module core mà mọi
 * file test khác trong bộ khung chuẩn sẽ dùng chung. Chạy file này với NHIỀU
 * competitionId khác nhau để đảm bảo logic tra cứu season/mapping ID đúng
 * trước khi tin tưởng dùng cho toàn bộ 12 hạng mục.
 *
 * CHẠY (test lần lượt từng giải để xác nhận context đúng):
 *   TEST_COMPETITION_ID=jednm9whz0ryox8 npx playwright test tests/standard/00-context-verify.spec.ts --project=chrome
 */

import { test, expect } from '@playwright/test';
import { getCompetitionIdFromEnv, loadCompetitionContext } from './lib/competition-context';
import { saveJson } from './lib/helpers';

test.describe('[Core] Competition Context — verify mapping ID đúng', () => {
  test('Context load được và có đủ thông tin cơ bản', async () => {
    const competitionId = getCompetitionIdFromEnv();
    const ctx = await loadCompetitionContext(competitionId);

    console.log(`\n📋 Competition Context cho "${competitionId}":`);
    console.log(`  Tên: ${ctx.name}`);
    console.log(`  Type: ${ctx.type === 1 ? 'league' : ctx.type === 2 ? 'cup' : 'unknown'}`);
    console.log(`  cur_season (thesport): ${ctx.curSeason}`);
    console.log(`  Opta competition_id: ${ctx.optaCompetitionId ?? '(không map được)'}`);
    console.log(`  Opta season: ${ctx.optaSeasonName ?? '(không có)'} (${ctx.optaSeasonId ?? '—'})`);
    console.log(`  Có dữ liệu standings: ${ctx.hasStandingsData}`);

    saveJson(`context.json`, ctx);

    expect(ctx.name, 'Không tìm thấy tên giải — competitionId sai hoặc không tồn tại').toBeTruthy();
    // Không assert cứng optaCompetitionId/hasStandingsData — một số giải nhỏ
    // có thể chưa được map sang Opta hoặc chưa có standings, đây là tình
    // trạng dữ liệu thật cần biết trước khi các file hạng mục khác dùng đến.
    if (!ctx.optaCompetitionId) {
      console.warn(`⚠ Giải "${ctx.name}" chưa có trong mp_competition — hạng mục BXH sẽ không chạy được cho giải này.`);
    } else if (!ctx.hasStandingsData) {
      console.warn(`⚠ Giải "${ctx.name}" map Opta OK nhưng season "${ctx.optaSeasonName}" chưa có dữ liệu opta_standings.`);
    }
  });
});
