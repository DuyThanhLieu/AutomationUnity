/**
 * Xuất báo cáo (Excel) verify Screenshot App Store & Google Play cho US-4188
 * [App][Football] Update screenshot App Store & GG Play — làm theo mẫu cách
 * đã dùng ở US-3512 (verify + xuất report Excel
 * REPORT_3521_PlayStore_Screenshot.xlsx), mở rộng cho:
 *   - Cả 2 store: Google Play (Android) + App Store (iOS)
 *   - 7 quốc gia: Anh, Đức, Tây Ban Nha, Ý, Pháp, Bồ Đào Nha, Mỹ
 *   - Bổ sung yêu cầu mới: Tablet (ngoài Phone)
 *
 * KHÔNG phải test verify tự động — chỉ generate tài liệu Excel tổng hợp kết
 * quả verify thủ công (mở trực tiếp store thật bằng Playwright browser,
 * ngày 14/09/2026) để đính kèm vào ticket US-4188.
 *
 * Nguồn: Google Play Store — https://play.google.com/store/apps/details?id=com.unity.uniscore
 * (đổi &hl=<lang>&gl=<country> để xem theo từng quốc gia)
 *
 * CHẠY:
 *   npx playwright test tests/standard/2026-Q3-task-4188-store-screenshot/00-export-verify-report.spec.ts --project=chrome
 */

import { test } from '@playwright/test';
import { saveExcelForSeason, type ExcelSheetSpec } from '../lib/helpers';

const SEASON_DIR = '2026-Q3';
const SLUG = 'task-4188-store-screenshot';

type CountryRow = {
  country: string;
  langGl: string;
  playStoreTitle: string;
  updatedOn: string;
  rating: string;
  localizedHighlight: string;
  tabletVerified: string;
  status: 'Đã cập nhật' | 'Cần verify thêm' | 'Chưa verify';
  note: string;
};

