/**
 * TEST FILE: compare_sheet_vs_prod.spec.ts
 *
 * MỤC TIÊU: Kiểm tra mapping FootyStats để analytics tab hoạt động đúng.
 *
 * Vấn đề: Tab "Phân tích dữ liệu" ở chi tiết trận bị mất vì:
 *   1. Trận chưa được map sang FootyStats ID (unmapped)
 *   2. Mapping sai/conflict giữa PG và Mongo
 *   3. Confidence thấp → sai trận
 *   4. Mapped nhưng PROD API không có advanced stats
 *
 * LUỒNG:
 *   Excel (TheSport ID) → encode → PROD API event → check has_advanced_stats
 *   Cross-check với mapping status từ spreadsheet
 *
 * CÁC TRẠNG THÁI:
 *   ✅ ok            : mapped + has_advanced_stats=true → tab hoạt động
 *   ⚠️  mapped_no_stats: mapped + has_advanced_stats=false → cần điều tra
 *   ❌ unmapped      : không có FootyStats ID → tab sẽ mất
 *   ⚠️  conflict      : PG và Mongo có FootyStats ID khác nhau
 *   ⚠️  low_confidence: confidence < 0.90 → mapping có thể sai trận
 *   🔴 api_error     : gọi PROD API thất bại
 *
 * OUTPUT:
 *   results/footystats-mapping-YYYY-MM-DD.json       — tất cả kết quả
 *   results/footystats-mapping-issues-latest.json    — chỉ các vấn đề  
 * 
 * CHẠY:
 *   npx playwright test "tests/compare_sheet_vs_prod\[2557\].spec.ts" --project=chrome
 */

import { test, expect, type APIRequestContext } from '@playwright/test';
import * as XLSX                                from 'xlsx';
import * as fs                                  from 'fs';
import * as path                                from 'path';

// ─── CẤU HÌNH ──────────────────────────────────────────────────────────────

const EXCEL_PATH       = path.join(__dirname, 'Mapping coverage TheSport vs Footystats.xlsx');
const ENCODE_BASE      = 'https://opta-api.uniscore.vn/api/v1';
const PROD_BASE        = 'https://api.unik8s.com/api/v2';
const RESULTS_DIR      = path.join(__dirname, '..', 'results');
const BATCH_SIZE       = 10;
const LOW_CONF_THRESH  = 0.90;  // confidence < 0.90 → cảnh báo
const DATE_WINDOW_DAYS      = 7;  // tab analytics chỉ hiện cho trận trong 7 ngày qua
const DATE_FUTURE_DAYS      = 3;  // và tối đa 3 ngày vào tương lai

// ─── KIỂU DỮ LIỆU ──────────────────────────────────────────────────────────

interface SheetRow {
  thesportId:      string;
  match:           string;
  competition:     string;
  matchTime:       string;
  pgStatus:        string;   // mapped / unmapped
  footystatsIdPg:  number | null;
  confidence:      number | null;
  method:          string | null;
  mappingStatus:   string | null;  // confirmed / pending / ...
  mongoStatus:     string;
  footystatsIdMongo: number | null;
  pgVsMongo:       string;   // match / PG only / Mongo only / conflict / both missing
}

type CheckStatus =
  | 'ok'              // mapped + has_advanced_stats = true
  | 'mapped_no_stats' // mapped nhưng API không có advanced stats
  | 'unmapped'        // không có FootyStats ID
  | 'conflict'        // PG và Mongo có FootyStats ID khác nhau
  | 'low_confidence'  // confidence thấp
  | 'api_error'       // gọi API thất bại
  | 'encode_error';   // không encode được

interface IssueType {
  kind: 'unmapped' | 'mapped_no_stats' | 'conflict' | 'low_confidence';
  detail: string;
}

interface MatchResult {
  thesportId:       string;
  encodedId:        string | null;
  match:            string;
  competition:      string;
  matchTime:        string;
  pgStatus:         string;
  footystatsIdPg:   number | null;
  confidence:       number | null;
  pgVsMongo:        string;
  hasAdvancedStats: boolean | null;
  hasPlayerStats:   boolean | null;
  status:           CheckStatus;
  issues:           IssueType[];
  prodEventUrl:     string | null;
}

// ─── HELPER ────────────────────────────────────────────────────────────────

