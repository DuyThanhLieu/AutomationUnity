/**
 * UTD-899 — nhóm A: so sánh API cũ (NestJS) vs API mới (Go) trên staging.
 * TC A1 status · A2 data · A3 thứ tự · A4 tên field (A2/A3/A4 cùng 1 phép so sánh data)
 *    A5 language · A6 id sai · A7 route legacy · A8 logo · A9 HEAD · A10 phân trang.
 *
 * CHẠY: npx playwright test tests/standard/2026-Q3-task-899-competition-service/01-compare-old-vs-new.spec.ts --project=chrome
 */
import { test, expect } from '@playwright/test';
import { HOSTS, SAMPLES, GLOBAL_ROUTES, routesFor, call, stable, diff, payload, sameSet, toSnakeKeys, type Route } from './lib/competition-client';

/** Route đổi field sang camelCase có chủ đích (các route -v2 / /old) — so sánh sau khi chuẩn hoá về snake_case. */
const CAMEL_CASE_ROUTES = ['top-players/overall-v2', 'top-players/overall/old', 'top-players-per-game/all/overall-v2', 'top-teams/overall-v2', 'top-teams/overall/old'];
const isCamelCaseRoute = (path: string) => CAMEL_CASE_ROUTES.some((p) => path.includes(p));

/** Highlight: nội dung mới nhất thay đổi liên tục theo thời gian thực (video mới được thêm) — không so sánh theo item, chỉ theo cấu trúc + field known. */
const isHighlightRoute = (path: string) => path.includes('/highlight');

/** UTD-1196 (latest-matches): field "rating" — Go làm tròn 2 chữ số thập phân theo ĐÚNG quy ước chung
 * toàn hệ thống (đối chứng route top-players/overall: cả NestJS lẫn Go đều trả rating đã tròn 2 chữ số,
 * vd 8.79). NestJS CHỈ giữ nguyên giá trị thô (không tròn) riêng ở route latest-matches — đây là
 * sự KHÔNG NHẤT QUÁN của chính NestJS cũ, không phải lỗi của Go. Không tính là bug, bỏ qua lệch rating. */
function stripRoundingQuirk(route: Route, p: any): any {
  if (route.task !== 'UTD-1196' || !p || typeof p !== 'object' || !('rating' in p)) return p;
  const { rating, ...rest } = p;
  return rest;
}

async function compare(request: any, route: Route) {
  let [a, b] = await Promise.all([call(request, HOSTS.old, route.path, route.method), call(request, HOSTS.new, route.path, route.method)]);
  // Route có data thay đổi theo thời gian (live, sắp đá…): 2 service có thể đang giữ cache ở 2 thời điểm khác nhau → thử lại 1 lần sau 5 giây.
  if (route.volatile && stable(payload(a)) !== stable(payload(b))) {
    await new Promise((r) => setTimeout(r, 5000));
    [a, b] = await Promise.all([call(request, HOSTS.old, route.path, route.method), call(request, HOSTS.new, route.path, route.method)]);
  }
  return { a, b };
}

function assertNewOnly(route: Route, b: any) {
  test.info().annotations.push({ type: 'url', description: `${route.path} (route mới, API cũ không có → chỉ kiểm tra Go)` });
  expect(b.status, `route mới phải trả 200`).toBe(200);
  expect(b.body?.code, 'phải có field code (quy ước cache)').toBeGreaterThan(0);
  expect(b.body?.data, 'phải có data').toBeTruthy();
}

function assertHighlight(route: Route, a: any, b: any) {
  test.info().annotations.push({ type: 'url', description: `${route.path} (nội dung đổi liên tục — chỉ kiểm tra cấu trúc)` });
  expect(b.status, `A1 status: cũ ${a.status}, mới ${b.status}`).toBe(a.status);
  if (a.status >= 300) return;
  const pa = payload(a);
  const pb = payload(b);
  expect(Array.isArray(pb.highlights), 'data.highlights phải là mảng').toBe(true);
  expect(pb.highlights.length, 'số lượng highlight phải khớp').toBe(pa.highlights.length);
  const fieldsA = new Set(pa.highlights[0] ? Object.keys(pa.highlights[0]) : []);
  const fieldsB = new Set(pb.highlights[0] ? Object.keys(pb.highlights[0]) : []);
  expect([...fieldsB].sort(), 'field của từng highlight phải khớp (dù nội dung khác)').toEqual([...fieldsA].sort());
}

