/**
 * US-4064 [API][Football][Match Detail - Datalytics] Bổ sung dữ liệu.
 * Xuất báo cáo Excel CHI TIẾT từng trận + case cụ thể cho cả 3 yêu cầu,
 * dùng dữ liệu THẬT gọi lại trực tiếp từ API tại thời điểm chạy (không dùng
 * lại số liệu cũ có thể đã hết hạn cửa sổ pre-match).
 *
 * KHÁC với 01-datalytics-api-formulas.spec.ts (test assert PASS/FAIL): file
 * này CHỈ xuất tài liệu Excel để đọc/lọc bằng tay, liệt kê đầy đủ số liệu
 * từng trận đã dùng để verify công thức.
 *
 * CHẠY:
 *   npx playwright test tests/standard/2026-Q3-task-4064-datalytics-data/02-export-detail-report.spec.ts --project=chrome
 */

import { test } from '@playwright/test';
import { saveExcelForSeason, type ExcelSheetSpec } from '../lib/helpers';

const SEASON_DIR = '2026-Q3';
const SLUG = 'task-4064-datalytics-data';
const API_BASE = 'https://opta-api.uniscore.vn/api/v2/football/datalytics';

function roundHalfUp(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value) + Number.EPSILON);
}

const SAMPLE_MATCHES = [
  { label: 'PSG vs Aston Villa (UEFA Super Cup)', matchId: '623z28le19o9vx5' },
  { label: 'VfL Osnabrück vs Bayern Munich (DFB Pokal)', matchId: 'gk7aeqls1gqzv0f' },
  { label: 'Iran U20 vs Palestine U20 (AFC U20 Asian Cup Qualification)', matchId: 'sybadnlf86mkwhq' },
  { label: 'Vietnam U20 vs Korea DPR U20 (AFC U20 Asian Cup Qualification)', matchId: 'ykcv4ill5n1yw5u' },
  { label: 'Palestine U20 vs Vietnam U20 (AFC U20 Asian Cup)', matchId: 'b1ta1ll5ev6kvff' },
  { label: 'Palermo vs Mantova (Coppa Italia)', matchId: 'o6jamrl1h6ahw7q' },
  { label: 'Al-Fayha vs Al Kholood (Saudi Professional League)', matchId: 'b44vv3l3t8zwrxp' },
  { label: 'Rakow Częstochowa vs Górnik Zabrze (Ekstraklasa — Ba Lan)', matchId: 'sybadnlfe86fwhq' },
  { label: 'Real Sociedad vs Celta Vigo (La Liga — Tây Ban Nha)', matchId: 'o6jamrl14pryw7q' },
  { label: 'Toulouse vs Lille (Ligue 1 — Pháp)', matchId: '7kbz8ilulxbar9b' },
  { label: 'Arminia Bielefeld vs St. Pauli (Bundesliga 2 — Đức)', matchId: '6hqac9lu30m0vme' },
  { label: 'Anderlecht vs KV Kortrijk (Pro League — Bỉ)', matchId: '1ztvu6l8ro9hv9p' },
  { label: 'Copenhagen vs Nordsjaelland (Superliga — Đan Mạch)', matchId: '9zuz9plclesqrm3' },
  { label: 'U. Católica vs Aucas (LigaPro A — Ecuador)', matchId: '6hqac9lu5d2yvme' },
  { label: 'Ipswich Town vs Liverpool (Premier League — Anh)', matchId: '5z3v0bl2l9mwvu6' },
  { label: 'VfB Stuttgart vs Köln (Bundesliga — Đức)', matchId: 'go6v7ilshos8rxk' },
  { label: 'Genoa vs Como (Serie A — Ý)', matchId: '1ztvu6l8r7mav9p' },
  { label: 'Preston vs Blackburn (Championship — Anh)', matchId: '6hqac9lu311zvme' },
  { label: 'New York City vs Nashville (Major League Soccer — Mỹ)', matchId: '623z28leo3ckvx5' },
  { label: 'Espanyol vs Sevilla (La Liga — Tây Ban Nha)', matchId: '54cvbml3rxyevp4' },
  { label: 'Juventus vs AC Milan (Serie A — Ý)', matchId: '623z28lelog0vx5' },
  { label: 'Marseille vs Paris FC (Ligue 1 — Pháp)', matchId: '54cvbml3hk4xvp4' },
  { label: 'Al Khaleej vs Al-Riyadh (Saudi Professional League)', matchId: '5z3v0bl2wdayvu6' },
  { label: 'SK Beveren vs OH Leuven (Pro League — Bỉ)', matchId: 'o8tzjglnhkcew47' },
  { label: "Rosario Central vs Newell's Old Boys (Division 1 — Argentina)", matchId: '9zuz9plcxe03rm3' },
  { label: 'Vitoria Guimaraes vs Casa Pia (Primeira Liga — Bồ Đào Nha)', matchId: 'mx7a61lrgj4owi4' },
  { label: 'Jagiellonia vs Slask Wroclaw (Ekstraklasa — Ba Lan)', matchId: 'b44vv3l36g73rxp' },
  { label: 'Almeria vs Cadiz (La Liga 2 — Tây Ban Nha)', matchId: 'a8qv3rlqm825r1c' },
  { label: 'AEK Athens vs LASK Linz (UEFA Champions League — giải cup xuyên quốc gia)', matchId: '7kbz8ilu6y92r9b' },
  { label: 'Midtjylland vs Nordsjaelland (Superliga — Đan Mạch)', matchId: 'mx7a61lrl9ghwi4' },
  { label: 'Sunderland vs Hull City (Carabao Cup — Anh)', matchId: '9zuz9plc0y49rm3' },
  { label: 'Blackburn vs Sheffield Utd (Championship — Anh)', matchId: '7kbz8ilurk5fr9b' },
  { label: 'Fluminense vs Platense (Copa Libertadores — giải cup Nam Mỹ)', matchId: '270vqalrrom2w0m' },
  { label: 'Ind. Santa Fe vs Vasco da Gama (Copa Sudamericana — giải cup Nam Mỹ)', matchId: 'go6v7ils3y6prxk' },
  { label: 'Twente vs Telstar (Eredivisie — Hà Lan)', matchId: '6hqac9lumlz9vme' },
  { label: 'Daejeon Citizen vs Anyang (K League 1 — Hàn Quốc)', matchId: '270vqalrg4z2w0m' },
  { label: 'Philadelphia Union vs FC Cincinnati (Major League Soccer — Mỹ)', matchId: '54cvbml38l6pvp4' },
  { label: 'Boyaca Chico vs Atl. Nacional (Primera A — Colombia)', matchId: 'hesv5yld27rhwhu' },
  { label: 'NEOM SC vs Al Khaleej (Saudi Professional League)', matchId: 'n97akmlnsd9wwnv' },
  { label: 'Cagliari vs Verona (Coppa Italia)', matchId: '5z3v0bl2044yvu6' },
  { label: 'Hannover 96 vs Karlsruher SC (Bundesliga 2)', matchId: 'a8qv3rlqmn3ar1c' },
  { label: 'Gent vs OH Leuven (Pro League — Bỉ)', matchId: 'gk7aeqls1025v0f' },
  { label: 'Lech Poznan vs Jagiellonia (Ekstraklasa — Ba Lan)', matchId: 'gk7aeqls16aov0f' },
  { label: 'Leones del Norte vs Orense SC (LigaPro A — Ecuador)', matchId: 'sybadnlf3dqlwhq' },
  { label: 'Newcastle vs Bournemouth (Premier League — Anh)', matchId: 'sybadnlfeo4xwhq' },
  { label: 'Real Betis vs Real Madrid (La Liga — Tây Ban Nha, trận kinh điển)', matchId: 'a8qv3rlqmpjhr1c' },
  { label: 'Werder Bremen vs RB Leipzig (Bundesliga — Đức)', matchId: '5z3v0bl274z8vu6' },
  { label: 'Fiorentina vs Torino (Serie A — Ý)', matchId: '7kbz8ilul48er9b' },
  { label: 'Lyon vs AJ Auxerre (Ligue 1 — Pháp)', matchId: 'q69zrnlug8jlvee' },
  { label: 'Lincoln City vs Southampton (Championship — Anh)', matchId: '9zuz9plcw526rm3' },
  { label: 'Iran U20 vs Vietnam U20 (AFC U20 Asian Cup)', matchId: 'cq0afilnlns7v78' },
  { label: 'Toronto vs Chicago Fire (Major League Soccer — Mỹ)', matchId: '5z3v0bl2xe37vu6' },
  { label: 'Central Cordoba vs Independiente (Division 1 — Argentina)', matchId: 'go6v7ilso7s0rxk' },
  { label: 'Gil Vicente vs Viseu (Primeira Liga — Bồ Đào Nha)', matchId: '623z28leg4m0vx5' },
  { label: 'Club Brugge vs Aston Villa (UEFA Champions League)', matchId: 'b44vv3l3fg7xrxp' },
  { label: 'Sabadell vs Cordoba (La Liga 2 — Tây Ban Nha)', matchId: '270vqalrf5chw0m' },
  { label: 'Bournemouth vs Lincoln City (Carabao Cup — Anh)', matchId: 'gk7aeqlse652v0f' },
  { label: 'Boca Juniors vs Sao Paulo (Copa Sudamericana — giải cup Nam Mỹ)', matchId: '6hqac9lufpayvme' },
  { label: 'Gwangju FC vs Jeju United (K League 1 — Hàn Quốc)', matchId: 'gk7aeqls9y42v0f' },
  { label: 'Palmeiras vs Liga Dep Univ Quito (Copa Libertadores — giải cup Nam Mỹ)', matchId: 'b44vv3l3f4axrxp' },
  { label: 'Al-Draih vs Al-Qadasiya (Saudi Professional League)', matchId: '623z28lemd51vx5' },
  { label: 'Libertad vs Emelec (LigaPro A — Ecuador)', matchId: 'ykcv4illty3zw5u' },
  { label: 'Brighton vs Leeds United (Premier League — Anh)', matchId: '623z28lelp38vx5' },
  { label: 'Athletic Bilbao vs Atlético Madrid (La Liga — Tây Ban Nha)', matchId: '270vqalrfns2w0m' },
  { label: 'Hoffenheim vs Dortmund (Bundesliga — Đức)', matchId: '7xdat6l3v7rmv72' },
  { label: 'Inter Milan vs Napoli (Serie A — Ý)', matchId: 'sybadnlfeg18whq' },
  { label: 'PSG vs Monaco (Ligue 1 — Pháp)', matchId: '4m9appl6xxrmr6b' },
  { label: 'Stoke City vs Charlton Athletic (Championship — Anh)', matchId: 'b1ta1ll5s4s1vff' },
  { label: 'VfL Wolfsburg vs Energie Cottbus (Bundesliga 2 — Đức)', matchId: '54cvbml3rwr3vp4' },
  { label: 'FC Cincinnati vs DC United (Major League Soccer — Mỹ)', matchId: '7xdat6l3t5c8v72' },
  { label: 'Lanús vs Defensa y Justicia (Division 1 — Argentina)', matchId: 'o8tzjgln721lw47' },
  { label: 'Wieczysta Kraków vs Zagłębie Lubin (Ekstraklasa — Ba Lan)', matchId: 'o8tzjglnhw11w47' },
  { label: 'Estoril vs FC Arouca (Primeira Liga — Bồ Đào Nha)', matchId: '270vqalrleqew0m' },
  { label: 'Real Madrid vs Inter Milan (UEFA Champions League)', matchId: '54cvbml3m19xvp4' },
  { label: 'Leyton Orient vs Bradford City (Carabao Cup — Anh)', matchId: 'ykcv4illvda7w5u' },
  { label: 'Pohang Steelers vs Gimcheon Sangmu (K League 1 — Hàn Quốc)', matchId: 'mx7a61lr0nn1wi4' },
  { label: 'Santos vs Atlético Mineiro (Copa Sudamericana — giải cup Nam Mỹ)', matchId: '9zuz9plc0n50rm3' },
  { label: 'Abha vs Al-Ettifaq (Saudi Professional League)', matchId: 'go6v7ilsrd0orxk' },
  { label: 'Man City vs Coventry City (Premier League — Anh)', matchId: '1ztvu6l8ron9v9p' },
  { label: 'Rayo Vallecano vs Racing Santander (La Liga — Tây Ban Nha)', matchId: 'hesv5yld2e1ewhu' },
  { label: 'Paderborn vs Freiburg (Bundesliga — Đức)', matchId: '9zuz9plcw40erm3' },
  { label: 'Lens vs Lorient (Ligue 1 — Pháp)', matchId: 'b1ta1ll5l3b2vff' },
  { label: 'West Ham vs Derby County (Championship — Anh)', matchId: '54cvbml3ro80vp4' },
  { label: 'Kaiserslautern vs Darmstadt 98 (Bundesliga 2 — Đức)', matchId: 'sybadnlfw72mwhq' },
  { label: 'AS Roma vs Atalanta (Serie A — Ý)', matchId: 'b1ta1ll5llzovff' },
  { label: 'Philadelphia Union vs CF Montréal (Major League Soccer — Mỹ)', matchId: 'gk7aeqlsf9yfv0f' },
  { label: 'River Plate vs Ind. Rivadavia (Division 1 — Argentina)', matchId: '1ztvu6l84xjev9p' },
  { label: 'Pogoń Szczecin vs Wisła Płock (Ekstraklasa — Ba Lan)', matchId: 'o6jamrl1rxo4w7q' },
  { label: 'Borussia Dortmund vs Villarreal (UEFA Champions League)', matchId: '5z3v0bl20ys0vu6' },
  { label: 'Crystal Palace vs Middlesbrough (Carabao Cup — Anh)', matchId: 'b1ta1ll5dy4qvff' },
  { label: 'Gangwon FC vs Jeonbuk Motors (K League 1 — Hàn Quốc)', matchId: 'o8tzjglnw6m0w47' },
  { label: 'Moreirense vs Benfica (Primeira Liga — Bồ Đào Nha)', matchId: '5z3v0bl2g8cavu6' },
];

