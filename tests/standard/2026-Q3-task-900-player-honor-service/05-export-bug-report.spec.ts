/**
 * US-900 — Xuất file Excel báo cáo 2 lỗi phát hiện khi đối chiếu Go staging
 * (staging-player-svc.uniscore.vn) vs NestJS legacy (opta-api.uniscore.vn).
 *
 * KHÔNG phải test verify — chỉ generate tài liệu Excel từ kết quả đã điều
 * tra kỹ (xem results/BUG_REPORT_US900_Player_GoStaging_DataMismatch.md và
 * results/BUG_LOG_US900_ChoDev.md để đọc bản đầy đủ dạng Markdown).
 *
 * CHẠY:
 *   npx playwright test tests/standard/2026-Q3-task-900-player-honor-service/05-export-bug-report.spec.ts --project=chrome
 */

import { test } from '@playwright/test';
import { saveExcelForSeason, type ExcelSheetSpec } from '../lib/helpers';

const SEASON_DIR = '2026-Q3';
const SLUG = 'task-900-player-honor-service';

test.describe('[US-900] Export báo cáo lỗi (Excel)', () => {
  test('Xuất BUG_REPORT_US900_Player.xlsx', async () => {
    const sheets: ExcelSheetSpec[] = [
      {
        name: 'Tổng quan',
        columns: [
          { header: 'Thông tin', key: 'k', width: 26 },
          { header: 'Nội dung', key: 'v', width: 90 },
        ],
        rows: [
          { k: 'Task', v: 'US-900 (Jira UTD-900) — [API][Football] Tách Player + Honor thành service riêng' },
          { k: 'Ngày test', v: '28/08/2026' },
          { k: 'Domain CŨ (NestJS legacy)', v: 'https://opta-api.uniscore.vn/' },
          { k: 'Domain MỚI (Go, đang test)', v: 'https://staging-player-svc.uniscore.vn/' },
          { k: 'Player mẫu', v: 'Corentin Tolisso (player_id=q69zrnleeejrah5), Lyon, Ligue 1' },
          { k: 'Phạm vi', v: 'Đối chiếu 19 endpoint theo bảng "Consolidated endpoint list" (Jira UTD-900)' },
          { k: 'Kết quả', v: '16/19 endpoint khớp hoàn toàn — 2 lỗi (3 endpoint) cần báo dev, chi tiết ở sheet "Lỗi"' },
        ],
        wrapText: true,
      },
      {
        name: 'Lỗi',
        columns: [
          { header: 'STT', key: 'stt', width: 6 },
          { header: 'Endpoint', key: 'endpoint', width: 45 },
          { header: 'Domain CŨ (opta-api.uniscore.vn)', key: 'domainCu', width: 55 },
          { header: 'Domain MỚI (staging-player-svc.uniscore.vn)', key: 'domainMoi', width: 55 },
          { header: 'Mô tả lỗi', key: 'moTa', width: 70 },
          { header: 'Kết luận / Ai sai', key: 'ketLuan', width: 45 },
          { header: 'Hành động cần', key: 'hanhDong', width: 45 },
        ],
        rows: [
          {
            stt: 1,
            endpoint: 'GET /player/{ref_id}/events/last/{page}',
            domainCu:
              'https://opta-api.uniscore.vn/api/v2/football/player/q69zrnleeejrah5/events/last/1?language=en\n\ntrả tournament.id="en5wdkxvdzx0u8a" cho Ligue 1',
            domainMoi:
              'https://staging-player-svc.uniscore.vn/api/v2/football/player/q69zrnleeejrah5/events/last/1?language=en\n\ntrả tournament.id="bm0nxitovzu9p9u" cho Ligue 1',
            moTa:
              'Cùng 1 trận đấu (event id giống hệt) nhưng 2 domain trả tournament.id khác nhau hoàn toàn. Xảy ra ở toàn bộ 31/31 event trong response mẫu, không phải 1 trận lẻ.',
            ketLuan:
              'Domain CŨ SAI: gọi GET /unique-tournament/en5wdkxvdzx0u8a → trả rỗng (code:2), ID không resolve được ở đâu cả.\nDomain MỚI ĐÚNG: gọi GET /unique-tournament/bm0nxitovzu9p9u → resolve ra đầy đủ "Ligue 1".\nĐây là bug có sẵn từ lâu ở domain cũ, domain mới đã vô tình sửa đúng.',
            hanhDong: 'KHÔNG cần sửa code Go. Chỉ cần thông báo team biết — cutover sang domain mới sẽ tự động sửa bug ẩn này.',
          },
          {
            stt: 2,
            endpoint: 'GET /player/{id}/unique-tournament/{c}/season/{s}/statistics/overall',
            domainCu:
              'https://opta-api.uniscore.vn/api/v2/football/player/q69zrnleeejrah5/unique-tournament/bm0nxitovzu9p9u/season/2es0s3ko448ntnv/statistics/overall?language=en\n\nCÓ "xgOverall": 9.7174 và "goalsPrevented": 0',
            domainMoi:
              'https://staging-player-svc.uniscore.vn/api/v2/football/player/q69zrnleeejrah5/unique-tournament/bm0nxitovzu9p9u/season/2es0s3ko448ntnv/statistics/overall?language=en\n\nTHIẾU cả 2 field xgOverall và goalsPrevented',
            moTa:
              'Domain mới thiếu hoàn toàn 2 field xgOverall và goalsPrevented trong response — mọi field khác đều khớp 100% với domain cũ.',
            ketLuan:
              'Đã tra Postgres, bảng xg_seasonal_player_stats (player_id=n54qllhxwegqvy9, season Ligue 1 2025-2026): xg=9.7174, goals_prevented=0.0000 — dữ liệu CÓ SẴN VÀ ĐÚNG, khớp 100% với domain cũ.\nDomain mới chỉ thiếu bước lấy field này khi build response, không phải thiếu dữ liệu/schema.',
            hanhDong: 'Nhờ dev bổ sung map field "xg" -> xgOverall và "goals_prevented" -> goalsPrevented từ bảng xg_seasonal_player_stats vào Go handler.',
          },
          {
            stt: 3,
            endpoint: 'GET /player/{id}/unique-tournament/{c}/season/{s}/statistics/overall-v2',
            domainCu: 'CÓ "xg_overall" và "goals_prevented" (bản snake_case, cùng URL nhưng đổi "overall" -> "overall-v2")',
            domainMoi: 'THIẾU cả 2 field xg_overall và goals_prevented (bản snake_case)',
            moTa: 'Cùng lỗi hệt STT 2, chỉ khác convention đặt tên field (snake_case thay vì camelCase) — 2 endpoint dùng chung 1 nguồn dữ liệu.',
            ketLuan: 'Cùng nguyên nhân với STT 2 — dữ liệu có sẵn đúng trong DB, Go thiếu bước map field.',
            hanhDong: 'Sửa cùng lúc với STT 2 (2 endpoint dùng chung logic, chỉ khác tên field trả về).',
          },
        ],
        wrapText: true,
      },
      {
        name: '16 endpoint đã khớp',
        columns: [
          { header: 'Endpoint', key: 'endpoint', width: 60 },
          { header: 'Kết quả', key: 'ketQua', width: 20 },
        ],
        rows: [
          'GET /player/{ref_id} (info)',
          'GET /player/{id}/transfer-history',
          'GET /player/{player_id}/summary',
          'GET /player/{ref_id}/characteristics',
          'GET /player/{player_id}/honors',
          'GET /player/{player_id}/national/statistics',
          'GET+HEAD /player/{player_id}/team-honors',
          'GET+HEAD /player/{player_id}/individual-awards',
          'GET /player/{player_id}/injury',
          'GET /player/{ref_id}/attribute-overviews',
          'GET /player/{id}/competition/{c}/season/{s}/stats/page/{page}',
          'GET /player/transfer-market/period/{p}/sort/{s}/page/{page}',
          'GET /player/{ref_id}/statistics/seasons',
          'GET+HEAD /player/{player_id}/summary-career',
          'GET+HEAD /player/{player_id}/team-career',
          'GET+HEAD /player/{player_id}/national-team-career',
        ].map((endpoint) => ({ endpoint, ketQua: 'PASS — khớp 100%' })),
        wrapText: true,
      },
    ];

    await saveExcelForSeason(SEASON_DIR, SLUG, 'BUG_REPORT_US900_Player.xlsx', sheets);
  });
});
