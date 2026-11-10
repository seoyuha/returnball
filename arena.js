// 영어 리턴볼 B안 — 경기장 이동형 (블레이드볼 방식)
// 2~4명이 한 경기장에서 움직이고, 황금 공은 한 명을 골라 휘어지며 쫓아가요.
// 위쪽 영어 문제를 맞히면 '치기'가 1번 충전돼요(최대 3). 3문제 연속 정답이면 '슈퍼 치기'.
// 틀리면 잠깐 문제를 풀 수 없어요(연속으로 틀릴수록 길어져요: 2초 → 3.5초 → 5초).
// 공이 가까이 왔을 때 치기를 누르면, 내가 바라보는(마지막으로 움직인) 쪽 친구에게 공이 날아가요.
// 공에 맞으면 하트 -1. 하트를 다 잃으면 '부활 도전'(15초 안에 3문제 연속 정답, 경기당 1번).
// 부활하지 못하면 순위가 정해지고, 탈락한 친구들끼리 곧바로 새 경기에 배정돼요.
// 2명이 남으면 결승 연출, 랠리 8번 이상이면 피버 타임(받아치기 2배).
// 대회 방식: 자유 경기 / 토너먼트(라운드마다 상위만 진출, 탈락하면 자유 경기) / 리그전(정한 경기 수만큼, 승점표).
// 좌표는 1600×900 화면 좌표 그대로 써요(바닥을 비스듬히 내려다본 경기장).

const TICK = 1000 / 30, SEND_EVERY = 2;            // 30번/초 계산, 15번/초 전송
const COLORS = ['blue', 'red', 'green', 'purple'];
// 경기장 바닥 경계(그래픽 설명서 좌표) — 실제 이동은 안쪽으로 여유를 둬요
const COURT = {
  11: { y0: 192, y1: 778, tl: 178, tr: 1422, bl: 20, br: 1579, top: 262, bot: 730, pad: 70 },
  12: { y0: 192, y1: 745, tl: 120, tr: 1480, bl: 19, br: 1580, top: 262, bot: 700, pad: 70 },
};
const P_SPEED = 330, BALL_BASE = 270, BALL_UP = 38, BALL_MAX = 800, KO_R = 40, STRIKE_R = 150, STRIKE_MS = 450, STRIKE_CD = 650, SERVE_MS = 2300;
const KO_GRACE = 180;      // 공이 닿아도 이만큼 기다려요(늦게 도착한 치기를 살려 주는 시간)
const LAG_MS = 260;        // 치기를 누르면 최근 이만큼 사이 공 위치까지 보고 판정(학교 와이파이 지연 보정)
const LOCKS = [2000, 3500, 5000];
const REVIVE_MS = 15000, REVIVE_NEED = 3, FEVER_AT = 8, SUPER_STREAK = 3, FINAL_BOOST = 70, SUPER_BOOST = 170;
const EARLY_STAY = 6000;   // 먼저 탈락한 학생이 결과를 보는 시간 → 그다음 탈락한 친구들과 새 경기

