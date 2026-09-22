/**
 * TEST FILE: [Api][Football][General] Cập nhật avatar cầu thủ Bundesliga mùa 26/27,
 * và avatar còn thiếu provider mới bổ sung của giải MLS 2026-3594.spec.ts
 *
 * TICKET: US-3594 — Cập nhật avatar cầu thủ Bundesliga mùa 26/27, bổ sung avatar
 *   còn thiếu (provider mới) cho giải MLS 2026.
 *
 * PHẠM VI HIỆN TẠI: CHỈ test giải MLS 2026 (theo yêu cầu thu hẹp phạm vi).
 *
 * NGUỒN: file CSV "mls_2026_updated.csv" (tải về local ~/Downloads) — đây là
 *   build report CÓ SẴN đầy đủ mapping, khác hẳn cách cũ (phải tự đọc thư mục
 *   ảnh giải nén + tự query DB mp_player để map opta_id -> thesport_id):
 *     - player_id   : CHÍNH LÀ thesport_id — dùng thẳng để gọi API, không cần map qua DB nữa.
 *     - opta_id     : id ảnh gốc bên Opta.
 *     - team        : tên đội.
 *     - league      : "MLS_2026" cho các dòng thuộc giải MLS (file có lẫn cả
 *                     dòng của giải khác — Brazil, Australia, Europe UEFA...
 *                     — PHẢI lọc đúng league trước khi test).
 *     - status      : "refreshed" | "new" — trạng thái build ảnh, không quyết
 *                     định avatar đã lên CDN hay chưa (đó là việc test này verify).
 *     - build_path  : đường dẫn ảnh trong hệ thống build nội bộ.
 *
 * PHẠM VI TEST: chỉ lọc league = "MLS_2026", verify từng player_id (=thesport_id)
 *   phải có avatar thật trên CDN.
 *
 * ENDPOINT ẢNH AVATAR (giống US-3247 — xem file đó để biết cách xác định
 * endpoint, KHÔNG suy đoán lại):
 *   GET https://{domain}/__opta/football/player/{thesport_id}/image/{small|medium}
 *   200 + ảnh thật -> avatar đã lên; 404 -> avatar CHƯA lên dù build report báo refreshed.
 *
 * CHẠY:
 *   npx playwright test "tests/\[Api\]\[Football\]\[General\] Cập nhật avatar cầu thủ Bundesliga mùa 26-27, và avatar còn thiếu provider mới bổ sung của giải MLS 2026-3594.spec.ts" --project=chrome
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as https from 'https';
import ExcelJS from 'exceljs';

const RESULTS_DIR = path.join(process.cwd(), 'results');

function saveJson(filename: string, data: unknown): void {
  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.writeFileSync(path.join(RESULTS_DIR, filename), JSON.stringify(data, null, 2), 'utf-8');
  console.log(`Đã lưu: results/${filename}`);
}

// ─── CẤU HÌNH ──────────────────────────────────────────────────────────────

const CSV_PATH = path.join(os.homedir(), 'Downloads', 'mls_2026_updated.csv');
const TARGET_LEAGUE = 'MLS_2026';
const IMAGE_DOMAINS = ['img.uniscore.com', 'img.uniscore.cc'];
const IMAGE_SIZE = 'medium';

function imageUrl(domain: string, thesportId: string): string {
  return `https://${domain}/__opta/football/player/${thesportId}/image/${IMAGE_SIZE}`;
}

// ─── PARSE CSV (không phụ thuộc thư viện ngoài — format đơn giản, không có
// dấu phẩy lồng trong giá trị theo mẫu đã kiểm tra) ─────────────────────────

interface MlsCsvRow {
  player_id: string;
  player_name: string;
  team: string;
  opta_id: string;
  opta_name: string;
  league: string;
  status: string;
  src_path: string;
  build_path: string;
  size_bytes: string;
  built_at: string;
}

function parseCsv(filePath: string): MlsCsvRow[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/).filter((l) => l.length > 0);
  const header = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const cols = line.split(',');
    const row: Record<string, string> = {};
    header.forEach((h, i) => (row[h] = cols[i] ?? ''));
    return row as unknown as MlsCsvRow;
  });
}

// ─── HELPER: HEAD REQUEST ───────────────────────────────────────────────────

function httpHead(url: string): Promise<{ status: number; contentLength?: number }> {
  return new Promise((resolve) => {
    const req = https.request(url, { method: 'HEAD', timeout: 15_000 }, (res) => {
      const len = res.headers['content-length'];
      resolve({ status: res.statusCode ?? 0, contentLength: len ? Number(len) : undefined });
      res.resume();
    });
    req.on('error', () => resolve({ status: 0 }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0 }); });
    req.end();
  });
}

async function runPool<T>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<void>): Promise<void> {
  let next = 0;
  async function runNext(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runNext));
}

interface CheckResult {
  team: string;
  playerId: string;
  playerName: string;
  optaId: string;
  status: 'ok' | 'missing' | 'error';
  httpStatus?: number;
}

// ─── TEST SUITE ─────────────────────────────────────────────────────────────

test.describe('US-3594 — Avatar MLS 2026 (provider mới, theo build report CSV)', () => {
  test.setTimeout(0);

  const hasCsv = fs.existsSync(CSV_PATH);
  let mlsRows: MlsCsvRow[] = [];
  let leagueCounts: Record<string, number> = {};

  test.beforeAll(() => {
    if (!hasCsv) return;
    const allRows = parseCsv(CSV_PATH);
    for (const r of allRows) {
      const key = r.league || '(rỗng)';
      leagueCounts[key] = (leagueCounts[key] ?? 0) + 1;
    }
    mlsRows = allRows.filter((r) => r.league === TARGET_LEAGUE && r.player_id);
  });

  for (const domain of IMAGE_DOMAINS) {
    test(`Mỗi player MLS 2026 trong build report phải có avatar thật trên ${domain} (__opta endpoint trả 200)`, async () => {
      test.skip(!hasCsv, `Không tìm thấy file CSV (${CSV_PATH}) — cần tải "mls_2026_updated.csv" về Downloads trước khi chạy test này.`);

      console.log('Phân bố league trong CSV (toàn bộ file):', leagueCounts);
      console.log(`Số player "${TARGET_LEAGUE}" cần check trên ${domain}: ${mlsRows.length}`);

      const results: CheckResult[] = [];
      let scanned = 0;

      const CONCURRENCY = 30;
      await runPool(mlsRows, CONCURRENCY, async (row) => {
        scanned++;
        if (scanned % 200 === 0) {
          console.log(`  → ${scanned}/${mlsRows.length} player | missing=${results.filter((r) => r.status === 'missing').length}`);
        }

        const res = await httpHead(imageUrl(domain, row.player_id));
        results.push({
          team: row.team,
          playerId: row.player_id,
          playerName: row.player_name,
          optaId: row.opta_id,
          status: res.status === 200 ? 'ok' : res.status === 404 ? 'missing' : 'error',
          httpStatus: res.status,
        });
      });

      const missing = results.filter((r) => r.status === 'missing');
      const errors = results.filter((r) => r.status === 'error');

      const missingByTeam = new Map<string, number>();
      missing.forEach((m) => missingByTeam.set(m.team, (missingByTeam.get(m.team) ?? 0) + 1));

      const summary = {
        domain,
        league: TARGET_LEAGUE,
        totalChecked: results.length,
        ok: results.filter((r) => r.status === 'ok').length,
        missing: missing.length,
        error: errors.length,
        missingByTeam: Object.fromEntries(missingByTeam),
      };

      console.log(`\n${'═'.repeat(70)}`);
      console.log(`KẾT QUẢ: Avatar MLS 2026 trên ${domain}/__opta`);
      console.log(`${'═'.repeat(70)}`);
      console.log(summary);

      missing.slice(0, 50).forEach((m) =>
        console.log(`[MISSING] team=${m.team} player_id=${m.playerId} (${m.playerName}) opta_id=${m.optaId} -> HTTP ${m.httpStatus}`)
      );
      errors.forEach((e) => console.log(`[ERROR] player_id=${e.playerId} -> HTTP ${e.httpStatus}`));

      saveJson(`us-3594-mls-avatar-check-${domain}.json`, { summary, missing, errors });

      expect.soft(
        missing.length,
        `${missing.length}/${results.length} player MLS 2026 trong build report nhưng avatar KHÔNG có trên ${domain} (__opta endpoint trả 404) — xem results/us-3594-mls-avatar-check-${domain}.json`
      ).toBe(0);

      expect.soft(errors.length, `${errors.length} request lỗi (timeout/network) khi check avatar trên ${domain}`).toBe(0);
    });
  }

  test('Xuất report Excel — chỉ đọc lại JSON đã lưu, KHÔNG gọi lại API/CSV', async () => {
    // Đọc lại kết quả 2 domain đã chạy ở trên (test.describe chạy tuần tự
    // theo thứ tự khai báo trong cùng file, nên 2 test domain phía trên PHẢI
    // đã chạy xong trước khi tới đây — nếu chạy riêng lẻ file này bằng -g thì
    // cần chạy đủ cả bộ để có JSON nguồn).
    const jsonPaths = IMAGE_DOMAINS.map((d) => path.join(RESULTS_DIR, `us-3594-mls-avatar-check-${d}.json`));
    const missingSources = jsonPaths.filter((p) => !fs.existsSync(p));
    if (missingSources.length > 0) {
      test.skip(true, `Thiếu file kết quả nguồn: ${missingSources.join(', ')} — chạy 2 test check avatar ở trên trước.`);
      return;
    }

    interface DomainResult {
      summary: { domain: string; league: string; totalChecked: number; ok: number; missing: number; error: number; missingByTeam: Record<string, number> };
      missing: CheckResult[];
      errors: CheckResult[];
    }
    const perDomain: DomainResult[] = jsonPaths.map((p) => JSON.parse(fs.readFileSync(p, 'utf-8')));

    const overviewRows = perDomain.map((d) => ({
      domain: d.summary.domain,
      league: d.summary.league,
      totalChecked: d.summary.totalChecked,
      ok: d.summary.ok,
      missing: d.summary.missing,
      error: d.summary.error,
      ketQua: d.summary.missing === 0 && d.summary.error === 0 ? `PASS — ${d.summary.ok}/${d.summary.totalChecked} avatar đầy đủ` : `${d.summary.missing} thiếu, ${d.summary.error} lỗi`,
    }));

    const missingRows = perDomain.flatMap((d) =>
      d.missing.map((m) => ({ domain: d.summary.domain, team: m.team, playerId: m.playerId, playerName: m.playerName, optaId: m.optaId, httpStatus: m.httpStatus }))
    );
    const errorRows = perDomain.flatMap((d) =>
      d.errors.map((e) => ({ domain: d.summary.domain, team: e.team, playerId: e.playerId, playerName: e.playerName, optaId: e.optaId, httpStatus: e.httpStatus }))
    );

    console.log(`\n📊 Report tổng: ${overviewRows.map((r) => `${r.domain}=${r.ketQua}`).join(' | ')}`);

    const workbook = new ExcelJS.Workbook();

    const overviewSheet = workbook.addWorksheet('Tong quan');
    overviewSheet.columns = [
      { header: 'Domain', key: 'domain', width: 22 },
      { header: 'League', key: 'league', width: 14 },
      { header: 'Tổng số check', key: 'totalChecked', width: 16 },
      { header: 'OK', key: 'ok', width: 10 },
      { header: 'Thiếu (404)', key: 'missing', width: 14 },
      { header: 'Lỗi', key: 'error', width: 10 },
      { header: 'Kết quả', key: 'ketQua', width: 40 },
    ];
    overviewSheet.getRow(1).font = { bold: true };
    overviewRows.forEach((r) => overviewSheet.addRow(r));

    if (missingRows.length > 0) {
      const missingSheet = workbook.addWorksheet('Avatar thieu (404)');
      missingSheet.columns = [
        { header: 'Domain', key: 'domain', width: 22 },
        { header: 'Team', key: 'team', width: 26 },
        { header: 'player_id (thesport_id)', key: 'playerId', width: 20 },
        { header: 'Tên cầu thủ', key: 'playerName', width: 26 },
        { header: 'opta_id', key: 'optaId', width: 28 },
        { header: 'HTTP status', key: 'httpStatus', width: 14 },
      ];
      missingSheet.getRow(1).font = { bold: true };
      missingRows.forEach((r) => missingSheet.addRow(r));
    }

    if (errorRows.length > 0) {
      const errorSheet = workbook.addWorksheet('Loi request');
      errorSheet.columns = [
        { header: 'Domain', key: 'domain', width: 22 },
        { header: 'Team', key: 'team', width: 26 },
        { header: 'player_id (thesport_id)', key: 'playerId', width: 20 },
        { header: 'Tên cầu thủ', key: 'playerName', width: 26 },
        { header: 'opta_id', key: 'optaId', width: 28 },
        { header: 'HTTP status', key: 'httpStatus', width: 14 },
      ];
      errorSheet.getRow(1).font = { bold: true };
      errorRows.forEach((r) => errorSheet.addRow(r));
    }

    const excelPath = path.join(RESULTS_DIR, 'us-3594-mls-avatar-report.xlsx');
    await workbook.xlsx.writeFile(excelPath);
    console.log(`✓ Đã lưu report: results/us-3594-mls-avatar-report.xlsx (${workbook.worksheets.length} sheet)`);
  });
});