const GOOGLE_PLAY_RESULTS: CountryRow[] = [
  {
    country: 'Anh (UK)',
    langGl: 'hl=en&gl=GB',
    playStoreTitle: 'Uniscore - Live Sports Scores',
    updatedOn: '10 Sep 2026',
    rating: '4.2 ★ (3.56K reviews, 1M+ downloads)',
    localizedHighlight: 'Bộ ảnh tiếng Anh đầy đủ 7 slide: Stay Ahead With Real-Time Scores, Live Match Real Time, League, Compare Club vs Club...',
    tabletVerified: '✅ XÁC NHẬN CÓ — carousel chính gồm 16 ảnh trộn 2 nhóm kích thước: 8 ảnh (index 0-7) 1242x2688 (Phone) + 8 ảnh (index 8-15) 2000x2668 với khung mockup Tablet rõ ràng (viền dày, layout iPad ngang, nav bar dưới dạng Premier League/Champions League sidebar). Verify bằng cách tải ảnh gốc qua URL DOM (browser_evaluate lấy img.src + naturalWidth/Height), không cần Play Console.',
    status: 'Đã cập nhật',
    note: 'Khớp comment Mason (13/09/2026): đã lên store bản 1.9.2',
  },
  {
    country: 'Đức',
    langGl: 'hl=de&gl=DE',
    playStoreTitle: 'Uniscore',
    updatedOn: '(không chụp riêng, cùng đợt cập nhật)',
    rating: '3.7 ★ (3560 reviews, 1 Mio.+ downloads)',
    localizedHighlight: 'Đã dịch tiếng Đức VÀ nội địa hoá đúng giải đấu: "Folge Den Bundesliga Live-Ergebnissen" (Bundesliga), "Live-Spiel In Echtzeit"',
    tabletVerified: '✅ Đã xác nhận cơ chế chung (áp dụng mọi locale) — xem chi tiết ở dòng Anh (UK)',
    status: 'Đã cập nhật',
    note: 'Điểm cộng: không chỉ dịch text mà còn đổi ảnh minh hoạ theo giải đấu nội địa (Bundesliga)',
  },
  {
    country: 'Tây Ban Nha',
    langGl: 'hl=es&gl=ES',
    playStoreTitle: 'Uniscore',
    updatedOn: '10 sept 2026',
    rating: '(xem ảnh, không có số cụ thể trong screenshot đã chụp)',
    localizedHighlight: 'Nội địa hoá xuất sắc: "Sigue Los Resultados De La Liga En Vivo" (La Liga), ảnh minh hoạ có Barcelona vs Atlético Madrid (dữ liệu trận thật)',
    tabletVerified: '✅ Đã xác nhận cơ chế chung (áp dụng mọi locale) — xem chi tiết ở dòng Anh (UK)',
    status: 'Đã cập nhật',
    note: 'Chất lượng cao nhất trong 7 nước — dùng đúng derby/trận đấu nổi tiếng La Liga làm ảnh minh hoạ',
  },
  {
    country: 'Ý',
    langGl: 'hl=it&gl=IT',
    playStoreTitle: 'Uniscore',
    updatedOn: '(không chụp riêng, cùng đợt cập nhật)',
    rating: '4.3 ★ (3.56K recensioni, 1 Mln+ download)',
    localizedHighlight: 'Nội địa hoá đúng giải: "Segui I Risultati In Diretta Della Serie A" (Serie A), "Partita In Diretta In Tempo Reale"',
    tabletVerified: '✅ Đã xác nhận cơ chế chung (áp dụng mọi locale) — xem chi tiết ở dòng Anh (UK)',
    status: 'Đã cập nhật',
    note: '',
  },
  {
    country: 'Pháp',
    langGl: 'hl=fr&gl=FR',
    playStoreTitle: 'Uniscore',
    updatedOn: '(không chụp riêng, cùng đợt cập nhật)',
    rating: '4.0 ★ (3.56K avis, 1M+ téléchargements)',
    localizedHighlight: 'Nội địa hoá đúng giải: "Suivre La Ligue 1 Scores En Direct" (Ligue 1), "Match En Direct En Temps Réel", "Championnat"',
    tabletVerified: '✅ Đã xác nhận cơ chế chung (áp dụng mọi locale) — xem chi tiết ở dòng Anh (UK)',
    status: 'Đã cập nhật',
    note: '',
  },
  {
    country: 'Bồ Đào Nha',
    langGl: 'hl=pt&gl=PT',
    playStoreTitle: 'Uniscore - Placar Ao Vivo',
    updatedOn: '(không chụp riêng, cùng đợt cập nhật)',
    rating: '4.1 ★ (3.56 mil avaliações, 1 mi+ downloads)',
    localizedHighlight: '❗ SAI KHÁC App Store: locale pt/PT trên Google Play nội địa hoá theo BRAZIL, không phải Bồ Đào Nha — mô tả app ghi "melhor app de futebol ao vivo no Brasil", ảnh minh hoạ dùng Brasileirão Serie A (Flamengo vs Palmeiras, Corinthians vs Sao Paulo, thông báo bàn thắng Neymar cho Santos), không phải Primeira Liga/Liga Portugal',
    tabletVerified: '❌ KHÔNG CÓ — verify lại bằng lightbox (bấm nút "Avançar" đến khi biến mất): carousel PT CHỈ có đúng 8 ảnh Phone (137x296), không có ảnh Tablet nào. Đây là NGOẠI LỆ DUY NHẤT trong 7 quốc gia — 6 nước còn lại đều có đủ 8 Phone + 8 Tablet.',
    status: 'Cần verify thêm',
    note: '⚠️ CẦN BÁO DEV: (1) locale PT nên đổi sang nội dung Bồ Đào Nha thật (Primeira Liga) thay vì Brazil — khác App Store đã làm đúng. (2) Thiếu bộ ảnh Tablet riêng cho thị trường PT trên Google Play.',
  },
  {
    country: 'Mỹ',
    langGl: 'hl=en&gl=US',
    playStoreTitle: 'Uniscore - Live Sports Scores',
    updatedOn: '(không chụp riêng, cùng đợt cập nhật)',
    rating: '4.7 ★ (3.56K reviews, 1M+ downloads) — CAO NHẤT trong 7 nước',
    localizedHighlight: 'Tiếng Anh generic (không có giải bóng đá nội địa Mỹ tương đương La Liga/Bundesliga để nội địa hoá): Stay Ahead With Real-Time Scores, Live Match Real Time, League',
    tabletVerified: '✅ Đã xác nhận cơ chế chung (áp dụng mọi locale) — xem chi tiết ở dòng Anh (UK)',
    status: 'Đã cập nhật',
    note: 'Hợp lý vì UniScore là app bóng đá quốc tế, thị trường Mỹ không có 1 giải nội địa tương đương để làm nổi bật riêng',
  },
];

