/**
 * TEST FILE: check_team_shirt_image_vs_cdn.spec.ts
 *
 * MỤC ĐÍCH: So sánh PIXEL THẬT giữa ảnh design gốc (design team cung cấp,
 * tải về local từ Google Drive) và ảnh đang serve tại link CDN trong DB
 * (bảng team_shirt, cột team_shirt_link) — để phát hiện trường hợp CDN
 * đang serve SAI ảnh (khác thiết kế gốc), không chỉ là "có link hay không".
 *
 * KHÁC VỚI check_US[1311]_staging.spec.ts: file đó chỉ verify team_id đúng
 * team, và teamShirtLink/color/numberStyle mà API /lineups trả về có khớp
 * DB không (so METADATA). File NÀY so trực tiếp NỘI DUNG ẢNH (pixel) — bổ
 * sung, không thay thế.
 *
 * CƠ CHẾ:
 *   - Link CDN cố định dạng: assets.uniscore.com/team-shirt/{team_id}/{home|away}.webp
 *     -> tải trực tiếp từ DB, KHÔNG cần qua API match/encode.
 *   - File design tên dạng: {team_id}_{TeamName}_{Home|Away}[-n].png, nằm
 *     trong các file .zip theo giải đấu tại DESIGN_DIR (xem cấu hình dưới).
 *   - Máy không có ImageMagick/sharp -> dùng `sips` (built-in macOS) để
 *     resize cả 2 ảnh về cùng kích thước (128x128, bóp méo tỷ lệ nhưng áp
 *     dụng như nhau cho cả 2 nên không ảnh hưởng so sánh) rồi convert sang
 *     BMP (không nén, dễ đọc thô bằng Node thuần, không cần thư viện ảnh).
 *   - Tính meanAbsDiff = trung bình |chênh lệch| từng kênh R,G,B trên toàn
 *     bộ pixel. Ảnh giống hệt (chỉ khác nén/format) → ~0-5. Ảnh khác hẳn
 *     (verified bằng cách so 2 áo khác nhau) → ~60+. Ngưỡng MISMATCH_THRESHOLD
 *     chọn 20 để có biên an toàn.
 *
 * LƯU Ý: nếu 1 team có NHIỀU file design trùng tên (VD data cũ để lại file
 * "-1"), map chỉ giữ file gặp ĐẦU TIÊN theo thứ tự đọc thư mục — có thể lệch
 * với file "đúng" nếu design team để trùng nhiều bản. Khi gặp mismatch, nên
 * kiểm tra thủ công xem có file trùng tên nào khác cho cùng team+side không
 * trước khi kết luận CDN sai (case thực tế gặp: kn54qllhvxyqvy9 Turkey home
 * — file "*-1.png" là bản cũ/sai, bản không hậu tố mới khớp CDN).
 *
 * NGOÀI so pixel, test còn verify LUÔN team_id có đúng team hay không (không
 * bị gán nhầm team trong bảng team_shirt) — cùng cơ chế với
 * check_US[1311]_staging.spec.ts: tìm 1 trận (sport_events) của team_id đó,
 * encode sport_event_id, gọi /event/{encoded} lấy homeTeam.id/awayTeam.id
 * (dạng ĐÃ ENCODE), rồi encode chính team_id đang xét để so trực tiếp. Mỗi
 * team_id chỉ verify 1 LẦN dù xuất hiện ở cả home lẫn away (cache theo
 * team_id, không phải theo team_id+side).
 *
 * CHẠY:
 *   npx playwright test tests/check_team_shirt_image_vs_cdn.spec.ts --project=chrome
 */

import { test, expect } from '@playwright/test';
import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as https from 'https';
import { execFileSync } from 'child_process';

const RESULTS_DIR = path.join(__dirname, '..', 'results');

function saveJson(filename: string, data: unknown): void {
  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.writeFileSync(path.join(RESULTS_DIR, filename), JSON.stringify(data, null, 2), 'utf-8');
  console.log(`Đã lưu: results/${filename}`);
}

// ─── CẤU HÌNH ──────────────────────────────────────────────────────────────

