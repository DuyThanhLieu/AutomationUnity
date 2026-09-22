/**
 * TEST FILE: player-honors-api-vs-db.spec.ts
 *
 * BUG: API GET /player/{id}/honors trả về đầy đủ danh sách danh hiệu (honor)
 * của cầu thủ, nhưng bảng DB `player_honor` (football DB) THIẾU HOÀN TOÀN
 * record cho những player này — không phải chỉ thiếu honor, mà bản thân
 * player_id đó KHÔNG TỒN TẠI ở bất kỳ bảng player nào trong DB
 * (am_football_players, opta_players, player_locale đều 0 dòng), dù API
 * player detail vẫn trả về đầy đủ thông tin (tên, đội, quốc tịch...).
 *
 * PHÁT HIỆN BAN ĐẦU (2026-08-05): player Ayase Ueda (9zuz9plg550wrm3,
 * Feyenoord, giải Hà Lan/Eredivisie) — API trả 10 honor, DB có 0 record.
 * Sau đó verify mở rộng: lấy 42 player ID thật từ 1 trận đấu khác (Millonarios
 * vs Deportivo Pasto), 0/42 player có mặt trong player_honor. Trong 10 player
 * đầu tiên kiểm tra qua API, 6/10 CÓ honor thật (2-6 records mỗi người) —
 * xác nhận đây là bug đồng bộ PHỔ BIẾN, không phải case hiếm gặp 1 player.
 *
 * NGUỒN DỮ LIỆU:
 *   API: GET https://opta-api.uniscore.vn/api/v2/football/player/{id}/honors?language=en
 *     -> data: [{ honor_id, last_season, honor_name, times }]
 *   DB:  bảng player_honor (football DB) — cột player_id, honor_id, season
 *
 * CHECK DETAILS:
 *   ✓ Với mỗi player lấy từ 1 lineup trận đấu thật, gọi API /honors
 *   ✓ Nếu API trả về >=1 honor, DB player_honor PHẢI có ít nhất 1 record
 *     cho đúng player_id đó
 *   ✓ Đo tỷ lệ % player bị bug (có honor ở API nhưng thiếu ở DB) trên toàn
 *     bộ sample, không chỉ khẳng định đúng/sai cho 1 player
 *
 * CHẠY:
 *   npx playwright test tests/player-honors-api-vs-db.spec.ts --project=chrome
 *
 * Kết quả lưu tại: results/player-honors-api-vs-db.json
 */

import { test, expect } from '@playwright/test';
import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

const RESULTS_DIR = path.join(__dirname, '..', 'results');
const API_BASE = 'https://opta-api.uniscore.vn/api/v2/football';

const DB_CONFIG = {
  host: process.env.DB_HOST || '',
  port: 6432,
  user: 'readonly',
  password: process.env.DB_PASSWORD || '',
  database: 'football',
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 30_000,
};

function saveJson(filename: string, data: unknown): void {
  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.writeFileSync(path.join(RESULTS_DIR, filename), JSON.stringify(data, null, 2), 'utf-8');
  console.log(`Đã lưu: results/${filename}`);
}

async function withClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client(DB_CONFIG);
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

function httpGetJson(url: string): Promise<{ ok: boolean; json?: any }> {
  return new Promise((resolve) => {
    https
      .get(url, { timeout: 15000 }, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          if (res.statusCode !== 200) return resolve({ ok: false });
          try {
            resolve({ ok: true, json: JSON.parse(data) });
          } catch {
            resolve({ ok: false });
          }
        });
      })
      .on('error', () => resolve({ ok: false }));
  });
}

interface HonorApiResult {
  playerId: string;
  playerName: string;
  apiHonorCount: number;
  dbHonorCount: number;
  bugDetected: boolean; // API có honor nhưng DB không có
}