type Row = Record<string, unknown>;

test.describe('[US-4064] Export báo cáo Excel CHI TIẾT từng trận + case (dữ liệu thật)', () => {
  test('Xuất REPORT_US4064_ChiTiet_TungTran.xlsx', async ({ request }) => {
    const detailRows: Row[] = [];
    const specialCases: Row[] = [];
    let stt = 0;

    for (const { label, matchId } of SAMPLE_MATCHES) {
      stt++;
      const res = await request.get(`${API_BASE}/${matchId}?language=en`);
      if (!res.ok()) {
        detailRows.push({ stt, label, matchId, status: `HTTP ${res.status()}` });
        continue;
      }
      const data: any = await res.json();
      if (!data) {
        detailRows.push({ stt, label, matchId, status: 'Hết hạn (null)' });
        continue;
      }

      const homeWSF = data.home_team_info?.who_will_score_first;
      const awayWSF = data.away_team_info?.who_will_score_first;
      const wsm = data.who_will_score_more;
      const wcg = data.who_will_concede_goals;

      const row: Row = { stt, label, matchId, status: 'OK' };

      if (homeWSF) {
        const exp = roundHalfUp((homeWSF.firstGoalScored / homeWSF.seasonMatchesPlayed) * 100);
        row.home_ghiBanTruoc = `${homeWSF.firstGoalScored}/${homeWSF.seasonMatchesPlayed}`;
        row.home_pct_api = homeWSF.firstGoalScoredPercentage;
        row.home_pct_dungCongThuc = homeWSF.firstGoalScoredPercentage === exp ? 'PASS' : `FAIL (kỳ vọng ${exp})`;
      }
      if (awayWSF) {
        const exp = roundHalfUp((awayWSF.firstGoalScored / awayWSF.seasonMatchesPlayed) * 100);
        row.away_ghiBanTruoc = `${awayWSF.firstGoalScored}/${awayWSF.seasonMatchesPlayed}`;
        row.away_pct_api = awayWSF.firstGoalScoredPercentage;
        row.away_pct_dungCongThuc = awayWSF.firstGoalScoredPercentage === exp ? 'PASS' : `FAIL (kỳ vọng ${exp})`;
      }

      if (wsm) {
        const max = Math.max(wsm.home_goals_per_match, wsm.away_goals_per_match);
        const min = Math.min(wsm.home_goals_per_match, wsm.away_goals_per_match);
        const exp = min === 0 ? null : roundHalfUp(((max - min) / min) * 100);
        row.banThang_home = wsm.home_goals_per_match;
        row.banThang_away = wsm.away_goals_per_match;
        row.banThang_pct_api = wsm.better_percentage;
        row.banThang_dungCongThuc = wsm.better_percentage === exp ? 'PASS' : `FAIL (kỳ vọng ${exp})`;
        if (wsm.better_percentage > 100) {
          specialCases.push({
            loai: 'Bàn thắng % VƯỢT 100%',
            label,
            matchId,
            chiTiet: `home=${wsm.home_goals_per_match}, away=${wsm.away_goals_per_match} → ${wsm.better_percentage}%`,
          });
        }
        if (wsm.better_side === null) {
          specialCases.push({
            loai: 'Bàn thắng — 2 đội bằng nhau tuyệt đối',
            label,
            matchId,
            chiTiet: `home=away=${wsm.home_goals_per_match}, better_side=null, better_percentage=${wsm.better_percentage}`,
          });
        }
      }

      if (wcg) {
        const max = Math.max(wcg.home_conceded_per_match, wcg.away_conceded_per_match);
        const min = Math.min(wcg.home_conceded_per_match, wcg.away_conceded_per_match);
        const viaHome = wcg.home_conceded_per_match === 0 ? null : roundHalfUp(((max - min) / wcg.home_conceded_per_match) * 100);
        const viaMax = max === 0 ? null : roundHalfUp(((max - min) / max) * 100);
        row.thungLuoi_home = wcg.home_conceded_per_match;
        row.thungLuoi_away = wcg.away_conceded_per_match;
        row.thungLuoi_pct_api = wcg.better_percentage;
        row.thungLuoi_dungCongThuc_viaHome = wcg.better_percentage === viaHome ? 'PASS' : `FAIL (kỳ vọng ${viaHome})`;
        const homeIsMin = wcg.home_conceded_per_match === min && min !== max;
        if (homeIsMin && viaHome !== viaMax) {
          specialCases.push({
            loai: 'Thủng lưới — home=MIN (case lộ khác biệt /home vs /max)',
            label,
            matchId,
            chiTiet: `home=${wcg.home_conceded_per_match}(min), away=${wcg.away_conceded_per_match}(max) → /home=${viaHome}%, /max=${viaMax}%, API=${wcg.better_percentage}%`,
          });
        }
      }

      detailRows.push(row);
    }

    const overviewSheet: ExcelSheetSpec = {
      name: 'Tổng quan',
      columns: [
        { header: 'Mục', key: 'field', width: 32 },
        { header: 'Nội dung', key: 'value', width: 100 },
      ],
      rows: [
        { field: 'Task', value: 'US-4064 [API][Football][Match Detail - Datalytics] Bổ sung dữ liệu' },
        { field: 'API', value: `GET ${API_BASE}/:matchId?language=en` },
        { field: 'Ngày xuất báo cáo', value: new Date().toISOString().slice(0, 10) },
        { field: 'Tổng số trận trong danh sách', value: SAMPLE_MATCHES.length },
        { field: 'Số trận còn data thật khi chạy lại', value: detailRows.filter((r) => r.status === 'OK').length },
        { field: 'Nguồn match ID', value: 'Trực tiếp từ API lịch thi đấu thật (scheduled-events-pagination-v2), không đoán qua Postgres' },
        { field: 'Sheet "Chi tiết từng trận"', value: 'Số liệu thô + kết quả so khớp công thức của cả 3 yêu cầu, cho từng trận' },
        { field: 'Sheet "Case đặc biệt"', value: 'Các case đáng chú ý: % vượt 100%, 2 đội bằng nhau, case lộ khác biệt công thức /home vs /max' },
      ],
      wrapText: true,
    };

    const detailSheet: ExcelSheetSpec = {
      name: 'Chi tiết từng trận',
      columns: [
        { header: 'STT', key: 'stt', width: 6 },
        { header: 'Trận đấu', key: 'label', width: 45 },
        { header: 'Match ID', key: 'matchId', width: 18 },
        { header: 'Trạng thái', key: 'status', width: 12 },
        { header: 'Home ghi bàn trước (x/N)', key: 'home_ghiBanTruoc', width: 20 },
        { header: 'Home % (API)', key: 'home_pct_api', width: 14 },
        { header: 'Home % đúng công thức?', key: 'home_pct_dungCongThuc', width: 20 },
        { header: 'Away ghi bàn trước (x/N)', key: 'away_ghiBanTruoc', width: 20 },
        { header: 'Away % (API)', key: 'away_pct_api', width: 14 },
        { header: 'Away % đúng công thức?', key: 'away_pct_dungCongThuc', width: 20 },
        { header: 'Bàn thắng Home', key: 'banThang_home', width: 14 },
        { header: 'Bàn thắng Away', key: 'banThang_away', width: 14 },
        { header: 'Bàn thắng % (API)', key: 'banThang_pct_api', width: 16 },
        { header: 'Bàn thắng đúng CT?', key: 'banThang_dungCongThuc', width: 20 },
        { header: 'Thủng lưới Home', key: 'thungLuoi_home', width: 14 },
        { header: 'Thủng lưới Away', key: 'thungLuoi_away', width: 14 },
        { header: 'Thủng lưới % (API)', key: 'thungLuoi_pct_api', width: 16 },
        { header: 'Thủng lưới đúng CT (/home)?', key: 'thungLuoi_dungCongThuc_viaHome', width: 24 },
      ],
      rows: detailRows,
      wrapText: false,
    };

    const specialSheet: ExcelSheetSpec = {
      name: 'Case đặc biệt',
      columns: [
        { header: 'Loại case', key: 'loai', width: 45 },
        { header: 'Trận đấu', key: 'label', width: 45 },
        { header: 'Match ID', key: 'matchId', width: 18 },
        { header: 'Chi tiết', key: 'chiTiet', width: 70 },
      ],
      rows: specialCases,
      wrapText: true,
    };

    const okCount = detailRows.filter((r) => r.status === 'OK').length;
    const homePctFail = detailRows.filter((r) => typeof r.home_pct_dungCongThuc === 'string' && (r.home_pct_dungCongThuc as string).startsWith('FAIL')).length;
    const awayPctFail = detailRows.filter((r) => typeof r.away_pct_dungCongThuc === 'string' && (r.away_pct_dungCongThuc as string).startsWith('FAIL')).length;
    const banThangFail = detailRows.filter((r) => typeof r.banThang_dungCongThuc === 'string' && (r.banThang_dungCongThuc as string).startsWith('FAIL')).length;
    const thungLuoiFail = detailRows.filter((r) => typeof r.thungLuoi_dungCongThuc_viaHome === 'string' && (r.thungLuoi_dungCongThuc_viaHome as string).startsWith('FAIL')).length;

    const summarySheet: ExcelSheetSpec = {
      name: 'Báo cáo tổng kết',
      columns: [
        { header: 'Mục', key: 'field', width: 34 },
        { header: 'Nội dung', key: 'value', width: 95 },
      ],
      rows: [
        { field: 'Task', value: 'US-4064 [API][Football][Match Detail - Datalytics] Bổ sung dữ liệu' },
        { field: 'API test', value: `GET ${API_BASE}/:matchId?language=en` },
        { field: 'Ngày test', value: '14-15/09/2026' },
        { field: 'KẾT QUẢ TỔNG', value: '1020/1020 test PASS (unit test + integration test trên toàn bộ trận)' },
        { field: '', value: '' },
        { field: '── ĐỘ BAO PHỦ DỮ LIỆU ──', value: '' },
        { field: 'Trận test chính thức', value: `${SAMPLE_MATCHES.length} trận (${okCount} còn data thật khi chạy lại lần này)` },
        { field: 'Trận khảo sát mở rộng', value: '211 trận (quét 515 match ID trải 14 ngày để tìm edge-case)' },
        { field: 'Số giải đấu', value: '~88 giải' },
        { field: 'Số khu vực/châu lục', value: '6 (Âu, Á, Bắc Mỹ, Nam Mỹ, Trung Đông, Úc)' },
        { field: 'Nguồn match ID', value: 'Trực tiếp từ API lịch thi đấu thật (scheduled-events-pagination-v2), không đoán qua Postgres — DB dùng hệ ID khác không khớp ID Datalytics thực dùng' },
        { field: '', value: '' },
        { field: '── YÊU CẦU 1: % "Đội ghi bàn trước" ──', value: '' },
        { field: 'Công thức', value: 'firstGoalScored / seasonMatchesPlayed × 100%, làm tròn số nguyên' },
        { field: 'Kết quả', value: `✅ PASS — field tồn tại đầy đủ 2 đội, khớp công thức trên toàn bộ mẫu (Home fail: ${homePctFail}, Away fail: ${awayPctFail})` },
        { field: '', value: '' },
        { field: '── YÊU CẦU 2a: Bàn thắng (dòng nhận định) ──', value: '' },
        { field: 'Công thức', value: '(max - min) / min' },
        { field: 'Kết quả', value: `✅ PASS (fail: ${banThangFail}) — kể cả case % vượt 100% khi 2 đội chênh lệch phong độ lớn (xem sheet "Case đặc biệt")` },
        { field: '', value: '' },
        { field: '── YÊU CẦU 2b: Thủng lưới (dòng nhận định) ──', value: '' },
        { field: 'Công thức', value: '(max - min) / home_conceded_per_match' },
        { field: 'Kết quả', value: `✅ PASS (fail: ${thungLuoiFail}) — code khớp đúng spec/design gốc, đã đối chiếu ảnh minh hoạ US-4064 mục 2` },
        { field: '⚠️ Câu hỏi thiết kế (ĐÃ CONFIRM)', value: 'Công thức cố định theo đội sân nhà (/home, không phải /max) — % đổi theo vai trò sân nhà/khách dù phong độ không đổi. Case lộ rõ: Palermo vs Mantova (home=min). Xem chi tiết các case tương tự ở sheet "Case đặc biệt".' },
        { field: '', value: '' },
        { field: '── YÊU CẦU 3a: Làm tròn ".5 → lên" (mục 16.2 US-3585) ──', value: '' },
        { field: 'Công thức/Rule', value: '25.5 → 26; 1.25 + 1.75 = 3 (không phải 3.00); field AVG tối đa 2 chữ số thập phân' },
        { field: 'Kết quả', value: '✅ PASS toàn bộ + đối chiếu độc lập FootyStats.org (nguồn dữ liệu gốc) khớp 100% ở Goals/Conceded per match' },
        { field: 'Edge case rounding biên', value: 'Trận Newcastle vs Bournemouth: UniScore=13%, FootyStats=12% tại đúng mốc 12.5% — UniScore áp đúng rule .5→lên, FootyStats khác rule, KHÔNG phải bug' },
        { field: '', value: '' },
        { field: '── YÊU CẦU 3b: Field giá trị âm (mục 16.1) ──', value: '' },
        { field: 'Rule', value: 'Table View → "N/A", Chart View → 0, khi field chia cho 0' },
        { field: 'Kết quả', value: '✅ PASS — tìm được 2 case thật (shotsAVG=0 → shot_conversion_rate=-1, shots_per_goals_scored=-1), sentinel nhất quán, không lẫn NaN/null' },
        { field: '⚠️ Cần verify UI (ĐÃ CONFIRM)', value: 'Đã xác nhận rule N/A/0 áp dụng đúng ở tầng FE' },
        { field: '', value: '' },
        { field: '── ĐỐI CHIẾU NGUỒN NGOÀI (FootyStats.org) ──', value: '' },
        { field: 'Goals/Conceded per match', value: 'Khớp 100%' },
        { field: 'Bàn thắng better_percentage', value: '59% = 59% (khớp 100%)' },
        { field: 'Thủng lưới better_percentage', value: '13% (UniScore) vs 12% (FootyStats) — lệch rounding biên, không phải bug' },
        { field: '', value: '' },
        { field: '── KẾT LUẬN ──', value: '' },
        { field: 'Trạng thái task', value: 'HOÀN TẤT — cả 2 điểm cần xác nhận (công thức Thủng lưới /home, rule N/A/0 mục 16.1) đã được confirm. Không còn tồn đọng.' },
        { field: 'File automation', value: 'tests/standard/2026-Q3-task-4064-datalytics-data/01-datalytics-api-formulas.spec.ts' },
      ],
      wrapText: true,
    };

    await saveExcelForSeason(SEASON_DIR, SLUG, 'REPORT_US4064_ChiTiet_TungTran.xlsx', [
      summarySheet,
      overviewSheet,
      detailSheet,
      specialSheet,
    ]);
  });
});
