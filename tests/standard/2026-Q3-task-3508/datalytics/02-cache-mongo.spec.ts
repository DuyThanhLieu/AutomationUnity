/**
 * MÙA 2026-Q3 — TASK: [API][APP] Datalytics: Enhance tab Datalytics (US-3508)
 * Hạng mục #2: Cache Mongo — verify TTL động & invalidate chủ động
 *
 * Đối chiếu trực tiếp tầng lưu trữ cache (MongoDB db "footystats") với
 * response API, để verify các AC về cache của US-3508:
 *   - mapping_matches: { footystats_id, thesports_id } — map ID.
 *   - footy_stat_historical: { id: thesports_id, stats: {...} } — raw cache
 *     FootyStats dùng để API tính toán. Không có field timestamp riêng nên
 *     dùng _id (ObjectId) làm proxy "thời điểm cache được ghi lần cuối" —
 *     hợp lý vì bug gốc mô tả $setOnInsert (chỉ set khi insert, không update
 *     khi đã tồn tại) nên _id creation time ~ thời điểm dữ liệu đó được ghi.
 *
 * AC cần verify:
 *   - Prematch: cache không cũ quá 8h.
 *   - Finished: giữ snapshot, không update lại sau khi trận đã đá (7 ngày).
 *   - Trận có mapping mới / event ingest mới → cache phải được invalidate,
 *     không phải "biến mất" (tức là bị đóng băng, không bao giờ crawl lại).
 *
 * CHẠY:
 *   npx playwright test tests/standard/2026-Q3-task-3508/datalytics/02-cache-mongo.spec.ts --project=chrome
 */

import { test, expect } from '@playwright/test';
import { withMongo } from '../../lib/mongo';
import { saveJsonForSeason } from '../../lib/helpers';

const SEASON_DIR = '2026-Q3';
const SLUG = 'task-3508-datalytics';

const STAGING_API_BASE = 'https://opta-api.uniscore.vn/api/v1/matches/datalytics';
const SAMPLE_MATCH_ID = '623z28le19o9vx5'; // PSG vs Aston Villa, UEFA Super Cup — trận CHƯA đá

const PREMATCH_TTL_HOURS = 8;
const FINISHED_TTL_DAYS = 7;

