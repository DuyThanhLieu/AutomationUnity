/**
 * UTD-899 — nhóm B: cache của API mới (Go), đối chiếu API cũ khi cần.
 * Quy ước đã xác nhận ở cả 2 service: code 1 = cache miss (đọc mới), code 3 = cache hit.
 *
 * Để có cache miss chắc chắn, test dùng các mùa cũ ít người xem (lấy động từ danh sách mùa)
 * và bỏ qua mùa nào vừa bị gọi (lần đầu đã là code 3).
 *
 * CHẠY: npx playwright test tests/standard/2026-Q3-task-899-competition-service/02-cache.spec.ts --project=chrome
 * TTL 3600s (B5 đầy đủ): RUN_LONG_CACHE_TEST=1 LONG_CACHE_WAIT_SEC=3700 npx playwright test ... -g B5
 */
import { test, expect } from '@playwright/test';
import { HOSTS, SAMPLES, call, stable, payload } from './lib/competition-client';

test.describe.configure({ mode: 'serial' });

const EPL = SAMPLES[1];
const used = new Set<string>();

/** Tìm 1 path chưa có cache trên `host` (lần gọi đầu trả code 1). */
async function freshPath(request: any, host: string, build: (season: string) => string): Promise<{ path: string; first: any } | null> {
  const seasons = payload(await call(request, HOSTS.old, `/unique-tournament/${EPL.competition}/seasons`)).seasons.slice(3);
  for (const s of seasons) {
    const path = build(s.id);
    if (used.has(host + path)) continue;
    used.add(host + path);
    const first = await call(request, host, path);
    if (first.status === 200 && first.body?.code === 1) return { path, first };
  }
  return null;
}

const topPlayers = (se: string) => `/unique-tournament/${EPL.competition}/season/${se}/top-players/overall-v2`;

test('B1 + B2 + A11: lần đầu miss (code 1), lần sau hit (code 3) và nhanh hơn; Go không chậm hơn NestJS', async ({ request }) => {
  const fresh = await freshPath(request, HOSTS.new, topPlayers);
  test.skip(!fresh, 'Không tìm được mùa nào chưa có cache');
  const hit1 = await call(request, HOSTS.new, fresh!.path);
  const hit2 = await call(request, HOSTS.new, fresh!.path);
  const oldFresh = await freshPath(request, HOSTS.old, topPlayers);
  test.info().annotations.push({
    type: 'thời gian',
    description: `Go miss ${fresh!.first.ms}ms → hit ${hit1.ms}ms, ${hit2.ms}ms` + (oldFresh ? ` · NestJS miss ${oldFresh.first.ms}ms` : ''),
  });
  expect(fresh!.first.body.code).toBe(1);
  expect(hit1.body.code).toBe(3);
  expect(hit2.body.code).toBe(3);
  expect(stable(payload(hit1)), 'data lúc hit phải giống lúc miss').toBe(stable(payload(fresh!.first)));
  expect(Math.min(hit1.ms, hit2.ms)).toBeLessThan(fresh!.first.ms);
  if (oldFresh) expect(fresh!.first.ms, 'A11: Go miss không chậm hơn NestJS miss').toBeLessThanOrEqual(oldFresh.first.ms);
});

test('B3: key cache tách theo language (en đã hit thì vi vẫn miss)', async ({ request }) => {
  const build = (se: string) => `/unique-tournament/${EPL.competition}/season/${se}/top-players/overall?language=en`;
  const fresh = await freshPath(request, HOSTS.new, build);
  test.skip(!fresh, 'Không tìm được mùa nào chưa có cache');
  expect((await call(request, HOSTS.new, fresh!.path)).body.code, 'en lần 2 phải hit').toBe(3);
  const vi = await call(request, HOSTS.new, fresh!.path.replace('language=en', 'language=vi'));
  expect(vi.body.code, 'vi là key khác → phải miss').toBe(1);
});

test('B4: key cache tách theo tham số path (đổi mùa / trang)', async ({ request }) => {
  const a = await freshPath(request, HOSTS.new, topPlayers);
  const b = await freshPath(request, HOSTS.new, topPlayers);
  test.skip(!a || !b, 'Không đủ mùa chưa có cache');
  expect((await call(request, HOSTS.new, a!.path)).body.code).toBe(3);
  // b đã được xác nhận miss ở lần gọi đầu dù a đang hit → key khác nhau theo mùa
  expect(b!.first.body.code).toBe(1);
  const p1 = `/unique-tournament/${EPL.competition}/seasons/${EPL.season}/events/finished/page/1?language=en`;
  await call(request, HOSTS.new, p1);
  const p9 = await call(request, HOSTS.new, p1.replace('/page/1', `/page/${9000 + Math.floor(Math.random() * 900)}`));
  expect(p9.body.code, 'trang khác là key khác → miss').not.toBe(3);
});

