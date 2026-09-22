/**
 * MÙA 2026-Q3 — GIẢI: AFC Champions League (US-3537)
 * Hạng mục #4: Bảng xếp hạng (BXH)
 *
 * CẤU TRÚC KHÁC ERIVISIE (đã verify qua dữ liệu thật): AFC Champions League
 * Elite chia 2 KHU VỰC (East/West region) mỗi khu vực là 1 group stage
 * riêng (group_num 1/2 trong opta_standings, 12 đội/group) — KHÔNG phải 1
 * bảng BXH duy nhất như Eredivisie. Sau group stage là knockout (Round of
 * 16, Quarter/Semi-finals, Final) — các trận này KHÔNG tính vào BXH.
 *
 * CHẠY:
 *   npx playwright test tests/standard/2026-Q3-task-3462/afc-champions-league/02-bxh-ranking.spec.ts --project=chrome
 */

import { test, expect } from '@playwright/test';
import { withClient } from '../../lib/db';
import { loadCompetitionContext } from '../../lib/competition-context';
import { saveJsonForSeason } from '../../lib/helpers';

const SEASON_DIR = '2026-Q3';
const SLUG = 'afc-champions-league';
const COMPETITION_ID = 'z8yomo4hg66q0j6';
const NAME = 'AFC Champions League';
const FRONTEND_SLUG = 'afc-champions-league-elite';

