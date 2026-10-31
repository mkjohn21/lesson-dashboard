'use strict';
const assert = require('assert');
const { compute } = require('../lib/compute');
const now = Date.parse('2026-10-31T05:00:00Z'); // KST 10-31 (토)
const tenures = [
  { student: 'a', academy: '아베크 강남', start: '2026-10-01', end: null },
  { student: 'a', academy: '개인레슨', start: '2026-09-01', end: '2026-09-30' },
  { student: 'b', academy: '아베크 강남', start: '2026-08-01', end: '2026-10-05' },
];
const L = (student, day, h, tags = [], payId = 'p1') => ({ student, payId, tags, date: { start: `${day}T10:00:00+09:00`, end: `${day}T${10 + h}:00:00+09:00` } });
const lessons = [
  L('a', '2026-10-10', 1), L('a', '2026-10-17', 1, ['당결']), L('a', '2026-10-24', 2, ['보강']),
  L('a', '2026-11-07', 1), L('b', '2026-11-08', 1.5), L('a', '2026-10-31T00:00:00'.slice(0, 10), 1),
];
const pays = [
  { id: 'p1', students: ['a'], academy: '아베크 강남', weekHours: 1.5, status: '진행 중' },
  { id: 'p2', students: ['a'], academy: '개인레슨', weekHours: 1, status: '진행 중' },
  { id: 'p3', students: ['b'], academy: '아베크 강남', weekHours: 2, status: '진행 중' }, // b는 열린 기수 없음
];
const r = compute({ tenures, lessons, pays }, now);
const oct = r.headcount.monthly.find((x) => x.month === '2026-10');
assert.deepStrictEqual([oct.total, oct.gangnam, oct.personal], [2, 2, 0]); // a,b 강남 / 개인레슨은 9월 종료
const sep = r.headcount.monthly.find((x) => x.month === '2026-09');
assert.deepStrictEqual([sep.total, sep.personal, sep.gangnam], [2, 1, 1]);
assert.strictEqual(r.thismonth.lessons, 3); // 당결 제외: 10/10, 10/24, 10/31
assert.strictEqual(r.thismonth.hours, 4);
const nov = r.headcount.futureMonthly.find((x) => x.month === '2026-11');
assert.strictEqual(nov.total, 2);
assert.strictEqual(r.now.find((x) => x.academy === '전체').students, 1);
const pay = r.pay.find((x) => x.academy === '전체');
assert.deepStrictEqual([pay.pages, pay.week_hours, pay.month_hours], [2, 2.5, 10]); // p1,p2만
assert.strictEqual(r.curWeek, '2026-10-26');
assert.ok(r.headcount.futureWeekly.every((x) => x.week > r.curWeek));
console.log('compute tests passed');
