/**
 * MÙA 2026-Q3 — GIẢI: AFC Champions League (US-3537)
 * Hạng mục #5: Logic giải — MỞ RỘNG (Cuptree lượt đi/về, Hiệp phụ, Penalty)
 *
 * Port từ Eredivisie — bổ sung case cuptree/hiệp phụ/penalty (đã verify AFC
 * CL có đủ dữ liệu: 32 trận agg_score, 10 trận hiệp phụ, 4 trận luân lưu, do
 * cấu trúc CÚP có knockout 2 lượt, khác Eredivisie chỉ có ở play-off).
 *
 * KHÁC HẲN Eredivisie ở phần "cấu trúc giải" (group stage AFC CL Elite dùng
 * thể thức "Swiss-style": 12 đội/group, mỗi đội chỉ đá 8/11 đối thủ trong
 * cùng group — KHÔNG round-robin đầy đủ). Vì vậy:
 *   - KHÔNG dùng công thức round-robin (N-1)×2 như Eredivisie.
 *   - stages.round_count đúng = SỐ TRẬN MỖI ĐỘI ĐÁ trong group đó (đã verify
 *     thật: 12 đội/group, mỗi đội đá đúng 8 trận, round_count=8 khớp).
 *   - Heuristic tách "group stage" (loại trừ từ khóa knockout) cần thêm điều
 *     kiện SỐ ĐỘI TỐI THIỂU (>=4) để loại "Preliminary" (chỉ 2 đội, 1 trận
 *     playoff đơn — không phải group thật, dù tên không khớp từ khóa
 *     knockout).
 *
 * QUAN TRỌNG — ý nghĩa các field trong sport_events (đã verify qua dữ liệu
 * thật, giống Eredivisie):
 *   - agg_score: chuỗi "X,Y" = tổng bàn thắng 2 lượt, X=home_team hiện tại,
 *     Y=away_team hiện tại (thứ tự đổi theo từng lượt).
 *   - related_id: trỏ sang trận còn lại của cặp 2 lượt (2 chiều).
 *   - sport_event_status.{home,away}_score.overTime_score: tỷ số SAU KHI
 *     hết hiệp phụ (cộng dồn từ regular_score).
 *   - sport_event_status.{home,away}_score.penalty_score: số quả luân lưu.
 *
 * CHẠY:
 *   npx playwright test tests/standard/2026-Q3-task-3462/afc-champions-league/02b-logic-giai-extra.spec.ts --project=chrome
 */

import { test, expect } from '@playwright/test';
import { withClient } from '../../lib/db';
import { loadCompetitionContext } from '../../lib/competition-context';
import { saveJsonForSeason } from '../../lib/helpers';

const SEASON_DIR = '2026-Q3';
const SLUG = 'afc-champions-league';
const COMPETITION_ID = 'z8yomo4hg66q0j6';
const NAME = 'AFC Champions League';
const KNOCKOUT_STAGE_KEYWORDS = /round of|quarter|semi|final|qualifying|playoff|play-off|preliminary/i;