const DB_CONFIG = {
  host:                    process.env.DB_PROD_HOST || '',
  port:                    5432,
  user:                    'readonly',
  password:                process.env.DB_PROD_PASSWORD || '',
  database:                'api_ts',
  connectionTimeoutMillis: 30_000,
};

// Folder design tải về local từ Google Drive (mỗi giải đấu 1 file .zip)
const DESIGN_DIR = path.join(os.homedir(), 'Downloads', 'Áo đấu');
// Cache giải nén tạm các zip trong DESIGN_DIR — luôn giải nén lại (-o) mỗi lần chạy
const CACHE_DIR  = path.join(os.tmpdir(), 'ao_dau_design_cache');
// Nơi lưu file tạm (webp tải về + bmp convert) trong lúc so sánh, tự dọn sau mỗi cặp
const WORK_DIR   = path.join(os.tmpdir(), 'shirt_image_diff_work');

const RESIZE_TO = 128; // resize cả 2 ảnh về NxN trước khi so — cùng phép biến đổi nên không lệch kết quả
const MISMATCH_THRESHOLD = 20; // meanAbsDiff (thang 0-255) > ngưỡng này -> coi là ảnh khác nhau thật

const ENCODE_BASE = 'https://opta-api.uniscore.vn/api/v1';
const EVENT_BASE  = 'https://opta-api.uniscore.vn/api/v2';

// ─── KIỂU DỮ LIỆU ──────────────────────────────────────────────────────────

type ImageCheckStatus =
  | 'match'           // pixel khớp (meanAbsDiff <= threshold)
  | 'mismatch'        // pixel khác hẳn -> CDN có thể đang serve sai ảnh
  | 'no_db_link'      // có file design nhưng DB chưa có team_shirt_link cho (team_id, side) này
  | 'download_failed' // không tải được ảnh từ CDN
  | 'convert_failed'  // sips lỗi khi resize/convert
  | 'size_error';     // 2 ảnh BMP ra kích thước khác nhau (không nên xảy ra vì đã ép cùng size)

type IdCheckStatus =
  | 'verified'       // encode(team_id) khớp id API trả về cho đúng phía home/away
  | 'id_mismatch'    // không khớp -> team_id có thể bị gán nhầm team
  | 'no_match_found' // team_id không xuất hiện trong sport_events (home hoặc away)
  | 'api_failed';    // lỗi gọi /encode hoặc /event

interface IdCheckInfo {
  status:      IdCheckStatus;
  dbTeamName:  string | null;
  apiTeamName?: string;
}

interface ImageCheckResult {
  team_id: string;
  side:    'home' | 'away';
  status:  ImageCheckStatus;
  link?:         string;
  designPath?:   string;
  meanAbsDiff?:  number;
  error?:        string;
  idCheck?:      IdCheckInfo;
}

// ─── HELPER: LOAD DESIGN FILES (giải nén zip + quét tên file) ──────────────

function walkDesignDir(dir: string, map: Map<string, string>): void {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { walkDesignDir(full, map); continue; }
    const m = entry.name.match(/^([a-z0-9]{10,20})_.+_(Home|Away)(?:-\d+)?\.(png|webp|jpg|jpeg)$/i);
    if (!m) continue;
    const key = `${m[1]}:${m[2].toLowerCase()}`;
    if (!map.has(key)) map.set(key, full); // giữ file đầu tiên gặp nếu trùng — xem lưu ý ở doc đầu file
  }
}

function loadDesignMap(): Map<string, string> {
  const map = new Map<string, string>();
  if (!fs.existsSync(DESIGN_DIR)) return map;

  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
  const zips = fs.readdirSync(DESIGN_DIR).filter(f => f.toLowerCase().endsWith('.zip'));
  for (const zip of zips) {
    try {
      execFileSync('unzip', ['-q', '-o', path.join(DESIGN_DIR, zip), '-d', CACHE_DIR, '-x', '__MACOSX/*']);
    } catch {
      // 1 zip lỗi không nên chặn cả test — team thuộc zip đó tự nhiên không có trong map
    }
  }
  walkDesignDir(CACHE_DIR, map);
  walkDesignDir(DESIGN_DIR, map); // phòng có file rời chưa nén, không ghi đè key đã có

  return map;
}

