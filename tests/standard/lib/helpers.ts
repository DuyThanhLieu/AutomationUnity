import * as fs from 'fs';
import * as path from 'path';
import ExcelJS from 'exceljs';

export const RESULTS_ROOT = path.join(__dirname, '..', 'results');
export const WEBSITE_URL = 'https://uniscore.com';

/**
 * Kết quả được tổ chức theo: results/{TEST_BATCH}/{TEST_COMPETITION_ID}/{filename}
 *
 * TEST_BATCH là tên đợt kiểm tra (vd "2026-Q3" khớp task US-3462 "Checklist
 * tiền mùa giải quý 3/2026") — PHẢI truyền qua biến môi trường, không suy ra
 * ngầm từ ngày chạy test, để chạy lại test cho 1 đợt cũ vẫn ghi đúng thư mục
 * của đợt đó thay vì bị gán nhầm sang đợt hiện tại.
 *
 * Nếu thiếu TEST_BATCH, dùng "_unbatched" làm fallback rõ ràng (không phải
 * silent default) để dễ nhận ra khi xem lại thư mục kết quả.
 */
function getResultsDir(): string {
  const batch = process.env.TEST_BATCH || '_unbatched';
  const competitionId = process.env.TEST_COMPETITION_ID || '_no-competition-id';
  return path.join(RESULTS_ROOT, batch, competitionId);
}

export function saveJson(filename: string, data: unknown): void {
  const dir = getResultsDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), JSON.stringify(data, null, 2), 'utf-8');
  console.log(`✓ Đã lưu: ${path.relative(path.join(__dirname, '..', '..', '..'), path.join(dir, filename))}`);
}

/**
 * Dùng cho các thư mục mùa+giải hard-code (vd
 * tests/standard/2026-Q3/premier-league/) — KHÔNG qua biến môi trường
 * TEST_BATCH/TEST_COMPETITION_ID như saveJson() ở trên (đó là dành cho
 * _template/, chạy tham số hoá). Ở đây path đã cố định theo vị trí vật lý
 * của thư mục mùa/giải, nên season và slug giải phải truyền trực tiếp.
 */
export function saveJsonForSeason(seasonDir: string, slug: string, filename: string, data: unknown): void {
  const dir = path.join(RESULTS_ROOT, seasonDir, slug);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), JSON.stringify(data, null, 2), 'utf-8');
  console.log(`✓ Đã lưu: tests/standard/results/${seasonDir}/${slug}/${filename}`);
}

export type ExcelSheetSpec = {
  name: string;
  columns: Array<{ header: string; key: string; width?: number }>;
  rows: Array<Record<string, unknown>>;
  /** Bật word-wrap + căn top cho toàn bộ ô dữ liệu — dùng khi nội dung nhiều dòng (vd query nhiều dòng, mô tả dài) cần đọc trọn trong ô thay vì bị cắt. */
  wrapText?: boolean;
};

/**
 * Xuất báo cáo Excel nhiều sheet vào cùng vị trí vật lý với
 * saveJsonForSeason() (results/{seasonDir}/{slug}/{filename}). Dùng cho báo
 * cáo cần xem/lọc bằng tay (vd audit cache hàng nghìn dòng) — JSON thuần khó
 * đọc trực tiếp, trong khi CSV không hỗ trợ nhiều sheet trong 1 file.
 */
export async function saveExcelForSeason(seasonDir: string, slug: string, filename: string, sheets: ExcelSheetSpec[]): Promise<void> {
  const dir = path.join(RESULTS_ROOT, seasonDir, slug);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const workbook = new ExcelJS.Workbook();
  for (const sheet of sheets) {
    const ws = workbook.addWorksheet(sheet.name);
    ws.columns = sheet.columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 18 }));
    ws.getRow(1).font = { bold: true };
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columns.length } };
    for (const row of sheet.rows) {
      const excelRow = ws.addRow(row);
      if (sheet.wrapText) excelRow.alignment = { wrapText: true, vertical: 'top' };
    }
  }

  const filePath = path.join(dir, filename);
  await workbook.xlsx.writeFile(filePath);
  console.log(`✓ Đã lưu: tests/standard/results/${seasonDir}/${slug}/${filename}`);
}

export function isValidUrl(url: string | null | undefined): boolean {
  if (!url) return true; // optional field — rỗng không tính là lỗi format
  try {
    new URL(url);
    return /^https?:\/\//.test(url);
  } catch {
    return false;
  }
}

export function isValidImageUrl(url: string | null | undefined): boolean {
  if (!isValidUrl(url)) return false;
  if (!url) return false;
  return /\.(jpg|jpeg|png|svg|gif|webp)$/i.test(url);
}

