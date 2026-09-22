/**
 * TEST FILE: [Api][Football][Top League Locale] _3226.spec.ts
 *
 * TICKET: Cập nhật thêm Top giải cho khu vực — 18 quốc gia châu Âu (danh sách
 * nhận ngày 13/07/2026): Anh, Ý, TBN, Đức, Pháp, BĐN, Hà Lan, Thổ Nhĩ Kỳ,
 * Croatia, Hy Lạp, Áo, Bỉ, Bulgaria, Đan Mạch, Phần Lan, Ba Lan, Ukraine, Séc.
 *
 * KHU VỰC ẢNH HƯỞNG: Web - Top giải khu vực; App + Web - vị trí số 6 trang Home.
 *
 * PHẠM VI: CHỈ so API thật với file Excel — KHÔNG động tới DB. (Đã thử dùng
 * bảng competition_tier làm nguồn fallback nhưng verify ra 0 id trùng với
 * API /top-leagues/lang/{code} — bảng đó phục vụ 1 feature khác
 * (scheduled-events-pagination-v2, "top-10 league by priority" cho danh
 * sách trận — xem upcoming_fakeip_time.spec.ts), không phải feature đang
 * test ở đây. Nên bỏ hẳn phần DB, chỉ verify hành vi API.)
 *
 * NGUỒN EXPECTED: file Excel design/product cung cấp, tải về local
 *   ~/Downloads/List Tier Quốc Gia Châu Âu - 13_07_2026.xlsx
 *   Mỗi quốc gia là 1 sheet. Nhóm "hot quốc gia" (xem readHotGroup) là danh
 *   sách + THỨ TỰ (cột Tier) giải phải hiển thị ở "Top giải khu vực" khi user
 *   ở quốc gia đó.
 *
 * API: GET /football/competition/top-leagues/lang/{code}?language=en
 *   - locale là MÃ QUỐC GIA THUẦN 2 ký tự (GB, IT, ES...), KHÔNG phải dạng
 *     language-region (en-GB) — verify qua /lang/VN, /lang/GB (field
 *     country.name trả đúng).
 *   - Response là DYNAMIC (chỉ trả giải đang có mùa/status hiện tại, có thể
 *     thiếu id so với Excel nếu giải hết mùa/chưa khai mạc) -> mọi so sánh
 *     thứ tự đều làm trên phần GIAO (id xuất hiện ở cả 2 bên), không so
 *     danh sách đầy đủ 1-1 — tránh false positive.
 *
 * MAPPING sheet Excel -> locale code:
 *   Anh=GB, Ý=IT, TBN=ES, Đức=DE, Pháp=FR, Bồ=PT, Hà Lan=NL, Thổ Nhĩ Kỳ=TR,
 *   Croatia=HR, Hy Lạp=GR, Áo=AT, Bỉ=BE, Bulgaria=BG, Đan Mạch=DK,
 *   Phần Lan=FI, Ba Lan=PL, Ukraine=UA, Séc=CZ.
 *
 * GỒM 2 TEST:
 *   TEST 1 [Fake-IP sensitivity] — response của mỗi locale (trừ GB) KHÔNG
 *     được giống hệt locale=GB (baseline). Giống hệt -> đổi fake IP không có
 *     tác dụng, chắc chắn sai vì không có 2 nước nào có thứ tự ưu tiên giải
 *     giống tuyệt đối nhau.
 *     ĐÃ PHÁT HIỆN THẬT: NL, AT, BE, BG, DK, CZ (6/18) trả về Y HỆT locale=GB.
 *   TEST 2 [API vs Excel] — thứ tự API trả về (cho các id cùng xuất hiện ở
 *     Excel nhóm hot) phải khớp thứ tự Tier trong Excel. Nếu 1 id xuất hiện
 *     nhiều lần trong cùng sheet (data Excel bị trùng dòng), LUÔN lấy tier
 *     NHỎ NHẤT (ưu tiên cao nhất) trong các dòng trùng đó để so sánh — không
 *     coi việc trùng dòng là lỗi cần fail riêng (đã bỏ test Excel integrity
 *     kiểm tra việc này, theo yêu cầu: "chỉ cần xuất hiện vị trí cao nhất là
 *     đúng").
 *
 * CHẠY (phải escape [ ] vì Playwright coi argument là regex):
 *   npx playwright test "tests/\[Api\]\[Football\]\[Top League Locale\] _3226.spec.ts" --project=chrome
 *
 * ─────────────────────────────────────────────────────────────────────────
 * QUY TRÌNH TEST ĐẦY ĐỦ (2 BƯỚC) — API/Excel + smoke UI, cho 18 quốc gia
 * ─────────────────────────────────────────────────────────────────────────
 *
 * BƯỚC 1 — So dữ liệu API vs file Excel Tier (theo IP thật từng nước):
 *   1. File Excel để đúng path EXCEL_PATH ở trên (~/Downloads/...).
 *   2. Với mỗi quốc gia trong 18 nước, connect VPN đúng vùng (ExpressVPN CLI):
 *        /Applications/ExpressVPN.app/Contents/MacOS/expressvpnctl connect <region>
 *      region map: GB=uk-london, IT=italy-milan, ES=spain-madrid,
 *      DE=germany-frankfurt-1, FR=france-paris-1, PT=portugal,
 *      NL=netherlands-amsterdam, TR=turkey, HR=croatia, GR=greece, AT=austria,
 *      BE=belgium, BG=bulgaria, DK=denmark, FI=finland, PL=poland,
 *      UA=ukraine, CZ=czech-republic.
 *   3. Verify IP đã đổi đúng nước qua header x-geo-country-code:
 *        curl -sI https://opta-api.uniscore.vn/api/v2/football/competition/top-leagues/lang/GB | grep -i x-geo-country-code
 *   4. Chạy 2 test trong file này (lệnh CHẠY ở trên) — tự động gọi API
 *      /top-leagues/lang/{code} cho từng nước, so với baseline GB (TEST 1),
 *      và so khớp thứ tự với Tier trong Excel (TEST 2).
 *   5. Kết quả lưu tại results/top-league-locale-fakeip-check.json và
 *      results/top-league-locale-api-check.json (breakdown từng id sai).
 *
 * BƯỚC 2 — Smoke UI: chụp ảnh top giải theo từng quốc gia:
 *   1. Với mỗi nước, connect VPN đúng vùng (như Bước 1), verify geo header
 *      đúng trước khi chụp.
 *   2. Load https://staging.uniscore.vn, đợi trang load xong. CHECK sidebar
 *      "Giải Đấu Nổi Bật" đã có nội dung thật (≥3 icon giải) hay còn là
 *      khung skeleton xám — nếu còn skeleton thì RELOAD lại, tối đa ~4 lần
 *      (nguyên nhân: bug flaky api.unik8s.com/api/v1/country/alpha2, xem
 *      check_sidebar_geo_fallback.spec.ts — KHÔNG liên quan tới locale/VPN).
 *   3. CHỈ giữ lại / báo cáo ảnh của NHỮNG NƯỚC hiển thị được nội dung thật
 *      sau các lần reload (results/fakeip-screenshots/{CODE}_vpn.png).
 *      Nước nào sau hết số lần reload vẫn kẹt skeleton -> BỎ QUA, không tính
 *      là kết quả smoke UI hợp lệ cho nước đó, ghi chú riêng là
 *      "không chụp được do sidebar lỗi hạ tầng (flaky 3rd-party API)"
 *      thay vì đưa vào kết luận đúng/sai locale.
 *   4. So bằng mắt các ảnh ĐÃ LOAD ĐƯỢC với thứ tự Tier mong đợi trong Excel
 *      — đối chiếu tên/thứ tự giải hiển thị trên UI với kết quả JSON Bước 1.
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as https from 'https';
import * as xlsx from 'xlsx';

const RESULTS_DIR = path.join(__dirname, '..', 'results');

function saveJson(filename: string, data: unknown): void {
  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.writeFileSync(path.join(RESULTS_DIR, filename), JSON.stringify(data, null, 2), 'utf-8');
  console.log(`Đã lưu: results/${filename}`);
}

// ─── CẤU HÌNH ──────────────────────────────────────────────────────────────

const API_BASE = 'https://opta-api.uniscore.vn/api/v2/football';

const EXCEL_PATH = path.join(os.homedir(), 'Downloads', 'List Tier Quốc Gia Châu Âu - 13_07_2026.xlsx');

/** Locale đối chứng cho TEST 1 — response của GB đã biết ĐÚNG (Premier League được ưu
 *  tiên đúng cho chính nước Anh). Locale khác trả về giống i-xì GB -> chắc chắn KHÔNG
 *  được xử lý riêng (2 nước không thể có thứ tự ưu tiên giải giống tuyệt đối). */
