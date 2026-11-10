// 자동 학생들(시연·시험용): NAMES="가,나,다" SKILL=0.5 node test/bots.js
const { io } = require('socket.io-client');
const { buildQuestions } = require('../questions');
const ANS = Object.fromEntries(buildQuestions().map(q => [q.q, q.answer]));
const URL = process.env.URL || 'http://localhost:3000', SKILL = Number(process.env.SKILL || .5), CODE = process.env.CODE || '0608';
const call = (s, ev, d) => new Promise(r => s.emit(ev, d, r));
(async () => {
  for (const n of (process.env.NAMES || '서연,지호,하은,도윤,수아').split(',')) {
    const s = io(URL, { transports: ['websocket'] }); await call(s, 'join', { code: CODE, name: n });
    let q = null, me = 0, snap = null, lockUntil = 0, nextAns = 0;
    s.on('arena', v => { q = v.q; me = v.me; snap = v.s; });
    s.on('as', v => { snap = v; });
    setInterval(() => { if (!snap || !snap.p[me]) return; const p = snap.p[me], b = snap.b; let x = Math.cos(Date.now() / 900 + me * 2), y = Math.sin(Date.now() / 1100 + me);
      if (b && b[2] === me) { x = p[0] - b[0]; y = p[1] - b[1]; const l = Math.hypot(x, y) || 1; x /= l; y /= l; if (Math.hypot(p[0] - b[0], (p[1] - 40 - b[1]) / .75) < 135 && (p[6] > 0 || p[8]) && Math.random() < SKILL) s.emit('astrike', {}, () => {}); }
      s.emit('amove', { x: x * .8, y: y * .8 }); }, 110);
    setInterval(async () => { if (!q || Date.now() < lockUntil || Date.now() < nextAns) return; nextAns = Date.now() + 1800 + Math.random() * 2200; let i = q.choices.indexOf(ANS[q.q]); if (Math.random() > .78) i = (i + 1) % 3; const r = await call(s, 'aanswer', { pick: i }); if (r.ok) { q = r.next; if (r.lockMs) lockUntil = Date.now() + r.lockMs; } }, 300);
  }
})();
