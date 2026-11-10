// 대회 시험: COMP=tournament|league, 학생 N명 자동 조작 → 라운드 진행·탈락자 재배정·우승/리그 종료 확인
const { io } = require('socket.io-client');
const { buildQuestions } = require('../questions');
const ANS = Object.fromEntries(buildQuestions().map(q => [q.q, q.answer]));
const URL = process.env.URL || 'http://localhost:3561', COMP = process.env.COMP || 'tournament', N = Number(process.env.N || 6), SECS = Number(process.env.SECS || 200), SKILL = Number(process.env.SKILL || .9);
const call = (s, ev, d) => new Promise(r => s.emit(ev, d, r));
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const t = io(URL, { transports: ['websocket'] });
  await call(t, 't:login', { pw: 'finel9932!' }); await call(t, 't:open', { code: '0608' });
  await call(t, 't:settings', { code: '0608', settings: { mode: 'arena', comp: COMP, groupSize: 4, hearts: 1, arenaMin: 2, leagueGames: 2, unit: 11 } });
  let champion = null; t.on('champion', c => { champion = c.name; });
  const log = { results: 0, early: 0, revive: 0, reviveStart: 0, final: 0, fever: 0, super: 0, hits: 0 };
  const names = ['민준', '서연', '지호', '하은', '도윤', '수아', '예준', '지우'].slice(0, N);
  for (const n of names) {
    const s = io(URL, { transports: ['websocket'] }); await call(s, 'join', { code: '0608', name: n });
    let q = null, me = 0, snap = null, lockUntil = 0;
    s.on('arena', v => { q = v.q; me = v.me; snap = v.s; });
    s.on('as', v => { snap = v; });
    s.on('aev', e => {
      if (e.k === 'result') { log.results++; if (e.early) log.early++; }
      if (e.k === 'ko' && e.reviving && e.who === me) log.reviveStart++;
      if (e.k === 'revive' && e.who === me) log.revive++;
      if (e.k === 'final' && e.idx && e.idx[0] === me) log.final++;
      if (e.k === 'fever' && me === 0) log.fever++;
      if (e.k === 'hit' && e.who === me) { log.hits++; if (e.super) log.super++; }
    });
    setInterval(() => { if (!snap || !snap.p[me]) return; const p = snap.p[me], b = snap.b; let x = Math.cos(Date.now() / 700 + me), y = Math.sin(Date.now() / 900 + me);
      if (b && b[2] === me) { x = p[0] - b[0]; y = p[1] - b[1]; const l = Math.hypot(x, y) || 1; x /= l; y /= l; if (Math.hypot(p[0] - b[0], (p[1] - 40 - b[1]) / .75) < 140 && (p[6] > 0 || p[8]) && Math.random() < SKILL) s.emit('astrike', {}, () => {}); }
      s.emit('amove', { x, y }); }, 90);
    setInterval(async () => { if (!q || Date.now() < lockUntil) return; let i = q.choices.indexOf(ANS[q.q]); if (Math.random() > .8) i = (i + 1) % 3; const r = await call(s, 'aanswer', { pick: i }); if (r.ok) { q = r.next; if (r.lockMs) lockUntil = Date.now() + r.lockMs; } }, 900);
  }
  await call(t, 't:start', { code: '0608' });
  let last = '';
  for (let i = 0; i < SECS; i++) {
    await sleep(1000);
    const v = (await call(t, 't:open', { code: '0608' })).view; const cv = v.comp;
    const line = COMP === 'tournament' ? `R${cv.round} 남은:${(cv.alive || []).join(',')} 우승:${cv.champion || '-'} 경기:${v.live.filter(m => m.state !== 'ended').map(m => m.label + '[' + m.players.map(p => p.name).join(',') + ']').join(' ')}` : `리그 ${cv.done ? '끝' : '진행'} ` + (cv.table || []).map(r => `${r.rank}.${r.name}(${r.pts}점/${r.played}경기)`).join(' ');
    if (line !== last && i % 3 === 0) { console.log(`${i}s`, line); last = line; }
    if ((COMP === 'tournament' && champion) || (COMP === 'league' && cv.done)) { console.log('완료!', COMP === 'tournament' ? '우승 ' + champion : ''); break; }
  }
  console.log('이벤트:', JSON.stringify(log));
  const stp = await call(t, 't:stop', { code: '0608' }); console.log('마무리:', JSON.stringify(stp.summary && { champion: stp.summary.champion, league: stp.summary.league && stp.summary.league.map(r => r.name + r.pts), podium: stp.summary.podium.map(p => p.rank + p.names.join(',')) }));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