const BASELINE_LOCALE = 'GB';

/** Tên sheet Excel (chú ý "Bồ " có khoảng trắng cuối — đúng như file gốc) -> mã quốc gia locale */
const SHEET_TO_LOCALE: Record<string, string> = {
  'Anh':          'GB',
  'Ý':            'IT',
  'TBN':          'ES',
  'Đức':          'DE',
  'Pháp':         'FR',
  'Bồ ':          'PT',
  'Hà Lan':       'NL',
  'Thổ Nhĩ Kỳ':   'TR',
  'Croatia':      'HR',
  'Hy Lạp':       'GR',
  'Áo':           'AT',
  'Bỉ':           'BE',
  'Bulgaria':     'BG',
  'Đan Mạch':     'DK',
  'Phần Lan':     'FI',
  'Ba Lan':       'PL',
  'Ukraine':      'UA',
  'Séc':          'CZ',
};

// ─── KIỂU DỮ LIỆU ──────────────────────────────────────────────────────────

interface ExpectedEntry {
  tier: number;
  name: string;
  id:   string;
}

interface FakeIpResult {
  locale: string;
  sheet:  string;
  status: 'ok' | 'identical_to_baseline' | 'api_error';
  apiCount: number;
  firstIds: string[]; // 5 id đầu tiên — để log so sánh nhanh bằng mắt
}

