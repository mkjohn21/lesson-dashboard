'use strict';
const n = require('./notion');

const DS = {
  tenure: process.env.DS_TENURE || '60e5cac0-608f-4d16-8067-b8185e85cf2f', // 수강 기수
  lesson: process.env.DS_LESSON || '3524913c-cbdb-8151-b32a-000b7c1d478e', // 수업기록
  pay: process.env.DS_PAY || '25c5b493-d13e-4046-923c-86b64e8abff8', // 학생 급여정보
};

async function load() {
  const [t, l, p] = await Promise.all([
    n.queryAll(DS.tenure, ['학생', '학원', '시작일', '종료일']),
    n.queryAll(DS.lesson, ['학생 이름', '연결 정보', '수업일', '특이사항']),
    n.queryAll(DS.pay, ['학생 이름', '학원 이름', '주당시간', '급여 적용상태']),
  ]);
  return {
    tenures: t.map((x) => ({
      student: n.rel(x, '학생')[0] || null,
      academy: n.sel(x, '학원'),
      start: (n.date(x, '시작일') || {}).start || null,
      end: (n.date(x, '종료일') || {}).start || null,
    })),
    lessons: l.map((x) => ({
      student: n.rel(x, '학생 이름')[0] || null,
      payId: n.rel(x, '연결 정보')[0] || null,
      date: n.date(x, '수업일'),
      tags: n.multi(x, '특이사항'),
    })),
    pays: p.map((x) => ({
      id: x.id,
      students: n.rel(x, '학생 이름'),
      academy: n.sel(x, '학원 이름'),
      weekHours: n.num(x, '주당시간'),
      status: n.status(x, '급여 적용상태'),
    })),
  };
}

module.exports = { load };
