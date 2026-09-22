// Coach lấy 2 mẫu/loại giải, phủ 7 LOẠI GIẢI ĐẤU khác nhau (World Cup,
// Champions League, Việt Nam, Cúp quốc gia, giải nữ, giải trẻ, giải quốc nội
// lớn) — quét 8000 trận trong cửa sổ ±90/60 ngày, lọc theo tournament.name/
// category.name từ GET /football/event/{id}, lấy coach có data /lineups.
export type TournamentTypeCoach = { tournamentType: string; coachName: string; refId: string; matchLabel: string; tournamentName: string; categoryName: string; encodedMatchId: string };

export const TOURNAMENT_TYPE_COACHES: TournamentTypeCoach[] = [
  { tournamentType: 'World Cup', coachName: 'Thomas Christiansen', refId: '87dyw5ro8d2ni6u', matchLabel: 'Panama vs Croatia', tournamentName: 'World Cup Group L', categoryName: 'International', encodedMatchId: '7kbz8ilu75m5r9b' },
  { tournamentType: 'World Cup', coachName: 'Néstor Lorenzo', refId: 's5ofw4koev3n5ek', matchLabel: 'Colombia vs Portugal', tournamentName: 'World Cup Group K', categoryName: 'International', encodedMatchId: 'o8tzjgln1922w47' },
  { tournamentType: 'Champions League (UEFA/AFC/CAF/CONCACAF)', coachName: 'Max Canzi', refId: '2wogs0ko8wss1xj', matchLabel: 'Juventus (W) vs SCU Torreense (W)', tournamentName: 'Women Champions League', categoryName: 'Europe', encodedMatchId: '4m9appl6wv7or6b' },
  { tournamentType: 'Champions League (UEFA/AFC/CAF/CONCACAF)', coachName: 'Zekirija Ramadani', refId: '2l31xgoo9j3sjyf', matchLabel: 'Drita vs Kauno Zalgiris', tournamentName: 'UEFA Champions League', categoryName: 'Europe', encodedMatchId: 'sybadnlfelozwhq' },
  { tournamentType: 'Việt Nam (V-League/giải VN)', coachName: 'Dinh Nghiem Chu', refId: '7au4xbkoxncr31c', matchLabel: 'Ninh Binh vs Viettel', tournamentName: 'National Cup', categoryName: 'Vietnam', encodedMatchId: '5z3v0bl2d28yvu6' },
  { tournamentType: 'Việt Nam (V-League/giải VN)', coachName: 'Sy Son Van', refId: '7kbz8il12gbn5ek', matchLabel: 'Song Lam Nghe An vs PVF CAND', tournamentName: 'V.League 1', categoryName: 'Vietnam', encodedMatchId: 'sybadnlfgw78whq' },
  { tournamentType: 'Cúp quốc gia (National Cup/FA Cup)', coachName: 'Hu Wei', refId: 'o8tzjgl96lms006', matchLabel: 'Rizhao Yuqi FC vs Binzhou Huilong', tournamentName: 'FA Cup', categoryName: 'China', encodedMatchId: 'a8qv3rlqmgckr1c' },
  { tournamentType: 'Cúp quốc gia (National Cup/FA Cup)', coachName: 'Stefan Laird', refId: 'b44vv3l6g19ntsd', matchLabel: 'Elgin City vs Peterhead', tournamentName: 'Scottish League Cup Group H', categoryName: 'Scotland', encodedMatchId: 'o6jamrl1re5fw7q' },
  { tournamentType: 'Giải nữ (Women)', coachName: 'Yu Yun', refId: 'y3d7s6do355rq93', matchLabel: 'Beijing Beikong (W) vs Shanghai RCB (W)', tournamentName: 'Women"s Super League', categoryName: 'China', encodedMatchId: '4m9appl6ov5mr6b' },
  { tournamentType: 'Giải nữ (Women)', coachName: 'Jonas Eidevall', refId: '6hqac9l84g9rihp', matchLabel: 'San Diego Wave (W) vs Utah Royals (W)', tournamentName: 'Women League', categoryName: 'United States', encodedMatchId: 'q69zrnlu2kz6vee' },
  { tournamentType: 'Giải trẻ (U19/U20/U21/U23/Youth)', coachName: 'Dennis Baraznowski', refId: '270vqal4ve0s6pk', matchLabel: 'Bristol City U21 vs Wigan Athletic U21', tournamentName: 'U21 League 2', categoryName: 'England', encodedMatchId: 'sybadnlfswhhwhq' },
  { tournamentType: 'Giải trẻ (U19/U20/U21/U23/Youth)', coachName: 'Nikola Popovic', refId: '1z88sr5om53ntsd', matchLabel: 'Famalicao U23 vs Felgueiras U23', tournamentName: 'U23 League', categoryName: 'Portugal', encodedMatchId: 'hesv5yld10m5whu' },
  { tournamentType: 'Giải quốc nội lớn (Premier League/La Liga/Serie A/Bundesliga/Ligue 1)', coachName: 'Tulipa', refId: 'neo1xasowxyr6iv', matchLabel: 'Ararat-Armenia vs Gandzasar Kapan', tournamentName: 'Premier League', categoryName: 'Armenia', encodedMatchId: 'cq0afilnldjwv78' },
  { tournamentType: 'Giải quốc nội lớn (Premier League/La Liga/Serie A/Bundesliga/Ligue 1)', coachName: 'Daniel Portela', refId: '623z28l103crt8p', matchLabel: 'Floriana vs Sliema Wanderers', tournamentName: 'Premier League', categoryName: 'Malta', encodedMatchId: 'b1ta1ll5gxcfvff' },
];
