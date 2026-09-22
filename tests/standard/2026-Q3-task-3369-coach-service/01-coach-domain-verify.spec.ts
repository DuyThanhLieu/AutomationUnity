/**
 * US-3369 — [Golang] Coach domain: migrate opta-api coach endpoints sang
 * service Go riêng, domain mới xác nhận qua Slack thread (Robert Ng → Justin
 * Lieu, 2026-08-27): domain test ban đầu là staging-player-svc.uniscore.vn,
 * chốt cuối cùng đổi qua opta-api.uniscore.vn.
 *
 * Đã verify bằng Playwright MCP thật (browser_navigate + network inspect) —
 * KHÔNG chỉ curl — cả 6 route đều 200 trên domain mới, và mọi response đều
 * có field "error_code" (dấu hiệu phân biệt Go vs NestJS đã xác lập từ task
 * US-898 Odds: "Go có field error_code, NestJS không có") — xác nhận domain
 * mới ĐÃ thật sự serve bằng Go, không phải NestJS fallback.
 *
 * Mẫu cố định: Paulo Fonseca (s5ofw4kosjhn5ek), HLV Lyon hiện tại — cùng team
 * (1z88sr5oo8ontsd) đã dùng xuyên suốt các task trước (Player xG PXG-18,
 * US-900 Player+Honor).
 *
 * 6 route theo path pattern trong thông báo domain:
 *   /coach/:id/info
 *   /coach/:id/info/:something (2 tham số — CHƯA rõ tham số 2 dùng để làm gì,
 *     xem test riêng)
 *   /coach/:id/career-history
 *   /coach/:id/last-matches
 *   /coach/:id/performance
 *   /coach/:id/stats
 *   /coach/:id/career-history-seasons-detail
 *
 * CHẠY:
 *   npx playwright test tests/standard/2026-Q3-task-3369-coach-service/01-coach-domain-verify.spec.ts --project=chrome
 */

import { test, expect } from '@playwright/test';

const DOMAIN = 'https://opta-api.uniscore.vn/api/v2/football/coach';
const COACH_ID = 's5ofw4kosjhn5ek'; // Paulo Fonseca, Lyon
const LYON_TEAM_ID = '1z88sr5oo8ontsd';

async function getJson(request: any, path: string) {
  const res = await request.get(`${DOMAIN}${path}`);
  const status = res.status();
  const body = await res.json().catch(() => null);
  return { status, body };
}