function fmtGmt7(serial: number): string {
  // Excel serial → UTC ms → +7h
  const d = new Date(Math.round((serial - 25569) * 86400 * 1000));
  const t = new Date(d.getTime()); // đã là UTC
  const pad = (n: number) => String(n).padStart(2, '0');
  const gmt7 = new Date(t.getTime() + 7 * 3600 * 1000);
  return `${gmt7.getUTCFullYear()}-${pad(gmt7.getUTCMonth()+1)}-${pad(gmt7.getUTCDate())} ${pad(gmt7.getUTCHours())}:${pad(gmt7.getUTCMinutes())}`;
}

function readExcel(filePath: string): SheetRow[] {
  const wb  = XLSX.readFile(filePath, { cellDates: false });
  const ws  = wb.Sheets['All matches'];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });

  return raw
    .map(r => {
      const thesportId = String(r['TheSport ID'] ?? '').trim();
      if (!thesportId) return null;

      const rawTime   = r['Match Time (GMT+7)'];
      const matchTime = typeof rawTime === 'number' ? fmtGmt7(rawTime) : String(rawTime ?? '');

      const footystatsIdPgRaw    = r['FootyStats ID (PG)'];
      const footystatsIdMongoRaw = r['FootyStats ID (Mongo)'];

      return {
        thesportId,
        match:              String(r['Match']           ?? '').trim(),
        competition:        String(r['Competition']     ?? '').trim(),
        matchTime,
        pgStatus:           String(r['Status']          ?? '').trim(),
        footystatsIdPg:     typeof footystatsIdPgRaw === 'number' ? footystatsIdPgRaw : null,
        confidence:         typeof r['Confidence']  === 'number'  ? r['Confidence']  as number : null,
        method:             r['Method']      ? String(r['Method'])      : null,
        mappingStatus:      r['Mapping Status'] ? String(r['Mapping Status']) : null,
        mongoStatus:        String(r['Mongo Status']    ?? '').trim(),
        footystatsIdMongo:  typeof footystatsIdMongoRaw === 'number' ? footystatsIdMongoRaw : null,
        pgVsMongo:          String(r['Match Status (PG vs Mongo)'] ?? '').trim(),
      } as SheetRow;
    })
    .filter(Boolean) as SheetRow[];
}
async function encodeId(request: APIRequestContext, thesportId: string): Promise<string | null> {
  try {
    const res = await request.get(`${ENCODE_BASE}/encode/${thesportId}`);
    if (!res.ok()) return null;
    return (await res.text()).trim();
  } catch { return null; }
}
interface EventData {
  has_advanced_stats?: boolean;
  has_player_stats?:   boolean;
  [key: string]: unknown;
}

async function getEventData(request: APIRequestContext, encodedId: string): Promise<EventData | null> {
  try {
    const res = await request.get(`${PROD_BASE}/football/event/${encodedId}?language=en`);
    if (!res.ok()) return null;
    const json = await res.json();
    return json?.data?.event ?? null;
  } catch { return null; }
}