// ─── HELPER: TẢI ẢNH + SO PIXEL QUA BMP THÔ (không cần thư viện ảnh) ───────

function downloadFile(url: string, destPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) return resolve(false);
      const file = fs.createWriteStream(destPath);
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve(true)));
    }).on('error', () => resolve(false));
  });
}

// ─── HELPER: VERIFY team_id ĐÚNG TEAM QUA API THẬT (encode + event detail) ─

function httpGetText(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        if (res.statusCode !== 200) return resolve(null);
        resolve(data.trim());
      });
    }).on('error', () => resolve(null));
  });
}

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

/** Encode 1 raw id (match id hoặc team id) sang dạng encoded dùng trong API public */
async function encodeId(rawId: string): Promise<string | null> {
  return httpGetText(`${ENCODE_BASE}/encode/${rawId}`);
}

/**
 * Verify 1 team_id là ĐÚNG team (không bị gán nhầm) bằng cách: tìm 1 trận
 * (sport_events) mà team_id này là home hoặc away, encode sport_event_id,
 * gọi /event/{encoded} lấy homeTeam.id/awayTeam.id (dạng đã encode) đúng
 * phía tương ứng, rồi encode chính team_id để so trực tiếp — khớp thì id
 * hợp lệ. Xem cùng cơ chế + giải thích chi tiết ở check_US[1311]_staging.spec.ts.
 */
async function verifyTeamId(db: Client, team_id: string, dbTeamName: string | null): Promise<IdCheckInfo> {
  const matchRes = await db.query<{ sport_event_id: string; home_team_id: string; away_team_id: string }>(`
    SELECT id AS sport_event_id, home_team_id, away_team_id
    FROM   sport_events
    WHERE  home_team_id = $1 OR away_team_id = $1
    ORDER  BY start_timestamp DESC
    LIMIT  1
  `, [team_id]);

  if (matchRes.rows.length === 0) return { status: 'no_match_found', dbTeamName };

  const match = matchRes.rows[0];
  const side: 'home' | 'away' = match.home_team_id === team_id ? 'home' : 'away';

  const encodedMatchId = await encodeId(match.sport_event_id);
  if (!encodedMatchId) return { status: 'api_failed', dbTeamName };

  const eventRes = await httpGetJson(`${EVENT_BASE}/football/event/${encodedMatchId}`);
  const event = eventRes.ok ? eventRes.json?.data?.event : null;
  if (!event) return { status: 'api_failed', dbTeamName };

  const apiTeam = side === 'home' ? event.homeTeam : event.awayTeam;
  const encodedRawId = await encodeId(team_id);

  return {
    status: encodedRawId === apiTeam?.id ? 'verified' : 'id_mismatch',
    dbTeamName,
    apiTeamName: apiTeam?.name,
  };
}

interface BmpImage {
  buf: Buffer;
  dataOffset: number;
  width: number;
  height: number;
  bytesPerPixel: number;
  rowSize: number;
  topDown: boolean;
}

/** Parse header BMP tối thiểu (đủ dùng cho output của `sips -s format bmp`) */
function parseBmp(filePath: string): BmpImage {
  const buf = fs.readFileSync(filePath);
  if (buf.toString('ascii', 0, 2) !== 'BM') throw new Error('not a BMP: ' + filePath);
  const dataOffset = buf.readUInt32LE(10);
  const width = buf.readInt32LE(18);
  const heightRaw = buf.readInt32LE(22);
  const height = Math.abs(heightRaw);
  const bpp = buf.readUInt16LE(28);
  const bytesPerPixel = bpp / 8;
  const rowSize = Math.floor((bpp * width + 31) / 32) * 4;
  return { buf, dataOffset, width, height, bytesPerPixel, rowSize, topDown: heightRaw < 0 };
}

function pixelAt(img: BmpImage, x: number, y: number): [number, number, number] {
  const row = img.topDown ? y : (img.height - 1 - y);
  const offset = img.dataOffset + row * img.rowSize + x * img.bytesPerPixel;
  return [img.buf[offset + 2], img.buf[offset + 1], img.buf[offset]]; // BGR(A) -> R,G,B
}