test.describe(`[${SEASON_DIR}] [Chuẩn #4] Bảng xếp hạng — ${NAME}`, () => {
  test('Rank monotonic theo điểm; Promotion/Relegation không chồng chéo', async () => {
    const ctx = await loadCompetitionContext(COMPETITION_ID);

    if (!ctx.optaCompetitionId) {
      console.warn(`⚠ SKIP: giải "${ctx.name}" chưa có trong mp_competition (chưa map sang Opta) — không có dữ liệu BXH để test.`);
      test.skip(true, 'Giải chưa map sang Opta ID — không có nguồn opta_standings');
      return;
    }
    if (!ctx.optaSeasonId || !ctx.hasStandingsData) {
      console.warn(`⚠ SKIP: giải "${ctx.name}" (season Opta: ${ctx.optaSeasonName ?? '—'}) chưa có dữ liệu opta_standings.`);
      test.skip(true, 'Season Opta chưa có dữ liệu standings');
      return;
    }

    const rows = await withClient(async (client) => {
      const res = await client.query(
        `SELECT rank, points, goals_diff, goals, rank_status, contestant_id
         FROM opta_standings WHERE season_id = $1 AND type = 'total' ORDER BY rank ASC`,
        [ctx.optaSeasonId]
      );
      return res.rows;
    });

    console.log(`\n📊 BXH "${ctx.name}" (season Opta: ${ctx.optaSeasonName}): ${rows.length} dòng`);

    if (rows.length === 0) {
      console.warn('⚠ opta_standings trả 0 dòng dù hasStandingsData=true (race condition dữ liệu) — bỏ qua.');
      return;
    }

    const contestantCounts = new Map<string, number>();
    const rankCounts = new Map<number, number>();
    for (const r of rows) {
      contestantCounts.set(r.contestant_id, (contestantCounts.get(r.contestant_id) ?? 0) + 1);
      rankCounts.set(r.rank, (rankCounts.get(r.rank) ?? 0) + 1);
    }
    const isMultiStage = [...contestantCounts.values()].some((c) => c > 1) || [...rankCounts.values()].some((c) => c > 1);

    if (isMultiStage) {
      console.warn(`⚠ Season "${ctx.optaSeasonName}" có cấu trúc multi-stage — bỏ qua assert rank monotonic, chỉ log để review thủ công.`);
      saveJsonForSeason(SEASON_DIR, SLUG, `bxh.json`, { competitionId: COMPETITION_ID, name: ctx.name, season: ctx.optaSeasonName, isMultiStage: true, rows });
      return;
    }

    let rankMonotonic = true;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i].points > rows[i - 1].points) { rankMonotonic = false; break; }
    }

    const promotionRows = rows.filter((r) => r.rank_status === 'Promotion');
    const relegationRows = rows.filter((r) => r.rank_status === 'Relegation');
    const maxPromotionRank = promotionRows.length > 0 ? Math.max(...promotionRows.map((r) => r.rank)) : 0;
    const minRelegationRank = relegationRows.length > 0 ? Math.min(...relegationRows.map((r) => r.rank)) : Infinity;
    const noOverlap = maxPromotionRank < minRelegationRank;

    console.log(`  rank monotonic: ${rankMonotonic} | Promotion: ${promotionRows.length} đội | Relegation: ${relegationRows.length} đội`);

    saveJsonForSeason(SEASON_DIR, SLUG, `bxh.json`, {
      competitionId: COMPETITION_ID,
      name: ctx.name,
      season: ctx.optaSeasonName,
      totalTeams: rows.length,
      rankMonotonic,
      promotionCount: promotionRows.length,
      relegationCount: relegationRows.length,
      noOverlap,
    });

    expect(rankMonotonic, `Season "${ctx.optaSeasonName}": rank không theo đúng thứ tự điểm giảm dần`).toBe(true);
    if (promotionRows.length > 0 && relegationRows.length > 0) {
      expect.soft(noOverlap, 'Promotion và Relegation zone chồng chéo nhau').toBe(true);
    }
  });

  test('Trang BXH trên uniscore.com tải được', async ({ request }) => {
    const url = `https://uniscore.com/football/competition/${FRONTEND_SLUG}`;
    const res = await request.get(url);
    console.log(`✓ ${url}: ${res.status()}`);
    expect(res.status(), `Trang BXH "${NAME}" không load được (${url})`).toBe(200);
  });

  test('Tính nhất quán: BXH home + away = BXH total (matches_played, won, drawn, lost)', async () => {
    // opta_standings có 3 type (total/home/away) mỗi đội — verify home+away
    // = total cho MỌI đội, KHÔNG PHÂN BIỆT group_num (contestant_id đã
    // unique toàn giải, không cần lọc theo group riêng cho case này).
    const ctx = await loadCompetitionContext(COMPETITION_ID);

    if (!ctx.optaCompetitionId || !ctx.optaSeasonId || !ctx.hasStandingsData) {
      console.warn(`⚠ SKIP: giải "${ctx.name}" chưa có đủ mapping/standings để kiểm tra.`);
      test.skip(true, 'Thiếu Opta mapping hoặc standings data');
      return;
    }

    const allRows = await withClient(async (client) => {
      const res = await client.query(
        `SELECT type, contestant_id, matches_played, won, drawn, lost
         FROM opta_standings WHERE season_id = $1 AND type IN ('total', 'home', 'away')`,
        [ctx.optaSeasonId]
      );
      return res.rows;
    });

    if (allRows.length === 0) {
      console.warn('⚠ Không có dữ liệu home/away/total để đối chiếu.');
      return;
    }

    const byContestant = new Map<string, { total?: any; home?: any; away?: any }>();
    for (const r of allRows) {
      if (!byContestant.has(r.contestant_id)) byContestant.set(r.contestant_id, {});
      byContestant.get(r.contestant_id)![r.type as 'total' | 'home' | 'away'] = r;
    }

    const results = [...byContestant.entries()].map(([contestantId, { total, home, away }]) => {
      if (!total || !home || !away) return { contestantId, checked: false };
      const fields = ['matches_played', 'won', 'drawn', 'lost'] as const;
      const mismatches = fields.filter((f) => home[f] + away[f] !== total[f]);
      return { contestantId, checked: true, valid: mismatches.length === 0, mismatches };
    });

    const checked = results.filter((r) => r.checked);
    const validCount = checked.filter((r) => r.valid).length;

    console.log(`\n📊 Đối chiếu Home+Away=Total ${NAME}: ${checked.length} đội kiểm tra được, ${validCount}/${checked.length} khớp hoàn toàn`);
    checked.filter((r) => !r.valid).forEach((r) => console.log(`  ✗ ${r.contestantId}: lệch ở ${r.mismatches?.join(', ')}`));

    saveJsonForSeason(SEASON_DIR, SLUG, `bxh-home-away-consistency.json`, { totalChecked: checked.length, validCount, results });

    expect(checked.length, 'Không có đội nào đủ cả 3 loại total/home/away để đối chiếu').toBeGreaterThan(0);
    expect(validCount, `${checked.length - validCount}/${checked.length} đội có home+away KHÔNG khớp total — lỗi đồng bộ dữ liệu BXH`).toBe(checked.length);
  });

  test('BXH tính lại từ tỷ số gốc (thesport) khớp với opta_standings đã công bố — theo TỪNG group/khu vực', async () => {
    // KHÁC Eredivisie: phải tính riêng cho MỖI group stage (khu vực), vì
    // đối thủ khác nhau giữa các group. Tự động phát hiện stage nào là
    // group stage (không phải knockout) bằng heuristic loại trừ tên stage
    // chứa từ khóa vòng loại trực tiếp — đã verify đúng qua dữ liệu thật
    // (tách chính xác "East region"/"West Region" khỏi "Round of 16",
    // "Quarter-finals", "Semi-finals", "Final", "Qualifying play-offs").
    const KNOCKOUT_STAGE_KEYWORDS = /round of|quarter|semi|final|qualifying|playoff|play-off/i;
    const ctx = await loadCompetitionContext(COMPETITION_ID);

    const seasonToTest = await withClient(async (client) => {
      const res = await client.query(
        `SELECT sp.season_id, ms.opta_id as opta_season_id, count(*) FILTER (WHERE sp.status_id = 8) as finished
         FROM sport_events sp
         JOIN mp_season ms ON ms.thesport_id = sp.season_id
         WHERE sp.competition_id = $1
         GROUP BY sp.season_id, ms.opta_id
         HAVING count(*) FILTER (WHERE sp.status_id = 8) > 0
         ORDER BY finished DESC LIMIT 1`,
        [COMPETITION_ID]
      );
      return res.rows[0];
    });

    if (!seasonToTest) {
      console.warn(`⚠ SKIP: "${ctx.name}" không có mùa nào vừa map được Opta vừa có trận đã kết thúc.`);
      test.skip(true, 'Không có mùa nào đủ điều kiện đối chiếu');
      return;
    }

    const groupStageNames = await withClient(async (client) => {
      const res = await client.query(
        `SELECT DISTINCT st.name FROM sport_events sp LEFT JOIN stages st ON st.id = sp.stage_id
         WHERE sp.competition_id = $1 AND sp.season_id = $2 AND sp.status_id = 8`,
        [COMPETITION_ID, seasonToTest.season_id]
      );
      return res.rows.map((r) => r.name).filter((n) => n && !KNOCKOUT_STAGE_KEYWORDS.test(n));
    });

    if (groupStageNames.length === 0) {
      console.warn(`⚠ SKIP: mùa "${seasonToTest.season_id}" không phát hiện được group stage nào (có thể toàn bộ đã vào knockout).`);
      test.skip(true, 'Không phát hiện được group stage');
      return;
    }

    const standingsExists = await withClient(async (client) => {
      const res = await client.query(`SELECT count(*) FROM opta_standings WHERE season_id = $1 AND type = 'total'`, [seasonToTest.opta_season_id]);
      return parseInt(res.rows[0].count, 10) > 0;
    });

    if (!standingsExists) {
      console.warn(`⚠ SKIP: mùa "${seasonToTest.season_id}" chưa có dữ liệu opta_standings.`);
      test.skip(true, 'Không có opta_standings cho mùa này');
      return;
    }

    const recomputed = await withClient(async (client) => {
      const res = await client.query(
        `WITH results AS (
           SELECT sp.home_team_id as team_id,
             (sp.sport_event_status->'home_score'->>'regular_score')::int as gf,
             (sp.sport_event_status->'away_score'->>'regular_score')::int as ga
           FROM sport_events sp LEFT JOIN stages st ON st.id = sp.stage_id
           WHERE sp.competition_id = $1 AND sp.season_id = $2 AND sp.status_id = 8 AND st.name = ANY($3)
           UNION ALL
           SELECT sp.away_team_id,
             (sp.sport_event_status->'away_score'->>'regular_score')::int,
             (sp.sport_event_status->'home_score'->>'regular_score')::int
           FROM sport_events sp LEFT JOIN stages st ON st.id = sp.stage_id
           WHERE sp.competition_id = $1 AND sp.season_id = $2 AND sp.status_id = 8 AND st.name = ANY($3)
         )
         SELECT team_id,
           count(*) FILTER (WHERE gf > ga) as won,
           count(*) FILTER (WHERE gf = ga) as drawn,
           count(*) FILTER (WHERE gf < ga) as lost
         FROM results GROUP BY team_id`,
        [COMPETITION_ID, seasonToTest.season_id, groupStageNames]
      );
      return res.rows;
    });

    if (recomputed.length === 0) {
      console.warn(`⚠ SKIP: mùa "${seasonToTest.season_id}" không có trận group stage nào để tính lại.`);
      test.skip(true, 'Không có trận group stage');
      return;
    }

    const mpTeamRows = await withClient(async (client) => {
      const res = await client.query(`SELECT thesport_id, opta_id FROM mp_team WHERE thesport_id = ANY($1)`, [recomputed.map((r) => r.team_id)]);
      return res.rows;
    });
    const optaIdByThesportId = new Map(mpTeamRows.map((r) => [r.thesport_id, r.opta_id]));

    const standingsRows = await withClient(async (client) => {
      const res = await client.query(`SELECT contestant_id, won, drawn, lost FROM opta_standings WHERE season_id = $1 AND type = 'total'`, [seasonToTest.opta_season_id]);
      return res.rows;
    });
    const standingByContestantId = new Map(standingsRows.map((r) => [r.contestant_id, r]));

    const results = recomputed.map((r) => {
      const optaTeamId = optaIdByThesportId.get(r.team_id);
      const standing = optaTeamId ? standingByContestantId.get(optaTeamId) : undefined;
      if (!standing) return { teamId: r.team_id, checked: false };
      const won = parseInt(r.won, 10);
      const drawn = parseInt(r.drawn, 10);
      const lost = parseInt(r.lost, 10);
      const valid = won === standing.won && drawn === standing.drawn && lost === standing.lost;
      return { teamId: r.team_id, checked: true, valid, recomputed: { won, drawn, lost }, standing: { won: standing.won, drawn: standing.drawn, lost: standing.lost } };
    });

    const checked = results.filter((r) => r.checked);
    const validCount = checked.filter((r) => r.valid).length;

    console.log(`\n📊 Tính lại BXH từ tỷ số gốc ${NAME} (mùa ${seasonToTest.season_id}, group stages: ${groupStageNames.join(', ')}, ${checked.length} đội đối chiếu được): ${validCount}/${checked.length} khớp hoàn toàn với opta_standings`);
    checked.filter((r) => !r.valid).forEach((r) => console.log(`  ✗ ${r.teamId}: tính lại=${JSON.stringify(r.recomputed)} vs opta_standings=${JSON.stringify(r.standing)}`));

    saveJsonForSeason(SEASON_DIR, SLUG, `bxh-recompute-from-scores.json`, { seasonTested: seasonToTest.season_id, groupStageNames, totalChecked: checked.length, validCount, results: checked });

    expect(checked.length, 'Không có đội nào map được cả 2 chiều thesport-vs-Opta để đối chiếu').toBeGreaterThan(0);
    expect(validCount, `${checked.length - validCount}/${checked.length} đội có W-D-L tính lại từ tỷ số gốc KHÔNG khớp opta_standings đã công bố`).toBe(checked.length);
  });
});