async function checkOneRow(request: APIRequestContext, row: SheetRow): Promise<MatchResult> {
  const base: MatchResult = {
    thesportId:       row.thesportId,
    encodedId:        null,
    match:            row.match,
    competition:      row.competition,
    matchTime:        row.matchTime,
    pgStatus:         row.pgStatus,
    footystatsIdPg:   row.footystatsIdPg,
    confidence:       row.confidence,
    pgVsMongo:        row.pgVsMongo,
    hasAdvancedStats: null,
    hasPlayerStats:   null,
    status:           'encode_error',
    issues:           [],
    prodEventUrl:     null,
  };

  const issues: IssueType[] = [];

  // ── Encode ────────────────────────────────────────────────────────────────
  const encodedId = await encodeId(request, row.thesportId);
  if (!encodedId) return base;
  base.encodedId    = encodedId;
  base.prodEventUrl = `${PROD_BASE}/football/event/${encodedId}?language=en`;

  // ── Gọi PROD API ──────────────────────────────────────────────────────────
  const event = await getEventData(request, encodedId);
  if (!event) return { ...base, status: 'api_error' };

  base.hasAdvancedStats = event.has_advanced_stats ?? false;
  base.hasPlayerStats   = event.has_player_stats   ?? false;

  // ── Kiểm tra các vấn đề ───────────────────────────────────────────────────

  // 1. Unmapped: không có FootyStats ID
  if (row.pgStatus === 'unmapped' || row.footystatsIdPg === null) {
    issues.push({
      kind:   'unmapped',
      detail: `Không có FootyStats ID — tab phân tích sẽ bị mất (pgVsMongo="${row.pgVsMongo}")`,
    });
  }

  // 2. Conflict: PG và Mongo có FootyStats ID khác nhau
  if (row.pgVsMongo === 'conflict') {
    issues.push({
      kind:   'conflict',
      detail: `Conflict: PG ID=${row.footystatsIdPg} ≠ Mongo ID=${row.footystatsIdMongo}`,
    });
  }

  // 3. Low confidence: mapping có thể sai trận
  if (row.confidence !== null && row.confidence < LOW_CONF_THRESH) {
    issues.push({
      kind:   'low_confidence',
      detail: `Confidence=${row.confidence.toFixed(4)} < ${LOW_CONF_THRESH} — có thể map nhầm trận`,
    });
  }

  // 4. Mapped nhưng API không có advanced stats
  if (row.pgStatus === 'mapped' && row.footystatsIdPg !== null && !event.has_advanced_stats) {
    issues.push({
      kind:   'mapped_no_stats',
      detail: `FootyStats ID=${row.footystatsIdPg} đã map nhưng PROD API has_advanced_stats=false`,
    });
  }

  // ── Xác định status ───────────────────────────────────────────────────────
  let status: CheckStatus;
  if (issues.some(i => i.kind === 'conflict'))        status = 'conflict';
  else if (issues.some(i => i.kind === 'unmapped'))   status = 'unmapped';
  else if (issues.some(i => i.kind === 'mapped_no_stats')) status = 'mapped_no_stats';
  else if (issues.some(i => i.kind === 'low_confidence'))  status = 'low_confidence';
  else status = 'ok';

  return { ...base, status, issues };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function saveJson(filename: string, data: unknown): void {
  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.writeFileSync(path.join(RESULTS_DIR, filename), JSON.stringify(data, null, 2), 'utf-8');
  console.log(`Đã lưu: results/${filename}`);
}

// ─── TEST SUITE ─────────────────────────────────────────────────────────────

test.describe('FootyStats Mapping — Kiểm tra Analytics Tab', () => {

  test.setTimeout(3_600_000); // 60 phút cho 1746 trận

  let rows: SheetRow[] = [];

  test.beforeAll(() => {
    rows = readExcel(EXCEL_PATH);
    console.log(`\nĐọc Excel: ${rows.length} trận`);
    const mapped   = rows.filter(r => r.pgStatus === 'mapped').length;
    const unmapped = rows.filter(r => r.pgStatus === 'unmapped').length;
    const conflict = rows.filter(r => r.pgVsMongo === 'conflict').length;
    console.log(`  Mapped: ${mapped} | Unmapped: ${unmapped} | Conflict: ${conflict}`);
  });

  test('Excel: xác nhận dữ liệu đọc được', () => {
    expect(rows.length, 'Không đọc được dữ liệu Excel').toBeGreaterThan(0);
    const mapped = rows.filter(r => r.pgStatus === 'mapped').length;
    expect(mapped, 'Không có trận nào được mapped').toBeGreaterThan(0);
  });

  test('Kiểm tra FootyStats mapping + Analytics tab — chỉ trận đã mapped', async ({ request }) => {
    const allResults:  MatchResult[] = [];
    const allIssues:   MatchResult[] = [];

    let ok = 0, unmapped = 0, mappedNoStats = 0, conflict = 0,
        lowConf = 0, apiErr = 0, encErr = 0;

    // Cửa sổ thời gian GMT+7: [hôm nay - 7 ngày, hôm nay + 4 ngày]
    const nowGmt7Ms   = Date.now() + 7 * 3600 * 1000;
    const todayStr    = new Date(nowGmt7Ms).toISOString().slice(0, 10);
    const cutoffMs    = nowGmt7Ms - DATE_WINDOW_DAYS  * 24 * 3600 * 1000;
    const futureMs    = nowGmt7Ms + DATE_FUTURE_DAYS  * 24 * 3600 * 1000;
    const cutoffStr   = new Date(cutoffMs).toISOString().slice(0, 10);
    const futureStr   = new Date(futureMs).toISOString().slice(0, 10);

    // Chỉ check các trận đã có FootyStats ID VÀ trong cửa sổ thời gian
    const mappedRows = rows.filter(r => {
      if (r.pgStatus !== 'mapped' || r.footystatsIdPg === null) return false;
      const matchDate = r.matchTime.slice(0, 10); // YYYY-MM-DD
      return matchDate >= cutoffStr && matchDate <= futureStr;
    });
    const skippedOld    = rows.filter(r => r.pgStatus === 'mapped' && r.footystatsIdPg !== null
      && r.matchTime.slice(0, 10) < cutoffStr).length;
    const skippedFuture = rows.filter(r => r.pgStatus === 'mapped' && r.footystatsIdPg !== null
      && r.matchTime.slice(0, 10) > futureStr).length;
    console.log(`\nNgày hôm nay (GMT+7): ${todayStr}`);
    console.log(`Cửa sổ thời gian: ${cutoffStr} → ${futureStr}  (hôm nay - ${DATE_WINDOW_DAYS}d → hôm nay + ${DATE_FUTURE_DAYS}d)`);
    console.log(`Chỉ check trận đã mapped trong window: ${mappedRows.length}/${rows.length}`);
    console.log(`  Bỏ qua ${skippedOld} trận cũ hơn ${DATE_WINDOW_DAYS} ngày`);
    console.log(`  Bỏ qua ${skippedFuture} trận xa hơn ${DATE_FUTURE_DAYS} ngày tương lai`);

    const total = mappedRows.length;
    let processed = 0;

    for (const batch of chunk(mappedRows, BATCH_SIZE)) {
      const results = await Promise.all(batch.map(r => checkOneRow(request, r)));

      for (const r of results) {
        allResults.push(r);
        switch (r.status) {
          case 'ok':              ok++;            break;
          case 'unmapped':        unmapped++;      allIssues.push(r); break;
          case 'mapped_no_stats': mappedNoStats++; allIssues.push(r); break;
          case 'conflict':        conflict++;      allIssues.push(r); break;
          case 'low_confidence':  lowConf++;       allIssues.push(r); break;
          case 'api_error':       apiErr++;        break;
          case 'encode_error':    encErr++;        break;
        }
      }

      processed += batch.length;
      if (processed % 200 === 0 || processed === total) {
        const pct = ((processed / total) * 100).toFixed(1);
        console.log(`  [${pct}%] ${processed}/${total} — ok:${ok} unmapped:${unmapped} noStats:${mappedNoStats} conflict:${conflict} lowConf:${lowConf}`);
      }
    }

    // ── In vấn đề nghiêm trọng ──────────────────────────────────────────────
    const conflicts = allIssues.filter(r => r.status === 'conflict');
    if (conflicts.length > 0) {
      console.error(`\n🔴 CONFLICT (${conflicts.length} trận):`);
      conflicts.forEach(r => {
        r.issues.forEach(i => console.error(`  ${r.thesportId} | ${r.match} | ${i.detail}`));
        console.error(`  🔗 ${r.prodEventUrl}`);
      });
    }

    const noStats = allIssues.filter(r => r.status === 'mapped_no_stats');
    if (noStats.length > 0) {
      console.warn(`\n⚠️  MAPPED nhưng KHÔNG CÓ STATS (${noStats.length} trận — tối đa 20):`);
      noStats.slice(0, 20).forEach(r => {
        r.issues.filter(i => i.kind === 'mapped_no_stats')
          .forEach(i => console.warn(`  ${r.thesportId} | ${r.match} | ${i.detail}`));
        console.warn(`  🔗 ${r.prodEventUrl}`);
      });

      // Phân nhóm theo competition
      const byComp = new Map<string, number>();
      for (const r of noStats) {
        const c = r.competition || '(unknown)';
        byComp.set(c, (byComp.get(c) ?? 0) + 1);
      }
      const sorted = [...byComp.entries()].sort((a, b) => b[1] - a[1]);
      console.warn(`\n📊 PHÂN NHÓM ${noStats.length} trận no-stats theo Competition:`);
      sorted.forEach(([comp, count]) => {
        const bar = '█'.repeat(Math.min(count, 30));
        console.warn(`  ${String(count).padStart(3)}  ${bar}  ${comp}`);
      });
    }

    // ── Lưu kết quả ─────────────────────────────────────────────────────────
    const today   = todayStr; // GMT+7
    const summary = {
      runAt:        new Date().toISOString(),
      excelFile:    path.basename(EXCEL_PATH),
      prodApi:      PROD_BASE,
      totalMatches: total,
      ok,
      issues: { unmapped, mappedNoStats, conflict, lowConfidence: lowConf },
      errors: { apiError: apiErr, encodeError: encErr },
      analyticsTabWorking:  ok,
      analyticsTabMissing:  unmapped + mappedNoStats,
    };

    saveJson(`footystats-mapping-${today}.json`, { summary, results: allResults });

    const toRow = (r: MatchResult) => ({
      thesportId:      r.thesportId,
      match:           r.match,
      competition:     r.competition,
      matchTime:       r.matchTime,
      status:          r.status,
      footystatsIdPg:  r.footystatsIdPg,
      confidence:      r.confidence,
      pgVsMongo:       r.pgVsMongo,
      hasAdvancedStats: r.hasAdvancedStats,
      issues:          r.issues,
      prodEventUrl:    r.prodEventUrl,
    });

    // File 1: tab bị mất thực sự (mapped_no_stats + conflict + unmapped)
    const tabBroken = allIssues.filter(r => ['mapped_no_stats', 'conflict', 'unmapped'].includes(r.status));
    if (tabBroken.length > 0) {
      saveJson('footystats-tab-broken-latest.json', {
        summary: { ...summary, count: tabBroken.length, note: 'Tab phân tích bị mất — cần xử lý' },
        issues: tabBroken.map(toRow),
      });
    }

    // File 2: cảnh báo (low_confidence)
    const warnings = allIssues.filter(r => r.status === 'low_confidence');
    if (warnings.length > 0) {
      saveJson('footystats-warnings-latest.json', {
        summary: { ...summary, count: warnings.length, note: 'Confidence thấp — tab vẫn hoạt động nhưng có thể map nhầm trận' },
        issues: warnings.map(toRow),
      });
    }

    // ── Tổng kết ─────────────────────────────────────────────────────────────
    console.log(`\n${'═'.repeat(65)}`);
    console.log('TỔNG KẾT — FootyStats Mapping & Analytics Tab');
    console.log(`${'═'.repeat(65)}`);
    console.log(`  Tổng trận              : ${total}`);
    console.log(`  ✅ OK — tab hoạt động  : ${ok}  (${((ok/total)*100).toFixed(1)}%)`);
    console.log(`  ❌ Unmapped            : ${unmapped}  → tab phân tích bị MẤT`);
    console.log(`  ⚠️  Mapped nhưng no stats: ${mappedNoStats}  → tab phân tích bị MẤT`);
    console.log(`  ⚠️  Conflict PG≠Mongo  : ${conflict}  → dữ liệu không nhất quán`);
    console.log(`  ⚠️  Low confidence     : ${lowConf}  → có thể map nhầm trận`);
    console.log(`  🔴 API error           : ${apiErr}`);
    console.log(`  🔴 Encode error        : ${encErr}`);
    console.log(`${'═'.repeat(65)}`);
    console.log(`  Tab phân tích HOẠT ĐỘNG: ${ok} / ${total} (${((ok/total)*100).toFixed(1)}%)`);
    console.log(`  Tab phân tích BỊ MẤT  : ${unmapped + mappedNoStats} / ${total}`);
    console.log(`${'═'.repeat(65)}`);

    // ── Assertions ───────────────────────────────────────────────────────────
    expect.soft(conflict,     `${conflict} trận có conflict PG≠Mongo — cần resolve ngay`).toBe(0);
    expect.soft(mappedNoStats,`${mappedNoStats} trận mapped nhưng PROD API không có advanced stats`).toBe(0);
    // unmapped và low_confidence chỉ warn, không fail test
    if (unmapped > 0)
      console.warn(`\n  ℹ️  ${unmapped} trận chưa map sang FootyStats — xem file issues-latest.json`);
    if (lowConf > 0)
      console.warn(`  ℹ️  ${lowConf} trận confidence < ${LOW_CONF_THRESH} — nên review lại mapping`);
  });
});
