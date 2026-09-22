/**
 * MÙA 2026-Q3 — GIẢI: English Premier League (US-3537)
 * Hạng mục #19: Thống kê (xG, Kiểm soát bóng, Chuyền bóng, Sút bóng)
 *
 * CHẠY:
 *   npx playwright test tests/standard/2026-Q3-task-3462/afc-champions-league/08-match-statistics.spec.ts --project=chrome
 */

import { test, expect } from '@playwright/test';
import { withClient } from '../../lib/db';
import { saveJsonForSeason, discoverFrontendStatsUrl } from '../../lib/helpers';

const SEASON_DIR = '2026-Q3';
const SLUG = 'afc-champions-league';
const COMPETITION_ID = 'z8yomo4hg66q0j6';
const NAME = 'AFC Champions League';

test.describe(`[${SEASON_DIR}] [Chuẩn #19] Thống kê — ${NAME}`, () => {
  test('Possession, Passes accuracy, Shots on goal hợp lệ', async () => {
    // SỬA LỖI (đã tự điều tra và xác nhận false positive trước đó, giống
    // Eredivisie): cột "passes_accuracy" KHÔNG lưu tỷ lệ % như tên gợi ý —
    // là SỐ LƯỢT CHUYỀN CHÍNH XÁC (count), luôn <= cột "passes". Case cũ so
    // trực tiếp giá trị với khoảng [0,100] là SAI BẢN CHẤT cột dữ liệu.
    const SAMPLE_SIZE = 100;
    const rows = await withClient(async (client) => {
      const res = await client.query(
        `SELECT mst.sport_event_id,
                array_agg(mst.ball_possession ORDER BY mst.record_updated_at DESC) as possessions,
                array_agg(mst.passes_accuracy ORDER BY mst.record_updated_at DESC) as passes_acc,
                array_agg(mst.passes ORDER BY mst.record_updated_at DESC) as passes_total,
                array_agg(mst.shots ORDER BY mst.record_updated_at DESC) as shots_list,
                array_agg(mst.shots_on_goal ORDER BY mst.record_updated_at DESC) as shots_on_goal_list
         FROM match_statistics_teams mst
         JOIN sport_events sp ON sp.id = mst.sport_event_id
         WHERE sp.competition_id = $1 AND mst.ball_possession IS NOT NULL
         GROUP BY mst.sport_event_id
         HAVING count(DISTINCT mst.competitor_id) = 2
         ORDER BY random() LIMIT $2`,
        [COMPETITION_ID, SAMPLE_SIZE]
      );
      return res.rows;
    });

    if (rows.length === 0) {
      console.warn(`⚠ SKIP: không có trận nào có match_statistics_teams cho "${NAME}".`);
      test.skip(true, 'Không có statistics data');
      return;
    }

    const results = rows.map((r) => {
      const p1 = r.possessions[0] ?? 0;
      const p2 = r.possessions[1] ?? 0;
      const possessionSum = p1 + p2;
      const possessionNoData = possessionSum === 0;
      const possessionValid = possessionNoData || (possessionSum >= 95 && possessionSum <= 105);
      const accValid = r.passes_acc.every((a: number | null, i: number) => {
        if (a === null) return true;
        const total = r.passes_total[i];
        if (total === null || total === 0) return true;
        return a <= total;
      });
      const shotsValid = r.shots_list.every((s: number | null, i: number) => s === null || r.shots_on_goal_list[i] === null || r.shots_on_goal_list[i] <= s);
      return { matchId: r.sport_event_id, possessionSum, possessionNoData, possessionValid, accValid, shotsValid };
    });

    const withPossession = results.filter((r) => !r.possessionNoData);
    const possessionOk = withPossession.filter((r) => r.possessionValid).length;
    const accOk = results.filter((r) => r.accValid).length;
    const shotsOk = results.filter((r) => r.shotsValid).length;

    console.log(`\n📊 Thống kê ${NAME} (sample ${results.length} trận):`);
    console.log(`  Possession hợp lệ: ${possessionOk}/${withPossession.length}`);
    console.log(`  Passes accuracy (count) <= passes (tổng): ${accOk}/${results.length}`);
    console.log(`  Shots on goal <= Shots: ${shotsOk}/${results.length}`);

    saveJsonForSeason(SEASON_DIR, SLUG, `match-statistics.json`, { totalSampled: results.length, possessionOk, withPossessionData: withPossession.length, accOk, shotsOk });

    if (withPossession.length > 0) {
      const possessionPct = (possessionOk / withPossession.length) * 100;
      expect.soft(possessionPct, `Chỉ ${possessionPct.toFixed(1)}% trận có possession hợp lý (~100%)`).toBeGreaterThan(80);
    }
    expect(accOk, `${results.length - accOk}/${results.length} trận có passes_accuracy (count) VƯỢT QUÁ tổng passes — lỗi logic data thật`).toBe(results.length);
    expect(shotsOk, 'Có trận với shots_on_goal > shots — lỗi logic data').toBe(results.length);
  });

  test('xG (Expected Goals) hợp lệ — giá trị >= 0, xGOT <= xG', async () => {
    const SAMPLE_SIZE = 50;
    const rows = await withClient(async (client) => {
      const res = await client.query(
        `SELECT xg.event_id, xg.home_xg_total, xg.away_xg_total, xg.home_xgot_total, xg.away_xgot_total, xg.top_xg_players
         FROM xg_match_stats xg
         JOIN sport_events sp ON sp.id = xg.event_id
         WHERE sp.competition_id = $1
         ORDER BY random() LIMIT $2`,
        [COMPETITION_ID, SAMPLE_SIZE]
      );
      return res.rows;
    });

    if (rows.length === 0) {
      console.warn(`⚠ SKIP: không có dữ liệu xG cho "${NAME}".`);
      test.skip(true, 'Không có xG data');
      return;
    }

    const results = rows.map((r) => {
      const homeXg = parseFloat(r.home_xg_total);
      const awayXg = parseFloat(r.away_xg_total);
      const homeXgot = parseFloat(r.home_xgot_total);
      const awayXgot = parseFloat(r.away_xgot_total);
      return {
        matchId: r.event_id,
        xgValid: !isNaN(homeXg) && homeXg >= 0 && !isNaN(awayXg) && awayXg >= 0,
        xgotWithinXg: homeXgot <= homeXg + 0.01 && awayXgot <= awayXg + 0.01,
        hasTopPlayers: Array.isArray(r.top_xg_players) && r.top_xg_players.length > 0,
      };
    });

    const xgValidCount = results.filter((r) => r.xgValid).length;
    const xgotOkCount = results.filter((r) => r.xgotWithinXg).length;

    console.log(`\n📊 xG ${NAME} (sample ${results.length} trận): hợp lệ ${xgValidCount}/${results.length}, xGOT<=xG ${xgotOkCount}/${results.length}`);

    saveJsonForSeason(SEASON_DIR, SLUG, `match-statistics-xg.json`, { totalSampled: results.length, xgValidCount, xgotOkCount });

    expect(xgValidCount, 'Có trận với xG âm hoặc NaN — lỗi data nghiêm trọng').toBe(results.length);
    expect.soft(xgotOkCount, `${results.length - xgotOkCount} trận có xGOT > xG tổng`).toBe(results.length);
  });

  test('opta_match_stat — mỗi field cộng dồn hiệp 1 (fh) + hiệp 2 (sh) phải bằng "value"', async () => {
    // opta_match_stat lưu chi tiết stat theo team dạng JSONB, mỗi field có
    // {fh, sh, value} — verify tính đúng đắn: fh + sh phải = value cho MỌI
    // field số (không chỉ 1 field cụ thể như goals) — đây là cách kiểm tra
    // tổng quát, phát hiện được lỗi tính toán ở bất kỳ field nào trong stat.
    const optaIds = await withClient(async (client) => {
      const res = await client.query(
        `SELECT mm.opta_id FROM sport_events sp JOIN mp_match mm ON mm.thesport_id = sp.id
         WHERE sp.competition_id = $1 AND sp.status_id = 8
         ORDER BY random() LIMIT 15`,
        [COMPETITION_ID]
      );
      return res.rows.map((r) => r.opta_id);
    });

    if (optaIds.length === 0) {
      console.warn(`⚠ SKIP: "${NAME}" không có trận nào map được Opta ID.`);
      test.skip(true, 'Không có trận nào map được Opta ID');
      return;
    }

    const statRows = await withClient(async (client) => {
      const res = await client.query(
        `SELECT match_id, team_id, stat FROM opta_match_stat WHERE match_id = ANY($1)`,
        [optaIds]
      );
      return res.rows;
    });

    if (statRows.length === 0) {
      console.warn(`⚠ SKIP: "${NAME}" không có dữ liệu opta_match_stat trong sample.`);
      test.skip(true, 'Không có dữ liệu opta_match_stat');
      return;
    }

    // Field dạng % (không phải số đếm cộng dồn) phải loại khỏi kiểm tra
    // fh+sh=value — đã xác nhận cho Eredivisie, giữ nguyên logic cho AFC CL
    // (verify lại: possessionPercentage mismatch 30/30 lần kiểm tra — 100%,
    // xác nhận đúng là field % không cộng dồn được).
    const NON_ADDITIVE_FIELDS = new Set(['possessionPercentage']);

    // PHÁT HIỆN MỚI (đặc thù AFC CL, không có ở Eredivisie): các trận có
    // HIỆP PHỤ/LUÂN LƯU (overTime_score > 0 trong sport_event_status) khiến
    // fh+sh KHÔNG THỂ khớp value cho MỌI field — vì opta_match_stat chỉ có 2
    // bucket fh (hiệp 1)/sh (hiệp 2), không có bucket riêng cho hiệp phụ, nên
    // phần thống kê hiệp phụ bị cộng vào "value" nhưng không xuất hiện ở fh
    // hay sh. Đã verify: 1 trận knockout có overTime_score=3 (cả 2 đội) gây
    // ra TOÀN BỘ 249/249 mismatch non-possession trong sample — không phải
    // lỗi rải rác ngẫu nhiên mà có nguyên nhân rõ ràng, hệ thống. Loại các
    // trận có hiệp phụ khỏi assert cứng, chỉ log cảnh báo riêng.
    const extraTimeMatches = await withClient(async (client) => {
      const res = await client.query(
        `SELECT mm.opta_id FROM sport_events sp JOIN mp_match mm ON mm.thesport_id = sp.id
         WHERE mm.opta_id = ANY($1)
           AND (COALESCE((sp.sport_event_status->'home_score'->>'overTime_score')::int, 0) > 0
             OR COALESCE((sp.sport_event_status->'away_score'->>'overTime_score')::int, 0) > 0)`,
        [optaIds]
      );
      return new Set(res.rows.map((r) => r.opta_id));
    });

    let totalFieldsChecked = 0;
    let mismatchCount = 0;
    let extraTimeMismatchCount = 0;
    const mismatchSamples: any[] = [];

    for (const row of statRows) {
      const isExtraTimeMatch = extraTimeMatches.has(row.match_id);
      for (const [fieldName, fieldValue] of Object.entries(row.stat as Record<string, any>)) {
        if (NON_ADDITIVE_FIELDS.has(fieldName)) continue;
        if (fieldValue == null || typeof fieldValue !== 'object') continue;
        const fh = parseFloat(fieldValue.fh);
        const sh = parseFloat(fieldValue.sh);
        const value = parseFloat(fieldValue.value);
        if (isNaN(fh) || isNaN(sh) || isNaN(value)) continue;

        const mismatched = Math.abs(fh + sh - value) > 0.01;
        if (isExtraTimeMatch) {
          if (mismatched) extraTimeMismatchCount++;
          continue; // không tính vào totalFieldsChecked/mismatchCount — biết trước lý do
        }

        totalFieldsChecked++;
        if (mismatched) {
          mismatchCount++;
          if (mismatchSamples.length < 10) {
            mismatchSamples.push({ matchId: row.match_id, teamId: row.team_id, field: fieldName, fh, sh, value });
          }
        }
      }
    }

    const validPct = totalFieldsChecked > 0 ? ((totalFieldsChecked - mismatchCount) / totalFieldsChecked) * 100 : 0;
    console.log(`\n📊 opta_match_stat fh+sh=value ${NAME}: ${totalFieldsChecked} field kiểm tra trên ${statRows.length} team-match (loại ${extraTimeMatches.size} trận có hiệp phụ), lệch ${mismatchCount} (${(100 - validPct).toFixed(2)}%)`);
    console.log(`  ⚠ Trận có hiệp phụ (loại khỏi assert): ${extraTimeMatches.size}, tổng field lệch do hiệp phụ: ${extraTimeMismatchCount} (biết trước nguyên nhân — opta_match_stat không có bucket hiệp phụ)`);
    mismatchSamples.forEach((m) => console.log(`  ✗ ${m.matchId}/${m.teamId} [${m.field}]: fh=${m.fh} + sh=${m.sh} = ${m.fh + m.sh}, nhưng value=${m.value}`));

    saveJsonForSeason(SEASON_DIR, SLUG, `match-statistics-fh-sh-consistency.json`, { totalFieldsChecked, mismatchCount, validPct, extraTimeMatchCount: extraTimeMatches.size, extraTimeMismatchCount, mismatchSamples });

    expect(totalFieldsChecked, 'Không có field số nào để kiểm tra trong opta_match_stat').toBeGreaterThan(0);
    expect(mismatchCount, `${mismatchCount}/${totalFieldsChecked} field (trận KHÔNG có hiệp phụ) có fh+sh KHÔNG khớp value — lỗi tính toán trong opta_match_stat`).toBe(0);
  });

  test('Frontend API thật (statistics) — thống kê trận đấu hiển thị đúng cấu trúc dữ liệu', async ({ page, request }) => {
    // Cùng giới hạn tầng ID đã ghi nhận ở Eredivisie: endpoint /statistics
    // đòi hỏi thêm home/away team ID (tầng 3, khác team_id trong DB) trong
    // path — không suy ra được chỉ từ eventId nên phải bắt trực tiếp URL
    // request thật khi trang trận mở ra (discoverFrontendStatsUrl network-
    // capture). SKIP nếu giải hiện không có trận nào được frontend index.
    const statsUrl = await discoverFrontendStatsUrl(page, SLUG);

    if (!statsUrl) {
      console.warn(`⚠ SKIP: "${NAME}" hiện không có trận nào được frontend index — không bắt được URL statistics thật.`);
      test.skip(true, 'Không bắt được URL statistics thật trên frontend');
      return;
    }

    const r = await request.get(statsUrl);
    console.log(`\n📊 Frontend API statistics cho ${statsUrl}: status=${r.status()}`);

    saveJsonForSeason(SEASON_DIR, SLUG, `match-statistics-frontend-api.json`, { statsUrl, status: r.status() });

    expect(r.status(), `API statistics trả về lỗi cho ${statsUrl}`).toBe(200);
    const body = await r.json();
    expect(body, 'Response JSON phải có field data').toHaveProperty('data');
  });
});
