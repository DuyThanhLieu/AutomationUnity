/**
 * OPENOBSERVE HTTP CLIENT cho bộ test injury time (ticket TheSport injuryTime).
 *
 * ⚠️ PLACEHOLDER — chưa có endpoint/credentials thật. Điền OPENOBSERVE_CONFIG
 * dưới đây rồi mọi test dùng queryOpenObserve() sẽ chạy được ngay.
 *
 * Dùng để verify stream "emqx_events_publish" (socket log publish ra
 * fb-live-v1) — đếm message theo field injuryTime/source/score[5] như mô tả
 * trong ticket.
 */

export const OPENOBSERVE_CONFIG = {
  baseUrl: 'TODO_OPENOBSERVE_URL', // TODO: điền base URL OpenObserve (vd https://openobserve.internal)
  organization: 'TODO_ORG', // TODO: điền tên organization trong OpenObserve
  stream: 'emqx_events_publish',
  apiKey: undefined as string | undefined, // TODO: điền API key/token nếu cần auth
};

export function isOpenObserveConfigured(): boolean {
  return OPENOBSERVE_CONFIG.baseUrl !== 'TODO_OPENOBSERVE_URL';
}

export interface OpenObserveSearchResult {
  hits: any[];
  total: number;
}

/**
 * Query OpenObserve qua REST Search API (_search endpoint theo SQL mode).
 * Tài liệu: https://openobserve.ai/docs/api/search/
 */
export async function queryOpenObserve(sql: string, startTimeUs: number, endTimeUs: number): Promise<OpenObserveSearchResult> {
  if (!isOpenObserveConfigured()) {
    throw new Error('OpenObserve chưa được config — điền OPENOBSERVE_CONFIG trong lib/openobserve.ts trước khi gọi hàm này.');
  }

  const url = `${OPENOBSERVE_CONFIG.baseUrl}/api/${OPENOBSERVE_CONFIG.organization}/_search`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (OPENOBSERVE_CONFIG.apiKey) headers['Authorization'] = `Basic ${OPENOBSERVE_CONFIG.apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      query: { sql, start_time: startTimeUs, end_time: endTimeUs, from: 0, size: 1000 },
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenObserve query lỗi: HTTP ${res.status} — ${await res.text()}`);
  }

  const body = await res.json();
  return { hits: body.hits ?? [], total: body.total ?? 0 };
}
