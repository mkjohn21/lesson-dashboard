'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { load } = require('./lib/load');
const { compute } = require('./lib/compute');

const PORT = Number(process.env.PORT) || 8080;
const KEY = process.env.DASHBOARD_KEY;
const TTL = (Number(process.env.CACHE_TTL_SECONDS) || 600) * 1000;
const MAX_STALE = (Number(process.env.MAX_STALE_SECONDS) || 6 * 3600) * 1000; // 이보다 오래되면 기다렸다가 새로 읽는다
if (!KEY || KEY.length < 16) {
  console.error('DASHBOARD_KEY 환경 변수(16자 이상)가 필요합니다.');
  process.exit(1);
}

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const COOKIE = sha('dashboard-cookie:' + KEY);
const same = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

// ---- 캐시(stale-while-revalidate): TTL 안에서는 메모리 결과를 쓰고, 지나면 저장분을 바로 보여 주면서
// 뒤에서 새로 읽는다. 아주 오래됐거나(MAX_STALE) 저장분이 없으면 새로 읽을 때까지 기다린다. 동시 요청은 하나로 합친다.
let cache = null; // { data, at }
let inflight = null;
function refresh() {
  if (!inflight) {
    inflight = (async () => {
      const t0 = Date.now();
      const data = compute(await load());
      cache = { data, at: Date.now() };
      console.log(`refreshed in ${Date.now() - t0}ms`);
      return cache;
    })().finally(() => { inflight = null; });
  }
  return inflight;
}
async function getData(force) {
  if (cache && !force) {
    const age = Date.now() - cache.at;
    if (age < TTL) return { ...cache, stale: false };
    if (age < MAX_STALE) {
      refresh().catch((e) => console.error('background refresh failed:', e.message));
      return { ...cache, stale: false, refreshing: true };
    }
  }
  try {
    return { ...(await refresh()), stale: false };
  } catch (e) {
    console.error(e.message);
    if (cache) return { ...cache, stale: true, error: e.message };
    throw e;
  }
}

const send = (res, code, body, type = 'text/plain; charset=utf-8', extra = {}) => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', ...extra });
  res.end(body);
};
const file = (res, p, type) => send(res, 200, fs.readFileSync(p), type, type.startsWith('text/html') ? {} : { 'Cache-Control': 'public, max-age=86400' });

http
  .createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      if (url.pathname === '/ping') return send(res, 200, 'ok');
      // d3는 공개 라이브러리라 키 없이 내려준다(임베드에서 쿠키 없이도 화면이 뜨도록).
      if (url.pathname === '/d3.min.js') return file(res, path.join(__dirname, 'node_modules', 'd3', 'dist', 'd3.min.js'), 'application/javascript');

      const cookies = Object.fromEntries((req.headers.cookie || '').split(/;\s*/).filter(Boolean).map((c) => { const i = c.indexOf('='); return [c.slice(0, i), c.slice(i + 1)]; }));
      const given = url.searchParams.get('key') || req.headers['x-dashboard-key'];
      const keyOk = given && same(given, KEY);
      const authed = keyOk || (cookies.dk && same(cookies.dk, COOKIE));
      const isApi = url.pathname.startsWith('/api/');
      if (!authed) {
        return isApi ? send(res, 401, '{"error":"unauthorized"}', 'application/json') : send(res, 401, '접근 권한이 없습니다. 주소 끝에 ?key=... 를 붙여 열어 주세요.');
      }
      // 주소의 키는 쿠키로 바꾸고 주소창에서 지운다.
      // 노션 임베드(iframe)에서는 쿠키가 막히므로 키를 주소에 그대로 두고, 화면이 같은 키로 데이터를 요청한다.
      const framed = req.headers['sec-fetch-dest'] === 'iframe' || url.searchParams.has('embed');
      if (keyOk && url.searchParams.has('key') && !isApi && !framed) {
        const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
        url.searchParams.delete('key');
        return send(res, 302, '', 'text/plain', {
          'Set-Cookie': `dk=${COOKIE}; Max-Age=31536000; Path=/; HttpOnly; SameSite=Lax${secure}`,
          Location: url.pathname + url.search,
        });
      }

      if (url.pathname === '/api/data') {
        const d = await getData(url.searchParams.has('refresh'));
        return send(res, 200, JSON.stringify({ updatedAt: new Date(d.at).toISOString(), stale: d.stale, refreshing: !!d.refreshing, error: d.error, ...d.data }), 'application/json; charset=utf-8');
      }
      if (url.pathname === '/api/refresh') {
        const d = await getData(true);
        return send(res, 200, JSON.stringify({ ok: !d.stale, updatedAt: new Date(d.at).toISOString() }), 'application/json');
      }
      if (url.pathname === '/' || url.pathname === '/index.html') return file(res, path.join(__dirname, 'public', 'index.html'), 'text/html; charset=utf-8');
      return send(res, 404, 'not found');
    } catch (e) {
      console.error(e);
      send(res, 502, JSON.stringify({ error: e.message }), 'application/json; charset=utf-8');
    }
  })
  .listen(PORT, () => {
    console.log(`listening on ${PORT}`);
    refresh().catch((e) => console.error('warm-up failed:', e.message)); // 인스턴스가 켜지면 바로 데이터를 읽어 둔다
  });
