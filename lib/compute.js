'use strict';
// 노션 행 -> 대시보드 지표. 규칙은 이전 Claude 페이지 버전(dashboard-queries.json)과 같다.
const KST = 9 * 3600 * 1000;
const ACAD = {
  '아베크 강남': 'gangnam',
  '아베크 잠실': 'jamsil',
  '아베크 분당': 'bundang',
  제이톤: 'jtone',
  위뮤직: 'wemusic',
  개인레슨: 'personal',
};
const KEYS = ['gangnam', 'jamsil', 'bundang', 'jtone', 'wemusic', 'personal'];
const INVALID = ['딜레이', '당결', '전달사항'];
const START = '2023-05-01';

const r1 = (n) => Math.round(n * 10) / 10;
const ymd = (ms) => new Date(ms + KST).toISOString().slice(0, 10);

function kst(iso) {
  if (!iso) return null;
  if (iso.length <= 10) return { date: iso, ms: null };
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : { date: ymd(ms), ms };
}
const mondayOf = (d) => {
  const dt = new Date(d + 'T00:00:00Z');
  dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7));
  return dt.toISOString().slice(0, 10);
};
const addDays = (d, n) => {
  const dt = new Date(d + 'T00:00:00Z');
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
};
const zeroRow = () => Object.fromEntries(KEYS.map((k) => [k, 0]));

// 학생 수: 합계는 학생 중복 제거, 학원별은 학원마다 중복 제거
function headcountRow(items) {
  const all = new Set();
  const by = Object.fromEntries(KEYS.map((k) => [k, new Set()]));
  for (const it of items) {
    all.add(it.student);
    if (it.key) by[it.key].add(it.student);
  }
  return { total: all.size, ...Object.fromEntries(KEYS.map((k) => [k, by[k].size])) };
}

function compute({ tenures, lessons, pays }, now = Date.now()) {
  const curDate = ymd(now);
  const curMonth = curDate.slice(0, 7);
  const curWeek = mondayOf(curDate);

  const payById = new Map(pays.map((p) => [p.id, p]));
  const ten = tenures
    .filter((t) => t.student && t.start)
    .map((t) => ({
      student: t.student,
      key: ACAD[t.academy] || null,
      start: t.start.slice(0, 10),
      end: t.end ? t.end.slice(0, 10) : null,
    }));

  const valid = [];
  for (const l of lessons) {
    if (!l.student || !l.date || l.tags.some((t) => INVALID.includes(t))) continue;
    const s = kst(l.date.start);
    if (!s) continue;
    const e = kst(l.date.end);
    const hours = s.ms != null && e && e.ms != null ? Math.max(0, (e.ms - s.ms) / 3600000) : 0;
    const pay = l.payId ? payById.get(l.payId) : null;
    valid.push({ student: l.student, key: pay ? ACAD[pay.academy] || null : null, date: s.date, hours });
  }

  // ---- 수강 인원: 과거(수강 기수 기준)
  const months = [];
  for (let m = START.slice(0, 7); m <= curMonth; ) {
    months.push(m);
    const [y, mo] = m.split('-').map(Number);
    m = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
  }
  const hcMonthly = months.map((m) => ({
    month: m,
    ...headcountRow(ten.filter((t) => t.start.slice(0, 7) <= m && (!t.end || t.end.slice(0, 7) >= m))),
  }));
  const hcWeekly = [];
  for (let w = START; w <= curWeek; w = addDays(w, 7)) {
    hcWeekly.push({
      week: w,
      ...headcountRow(ten.filter((t) => t.start <= addDays(w, 6) && (!t.end || t.end >= w))),
    });
  }

  // ---- 수강 인원: 미래(예정 수업이 있는 학생)
  const groupBy = (rows, keyFn) => {
    const m = new Map();
    for (const r of rows) {
      const k = keyFn(r);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r);
    }
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  };
  const futMonthly = groupBy(valid.filter((l) => l.date.slice(0, 7) > curMonth), (l) => l.date.slice(0, 7)).map(
    ([month, rows]) => ({ month, ...headcountRow(rows) }),
  );
  const futWeekly = groupBy(valid.filter((l) => mondayOf(l.date) > curWeek), (l) => mondayOf(l.date)).map(
    ([week, rows]) => ({ week, ...headcountRow(rows) }),
  );

  // ---- 수업 시간(예정 포함)
  const hoursRow = (rows) => {
    const o = { lessons: rows.length, total: 0, ...zeroRow() };
    for (const l of rows) {
      o.total += l.hours;
      if (l.key) o[l.key] += l.hours;
    }
    o.total = r1(o.total);
    KEYS.forEach((k) => { o[k] = r1(o[k]); });
    return o;
  };
  const hrMonthMap = new Map(groupBy(valid, (l) => l.date.slice(0, 7)));
  const lastMonth = [...hrMonthMap.keys()].reduce((a, b) => (b > a ? b : a), curMonth);
  const hrMonthly = [];
  for (let m = START.slice(0, 7); m <= lastMonth; ) {
    hrMonthly.push({ month: m, ...hoursRow(hrMonthMap.get(m) || []) });
    const [y, mo] = m.split('-').map(Number);
    m = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
  }
  const hrWeekMap = new Map(groupBy(valid.filter((l) => l.date >= START), (l) => mondayOf(l.date)));
  const lastWeek = [...hrWeekMap.keys()].reduce((a, b) => (b > a ? b : a), curWeek);
  const hrWeekly = [];
  for (let w = START; w <= lastWeek; w = addDays(w, 7)) hrWeekly.push({ week: w, ...hoursRow(hrWeekMap.get(w) || []) });

  // ---- 지금 수강 중(열린 기수) + 급여정보 기준 주·월 시간
  const open = ten.filter((t) => !t.end);
  const openStudents = new Set(open.map((t) => t.student));
  const names = ['전체', ...Object.keys(ACAD)];
  const now_ = names
    .map((n) => ({
      academy: n,
      students: n === '전체' ? open.length : open.filter((t) => t.key === ACAD[n]).length,
    }))
    .filter((r) => r.students > 0);
  const livePays = pays.filter((p) => p.status === '진행 중' && p.students.some((s) => openStudents.has(s)));
  const payRows = names
    .map((n) => {
      const rows = n === '전체' ? livePays : livePays.filter((p) => p.academy === n);
      const wk = rows.reduce((a, p) => a + (p.weekHours || 0), 0);
      return { academy: n, pages: rows.length, week_hours: r1(wk), month_hours: r1(wk * 4) };
    })
    .filter((r) => r.pages > 0);

  const thisMonthRows = valid.filter((l) => l.date.slice(0, 7) === curMonth);
  const tm = hoursRow(thisMonthRows);
  // 지금까지: KST 오늘의 모든 수업을 마쳤을 때(오늘 예정 수업 포함)까지의 유효 수업
  const doneRows = valid.filter((l) => l.date <= curDate);
  const alltime = {
    lessons: doneRows.length,
    hours: r1(doneRows.reduce((a, l) => a + l.hours, 0)),
    students: new Set(doneRows.map((l) => l.student)).size,
  };

  return {
    headcount: { monthly: hcMonthly, weekly: hcWeekly, futureMonthly: futMonthly, futureWeekly: futWeekly },
    hours: { monthly: hrMonthly, weekly: hrWeekly },
    now: now_,
    pay: payRows,
    thismonth: { lessons: tm.lessons, hours: tm.total },
    alltime,
    curMonth,
    curWeek,
  };
}

module.exports = { compute, mondayOf };