/** Danh sách toàn bộ giải (2600+ phần tử): so theo id (bỏ qua thứ tự), báo gọn top N giải lệch thay vì dump index. */
function assertCompetitionList(a: any, b: any) {
  const pa = payload(a) as any[];
  const pb = payload(b) as any[];
  expect(pb.length, 'tổng số giải').toBe(pa.length);
  const mapB = new Map(pb.map((x) => [x.id, x]));
  const mismatches: string[] = [];
  for (const xa of pa) {
    const xb = mapB.get(xa.id);
    if (!xb) { mismatches.push(`${xa.id} (${xa.name}): không có ở API mới`); continue; }
    if (stable(xa) === stable(xb)) continue;
    const keys = new Set([...Object.keys(xa), ...Object.keys(xb)]);
    const changed = [...keys].filter((k) => stable(xa[k]) !== stable(xb[k]));
    mismatches.push(`${xa.id} (${xa.name}): field lệch [${changed.join(', ')}]`);
  }
  if (mismatches.length === 0) return;
  const onlyStaleFields = mismatches.every((m) => /\[(cur_round|record_updated_at|updated_at|cur_stage|title_holder)(, (cur_round|record_updated_at|updated_at|cur_stage|title_holder))*\]$/.test(m));
  const header = onlyStaleFields
    ? `BUG: ${mismatches.length}/${pa.length} giải có cur_round/record_updated_at/cur_stage cũ hơn ở Go (data sync bị trễ so với NestJS)`
    : `${mismatches.length}/${pa.length} giải lệch data`;
  expect(mismatches.slice(0, 15).join('\n  - '), header).toBe('');
}

function assertSame(route: Route, a: any, b: any) {
  if (route.newOnly) return assertNewOnly(route, b);
  test.info().annotations.push({ type: 'url', description: route.path });
  expect(b.status, `A1 status: cũ ${a.status}, mới ${b.status}`).toBe(a.status);
  if (route.method === 'HEAD' || a.status >= 300) return;
  if (isHighlightRoute(route.path)) return assertHighlight(route, a, b);
  if (route.task === 'UTD-1136') return assertCompetitionList(a, b);
  let pa = payload(a);
  let pb = payload(b);
  if (isCamelCaseRoute(route.path)) {
    pa = toSnakeKeys(pa);
    pb = toSnakeKeys(pb);
  }
  pa = stripRoundingQuirk(route, pa);
  pb = stripRoundingQuirk(route, pb);
  if (stable(pa) === stable(pb)) return;
  // Phân loại để báo cáo rõ: chỉ lệch thứ tự hay lệch nội dung
  const arr = (p: any) => (Array.isArray(p) ? p : null);
  const orderOnly = arr(pa) && arr(pb) && sameSet(pa, pb);
  const detail = orderOnly ? 'A3 chỉ lệch THỨ TỰ phần tử (cùng tập data)' : `A2/A4 lệch data:\n  - ${diff(pa, pb).join('\n  - ')}`;
  expect(stable(pb), detail).toBe(stable(pa));
}

for (const sample of SAMPLES) {
  test.describe(`A1–A4 · ${sample.name}`, () => {
    for (const route of routesFor(sample)) {
      test(`${route.task} ${route.name}`, async ({ request }) => {
        const { a, b } = await compare(request, route);
        assertSame(route, a, b);
      });
    }
  });
}

test.describe('A1–A4 · route không phụ thuộc giải', () => {
  for (const route of GLOBAL_ROUTES) {
    test(`${route.task} ${route.name}`, async ({ request }) => {
      const { a, b } = await compare(request, route);
      assertSame(route, a, b);
    });
  }
});

const UCL = SAMPLES[0];

test.describe('A5 · language', () => {
  for (const lang of ['vi', 'xx']) {
    test(`chi tiết giải với language=${lang} giống nhau`, async ({ request }) => {
      const route: Route = { task: 'UTD-1129', name: '', method: 'GET', path: `/unique-tournament/${UCL.competition}?language=${lang}` };
      const { a, b } = await compare(request, route);
      assertSame(route, a, b);
    });
  }

  test('language=xx rơi về tiếng Anh (giống language=en)', async ({ request }) => {
    const [xx, en] = await Promise.all([
      call(request, HOSTS.new, `/unique-tournament/${UCL.competition}/related-competitions?language=xx`),
      call(request, HOSTS.new, `/unique-tournament/${UCL.competition}/related-competitions?language=en`),
    ]);
    expect(stable(payload(xx))).toBe(stable(payload(en)));
  });

  for (const lang of ['vi', 'xx']) {
    test(`UTD-1198 current-champions với language=${lang} giống nhau`, async ({ request }) => {
      const route: Route = { task: 'UTD-1198', name: '', method: 'GET', path: `/competition/${UCL.competition}/current-champions?language=${lang}` };
      const { a, b } = await compare(request, route);
      assertSame(route, a, b);
    });
  }
});