/** Trung bình |chênh lệch| từng kênh R,G,B trên toàn bộ pixel giữa 2 BMP cùng kích thước */
function compareBmp(pathA: string, pathB: string): { meanAbsDiff: number } | { error: string } {
  const a = parseBmp(pathA);
  const b = parseBmp(pathB);
  if (a.width !== b.width || a.height !== b.height) {
    return { error: `size mismatch ${a.width}x${a.height} vs ${b.width}x${b.height}` };
  }
  let totalDiff = 0;
  const n = a.width * a.height;
  for (let y = 0; y < a.height; y++) {
    for (let x = 0; x < a.width; x++) {
      const [ra, ga, ba] = pixelAt(a, x, y);
      const [rb, gb, bb] = pixelAt(b, x, y);
      totalDiff += (Math.abs(ra - rb) + Math.abs(ga - gb) + Math.abs(ba - bb)) / 3;
    }
  }
  return { meanAbsDiff: totalDiff / n };
}

// ─── TEST SUITE ─────────────────────────────────────────────────────────────

test.describe('team_shirt — ảnh CDN thật phải khớp PIXEL với file design gốc', () => {

  test.setTimeout(0); // không giới hạn — vài trăm lượt tải ảnh + convert

  let db: Client;

  test.beforeAll(async () => {
    db = new Client(DB_CONFIG);
    await db.connect();
  });

  test.afterAll(async () => {
    await db.end();
  });

  test('Ảnh serve tại team_shirt_link phải giống hệt (pixel) file design tương ứng', async () => {
    if (!fs.existsSync(WORK_DIR)) fs.mkdirSync(WORK_DIR, { recursive: true });

    const designMap = loadDesignMap();
    const hasDesignDir = fs.existsSync(DESIGN_DIR);
    console.log(`\nDESIGN_DIR: ${DESIGN_DIR} (${hasDesignDir ? `${designMap.size} (team_id,side) parse được` : 'KHÔNG tồn tại — bỏ qua toàn bộ test'})`);
    test.skip(!hasDesignDir, `Không tìm thấy DESIGN_DIR (${DESIGN_DIR}) trên máy này — cần tải folder design từ Drive về trước khi chạy test này.`);

    const dbRes = await db.query<{ team_id: string; team_shirt_link: string }>(`
      SELECT team_id, team_shirt_link FROM team_shirt WHERE team_shirt_link IS NOT NULL
    `);
    const dbLinkMap = new Map<string, string>(); // "team_id:side" -> link
    for (const row of dbRes.rows) {
      const m = row.team_shirt_link.match(/\/(home|away)\.webp$/i);
      if (!m) continue;
      dbLinkMap.set(`${row.team_id}:${m[1].toLowerCase()}`, row.team_shirt_link);
    }
    console.log(`team_shirt có link hợp lệ: ${dbLinkMap.size} (team_id,side)`);

    const nameRes = await db.query<{ id: string; name: string | null }>(`SELECT id, name FROM ts_teams`);
    const teamNameMap = new Map(nameRes.rows.map(r => [r.id, r.name]));

    const idCheckCache = new Map<string, IdCheckInfo>(); // team_id -> kết quả verify (verify 1 lần/team, dùng lại cho cả home+away)

    const results: ImageCheckResult[] = [];
    let i = 0;

    for (const [key, designPath] of designMap) {
      i++;
      const [team_id, side] = key.split(':') as [string, 'home' | 'away'];

      if (!idCheckCache.has(team_id)) {
        idCheckCache.set(team_id, await verifyTeamId(db, team_id, teamNameMap.get(team_id) ?? null));
      }
      const idCheck = idCheckCache.get(team_id)!;

      const link = dbLinkMap.get(key);

      if (!link) {
        results.push({ team_id, side, status: 'no_db_link', idCheck });
        continue;
      }

      const webpPath  = path.join(WORK_DIR, `${team_id}_${side}_cdn.webp`);
      const cdnBmp    = path.join(WORK_DIR, `${team_id}_${side}_cdn.bmp`);
      const designBmp = path.join(WORK_DIR, `${team_id}_${side}_design.bmp`);

      const downloaded = await downloadFile(link, webpPath);
      if (!downloaded) {
        results.push({ team_id, side, status: 'download_failed', link, idCheck });
        continue;
      }

      try {
        execFileSync('sips', ['-z', String(RESIZE_TO), String(RESIZE_TO), webpPath, '--out', cdnBmp, '-s', 'format', 'bmp'], { stdio: 'pipe' });
        execFileSync('sips', ['-z', String(RESIZE_TO), String(RESIZE_TO), designPath, '--out', designBmp, '-s', 'format', 'bmp'], { stdio: 'pipe' });
      } catch (e) {
        results.push({ team_id, side, status: 'convert_failed', link, designPath, error: String(e).slice(0, 300), idCheck });
        continue;
      }

      const diff = compareBmp(designBmp, cdnBmp);
      [webpPath, cdnBmp, designBmp].forEach(p => { try { fs.unlinkSync(p); } catch {} });

      if ('error' in diff) {
        results.push({ team_id, side, status: 'size_error', link, designPath, error: diff.error, idCheck });
        continue;
      }

      const status: ImageCheckStatus = diff.meanAbsDiff <= MISMATCH_THRESHOLD ? 'match' : 'mismatch';
      results.push({ team_id, side, status, link, designPath, meanAbsDiff: Math.round(diff.meanAbsDiff * 100) / 100, idCheck });

      if (i % 50 === 0) console.log(`  → ${i}/${designMap.size}`);
    }

    const uniqueIdChecks = [...idCheckCache.values()];
    const summary = {
      total:           results.length,
      match:           results.filter(r => r.status === 'match').length,
      mismatch:        results.filter(r => r.status === 'mismatch').length,
      no_db_link:      results.filter(r => r.status === 'no_db_link').length,
      download_failed: results.filter(r => r.status === 'download_failed').length,
      convert_failed:  results.filter(r => r.status === 'convert_failed').length,
      size_error:      results.filter(r => r.status === 'size_error').length,
      id_unique_teams_checked: uniqueIdChecks.length,
      id_verified:             uniqueIdChecks.filter(c => c.status === 'verified').length,
      id_mismatch:             uniqueIdChecks.filter(c => c.status === 'id_mismatch').length,
      id_no_match_found:       uniqueIdChecks.filter(c => c.status === 'no_match_found').length,
      id_api_failed:           uniqueIdChecks.filter(c => c.status === 'api_failed').length,
    };

    console.log(`\n${'═'.repeat(70)}`);
    console.log(`KẾT QUẢ SO ẢNH DESIGN vs ẢNH THẬT TRÊN CDN (pixel diff, ngưỡng ${MISMATCH_THRESHOLD})`);
    console.log(`${'═'.repeat(70)}`);
    console.log(summary);

    const mismatches = results.filter(r => r.status === 'mismatch');
    mismatches.forEach(m => {
      console.log(`\n[MISMATCH] ${m.team_id}:${m.side}  meanAbsDiff=${m.meanAbsDiff}`);
      console.log(`  link=${m.link}`);
      console.log(`  design=${m.designPath}`);
      console.log(`  -> Trước khi báo bug CDN: kiểm tra có file design TRÙNG TÊN khác cho cùng team+side không (xem lưu ý đầu file, case Turkey đã gặp).`);
    });

    const idMismatchTeams = [...idCheckCache.entries()].filter(([, c]) => c.status === 'id_mismatch');
    idMismatchTeams.forEach(([team_id, c]) => {
      console.log(`\n[ID_MISMATCH] team_id=${team_id} dbName=${c.dbTeamName} apiName=${c.apiTeamName} -> team_id có thể bị gán nhầm team trong team_shirt`);
    });

    saveJson('team-shirt-image-pixel-diff.json', { summary, results });

    const totalProblems = mismatches.length + idMismatchTeams.length;
    expect.soft(
      totalProblems,
      `${mismatches.length}/${results.length} ảnh CDN sai pixel + ${idMismatchTeams.length}/${uniqueIdChecks.length} team_id sai (gán nhầm team) — xem log/JSON để phân biệt`
    ).toBe(0);
  });
});
