/**
 * US-900 — 2 bug đã điều tra khi đối chiếu domain Go staging
 * (staging-player-svc.uniscore.vn) vs domain NestJS legacy (opta-api.uniscore.vn).
 *
 * TRẠNG THÁI (retest 28/08/2026, sau khi dev báo fix):
 *   BUG-1 (tournament.id) — KHÔNG cần sửa (bug ở domain CŨ, tự hết khi cutover
 *     sang Go). Vẫn giữ 2 test này ĐỎ có chủ đích làm tài liệu tham khảo —
 *     KHÔNG PHẢI dấu hiệu "còn bug cần dev xử lý". Domain cũ không được sửa.
 *   BUG-2 (xgOverall/goalsPrevented thiếu) — ✅ ĐÃ FIX, retest PASS 4/4 (kể
 *     cả case biên Chevalier goalsPrevented=0.4281). Xem log run gần nhất
 *     trong results/BUG_REPORT_US900_Player_GoStaging_DataMismatch.md.
 *
 * Xem thêm:
 *   results/BUG_REPORT_US900_Player_GoStaging_DataMismatch.md (đầy đủ)
 *   results/BUG_LOG_US900_ChoDev.md (bản ngắn gửi dev)
 *
 * Mẫu: Corentin Tolisso (q69zrnleeejrah5), Lyon, Ligue 1, mùa 2025-2026.
 *
 * CHẠY:
 *   npx playwright test tests/standard/2026-Q3-task-900-player-honor-service/06-known-bugs.spec.ts --project=chrome
 */

import { test, expect } from '@playwright/test';

const NESTJS_LEGACY = 'https://opta-api.uniscore.vn/api/v2/football';
const GO_STAGING = 'https://staging-player-svc.uniscore.vn/api/v2/football';
const PLAYER_ID = 'q69zrnleeejrah5'; // Corentin Tolisso
const TOURNAMENT_ID = 'bm0nxitovzu9p9u'; // Ligue 1
const SEASON_ID = '2es0s3ko448ntnv'; // mùa 2025-2026

test.describe('[US-900][BUG-1] tournament.id sai ở domain CŨ (NestJS) — domain MỚI (Go) đã đúng', () => {
  test('events/last: domain cũ trả tournament.id KHÔNG resolve được, domain mới trả đúng', async ({ request }) => {
    const path = `/player/${PLAYER_ID}/events/last/1?language=en`;
    const [legacyRes, goRes] = await Promise.all([request.get(`${NESTJS_LEGACY}${path}`), request.get(`${GO_STAGING}${path}`)]);

    expect(legacyRes.status()).toBe(200);
    expect(goRes.status()).toBe(200);

    const legacyBody = await legacyRes.json();
    const goBody = await goRes.json();

    const legacyTournamentId = legacyBody.data.events[0].tournament.id;
    const goTournamentId = goBody.data.events[0].tournament.id;

    console.log(`  Domain CŨ  (${NESTJS_LEGACY}) tournament.id = "${legacyTournamentId}"`);
    console.log(`  Domain MỚI (${GO_STAGING}) tournament.id = "${goTournamentId}"`);

    // Verify ĐỘC LẬP: gọi endpoint chuyên resolve giải đấu cho cả 2 ID, để
    // chứng minh khách quan ai đúng ai sai — không chỉ dựa vào "khác nhau".
    const [legacyResolve, goResolve] = await Promise.all([
      request.get(`${NESTJS_LEGACY}/unique-tournament/${legacyTournamentId}?language=en`),
      request.get(`${NESTJS_LEGACY}/unique-tournament/${goTournamentId}?language=en`),
    ]);
    const legacyResolveBody = await legacyResolve.json();
    const goResolveBody = await goResolve.json();

    console.log(`  Thử resolve ID của domain CŨ ("${legacyTournamentId}") → code=${legacyResolveBody.code}, data=${JSON.stringify(legacyResolveBody.data).slice(0, 80)}`);
    console.log(`  Thử resolve ID của domain MỚI ("${goTournamentId}") → code=${goResolveBody.code}, name=${goResolveBody.data?.uniqueTournament?.name}`);

    // BUG CONFIRMED: ID của domain cũ không resolve được (code=2, data rỗng).
    // Giữ assert này ĐỎ để nhắc: domain cũ có bug, KHÔNG PHẢI domain mới —
    // không sửa test để "cho qua", đây là bằng chứng sống cần dev biết.
    expect(legacyResolveBody.code, `BUG domain CŨ: tournament.id="${legacyTournamentId}" không resolve được (mong đợi code=3 nhưng nhận code=${legacyResolveBody.code}) — ID này SAI`).toBe(3);

    // Domain MỚI phải luôn resolve đúng — nếu test này tự FAIL nghĩa là domain
    // mới đã bị hỏng theo hướng khác, cần điều tra lại từ đầu.
    expect(goResolveBody.code, 'domain MỚI phải resolve đúng tournament.id').toBe(3);
    expect(goResolveBody.data.uniqueTournament.name).toBe('Ligue 1');
  });
});

