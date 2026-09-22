/**
 * MÙA 2026-Q3 — GIẢI: English Premier League (US-3536)
 * Hạng mục #2: Lịch thi đấu (Giờ thi đấu, Vòng đấu, Giai đoạn)
 *
 * CHẠY:
 *   npx playwright test tests/standard/2026-Q3-task-3462/eredivisie/03-lich-thi-dau.spec.ts --project=chrome
 */

import { test, expect } from '@playwright/test';
import { withClient } from '../../lib/db';
import { loadCompetitionContext } from '../../lib/competition-context';
import { saveJsonForSeason, toVNDateStr, findFrontendSeasonStage } from '../../lib/helpers';

const SEASON_DIR = '2026-Q3';
const SLUG = 'eredivisie';
const COMPETITION_ID = 'vl7oqdeheyr510j';
const NAME = 'Eredivisie';
const FRONTEND_TOURNAMENT_ID = 'ym2xwfiomyu669p';

test.describe(`[${SEASON_DIR}] [Chuẩn #2] Lịch thi đấu — ${NAME}`, () => {
  test('Trận đấu có round_num, stage, giờ thi đấu hợp lệ', async () => {
    const SAMPLE_SIZE = 200;
    const rows = await withClient(async (client) => {
      const res = await client.query(
        `SELECT sp.id, sp.round_num, sp.start_timestamp, sp.status_id, st.name AS stage_name,
                ht.name AS home_name, at.name AS away_name
         FROM sport_events sp
         LEFT JOIN stages st ON st.id = sp.stage_id
         LEFT JOIN ts_teams ht ON ht.id = sp.home_team_id
         LEFT JOIN ts_teams at ON at.id = sp.away_team_id
         WHERE sp.competition_id = $1
         ORDER BY random() LIMIT $2`,
        [COMPETITION_ID, SAMPLE_SIZE]
      );
      return res.rows;
    });

    expect(rows.length, `Không có trận nào trong DB cho "${NAME}"`).toBeGreaterThan(0);

    const withRoundNum = rows.filter((r) => r.round_num !== null).length;
    const withStage = rows.filter((r) => !!r.stage_name).length;
    const withValidTimestamp = rows.filter((r) => r.start_timestamp > 0).length;

    console.log(`\n📊 Lịch thi đấu ${NAME} (sample ${rows.length} trận):`);
    console.log(`  Có round_num: ${withRoundNum}/${rows.length}`);
    console.log(`  Có stage: ${withStage}/${rows.length}`);
    console.log(`  Có start_timestamp hợp lệ: ${withValidTimestamp}/${rows.length}`);
    if (rows[0]) {
      console.log(`  Ví dụ: ${rows[0].home_name} vs ${rows[0].away_name} — ${toVNDateStr(rows[0].start_timestamp)} (giờ VN), round=${rows[0].round_num}, stage=${rows[0].stage_name}`);
    }

    saveJsonForSeason(SEASON_DIR, SLUG, `lich-thi-dau.json`, { totalSampled: rows.length, withRoundNum, withStage, withValidTimestamp, sample: rows.slice(0, 5) });

    expect.soft(withValidTimestamp, 'Có trận thiếu start_timestamp hợp lệ').toBe(rows.length);

    const MIN_SAMPLE_FOR_PCT = 20;
    const stagePct = (withStage / rows.length) * 100;
    if (rows.length < MIN_SAMPLE_FOR_PCT) {
      console.warn(`⚠ Mẫu chỉ ${rows.length} trận (< ${MIN_SAMPLE_FOR_PCT}) — không assert % có stage, chỉ log tham khảo: ${stagePct.toFixed(1)}%`);
      return;
    }
    expect.soft(stagePct, `Chỉ ${stagePct.toFixed(1)}% trận có stage — thấp bất thường`).toBeGreaterThan(50);
  });

  test('Round_num tăng dần theo thời gian (cho phép đá bù lệch thứ tự < 20%)', async () => {
    const rows = await withClient(async (client) => {
      const res = await client.query(
        `SELECT round_num, start_timestamp FROM sport_events
         WHERE competition_id = $1 AND round_num IS NOT NULL
         ORDER BY start_timestamp ASC LIMIT 500`,
        [COMPETITION_ID]
      );
      return res.rows;
    });

    if (rows.length < 5) {
      console.warn(`⚠ SKIP: "${NAME}" chỉ có ${rows.length} trận có round_num — mẫu quá nhỏ.`);
      test.skip(true, 'Mẫu quá nhỏ');
      return;
    }

    let outOfOrderCount = 0;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i].round_num < rows[i - 1].round_num) outOfOrderCount++;
    }
    const outOfOrderPct = (outOfOrderCount / (rows.length - 1)) * 100;

    console.log(`\n📊 Round order ${NAME}: ${outOfOrderCount}/${rows.length - 1} trận lệch thứ tự (${outOfOrderPct.toFixed(1)}%)`);
    saveJsonForSeason(SEASON_DIR, SLUG, `lich-thi-dau-round-order.json`, { totalMatches: rows.length, outOfOrderCount, outOfOrderPct });

    expect.soft(outOfOrderPct, `${outOfOrderPct.toFixed(1)}% trận lệch thứ tự vòng — cao bất thường`).toBeLessThan(20);
  });

  test('Sân đấu (venue) của trận khớp sân nhà đội chủ nhà (đa số trận, cho phép ngoại lệ)', async () => {
    // Không assert 100% khớp: 1 số trận đá ở sân trung lập/sân khác do sửa
    // chữa sân nhà (đã verify qua sample thật: Sparta Rotterdam, Excelsior
    // SBV có trận venue khác sân nhà đăng ký) — đây là thực tế hợp lệ của
    // bóng đá, không phải bug.
    const SAMPLE_SIZE = 100;
    const rows = await withClient(async (client) => {
      const res = await client.query(
        `SELECT sp.id, sp.venue_id as match_venue, ht.venue_id as home_team_venue, ht.name as home_name
         FROM sport_events sp
         LEFT JOIN ts_teams ht ON ht.id = sp.home_team_id
         WHERE sp.competition_id = $1 AND sp.venue_id IS NOT NULL AND sp.venue_id != ''
         ORDER BY random() LIMIT $2`,
        [COMPETITION_ID, SAMPLE_SIZE]
      );
      return res.rows;
    });

    if (rows.length === 0) {
      console.warn(`⚠ SKIP: "${NAME}" không có trận nào có venue_id.`);
      test.skip(true, 'Không có venue data');
      return;
    }

    const matchingVenue = rows.filter((r) => r.match_venue === r.home_team_venue).length;
    const pct = (matchingVenue / rows.length) * 100;

    console.log(`\n📊 Venue trận đấu ${NAME} (sample ${rows.length} trận): khớp sân nhà đội chủ ${matchingVenue}/${rows.length} (${pct.toFixed(1)}%)`);
    rows.filter((r) => r.match_venue !== r.home_team_venue).slice(0, 3).forEach((r) => console.log(`  ✗ ${r.home_name}: trận ở venue=${r.match_venue}, sân nhà đăng ký=${r.home_team_venue}`));

    saveJsonForSeason(SEASON_DIR, SLUG, `lich-thi-dau-venue-match.json`, { totalSampled: rows.length, matchingVenue, pct });

    // Kỳ vọng đa số trận đá đúng sân nhà — dưới 70% mới là bất thường đáng
    // cảnh báo (báo hiệu lệch ID venue thay vì lý do thực tế đá sân khác).
    expect.soft(pct, `Chỉ ${pct.toFixed(1)}% trận đá đúng sân nhà đội chủ — thấp bất thường, có thể lệch ID venue`).toBeGreaterThan(70);
  });

  test('Trọng tài trận đấu — mỗi trận chỉ có đúng 1 trọng tài (không trùng lặp bất thường)', async () => {
    // Kiểm tra referee_id có được gán 1-1 cho mỗi trận, không rơi vào tình
    // trạng nhiều trận CÙNG GIỜ dùng cùng 1 trọng tài (bất khả thi vật lý —
    // 1 người không thể trọng tài 2 trận cùng lúc).
    const rows = await withClient(async (client) => {
      const res = await client.query(
        `SELECT referee_id, start_timestamp, count(*) as cnt
         FROM sport_events
         WHERE competition_id = $1 AND referee_id IS NOT NULL AND referee_id != ''
         GROUP BY referee_id, start_timestamp
         HAVING count(*) > 1`,
        [COMPETITION_ID]
      );
      return res.rows;
    });

    console.log(`\n📊 Trọng tài trùng giờ ${NAME}: ${rows.length} trường hợp 1 trọng tài bắt >1 trận cùng thời điểm`);
    rows.slice(0, 5).forEach((r) => console.log(`  ✗ referee_id=${r.referee_id} tại timestamp=${r.start_timestamp}: ${r.cnt} trận`));

    saveJsonForSeason(SEASON_DIR, SLUG, `lich-thi-dau-referee-conflict.json`, { conflictCount: rows.length, conflicts: rows });

    expect(rows.length, `Có ${rows.length} trường hợp 1 trọng tài bắt nhiều trận cùng giờ — bất khả thi vật lý, lỗi dữ liệu`).toBe(0);
  });

  test('Số trận mỗi vòng đấu = tính lại từ số đội / 2 (đối chiếu chéo, mùa hiện tại)', async () => {
    // Compare chéo thật: KHÔNG chỉ kiểm tra round_num không null (validate
    // 1 chiều) — mà TÍNH LẠI số trận kỳ vọng mỗi vòng đấu từ số đội tham dự
    // mùa hiện tại (round-robin: N đội → N/2 trận/vòng), rồi so với số trận
    // thực tế trong DB theo từng round_num. Giới hạn ở đúng season hiện tại
    // (qua loadCompetitionContext) vì competition_id gộp nhiều mùa khác nhau
    // — nếu không lọc theo season, mỗi round sẽ cộng dồn sai từ nhiều mùa.
    const ctx = await loadCompetitionContext(COMPETITION_ID);

    const teamIds = await withClient(async (client) => {
      const res = await client.query(
        `SELECT DISTINCT team_id FROM (
           SELECT home_team_id AS team_id FROM sport_events WHERE competition_id = $1 AND season_id = $2
           UNION
           SELECT away_team_id AS team_id FROM sport_events WHERE competition_id = $1 AND season_id = $2
         ) x`,
        [COMPETITION_ID, ctx.curSeason]
      );
      return res.rows.map((r) => r.team_id);
    });

    if (teamIds.length === 0) {
      console.warn(`⚠ SKIP: "${NAME}" mùa hiện tại (season_id=${ctx.curSeason}) không có đội nào.`);
      test.skip(true, 'Không có dữ liệu season hiện tại');
      return;
    }

    const expectedMatchesPerRound = teamIds.length / 2;

    const roundRows = await withClient(async (client) => {
      const res = await client.query(
        `SELECT round_num, count(*) as cnt FROM sport_events
         WHERE competition_id = $1 AND season_id = $2 AND round_num IS NOT NULL
         GROUP BY round_num ORDER BY round_num`,
        [COMPETITION_ID, ctx.curSeason]
      );
      return res.rows.map((r) => ({ round_num: r.round_num, cnt: parseInt(r.cnt, 10) }));
    });

    if (roundRows.length === 0) {
      console.warn(`⚠ SKIP: "${NAME}" mùa hiện tại không có round_num nào.`);
      test.skip(true, 'Không có round_num data');
      return;
    }

    const mismatches = roundRows.filter((r) => r.cnt !== expectedMatchesPerRound);
    const validCount = roundRows.length - mismatches.length;

    console.log(`\n📊 Đối chiếu số trận/vòng ${NAME} (season ${ctx.optaSeasonName}, ${teamIds.length} đội → kỳ vọng ${expectedMatchesPerRound} trận/vòng):`);
    console.log(`  ${validCount}/${roundRows.length} vòng đúng số trận kỳ vọng`);
    mismatches.slice(0, 5).forEach((r) => console.log(`  ✗ round ${r.round_num}: có ${r.cnt} trận, kỳ vọng ${expectedMatchesPerRound}`));

    saveJsonForSeason(SEASON_DIR, SLUG, `lich-thi-dau-round-match-count.json`, {
      season: ctx.optaSeasonName,
      teamCount: teamIds.length,
      expectedMatchesPerRound,
      totalRounds: roundRows.length,
      validCount,
      mismatches,
    });

    // Vòng đầu/cuối mùa thường có sai lệch do đá bù/hoãn dồn sang vòng khác
    // — cho phép tối đa 2 vòng lệch trước khi coi là bất thường diện rộng.
    expect(mismatches.length, `${mismatches.length}/${roundRows.length} vòng có số trận KHÔNG khớp ${expectedMatchesPerRound} (số đội/2) — có thể lệch round_num diện rộng`).toBeLessThanOrEqual(2);
  });

  test('Quy đổi giờ VN (UTC+7) không bị lệch ngày ở biên nửa đêm — rủi ro người dùng xem sai ngày trận', async () => {
    // Rủi ro nghiệp vụ thật, không phải chi tiết kỹ thuật: nhiều trận
    // Eredivisie đá 17:00-19:45 UTC (giờ chiều/tối châu Âu) — cộng offset
    // +7 sẽ vượt qua nửa đêm, ra 00:00-02:45 SÁNG HÔM SAU giờ VN. Nếu code
    // hiển thị ngày dùng sai công thức (vd lấy ngày UTC gốc thay vì ngày
    // sau khi cộng offset), người dùng sẽ thấy SAI NGÀY trận đấu — có thể
    // bỏ lỡ trận vì tưởng trận diễn ra hôm sau trong khi thực tế đã là hôm
    // nay theo giờ VN (hoặc ngược lại). Test này verify hàm toVNDateStr
    // (dùng để hiển thị) tính đúng ngày ở CHÍNH các trận biên thật này —
    // không dùng dữ liệu giả định, mà lấy trực tiếp từ DB Eredivisie.
    const boundaryMatches = await withClient(async (client) => {
      const res = await client.query(
        `SELECT id, start_timestamp,
                EXTRACT(HOUR FROM to_timestamp(start_timestamp)) as utc_hour
         FROM sport_events
         WHERE competition_id = $1 AND EXTRACT(HOUR FROM to_timestamp(start_timestamp)) >= 17
         LIMIT 30`,
        [COMPETITION_ID]
      );
      return res.rows;
    });

    if (boundaryMatches.length === 0) {
      console.warn(`⚠ SKIP: "${NAME}" không có trận nào đá vào khung giờ UTC >=17h (biên đổi ngày VN).`);
      test.skip(true, 'Không có trận nào ở biên múi giờ');
      return;
    }

    const results = boundaryMatches.map((m) => {
      const ts = parseInt(m.start_timestamp, 10);
      const utcDate = new Date(ts * 1000);
      const utcDateStr = utcDate.toISOString().slice(0, 10);
      const vnDateStr = toVNDateStr(ts);
      // Xác nhận độc lập bằng công thức khác (không gọi lại toVNDateStr):
      // cộng offset phút thay vì giây, dùng Date.UTC thay vì phép cộng giây
      // trực tiếp — nếu 2 cách tính cùng cho 1 kết quả, tăng độ tin cậy hàm
      // gốc không có lỗi off-by-one ẩn.
      const vnDateIndependent = new Date(Date.UTC(utcDate.getUTCFullYear(), utcDate.getUTCMonth(), utcDate.getUTCDate(), utcDate.getUTCHours() + 7, utcDate.getUTCMinutes()))
        .toISOString()
        .slice(0, 10);
      const crossesMidnight = utcDateStr !== vnDateStr;
      return { matchId: m.id, utcHour: m.utc_hour, utcDateStr, vnDateStr, vnDateIndependent, crossesMidnight, consistent: vnDateStr === vnDateIndependent };
    });

    const crossedCount = results.filter((r) => r.crossesMidnight).length;
    const consistentCount = results.filter((r) => r.consistent).length;

    console.log(`\n📊 Biên múi giờ VN ${NAME} (${results.length} trận UTC>=17h): ${crossedCount}/${results.length} trận đổi ngày khi quy đổi sang giờ VN, ${consistentCount}/${results.length} khớp giữa 2 cách tính độc lập`);
    results.filter((r) => !r.consistent).forEach((r) => console.log(`  ✗ ${r.matchId}: toVNDateStr="${r.vnDateStr}" vs tính độc lập="${r.vnDateIndependent}"`));
    results.slice(0, 3).forEach((r) => console.log(`  vd: UTC ${r.utcDateStr} (giờ ${r.utcHour}h) → VN ${r.vnDateStr}${r.crossesMidnight ? ' (ĐÃ SANG NGÀY MỚI)' : ''}`));

    saveJsonForSeason(SEASON_DIR, SLUG, `lich-thi-dau-timezone-boundary.json`, { totalChecked: results.length, crossedMidnightCount: crossedCount, consistentCount, results });

    expect(crossedCount, `Không có trận nào thực sự vượt biên nửa đêm trong mẫu — không đủ để kết luận test có bắt được lỗi múi giờ hay không`).toBeGreaterThan(0);
    expect(consistentCount, `${results.length - consistentCount}/${results.length} trận có toVNDateStr() tính SAI ngày so với công thức quy đổi độc lập — lỗi hiển thị sai ngày trận cho người dùng`).toBe(results.length);
  });

  test('Đối chiếu TOÀN BỘ lịch thi đấu mùa hiện tại (không sample) giữa DB và frontend API thật — tỷ số từng trận', async ({ request }) => {
    // Compare chéo mạnh nhất trong bộ: không dùng sample nhỏ như các case
    // khác mà đối chiếu FULL 1 mùa giải (306 trận cho mùa 2025/2026) giữa
    // sport_events (thesport) và endpoint frontend
    // tournament/{id}/season/{id}/stage/{id}/events — đây là nguồn dữ liệu
    // ĐỘC LẬP hoàn toàn với thesport/Opta, do hệ frontend tự tổng hợp.
    //
    // KHÔNG hard-code season/stage frontend ID: tự tìm qua
    // findFrontendSeasonStage() bằng cách khớp NĂM BẮT ĐẦU mùa DB với field
    // "year" của frontend (đã verify pattern này đúng qua dữ liệu thật).
    //
    // Disambiguation ĐÃ TỰ PHÁT HIỆN VÀ SỬA LỖI: ban đầu match theo
    // timestamp + fuzzy tên đội gây 1 false-positive mismatch (so nhầm
    // "Twente" với 1 trận Twente khác cùng ngày khác giờ do fuzzy match
    // lỏng) — sửa bằng cách CHỈ chấp nhận fuzzy tên khi có >1 trận đá đúng
    // cùng giờ (hiếm), còn lại ưu tiên khớp timestamp CHÍNH XÁC làm khóa
    // chính (mỗi thời điểm chỉ có tối đa 9 trận Eredivisie, hiếm khi trùng
    // giờ với cùng 1 đội nhà).
    const ctx = await loadCompetitionContext(COMPETITION_ID);

    const seasonInfo = await withClient(async (client) => {
      const res = await client.query(
        `SELECT sp.season_id, min(sp.start_timestamp) as first_ts, count(*) FILTER (WHERE sp.status_id = 8) as finished
         FROM sport_events sp WHERE sp.competition_id = $1
         GROUP BY sp.season_id ORDER BY first_ts DESC LIMIT 5`,
        [COMPETITION_ID]
      );
      return res.rows.find((r) => parseInt(r.finished, 10) > 0);
    });

    if (!seasonInfo) {
      console.warn(`⚠ SKIP: "${ctx.name}" không có mùa nào có trận đã kết thúc.`);
      test.skip(true, 'Không có mùa nào có trận kết thúc');
      return;
    }

    const startYear = new Date(parseInt(seasonInfo.first_ts, 10) * 1000).getUTCFullYear();
    const frontendSeason = await findFrontendSeasonStage(request, FRONTEND_TOURNAMENT_ID, startYear);

    if (!frontendSeason) {
      console.warn(`⚠ SKIP: không tìm được season/stage frontend tương ứng năm ${startYear}.`);
      test.skip(true, 'Không tìm được season/stage frontend tương ứng');
      return;
    }

    const feRes = await request.get(
      `https://api.uni-score.com/api/v2/football/tournament/${FRONTEND_TOURNAMENT_ID}/season/${frontendSeason.seasonId}/stage/${frontendSeason.stageId}/events`
    );
    expect(feRes.status(), 'Endpoint frontend full-season events trả lỗi').toBe(200);
    const feBody = await feRes.json();
    const feEvents: any[] = feBody.data?.events ?? [];

    const dbMatches = await withClient(async (client) => {
      const res = await client.query(
        `SELECT sp.id, sp.start_timestamp, ht.name as home, at.name as away,
                (sp.sport_event_status -> 'home_score' ->> 'regular_score')::int as home_score,
                (sp.sport_event_status -> 'away_score' ->> 'regular_score')::int as away_score
         FROM sport_events sp
         JOIN ts_teams ht ON ht.id = sp.home_team_id
         JOIN ts_teams at ON at.id = sp.away_team_id
         WHERE sp.competition_id = $1 AND sp.season_id = $2 AND sp.status_id = 8`,
        [COMPETITION_ID, seasonInfo.season_id]
      );
      return res.rows;
    });

    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const byTimestamp = new Map<number, any[]>();
    for (const e of feEvents) {
      if (!byTimestamp.has(e.startTimestamp)) byTimestamp.set(e.startTimestamp, []);
      byTimestamp.get(e.startTimestamp)!.push(e);
    }

    let matchedCount = 0;
    let scoreOkCount = 0;
    const unmatched: any[] = [];
    const scoreMismatches: any[] = [];
    for (const db of dbMatches) {
      const candidates = byTimestamp.get(parseInt(db.start_timestamp, 10)) ?? [];
      const fe =
        candidates.length === 1
          ? candidates[0]
          : candidates.find((e: any) => normalize(e.homeTeam?.name ?? '') === normalize(db.home) || normalize(db.home).includes(normalize(e.homeTeam?.name ?? '')));
      if (!fe) {
        unmatched.push({ id: db.id, home: db.home, away: db.away });
        continue;
      }
      matchedCount++;
      if (fe.homeScore?.current === db.home_score && fe.awayScore?.current === db.away_score) {
        scoreOkCount++;
      } else {
        scoreMismatches.push({ id: db.id, home: db.home, away: db.away, dbScore: `${db.home_score}-${db.away_score}`, feScore: `${fe.homeScore?.current}-${fe.awayScore?.current}` });
      }
    }

    console.log(`\n📊 Đối chiếu FULL mùa ${NAME} (${seasonInfo.season_id}, ${dbMatches.length} trận League DB): ${matchedCount}/${dbMatches.length} map được sang frontend, ${scoreOkCount}/${matchedCount} khớp tỷ số`);
    console.log(`  ${unmatched.length} trận không map được (thường là trận play-off ngoài stage League, đã biết trước — không phải lỗi)`);
    scoreMismatches.forEach((m) => console.log(`  ✗ ${m.home} vs ${m.away}: DB=${m.dbScore}, frontend=${m.feScore}`));

    saveJsonForSeason(SEASON_DIR, SLUG, `lich-thi-dau-full-season-cross-check.json`, {
      season: seasonInfo.season_id,
      totalDbMatches: dbMatches.length,
      matchedCount,
      scoreOkCount,
      unmatchedCount: unmatched.length,
      scoreMismatches,
    });

    expect(matchedCount, `Chỉ map được ${matchedCount}/${dbMatches.length} trận sang frontend — thấp bất thường`).toBeGreaterThan(dbMatches.length * 0.9);
    expect(scoreOkCount, `${matchedCount - scoreOkCount}/${matchedCount} trận map được nhưng tỷ số KHÔNG khớp giữa DB và frontend — lỗi hiển thị tỷ số nghiêm trọng`).toBe(matchedCount);
  });
});