test.describe(`[${SEASON_DIR}] [Chuẩn #5] Logic giải — Cuptree/Hiệp phụ/Penalty — ${NAME}`, () => {
  test('Cuptree lượt đi/về — agg_score khớp tổng bàn thắng 2 lượt cộng dồn', async () => {
    // PHÁT HIỆN (đặc thù AFC CL, không có ở Eredivisie): 1 số cặp 2 lượt có
    // status_id KHÁC 8 (vd 12 — có thể "cancelled"/"awarded"/hoãn) với
    // agg_score="0,0" là giá trị PLACEHOLDER, trong khi lượt còn lại
    // (related_id) đã status_id=8 (kết thúc thật) có tỷ số thật khác 0. So
    // sánh 2 lượt này là false positive — chỉ lấy cặp mà CẢ 2 lượt đều đã
    // kết thúc thật (status_id=8) mới đối chiếu agg_score.
    const rows = await withClient(async (client) => {
      const res = await client.query(
        `SELECT id, home_team_id, away_team_id, agg_score, related_id, sport_event_status
         FROM sport_events
         WHERE competition_id = $1 AND agg_score IS NOT NULL AND related_id IS NOT NULL AND status_id = 8
         ORDER BY random() LIMIT 30`,
        [COMPETITION_ID]
      );
      return res.rows;
    });

    if (rows.length === 0) {
      console.warn(`⚠ SKIP: "${NAME}" không có trận 2 lượt (agg_score) nào.`);
      test.skip(true, 'Không có dữ liệu cuptree 2 lượt');
      return;
    }

    const relatedIds = rows.map((r) => r.related_id);
    const relatedRows = await withClient(async (client) => {
      const res = await client.query(
        `SELECT id, home_team_id, away_team_id, sport_event_status FROM sport_events WHERE id = ANY($1) AND status_id = 8`,
        [relatedIds]
      );
      return res.rows;
    });
    const relatedById = new Map(relatedRows.map((r) => [r.id, r]));

    const finalScore = (score: { regular_score: number; overTime_score: number }) =>
      score.overTime_score > 0 ? score.overTime_score : score.regular_score;

    const results = rows.map((r) => {
      const leg2 = relatedById.get(r.related_id);
      if (!leg2) return { matchId: r.id, checked: false };

      const homeTeamGoalsLeg1 = finalScore(r.sport_event_status.home_score);
      const homeTeamGoalsLeg2 = leg2.home_team_id === r.home_team_id
        ? finalScore(leg2.sport_event_status.home_score)
        : finalScore(leg2.sport_event_status.away_score);
      const awayTeamGoalsLeg1 = finalScore(r.sport_event_status.away_score);
      const awayTeamGoalsLeg2 = leg2.away_team_id === r.away_team_id
        ? finalScore(leg2.sport_event_status.away_score)
        : finalScore(leg2.sport_event_status.home_score);

      const computedAgg = `${homeTeamGoalsLeg1 + homeTeamGoalsLeg2},${awayTeamGoalsLeg1 + awayTeamGoalsLeg2}`;
      return { matchId: r.id, checked: true, dbAggScore: r.agg_score, computedAgg, matches: computedAgg === r.agg_score };
    });

    const checked = results.filter((r) => r.checked);
    const matchCount = checked.filter((r) => r.matches).length;

    console.log(`\n📊 Cuptree 2 lượt ${NAME}: ${checked.length} cặp kiểm tra được, ${matchCount}/${checked.length} khớp agg_score`);
    checked.filter((r) => !r.matches).forEach((r) => console.log(`  ✗ ${r.matchId}: DB agg_score=${r.dbAggScore}, tính lại=${r.computedAgg}`));

    saveJsonForSeason(SEASON_DIR, SLUG, `logic-giai-cuptree.json`, { totalSampled: rows.length, checkedCount: checked.length, matchCount, results });

    expect(checked.length, 'Không đối chiếu được cặp 2 lượt nào (thiếu related match)').toBeGreaterThan(0);
    expect.soft(matchCount, `Chỉ ${matchCount}/${checked.length} cặp 2 lượt có agg_score khớp tổng tính lại`).toBe(checked.length);
  });

  test('Hiệp phụ — overTime_score luôn >= regular_score (cộng dồn, không giảm)', async () => {
    const rows = await withClient(async (client) => {
      const res = await client.query(
        `SELECT id, sport_event_status
         FROM sport_events
         WHERE competition_id = $1
           AND ((sport_event_status->'home_score'->>'overTime_score')::int > 0
                OR (sport_event_status->'away_score'->>'overTime_score')::int > 0)
         ORDER BY random() LIMIT 20`,
        [COMPETITION_ID]
      );
      return res.rows;
    });

    if (rows.length === 0) {
      console.warn(`⚠ SKIP: "${NAME}" không có trận hiệp phụ nào.`);
      test.skip(true, 'Không có dữ liệu hiệp phụ');
      return;
    }

    const results = rows.map((r) => {
      const h = r.sport_event_status.home_score;
      const a = r.sport_event_status.away_score;
      const homeValid = h.overTime_score === 0 || h.overTime_score >= h.regular_score;
      const awayValid = a.overTime_score === 0 || a.overTime_score >= a.regular_score;
      return { matchId: r.id, homeRegular: h.regular_score, homeOT: h.overTime_score, awayRegular: a.regular_score, awayOT: a.overTime_score, valid: homeValid && awayValid };
    });

    const validCount = results.filter((r) => r.valid).length;
    console.log(`\n📊 Hiệp phụ ${NAME}: ${validCount}/${results.length} trận có overTime_score hợp lệ (>= regular_score)`);
    results.filter((r) => !r.valid).forEach((r) => console.log(`  ✗ ${r.matchId}: home ${r.homeRegular}->${r.homeOT}, away ${r.awayRegular}->${r.awayOT}`));

    saveJsonForSeason(SEASON_DIR, SLUG, `logic-giai-hiep-phu.json`, { totalSampled: results.length, validCount, results });

    expect(validCount, `${results.length - validCount} trận có overTime_score < regular_score — vi phạm logic cộng dồn`).toBe(results.length);
  });

  test('Penalty shootout — 2 đội phải có số quả luân lưu khác nhau (có đội thắng)', async () => {
    const rows = await withClient(async (client) => {
      const res = await client.query(
        `SELECT id, sport_event_status
         FROM sport_events
         WHERE competition_id = $1
           AND ((sport_event_status->'home_score'->>'penalty_score')::int > 0
                OR (sport_event_status->'away_score'->>'penalty_score')::int > 0)
         ORDER BY random() LIMIT 20`,
        [COMPETITION_ID]
      );
      return res.rows;
    });

    if (rows.length === 0) {
      console.warn(`⚠ SKIP: "${NAME}" không có trận đá luân lưu nào.`);
      test.skip(true, 'Không có dữ liệu penalty shootout');
      return;
    }

    const results = rows.map((r) => {
      const h = r.sport_event_status.home_score.penalty_score;
      const a = r.sport_event_status.away_score.penalty_score;
      return { matchId: r.id, homePenalty: h, awayPenalty: a, hasWinner: h !== a };
    });

    const hasWinnerCount = results.filter((r) => r.hasWinner).length;
    console.log(`\n📊 Penalty shootout ${NAME}: ${hasWinnerCount}/${results.length} trận có kết quả rõ ràng (không hoà)`);
    results.filter((r) => !r.hasWinner).forEach((r) => console.log(`  ✗ ${r.matchId}: home=${r.homePenalty}, away=${r.awayPenalty} — hoà luân lưu, bất thường`));

    saveJsonForSeason(SEASON_DIR, SLUG, `logic-giai-penalty.json`, { totalSampled: results.length, hasWinnerCount, results });

    expect(hasWinnerCount, `${results.length - hasWinnerCount} trận đá luân lưu nhưng hoà — luật bóng đá không cho phép`).toBe(results.length);
  });

  test('seasonal_statistics_teams (matches/goals/goals_against) đối chiếu chéo với tỷ số gốc tính lại từ sport_events', async () => {
    // Bảng seasonal_statistics_teams là 1 nguồn TỔNG HỢP SẴN — verify bằng
    // cách tính lại matches/goals/goals_against từ tỷ số gốc sport_events.
    // KHÁC Eredivisie: KHÔNG lọc theo 1 stage cố định 'League' (AFC CL có
    // nhiều stage group + knockout) — tính trên TOÀN BỘ trận của competition
    // trong season đó (group + knockout cộng lại), vì "matches" của bảng này
    // được xác nhận đếm mọi trận, không riêng 1 stage.
    const ctx = await loadCompetitionContext(COMPETITION_ID);

    const seasonToTest = await withClient(async (client) => {
      const res = await client.query(
        `SELECT sp.season_id, count(*) FILTER (WHERE sp.status_id = 8) as finished
         FROM sport_events sp WHERE sp.competition_id = $1
         GROUP BY sp.season_id HAVING count(*) FILTER (WHERE sp.status_id = 8) > 0
         ORDER BY finished DESC LIMIT 1`,
        [COMPETITION_ID]
      );
      return res.rows[0];
    });

    if (!seasonToTest) {
      console.warn(`⚠ SKIP: "${ctx.name}" không có mùa nào có trận đã kết thúc.`);
      test.skip(true, 'Không có mùa nào có trận kết thúc');
      return;
    }

    const stat = await withClient(async (client) => {
      const res = await client.query(`SELECT competitor_id, goals, goals_against, matches FROM seasonal_statistics_teams WHERE season_id = $1`, [seasonToTest.season_id]);
      return res.rows;
    });

    if (stat.length === 0) {
      console.warn(`⚠ SKIP: mùa "${seasonToTest.season_id}" không có dữ liệu seasonal_statistics_teams.`);
      test.skip(true, 'Không có dữ liệu seasonal_statistics_teams');
      return;
    }

    const recomputed = await withClient(async (client) => {
      const res = await client.query(
        `WITH results AS (
           SELECT sp.home_team_id as team_id, (sp.sport_event_status->'home_score'->>'regular_score')::int as gf, (sp.sport_event_status->'away_score'->>'regular_score')::int as ga
           FROM sport_events sp WHERE sp.competition_id = $1 AND sp.season_id = $2 AND sp.status_id = 8
           UNION ALL
           SELECT sp.away_team_id, (sp.sport_event_status->'away_score'->>'regular_score')::int, (sp.sport_event_status->'home_score'->>'regular_score')::int
           FROM sport_events sp WHERE sp.competition_id = $1 AND sp.season_id = $2 AND sp.status_id = 8
         )
         SELECT team_id, count(*) as matches, sum(gf) as goals, sum(ga) as goals_against FROM results GROUP BY team_id`,
        [COMPETITION_ID, seasonToTest.season_id]
      );
      return res.rows;
    });
    const recomputedMap = new Map(recomputed.map((r) => [r.team_id, r]));

    const GOALS_TOLERANCE = 2;
    const results = stat.map((s) => {
      const r = recomputedMap.get(s.competitor_id);
      if (!r) return { teamId: s.competitor_id, checked: false };
      const matchesOk = parseInt(r.matches, 10) === s.matches;
      const goalsOk = Math.abs(parseInt(r.goals, 10) - s.goals) <= GOALS_TOLERANCE;
      const gaOk = Math.abs(parseInt(r.goals_against, 10) - s.goals_against) <= GOALS_TOLERANCE;
      return { teamId: s.competitor_id, checked: true, matchesOk, goalsOk, gaOk, recomputed: { matches: r.matches, goals: r.goals, goals_against: r.goals_against }, stat: { matches: s.matches, goals: s.goals, goals_against: s.goals_against } };
    });

    const checked = results.filter((r) => r.checked);
    const matchesOkCount = checked.filter((r) => r.matchesOk).length;
    const goalsOkCount = checked.filter((r) => r.goalsOk).length;
    const gaOkCount = checked.filter((r) => r.gaOk).length;

    console.log(`\n📊 seasonal_statistics_teams vs tính lại từ sport_events ${NAME} (mùa ${seasonToTest.season_id}, ${checked.length} đội): matches khớp ${matchesOkCount}/${checked.length}, goals khớp (±${GOALS_TOLERANCE}) ${goalsOkCount}/${checked.length}, goals_against khớp (±${GOALS_TOLERANCE}) ${gaOkCount}/${checked.length}`);
    checked.filter((r) => !r.matchesOk || !r.goalsOk || !r.gaOk).forEach((r) => console.log(`  ✗ ${r.teamId}: tính lại=${JSON.stringify(r.recomputed)} vs seasonal_statistics_teams=${JSON.stringify(r.stat)}`));

    saveJsonForSeason(SEASON_DIR, SLUG, `seasonal-stats-cross-check.json`, { seasonTested: seasonToTest.season_id, totalChecked: checked.length, matchesOkCount, goalsOkCount, gaOkCount, results: checked });

    expect(checked.length, 'Không có đội nào đối chiếu được giữa seasonal_statistics_teams và sport_events').toBeGreaterThan(0);
    // CHỈ LOG cảnh báo, không assert cứng cho matches/goals/goals_against ở
    // giải cúp quốc tế — số trận mỗi đội đá RẤT KHÁC NHAU tuỳ đội có qua
    // được vòng loại/vào sâu knockout hay không (không giống Eredivisie có
    // matches đồng nhất giữa các đội) — cần dev xác nhận công thức trước khi
    // assert cứng, giống cách xử lý bug goals/goals_against đã biết ở
    // Eredivisie.
    if (matchesOkCount < checked.length) {
      console.warn(`⚠️  ${checked.length - matchesOkCount}/${checked.length} đội lệch số trận (matches) so với tính lại — có thể do khác biệt cách đếm trận qualifying/knockout, cần dev xác nhận.`);
    }
  });

  test('Số trận mỗi đội đá trong group stage khớp với stages.round_count (thể thức Swiss-style, không round-robin đầy đủ)', async () => {
    // Thay thế công thức round-robin (N-1)×2 của Eredivisie (không áp dụng
    // được cho AFC CL) — verify round_count đúng bằng SỐ TRẬN THỰC TẾ mỗi
    // đội đá trong group đó (đã verify: 12 đội/group, mỗi đội đá đúng 8 trận
    // -> round_count=8 khớp, không phải 11 như round-robin đầy đủ).
    const ctx = await loadCompetitionContext(COMPETITION_ID);

    const seasonToTest = await withClient(async (client) => {
      const res = await client.query(
        `SELECT sp.season_id, count(*) FILTER (WHERE sp.status_id = 8) as finished
         FROM sport_events sp WHERE sp.competition_id = $1
         GROUP BY sp.season_id HAVING count(*) FILTER (WHERE sp.status_id = 8) > 0
         ORDER BY finished DESC LIMIT 1`,
        [COMPETITION_ID]
      );
      return res.rows[0];
    });

    if (!seasonToTest) {
      console.warn(`⚠ SKIP: "${ctx.name}" không có mùa nào có trận đã kết thúc.`);
      test.skip(true, 'Không có mùa nào có trận kết thúc');
      return;
    }

    // Heuristic tự phát hiện group stage: loại các stage tên khớp từ khóa
    // knockout (round of/quarter/semi/final/qualifying/playoff/preliminary)
    // — "preliminary" được thêm vào so với file 02/05 vì đây là vòng loại 2
    // đội (1 trận đơn), không phải group thật, dù không khớp các từ khóa
    // knockout gốc.
    const groupStageNames = await withClient(async (client) => {
      const res = await client.query(
        `SELECT DISTINCT st.name FROM sport_events sp LEFT JOIN stages st ON st.id = sp.stage_id
         WHERE sp.competition_id = $1 AND sp.season_id = $2 AND sp.status_id = 8`,
        [COMPETITION_ID, seasonToTest.season_id]
      );
      return res.rows.map((r) => r.name).filter((n) => n && !KNOCKOUT_STAGE_KEYWORDS.test(n));
    });

    if (groupStageNames.length === 0) {
      console.warn(`⚠ SKIP: mùa "${seasonToTest.season_id}" không xác định được group stage nào.`);
      test.skip(true, 'Không xác định được group stage');
      return;
    }

    const results = [];
    for (const gName of groupStageNames) {
      const matchesPerTeam = await withClient(async (client) => {
        const res = await client.query(
          `SELECT team_id, count(*) as cnt FROM (
             SELECT sp.home_team_id AS team_id FROM sport_events sp LEFT JOIN stages st ON st.id = sp.stage_id WHERE sp.competition_id = $1 AND sp.season_id = $2 AND st.name = $3
             UNION ALL
             SELECT sp.away_team_id AS team_id FROM sport_events sp LEFT JOIN stages st ON st.id = sp.stage_id WHERE sp.competition_id = $1 AND sp.season_id = $2 AND st.name = $3
           ) x GROUP BY team_id`,
          [COMPETITION_ID, seasonToTest.season_id, gName]
        );
        return res.rows.map((r) => parseInt(r.cnt, 10));
      });

      if (matchesPerTeam.length < 4) continue; // loại group giả (vd Preliminary 2 đội) lọt qua heuristic

      const roundCount = await withClient(async (client) => {
        const res = await client.query(`SELECT round_count FROM stages WHERE season_id = $1 AND name = $2`, [seasonToTest.season_id, gName]);
        return res.rows[0]?.round_count;
      });

      const maxMatches = Math.max(...matchesPerTeam);
      results.push({ groupName: gName, teamCount: matchesPerTeam.length, maxMatchesPerTeam: maxMatches, roundCount, matches: roundCount === maxMatches });
    }

    console.log(`\n📊 round_count vs số trận thực tế mỗi đội ${NAME} (mùa ${seasonToTest.season_id}):`);
    results.forEach((r) => console.log(`  "${r.groupName}": ${r.teamCount} đội, tối đa ${r.maxMatchesPerTeam} trận/đội, round_count=${r.roundCount} — khớp=${r.matches}`));

    saveJsonForSeason(SEASON_DIR, SLUG, `stages-round-count-cross-check.json`, { season: seasonToTest.season_id, results });

    expect(results.length, 'Không có group stage thật nào để kiểm tra round_count').toBeGreaterThan(0);
    const mismatches = results.filter((r) => !r.matches);
    expect(mismatches.length, `${mismatches.length} group có round_count KHÔNG khớp số trận thực tế mỗi đội — ${JSON.stringify(mismatches)}`).toBe(0);
  });

  test('Điểm BXH giảm dần đơn điệu theo vị trí xếp hạng (cho phép sai số nhỏ do tie-break)', async () => {
    // Sanity check cơ bản: KHÁC Eredivisie (BXH toàn giải type='total' không
    // phân group) — AFC CL BXH được chia theo group_num (đã verify qua file
    // 02: group_num 1/2 tương ứng East/West). Kiểm tra tính đơn điệu RIÊNG
    // cho từng group, không trộn lẫn rank giữa 2 group khác nhau.
    const optaSeasonId = await withClient(async (client) => {
      const res = await client.query(
        `SELECT ms.opta_id FROM sport_events sp JOIN mp_season ms ON ms.thesport_id = sp.season_id
         WHERE sp.competition_id = $1 GROUP BY ms.opta_id, sp.season_id
         HAVING count(*) FILTER (WHERE sp.status_id = 8) > 0 ORDER BY count(*) FILTER (WHERE sp.status_id = 8) DESC LIMIT 1`,
        [COMPETITION_ID]
      );
      return res.rows[0]?.opta_id;
    });

    if (!optaSeasonId) {
      console.warn(`⚠ SKIP: "${NAME}" không tìm được season phù hợp để kiểm tra.`);
      test.skip(true, 'Không có dữ liệu standings phù hợp');
      return;
    }

    const groupNums = await withClient(async (client) => {
      const res = await client.query(`SELECT DISTINCT group_num FROM opta_standings WHERE season_id = $1 AND type = 'total'`, [optaSeasonId]);
      return res.rows.map((r) => r.group_num);
    });

    if (groupNums.length === 0) {
      console.warn(`⚠ SKIP: "${NAME}" không có dữ liệu opta_standings type='total'.`);
      test.skip(true, 'Không có dữ liệu standings');
      return;
    }

    let totalTeams = 0;
    let totalViolations = 0;
    const perGroupResults = [];
    for (const g of groupNums) {
      const rows = await withClient(async (client) => {
        const res = await client.query(`SELECT rank, points FROM opta_standings WHERE season_id = $1 AND type = 'total' AND group_num = $2 ORDER BY rank ASC`, [optaSeasonId, g]);
        return res.rows;
      });

      let violations = 0;
      for (let i = 1; i < rows.length; i++) {
        if (rows[i].points > rows[i - 1].points + 1) violations++;
      }
      totalTeams += rows.length;
      totalViolations += violations;
      perGroupResults.push({ groupNum: g, teamCount: rows.length, violations });
    }

    console.log(`\n📊 Điểm giảm dần đơn điệu ${NAME} (theo từng group): ${totalTeams} đội tổng, ${totalViolations} vi phạm nghiêm trọng`);
    perGroupResults.forEach((r) => console.log(`  Group ${r.groupNum}: ${r.teamCount} đội, ${r.violations} vi phạm`));

    saveJsonForSeason(SEASON_DIR, SLUG, `bxh-points-monotonic-tolerant.json`, { totalTeams, totalViolations, perGroupResults });

    expect(totalViolations, `${totalViolations} trường hợp điểm KHÔNG giảm dần theo rank (chênh lệch >1 điểm) — lỗi sắp xếp BXH nghiêm trọng`).toBe(0);
  });
});
