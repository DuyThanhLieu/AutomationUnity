/**
 * Report tổng hợp vòng quét MỞ RỘNG — tìm thêm các loại bug "chưa dịch"
 * khác ngoài case gốc "advancing_match" (stages).
 *
 * PHÁT HIỆN QUAN TRỌNG: hệ thống dùng 2 CƠ CHẾ DỊCH KHÁC NHAU, không chỉ 1:
 *   (A) "stages.name" -> build key (lowercase + underscore) -> tra trong 1
 *       dictionary chung (GET /api/v2/locale/en, 7088 key). Case gốc user
 *       báo (advancing_match) thuộc loại này.
 *   (B) Nhiều loại dữ liệu khác (team, player, country, competition,
 *       category, injury...) có BẢNG "_locale" RIÊNG với các cột name_en,
 *       name_vi, name_th... — khi cột name_vi rỗng/null thì fallback về
 *       tiếng Anh (hoặc rỗng), KHÔNG liên quan tới dictionary ở (A).
 *
 * Đã quét cả 2 cơ chế:
 *   - Cơ chế (A): 130 "stages.name" nghi vấn (xem 02-export-report).
 *   - Cơ chế (B): quét 6 bảng "_locale" (injury, category, competition,
 *     country, player, team) tìm row có name_en nhưng thiếu name_vi.
 *     CHỈ "team_locale" có vấn đề — 36 case, trong đó 1 case là dữ liệu
 *     rác/trùng lặp (ID dạng UUID "Real Madrid" — ID THẬT đang dùng trên
 *     production là "e4wyrn4h111q86p", ĐÃ CÓ name_vi đầy đủ, không phải
 *     bug). 35 case còn lại là ID THẬT (short-code format giống hệ thống
 *     chính đang dùng) — chủ yếu đội bóng nhỏ/giải địa phương Trung Quốc.
 *
 * CHẠY:
 *   npx playwright test tests/standard/2026-Q3-task-translation-missing-stages/03-export-expanded-scan-report.spec.ts --project=chrome
 */
import { test } from '@playwright/test';
import { saveExcelForSeason, type ExcelSheetSpec } from '../lib/helpers';
import missingStages from './missing-stage-translations.json';
import missingTeams from './missing-team-vi.json';

const SEASON_DIR = '2026-Q3';
const SLUG = 'task-translation-missing-stages';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

test.describe('[Auto-check MỞ RỘNG] Toàn bộ bug "chưa dịch" đã phát hiện (Excel)', () => {
  test('Xuất TESTREPORT_UntranslatedExpandedScan.xlsx', async () => {
    const realMissingTeams = (missingTeams as Array<{ id: string; name_en: string; name_vi: string }>).filter((t) => !UUID_PATTERN.test(t.id));
    const junkTeams = (missingTeams as Array<{ id: string; name_en: string; name_vi: string }>).filter((t) => UUID_PATTERN.test(t.id));

    const sheets: ExcelSheetSpec[] = [
      {
        name: 'Tổng quan',
        columns: [
          { header: 'Mục', key: 'k', width: 32 },
          { header: 'Nội dung', key: 'v', width: 112 },
        ],
        rows: [
          { k: 'Phát hiện quan trọng', v: 'Hệ thống dùng 2 CƠ CHẾ DỊCH KHÁC NHAU cho các loại dữ liệu khác nhau — không phải 1 nguồn duy nhất. Đã mở rộng quét cả 2 cơ chế.' },
          { k: 'Cơ chế (A) — dictionary chung (stages, round name...)', v: `${missingStages.length} stage name KHÔNG tìm thấy key trong dictionary chung (GET /api/v2/locale/en, 7,088 key). Bao gồm case gốc "advancing match" đã xác nhận 100% qua UI thật. Rule build key chưa chuẩn 100% — xem sheet "Cơ chế A" để biết chi tiết + độ tin cậy từng case.` },
          { k: 'Cơ chế (B) — bảng _locale riêng (team, player, country, competition, category, injury)', v: `Quét 6 bảng "_locale": CHỈ "team_locale" có vấn đề. ${missingTeams.length} row có name_en nhưng thiếu name_vi, trong đó ${junkTeams.length} là dữ liệu rác/trùng lặp (ID dạng UUID, không phải ID thật đang dùng — ví dụ "Real Madrid" ID thật e4wyrn4h111q86p ĐÃ CÓ name_vi đầy đủ) và ${realMissingTeams.length} là ID THẬT đang active trên hệ thống, thật sự thiếu bản dịch tiếng Việt.` },
          { k: 'Mức độ nghiêm trọng cơ chế (B)', v: '35 team thiếu name_vi chủ yếu là đội bóng nhỏ/giải địa phương Trung Quốc (Qingdao, Wenzhou, Xiamen, Zhangzhou...) và vài đội nữ/trẻ ít traffic (DR Congo U19, Sydney University W). KHÔNG có đội lớn/phổ biến nào bị ảnh hưởng thật sự — mức độ tác động THẤP.' },
          { k: 'Các bảng _locale khác đã kiểm tra, KHÔNG có vấn đề', v: 'injury_locale, category_locale, competition_locale, country_locale, player_locale — toàn bộ row có name_en đều có name_vi đầy đủ, 0 thiếu sót.' },
          { k: 'Đề xuất', v: '(1) Ưu tiên rà lại cơ chế (A) — 130 case nghi vấn, đặc biệt case không chứa ký tự đặc biệt (độ tin cậy cao hơn). (2) Cơ chế (B) — 35 team thiếu name_vi mức độ thấp, có thể gộp báo 1 lần cho dev bổ sung dữ liệu, không cần ưu tiên gấp. (3) Đề xuất dev dọn dẹp bản ghi rác/trùng lặp dạng UUID trong team_locale (ít nhất 1 case "Real Madrid" đã phát hiện) để tránh gây nhiễu cho các lần quét sau.' },
        ],
        wrapText: true,
      },
      {
        name: 'Cơ chế A — stages nghi vấn',
        columns: [
          { header: '#', key: 'stt', width: 6 },
          { header: 'Stage name (DB)', key: 'stageName', width: 45 },
          { header: 'Key dự đoán', key: 'expectedKey', width: 45 },
        ],
        rows: (missingStages as Array<{ stageName: string; expectedKey: string }>).map((m, i) => ({ stt: i + 1, ...m })),
        wrapText: true,
      },
      {
        name: 'Cơ chế B — team thiếu name_vi',
        columns: [
          { header: '#', key: 'stt', width: 6 },
          { header: 'Team ID', key: 'id', width: 20 },
          { header: 'name_en', key: 'name_en', width: 30 },
          { header: 'Loại', key: 'type', width: 20 },
        ],
        rows: [
          ...realMissingTeams.map((t, i) => ({ stt: i + 1, id: t.id, name_en: t.name_en, type: 'ID thật — cần bổ sung' })),
          ...junkTeams.map((t, i) => ({ stt: realMissingTeams.length + i + 1, id: t.id, name_en: t.name_en, type: 'RÁC/TRÙNG LẶP — không phải bug' })),
        ],
        wrapText: true,
      },
    ];

    await saveExcelForSeason(SEASON_DIR, SLUG, 'TESTREPORT_UntranslatedExpandedScan.xlsx', sheets);
  });
});