module.exports = function makeArena(ctx) {
  const { io, matches, clsOf, feed, pushClass, save, stat, sessionMatch, poolFor, pickQuestion, shuffle, rid, BOT_NAMES, COUNTDOWN, RESULT_STAY, studentOf } = ctx;

  const cr = u => COURT[u] || COURT[11];
  function xBounds(u, y) { const c = cr(u), k = (y - c.y0) / (c.y1 - c.y0); return [c.tl + (c.bl - c.tl) * k + c.pad, c.tr + (c.br - c.tr) * k - c.pad]; }
  function clampP(u, p) { const c = cr(u); p.y = Math.max(c.top, Math.min(c.bot, p.y)); const [a, b] = xBounds(u, p.y); p.x = Math.max(a, Math.min(b, p.x)); }
  function sc(u, y) { const c = cr(u); return .62 + .38 * Math.max(0, Math.min(1, (y - c.top) / (c.bot - c.top))); }
  function wdist(u, a, b) { return Math.hypot(a.x - b.x, (a.y - b.y) / .75) / sc(u, (a.y + b.y) / 2); }
  const chest = (m, p) => ({ x: p.x, y: p.y - 40 * sc(m.unit, p.y) });
  const alive = m => m.players.filter(p => !p.out);
  const active = m => m.players.filter(p => !p.finished);

  function newQ(m, p) {
    const q = pickQuestion(m, p); p.seen.add(q.id); p.lastQ = q.id;
    const choices = shuffle([q.answer, ...q.wrong].slice());
    p.q = { id: q.id, q: q.q, pic: q.pic, choices, correctIdx: choices.indexOf(q.answer), answer: q.answer, exp: q.exp, src: q, at: Date.now() };
  }
  function qView(p) { return p.q ? { id: p.q.id, q: p.q.q, pic: p.q.pic, choices: p.q.choices, at: p.q.at } : null; }
  function randomSpot(m) { const C = cr(m.unit); const y = C.top + (C.bot - C.top) * (.2 + Math.random() * .6); const [a, b] = xBounds(m.unit, y); return { x: a + (b - a) * (.15 + Math.random() * .7), y }; }

  /* ===================== 경기 만들기 ===================== */
  function create(c, studs, opts = {}) {
    const st = c.settings, n = Math.max(2, Math.min(4, opts.size || studs.length || st.groupSize || 4));
    const id = rid(), u = st.unit, C = cr(u);
    const names = shuffle(BOT_NAMES.slice());
    const list = studs.slice(0, n); while (list.length < n) list.push(null);
    const spots = [[.22, .3], [.78, .3], [.22, .82], [.78, .82]];
    const players = list.map((s, i) => {
      const y = C.top + (C.bot - C.top) * spots[i][1]; const [a, b] = xBounds(u, y);
      return { idx: i, pid: s ? s.id : 'bot-' + rid(), name: s ? s.name : names[i % names.length], isBot: !s, side: i, color: COLORS[i],
        x: a + (b - a) * spots[i][0], y, fx: spots[i][0] < .5 ? 1 : -1, fy: 0, mx: 0, my: 0, moving: false,
        hearts: st.hearts || 2, out: false, charges: 0, strikeUntil: 0, strikeCd: 0, lockUntil: 0, streak: 0, wrongStreak: 0, super: false,
        revived: false, reviving: null, finished: false, place: 0,
        hits: 0, kos: 0, correct: 0, wrong: 0, timeouts: 0, fastest: 0, seen: new Set(), missed: new Set(), lastQ: null, q: null,
        bot: s ? null : { wx: 0, wy: 0, wt: 0, nextCharge: Date.now() + 2500 + Math.random() * 2000, decided: null } };
    });
    const m = { id, mode: 'arena', code: c.code, unit: u, practice: !!opts.practice, pool: poolFor(u), botAcc: st.botAcc, players, startN: n,
      tour: opts.tour || null, league: !!opts.league, advance: opts.tour ? opts.tour.advance : 1,
      dur: (st.arenaMin || 3) * 60000, elapsed: 0, state: 'countdown', startAt: Date.now() + COUNTDOWN, ball: null, serveAt: 0, base: BALL_BASE,
      rally: 0, bestRally: 0, fever: false, finalOn: false, lastKO: null, hist: [], history: [], createdAt: Date.now(), tick: 0, last: Date.now() };
    for (const p of players) newQ(m, p);
    matches.set(id, m);
    for (const s of studs) if (s) {
      s.matchId = id; s.status = opts.practice ? 'practice' : 'playing'; s.waitSince = 0;
      if (!opts.practice) s.recentOpp = studs.filter(x => x && x !== s).map(x => x.id).concat(s.recentOpp).slice(0, 6);
      const sock = s.socketId && io.sockets.sockets.get(s.socketId); if (sock) sock.join('m:' + id);
    }
    for (const p of players) { const s = !p.isBot && studentOf(m, p); if (s && s.socketId) io.to(s.socketId).emit('arena', view(m, p.idx)); }
    if (!m.practice) { pushClass(c); feed(c, `🏟 ${m.tour ? (m.tour.final ? '🏆 토너먼트 결승! ' : `토너먼트 ${m.tour.round}라운드 · `) : ''}${players.map(p => p.name).join(' · ')} 경기장 입장!`); pushT(m); }
    m.loop = setInterval(() => step(m), TICK);
    return m;
  }

  function label(m) { return m.practice ? '연습 경기' : m.tour ? (m.tour.final ? '토너먼트 결승' : `토너먼트 ${m.tour.round}라운드 · 상위 ${m.advance}명 진출`) : m.league ? '리그전' : '자유 경기'; }
  function view(m, me) {
    return { id: m.id, mode: 'arena', unit: m.unit, practice: m.practice, me, state: m.state, startIn: Math.max(0, m.startAt - Date.now()), dur: m.dur, label: label(m), advance: m.advance, tour: m.tour,
      hearts0: Math.max(...m.players.map(p => p.hearts), 1),
      players: m.players.map(p => ({ idx: p.idx, name: p.name, isBot: p.isBot, color: p.color, hearts: p.hearts, out: p.out })), q: me != null && m.players[me] ? qView(m.players[me]) : null, s: snap(m) };
  }
  function snap(m) {
    const b = m.ball, now = Date.now();
    return { t: now, st: m.state, tl: Math.max(0, m.dur - m.elapsed), r: m.rally, fv: m.fever ? 1 : 0, fin: m.finalOn ? 1 : 0,
      b: b ? [Math.round(b.x), Math.round(b.y), b.target, Math.round(b.v), b.hot ? 1 : 0, now < (b.superUntil || 0) ? 1 : 0] : null, sv: m.state === 'serve' ? Math.max(0, m.serveAt - now) : 0,
      p: m.players.map(p => [Math.round(p.x), Math.round(p.y), p.fx >= 0 ? 1 : -1, p.moving ? 1 : 0, p.hearts, p.out ? 1 : 0, p.charges, now < p.strikeUntil ? 1 : 0, p.super ? 1 : 0,
        p.reviving ? Math.max(0, Math.ceil((p.reviving.until - now) / 1000)) : 0, p.reviving ? p.reviving.got : 0, p.finished ? 1 : 0, Math.round(p.fx * 100) / 100, Math.round(p.fy * 100) / 100]) };
  }
  function ev(m, e) { e.t = Date.now(); io.to('m:' + m.id).emit('aev', e); }
  function pushT(m) { if (!m.practice) io.to('t:' + m.code).emit('tmatch', tView(m)); }
  function tView(m) {
    return { id: m.id, mode: 'arena', state: m.state, unit: m.unit, rally: m.rally, bestRally: m.bestRally, timeLeft: Math.max(0, m.dur - m.elapsed), target: m.ball ? m.ball.target : null, winner: m.winner,
      label: label(m), fever: m.fever, finalOn: m.finalOn,
      players: m.players.map(p => ({ name: p.name, isBot: p.isBot, color: p.color, hearts: p.hearts, out: p.out, reviving: !!p.reviving, finished: p.finished, charges: p.charges, hits: p.hits, place: p.place || 0, correct: p.correct, wrong: p.wrong })) };
  }

  /* ===================== 공 ===================== */
  function serve(m, delay) { m.ball = null; m.state = 'serve'; m.serveAt = Date.now() + delay; m.rally = 0; m.fever = false; m.hist = []; }
  function spawn(m) {
    const al = alive(m); if (al.length <= Math.max(1, m.advance) && m.startN > 1) return end(m, 'last');
    // 방금 공에 맞은 친구는 첫 목표에서 빼요(한 명만 계속 노려지지 않게)
    let pool = al.filter(p => p.idx !== m.lastKO); if (!pool.length) pool = al;
    const C = cr(m.unit), t = pool[Math.floor(Math.random() * pool.length)];
    const b = { x: 800, y: (C.top + C.bot) / 2, v: m.base, target: t.idx, grace: Date.now() + 300, hot: false, koAt: 0 };
    b.a = Math.atan2((t.y - b.y) / .75, t.x - b.x); m.ball = b; m.state = 'play';
    ev(m, { k: 'serve', target: t.idx }); pushT(m);
  }
  function retarget(m, from) {
    const al = alive(m).filter(p => p.idx !== from.idx); if (!al.length) return null;
    const fl = Math.hypot(from.fx, from.fy) || 1, fx = from.fx / fl, fy = from.fy / fl;
    let best = null, bs = -9;
    for (const p of al) { const dx = p.x - from.x, dy = (p.y - from.y) / .75, d = Math.hypot(dx, dy) || 1; const s = (dx * fx + dy * fy) / d; if (s > bs) { bs = s; best = p; } }
    return best;
  }

  /* ===================== 한 번 계산 ===================== */
  function step(m) {
    const now = Date.now(); const dt = Math.min(.1, (now - m.last) / 1000); m.last = now;
    const c = clsOf(m);
    if (m.state === 'ended') return;
    if (c && c.paused && !m.practice) { if (!m.paused) { m.paused = true; m.pauseState = m.state; m.state = 'paused'; send(m); pushT(m); } return; }
    if (m.paused) { m.paused = false; m.state = m.pauseState; m.serveAt = Math.max(m.serveAt, now + 1500); m.startAt = Math.max(m.startAt, now + 1500); if (m.ball) m.ball.grace = now + 900; for (const p of m.players) if (p.reviving) p.reviving.until += 3000; }
    if (m.state === 'countdown') { if (now >= m.startAt) serve(m, 900); else { if (++m.tick % SEND_EVERY === 0) send(m); return; } }
    m.elapsed += dt * 1000;
    // 부활 도전 시간이 끝나면 순위 확정
    for (const p of m.players) if (p.reviving && now > p.reviving.until) finalOut(m, p);
    if (m.state === 'ended') return;
    // 사람·AI 움직이기
    for (const p of m.players) {
      if (p.out) { p.moving = false; continue; }
      if (p.isBot) botThink(m, p, now);
      const l = Math.hypot(p.mx, p.my);
      if (l > .15) {
        const k = Math.min(1, l), nx = p.mx / l, ny = p.my / l, s = sc(m.unit, p.y);
        p.x += nx * k * P_SPEED * s * dt; p.y += ny * k * P_SPEED * s * .75 * dt; p.fx = nx; p.fy = ny; p.moving = true;
      } else p.moving = false;
      clampP(m.unit, p);
    }
    if (m.state === 'serve' && now >= m.serveAt) spawn(m);
    const b = m.ball;
    if (m.state === 'play' && b) {
      let t = m.players[b.target];
      if (!t || t.out) { const al = alive(m); if (al.length <= Math.max(1, m.advance)) return end(m, 'last'); t = al[Math.floor(Math.random() * al.length)]; b.target = t.idx; b.koAt = 0; }
      const cp = chest(m, t);
      if (!b.koAt) { // 휘어지며 쫓아가기
        const want = Math.atan2((cp.y - b.y) / .75, cp.x - b.x);
        let da = want - b.a; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
        const turn = (3.1 + b.v / 360) * dt; b.a += Math.max(-turn, Math.min(turn, da));
        const s = sc(m.unit, b.y); b.x += Math.cos(b.a) * b.v * s * dt; b.y += Math.sin(b.a) * b.v * s * .75 * dt;
        const C = cr(m.unit); b.y = Math.max(C.top - 120, Math.min(C.bot + 20, b.y)); b.x = Math.max(40, Math.min(1560, b.x));
      } else { b.x += (cp.x - b.x) * .5; b.y += (cp.y - b.y) * .5; }
      m.hist.push({ t: now, x: b.x, y: b.y }); if (m.hist.length > 16) m.hist.shift();
      const d = wdist(m.unit, b, cp);
      if (now < t.strikeUntil && (d < STRIKE_R || b.koAt)) hit(m, t, d);
      else if (d < KO_R && now > b.grace) { if (!b.koAt) b.koAt = now + KO_GRACE; else if (now >= b.koAt) ko(m, t); }
    }
    if (m.state !== 'ended' && m.elapsed >= m.dur) return end(m, 'time');
    if (++m.tick % SEND_EVERY === 0) send(m);
    if (m.tick % 30 === 0) pushT(m);
  }
  function send(m) { io.to('m:' + m.id).emit('as', snap(m)); }

  function hit(m, p, d, isSuper) {
    const b = m.ball, to = retarget(m, p); if (!to) return;
    isSuper = isSuper || p.superArmed; p.superArmed = false;
    p.strikeUntil = 0; m.rally++; m.bestRally = Math.max(m.bestRally, m.rally); b.koAt = 0;
    let feverStart = false; if (m.rally >= FEVER_AT && !m.fever) { m.fever = true; feverStart = true; }
    p.hits += m.fever ? 2 : 1;
    b.target = to.idx; b.v = Math.min(BALL_MAX, b.v + BALL_UP + (isSuper ? SUPER_BOOST : 0)); b.grace = Date.now() + (isSuper ? 200 : 320); b.hot = b.v > 520 || m.fever;
    if (isSuper) b.superUntil = Date.now() + 1500;
    const fl = Math.hypot(p.fx, p.fy) || 1; b.a = Math.atan2(p.fy / fl, p.fx / fl);
    const perfect = d < STRIKE_R * .45;
    ev(m, { k: 'hit', who: p.idx, to: to.idx, x: Math.round(b.x), y: Math.round(b.y), perfect, super: !!isSuper, fever: m.fever, rally: m.rally });
    if (feverStart) ev(m, { k: 'fever', rally: m.rally });
    pushT(m);
  }
  function ko(m, p) {
    p.hearts = Math.max(0, p.hearts - 1); p.kos++; m.lastKO = p.idx;
    const e = { k: 'ko', who: p.idx, x: Math.round(p.x), y: Math.round(p.y), hearts: p.hearts, rally: m.rally };
    m.ball = null;
    if (p.hearts === 0) {
      p.out = true; p.charges = 0; p.super = false; e.out = true;
      const othersAlive = alive(m).length;
      if (!p.revived && othersAlive > Math.max(1, m.advance)) { p.reviving = { got: 0, until: Date.now() + REVIVE_MS }; e.reviving = true; p.lockUntil = 0; }
    }
    ev(m, e);
    if (p.out && !p.reviving) finalOut(m, p, true);
    if (m.state === 'ended') return;
    if (checkFinal(m)) return;
    serve(m, SERVE_MS); pushT(m);
  }
  // 2명만 남으면 결승 연출 (부활 도전 중인 친구가 있으면 기다려요)
  function checkFinal(m) {
    const al = alive(m);
    if (al.length <= Math.max(1, m.advance) && !m.players.some(p => p.reviving)) { m.state = 'serve'; m.ball = null; setTimeout(() => end(m, 'last'), 1400); pushT(m); return true; }
    if (!m.finalOn && m.startN >= 3 && m.advance === 1 && al.length === 2 && !m.players.some(p => p.reviving)) {
      m.finalOn = true; m.base = BALL_BASE + FINAL_BOOST;
      ev(m, { k: 'final', names: al.map(p => p.name), idx: al.map(p => p.idx), tourFinal: !!(m.tour && m.tour.final) });
      serve(m, 3600); pushT(m); return true;
    }
    return false;
  }
  function revive(m, p) {
    p.out = false; p.reviving = null; p.revived = true; p.hearts = 1; p.charges = 1; Object.assign(p, randomSpot(m));
    ev(m, { k: 'revive', who: p.idx, x: Math.round(p.x), y: Math.round(p.y) }); pushT(m);
    if (m.state === 'serve' && m.ball == null) m.serveAt = Math.max(m.serveAt, Date.now() + 1200);
  }
  // 순위 확정: 남은(아직 끝나지 않은) 사람 수가 곧 내 등수
  function finalOut(m, p, quiet) {
    if (p.finished) return;
    p.reviving = null; p.out = true; p.place = active(m).length;
    ev(m, { k: 'gone', who: p.idx, place: p.place });
    finish(m, p, true);
    if (!quiet && m.state !== 'ended' && m.state !== 'countdown') checkFinal(m);
  }

  /* ===================== AI ===================== */
  function botThink(m, p, now) {
    const B = p.bot, b = m.ball, C = cr(m.unit);
    if (now > B.nextCharge) { B.nextCharge = now + 2200 + Math.random() * 2600; if (p.charges < 3 && Math.random() * 100 < m.botAcc) p.charges++; }
    if (b && b.target === p.idx && m.state === 'play') {
      let ax = p.x - b.x, ay = (p.y - b.y) / .75; const l = Math.hypot(ax, ay) || 1; ax /= l; ay /= l;
      const side = Math.sin(now / 600 + p.idx) > 0 ? 1 : -1; p.mx = ax * .7 - ay * .6 * side; p.my = ay * .7 + ax * .6 * side;
      const [lx, rx] = xBounds(m.unit, p.y); if (p.x < lx + 40) p.mx = Math.abs(p.mx); if (p.x > rx - 40) p.mx = -Math.abs(p.mx); if (p.y < C.top + 30) p.my = Math.abs(p.my); if (p.y > C.bot - 30) p.my = -Math.abs(p.my);
      const d = wdist(m.unit, b, chest(m, p));
      if (B.decided !== b.target + ':' + m.rally && d < STRIKE_R * .8) {
        B.decided = b.target + ':' + m.rally;
        if (p.charges > 0 && Math.random() < .55 + m.botAcc / 260) {
          const al = alive(m).filter(x => x.idx !== p.idx); const pref = al.filter(x => !x.isBot); const pl = pref.length && Math.random() < .6 ? pref : al; const tgt = pl[Math.floor(Math.random() * pl.length)];
          if (tgt) { p.fx = tgt.x - p.x; p.fy = (tgt.y - p.y); }
          press(m, p);
        }
      }
    } else {
      if (now > B.wt || Math.hypot(B.wx - p.x, B.wy - p.y) < 30) { B.wy = C.top + Math.random() * (C.bot - C.top); const [a, c2] = xBounds(m.unit, B.wy); B.wx = a + Math.random() * (c2 - a); B.wt = now + 1500 + Math.random() * 2000; }
      const dx = B.wx - p.x, dy = B.wy - p.y, l = Math.hypot(dx, dy) || 1; const k = l > 60 ? .7 : 0; p.mx = dx / l * k; p.my = dy / l * k;
    }
  }

  /* ===================== 학생 입력 ===================== */
  function press(m, p) {
    const now = Date.now();
    if (m.state === 'ended' || p.out) return { err: '지금은 칠 수 없어요.' };
    if (now < p.strikeCd) return { err: '잠깐만요!' };
    let isSuper = false;
    if (p.super) { p.super = false; isSuper = true; } else if (p.charges > 0) p.charges--; else return { err: '문제를 맞혀서 치기를 충전해요!' };
    p.strikeUntil = now + STRIKE_MS; p.strikeCd = now + STRIKE_CD; p.superArmed = isSuper;
    ev(m, { k: 'swing', who: p.idx, super: isSuper });
    // 지연 보정: 학생 화면은 조금 늦게 보이니까, 최근 0.26초 사이 공이 치기 범위 안이었으면 바로 받아쳐요
    const b = m.ball;
    if (b && m.state === 'play' && b.target === p.idx) {
      const cp = chest(m, p); let best = wdist(m.unit, b, cp);
      for (const h of m.hist) if (h.t >= now - LAG_MS) best = Math.min(best, wdist(m.unit, h, cp));
      if (best < STRIKE_R) hit(m, p, best, isSuper);
    }
    return { ok: true, charges: p.charges, super: isSuper };
  }
  function input(m, p, d) { if (p.out) return; const x = Number(d.x) || 0, y = Number(d.y) || 0, l = Math.hypot(x, y); p.mx = l > 1 ? x / l : x; p.my = l > 1 ? y / l : y; }
  function answer(m, p, pick) {
    const now = Date.now(); if (m.state === 'ended' || p.finished) return { err: '경기가 끝났어요.' };
    if (now < p.lockUntil) return { err: '잠깐! 곧 다음 문제가 나와요.' };
    const q = p.q; if (!q) return { err: '문제가 없어요.' };
    const ok = pick === q.correctIdx, ms = now - q.at;
    stat(m, p, q.src, ok, false, q.choices[pick]);
    const res = { ok: true, correct: ok, correctIdx: q.correctIdx, answer: q.answer, exp: q.exp };
    if (ok) {
      p.correct++; p.wrongStreak = 0; if (!p.fastest || ms < p.fastest) p.fastest = ms;
      if (p.reviving) { p.reviving.got++; res.reviveGot = p.reviving.got; if (p.reviving.got >= REVIVE_NEED) { revive(m, p); res.revived = true; } }
      else if (!p.out) { p.charges = Math.min(3, p.charges + 1); p.streak++; if (p.streak % SUPER_STREAK === 0 && !p.super) { p.super = true; res.super = true; } }
      res.lockMs = 0;
    } else {
      p.wrong++; p.missed.add(q.id); p.streak = 0; if (p.reviving) { p.reviving.got = 0; res.reviveGot = 0; }
      res.lockMs = LOCKS[Math.min(LOCKS.length - 1, p.wrongStreak)]; p.wrongStreak++; p.lockUntil = now + res.lockMs;
      m.history.push({ q: q.q, answer: q.answer, picked: q.choices[pick], who: p.name });
    }
    res.charges = p.charges; res.streak = p.streak;
    newQ(m, p); res.next = qView(p);
    return res;
  }

  /* ===================== 끝 · 점수 ===================== */
  const PTS = [12, 8, 5, 3];
  // 점수 = 순위 점수 + 정답 2개당 1점 + 받아치기(피버 중에는 2배)
  function gainOf(m, p) { const n = m.startN, base = n <= 2 ? [12, 6][p.place - 1] : PTS[p.place - 1]; return (base || 3) + Math.floor(p.correct / 2) + p.hits; }
  function result(m, p, early) {
    return { k: 'result', early, place: p.place, of: m.startN, gain: p.gain || 0, hits: p.hits, correct: p.correct, label: label(m), practice: m.practice, tour: m.tour, advance: m.advance,
      advanced: !!(m.tour && p.place <= m.advance), history: m.history.filter(h => h.who === p.name).slice(-4), bestRally: m.bestRally,
      places: m.players.map(x => ({ idx: x.idx, place: x.place, gain: x.gain || 0, hits: x.hits, correct: x.correct, hearts: x.hearts, finished: x.finished })) };
  }
  function finish(m, p, early) {
    if (p.finished) return; p.finished = true;
    const c = clsOf(m);
    p.gain = m.practice ? 0 : gainOf(m, p);
    if (p.isBot || !c) return;
    const s = c.students[p.pid];
    if (!m.practice && s) {
      const S = s.stats; S.games++; if (m.players.some(x => x.isBot)) S.aiGames++; S.points += p.gain;
      if (p.place === 1) S.wins++; else S.losses++;
      S.correct += p.correct; S.wrong += p.wrong; S.bestRally = Math.max(S.bestRally, m.bestRally);
      if (p.fastest && (!S.fastest || p.fastest < S.fastest)) S.fastest = p.fastest;
      compPlayerDone(c, m, p, s);
    }
    if (s && s.matchId === m.id) {
      const sock = s.socketId && io.sockets.sockets.get(s.socketId);
      if (sock) { sock.emit('aev', Object.assign(result(m, p, early), { t: Date.now() })); if (early) sock.leave('m:' + m.id); else setTimeout(() => sock.leave('m:' + m.id), RESULT_STAY); }
      if (m.practice) { s.status = c.running ? 'waiting' : 'lobby'; s.matchId = null; s.waitSince = Date.now(); }
      else { s.status = 'result'; s.readyAt = Date.now() + (early ? EARLY_STAY : RESULT_STAY + 2000); s.waitSince = s.readyAt; s.matchId = null; s.afterEarly = !!early; }
    }
    if (early && !m.practice) { save(); pushClass(c); }
  }
  function end(m, why) {
    if (m.state === 'ended') return;
    clearInterval(m.loop); m.state = 'ended'; m.why = why; m.ball = null; m.endedAt = Date.now();
    const rest = active(m).sort((a, b) => (a.out - b.out) || (b.hearts - a.hearts) || (b.hits - a.hits) || (b.correct - a.correct));
    rest.forEach((p, i) => { p.place = i + 1; p.reviving = null; });
    const order = m.players.slice().sort((a, b) => a.place - b.place);
    m.winner = order[0].idx;
    ev(m, { k: 'end', why, places: m.players.map(p => ({ idx: p.idx, place: p.place })), bestRally: m.bestRally });
    for (const p of rest) p.gain = m.practice ? 0 : gainOf(m, p); // 결과를 보내기 전에 모두의 점수를 먼저 계산
    for (const p of rest) finish(m, p, false);
    const c = clsOf(m);
    if (c && !m.practice) {
      c.log.push({ at: Date.now(), unit: m.unit, text: `🏟 ${m.tour ? (m.tour.final ? '[결승] ' : `[${m.tour.round}R] `) : m.league ? '[리그] ' : ''}${order.map(p => p.place + '위 ' + p.name).join(' · ')}`, rally: m.bestRally, why });
      sessionMatch(c, m, m.winner);
      feed(c, `🏆 ${m.tour && m.tour.final ? '토너먼트 우승' : '경기장 1위'}: ${order[0].name}! (${order.map(p => p.name).join(' · ')})`);
      save(); compMatchEnd(c, m);
    }
    send(m); pushT(m);
    if (c) pushClass(c);
    setTimeout(() => matches.delete(m.id), 60000);
  }
  function leave(m, s) {
    const p = m.players.find(x => x.pid === s.id); if (!p || m.state === 'ended' || p.finished) return;
    if (m.practice) { clearInterval(m.loop); m.state = 'ended'; matches.delete(m.id); return; }
    p.hearts = 0; p.reviving = null; p.left = true;
    if (m.ball && m.ball.target === p.idx) m.ball.koAt = 0;
    finalOut(m, p);
    if (m.state !== 'ended' && !m.players.some(x => !x.isBot && !x.finished)) end(m, 'left');
  }
  function stop(m) { end(m, 'stop'); }
  function rejoin(m, s, sock) { const p = m.players.find(x => x.pid === s.id); if (!p || p.finished) return; sock.join('m:' + m.id); sock.emit('arena', view(m, p.idx)); }

  /* ===================== 대회: 자유 · 토너먼트 · 리그 ===================== */
  function startComp(c) {
    const type = c.settings.comp || 'free';
    if (type === 'tournament') {
      const ids = Object.values(c.students).filter(s => s.online && !s.matchId).map(s => s.id);
      c.comp = { type, round: 0, alive: new Set(ids), roundMatches: new Set(), rounds: [], champion: null, startedAt: Date.now(), timer: null };
      feed(c, `🏆 토너먼트 시작! ${ids.length}명이 참가해요. 곧 1라운드가 시작돼요.`);
      c.comp.timer = setTimeout(() => startRound(c), 3500);
    } else if (type === 'league') {
      c.comp = { type, games: c.settings.leagueGames || 4, table: {}, done: false, startedAt: Date.now() };
      feed(c, `📊 리그전 시작! 한 사람당 ${c.comp.games}경기씩, 승점으로 순위를 정해요.`);
    } else c.comp = { type: 'free' };
  }
  function stopComp(c) { if (c.comp && c.comp.timer) clearTimeout(c.comp.timer); c.comp = null; }
  function groupSizes(n) { const g = Math.ceil(n / 4); const base = Math.floor(n / g), extra = n % g; return Array.from({ length: g }, (_, i) => base + (i < extra ? 1 : 0)); }
  function startRound(c) {
    const T = c.comp; if (!T || T.type !== 'tournament' || !c.running) return;
    T.timer = null;
    for (const id of [...T.alive]) { const s = c.students[id]; if (!s || !s.online) T.alive.delete(id); }
    const ids = shuffle([...T.alive]);
    if (ids.length <= 1) { return crown(c, ids[0] && c.students[ids[0]]); }
    T.round++; T.roundMatches = new Set();
    const final = ids.length <= 4, sizes = final ? [ids.length] : groupSizes(ids.length), groups = [];
    let k = 0;
    for (const size of sizes) {
      const studs = ids.slice(k, k + size).map(id => c.students[id]); k += size;
      ctx.leavePractice(c, studs);
      const advance = final ? 1 : size >= 3 ? 2 : 1;
      const m = create(c, studs, { size, tour: { round: T.round, advance, final } });
      T.roundMatches.add(m.id); groups.push({ id: m.id, names: studs.map(s => s.name), advanced: [], done: false, advance });
    }
    T.rounds.push({ round: T.round, final, groups });
    feed(c, final ? `🏆 토너먼트 결승! ${ids.map(id => c.students[id].name).join(' · ')}` : `🏆 토너먼트 ${T.round}라운드 시작! (${groups.length}경기, 경기마다 상위 진출)`);
    pushClass(c);
  }
  function crown(c, s) {
    const T = c.comp; if (!T) return; T.champion = s ? s.name : null; T.alive = new Set();
    feed(c, s ? `👑 토너먼트 우승: ${s.name}! 모두 축하해요!` : '토너먼트가 끝났어요.');
    io.to('c:' + c.code).emit('champion', { name: T.champion }); io.to('t:' + c.code).emit('champion', { name: T.champion });
    pushClass(c);
  }
  function compPlayerDone(c, m, p, s) {
    const T = c.comp; if (!T) return;
    if (T.type === 'tournament' && m.tour) {
      const g = T.rounds.length && T.rounds[T.rounds.length - 1].groups.find(x => x.id === m.id);
      if (p.place <= m.advance && !m.tour.final) { if (g && !g.advanced.includes(p.name)) g.advanced.push(p.name); }
      else if (m.tour.final && p.place === 1) { /* 우승은 경기 끝에서 */ }
      else T.alive.delete(s.id);
    }
    if (T.type === 'league' && m.league) {
      const r = T.table[s.id] || (T.table[s.id] = { id: s.id, name: s.name, pts: 0, played: 0, wins: 0, hits: 0, correct: 0 });
      r.name = s.name; r.played++; r.pts += Math.max(0, m.startN - p.place); if (p.place === 1) r.wins++; r.hits += p.hits; r.correct += p.correct;
    }
  }
  function compMatchEnd(c, m) {
    const T = c.comp; if (!T) return;
    if (T.type === 'tournament' && m.tour && T.roundMatches.has(m.id)) {
      T.roundMatches.delete(m.id);
      const g = T.rounds[T.rounds.length - 1].groups.find(x => x.id === m.id); if (g) g.done = true;
      if (m.tour.final) { const w = m.players.find(p => p.place === 1); return crown(c, w && c.students[w.pid]); }
      if (!T.roundMatches.size) { feed(c, `✅ ${T.round}라운드 끝! 진출: ${[...T.alive].map(id => c.students[id] && c.students[id].name).filter(Boolean).join(' · ')} — 10초 뒤 다음 라운드`); T.timer = setTimeout(() => startRound(c), 10000); }
    }
    if (T.type === 'league') {
      const online = Object.values(c.students).filter(s => s.online);
      if (!T.done && online.length && online.every(s => (T.table[s.id] || {}).played >= T.games)) { T.done = true; const top = leagueRows(c)[0]; feed(c, `📊 리그전 끝! 1위 ${top ? top.name + ' (승점 ' + top.pts + ')' : ''}`); }
    }
    pushClass(c);
  }
  function leagueRows(c) {
    const T = c.comp; if (!T || T.type !== 'league') return [];
    const rows = Object.values(T.table).sort((a, b) => b.pts - a.pts || b.wins - a.wins || b.hits - a.hits || b.correct - a.correct);
    let prev = null, r = 0; rows.forEach((x, i) => { const k = x.pts + ':' + x.wins; if (k !== prev) r = i + 1; x.rank = r; prev = k; }); return rows;
  }
  function compView(c) {
    const T = c.comp; if (!T) return { type: c.settings.comp || 'free', active: false };
    if (T.type === 'tournament') return { type: T.type, active: true, round: T.round, champion: T.champion, alive: [...T.alive].map(id => c.students[id] && c.students[id].name).filter(Boolean), rounds: T.rounds, waitingNext: !!T.timer };
    if (T.type === 'league') return { type: T.type, active: true, games: T.games, done: T.done, table: leagueRows(c) };
    return { type: 'free', active: true };
  }
  function compForStudent(c, s) {
    const T = c.comp; if (!T) return null;
    if (T.type === 'tournament') return { type: T.type, round: T.round, inTour: T.alive.has(s.id), champion: T.champion, waitingNext: !!T.timer, started: T.round > 0 };
    if (T.type === 'league') { const rows = leagueRows(c), r = rows.find(x => x.id === s.id); return { type: T.type, games: T.games, played: r ? r.played : 0, pts: r ? r.pts : 0, rank: r ? r.rank : null, n: rows.length, done: T.done }; }
    return { type: 'free' };
  }

  // 자동 배정: 2~4명씩 모으고, 모자라면 기다렸다가 AI로 채워요 (먼저 탈락한 친구들은 서로 우선 묶여요)
  function matchmake(c, free, used, AI_WAIT) {
    const T = c.comp;
    let cand = free.filter(s => !used.has(s.id));
    if (T && T.type === 'tournament') cand = cand.filter(s => !T.alive.has(s.id)); // 토너먼트 진출자는 다음 라운드를 기다려요
    if (T && T.type === 'league') cand = cand.filter(s => ((T.table[s.id] || {}).played || 0) < T.games);
    const gs = Math.max(2, Math.min(4, c.settings.groupSize || 4));
    // 먼저 탈락하고 나온 친구들끼리 먼저 모아요
    let pool = cand.sort((a, b) => (b.afterEarly ? 1 : 0) - (a.afterEarly ? 1 : 0) || (a.waitSince || 0) - (b.waitSince || 0));
    const league = !!(T && T.type === 'league');
    while (pool.length >= gs) {
      const first = pool[0]; let grp = [first];
      for (const s of pool.slice(1)) { if (grp.length >= gs) break; if (!first.recentOpp.includes(s.id)) grp.push(s); }
      for (const s of pool) { if (grp.length >= gs) break; if (!grp.includes(s)) grp.push(s); }
      grp.forEach(s => { used.add(s.id); s.afterEarly = false; }); pool = pool.filter(s => !grp.includes(s));
      ctx.leavePractice(c, grp); create(c, grp, { league });
    }
    if (!pool.length) return;
    const waited = Date.now() - (Math.min(...pool.map(s => s.waitSince || Date.now())));
    // 먼저 탈락한 친구가 혼자 있고 다른 경기가 아직 진행 중이면, 곧 나올 탈락 친구를 조금 더 기다려요
    const liveHere = [...matches.values()].some(x => x.code === c.code && !x.practice && x.state !== 'ended');
    const soloWait = pool.some(s => s.afterEarly) && liveHere ? AI_WAIT * 1.6 : AI_WAIT;
    // 둘 이상이면 조금만 기다렸다 그 인원으로, 혼자면 AI와
    if (pool.length >= 2 && waited >= AI_WAIT * .6) { pool.forEach(s => { used.add(s.id); s.afterEarly = false; }); ctx.leavePractice(c, pool); create(c, pool, { league, size: c.settings.aiFill ? gs : pool.length }); }
    else if (c.settings.aiFill && waited >= soloWait) { pool.forEach(s => { used.add(s.id); s.afterEarly = false; }); ctx.leavePractice(c, pool); create(c, pool, { league, size: gs }); }
  }

  return { create, view, tView, press, input, answer, end, stop, leave, rejoin, matchmake, startComp, stopComp, compView, compForStudent };
};