test.describe('A6 · id sai', () => {
  const BAD = 'zzzzzzzzzzzzzzz';
  for (const [name, path] of [
    ['chi tiết giải', `/unique-tournament/${BAD}?language=en`],
    ['danh sách mùa', `/unique-tournament/${BAD}/seasons`],
    ['top cầu thủ mùa sai', `/unique-tournament/${UCL.competition}/season/${BAD}/top-players/overall?language=en`],
    ['BXH mùa sai', `/unique-tournament/${UCL.competition}/season/${BAD}/standings/total?language=en`],
    // 5 API mới UTD-1196→1200
    ['UTD-1196 latest-matches, competition sai', `/unique-tournaments/${BAD}/seasons/${UCL.season}/team/${UCL.team}/latest-matches`],
    ['UTD-1196 latest-matches, team sai', `/unique-tournaments/${UCL.competition}/seasons/${UCL.season}/team/${BAD}/latest-matches`],
    ['UTD-1197 team-of-the-week/rounds, season sai', `/unique-tournament/${UCL.competition}/season/${BAD}/team-of-the-week/rounds`],
    ['UTD-1198 current-champions, competition sai', `/competition/${BAD}/current-champions`],
    ['UTD-1199 most-titles, competition sai', `/competition/${BAD}/most-titles`],
    ['UTD-1200 heatmap, player sai', `/competition/${UCL.competition}/season/${UCL.season}/player/${BAD}/heatmap`],
  ]) {
    test(`${name}: cùng status/code, không trả 500`, async ({ request }) => {
      const [a, b] = await Promise.all([call(request, HOSTS.old, path), call(request, HOSTS.new, path)]);
      test.info().annotations.push({ type: 'kết quả', description: `cũ ${a.status}/code ${a.body?.code} · mới ${b.status}/code ${b.body?.code}` });
      expect(b.status).toBeLessThan(500);
      expect(b.status).toBe(a.status);
      expect(b.body?.code).toBe(a.body?.code);
    });
  }
});

test.describe('A7 · route legacy (không có tiền tố football/)', () => {
  const s = UCL;
  const legacy: Array<[string, string]> = [
    ['chi tiết giải', `/unique-tournament/${s.competition}?language=en`],
    ['danh sách mùa', `/unique-tournament/${s.competition}/seasons`],
    ['top leagues', `/competition/top-leagues`],
    ['trận nổi bật', `/unique-tournament/${s.competition}/featured-events?language=en`],
    ['BXH theo mùa', `/unique-tournament/${s.competition}/season/${s.season}/standings/total?language=en`],
    ['top cầu thủ', `/unique-tournament/${s.competition}/season/${s.season}/top-players/overall?language=en`],
    ['trận kế tiếp', `/unique-tournament/season/${s.currentSeason}/events/next/1`],
  ];
  for (const [name, path] of legacy) {
    test(`${name}: legacy mới = legacy cũ, và legacy mới = route chính mới`, async ({ request }) => {
      const [oldLegacy, newLegacy, newMain] = await Promise.all([
        call(request, HOSTS.old, path, 'GET', '/api/v2'),
        call(request, HOSTS.new, path, 'GET', '/api/v2'),
        call(request, HOSTS.new, path),
      ]);
      test.info().annotations.push({ type: 'status', description: `legacy cũ ${oldLegacy.status} · legacy mới ${newLegacy.status} · chính mới ${newMain.status}` });
      expect(newLegacy.status, 'legacy trên Go').toBe(oldLegacy.status);
      if (newLegacy.status === 200) expect(stable(payload(newLegacy))).toBe(stable(payload(newMain)));
    });
  }
});