/** Quy đổi unix timestamp (UTC) sang NGÀY theo giờ VN (UTC+7). */
export function toVNDateStr(unixTs: number): string {
  const d = new Date((unixTs + 7 * 3600) * 1000);
  return d.toISOString().slice(0, 10);
}

export function pct(ok: number, total: number): string {
  return total > 0 ? ((ok / total) * 100).toFixed(1) : '0';
}

/**
 * Frontend (api.uni-score.com) dùng 1 tầng ID thứ 3 hoàn toàn tách biệt với
 * thesport ID/Opta ID lưu trong DB — KHÔNG map được qua bất kỳ bảng cầu nối
 * nào (đã verify: gọi thẳng sport_events.id vào /football/event/{id} luôn
 * trả 400 "Event not found"). Cách duy nhất lấy đúng ID này là để trình
 * duyệt tự điều hướng tới trang giải, bắt link trận thật từ DOM/network,
 * rồi trích ID ở cuối URL (/football/match/{slug}/{id}).
 *
 * Trả về null nếu giải hiện KHÔNG có trận nào được frontend index (thường
 * do off-season) — gọi nơi dùng phải tự xử lý bằng test.skip(), KHÔNG được
 * coi null là lỗi.
 */
async function discoverFrontendMatchHref(page: import('@playwright/test').Page, competitionSlug: string): Promise<string | null> {
  await page.goto(`${WEBSITE_URL}/football/competition/${competitionSlug}/`, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  const hrefs = await page.locator('a[href*="/football/match/"]').evaluateAll((els) => els.map((e) => e.getAttribute('href')));
  return hrefs.find((h): h is string => !!h) ?? null;
}

export async function discoverFrontendEventId(page: import('@playwright/test').Page, competitionSlug: string): Promise<string | null> {
  const href = await discoverFrontendMatchHref(page, competitionSlug);
  if (!href) return null;
  const parts = href.split('/').filter(Boolean);
  return parts[parts.length - 1] || null;
}

/**
 * Endpoint /statistics đòi hỏi thêm home/away team ID (tầng 3, khác hẳn
 * team_id trong DB) trong path — vd
 * /event/{eventId}/home/{homeId}/away/{awayId}/statistics — không suy ra
 * được chỉ từ eventId. Bắt trực tiếp URL request thật khi trang trận thật
 * mở ra (network capture tự phát sinh khi load trang, không cần click tab),
 * thay vì tự ráp path bằng slug giả.
 */
export async function discoverFrontendStatsUrl(page: import('@playwright/test').Page, competitionSlug: string): Promise<string | null> {
  const href = await discoverFrontendMatchHref(page, competitionSlug);
  if (!href) return null;

  let statsUrl: string | null = null;
  const onRequest = (req: import('@playwright/test').Request) => {
    const u = req.url();
    if (!statsUrl && u.includes('api.uni-score.com/api/v2/football/event') && u.includes('/statistics')) {
      statsUrl = u;
    }
  };
  page.on('request', onRequest);
  await page.goto(`${WEBSITE_URL}${href}`, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1500);
  page.off('request', onRequest);
  return statsUrl;
}

/**
 * Frontend season_id (dùng cho endpoint tournament/season/stage/events và
 * unique-tournament/season/standings) KHÔNG map trực tiếp với thesport
 * season_id qua bất kỳ bảng cầu nối nào — hệ ID tầng 3, độc lập hoàn toàn.
 * Cách xác định đúng season/stage frontend tương ứng 1 mùa DB cụ thể: khớp
 * theo NĂM BẮT ĐẦU mùa (vd DB season có trận đầu tiên 08/2025 → frontend
 * season có year="2025-2026") — đã verify pattern này đúng qua dữ liệu
 * thật, KHÔNG suy đoán. stage_id lấy qua endpoint standings/total (chỉ trả
 * đúng 1 stage cho giải round-robin không group như Eredivisie).
 */
export async function findFrontendSeasonStage(
  request: import('@playwright/test').APIRequestContext,
  frontendTournamentId: string,
  dbSeasonStartYear: number
): Promise<{ seasonId: string; stageId: string } | null> {
  const seasonsRes = await request.get(`https://api.uni-score.com/api/v2/unique-tournament/${frontendTournamentId}/seasons?language=vi`);
  const seasonsBody = await seasonsRes.json();
  const seasons: Array<{ id: string; year: string }> = seasonsBody.data?.seasons ?? [];
  const match = seasons.find((s) => s.year === `${dbSeasonStartYear}-${dbSeasonStartYear + 1}`);
  if (!match) return null;

  const standingsRes = await request.get(`https://api.uni-score.com/api/v2/unique-tournament/${frontendTournamentId}/season/${match.id}/standings/total`);
  const standingsBody = await standingsRes.json();
  const stageId: string | undefined = standingsBody.data?.stage?.[0]?.id;
  if (!stageId) return null;

  return { seasonId: match.id, stageId };
}