interface ApiVsExcelResult {
  locale: string;
  sheet:  string;
  status: 'ok' | 'order_violation' | 'api_error' | 'no_overlap';
  apiCount:     number;
  overlapCount: number; // số id API trả về mà cũng có trong Excel (nhóm hot)
  violations:   Array<{ id: string; name: string; expectedTier: number; apiIndex: number; violatesAgainstId: string; violatesAgainstTier: number }>;
}

// ─── HELPER: ĐỌC EXCEL ──────────────────────────────────────────────────────

/**
 * Đọc nhóm "hot quốc gia" của 1 sheet — trả về list (tier, name, id) theo
 * đúng thứ tự trong file.
 *
 * Nhóm "hot" = NHÓM DATA KHÔNG RỖNG ĐẦU TIÊN trong sheet, bất kể có label
 * hay không — KHÔNG match cứng text "NHÓM GIẢI HOT QUỐC GIA". Lý do: verify
 * thực tế 17/18 sheet có marker "NHÓM GIẢI HOT QUỐC GIA" đúng ngay dòng đầu
 * (row 1) — tức là nhóm "ngầm định trước marker đầu tiên" của các sheet này
 * RỖNG (marker xuất hiện trước khi có bất kỳ data row nào), và nhóm data
 * thật sự là nhóm NGAY SAU marker đó. Ngược lại, sheet "Bồ " (Portugal)
 * không có marker mở đầu nào cả — nhóm hot của sheet đó chính là nhóm ngầm
 * định (label=null) đứng trước marker "NHÓM GIẢI QUỐC GIA CÓ OPTA" ở dòng
 * 39. "Nhóm không rỗng đầu tiên" xử lý đúng cả 2 trường hợp cùng lúc.
 */
function readHotGroup(sheet: xlsx.WorkSheet): ExpectedEntry[] {
  const rows: unknown[][] = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  const groups: ExpectedEntry[][] = [[]];

  for (const row of rows) {
    if (row.length === 1 && typeof row[0] === 'string') {
      groups.push([]);
      continue;
    }
    if (typeof row[0] !== 'number') continue;

    const tier = row[0] as number;
    const name = String(row[2] ?? '').trim();
    const id   = String(row[4] ?? '').trim();
    if (!id) continue;
    groups[groups.length - 1].push({ tier, name, id });
  }

  return groups.find(g => g.length > 0) ?? [];
}

// ─── HELPER: GỌI API ────────────────────────────────────────────────────────