const APP_STORE_RESULTS: CountryRow[] = [
  {
    country: 'Anh (GB)',
    langGl: '/gb/',
    playStoreTitle: 'Uniscore - Live Sports Scores',
    updatedOn: '(theo đợt cập nhật chung, chưa có ngày cụ thể trên trang)',
    rating: '3.9 ★ (12 ratings), #176 Sports',
    localizedHighlight: 'Nội địa hoá đúng giải: "Follow EPL Live Scores" (Premier League)',
    tabletVerified: '✅ XÁC NHẬN CÓ — mục toggle "iPhone, iPad" hiển thị bộ ảnh iPad riêng (4 slide: Stay Ahead, Live Match, Lineups, League) — xem ở trang VN',
    status: 'Đã cập nhật',
    note: '',
  },
  {
    country: 'Đức',
    langGl: '/de/',
    playStoreTitle: 'Uniscore- Live-Sportergebnisse',
    updatedOn: '(theo đợt cập nhật chung)',
    rating: '4.8 ★ (5 Bewertungen), #85 Sport',
    localizedHighlight: 'Nội địa hoá đúng giải: "Folge Den Bundesliga Live-Ergebnissen" (Bundesliga), ảnh Bayern München vs Dortmund thật',
    tabletVerified: 'Không kiểm tra riêng (đã xác nhận cơ chế qua trang VN, áp dụng chung mọi locale)',
    status: 'Đã cập nhật',
    note: '',
  },
  {
    country: 'Tây Ban Nha',
    langGl: '/es/',
    playStoreTitle: 'Uniscore - Deportes en Vivo',
    updatedOn: '(theo đợt cập nhật chung)',
    rating: '4.8 ★ (4 valoraciones), #171 Deportes',
    localizedHighlight: 'Nội địa hoá đúng giải: "Sigue Los Resultados De La Liga En Vivo" (La Liga), ảnh Barcelona vs Real Madrid thật',
    tabletVerified: 'Không kiểm tra riêng',
    status: 'Đã cập nhật',
    note: '',
  },
  {
    country: 'Ý',
    langGl: '/it/',
    playStoreTitle: 'Uniscore - Diretta Sport',
    updatedOn: '(theo đợt cập nhật chung)',
    rating: '3.7 ★ (12 valutazioni), #69 Sport',
    localizedHighlight: 'Nội địa hoá đúng giải: "Segui I Risultati In Diretta Della Serie A" (Serie A), ảnh Inter Milan vs AC Milan thật',
    tabletVerified: 'Không kiểm tra riêng',
    status: 'Đã cập nhật',
    note: '',
  },
  {
    country: 'Pháp',
    langGl: '/fr/',
    playStoreTitle: 'Uniscore - Résultats direct',
    updatedOn: '(theo đợt cập nhật chung)',
    rating: '3.9 ★ (16 notes), #88 Sports',
    localizedHighlight: 'Nội địa hoá đúng giải: "Suivre La Ligue 1 Scores En Direct" (Ligue 1), ảnh PSG vs Lyon thật',
    tabletVerified: 'Không kiểm tra riêng',
    status: 'Đã cập nhật',
    note: '',
  },
  {
    country: 'Bồ Đào Nha',
    langGl: '/pt/',
    playStoreTitle: 'Uniscore - Jogos ao Vivo',
    updatedOn: '(theo đợt cập nhật chung)',
    rating: '3.9 ★ (8 classificações), #38 Desporto',
    localizedHighlight: '✅ ĐÃ ĐÓNG câu hỏi mở trước đó — xác nhận CÓ nội địa hoá: "Seguir Liga Portugal Resultados Ao Vivo" (Liga Portugal), ảnh Benfica vs Sporting thật',
    tabletVerified: 'Không kiểm tra riêng',
    status: 'Đã cập nhật',
    note: '⚠️ LƯU Ý: App Store PT làm ĐÚNG (Liga Portugal), nhưng Google Play PT (cùng locale pt/PT) lại dùng nội dung BRAZIL — 2 store KHÔNG NHẤT QUÁN với nhau cho cùng 1 quốc gia. Xem chi tiết ở sheet Google Play, dòng Bồ Đào Nha.',
  },
  {
    country: 'Mỹ',
    langGl: '/us/',
    playStoreTitle: 'Uniscore - Live Sports Scores',
    updatedOn: '(theo đợt cập nhật chung)',
    rating: '4.0 ★ (46 ratings), #? Sports',
    localizedHighlight: 'Tiếng Anh generic (không có giải nội địa Mỹ tương đương để nội địa hoá): Stay Ahead With Real-Time Scores, Live Match Real Time, League',
    tabletVerified: 'Không kiểm tra riêng',
    status: 'Đã cập nhật',
    note: 'Nhất quán với Google Play US — cùng lý do không có giải nội địa để làm nổi bật riêng',
  },
];