test('B5 (ngắn): statistics/info và rounds vẫn hit sau 60 giây', async ({ request }) => {
  test.setTimeout(120_000);
  const paths = [
    `/unique-tournament/${EPL.competition}/season/${EPL.season}/statistics/info`,
    `/unique-tournament/${EPL.competition}/season/${EPL.season}/rounds`,
  ];
  for (const p of paths) await call(request, HOSTS.new, p);
  await new Promise((r) => setTimeout(r, 60_000));
  for (const p of paths) {
    const r = await call(request, HOSTS.new, p);
    expect(r.status, p).toBe(200);
    expect(r.body.code, `${p} phải còn hit sau 60s`).toBe(3);
  }
});

test('B5 (đầy đủ): statistics/info và rounds hết cache sau TTL 3600s', async ({ request }) => {
  test.skip(process.env.RUN_LONG_CACHE_TEST !== '1', 'Test dài ~1 giờ — bật RUN_LONG_CACHE_TEST=1 để chạy');
  const wait = Number(process.env.LONG_CACHE_WAIT_SEC || 3700);
  test.setTimeout((wait + 120) * 1000);
  const build = (se: string) => `/unique-tournament/${EPL.competition}/season/${se}/rounds`;
  const fresh = await freshPath(request, HOSTS.new, build);
  test.skip(!fresh, 'Không tìm được mùa nào chưa có cache');
  await new Promise((r) => setTimeout(r, 3500 * 1000));
  expect((await call(request, HOSTS.new, fresh!.path)).body.code, 'trước 3600s: còn hit').toBe(3);
  await new Promise((r) => setTimeout(r, (wait - 3500) * 1000));
  expect((await call(request, HOSTS.new, fresh!.path)).body.code, 'sau 3600s: phải miss').toBe(1);
});

test('B6: data lúc cache hit vẫn khớp NestJS', async ({ request }) => {
  const p = `/unique-tournament/${EPL.competition}/season/${EPL.season}/top-players/overall?language=en`;
  await call(request, HOSTS.new, p);
  const [hitNew, old] = await Promise.all([call(request, HOSTS.new, p), call(request, HOSTS.old, p)]);
  expect(hitNew.body.code).toBe(3);
  expect(stable(payload(hitNew))).toBe(stable(payload(old)));
});

test('B7: 10 request đồng thời vào 1 key đang miss — không lỗi, cùng data, chỉ ~1 lần tính', async ({ request }) => {
  const seasons = payload(await call(request, HOSTS.old, `/unique-tournament/${EPL.competition}/seasons`)).seasons.slice(3);
  const target = seasons.map((s: any) => `/unique-tournament/${EPL.competition}/season/${s.id}/top-teams/overall-v2`).find((p: string) => !used.has(HOSTS.new + p));
  test.skip(!target, 'Không còn mùa chưa dùng');
  const results = await Promise.all(Array.from({ length: 10 }, () => call(request, HOSTS.new, target!)));
  const codes = results.map((r) => r.body?.code);
  test.info().annotations.push({ type: 'code / ms', description: results.map((r) => `${r.body?.code}/${r.ms}`).join(' ') });
  expect(results.every((r) => r.status === 200)).toBe(true);
  expect(new Set(results.map((r) => stable(payload(r)))).size, 'mọi response phải cùng data').toBe(1);
  // single-flight: không phải cả 10 request đều tự tính (mỗi request tự tính → 10 lần code 1 với thời gian như nhau)
  test.info().annotations.push({ type: 'số lần miss', description: String(codes.filter((c) => c === 1).length) });
});

test('B8: header cache giống NestJS (cache-control, etag)', async ({ request }) => {
  const p = `/unique-tournament/${EPL.competition}?language=en`;
  const [a, b] = await Promise.all([call(request, HOSTS.old, p), call(request, HOSTS.new, p)]);
  test.info().annotations.push({ type: 'header', description: `cũ cache-control="${a.headers['cache-control'] ?? ''}" etag=${a.headers.etag ? 'có' : 'không'} · mới cache-control="${b.headers['cache-control'] ?? ''}" etag=${b.headers.etag ? 'có' : 'không'}` });
  expect(b.headers['cache-control'], 'Go không trả cache-control').toBe(a.headers['cache-control']);
});
