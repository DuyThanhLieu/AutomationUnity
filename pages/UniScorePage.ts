import { type Page, type Locator } from '@playwright/test';

export interface MatchRowData {
  index: number;
  homeTeam: string;
  awayTeam: string;
  timeOrScore: string; // date-match (hôm nay) hoặc time-match (ngày tương lai)
  status: string;      // FT / HT / AET / PEN — chỉ có cho trận kết thúc
}

export class UniScorePage {

  readonly page: Page;

  // Header / nav
  readonly navigation: Locator;

  // Sport tabs
  readonly footballTab: Locator;
  readonly basketballTab: Locator;
  readonly tennisTab: Locator;

  // Filter buttons
  readonly filterAll: Locator;
  readonly filterLive: Locator;
  readonly filterUpcoming: Locator;
  readonly filterFinish: Locator;

  // Match lists — mỗi filter render một list khác nhau trong DOM
  readonly matchListAll: Locator;
  readonly matchListLive: Locator;
  readonly matchListUpcoming: Locator;
  readonly matchListFinished: Locator;

  // Generic — trỏ vào list All (tương thích ngược)
  readonly matchList: Locator;
  readonly matchRows: Locator;

  // Search
  readonly searchButton: Locator;

  constructor(page: Page) {
    this.page = page;

    this.navigation     = page.locator('nav, header, [role="navigation"]').first();

    this.footballTab    = page.locator('[test-id="tab-Bóng đá"]');
    this.basketballTab  = page.locator('[test-id="tab-Bóng rổ"]');
    this.tennisTab      = page.locator('[test-id="tab-Quần vợt"]');

    this.filterAll      = page.locator('[data-testid="filter-all"]');
    this.filterLive     = page.locator('[data-testid="filter-live"]');
    this.filterUpcoming = page.locator('[data-testid="filter-upcoming"]');
    this.filterFinish   = page.locator('[data-testid="filter-finish"]');

    // match-list-v2-all / live / upcoming / finished — render theo filter đang active
    this.matchListAll      = page.locator('[data-testid="match-list-v2-all"]');
    this.matchListLive     = page.locator('[data-testid="match-list-v2-live"]');
    this.matchListUpcoming = page.locator('[data-testid="match-list-v2-upcoming"]');
    this.matchListFinished = page.locator('[data-testid="match-list-v2-finished"]');

    this.matchList      = page.locator('[data-testid="match-list-v2-all"]');
    this.matchRows      = page.locator('[data-testid="match-row"]');

    this.searchButton   = page.locator('[test-id="icon_search"]');
  }

  // ── Navigation ────────────────────────────────────────────────────────────

  async goto() {
    await this.page.goto('https://uniscore.com/');
  }

  // Điều hướng đến ngày cụ thể qua URL ?date=YYYY-MM-DD
  async gotoDate(date: string) {
    await this.page.goto(`https://uniscore.com/?date=${date}`);
  }

  async waitForContent() {
    await this.page.waitForLoadState('networkidle');
  }

  async getTitle() {
    return this.page.title();
  }

  // ── Filter state ──────────────────────────────────────────────────────────

  // Filter active = màu vàng (#FFAC00); inactive = xám (#DEDEDE)
  async isFilterActive(filter: 'all' | 'live' | 'upcoming' | 'finish'): Promise<boolean> {
    const locator = {
      all:      this.filterAll,
      live:     this.filterLive,
      upcoming: this.filterUpcoming,
      finish:   this.filterFinish,
    }[filter];
    const cls = await locator.getAttribute('class') ?? '';
    return cls.includes('#FFAC00');
  }

  // Lấy số đếm live từ badge text (ví dụ "Live6" → 6, "Live0" → 0)
  async getLiveCount(): Promise<number> {
    const text = await this.filterLive.textContent() ?? '';
    const match = text.match(/\d+/);
    return match ? parseInt(match[0], 10) : 0;
  }

  // ── Match data ────────────────────────────────────────────────────────────

  async getMatchRowCount() {
    return this.matchRows.count();
  }

  // Lấy toàn bộ match data; hỗ trợ 3 cấu trúc HTML khác nhau:
  //   test-id="date-match"            → hôm nay (live score / giờ / trống nếu FT)
  //   test-id="time-match"            → ngày tương lai (chỉ giờ)
  //   div.w-18 span.text-label-primary → một số rows dùng layout khác (không có test-id)
  async getAllMatchData(): Promise<MatchRowData[]> {
    return this.page.evaluate(() => {
      const rows = document.querySelectorAll('[data-testid="match-row"]');
      return Array.from(rows).map((row, index) => {
        const timeOrScore =
          (row.querySelector('[test-id="date-match"]')?.textContent ?? '').trim() ||
          (row.querySelector('[test-id="time-match"]')?.textContent ?? '').trim() ||
          // Fallback: layout khác — thời gian nằm trong span đầu tiên của ô status
          (row.querySelector('[class*="w-18"] span.text-csm.text-label-primary')?.textContent ?? '').trim();

        // Trạng thái kết thúc nằm trong span.text-label-tertiary (FT / HT / AET…)
        const statusEl = row.querySelector('span.text-csm.text-label-tertiary');
        const status   = (statusEl?.textContent ?? '').trim();

        return {
          index,
          homeTeam:    (row.querySelector('[test-id="club1-info"]')?.textContent ?? '').trim(),
          awayTeam:    (row.querySelector('[test-id="club2-info"]')?.textContent ?? '').trim(),
          timeOrScore,
          status,
        };
      });
    });
  }

  async getLiveMatches(): Promise<MatchRowData[]> {
    const all = await this.getAllMatchData();
    return all.filter(m => /^\d+\s*-\s*\d+$/.test(m.timeOrScore));
  }

  async getUpcomingMatches(): Promise<MatchRowData[]> {
    const all = await this.getAllMatchData();
    return all.filter(m => /^\d{1,2}:\d{2}$/.test(m.timeOrScore));
  }

  async getFinishedMatches(): Promise<MatchRowData[]> {
    const all = await this.getAllMatchData();
    return all.filter(m => /^(FT|AET|PEN|AP|Awarded|WO)$/i.test(m.status));
  }

  async getLeagueNames(): Promise<string[]> {
    return this.page.evaluate(() => {
      const rows = document.querySelectorAll('[test-id="league-row"]');
      return Array.from(rows)
        .map(el => el.textContent?.trim() ?? '')
        .filter(name => name.length > 0);
    });
  }

  async getSportTabNames(): Promise<string[]> {
    return this.page.evaluate(() => {
      const tabs = document.querySelectorAll('[test-id^="tab-"]');
      return Array.from(tabs).map(el => el.getAttribute('test-id')?.replace('tab-', '') ?? '');
    });
  }

  async getBrokenImages(): Promise<string[]> {
    return this.page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('img')) as HTMLImageElement[];
      return imgs
        .filter(img => img.complete && img.src && !img.src.startsWith('data:'))
        .filter(img => img.naturalWidth === 0)
        .map(img => img.src);
    });
  }

  async getErrorTextCount(): Promise<number> {
    return this.page.locator('text=/404|500|not found|server error/i').count();
  }
}