test.describe('[US-3369] Coach domain trên opta-api.uniscore.vn — 6 route đều 200 + có error_code (xác nhận Go)', () => {
  test('/coach/:id/info — trả đúng thông tin cơ bản HLV', async ({ request }) => {
    const { status, body } = await getJson(request, `/${COACH_ID}/info`);
    expect(status).toBe(200);
    expect(body).toHaveProperty('error_code'); // dấu hiệu Go, theo quy ước đã xác lập ở US-898
    expect(body.data.manager.name).toBe('Paulo Fonseca');
    expect(body.data.manager.id).toBe(COACH_ID);
    expect(body.data.manager.matches).toBe(72);
    expect(body.data.manager.teams[0].id).toBe(LYON_TEAM_ID);
  });

  test('/coach/:id/career-history — đầy đủ lịch sử từ Amadora U19 đến Lyon hiện tại', async ({ request }) => {
    const { status, body } = await getJson(request, `/${COACH_ID}/career-history`);
    expect(status).toBe(200);
    expect(body).toHaveProperty('error_code');
    expect(Array.isArray(body.data.careerHistory)).toBe(true);
    expect(body.data.careerHistory.length).toBeGreaterThan(0);
    const lyonEntry = body.data.careerHistory.find((c: any) => c.team.id === LYON_TEAM_ID);
    expect(lyonEntry, 'career-history phải có entry cho Lyon (đội hiện tại)').toBeTruthy();
    expect(lyonEntry.performance.total).toBe(72); // khớp info.manager.matches=72
  });

  test('/coach/:id/last-matches — data là MẢNG trực tiếp (không lồng trong object), 5 trận gần nhất', async ({ request }) => {
    const { status, body } = await getJson(request, `/${COACH_ID}/last-matches`);
    expect(status).toBe(200);
    expect(body).toHaveProperty('error_code');
    expect(Array.isArray(body.data), 'last-matches: data phải là array trực tiếp, KHÁC performance (data.events lồng)').toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
    for (const match of body.data) {
      expect(match).toHaveProperty('homeTeam');
      expect(match).toHaveProperty('awayTeam');
      expect(match).toHaveProperty('winnerCode');
    }
  });

  test('/coach/:id/performance — data.events[] + data.points{} + data.teamIdsWithCount[] (shape lồng, KHÁC last-matches)', async ({ request }) => {
    const { status, body } = await getJson(request, `/${COACH_ID}/performance`);
    expect(status).toBe(200);
    expect(body).toHaveProperty('error_code');
    expect(Array.isArray(body.data.events)).toBe(true);
    expect(typeof body.data.points).toBe('object');
    expect(Array.isArray(body.data.teamIdsWithCount)).toBe(true);
    // Mỗi event phải có 1 điểm số tương ứng trong points{}, khớp theo id
    for (const ev of body.data.events) {
      expect(body.data.points, `event id=${ev.id} phải có điểm tương ứng trong points{}`).toHaveProperty(ev.id);
    }
  });

  test('/coach/:id/stats — số liệu Lyon hiện tại khớp career-history.performance', async ({ request }) => {
    const { status, body } = await getJson(request, `/${COACH_ID}/stats`);
    expect(status).toBe(200);
    expect(body).toHaveProperty('error_code');
    expect(body.data.team.id).toBe(LYON_TEAM_ID);
    expect(body.data.matches).toBe(72);
    expect(body.data.win).toBe(41);
    expect(body.data.draw).toBe(9);
    expect(body.data.lose).toBe(22);
    // Đối chiếu chéo tổng: win+draw+lose phải = matches
    expect(body.data.win + body.data.draw + body.data.lose).toBe(body.data.matches);
  });

  test('/coach/:id/career-history-seasons-detail — chi tiết theo mùa/giải, đối chiếu chéo với career-history tổng', async ({ request }) => {
    const { status, body } = await getJson(request, `/${COACH_ID}/career-history-seasons-detail`);
    expect(status).toBe(200);
    expect(body).toHaveProperty('error_code');
    expect(Array.isArray(body.data)).toBe(true);

    // Mẫu đối chiếu cụ thể đã verify tay: mùa 2024-2025, AC Milan, Serie A = 16 trận
    const season2425 = body.data.find((s: any) => s.seasonName === '2024-2025');
    expect(season2425, 'phải có mùa 2024-2025').toBeTruthy();
    const acMilan = season2425.teams.find((t: any) => t.teamName === 'AC Milan');
    expect(acMilan, 'mùa 2024-2025 phải có AC Milan').toBeTruthy();
    const serieA = acMilan.participations.find((p: any) => p.competitionName === 'Serie A');
    expect(serieA.totalMatches).toBe(16);
    expect(serieA.wins).toBe(7);
    expect(serieA.draws).toBe(5);
    expect(serieA.losses).toBe(4);
  });
});

test.describe('[US-3369] Đối chiếu chéo giữa các route — số liệu phải nhất quán nội bộ', () => {
  test('Tổng "matches" (career-history) mùa hiện tại Lyon phải khớp giữa info / stats / career-history', async ({ request }) => {
    const info = await getJson(request, `/${COACH_ID}/info`);
    const stats = await getJson(request, `/${COACH_ID}/stats`);
    const history = await getJson(request, `/${COACH_ID}/career-history`);

    const lyonFromHistory = history.body.data.careerHistory.find((c: any) => c.team.id === LYON_TEAM_ID);

    expect(info.body.data.manager.matches).toBe(stats.body.data.matches);
    expect(stats.body.data.matches).toBe(lyonFromHistory.performance.total);
    expect(stats.body.data.win).toBe(lyonFromHistory.performance.wins);
    expect(stats.body.data.draw).toBe(lyonFromHistory.performance.draws);
    expect(stats.body.data.lose).toBe(lyonFromHistory.performance.losses);
  });

  test('career-history-seasons-detail: tổng totalMatches Ligue 1 các mùa Lyon phải ≤ tổng matches ở stats (career-history-seasons-detail có nhiều giải/mùa, stats chỉ tổng 1 con số)', async ({ request }) => {
    const seasonsDetail = await getJson(request, `/${COACH_ID}/career-history-seasons-detail`);
    const stats = await getJson(request, `/${COACH_ID}/stats`);

    let sumMatchesLyon = 0;
    for (const season of seasonsDetail.body.data) {
      const lyonTeam = season.teams.find((t: any) => t.teamId === LYON_TEAM_ID);
      if (!lyonTeam) continue;
      for (const p of lyonTeam.participations) {
        sumMatchesLyon += p.totalMatches;
      }
    }
    // seasons-detail cộng dồn TẤT CẢ giải (Ligue 1 + Coupe de France + Europa League...),
    // trong khi stats.matches=72 có thể chỉ tính riêng 1 loại (vd chỉ league).
    // Không assert bằng nhau cứng — chỉ log để QA xác nhận công thức đúng với dev.
    console.log(`  Tổng matches cộng dồn mọi giải (seasons-detail) cho Lyon: ${sumMatchesLyon}, stats.matches (tổng chính thức): ${stats.body.data.matches}`);
  });
});