test.describe('[US-900][BUG-2] Domain MỚI (Go) thiếu field xG mùa giải — domain CŨ vẫn có đủ', () => {
  test('statistics/overall: domain mới THIẾU xgOverall + goalsPrevented so với domain cũ', async ({ request }) => {
    const path = `/player/${PLAYER_ID}/unique-tournament/${TOURNAMENT_ID}/season/${SEASON_ID}/statistics/overall?language=en`;
    const [legacyRes, goRes] = await Promise.all([request.get(`${NESTJS_LEGACY}${path}`), request.get(`${GO_STAGING}${path}`)]);

    expect(legacyRes.status()).toBe(200);
    expect(goRes.status()).toBe(200);

    const legacyStats = (await legacyRes.json()).data.statistics;
    const goStats = (await goRes.json()).data.statistics;

    console.log(`  Domain CŨ  — xgOverall=${legacyStats.xgOverall}, goalsPrevented=${legacyStats.goalsPrevented}`);
    console.log(`  Domain MỚI — xgOverall=${goStats.xgOverall}, goalsPrevented=${goStats.goalsPrevented}`);

    // Domain cũ phải có đủ 2 field này để làm baseline so sánh có ý nghĩa.
    expect(legacyStats.xgOverall, 'domain cũ phải có xgOverall để đối chiếu').toBeDefined();
    expect(legacyStats.goalsPrevented, 'domain cũ phải có goalsPrevented để đối chiếu').toBeDefined();

    // BUG CONFIRMED: domain mới thiếu 2 field này dù dữ liệu đã có sẵn đúng
    // trong DB (bảng xg_seasonal_player_stats — xem bug report đầy đủ). Giữ
    // assert ĐỎ tới khi dev bổ sung map field vào Go handler.
    expect(goStats.xgOverall, `BUG domain MỚI: thiếu field xgOverall (domain cũ có giá trị ${legacyStats.xgOverall}) — dữ liệu đã có sẵn trong bảng xg_seasonal_player_stats, chỉ thiếu map field ở Go handler`).toBe(legacyStats.xgOverall);
    expect(goStats.goalsPrevented, `BUG domain MỚI: thiếu field goalsPrevented (domain cũ có giá trị ${legacyStats.goalsPrevented})`).toBe(legacyStats.goalsPrevented);
  });

  test('statistics/overall-v2: domain mới THIẾU xg_overall + goals_prevented (bản snake_case) so với domain cũ', async ({ request }) => {
    const path = `/player/${PLAYER_ID}/unique-tournament/${TOURNAMENT_ID}/season/${SEASON_ID}/statistics/overall-v2?language=en`;
    const [legacyRes, goRes] = await Promise.all([request.get(`${NESTJS_LEGACY}${path}`), request.get(`${GO_STAGING}${path}`)]);

    expect(legacyRes.status()).toBe(200);
    expect(goRes.status()).toBe(200);

    const legacyStats = (await legacyRes.json()).data.statistics;
    const goStats = (await goRes.json()).data.statistics;

    console.log(`  Domain CŨ  — xg_overall=${legacyStats.xg_overall}, goals_prevented=${legacyStats.goals_prevented}`);
    console.log(`  Domain MỚI — xg_overall=${goStats.xg_overall}, goals_prevented=${goStats.goals_prevented}`);

    expect(legacyStats.xg_overall, 'domain cũ phải có xg_overall để đối chiếu').toBeDefined();
    expect(legacyStats.goals_prevented, 'domain cũ phải có goals_prevented để đối chiếu').toBeDefined();

    expect(goStats.xg_overall, `BUG domain MỚI (overall-v2): thiếu field xg_overall (domain cũ có giá trị ${legacyStats.xg_overall})`).toBe(legacyStats.xg_overall);
    expect(goStats.goals_prevented, `BUG domain MỚI (overall-v2): thiếu field goals_prevented (domain cũ có giá trị ${legacyStats.goals_prevented})`).toBe(legacyStats.goals_prevented);
  });

  test('MỞ RỘNG — Bradley Barcola (PSG, khác đội với Tolisso): bug lặp lại y hệt, xác nhận mang tính hệ thống', async ({ request }) => {
    const path = `/player/5z3v0bln4dbhvu6/unique-tournament/${TOURNAMENT_ID}/season/${SEASON_ID}/statistics/overall?language=en`;
    const [legacyRes, goRes] = await Promise.all([request.get(`${NESTJS_LEGACY}${path}`), request.get(`${GO_STAGING}${path}`)]);
    const legacyStats = (await legacyRes.json()).data.statistics;
    const goStats = (await goRes.json()).data.statistics;

    console.log(`  Barcola — Domain CŨ: xgOverall=${legacyStats.xgOverall}, goalsPrevented=${legacyStats.goalsPrevented}`);
    console.log(`  Barcola — Domain MỚI: xgOverall=${goStats.xgOverall}, goalsPrevented=${goStats.goalsPrevented}`);

    expect(goStats.xgOverall, `BUG lặp lại ở Barcola (không riêng Tolisso) — domain cũ có ${legacyStats.xgOverall}, domain mới thiếu`).toBe(legacyStats.xgOverall);
  });

  test('CASE BIÊN — Lucas Chevalier (thủ môn, PSG): goalsPrevented=0.4281 (số thật, không phải 0 mặc định) — bằng chứng mạnh nhất field bị thiếu', async ({ request }) => {
    const path = `/player/1ztvu6l91jswv9p/unique-tournament/${TOURNAMENT_ID}/season/${SEASON_ID}/statistics/overall?language=en`;
    const [legacyRes, goRes] = await Promise.all([request.get(`${NESTJS_LEGACY}${path}`), request.get(`${GO_STAGING}${path}`)]);
    const legacyStats = (await legacyRes.json()).data.statistics;
    const goStats = (await goRes.json()).data.statistics;

    console.log(`  Chevalier — Domain CŨ: goalsPrevented=${legacyStats.goalsPrevented}, goalsConceded=${legacyStats.goalsConceded}`);
    console.log(`  Chevalier — Domain MỚI: goalsPrevented=${goStats.goalsPrevented}, goalsConceded=${goStats.goalsConceded}`);

    // goalsConceded KHÔNG liên quan tới xG — verify field này vẫn khớp để
    // chứng minh domain mới không bị lỗi TOÀN BỘ, chỉ riêng 2 field xG.
    expect(goStats.goalsConceded, 'field không liên quan xG (goalsConceded) phải vẫn khớp bình thường').toBe(legacyStats.goalsConceded);

    expect(
      goStats.goalsPrevented,
      `BUG rõ ràng nhất: domain cũ có goalsPrevented=${legacyStats.goalsPrevented} (số thập phân có ý nghĩa, không phải 0 mặc định) — domain mới thiếu hẳn field này`
    ).toBe(legacyStats.goalsPrevented);
  });
});

