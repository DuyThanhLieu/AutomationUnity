/**
 * MÙA 2026-Q3 — GIẢI: AFC Champions League (US-3537)
 * Hạng mục #8: Cầu thủ (Danh sách, Chuyển nhượng, Số áo, Ảnh) và #13: Đội hình
 *
 * CHẠY:
 *   npx playwright test tests/standard/2026-Q3-task-3462/afc-champions-league/06-lineup-players.spec.ts --project=chrome
 */

import { test, expect } from '@playwright/test';
import { withClient } from '../../lib/db';
import { isValidImageUrl, saveJsonForSeason } from '../../lib/helpers';

const SEASON_DIR = '2026-Q3';
const SLUG = 'afc-champions-league';
const COMPETITION_ID = 'z8yomo4hg66q0j6';
const NAME = 'AFC Champions League';

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

  test('Mỗi đội trong 1 trận chỉ có đúng 1 captain (không 0 hoặc >1)', async () => {
    const SAMPLE_SIZE = 50;
    const rows = await withClient(async (client) => {
      const res = await client.query(
        `SELECT ml.sport_event_id, ml.home_lineups, ml.away_lineups
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
      const homeCaptains = (r.home_lineups ?? []).filter((p: any) => p.captain === 1).length;
      const awayCaptains = (r.away_lineups ?? []).filter((p: any) => p.captain === 1).length;
      return { matchId: r.sport_event_id, homeCaptains, awayCaptains, valid: homeCaptains === 1 && awayCaptains === 1 };
    });

    const validCount = results.filter((r) => r.valid).length;
    console.log(`\n📊 Captain ${NAME} (sample ${results.length} trận): ${validCount}/${results.length} trận có đúng 1 captain/đội`);
    results.filter((r) => !r.valid).forEach((r) => console.log(`  ✗ ${r.matchId}: home có ${r.homeCaptains} captain, away có ${r.awayCaptains} captain`));

    saveJsonForSeason(SEASON_DIR, SLUG, `lineup-captain.json`, { totalSampled: results.length, validCount, results });

    const pct = (validCount / results.length) * 100;
    // Ngưỡng 50% (đã xác nhận flaky ở Eredivisie với 70%, dao động 62-74%)
    // — dùng chung ngưỡng an toàn này cho AFC CL.
    expect.soft(pct, `Chỉ ${pct.toFixed(1)}% trận có đúng 1 captain/đội — có thể thiếu dữ liệu (0 captain) hoặc trùng lặp (>1)`).toBeGreaterThan(50);
  });

  test('Số áo (shirt_number) không trùng lặp giữa các cầu thủ trong cùng 1 đội, cùng 1 trận', async () => {
    const SAMPLE_SIZE = 50;
    const rows = await withClient(async (client) => {
      const res = await client.query(
        `SELECT ml.sport_event_id, ml.home_lineups, ml.away_lineups
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

    const hasDuplicateShirt = (players: any[]) => {
      const numbers = players.map((p) => p.shirt_number).filter((n) => n !== undefined && n !== null);
      return numbers.length !== new Set(numbers).size;
    };

    const results = rows.map((r) => ({
      matchId: r.sport_event_id,
      homeHasDuplicate: hasDuplicateShirt(r.home_lineups ?? []),
      awayHasDuplicate: hasDuplicateShirt(r.away_lineups ?? []),
    }));

    const withDuplicate = results.filter((r) => r.homeHasDuplicate || r.awayHasDuplicate);
    console.log(`\n📊 Số áo trùng ${NAME} (sample ${results.length} trận): ${withDuplicate.length} trận có ít nhất 1 đội bị trùng số áo`);
    withDuplicate.slice(0, 3).forEach((r) => console.log(`  ✗ ${r.matchId}: home trùng=${r.homeHasDuplicate}, away trùng=${r.awayHasDuplicate}`));

    saveJsonForSeason(SEASON_DIR, SLUG, `lineup-shirt-duplicate.json`, { totalSampled: results.length, withDuplicateCount: withDuplicate.length, results });

    expect(withDuplicate.length, `${withDuplicate.length}/${results.length} trận có cầu thủ trùng số áo trong cùng 1 đội — luật bóng đá không cho phép`).toBe(0);
  });

  test('Formation (vd "4-3-3") đối chiếu chéo với số lượng D/M/F thực tế của cầu thủ đá chính', async () => {
    const SAMPLE_SIZE = 50;
    const rows = await withClient(async (client) => {
      const res = await client.query(
        `SELECT ml.sport_event_id, ml.home_formation, ml.away_formation, ml.home_lineups, ml.away_lineups
         FROM sport_events sp
         JOIN match_lineups ml ON ml.sport_event_id = sp.id
         WHERE sp.competition_id = $1 AND sp.status_id = 8
           AND ml.home_formation IS NOT NULL AND ml.away_formation IS NOT NULL
         ORDER BY random() LIMIT $2`,
        [COMPETITION_ID, SAMPLE_SIZE]
      );
      return res.rows;
    });

    if (rows.length === 0) {
      console.warn(`⚠ SKIP: "${NAME}" không có trận nào có cả formation lẫn lineup.`);
      test.skip(true, 'Không có formation data');
      return;
    }

    const parseFormationCounts = (formation: string): { D: number; M: number; F: number } | null => {
      const parts = formation.split('-').map((n) => parseInt(n, 10));
      if (parts.length < 2 || parts.some((n) => isNaN(n))) return null;
      const D = parts[0];
      const F = parts[parts.length - 1];
      const M = parts.slice(1, -1).reduce((a, b) => a + b, 0);
      return { D, M, F };
    };

    const countActualPositions = (players: any[]): { D: number; M: number; F: number } => {
      const starters = players.filter((p) => p.first === 1 && p.position !== 'G');
      return {
        D: starters.filter((p) => p.position === 'D').length,
        M: starters.filter((p) => p.position === 'M').length,
        F: starters.filter((p) => p.position === 'F').length,
      };
    };

    const results = rows.map((r) => {
      const homeExpected = parseFormationCounts(r.home_formation);
      const awayExpected = parseFormationCounts(r.away_formation);
      const homeActual = countActualPositions(r.home_lineups ?? []);
      const awayActual = countActualPositions(r.away_lineups ?? []);

      const homeMatches = homeExpected ? (homeExpected.D === homeActual.D && homeExpected.M === homeActual.M && homeExpected.F === homeActual.F) : null;
      const awayMatches = awayExpected ? (awayExpected.D === awayActual.D && awayExpected.M === awayActual.M && awayExpected.F === awayActual.F) : null;

      return { matchId: r.sport_event_id, homeFormation: r.home_formation, homeExpected, homeActual, homeMatches, awayFormation: r.away_formation, awayExpected, awayActual, awayMatches };
    });

    const checkable = results.filter((r) => r.homeMatches !== null || r.awayMatches !== null);
    const checks = checkable.flatMap((r) => [r.homeMatches, r.awayMatches].filter((v) => v !== null));
    const validCount = checks.filter((v) => v === true).length;

    console.log(`\n📊 Đối chiếu formation vs position thực tế ${NAME} (sample ${rows.length} trận): ${validCount}/${checks.length} đội-trận khớp`);
    results.filter((r) => r.homeMatches === false).forEach((r) => console.log(`  ✗ ${r.matchId} (home): formation=${r.homeFormation} kỳ vọng ${JSON.stringify(r.homeExpected)}, thực tế ${JSON.stringify(r.homeActual)}`));
    results.filter((r) => r.awayMatches === false).forEach((r) => console.log(`  ✗ ${r.matchId} (away): formation=${r.awayFormation} kỳ vọng ${JSON.stringify(r.awayExpected)}, thực tế ${JSON.stringify(r.awayActual)}`));

    saveJsonForSeason(SEASON_DIR, SLUG, `lineup-formation-position-cross-check.json`, { totalSampled: rows.length, checkedCount: checks.length, validCount, results: results.slice(0, 10) });

    const pct = checks.length > 0 ? (validCount / checks.length) * 100 : 0;
    // Ngưỡng 75% (đã xác nhận ổn định ở Eredivisie qua nhiều lần chạy dao
    // động 81-92%) — dùng chung để tránh flaky do sample.
    expect.soft(pct, `Chỉ ${pct.toFixed(1)}% đội-trận có formation khớp số liệu D/M/F thực tế — lệch diện rộng có thể là lỗi gán position hoặc formation sai`).toBeGreaterThan(75);
  });

  test('Cầu thủ trong lineup đối chiếu chéo với roster ts_players — ID và tên phải khớp thật', async () => {
    const namesRelated = (a: string, b: string): boolean => {
      const norm = (s: string) => s.toLowerCase().replace(/[.·]/g, ' ').replace(/\s+/g, ' ').trim();
      const wordsA = norm(a).split(' ').filter(Boolean);
      const wordsB = norm(b).split(' ').filter(Boolean);
      if (wordsA.length === 0 || wordsB.length === 0) return false;
      const lastA = wordsA[wordsA.length - 1];
      const lastB = wordsB[wordsB.length - 1];
      if (lastA !== lastB) return false;
      const restA = wordsA.slice(0, -1);
      const restB = wordsB.slice(0, -1);
      if (restA.length === 0 || restB.length === 0) return true;
      return restA.every((w, i) => {
        const other = restB[i];
        if (!other) return true;
        return w === other || w[0] === other[0];
      });
    };

    const SAMPLE_SIZE = 100;
    const rows = await withClient(async (client) => {
      const res = await client.query(
        `SELECT elem ->> 'id' as player_id, elem ->> 'name' as lineup_name, tp.name as roster_name
         FROM sport_events sp
         JOIN match_lineups ml ON ml.sport_event_id = sp.id
         , jsonb_array_elements(ml.home_lineups || ml.away_lineups) elem
         LEFT JOIN ts_players tp ON tp.id = (elem ->> 'id')
         WHERE sp.competition_id = $1 AND sp.status_id = 8
         ORDER BY random() LIMIT $2`,
        [COMPETITION_ID, SAMPLE_SIZE]
      );
      return res.rows;
    });

    if (rows.length === 0) {
      console.warn(`⚠ SKIP: không có cầu thủ nào trong lineup của "${NAME}" để đối chiếu.`);
      test.skip(true, 'Không có lineup data');
      return;
    }

    const foundInRoster = rows.filter((r) => !!r.roster_name).length;
    const nameMatches = rows.filter((r) => r.roster_name && namesRelated(r.lineup_name, r.roster_name)).length;

    console.log(`\n📊 Đối chiếu cầu thủ lineup vs roster ts_players ${NAME} (sample ${rows.length}):`);
    console.log(`  Tồn tại trong roster: ${foundInRoster}/${rows.length}`);
    console.log(`  Tên khớp/liên quan (trong số tìm thấy): ${nameMatches}/${foundInRoster}`);
    rows.filter((r) => r.roster_name && !namesRelated(r.lineup_name, r.roster_name)).forEach((r) => console.log(`  ✗ ${r.player_id}: lineup="${r.lineup_name}" vs roster="${r.roster_name}" — không liên quan`));

    saveJsonForSeason(SEASON_DIR, SLUG, `lineup-player-roster-cross-check.json`, { totalSampled: rows.length, foundInRoster, nameMatches });

    const foundPct = (foundInRoster / rows.length) * 100;
    expect.soft(foundPct, `Chỉ ${foundPct.toFixed(1)}% player_id trong lineup tồn tại thật trong ts_players — có thể mồ côi dữ liệu`).toBeGreaterThan(70);
    if (foundInRoster > 0) {
      const nameMatchPct = (nameMatches / foundInRoster) * 100;
      expect(nameMatchPct, `Chỉ ${nameMatchPct.toFixed(1)}% cầu thủ có tên lineup khớp/liên quan tên roster — thấp bất thường, nghi ngờ lệch ID đồng bộ diện rộng`).toBeGreaterThan(95);
    }
  });

  test('HLV (coach_id) của đội đối chiếu chéo với roster ts_coaches — mapping tồn tại thật', async () => {
    const rows = await withClient(async (client) => {
      const res = await client.query(
        `SELECT DISTINCT t.id, t.name as team_name, t.coach_id, c.name as coach_name
         FROM (
           SELECT home_team_id AS team_id FROM sport_events WHERE competition_id = $1
           UNION
           SELECT away_team_id AS team_id FROM sport_events WHERE competition_id = $1
         ) x
         JOIN ts_teams t ON t.id = x.team_id
         LEFT JOIN ts_coaches c ON c.id = t.coach_id
         WHERE t.coach_id IS NOT NULL AND t.coach_id != ''`,
        [COMPETITION_ID]
      );
      return res.rows;
    });

    if (rows.length === 0) {
      console.warn(`⚠ SKIP: "${NAME}" không có đội nào có coach_id.`);
      test.skip(true, 'Không có coach_id data');
      return;
    }

    const withCoachName = rows.filter((r) => !!r.coach_name).length;
    console.log(`\n📊 Đối chiếu HLV ts_teams.coach_id vs ts_coaches ${NAME}: ${withCoachName}/${rows.length} đội có tên HLV thật`);
    rows.filter((r) => !r.coach_name).forEach((r) => console.log(`  ✗ ${r.team_name}: coach_id=${r.coach_id} không tìm thấy trong ts_coaches`));

    saveJsonForSeason(SEASON_DIR, SLUG, `team-coach-mapping-cross-check.json`, { totalTeamsWithCoachId: rows.length, withCoachName });

    const pct = (withCoachName / rows.length) * 100;
    expect.soft(pct, `Chỉ ${pct.toFixed(1)}% đội có coach_id join được sang tên HLV thật trong ts_coaches — có thể lệch ID`).toBeGreaterThan(80);
  });

  test('Ngày tháng chuyển nhượng (transfer_time) không ở tương lai', async () => {
    // ĐÃ ĐIỀU TRA: 5/1919 giao dịch có transfer_time ở tương lai (tới
    // 2027-2028) — TẤT CẢ đều có transfer_type IN (2, 7) (nghi ngờ là
    // loan/return-from-loan, ngày dự kiến kết thúc hợp đồng cho mượn) và
    // transfer_desc RỖNG (khác transfer_type=1 có phí chuyển nhượng thật).
    // KHÔNG đủ chắc chắn để kết luận là bug hay ngày kết thúc hợp đồng dự
    // kiến hợp lệ — assert soft + loại trừ transfer_type IN (2,7) khỏi
    // assert cứng, chỉ log cảnh báo riêng cho các loại này.
    const LOAN_RELATED_TYPES = new Set([2, 7]);
    const players = await withClient(async (client) => {
      const res = await client.query(
        `SELECT DISTINCT (elem ->> 'id') as player_id
         FROM sport_events sp
         JOIN match_lineups ml ON ml.sport_event_id = sp.id
         , jsonb_array_elements(ml.home_lineups || ml.away_lineups) elem
         WHERE sp.competition_id = $1
         LIMIT 300`,
        [COMPETITION_ID]
      );
      return res.rows.map((r) => r.player_id).filter(Boolean);
    });

    if (players.length === 0) {
      console.warn(`⚠ SKIP: "${NAME}" không lấy được player_id nào từ lineup.`);
      test.skip(true, 'Không có player data');
      return;
    }

    const rows = await withClient(async (client) => {
      const res = await client.query(`SELECT player_id, transfer_time, transfer_type FROM transfers WHERE player_id = ANY($1)`, [players]);
      return res.rows;
    });

    if (rows.length === 0) {
      console.warn(`⚠ SKIP: "${NAME}" không có transfer nào cho sample cầu thủ này.`);
      test.skip(true, 'Không có transfer data');
      return;
    }

    const nowUnix = Math.floor(Date.now() / 1000);
    const futureTransfers = rows.filter((r) => parseInt(r.transfer_time, 10) > nowUnix);
    const futureNonLoan = futureTransfers.filter((r) => !LOAN_RELATED_TYPES.has(r.transfer_type));
    const futureLoanRelated = futureTransfers.filter((r) => LOAN_RELATED_TYPES.has(r.transfer_type));

    console.log(`\n📊 Ngày chuyển nhượng ${NAME}: ${rows.length} giao dịch. Ở tương lai: ${futureTransfers.length} (loan-related type 2/7: ${futureLoanRelated.length}, KHÔNG phải loan: ${futureNonLoan.length})`);
    futureLoanRelated.forEach((r) => console.log(`  ⚠ player=${r.player_id}: transfer_time=${r.transfer_time} (tương lai), type=${r.transfer_type} — có thể là ngày dự kiến kết thúc cho mượn`));
    futureNonLoan.forEach((r) => console.log(`  ✗ player=${r.player_id}: transfer_time=${r.transfer_time} (tương lai), type=${r.transfer_type}`));

    saveJsonForSeason(SEASON_DIR, SLUG, `transfer-date-sanity.json`, { totalChecked: rows.length, futureTransferCount: futureTransfers.length, futureNonLoanCount: futureNonLoan.length, futureLoanRelatedCount: futureLoanRelated.length });

    expect(futureNonLoan.length, `${futureNonLoan.length}/${rows.length} giao dịch chuyển nhượng THẬT (không phải loan) có ngày ở TƯƠNG LAI — dữ liệu vô lý`).toBe(0);
    if (futureLoanRelated.length > 0) {
      console.warn(`⚠ Nghi vấn: ${futureLoanRelated.length} giao dịch type 2/7 có ngày tương lai — cần dev xác nhận đây là ngày dự kiến hợp lệ hay bug (chỉ log, chưa assert cứng).`);
    }
  });
});
