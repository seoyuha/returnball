// B안 시험: 교사 + 학생 3명(+AI 1) — 이동·문제·치기·탈락·순위까지
const { io } = require('socket.io-client');
const URL = process.env.URL || 'http://localhost:3560';
const call = (s, ev, d) => new Promise(r => s.emit(ev, d, r));
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const t = io(URL, { transports: ['websocket'] });
  await call(t, 't:login', { pw: 'finel9932!' }); await call(t, 't:open', { code: '0608' });
  const st = await call(t, 't:settings', { code: '0608', settings: { mode: 'arena', groupSize: 4, hearts: 2, arenaMin: 2, unit: 12 } });
  console.log('설정:', st.view.settings.mode, st.view.settings.groupSize, st.view.settings.hearts);
  const counts = { as: 0, hit: 0, ko: 0, out: 0, end: 0, correct: 0, wrong: 0, strikeOk: 0 };
  let ended = null;
  for (const n of ['민준', '서연', '지호']) {
    const s = io(URL, { transports: ['websocket'] }); await call(s, 'join', { code: '0608', name: n });
    let A = null, q = null, me = 0, snap = null;
    s.on('arena', v => { A = v; q = v.q; me = v.me; });
    s.on('as', v => { snap = v; counts.as++; });
    s.on('aev', e => { if (e.k === 'hit') counts.hit++; if (e.k === 'ko') { counts.ko++; if (e.out) counts.out++; } if (e.k === 'end') { counts.end++; ended = ended || e; } });
    setInterval(() => { if (!snap) return; const p = snap.p[me]; const b = snap.b; let x = Math.cos(Date.now() / 700 + me), y = Math.sin(Date.now() / 900 + me);
      if (b && b[2] === me) { x = p[0] - b[0]; y = p[1] - b[1]; const l = Math.hypot(x, y) || 1; x /= l; y /= l; if (Math.hypot(p[0] - b[0], p[1] - b[1]) < 120 && p[6] > 0) s.emit('astrike', {}, r => { if (r.ok) counts.strikeOk++; }); }
      s.emit('amove', { x, y }); }, 100);
    setInterval(async () => { if (!q) return; const r = await call(s, 'aanswer', { pick: Math.floor(Math.random() * 3) }); if (r.ok) { r.correct ? counts.correct++ : counts.wrong++; q = r.next; } }, 1300);
  }
  await call(t, 't:start', { code: '0608' });
  for (let i = 0; i < 45 && !ended; i++) await sleep(1000);
  console.log('이벤트:', JSON.stringify(counts));
  console.log('결과:', ended ? ended.places.map(p => `${p.place}위(idx${p.idx}) +${p.gain} 치기${p.hits} 정답${p.correct} 하트${p.hearts}`).join(' / ') + ' · ' + ended.why : '안 끝남');
  const rk = await call(t, 't:ranking', { code: '0608', by: 'points' }); console.log('랭킹:', rk.cls.map(x => `${x.rank}.${x.name} ${x.points}점`).join(' '));
  const sv = await call(t, 't:open', { code: '0608' }); console.log('교사 경기 카드:', JSON.stringify(sv.view.live[0] && { mode: sv.view.live[0].mode, players: sv.view.live[0].players.map(p => p.name + ':' + p.hearts) }));
  const stp = await call(t, 't:stop', { code: '0608' }); console.log('수업 마무리:', stp.summary && stp.summary.podium.map(p => p.rank + '위 ' + p.names.join(',')).join(' / '));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