test.describe('[US-900][BUG-1 mở rộng] tournament.id sai lặp lại ở giải khác (World Cup Qualification UEFA)', () => {
  test('Bradley Barcola, trận World Cup Qualification — cùng pattern lỗi như Ligue 1', async ({ request }) => {
    const path = `/player/5z3v0bln4dbhvu6/events/last/1?language=en`;
    const [legacyRes, goRes] = await Promise.all([request.get(`${NESTJS_LEGACY}${path}`), request.get(`${GO_STAGING}${path}`)]);
    const legacyEvent = (await legacyRes.json()).data.events[0];
    const goEvent = (await goRes.json()).data.events[0];

    expect(legacyEvent.id, 'phải cùng 1 trận đấu để so sánh có ý nghĩa').toBe(goEvent.id);

    const legacyTournamentId = legacyEvent.tournament.id;
    // Go có thể trả kèm suffix dạng "{id}_4" cho 1 số giải cup — cắt phần
    // trước "_" trước khi thử resolve, tránh false negative do format khác.
    const goTournamentId = goEvent.tournament.id.split('_')[0];

    console.log(`  Giải: ${legacyEvent.tournament.name} | Domain CŨ id="${legacyTournamentId}" | Domain MỚI id="${goEvent.tournament.id}"`);

    const [legacyResolve, goResolve] = await Promise.all([
      request.get(`${NESTJS_LEGACY}/unique-tournament/${legacyTournamentId}?language=en`),
      request.get(`${NESTJS_LEGACY}/unique-tournament/${goTournamentId}?language=en`),
    ]);
    const legacyResolveBody = await legacyResolve.json();
    const goResolveBody = await goResolve.json();

    console.log(`  Resolve ID domain CŨ → code=${legacyResolveBody.code}`);
    console.log(`  Resolve ID domain MỚI → code=${goResolveBody.code}, name=${goResolveBody.data?.uniqueTournament?.name}`);

    expect(legacyResolveBody.code, `BUG lặp lại ở giải khác (${legacyEvent.tournament.name}): tournament.id domain cũ không resolve được`).toBe(3);
  });
});
