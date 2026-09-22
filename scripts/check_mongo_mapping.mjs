/**
 * Check mapping: Excel (pgVsMongo=match) → MongoDB mapping_matches → PROD API has_advanced_stats
 *
 * Luồng:
 *   1. Đọc Excel, lấy các trận pgVsMongo="match" (cả hai bên đã mapping cùng FootyStats ID)
 *   2. Check MongoDB mapping_matches → footystats_id có tồn tại không?
 *   3. Gọi PROD API → has_advanced_stats=true không? (tab phân tích có hiển thị không)
 *   4. Tổng kết
 */

import { MongoClient } from 'mongodb';
import XLSX from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MONGO_HOST     = process.env.MONGO_MAPPING_HOST || '';
const MONGO_USER     = process.env.MONGO_MAPPING_USER || 'readonly';
const MONGO_PASSWORD = process.env.MONGO_MAPPING_PASSWORD || '';
const MONGO_URI      = `mongodb://${encodeURIComponent(MONGO_USER)}:${encodeURIComponent(MONGO_PASSWORD)}@${MONGO_HOST}`;
const ENCODE_BASE    = 'https://opta-api.uniscore.vn/api/v1';
const PROD_BASE      = 'https://api.unik8s.com/api/v2';
const EXCEL_PATH     = path.join(__dirname, '../tests/Mapping coverage TheSport vs Footystats.xlsx');
const RESULTS_DIR    = path.join(__dirname, '../results');
const DATE_PAST_DAYS = 7;
const DATE_FUT_DAYS  = 3;

// ── Time window GMT+7 ─────────────────────────────────────────────────────────
const nowGmt7Ms  = Date.now() + 7 * 3600 * 1000;
const cutoffMs   = nowGmt7Ms - DATE_PAST_DAYS * 24 * 3600 * 1000;
const futureMs   = nowGmt7Ms + DATE_FUT_DAYS  * 24 * 3600 * 1000;
const todayStr   = new Date(nowGmt7Ms).toISOString().slice(0, 10);
const cutoffStr  = new Date(cutoffMs).toISOString().slice(0, 10);
const futureStr  = new Date(futureMs).toISOString().slice(0, 10);

// ── Excel serial → ms UTC ─────────────────────────────────────────────────────
function excelSerialToMs(serial) {
  return Math.round((serial - 25569) * 86400 * 1000);
}

// ── Đọc Excel ─────────────────────────────────────────────────────────────────
function readExcel() {
  const wb  = XLSX.readFile(EXCEL_PATH, { cellDates: false });
  const ws  = wb.Sheets['All matches'];
  const raw = XLSX.utils.sheet_to_json(ws, { defval: null });

  return raw
    .map(r => {
      const thesportId = String(r['TheSport ID'] ?? '').trim();
      if (!thesportId) return null;
      const rawTime    = r['Match Time (GMT+7)'];
      const matchTimeMs = typeof rawTime === 'number' ? excelSerialToMs(rawTime) : null;
      return {
        thesportId,
        match:          String(r['Match'] ?? '').trim(),
        competition:    String(r['Competition'] ?? '').trim(),
        pgStatus:       String(r['Status'] ?? '').trim(),
        pgVsMongo:      String(r['Match Status (PG vs Mongo)'] ?? '').trim(),
        footystatsIdPg: typeof r['FootyStats ID (PG)'] === 'number' ? r['FootyStats ID (PG)'] : null,
        confidence:     typeof r['Confidence'] === 'number' ? r['Confidence'] : null,
        matchTimeMs,
      };
    })
    .filter(Boolean);
}

// ── Load cache từ results JSON gần nhất ───────────────────────────────────────
function loadResultsCache() {
  const files = fs.readdirSync(RESULTS_DIR)
    .filter(f => /^footystats-mapping-\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort()
    .reverse();

  if (!files.length) return new Map();

  const latest = JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, files[0]), 'utf8'));
  const cache  = new Map(); // thesportId → { encodedId, hasAdvancedStats }
  for (const r of (latest.results ?? [])) {
    if (r.thesportId) cache.set(r.thesportId, { encodedId: r.encodedId, hasAdvancedStats: r.hasAdvancedStats });
  }
  console.log(`Cache từ ${files[0]}: ${cache.size} trận`);
  return cache;
}