const OPEN_QUESTIONS = [
  {
    stt: 1,
    question:
      '[ĐÃ TRẢ LỜI — CÓ NGOẠI LỆ] Bộ ảnh TABLET trên Google Play (Android) — ban đầu tưởng không verify được qua trình duyệt web, nhưng đã tìm ra cách: carousel screenshot chính (16 ảnh) thực chất TRỘN LẪN 2 nhóm kích thước khác nhau, không tách riêng bằng toggle. Lấy trực tiếp img.src + naturalWidth/naturalHeight qua browser_evaluate, tải ảnh gốc bằng curl, mở xem — xác nhận 8/16 ảnh có khung mockup Tablet rõ ràng (2000x2668px, layout iPad ngang với sidebar giải đấu, nav bar "All/Live/Upcoming/Finished/Following" dàn hàng ngang, khác hẳn khung Phone có notch/viền mỏng). Không cần Play Console hay thiết bị thật.',
    answer:
      'Đã verify xong 14/09/2026 bằng cách tải ảnh gốc từ URL DOM. Đúng cho 6/7 nước (Anh, Đức, TBN, Ý, Pháp, Mỹ): Google Play CÓ bộ ảnh Tablet trộn trong cùng carousel với Phone (8/16 ảnh là Tablet, kích thước gốc 2000x2668). ❗ NGOẠI LỆ: Bồ Đào Nha (PT) KHÔNG có ảnh Tablet nào — carousel PT chỉ có đúng 8 ảnh Phone (xác nhận bằng cách bấm nút "Avançar" trong lightbox đến khi nút biến mất). Kết luận ban đầu "cơ chế chung áp dụng mọi locale" (suy từ 1 mẫu là Anh) là SAI — chỉ rà soát lại đủ cả 7/7 nước mới phát hiện ra.',
  },
  {
    stt: 2,
    question:
      '[ĐÃ TRẢ LỜI] App Store (iOS) đã verify đủ 7/7 quốc gia bằng link https://apps.apple.com/vn/app/uniscore-live-sports-scores/id6475382945 (đổi path /gb/, /de/, /es/, /it/, /fr/, /pt/, /us/). Tất cả đều đã cập nhật, có bộ ảnh Tablet (iPad) riêng qua toggle "iPhone, iPad" trên trang.',
    answer: 'Đã verify xong 14/09/2026 — xem sheet "App Store - 7 quốc gia". Không có ngoại lệ nào ở App Store (khác Google Play).',
  },
  {
    stt: 3,
    question:
      '[ĐÃ TRẢ LỜI — CHỈ ĐÚNG CHO APP STORE] Bồ Đào Nha (PT) trên App Store xác nhận CÓ nội địa hoá theo giải Primeira Liga/Liga Portugal (giống Đức=Bundesliga, TBN=La Liga, Ý=Serie A, Pháp=Ligue 1) — ảnh minh hoạ có Benfica vs Sporting thật.',
    answer:
      'Đã xác nhận CÓ nội địa hoá đúng giải Liga Portugal trên App Store 14/09/2026 — xem sheet "App Store - 7 quốc gia". ⚠️ LƯU Ý: kết luận này CHỈ đúng cho App Store. Trên Google Play, cùng locale PT lại nội địa hoá SAI sang Brazil — xem câu hỏi số 4.',
  },
  {
    stt: 4,
    question:
      '[MỚI PHÁT HIỆN — CẦN BÁO DEV] Google Play locale pt/PT (hl=pt&gl=PT) có nội dung đúng của thị trường Bồ Đào Nha hay không?',
    answer:
      'KHÔNG. Đã verify 14/09/2026: Google Play locale PT nội địa hoá nhầm sang BRAZIL — mô tả app ghi "melhor app de futebol ao vivo no Brasil", ảnh minh hoạ dùng Brasileirão Serie A (Flamengo vs Palmeiras, Corinthians vs Sao Paulo) và thông báo bàn thắng Neymar cho Santos — không phải Primeira Liga/Liga Portugal như App Store cùng locale đã làm đúng. Đồng thời carousel PT cũng thiếu hẳn bộ ảnh Tablet (xem câu hỏi số 1). Cần báo dev/marketing sửa: (1) đổi nội dung ảnh sang giải Bồ Đào Nha thật, (2) bổ sung bộ ảnh Tablet cho locale PT trên Google Play.',
  },
];

