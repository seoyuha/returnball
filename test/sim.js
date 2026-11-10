// 시험: 교사 1명 + 학생 5명이 자동 배정 → 경기 → 자동 재배정까지 되는지 확인 (FAST=1 서버 필요)
const { io } = require('socket.io-client');
const URL = process.env.URL || 'http://localhost:3555';
const call = (s, ev, d) => new Promise(r => s.emit(ev, d, r));
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const t = io(URL, { transports: ['websocket'] });
  const bad = await call(t, 't:login', { pw: '1234' }); console.log('틀린 비번:', bad.err);
  const lg = await call(t, 't:login', { pw: 'finel9932!' }); console.log('교사 로그인:', !!lg.ok, lg.classes.map(c => c.code).join(','));
  await call(t, 't:open', { code: '0608' });
  await call(t, 't:settings', { code: '0608', settings: { mode: 'touch', unit: 12, qSec: 4, minSec: 3, target: 3 } });
  const names = ['민준', '서연', '지호', '하은', '도윤'];
  const games = {}; const opps = {};
  const studs = await Promise.all(names.map(async n => {
    const s = io(URL, { transports: ['websocket'] }); const r = await call(s, 'join', { code: '0608', name: n });
    if (!r.ok) throw new Error(r.err);
    s.on('match', m => {
      if (m.state === 'flight' && m.ball && m.ball.to === m.me && !m.ball.answered) {
        const key = m.id + m.ball.q + m.ball.left; if (s._k === key) return; s._k = key;
        setTimeout(() => s.emit('answer', { pick: Math.random() < 0.75 ? 0 : 1 }, () => {}), 150 + Math.random() * 400);
      }
      if (m.state === 'ended' && s._end !== m.id) { s._end = m.id; games[n] = (games[n] || 0) + 1; (opps[n] = opps[n] || []).push(m.players[1 - m.me].name); }
    });
    return s;
  }));
  await call(t, 't:start', { code: '0608' });
  await sleep(25000);
  const rk = await call(t, 't:ranking', { code: '0608', by: 'points' });
  console.log('경기 수:', JSON.stringify(games)); console.log('상대:', JSON.stringify(opps));
  console.log('랭킹:', rk.cls.map(x => `${x.rank}.${x.name}(${x.points}점 ${x.wins}승 정답률${x.acc}%)`).join(' '));
  const q = await call(t, 't:questions', { code: '0608' }); console.log('많이 틀린 문제:', q.rows.filter(x => x.seen).sort((a, b) => b.rate - a.rate).slice(0, 2).map(x => `${x.q} ${x.rate}%`).join(' / '));
  const p = await call(t, 't:pause', { code: '0608' }); await sleep(800); const p2 = await call(t, 't:pause', { code: '0608' }); console.log('멈춤/다시:', p.view.paused, p2.view.paused);
  await sleep(4000);
  const st = await call(t, 't:stop', { code: '0608' }); console.log('종료 후 상태:', st.view.students.map(s => s.status).join(','));
  process.exit(0);
})().catch(e => { console.error('실패', e); process.exit(1); });