// ── Gọi PROD API ──────────────────────────────────────────────────────────────
async function encodeId(thesportId) {
  try {
    const res = await fetch(`${ENCODE_BASE}/encode/${thesportId}`);
    if (!res.ok) return null;
    return (await res.text()).trim();
  } catch { return null; }
}

async function getHasAdvancedStats(encodedId) {
  try {
    const res  = await fetch(`${PROD_BASE}/football/event/${encodedId}?language=en`);
    if (!res.ok) return null;
    const json = await res.json();
    return json?.data?.event?.has_advanced_stats ?? false;
  } catch { return null; }
}

// ── Xử lý batch API ──────────────────────────────────────────────────────────
async function fetchBatch(rows, cache, batchSize = 10) {
  const results = [];
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const settled = await Promise.all(batch.map(async row => {
      // Dùng cache trước
      const cached = cache.get(row.thesportId);
      if (cached) {
        return { ...row, encodedId: cached.encodedId, hasAdvancedStats: cached.hasAdvancedStats, fromCache: true };
      }
      // Gọi API nếu không có cache
      const encodedId = await encodeId(row.thesportId);
      if (!encodedId) return { ...row, encodedId: null, hasAdvancedStats: null, fromCache: false };
      const hasAdvancedStats = await getHasAdvancedStats(encodedId);
      return { ...row, encodedId, hasAdvancedStats, fromCache: false };
    }));
    results.push(...settled);

    const done = Math.min(i + batchSize, rows.length);
    process.stdout.write(`\r  [${Math.round(done / rows.length * 100)}%] ${done}/${rows.length}`);
  }
  console.log('');
  return results;
}

// ── Main ──────────────────────────────────────────────────────────────────────
const client = new MongoClient(MONGO_URI, { authSource: 'admin' });