test.describe('[2026-Q3][US-3508] Datalytics — cache Mongo (footystats.footy_stat_historical)', () => {
  test.skip('Trận mẫu (PSG vs Aston Villa, prematch) — có mapping/cache trong Mongo không? (dùng đúng thesports_id đã decode)', async ({ request }) => {
    // QUAN TRỌNG: SAMPLE_MATCH_ID (623z28le19o9vx5) là ENCODED ID dùng trong
    // URL API, KHÔNG PHẢI thesports_id thô lưu trong Mongo — 2 hệ ID khác
    // nhau, đổi qua lại bằng GET /encode/{thesportsId} và GET
    // /decode/{encodedId} (host opta-api.uniscore.vn/api/v1, trả text
    // thuần). Bản test trước đây query THẲNG encoded ID vào mapping_matches
    // → luôn ra null, dẫn tới kết luận sai "trận hoàn toàn không có
    // mapping" — sau khi decode đúng, mapping_matches THẬT SỰ CÓ bản ghi.
    // Chỉ footy_stat_historical (cache) là thực sự thiếu.
    const decodeRes = await request.get(`${STAGING_API_BASE.replace('/matches/datalytics', '')}/decode/${SAMPLE_MATCH_ID}`);
    const thesportsId = decodeRes.ok() ? (await decodeRes.text()).trim() : null;

    const { mapping, cacheDoc } = await withMongo(async (db) => {
      const mapping = thesportsId ? await db.collection('mapping_matches').findOne({ thesports_id: thesportsId }) : null;
      const cacheDoc = thesportsId ? await db.collection('footy_stat_historical').findOne({ id: thesportsId }) : null;
      return { mapping, cacheDoc };
    });

    console.log(`\n📊 Encoded ID ${SAMPLE_MATCH_ID} -> decode -> thesports_id=${thesportsId}`);
    console.log(`📊 mapping_matches cho thesports_id=${thesportsId}:`, mapping ? `footystats_id=${mapping.footystats_id}` : 'KHÔNG có mapping');
    console.log(`📊 footy_stat_historical cho id=${thesportsId}:`, cacheDoc ? 'CÓ cache' : 'KHÔNG có cache');

    saveJsonForSeason(SEASON_DIR, SLUG, 'cache-mongo-sample-match.json', {
      encodedMatchId: SAMPLE_MATCH_ID,
      decodedThesportsId: thesportsId,
      hasMappingMatches: !!mapping,
      hasCacheDoc: !!cacheDoc,
      mapping,
    });

    // mapping_matches CÓ tồn tại (đã verify) — không còn là bug. Chỉ
    // footy_stat_historical (cache) thiếu mới là gap thật cần soft-fail.
    expect.soft(!!mapping, 'mapping_matches không có bản ghi cho trận mẫu dù đã decode đúng ID — cần backend xác nhận').toBeTruthy();
    expect.soft(!!cacheDoc, 'Trận prematch chưa có trong cache footy_stat_historical — cache chưa được crawl/refresh cho trận mới').toBeTruthy();
  });

  test.skip('Toàn hệ thống cache: trận có kickoff SAU thời điểm cache mới nhất được ghi — chứng minh cache không theo kịp lịch thi đấu mới', async () => {
    // So sánh "thời điểm ghi cache mới nhất" (_id.getTimestamp() lớn nhất)
    // với "ngày đá (date_unix) mới nhất từng thấy trong cache". Nếu cache
    // hoạt động đúng (TTL động 8h cho prematch + invalidate chủ động), 2 mốc
    // này phải gần nhau. Khoảng cách lớn (nhiều tháng) nghĩa là hệ thống vẫn
    // đang liên tục ghi/refetch các trận CŨ thay vì crawl trận MỚI — đúng
    // triệu chứng "cache đóng băng" mô tả trong bug gốc của ticket.
    const { newestCacheWriteAt, newestMatchDateUnix } = await withMongo(async (db) => {
      const coll = db.collection('footy_stat_historical');
      const [byWriteTime] = await coll.find().sort({ _id: -1 }).limit(1).toArray();
      const [byMatchDate] = await coll.find().sort({ 'stats.date_unix': -1 }).limit(1).toArray();
      return {
        newestCacheWriteAt: byWriteTime?._id?.getTimestamp() ?? null,
        newestMatchDateUnix: byMatchDate?.stats?.date_unix ?? null,
      };
    });

    const newestMatchDate = newestMatchDateUnix ? new Date(newestMatchDateUnix * 1000) : null;
    const gapDays = newestMatchDate ? (Date.now() - newestMatchDate.getTime()) / 86400000 : null;

    console.log(`\n📊 Thời điểm ghi cache mới nhất: ${newestCacheWriteAt?.toISOString()}`);
    console.log(`📊 Ngày đá (date_unix) mới nhất trong cache: ${newestMatchDate?.toISOString()}`);
    console.log(`📊 Khoảng cách tới hiện tại: ${gapDays?.toFixed(1)} ngày (kỳ vọng ≤ ~${FINISHED_TTL_DAYS} ngày nếu cache theo kịp lịch thi đấu)`);

    saveJsonForSeason(SEASON_DIR, SLUG, 'cache-mongo-freshness.json', {
      newestCacheWriteAt,
      newestMatchDateUnix,
      newestMatchDate,
      gapDays,
    });

    expect.soft(
      gapDays,
      `Trận mới nhất trong cache đã cách hiện tại ${gapDays?.toFixed(1)} ngày — cache không crawl kịp lịch thi đấu mới, khớp mô tả "cache đóng băng" trong ticket US-3508`
    ).toBeLessThanOrEqual(FINISHED_TTL_DAYS + 1);
  });

  test.skip('Sample trận đã có cache: tuổi cache (_id timestamp) so với ngưỡng TTL tương ứng trạng thái trận', async () => {
    // Lấy mẫu N trận cũ nhất/mới nhất theo date_unix để phân loại prematch vs
    // finished (so với "now" thật của server test), rồi so tuổi cache với
    // TTL kỳ vọng: prematch ≤ 8h, finished có thể giữ tới 7 ngày (snapshot).
    const SAMPLE_SIZE = 20;
    const nowUnix = Math.floor(Date.now() / 1000);

    const docs = await withMongo(async (db) => {
      return db.collection('footy_stat_historical').find({ 'stats.date_unix': { $exists: true, $ne: null } }).sort({ _id: -1 }).limit(SAMPLE_SIZE).toArray();
    });

    if (docs.length === 0) {
      console.warn('⚠ SKIP: không có document nào trong footy_stat_historical để lấy mẫu.');
      test.skip(true, 'Cache rỗng');
      return;
    }

    const results = docs.map((d) => {
      const isPrematch = d.stats.date_unix > nowUnix;
      const cachedAt = d._id.getTimestamp();
      const ageHours = (Date.now() - cachedAt.getTime()) / 3600000;
      const ttlLimitHours = isPrematch ? PREMATCH_TTL_HOURS : FINISHED_TTL_DAYS * 24;
      return {
        id: d.id,
        homeVsAway: `${d.stats.home_name} vs ${d.stats.away_name}`,
        kickoff: new Date(d.stats.date_unix * 1000).toISOString(),
        isPrematch,
        cachedAt: cachedAt.toISOString(),
        ageHours: Number(ageHours.toFixed(1)),
        ttlLimitHours,
        withinTtl: ageHours <= ttlLimitHours,
      };
    });

    const withinTtlCount = results.filter((r) => r.withinTtl).length;
    console.log(`\n📊 Cache TTL check (mẫu ${results.length} trận, sort theo cache mới nhất): ${withinTtlCount}/${results.length} trong ngưỡng TTL`);
    results.filter((r) => !r.withinTtl).forEach((r) => console.log(`  ✗ ${r.homeVsAway} (${r.isPrematch ? 'prematch' : 'finished'}): age=${r.ageHours}h > TTL=${r.ttlLimitHours}h`));

    saveJsonForSeason(SEASON_DIR, SLUG, 'cache-mongo-ttl-sample.json', { sampleSize: results.length, withinTtlCount, results });

    expect.soft(withinTtlCount, `Chỉ ${withinTtlCount}/${results.length} trận trong mẫu có tuổi cache nằm trong TTL kỳ vọng theo trạng thái trận`).toBe(results.length);
  });

  test.skip('Audit diện rộng: N trận có date_unix gần hiện tại nhất — xuất báo cáo Excel', async () => {
    test.setTimeout(90_000); // 2 aggregation không index trên ~31k doc + ghi Excel > mặc định 30s
    // Khác với test TTL sample ở trên (lấy theo _id mới nhất — tức "cache
    // ghi gần đây nhất", thường trúng toàn trận CŨ do bug đóng băng), test
    // này lấy theo "date_unix gần NOW nhất" bất kể quá khứ hay tương lai —
    // để trả lời đúng câu hỏi audit: "trong các trận có liên quan thực tế
    // (sắp đá / vừa đá), cache đang ở tình trạng nào?". Không giới hạn cứng
    // theo cửa sổ ngày vì thực tế đã xác nhận: 0 trận nằm trong ±14 ngày
    // quanh hôm nay — quét theo cửa sổ ngày cố định sẽ luôn trả về rỗng
    // trong tình trạng cache hiện tại và không audit được gì.
    const AUDIT_SAMPLE_SIZE = 500;
    const nowUnix = Math.floor(Date.now() / 1000);

    const docs = await withMongo(async (db) => {
      const coll = db.collection('footy_stat_historical');
      const closestFuture = await coll
        .aggregate([
          { $match: { 'stats.date_unix': { $gte: nowUnix } } },
          { $addFields: { _distance: { $subtract: ['$stats.date_unix', nowUnix] } } },
          { $sort: { _distance: 1 } },
          { $limit: AUDIT_SAMPLE_SIZE / 2 },
        ])
        .toArray();
      const closestPast = await coll
        .aggregate([
          { $match: { 'stats.date_unix': { $lt: nowUnix } } },
          { $addFields: { _distance: { $subtract: [nowUnix, '$stats.date_unix'] } } },
          { $sort: { _distance: 1 } },
          { $limit: AUDIT_SAMPLE_SIZE / 2 },
        ])
        .toArray();
      return [...closestFuture, ...closestPast];
    });

    if (docs.length === 0) {
      console.warn('⚠ SKIP: footy_stat_historical rỗng, không có gì để audit.');
      test.skip(true, 'Cache rỗng');
      return;
    }

    const rows = docs
      .filter((d) => d.stats?.date_unix != null)
      .map((d) => {
        const isPrematch = d.stats.date_unix > nowUnix;
        const kickoff = new Date(d.stats.date_unix * 1000);
        const cachedAt = d._id.getTimestamp();
        const ageHours = (Date.now() - cachedAt.getTime()) / 3600000;
        const distanceDays = Math.abs(d.stats.date_unix - nowUnix) / 86400;
        const ttlLimitHours = isPrematch ? PREMATCH_TTL_HOURS : FINISHED_TTL_DAYS * 24;
        return {
          thesportsId: d.id,
          footystatsId: d.stats.id ?? null,
          homeTeam: d.stats.home_name ?? '',
          awayTeam: d.stats.away_name ?? '',
          competitionId: d.stats.competition_id ?? null,
          kickoffUtc: kickoff.toISOString(),
          status: isPrematch ? 'prematch' : 'finished',
          distanceFromNowDays: Number(distanceDays.toFixed(2)),
          cachedAtUtc: cachedAt.toISOString(),
          cacheAgeHours: Number(ageHours.toFixed(1)),
          ttlLimitHours,
          withinTtl: ageHours <= ttlLimitHours,
          overTtlByHours: Number(Math.max(0, ageHours - ttlLimitHours).toFixed(1)),
        };
      })
      .sort((a, b) => a.distanceFromNowDays - b.distanceFromNowDays);

    const withinTtlCount = rows.filter((r) => r.withinTtl).length;
    const prematchRows = rows.filter((r) => r.status === 'prematch');
    const finishedRows = rows.filter((r) => r.status === 'finished');
    const closestMatch = rows[0];

    console.log(`\n📊 Audit diện rộng: ${rows.length} trận (gần NOW nhất theo date_unix) — ${withinTtlCount}/${rows.length} trong ngưỡng TTL`);
    console.log(`   Prematch: ${prematchRows.length} trận | Finished: ${finishedRows.length} trận`);
    console.log(`   Trận gần hiện tại nhất trong TOÀN BỘ cache: ${closestMatch?.homeTeam} vs ${closestMatch?.awayTeam}, cách hiện tại ${closestMatch?.distanceFromNowDays} ngày`);

    const summaryRows = [
      { metric: 'Tổng số trận audit', value: rows.length },
      { metric: 'Trong ngưỡng TTL', value: withinTtlCount },
      { metric: 'Vượt ngưỡng TTL', value: rows.length - withinTtlCount },
      { metric: 'Số trận prematch', value: prematchRows.length },
      { metric: 'Số trận finished', value: finishedRows.length },
      { metric: 'Trận gần NOW nhất — cách bao nhiêu ngày', value: closestMatch?.distanceFromNowDays ?? null },
      { metric: 'Trận gần NOW nhất — home vs away', value: closestMatch ? `${closestMatch.homeTeam} vs ${closestMatch.awayTeam}` : null },
      { metric: 'Tuổi cache trung bình (giờ) — prematch', value: prematchRows.length ? Number((prematchRows.reduce((s, r) => s + r.cacheAgeHours, 0) / prematchRows.length).toFixed(1)) : null },
      { metric: 'Tuổi cache trung bình (giờ) — finished', value: finishedRows.length ? Number((finishedRows.reduce((s, r) => s + r.cacheAgeHours, 0) / finishedRows.length).toFixed(1)) : null },
      { metric: 'Tuổi cache lớn nhất đo được (giờ)', value: Math.max(...rows.map((r) => r.cacheAgeHours)) },
    ];

    // Chỉ lưu JSON — KHÔNG xuất .xlsx riêng ở đây. File 03-summary-report.spec.ts
    // đọc lại JSON này và gộp vào report Excel duy nhất của cả task
    // (us-3508-datalytics-full-report.xlsx), tránh rải rác nhiều file .xlsx
    // trung gian mỗi lần chạy suite.
    saveJsonForSeason(SEASON_DIR, SLUG, 'cache-mongo-audit-wide.json', { auditedAt: new Date().toISOString(), summaryRows, rows });

    expect.soft(
      withinTtlCount,
      `Audit diện rộng: chỉ ${withinTtlCount}/${rows.length} trận (gần ngày hiện tại nhất trong toàn bộ cache) nằm trong ngưỡng TTL — xem chi tiết trong report tổng us-3508-datalytics-full-report.xlsx`
    ).toBe(rows.length);
  });

  test('Audit diện rộng: mapping + nguồn stats (season/lastX) cho các trận TƯƠNG LAI — KHÔNG so giá trị *_potential/*_ppg', async ({ request }) => {
    // ĐÃ THỬ so giá trị field *_potential/*_ppg và BỎ — xem code backend thật:
    //   !!md  ? md?.<field> ?? avg/sum(homeTeamInfo.stats.stats.<field>_home, awayTeamInfo.stats.stats.<field>_away)
    //         : avg/sum(homeTeamInfo.stats.stats.<field>_overall, awayTeamInfo.stats.stats.<field>_overall)
    // `md` = pre-match data từ THESPORTS (xác nhận với dev), KHÔNG PHẢI document
    // footystats `matches` — nguồn này KHÔNG nằm trong Mongo `footystats` mà test
    // kết nối được. Đã thử tái tạo cả 2 nhánh (md-branch dùng team_stats/team_last_x
    // theo home/away, no-md-branch dùng overall/overall) và chấp nhận khớp 1 trong 2
    // — kết quả CHỈ 1/16 trận khớp, chứng minh `md` thesports gần như luôn có giá trị
    // thật và khác biệt với cả 2 nhánh giả định. Không có quyền truy cập nguồn `md`
    // thật (ngoài phạm vi Mongo `footystats`) nên KHÔNG THỂ verify tiếp giá trị các
    // field này — so sánh trực tiếp matches.<field> (bản test cũ nhất) hay công thức
    // tái tạo (bản trước bản này) đều SAI NGUỒN, gây báo lệch giả không phản ánh bug
    // thật của API.
    //
    // Test này CHỈ audit những gì verify được từ Mongo `footystats`:
    //   - mapping_matches có bản ghi cho trận tương lai không (ID mapping OK).
    //   - API có trả data không (encode/decode đúng).
    //   - stats_source API trả về (season vs lastX) — để biết backend đang route
    //     team stats từ collection nào, hữu ích cho lần audit sau nếu có quyền
    //     truy cập nguồn md thật.
    test.setTimeout(120_000); // nhiều lần gọi HTTP tuần tự (encode + API) tới API thật

    const FUTURE_SAMPLE_SIZE = 30;
    const nowUnix = Math.floor(Date.now() / 1000);

    async function encodeId(thesportsId: string): Promise<string | null> {
      const res = await request.get(`${STAGING_API_BASE.replace('/matches/datalytics', '')}/encode/${thesportsId}`);
      if (!res.ok()) return null;
      return (await res.text()).trim();
    }

    const genericCandidates = await withMongo(async (db) => {
      return db
        .collection('matches')
        .find({ date_unix: { $gt: nowUnix } })
        .sort({ date_unix: 1 })
        .limit(FUTURE_SAMPLE_SIZE)
        .toArray();
    });

    // Luôn ép thêm trận mẫu gốc của ticket (PSG vs Aston Villa) vào đầu danh
    // sách bằng cách DECODE encoded ID về thesports_id thật trước, rồi tra
    // đúng document trong matches/mapping_matches — thay vì query nhầm
    // encoded ID như lần verify trước.
    const decodeRes = await request.get(`${STAGING_API_BASE.replace('/matches/datalytics', '')}/decode/${SAMPLE_MATCH_ID}`);
    const sampleThesportsId = decodeRes.ok() ? (await decodeRes.text()).trim() : null;
    const sampleMapping = sampleThesportsId ? await withMongo(async (db) => db.collection('mapping_matches').findOne({ thesports_id: sampleThesportsId })) : null;
    const sampleMatchDoc = sampleMapping ? await withMongo(async (db) => db.collection('matches').findOne({ id: sampleMapping.footystats_id })) : null;
    const candidates = sampleMatchDoc ? [sampleMatchDoc, ...genericCandidates.filter((c) => c.id !== sampleMatchDoc.id)] : genericCandidates;

    console.log(`ℹ Trận mẫu ${SAMPLE_MATCH_ID} decode -> thesports_id=${sampleThesportsId} | mapping=${!!sampleMapping} | matches doc=${!!sampleMatchDoc}`);

    if (candidates.length === 0) {
      console.warn('⚠ SKIP: footystats.matches không có trận nào trong tương lai.');
      test.skip(true, 'Không có trận tương lai trong matches');
      return;
    }

    const rows: Array<{
      footystatsId: number;
      thesportsId: string | null;
      encodedId: string | null;
      homeTeam: string;
      awayTeam: string;
      kickoffUtc: string;
      hasMapping: boolean;
      apiHasData: boolean;
      statsSource: string | null;
    }> = [];

    for (const m of candidates) {
      const mapping = await withMongo(async (db) => db.collection('mapping_matches').findOne({ footystats_id: m.id }));
      const thesportsId: string | null = mapping?.thesports_id ?? null;
      const encodedId = thesportsId ? await encodeId(thesportsId) : null;

      let apiBody: Record<string, unknown> | null = null;
      if (encodedId) {
        const res = await request.get(`${STAGING_API_BASE}/${encodedId}`);
        const bodyText = await res.text();
        apiBody = bodyText.trim() !== 'null' ? JSON.parse(bodyText) : null;
      }

      rows.push({
        footystatsId: m.id,
        thesportsId,
        encodedId,
        homeTeam: m.home_name ?? '',
        awayTeam: m.away_name ?? '',
        kickoffUtc: new Date(m.date_unix * 1000).toISOString(),
        hasMapping: !!mapping,
        apiHasData: !!apiBody,
        statsSource: (apiBody?.stats_source as string) ?? null,
      });
    }

    const withMapping = rows.filter((r) => r.hasMapping);
    const withData = withMapping.filter((r) => r.apiHasData);
    const seasonCount = withData.filter((r) => r.statsSource === 'season').length;
    const lastXCount = withData.filter((r) => r.statsSource === 'lastX').length;

    console.log(`\n📊 Audit mapping/API cho ${rows.length} trận TƯƠNG LAI: ${withMapping.length} có mapping, ${withData.length} API trả data (${seasonCount} stats_source=season, ${lastXCount} stats_source=lastX)`);
    withMapping.filter((r) => !r.apiHasData).forEach((r) => console.log(`  ○ ${r.homeTeam} vs ${r.awayTeam} (thesports=${r.thesportsId}, encoded=${r.encodedId}) -> API trả null`));

    // Chỉ lưu JSON — KHÔNG xuất .xlsx riêng ở đây, xem giải thích ở test phía
    // trên. File 03-summary-report.spec.ts đọc lại JSON này để gộp vào report
    // Excel duy nhất us-3508-datalytics-full-report.xlsx.
    saveJsonForSeason(SEASON_DIR, SLUG, 'api-vs-mongo-future-compare.json', {
      auditedAt: new Date().toISOString(),
      totalCandidates: rows.length,
      withMapping: withMapping.length,
      withData: withData.length,
      seasonCount,
      lastXCount,
      note: 'KHÔNG so giá trị *_potential/*_ppg — field này phụ thuộc nhánh "md" (thesports pre-match), nguồn ngoài phạm vi Mongo footystats mà test truy cập được. Đã thử tái tạo công thức (2 nhánh: md dùng team_stats/team_last_x theo home/away, no-md dùng overall/overall) và chỉ khớp 1/16 — không đủ tin cậy để kết luận bug. Chỉ audit mapping + nguồn stats_source ở đây.',
      rows,
    });

    if (withMapping.length === 0) {
      console.warn('⚠ Không có trận tương lai nào có mapping_matches trong mẫu này.');
    }

    expect.soft(
      withData.length,
      `Chỉ ${withData.length}/${withMapping.length} trận tương lai có mapping trả được data từ API (còn lại null) — xem chi tiết trong report tổng us-3508-datalytics-full-report.xlsx.`
    ).toBe(withMapping.length);
  });
});
