'use strict';
// 노션 API 최소 클라이언트: 데이터 소스 조회(페이지네이션, 429/5xx 재시도).
const BASE = process.env.NOTION_BASE || 'https://api.notion.com/v1';
const VERSION = process.env.NOTION_VERSION || '2025-09-03';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function nfetch(path, { method = 'GET', body } = {}) {
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error('NOTION_TOKEN 환경 변수가 없습니다.');
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(BASE + path, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': VERSION,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.ok) return res.json();
    if ((res.status === 429 || res.status >= 500) && attempt < 5) {
      const wait = Number(res.headers.get('retry-after')) * 1000 || 500 * 2 ** attempt;
      await sleep(wait);
      continue;
    }
    const text = await res.text().catch(() => '');
    throw new Error(`노션 API ${res.status} ${path}: ${text.slice(0, 300)}`);
  }
}

// 속성 이름 -> 속성 ID (filter_properties는 ID를 받는다)
async function propertyIds(dsId, names) {
  const ds = await nfetch(`/data_sources/${dsId}`);
  // names의 각 항목은 이름 하나 또는 [새 이름, 이전 이름...] 목록(이름이 바뀌어도 읽히도록 호환)
  return names.map((alts) => {
    const list = [].concat(alts);
    const hit = list.find((n) => ds.properties && ds.properties[n]);
    if (!hit) throw new Error(`데이터 소스 ${dsId}에 '${list.join("' 또는 '")}' 속성이 없습니다.`);
    return ds.properties[hit].id;
  });
}

async function queryAll(dsId, names) {
  const ids = await propertyIds(dsId, names);
  const qs = ids.map((i) => `filter_properties=${encodeURIComponent(i)}`).join('&');
  const out = [];
  let cursor;
  do {
    const r = await nfetch(`/data_sources/${dsId}/query?${qs}`, {
      method: 'POST',
      body: { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) },
    });
    out.push(...r.results);
    cursor = r.has_more ? r.next_cursor : null;
  } while (cursor);
  return out;
}

// 속성 값 추출
// name은 이름 하나 또는 [새 이름, 이전 이름...] 목록, 목록이면 페이지에 있는 첫 이름을 쓴다.
const get = (page, name) => {
  const props = page.properties || {};
  for (const k of [].concat(name)) if (props[k]) return props[k];
  return {};
};
const rel = (page, name) => (get(page, name).relation || []).map((x) => x.id);
const sel = (page, name) => (get(page, name).select || {}).name || null;
const status = (page, name) => (get(page, name).status || {}).name || null;
const multi = (page, name) => (get(page, name).multi_select || []).map((x) => x.name);
const date = (page, name) => get(page, name).date || null;
const num = (page, name) => (typeof get(page, name).number === 'number' ? get(page, name).number : null);

module.exports = { queryAll, rel, sel, status, multi, date, num };
