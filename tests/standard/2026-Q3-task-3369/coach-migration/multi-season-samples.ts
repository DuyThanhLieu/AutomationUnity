// Coach ref_id lấy 1-2 trận/mùa giải, phủ 7/8 mùa giải thật có trong hệ
// thống (2023/2024, 2024, 2024/2025, 2025, 2025/2026, 2026, 2026/2027, 2027 —
// mùa "2023/2024" quét 6 mapped candidate nhưng KHÔNG tìm được coach nào có
// data lineup, có thể do trận quá cũ đã bị dọn dữ liệu chi tiết). Đa dạng
// competition_id/khu vực: Malaysia, Singapore, Scotland, Netherlands,
// Georgia, Uruguay, Korea, Thailand, Turkey, Brazil, Venezuela, Switzerland,
// Hong Kong, Laos.
export type SeasonCoachSample = { season: string; competitionId: number; coachName: string; refId: string; matchLabel: string; encodedMatchId: string };

export const MULTI_SEASON_COACHES: SeasonCoachSample[] = [
  { season: '2024', competitionId: 11438, coachName: 'Fandi Ahmad', refId: '2wogs0kom8rs1xj', matchLabel: 'Pahang vs Terengganu', encodedMatchId: '7kbz8illg900r9b' },
  { season: '2024', competitionId: 11495, coachName: 'Noh Alam Shah', refId: 's4luxy1ovyjrihp', matchLabel: 'Tanjong Pagar vs Tampines Rovers', encodedMatchId: 'n97akmldf9rhwnv' },
  { season: '2024/2025', competitionId: 12456, coachName: 'Scott Brown', refId: '2wogs0ko9v4s1xj', matchLabel: 'Ayr United vs Falkirk', encodedMatchId: 'mx7a61l9s12kwi4' },
  { season: '2024/2025', competitionId: 12799, coachName: 'Thomas Duivenvoorden', refId: 'c9dxsq8oe6or5s2', matchLabel: 'Quick Boys vs Heerenveen', encodedMatchId: 'ykcv4ils9p11w5u' },
  { season: '2025', competitionId: 14126, coachName: 'Giorgi Chiabrishvili', refId: 'ym2xwfiofvjs006', matchLabel: 'Dinamo Batumi vs Torpedo Kutaisi', encodedMatchId: 'go6v7il94k4mrxk' },
  { season: '2025', competitionId: 14128, coachName: 'Alejandro Apud', refId: 'nkb1x23oeo6se70', matchLabel: 'Danubio vs Liverpool FC Montevideo', encodedMatchId: '6hqac9l4d63kvme' },
  { season: '2025/2026', competitionId: 15679, coachName: 'Tae-ha Park', refId: 'bm0nxito7k5s3t6', matchLabel: 'Pohang Steelers vs Bangkok Glass', encodedMatchId: 'o8tzjgln99cfw47' },
  { season: '2025/2026', competitionId: 14972, coachName: 'Thomas Reis', refId: 'no03wnpo1oyrah5', matchLabel: 'Samsunspor vs Alanyaspor', encodedMatchId: '9zuz9plchy5zrm3' },
  { season: '2026', competitionId: 16783, coachName: 'Cláudio Tencati', refId: 's5ofw4komwsn5ek', matchLabel: 'Botafogo SP vs Criciúma', encodedMatchId: 'o8tzjglno4oqw47' },
  { season: '2026', competitionId: 16617, coachName: 'Daniel Farías', refId: 's4luxy1orgsrihp', matchLabel: 'Carabobo vs Academia Puerto Cabello', encodedMatchId: '54cvbml36924vp4' },
  { season: '2026/2027', competitionId: 17063, coachName: 'Chris Aitken', refId: 'go6v7il19xzntnv', matchLabel: 'Stranraer vs Ayr United', encodedMatchId: '54cvbml3hkjavp4' },
  { season: '2026/2027', competitionId: 17308, coachName: 'Jeff Saibene', refId: 'jqcfxzpo9z8sdt6', matchLabel: 'Servette II vs Echallens', encodedMatchId: '5z3v0bl27v29vu6' },
  { season: '2027', competitionId: 11943, coachName: 'Tsutomu Ogura', refId: '2l31xgootjmsjyf', matchLabel: 'Singapore vs Hong Kong', encodedMatchId: 'o8tzjglveg93w47' },
  { season: '2027', competitionId: 11943, coachName: 'Peter Cklamovski', refId: 'ym2xwfior61s006', matchLabel: 'Malaysia vs Laos', encodedMatchId: 'a8qv3rlggjrer1c' },
];