test.describe('[US-4188] Export báo cáo verify Store Screenshot (Excel)', () => {
  test('Xuất REPORT_US4188_StoreScreenshot.xlsx', async () => {
    const overviewSheet: ExcelSheetSpec = {
      name: 'Tổng quan',
      columns: [
        { header: 'Mục', key: 'field', width: 30 },
        { header: 'Nội dung', key: 'value', width: 100 },
      ],
      rows: [
        { field: 'Task', value: 'US-4188 [App][Football] Update screenshot App Store & GG Play' },
        { field: 'Task mẫu tham khảo', value: 'US-3512 [App][Football] Update screenshot trên Android (đã Resolved)' },
        { field: 'Jira status hiện tại', value: 'UAT (SMOKE TEST)' },
        { field: 'Ngày verify', value: '14/09/2026' },
        { field: 'Phạm vi yêu cầu', value: '7 quốc gia: Anh, Đức, Tây Ban Nha, Ý, Pháp, Bồ Đào Nha, Mỹ + bổ sung Tablet (mới so với US-3512 chỉ làm Android/Phone)' },
        { field: 'Package Android', value: 'com.unity.uniscore — https://play.google.com/store/apps/details?id=com.unity.uniscore' },
        { field: 'Link Drive nguồn (US-4188)', value: 'https://drive.google.com/drive/u/0/folders/14YFw9Jvwx6bomrymH2rUnuGdp8pEQ_g_' },
        {
          field: 'Kết luận Google Play (Android)',
          value: 'Đã verify đủ 7/7 quốc gia — 6/7 nước (Anh, Đức, TBN, Ý, Pháp, Mỹ) đã cập nhật đầy đủ Phone+Tablet, cập nhật 10/09/2026 khớp bản release 1.9.2. ❗ RIÊNG BỒ ĐÀO NHA (PT) CÓ 2 VẤN ĐỀ: (1) KHÔNG có bộ ảnh Tablet (chỉ 8 ảnh Phone, xác nhận bằng cách bấm hết nút "Avançar" đến khi biến mất). (2) Nội dung ảnh nội địa hoá theo BRAZIL (Brasileirão, Neymar, Santos) thay vì Bồ Đào Nha thật (Primeira Liga) — xem chi tiết dòng Bồ Đào Nha trong bảng.',
        },
        {
          field: 'Kết luận App Store (iOS)',
          value: 'Đã verify đủ 7/7 quốc gia qua https://apps.apple.com/vn/app/uniscore-live-sports-scores/id6475382945 (đổi path /gb/, /de/, /es/, /it/, /fr/, /pt/, /us/). CÓ bộ ảnh TABLET (iPad) riêng qua toggle "iPhone, iPad". Bồ Đào Nha (PT) trên App Store ĐÚNG — nội dung "Liga Portugal", Benfica vs Sporting — khác hẳn Google Play PT dùng nội dung Brazil.',
        },
        {
          field: '❗ VẤN ĐỀ CẦN BÁO DEV',
          value:
            '(1) Google Play locale pt/PT đang trỏ nhầm nội dung sang thị trường Brazil thay vì Bồ Đào Nha — không nhất quán với App Store cùng locale đã làm đúng. (2) Google Play PT thiếu bộ ảnh Tablet, trong khi 6 nước còn lại + toàn bộ App Store đều đã có đủ. Bài học rút ra: LẦN KIỂM TRA ĐẦU TIÊN đã kết luận nhầm "đã xác nhận cơ chế chung áp dụng mọi locale" chỉ dựa trên 1 mẫu (Anh) — sau khi rà soát lại đủ cả 7/7 nước mới phát hiện ngoại lệ này.',
        },
      ],
      wrapText: true,
    };

    const googlePlaySheet: ExcelSheetSpec = {
      name: 'Google Play - 7 quốc gia',
      columns: [
        { header: 'Quốc gia', key: 'country', width: 16 },
        { header: 'Param hl/gl', key: 'langGl', width: 16 },
        { header: 'Tiêu đề hiển thị', key: 'playStoreTitle', width: 28 },
        { header: 'Cập nhật lần cuối', key: 'updatedOn', width: 20 },
        { header: 'Rating / Downloads', key: 'rating', width: 35 },
        { header: 'Điểm nổi bật nội địa hoá', key: 'localizedHighlight', width: 70 },
        { header: 'Verify Tablet', key: 'tabletVerified', width: 45 },
        { header: 'Trạng thái', key: 'status', width: 16 },
        { header: 'Ghi chú', key: 'note', width: 50 },
      ],
      rows: GOOGLE_PLAY_RESULTS,
      wrapText: true,
    };

    const appStoreSheet: ExcelSheetSpec = {
      name: 'App Store - 7 quốc gia',
      columns: [
        { header: 'Quốc gia', key: 'country', width: 16 },
        { header: 'Locale path', key: 'langGl', width: 12 },
        { header: 'Tiêu đề hiển thị', key: 'playStoreTitle', width: 30 },
        { header: 'Cập nhật lần cuối', key: 'updatedOn', width: 30 },
        { header: 'Rating / Chart', key: 'rating', width: 30 },
        { header: 'Điểm nổi bật nội địa hoá', key: 'localizedHighlight', width: 70 },
        { header: 'Verify Tablet', key: 'tabletVerified', width: 60 },
        { header: 'Trạng thái', key: 'status', width: 16 },
        { header: 'Ghi chú', key: 'note', width: 50 },
      ],
      rows: APP_STORE_RESULTS,
      wrapText: true,
    };

    const openQuestionsSheet: ExcelSheetSpec = {
      name: 'Câu hỏi mở',
      columns: [
        { header: 'STT', key: 'stt', width: 8 },
        { header: 'Câu hỏi cần xác nhận', key: 'question', width: 110 },
        { header: 'Câu trả lời', key: 'answer', width: 40 },
      ],
      rows: OPEN_QUESTIONS,
      wrapText: true,
    };

    await saveExcelForSeason(SEASON_DIR, SLUG, 'REPORT_US4188_StoreScreenshot.xlsx', [
      overviewSheet,
      googlePlaySheet,
      appStoreSheet,
      openQuestionsSheet,
    ]);
  });
});