test.describe('Player Honors — API vs DB (bug đồng bộ)', () => {
  test.setTimeout(0);

  test('[1] Lấy sample player thật từ 1 trận đấu, so API /honors với DB player_honor', async ({ page }) => {
    // Lấy match ID thật + player ID thật từ homepage (dữ liệu live, không
    // hard-code — theo bài học từ các file test trước: match/player ID cứng
    // sẽ hết hạn khi dữ liệu live đổi).
    await page.goto('https://staging.uniscore.vn/en', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(4000);
    const hrefs: string[] = await page.evaluate(() =>
      [...document.querySelectorAll('a')].map((a) => (a as HTMLAnchorElement).href).filter((h) => h.includes('/football/match/'))
    );
    const matchIds = [...new Set(hrefs.map((h) => h.split('/').pop()!))].slice(0, 5);
    expect(matchIds.length, 'Không lấy được match ID nào từ homepage').toBeGreaterThan(0);

    // Lấy player list từ lineups của các trận này
    const playerMap = new Map<string, string>(); // id -> name
    for (const matchId of matchIds) {
      const res = await httpGetJson(`${API_BASE}/event/${matchId}/lineups?language=en`);
      if (!res.ok) continue;

      const findPlayers = (obj: any) => {
        if (Array.isArray(obj)) {
          obj.forEach(findPlayers);
        } else if (obj && typeof obj === 'object') {
          if (obj.id && obj.name && (obj.shirt_number !== undefined || obj.position !== undefined)) {
            playerMap.set(obj.id, obj.name);
          }
          Object.values(obj).forEach(findPlayers);
        }
      };
      findPlayers(res.json?.data);
      if (playerMap.size >= 30) break;
    }

    const players = [...playerMap.entries()].slice(0, 30);
    console.log(`\n[1] Lấy được ${players.length} player thật từ ${matchIds.length} trận đấu, đang kiểm tra honors...`);
    expect(players.length, 'Không lấy được player nào từ lineups').toBeGreaterThan(0);

    const results: HonorApiResult[] = [];

    for (const [playerId, playerName] of players) {
      const honorRes = await httpGetJson(`${API_BASE}/player/${playerId}/honors?language=en`);
      const apiHonors = honorRes.ok && Array.isArray(honorRes.json?.data) ? honorRes.json.data : [];

      const dbCount = await withClient(async (client) => {
        const r = await client.query('SELECT count(*) FROM player_honor WHERE player_id = $1', [playerId]);
        return parseInt(r.rows[0].count, 10);
      });

      const bugDetected = apiHonors.length > 0 && dbCount === 0;

      results.push({
        playerId,
        playerName,
        apiHonorCount: apiHonors.length,
        dbHonorCount: dbCount,
        bugDetected,
      });
    }

    const summary = {
      totalChecked: results.length,
      playersWithApiHonors: results.filter((r) => r.apiHonorCount > 0).length,
      playersWithDbHonors: results.filter((r) => r.dbHonorCount > 0).length,
      bugCount: results.filter((r) => r.bugDetected).length,
    };
    const bugPct =
      summary.playersWithApiHonors > 0 ? ((summary.bugCount / summary.playersWithApiHonors) * 100).toFixed(1) : '0';

    console.log(`\n📊 Kết quả (${summary.totalChecked} player):`);
    console.log(`  Player có honor trên API: ${summary.playersWithApiHonors}`);
    console.log(`  Player có honor trong DB: ${summary.playersWithDbHonors}`);
    console.log(`  Player bị BUG (API có, DB thiếu): ${summary.bugCount}/${summary.playersWithApiHonors} (${bugPct}%)`);

    if (summary.bugCount > 0) {
      console.log(`\n🚨 Danh sách player bị bug:`);
      results
        .filter((r) => r.bugDetected)
        .forEach((r) => console.log(`  ${r.playerName} (${r.playerId}): API=${r.apiHonorCount} honors, DB=0`));
    }

    saveJson('player-honors-api-vs-db.json', { summary, bugPct: `${bugPct}%`, results });

    // Assertion chính: báo hiệu bug đang tồn tại. Nếu dev fix đồng bộ xong,
    // bugCount sẽ về 0 và test này tự chuyển PASS — không cần sửa lại code.
    expect.soft(
      summary.bugCount,
      `[BUG ĐANG TỒN TẠI] ${summary.bugCount}/${summary.playersWithApiHonors} player có honor trên API nhưng ` +
        `KHÔNG có record nào trong DB player_honor — vấn đề đồng bộ dữ liệu player_honor. Chi tiết: results/player-honors-api-vs-db.json`
    ).toBe(0);
  });
});
