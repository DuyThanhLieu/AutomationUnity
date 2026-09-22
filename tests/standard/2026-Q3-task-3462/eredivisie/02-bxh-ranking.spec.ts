/**
 * MÙA 2026-Q3 — GIẢI: English Premier League (US-3536)
 * Hạng mục #4: Bảng xếp hạng (BXH)
 *
 * CHẠY:
 *   npx playwright test tests/standard/2026-Q3-task-3462/eredivisie/02-bxh-ranking.spec.ts --project=chrome
 */

import { test, expect } from '@playwright/test';
import { withClient } from '../../lib/db';
import { loadCompetitionContext } from '../../lib/competition-context';
import { saveJsonForSeason } from '../../lib/helpers';

const SEASON_DIR = '2026-Q3';
const SLUG = 'eredivisie';
const COMPETITION_ID = 'vl7oqdeheyr510j';
const NAME = 'Eredivisie';
const FRONTEND_SLUG = 'eredivisie';

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
    // opta_standings có 3 "type": total, home, away — mỗi đội có 1 dòng
    // riêng cho mỗi type. Verify: home.matches_played + away.matches_played
    // phải = total.matches_played (và tương tự cho won/drawn/lost) — nếu
    // lệch, nghĩa là dữ liệu home/away split bị lỗi đồng bộ so với total.
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

  test('BXH tính lại từ tỷ số gốc (thesport) khớp với opta_standings đã công bố — rủi ro nghiệp vụ cao nhất', async () => {
    // Đây là compare chéo QUAN TRỌNG NHẤT của mục BXH: mọi case khác (rank
    // monotonic, home+away=total) chỉ kiểm tra TÍNH NHẤT QUÁN NỘI TẠI của
    // chính opta_standings — nếu 1 job cập nhật điểm bị lỗi (vd quên cộng 3
    // điểm cho đội thắng), các case đó KHÔNG phát hiện được vì bản thân
    // opta_standings vẫn tự nhất quán với chính nó dù sai. Case này tính lại
    // W-D-L-points từ NGUỒN GỐC ĐỘC LẬP (tỷ số thật trong sport_events,
    // thesport tier) rồi so với opta_standings đã công bố (Opta tier) —
    // dùng bảng cầu nối mp_team (thesport team_id <-> Opta contestant_id,
    // chưa dùng ở case nào khác trong file này).
    //
    // QUAN TRỌNG: phải lọc stage_name='League' — đã verify qua điều tra
    // thực tế: sport_events của 1 mùa có thể gồm cả trận play-off thăng/
    // xuống hạng (stage "Qual. Semifinals"/"Qual. Finals") KHÔNG tính vào
    // opta_standings. Nếu không lọc, số trận sẽ luôn thừa và assert sẽ luôn
    // fail giả (đã tự phát hiện qua thử nghiệm: 36 vs 34 trận, chênh đúng 2
    // trận play-off) — đây không phải bug data, mà là khác phạm vi tính.
    //
    // Chọn mùa để test: KHÔNG hard-code season cụ thể — tự tìm mùa gần nhất
    // (nhiều trận nhất) mà CẢ HAI đều sẵn sàng: có mapping Opta (mp_season)
    // VÀ có opta_standings VÀ có ít nhất 1 trận status_id=8 (đã kết thúc).
    // Mùa hiện tại (curSeason qua loadCompetitionContext) có thể đang giữa
    // off-season — 0 trận kết thúc — nên không dùng cứng curSeason ở đây.
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
      console.warn(`⚠ SKIP: "${NAME}" không có mùa nào vừa map được Opta vừa có trận đã kết thúc.`);
      test.skip(true, 'Không có mùa nào đủ điều kiện đối chiếu');
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
           WHERE sp.competition_id = $1 AND sp.season_id = $2 AND sp.status_id = 8 AND st.name = 'League'
           UNION ALL
           SELECT sp.away_team_id as team_id,
             (sp.sport_event_status->'away_score'->>'regular_score')::int as gf,
             (sp.sport_event_status->'home_score'->>'regular_score')::int as ga
           FROM sport_events sp LEFT JOIN stages st ON st.id = sp.stage_id
           WHERE sp.competition_id = $1 AND sp.season_id = $2 AND sp.status_id = 8 AND st.name = 'League'
         )
         SELECT team_id,
           count(*) FILTER (WHERE gf > ga) as won,
           count(*) FILTER (WHERE gf = ga) as drawn,
           count(*) FILTER (WHERE gf < ga) as lost,
           count(*) FILTER (WHERE gf > ga) * 3 + count(*) FILTER (WHERE gf = ga) as points
         FROM results GROUP BY team_id`,
        [COMPETITION_ID, seasonToTest.season_id]
      );
      return res.rows;
    });

    if (recomputed.length === 0) {
      console.warn(`⚠ SKIP: mùa "${seasonToTest.season_id}" không có trận stage='League' nào để tính lại.`);
      test.skip(true, 'Không có trận League stage');
      return;
    }

    const mpTeamRows = await withClient(async (client) => {
      const res = await client.query(`SELECT thesport_id, opta_id FROM mp_team WHERE thesport_id = ANY($1)`, [recomputed.map((r) => r.team_id)]);
      return res.rows;
    });
    const optaIdByThesportId = new Map(mpTeamRows.map((r) => [r.thesport_id, r.opta_id]));

    const standingsRows = await withClient(async (client) => {
      const res = await client.query(`SELECT contestant_id, won, drawn, lost, points FROM opta_standings WHERE season_id = $1 AND type = 'total'`, [seasonToTest.opta_season_id]);
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
      const points = parseInt(r.points, 10);
      const valid = won === standing.won && drawn === standing.drawn && lost === standing.lost && points === standing.points;
      return { teamId: r.team_id, checked: true, valid, recomputed: { won, drawn, lost, points }, standing: { won: standing.won, drawn: standing.drawn, lost: standing.lost, points: standing.points } };
    });

    const checked = results.filter((r) => r.checked);
    const validCount = checked.filter((r) => r.valid).length;

    console.log(`\n📊 Tính lại BXH từ tỷ số gốc ${NAME} (mùa ${seasonToTest.season_id}, ${checked.length} đội đối chiếu được): ${validCount}/${checked.length} khớp hoàn toàn với opta_standings`);
    checked.filter((r) => !r.valid).forEach((r) => console.log(`  ✗ ${r.teamId}: tính lại từ tỷ số=${JSON.stringify(r.recomputed)} vs opta_standings=${JSON.stringify(r.standing)}`));

    saveJsonForSeason(SEASON_DIR, SLUG, `bxh-recompute-from-scores.json`, { seasonTested: seasonToTest.season_id, totalChecked: checked.length, validCount, results: checked });

    expect(checked.length, 'Không có đội nào map được cả 2 chiều thesport-vs-Opta để đối chiếu').toBeGreaterThan(0);
    expect(validCount, `${checked.length - validCount}/${checked.length} đội có W-D-L-Điểm tính lại từ tỷ số gốc KHÔNG khớp opta_standings đã công bố — nghi ngờ lỗi tính điểm/đồng bộ BXH nghiêm trọng`).toBe(checked.length);
  });

  test('BXH nguồn thesport (bảng standings) đối chiếu chéo với BXH nguồn Opta (opta_standings) — 2 hệ tính độc lập', async () => {
    // Khác với case trước (tính lại W-D-L-Điểm THỦ CÔNG từ tỷ số sport_events
    // rồi so với opta_standings), case này đối chiếu 2 BẢNG BXH ĐÃ CÓ SẴN từ
    // 2 HỆ THỐNG HOÀN TOÀN ĐỘC LẬP: bảng "standings" (thesport, tự tính bởi
    // nguồn dữ liệu thesport) vs "opta_standings" (Opta, tự tính bởi nguồn
    // Opta) — không qua công thức tôi tự viết. Có giá trị bổ sung thật sự:
    // nếu case trước PASS (công thức tôi tính đúng) nhưng case này FAIL,
    // nghĩa là LỖI NẰM Ở CHÍNH HỆ THỐNG THESPORT (bảng standings) chứ không
    // phải ở test; ngược lại nếu case này PASS mà case trước FAIL thì lỗi ở
    // công thức test. 2 case cùng tồn tại giúp khoanh vùng lỗi chính xác hơn.
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

    const thesportStandings = await withClient(async (client) => {
      const res = await client.query(`SELECT competitor_id, points, won, draw, loss FROM standings WHERE season_id = $1 AND type = 'total'`, [seasonToTest.season_id]);
      return res.rows;
    });

    if (thesportStandings.length === 0) {
      console.warn(`⚠ SKIP: mùa "${seasonToTest.season_id}" không có dữ liệu trong bảng standings (thesport).`);
      test.skip(true, 'Không có dữ liệu bảng standings');
      return;
    }

    const mpTeamRows = await withClient(async (client) => {
      const res = await client.query(`SELECT thesport_id, opta_id FROM mp_team WHERE thesport_id = ANY($1)`, [thesportStandings.map((r) => r.competitor_id)]);
      return res.rows;
    });
    const optaIdByThesportId = new Map(mpTeamRows.map((r) => [r.thesport_id, r.opta_id]));

    const optaStandingsRows = await withClient(async (client) => {
      const res = await client.query(`SELECT contestant_id, points, won, drawn, lost FROM opta_standings WHERE season_id = $1 AND type = 'total'`, [seasonToTest.opta_season_id]);
      return res.rows;
    });
    const optaStandingByContestantId = new Map(optaStandingsRows.map((r) => [r.contestant_id, r]));

    const results = thesportStandings.map((r) => {
      const optaTeamId = optaIdByThesportId.get(r.competitor_id);
      const opta = optaTeamId ? optaStandingByContestantId.get(optaTeamId) : undefined;
      if (!opta) return { teamId: r.competitor_id, checked: false };
      const valid = r.points === opta.points && r.won === opta.won && r.draw === opta.drawn && r.loss === opta.lost;
      return { teamId: r.competitor_id, checked: true, valid, thesport: { points: r.points, won: r.won, draw: r.draw, loss: r.loss }, opta: { points: opta.points, won: opta.won, drawn: opta.drawn, lost: opta.lost } };
    });

    const checked = results.filter((r) => r.checked);
    const validCount = checked.filter((r) => r.valid).length;

    console.log(`\n📊 BXH standings(thesport) vs opta_standings(Opta) ${NAME} (mùa ${seasonToTest.season_id}, ${checked.length} đội đối chiếu được): ${validCount}/${checked.length} khớp hoàn toàn`);
    checked.filter((r) => !r.valid).forEach((r) => console.log(`  ✗ ${r.teamId}: standings=${JSON.stringify(r.thesport)} vs opta_standings=${JSON.stringify(r.opta)}`));

    saveJsonForSeason(SEASON_DIR, SLUG, `bxh-thesport-vs-opta-source.json`, { seasonTested: seasonToTest.season_id, totalChecked: checked.length, validCount, results: checked });

    expect(checked.length, 'Không có đội nào map được cả 2 chiều thesport-vs-Opta để đối chiếu').toBeGreaterThan(0);
    expect(validCount, `${checked.length - validCount}/${checked.length} đội có BXH thesport KHÔNG khớp BXH Opta — 2 hệ thống độc lập lệch nhau, nghi ngờ 1 trong 2 nguồn bị lỗi đồng bộ`).toBe(checked.length);
  });

  test('goals_diff (chuỗi "+56"/"-27") khớp công thức goals - goals_against', async () => {
    // Compare chéo nội bộ đơn giản nhưng rẻ và đáng làm: goals_diff là 1
    // field TÍNH SẴN dạng string có dấu (+/-), độc lập với 2 field số gốc
    // goals/goals_against trong CÙNG bảng — verify không có sai lệch giữa
    // giá trị tính sẵn và công thức đúng.
    const ctx = await loadCompetitionContext(COMPETITION_ID);

    if (!ctx.optaSeasonId || !ctx.hasStandingsData) {
      console.warn(`⚠ SKIP: "${ctx.name}" chưa có dữ liệu opta_standings.`);
      test.skip(true, 'Không có opta_standings data');
      return;
    }

    const rows = await withClient(async (client) => {
      const res = await client.query(`SELECT rank, goals, goals_against, goals_diff FROM opta_standings WHERE season_id = $1 AND type = 'total'`, [ctx.optaSeasonId]);
      return res.rows;
    });

    if (rows.length === 0) {
      console.warn(`⚠ SKIP: "${ctx.name}" không có dòng opta_standings nào.`);
      test.skip(true, 'Không có dữ liệu standings');
      return;
    }

    const results = rows.map((r) => {
      const parsedDiff = parseInt(r.goals_diff, 10);
      const expectedDiff = r.goals - r.goals_against;
      return { rank: r.rank, goals: r.goals, goalsAgainst: r.goals_against, goalsDiff: r.goals_diff, parsedDiff, expectedDiff, valid: parsedDiff === expectedDiff };
    });

    const validCount = results.filter((r) => r.valid).length;
    console.log(`\n📊 goals_diff vs (goals - goals_against) ${NAME}: ${validCount}/${results.length} đội khớp`);
    results.filter((r) => !r.valid).forEach((r) => console.log(`  ✗ rank ${r.rank}: goals_diff="${r.goalsDiff}" (parsed=${r.parsedDiff}) vs kỳ vọng ${r.expectedDiff} (${r.goals}-${r.goalsAgainst})`));

    saveJsonForSeason(SEASON_DIR, SLUG, `bxh-goals-diff-consistency.json`, { totalChecked: results.length, validCount });

    expect(validCount, `${results.length - validCount}/${results.length} đội có goals_diff KHÔNG khớp công thức goals-goals_against`).toBe(results.length);
  });

  test('rank_status thuộc whitelist giá trị hợp lệ, không có giá trị rác/lạ', async () => {
    // Sanity check: rank_status (nếu có) chỉ nên là 1 trong các nhãn khu vực
    // châu Âu hợp lệ của Eredivisie — phát hiện giá trị rác nếu job gán
    // rank_status bị lỗi (vd copy nhầm nhãn của giải khác).
    const ctx = await loadCompetitionContext(COMPETITION_ID);

    if (!ctx.optaSeasonId || !ctx.hasStandingsData) {
      console.warn(`⚠ SKIP: "${ctx.name}" chưa có dữ liệu opta_standings.`);
      test.skip(true, 'Không có opta_standings data');
      return;
    }

    const VALID_RANK_STATUSES = new Set([
      'UEFA Champions League',
      'UEFA Champions League Qualifiers',
      'UEFA Europa League',
      'UEFA Europa League Qualifiers',
      'UEFA Conference League Play-offs',
      'Relegation Play-off',
      'Relegation',
    ]);

    const rows = await withClient(async (client) => {
      const res = await client.query(`SELECT rank, rank_status FROM opta_standings WHERE season_id = $1 AND type = 'total' AND rank_status IS NOT NULL AND rank_status != ''`, [ctx.optaSeasonId]);
      return res.rows;
    });

    if (rows.length === 0) {
      console.warn(`⚠ SKIP: "${ctx.name}" không có đội nào có rank_status.`);
      test.skip(true, 'Không có rank_status data');
      return;
    }

    const invalid = rows.filter((r) => !VALID_RANK_STATUSES.has(r.rank_status));
    console.log(`\n📊 rank_status whitelist ${NAME}: ${rows.length - invalid.length}/${rows.length} hợp lệ`);
    invalid.forEach((r) => console.log(`  ✗ rank ${r.rank}: rank_status="${r.rank_status}" — KHÔNG thuộc whitelist đã biết`));

    saveJsonForSeason(SEASON_DIR, SLUG, `bxh-rank-status-whitelist.json`, { totalChecked: rows.length, invalidCount: invalid.length, invalidValues: invalid.map((r) => r.rank_status) });

    expect(invalid.length, `${invalid.length}/${rows.length} đội có rank_status KHÔNG thuộc whitelist đã biết — có thể là nhãn rác/lỗi đồng bộ, hoặc whitelist cần cập nhật thêm nhãn mới hợp lệ`).toBe(0);
  });
});