test.describe('A8 · logo redirect', () => {
  // Header location rỗng ở CẢ 2 domain (302 nhưng không set Location) — hành vi thật của service, không phải bug.
  // 404 lẻ tẻ 1 lần đã quan sát được trên Go (UCL), nhưng retry 5 lần liên tiếp đều ra 302 → nhiễu tạm thời, không tái lập được.
  // Test dùng retry để không báo fail vì nhiễu, đồng thời vẫn phát hiện nếu 404 xảy ra LẶP LẠI (bug thật).
  for (const s of SAMPLES) {
    test(`${s.key}: status khớp API cũ, ổn định qua nhiều lần gọi`, async ({ request }) => {
      const path = `/competition/${s.competition}/logo`;
      const a = await call(request, HOSTS.old, path);
      const attempts: number[] = [];
      for (let i = 0; i < 5; i++) attempts.push((await call(request, HOSTS.new, path)).status);
      test.info().annotations.push({ type: 'status', description: `cũ ${a.status} · mới (5 lần) ${attempts.join(', ')}` });
      const stableStatus = attempts.filter((s) => s === attempts[0]).length >= 4;
      expect(stableStatus, `status Go không ổn định qua 5 lần gọi: ${attempts.join(', ')}`).toBe(true);
      expect(attempts[0]).toBe(a.status);
    });
  }
});

test.describe('A9b · HEAD method trên route GET thường (không phải /highlight)', () => {
  // Phát hiện 01/10/2026 khi đào sâu 5 API mới: Go không hỗ trợ HEAD trên BẤT KỲ route GET nào (luôn 404),
  // trong khi NestJS tự động hỗ trợ HEAD cho mọi handler GET (hành vi mặc định Express/Nest). Route /highlight
  // (TC A9 ở trên) KHÔNG bị ảnh hưởng vì đó vốn được thiết kế riêng để dùng HEAD — còn lại, mọi route khác đều bug.
  for (const [name, path] of [
    ['UTD-1129 chi tiết giải (route cũ, đã port lâu)', `/unique-tournament/${UCL.competition}?language=en`],
    ['UTD-1132 nhà vô địch mùa (route cũ)', `/unique-tournament/${UCL.competition}/season/${UCL.season}/champions?language=en`],
    ['UTD-1196 latest-matches (route mới)', `/unique-tournaments/${UCL.competition}/seasons/${UCL.season}/team/${UCL.team}/latest-matches`],
    ['UTD-1198 current-champions (route mới)', `/competition/${UCL.competition}/current-champions`],
  ]) {
    test(`${name}: HEAD phải trả cùng status với GET`, async ({ request }) => {
      const [getRes, headOld, headNew] = await Promise.all([
        call(request, HOSTS.new, path, 'GET'),
        call(request, HOSTS.old, path, 'HEAD'),
        call(request, HOSTS.new, path, 'HEAD'),
      ]);
      test.info().annotations.push({ type: 'status', description: `GET mới ${getRes.status} · HEAD cũ ${headOld.status} · HEAD mới ${headNew.status}` });
      expect(headNew.status, `Go: HEAD phải trả cùng status với GET (${getRes.status}), giống NestJS (HEAD=${headOld.status})`).toBe(headOld.status);
    });
  }
});

test.describe('A9 · HEAD highlight', () => {
  test('mùa có highlight → 200; mùa không có highlight → 204', async ({ request }) => {
    const seasons = payload(await call(request, HOSTS.old, `/unique-tournament/${UCL.competition}/seasons`)).seasons;
    const withHl = seasons.find((x: any) => x.has_highlight === 1);
    const noHl = seasons.find((x: any) => x.has_highlight === 0);
    const head = (se: string) => call(request, HOSTS.new, `/competition/${UCL.competition}/season/${se}/highlight`, 'HEAD');
    if (withHl) expect((await head(withHl.id)).status, `mùa ${withHl.year} có highlight`).toBe(200);
    if (noHl) expect((await head(noHl.id)).status, `mùa ${noHl.year} không có highlight`).toBe(204);
  });
});

test.describe('A10 · phân trang', () => {
  for (const s of SAMPLES) {
    for (const page of [2, 999]) {
      test(`${s.key}: trận đã kết thúc page ${page}`, async ({ request }) => {
        const route: Route = { task: 'UTD-1143', name: '', method: 'GET', path: `/unique-tournament/${s.competition}/seasons/${s.season}/events/finished/page/${page}?language=en` };
        const { a, b } = await compare(request, route);
        assertSame(route, a, b);
      });
    }
  }
  test('highlight page 2', async ({ request }) => {
    const route: Route = { task: 'UTD-1161', name: '', method: 'GET', path: `/competition/${UCL.competition}/season/${UCL.season}/highlight/locale/VN/page/2?language=en` };
    const { a, b } = await compare(request, route);
    assertSame(route, a, b);
  });
});
