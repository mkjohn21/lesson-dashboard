'use strict';
// 로컬 확인용 가짜 노션 서버 (실제 데이터 아님)
const http = require('http');
const ids = { t: '60e5cac0-608f-4d16-8067-b8185e85cf2f', l: '3524913c-cbdb-8151-b32a-000b7c1d478e', p: '25c5b493-d13e-4046-923c-86b64e8abff8' };
const A = ['아베크 강남', '아베크 잠실', '아베크 분당', '제이톤', '위뮤직', '개인레슨'];
const D = (s) => ({ date: { start: s } });
const tenures = [], pays = [], lessons = [];
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
for (let i = 0; i < 40; i++) {
  const s = `stu${i}`, a = A[i % 6];
  const st = new Date(Date.UTC(2024, 0, 1) + Math.floor(rnd() * 600) * 864e5);
  const open = i % 3 === 0;
  const en = open ? null : new Date(st.getTime() + (60 + Math.floor(rnd() * 300)) * 864e5);
  tenures.push({ id: `t${i}`, properties: { 학생: { relation: [{ id: s }] }, 학원: { select: { name: a } }, 시작일: D(st.toISOString().slice(0, 10)), 종료일: en ? D(en.toISOString().slice(0, 10)) : { date: null } } });
  pays.push({ id: `p${i}`, properties: { '학생 이름': { relation: [{ id: s }] }, '학원 이름': { select: { name: a } }, 주당시간: { number: 1 + (i % 3) * 0.5 }, '급여 적용상태': { status: { name: open ? '진행 중' : '종료' } } } });
  const end = en || new Date(Date.UTC(2026, 11, 20));
  for (let d = new Date(st); d <= end; d = new Date(d.getTime() + 7 * 864e5)) {
    const tag = rnd() < 0.08 ? [{ name: '당결' }] : [];
    const day = d.toISOString().slice(0, 10);
    lessons.push({ id: `l${i}-${day}`, properties: { '학생 이름': { relation: [{ id: s }] }, '연결 정보': { relation: [{ id: `p${i}` }] }, 수업일: { date: { start: `${day}T10:00:00.000+09:00`, end: `${day}T11:00:00.000+09:00` } }, 특이사항: { multi_select: tag } } });
  }
}
const data = { [ids.t]: tenures, [ids.l]: lessons, [ids.p]: pays };
const props = { [ids.t]: ['학생', '학원', '시작일', '종료일'], [ids.l]: ['학생 이름', '연결 정보', '수업일', '특이사항'], [ids.p]: ['학생 이름', '학원 이름', '주당시간', '급여 적용상태'] };
http.createServer((req, res) => {
  const m = req.url.match(/data_sources\/([^/?]+)(\/query)?/);
  if (!m || !data[m[1]]) { res.writeHead(404); return res.end('{}'); }
  let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => {
    res.setHeader('Content-Type', 'application/json');
    if (!m[2]) return res.end(JSON.stringify({ properties: Object.fromEntries(props[m[1]].map((n) => [n, { id: encodeURIComponent(n) }])) }));
    const body = b ? JSON.parse(b) : {}; const from = Number(body.start_cursor || 0); const rows = data[m[1]];
    res.end(JSON.stringify({ results: rows.slice(from, from + 100), has_more: from + 100 < rows.length, next_cursor: String(from + 100) }));
  });
}).listen(Number(process.env.FAKE_PORT) || 9099, () => console.log('fake notion up'));