try {
  await client.connect();
  const col = client.db('footystats').collection('mapping_matches');

  const rows  = readExcel();
  console.log(`\nNgày hôm nay (GMT+7): ${todayStr}`);
  console.log(`Cửa sổ thời gian    : ${cutoffStr} → ${futureStr}  (hôm nay - ${DATE_PAST_DAYS}d → hôm nay + ${DATE_FUT_DAYS}d)`);
  console.log(`Tổng trận trong Excel: ${rows.length}`);

  // Lọc chỉ các trận pgVsMongo = "match"
  const matchRows = rows.filter(r => r.pgVsMongo === 'match' && r.footystatsIdPg != null);
  console.log(`Trận pgVsMongo="match": ${matchRows.length}`);

  // Lọc theo time window GMT+7
  const inWindow  = matchRows.filter(r => r.matchTimeMs != null && r.matchTimeMs >= cutoffMs && r.matchTimeMs <= futureMs);
  const noDate    = matchRows.filter(r => r.matchTimeMs == null);
  const outWindow = matchRows.filter(r => r.matchTimeMs != null && (r.matchTimeMs < cutoffMs || r.matchTimeMs > futureMs));
  console.log(`  Trong cửa sổ (${cutoffStr} → ${futureStr}): ${inWindow.length}`);
  console.log(`  Ngoài cửa sổ (tab không hiển thị)           : ${outWindow.length}`);
  if (noDate.length) console.log(`  Không có ngày                                : ${noDate.length}`);
  console.log('');

  // Chỉ check các trận trong window
  const targetRows = inWindow;

  // ── 1. Check MongoDB ──────────────────────────────────────────────────────
  console.log('\n[1/2] Kiểm tra MongoDB mapping_matches...');
  const pgIds      = targetRows.map(r => r.footystatsIdPg);
  const BATCH      = 500;
  const foundMongo = new Set();
  for (let i = 0; i < pgIds.length; i += BATCH) {
    const docs = await col.find({ footystats_id: { $in: pgIds.slice(i, i + BATCH) } }, { projection: { footystats_id: 1 } }).toArray();
    docs.forEach(d => foundMongo.add(d.footystats_id));
  }
  const inMongo    = targetRows.filter(r => foundMongo.has(r.footystatsIdPg));
  const notInMongo = targetRows.filter(r => !foundMongo.has(r.footystatsIdPg));
  console.log(`  ✅ Có trong Mongo  : ${inMongo.length}`);
  console.log(`  ❌ Chưa có trong Mongo: ${notInMongo.length}`);

  // ── 2. Check PROD API (has_advanced_stats) ────────────────────────────────
  console.log('\n[2/2] Kiểm tra PROD API has_advanced_stats...');
  const cache   = loadResultsCache();
  const checked = await fetchBatch(targetRows, cache);

  // ── Tổng kết ─────────────────────────────────────────────────────────────
  const tabOk          = checked.filter(r => foundMongo.has(r.footystatsIdPg) && r.hasAdvancedStats === true);
  const inMongoNoStats = checked.filter(r => foundMongo.has(r.footystatsIdPg) && r.hasAdvancedStats === false);
  const notInMongoOk   = checked.filter(r => !foundMongo.has(r.footystatsIdPg) && r.hasAdvancedStats === true);
  const bothMissing    = checked.filter(r => !foundMongo.has(r.footystatsIdPg) && r.hasAdvancedStats === false);
  const apiUnknown     = checked.filter(r => r.hasAdvancedStats === null);

  console.log(`
══════════════════════════════════════════════════════
TỔNG KẾT — MongoDB × PROD API  (trong window ${cutoffStr} → ${futureStr})
══════════════════════════════════════════════════════
  Tổng trận trong window : ${targetRows.length}  (bỏ qua ${outWindow.length} trận ngoài window)

  ✅ Trong Mongo + API có stats  : ${tabOk.length}  → TAB PHÂN TÍCH HOẠT ĐỘNG
  ⚠️  Trong Mongo nhưng no stats  : ${inMongoNoStats.length}  → Tab bị MẤT dù đã mapping
  ⚠️  Không trong Mongo, API có   : ${notInMongoOk.length}  → Mongo chưa sync
  ❌ Không Mongo + không stats    : ${bothMissing.length}  → Cần xử lý
  ❓ API error / encode fail      : ${apiUnknown.length}

  Tab phân tích HOẠT ĐỘNG : ${tabOk.length} / ${targetRows.length} (${(tabOk.length/targetRows.length*100).toFixed(1)}%)
  Tab phân tích BỊ MẤT    : ${inMongoNoStats.length + bothMissing.length} / ${targetRows.length}
══════════════════════════════════════════════════════`);

  // Chi tiết no stats
  if (inMongoNoStats.length > 0) {
    console.log(`\n⚠️  ${inMongoNoStats.length} trận TRONG MONGO nhưng has_advanced_stats=false:`);
    const byComp = {};
    for (const r of inMongoNoStats) {
      byComp[r.competition] = (byComp[r.competition] || 0) + 1;
    }
    Object.entries(byComp).sort((a,b) => b[1]-a[1]).slice(0, 15).forEach(([c, n]) => {
      console.log(`  ${String(n).padStart(4)}  ${c}`);
    });
  }

  if (notInMongo.length > 0) {
    console.log(`\n❌ ${notInMongo.length} trận pgVsMongo="match" nhưng KHÔNG tìm thấy trong MongoDB:`);
    notInMongo.slice(0, 10).forEach((r, i) => {
      console.log(`  ${i+1}) FID=${r.footystatsIdPg} | ${r.match} | ${r.competition}`);
    });
  }

  // Lưu kết quả
  const outFile = path.join(RESULTS_DIR, 'mongo-api-check-latest.json');
  fs.writeFileSync(outFile, JSON.stringify({
    generatedAt: new Date().toISOString(),
    window: { from: cutoffStr, to: futureStr, today: todayStr },
    summary: {
      totalInWindow: targetRows.length,
      outOfWindow: outWindow.length,
      inMongo: inMongo.length,
      notInMongo: notInMongo.length,
      tabOk: tabOk.length,
      tabBroken: inMongoNoStats.length + bothMissing.length,
      noStats: inMongoNoStats.length,
      apiUnknown: apiUnknown.length,
    },
    tabBroken: checked
      .filter(r => r.hasAdvancedStats === false)
      .map(r => ({
        thesportId: r.thesportId,
        footystatsIdPg: r.footystatsIdPg,
        match: r.match,
        competition: r.competition,
        inMongo: foundMongo.has(r.footystatsIdPg),
        hasAdvancedStats: r.hasAdvancedStats,
        prodUrl: r.encodedId ? `${PROD_BASE}/football/event/${r.encodedId}?language=en` : null,
      })),
  }, null, 2));
  console.log(`\nĐã lưu: results/mongo-api-check-latest.json`);

} finally {
  await client.close();
}