function httpGetJson(url: string): Promise<{ ok: boolean; json?: any }> {
  return new Promise((resolve) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        if (res.statusCode !== 200) return resolve({ ok: false });
        try { resolve({ ok: true, json: JSON.parse(data) }); }
        catch { resolve({ ok: false }); }
      });
    }).on('error', () => resolve({ ok: false }));
  });
}

async function fetchTopLeagues(locale: string): Promise<Array<{ id: string; name: string }> | null> {
  const res = await httpGetJson(`${API_BASE}/competition/top-leagues/lang/${locale}?language=en`);
  const list = res.ok ? res.json?.data : null;
  return Array.isArray(list) ? list : null;
}

// ─── TEST SUITE ─────────────────────────────────────────────────────────────

test.describe('[Api][Football][Top League Locale] US-3226 — Top giải khu vực cho 18 quốc gia châu Âu', () => {

  test.setTimeout(0);

  const hasExcel = fs.existsSync(EXCEL_PATH);
  let expectedBySheet: Record<string, ExpectedEntry[]> = {};

  test.beforeAll(() => {
    if (hasExcel) {
      const wb = xlsx.readFile(EXCEL_PATH);
      for (const sheetName of Object.keys(SHEET_TO_LOCALE)) {
        const sheet = wb.Sheets[sheetName];
        if (!sheet) continue;
        expectedBySheet[sheetName] = readHotGroup(sheet);
      }
    }
  });

  test('[1] Fake-IP: đổi locale phải làm thay đổi thứ tự top giải (không được giống hệt baseline)', async () => {
    const baselineList = await fetchTopLeagues(BASELINE_LOCALE);
    expect(baselineList, `Không gọi được API cho baseline locale=${BASELINE_LOCALE}`).not.toBeNull();
    const baselineIdsJoined = baselineList!.map(c => c.id).join(',');

    const results: FakeIpResult[] = [];

    for (const [sheet, locale] of Object.entries(SHEET_TO_LOCALE)) {
      const list = await fetchTopLeagues(locale);
      if (!list) {
        results.push({ locale, sheet, status: 'api_error', apiCount: 0, firstIds: [] });
        continue;
      }

      const idsJoined = list.map(c => c.id).join(',');
      const isBaselineItself = locale === BASELINE_LOCALE;
      const identical = !isBaselineItself && idsJoined === baselineIdsJoined;

      results.push({
        locale, sheet,
        status: identical ? 'identical_to_baseline' : 'ok',
        apiCount: list.length,
        firstIds: list.slice(0, 5).map(c => c.id),
      });
    }

    const summary = {
      totalCountries:         results.length,
      ok:                     results.filter(r => r.status === 'ok').length,
      identical_to_baseline:  results.filter(r => r.status === 'identical_to_baseline').length,
      api_error:              results.filter(r => r.status === 'api_error').length,
    };

    console.log(`\n${'═'.repeat(70)}`);
    console.log(`KẾT QUẢ [1] FAKE-IP SENSITIVITY — so với baseline locale=${BASELINE_LOCALE}`);
    console.log(`${'═'.repeat(70)}`);
    console.log(summary);

    results.filter(r => r.status !== 'ok').forEach(r => {
      console.log(`\n[${r.status.toUpperCase()}] locale=${r.locale} (sheet="${r.sheet}")`);
      if (r.status === 'identical_to_baseline') {
        console.log(`  Response giống HỆT locale=${BASELINE_LOCALE} -> fake IP KHÔNG có tác dụng cho nước này`);
        console.log(`  first5 ids: ${r.firstIds.join(', ')}`);
      }
    });

    saveJson('top-league-locale-fakeip-check.json', { summary, baselineLocale: BASELINE_LOCALE, results });

    const failing = results.filter(r => r.status !== 'ok');
    expect.soft(
      failing.length,
      `${failing.length}/${results.length} locale KHÔNG đổi thứ tự top giải khi fake IP (giống hệt baseline hoặc API lỗi) — xem chi tiết log/JSON`
    ).toBe(0);
  });

  test('[2] API vs Excel: thứ tự /top-leagues/lang/{code} phải khớp Tier trong Excel (nhóm hot quốc gia)', async () => {
    test.skip(!hasExcel, `Không tìm thấy file Excel (${EXCEL_PATH}) trên máy này — cần tải file "List Tier Quốc Gia Châu Âu" về Downloads trước khi chạy test này.`);

    const missingSheets = Object.keys(SHEET_TO_LOCALE).filter(s => !expectedBySheet[s]);
    if (missingSheets.length) {
      console.log(`⚠ Không tìm thấy sheet trong file Excel: ${missingSheets.join(', ')} — kiểm tra lại tên sheet có đổi không.`);
    }

    const results: ApiVsExcelResult[] = [];

    for (const [sheet, locale] of Object.entries(SHEET_TO_LOCALE)) {
      const expected = expectedBySheet[sheet];
      if (!expected) continue;

      // Nếu 1 id xuất hiện nhiều lần trong sheet (data trùng), giữ tier NHỎ NHẤT
      // (ưu tiên cao nhất) — không quan trọng thứ tự đọc trong file, luôn lấy vị trí ưu tiên cao nhất.
      const tierById = new Map<string, number>();
      const nameById = new Map<string, string>();
      for (const e of expected) {
        const existing = tierById.get(e.id);
        if (existing === undefined || e.tier < existing) {
          tierById.set(e.id, e.tier);
          nameById.set(e.id, e.name);
        }
      }

      const list = await fetchTopLeagues(locale);
      if (!list) {
        results.push({ locale, sheet, status: 'api_error', apiCount: 0, overlapCount: 0, violations: [] });
        continue;
      }

      // chỉ giữ các id API trả về mà CŨNG có trong nhóm hot của Excel — tránh false positive vì API là dynamic
      const overlapInOrder = list.filter(item => tierById.has(item.id));

      if (overlapInOrder.length < 2) {
        results.push({ locale, sheet, status: 'no_overlap', apiCount: list.length, overlapCount: overlapInOrder.length, violations: [] });
        continue;
      }

      const violations: ApiVsExcelResult['violations'] = [];
      for (let i = 1; i < overlapInOrder.length; i++) {
        const prev = overlapInOrder[i - 1];
        const curr = overlapInOrder[i];
        const prevTier = tierById.get(prev.id)!;
        const currTier = tierById.get(curr.id)!;
        if (currTier < prevTier) {
          violations.push({
            id: curr.id, name: nameById.get(curr.id) ?? '', expectedTier: currTier,
            apiIndex: i, violatesAgainstId: prev.id, violatesAgainstTier: prevTier,
          });
        }
      }

      results.push({
        locale, sheet,
        status: violations.length ? 'order_violation' : 'ok',
        apiCount: list.length,
        overlapCount: overlapInOrder.length,
        violations,
      });
    }

    const summary = {
      totalCountries:  results.length,
      ok:              results.filter(r => r.status === 'ok').length,
      order_violation: results.filter(r => r.status === 'order_violation').length,
      no_overlap:      results.filter(r => r.status === 'no_overlap').length,
      api_error:       results.filter(r => r.status === 'api_error').length,
    };

    console.log(`\n${'═'.repeat(70)}`);
    console.log('KẾT QUẢ [2] API vs EXCEL — /competition/top-leagues/lang/{code} (thứ tự tương đối)');
    console.log(`${'═'.repeat(70)}`);
    console.log(summary);

    results.filter(r => r.status !== 'ok').forEach(r => {
      console.log(`\n[${r.status.toUpperCase()}] locale=${r.locale} (sheet="${r.sheet}") apiCount=${r.apiCount} overlapCount=${r.overlapCount}`);
      r.violations.forEach(v => console.log(`  Sai thứ tự: id=${v.id} (${v.name}, tier=${v.expectedTier}) đứng SAU id=${v.violatesAgainstId} (tier=${v.violatesAgainstTier}) — lẽ ra phải đứng trước`));
    });

    saveJson('top-league-locale-api-check.json', { summary, results });

    const failing = results.filter(r => r.status === 'order_violation' || r.status === 'api_error');
    expect.soft(
      failing.length,
      `${failing.length}/${results.length} quốc gia có thứ tự top-league từ API SAI so với Tier trong Excel (hoặc API lỗi)`
    ).toBe(0);
  });
});
