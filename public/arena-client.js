// 영어 리턴볼 B안 — 경기장 이동형 학생 화면
// 서버가 15번/초 보내는 위치를 부드럽게 이어 그리고, 내 로봇은 조이스틱대로 먼저 움직여 보여 줘요.
window.ARENA = (() => {
  const RB = window.RB, $ = id => document.getElementById(id), esc = RB.esc;
  const COURT = {
    11: { y0: 192, y1: 778, tl: 178, tr: 1422, bl: 20, br: 1579, top: 262, bot: 730, pad: 70 },
    12: { y0: 192, y1: 745, tl: 120, tr: 1480, bl: 19, br: 1580, top: 262, bot: 700, pad: 70 },
  };
  const P_SPEED = 330, STRIKE_R = 150, ROBOT_H = 168;
  const cv = $('ar-cv'), g = cv.getContext('2d');
  const COLOR_HEX = { blue: '#3cc8ff', red: '#ff6a5a', green: '#5ff08a', purple: '#c98bff' };

  /* ---------- 그림 불러오기 ---------- */
  const IMG = {};
  function load(key, src) { const im = new Image(); im.src = src; IMG[key] = im; }
  // 로봇 동작: 대기 · 걷기 4단계(디딤1 → 지나감 → 디딤2 → 지나감) · 받아치기 3단계(준비 → 접촉 → 마무리)
  const ROBOT_FRAMES = ['idle', 'walk-contact-1', 'walk-pass', 'walk-contact-2', 'swing-windup', 'swing-contact', 'swing-follow'];
  for (const c of ['blue', 'red', 'green', 'purple']) for (const d of ['left', 'right']) for (const f of ROBOT_FRAMES) load(`${c}-${d}-${f}`, `img/arena/robots/${c}-${d}-${f}.webp`);
  for (const k of ['perfect-sweep', 'revive-halo']) load(k, `img/arena/fx/${k}.webp`);
  const WALK = ['walk-contact-1', 'walk-pass', 'walk-contact-2', 'walk-pass'], WALK_MS = 115;
  const SWING = [[70, 'swing-windup'], [150, 'swing-contact'], [260, 'swing-follow']]; // 받아치기 260ms: 준비 70 · 접촉 80 · 마무리 110
  for (const k of ['target-floor-ring', 'elimination-effect']) load(k, `img/arena/ui/${k}.webp`);
  for (const k of ['energy-ball', 'ball-trail', 'hit-effect', 'miss-effect', 'strike-ring']) load(k, `img/strike/${k}.webp`);
  const ok = im => im && im.complete && im.naturalWidth;

  /* ---------- 상태 ---------- */
  let A = null, active = false, me = 0, snaps = [], mine = null, effects = [], swingAt = {}, outFade = {}, q = null, lockUntil = 0, ended = null, lastTarget = null, warned = false;
  const C = () => COURT[A ? A.unit : 11] || COURT[11];
  function sc(y) { const c = C(); return .62 + .38 * Math.max(0, Math.min(1, (y - c.top) / (c.bot - c.top))); }
  function clampP(p) { const c = C(); p.y = Math.max(c.top, Math.min(c.bot, p.y)); const k = (p.y - c.y0) / (c.y1 - c.y0); const a = c.tl + (c.bl - c.tl) * k + c.pad, b = c.tr + (c.br - c.tr) * k - c.pad; p.x = Math.max(a, Math.min(b, p.x)); }

  let openedAt = 0;
  function open(v) {
    openedAt = performance.now(); A = v; me = v.me; active = true; ended = null; snaps = []; effects = []; mine = null; outFade = {}; lastTarget = null; warned = false;
    RB.show('scr-arena');
    $('ar-court').src = `img/arena/court${v.unit}-movement.webp`;
    $('ar-unit').textContent = `${v.unit}단원 · ${v.unit === 11 ? '전통문화' : '환경 보호'} · 경기장`;
    $('ar-result').classList.add('hide'); $('ar-spec').classList.add('hide'); $('ar-prac').classList.toggle('hide', !v.practice);
    setQ(v.q); lockUntil = 0; drawPlayers(v.s);
    if (v.s) push(v.s);
    if (v.state === 'countdown') countdown(v.startIn);
  }
  function close() { active = false; A = null; $('ar-over').classList.add('hide'); stopJoy(); }

  function push(s) {
    s.rt = performance.now(); snaps.push(s); if (snaps.length > 30) snaps.shift();
    const p = s.p[me];
    if (p) { if (!mine) mine = { x: p[0], y: p[1] }; }
    if (A) {
      updateHud(s);
      if (s.b && s.b[2] !== lastTarget) { lastTarget = s.b[2]; if (lastTarget === me) { RB.sfx.ready(); flashMsg('공이 나를 쫓아와요! 도망치거나 치기!', 'danger'); } }
      if (!s.b) lastTarget = null;
    }
  }

  /* ---------- 위쪽 문제판 ---------- */
  function setQ(nq) {
    q = nq; const bs = document.querySelectorAll('.ar-ans');
    if (!q) { $('ar-qtext').textContent = ''; bs.forEach(b => b.textContent = ''); return; }
    $('ar-qtext').textContent = q.q; $('ar-qtext').classList.toggle('long', q.q.length > 38);
    const pic = $('ar-pic');
    if (q.pic) { pic.classList.remove('hide'); pic.innerHTML = /^(img\/|https?:)/.test(q.pic.e) ? `<img src="${esc(q.pic.e)}" alt="">` : `<b>${esc(q.pic.e)}</b><small>${esc(q.pic.cap || '')}</small>`; } else pic.classList.add('hide');
    bs.forEach((b, i) => { b.textContent = q.choices[i]; b.className = 'ar-ans' + (q.choices[i].length > 28 ? ' long' : ''); b.disabled = false; });
  }
  document.querySelectorAll('.ar-ans').forEach(b => b.addEventListener('click', async () => {
    if (!active || !q || Date.now() < lockUntil || b.disabled) return;
    const i = Number(b.dataset.i); const bs = document.querySelectorAll('.ar-ans'); bs.forEach(x => x.disabled = true); b.classList.add('picked');
    const r = await RB.call('aanswer', { pick: i });
    if (!r || !r.ok) { bs.forEach(x => x.disabled = false); b.classList.remove('picked'); if (r && r.err) flashMsg(r.err); return; }
    if (r.correct) {
      b.classList.add('right'); RB.sfx.hit(); chargeFlash(); setTimeout(() => setQ(r.next), 380);
      if (r.revived) flashMsg('부활 성공! 하트 1개로 다시 들어가요 💪', 'good');
      else if (r.reviveGot != null) flashMsg(`부활까지 ${3 - r.reviveGot}문제 더!`, 'good');
      else if (r.super) { flashMsg('3연속 정답! 슈퍼 치기 준비 ⚡', 'good'); RB.sfx.ready(); }
    }
    else {
      b.classList.add('wrong'); bs[r.correctIdx].classList.add('right'); RB.sfx.miss(); lockUntil = Date.now() + r.lockMs;
      $('ar-lock').classList.remove('hide'); $('ar-lock').textContent = `정답: ${r.answer} · ${(r.lockMs / 1000).toFixed(r.lockMs % 1000 ? 1 : 0)}초 쉬어요${r.lockMs > 2000 ? ' (연속으로 틀리면 더 길어져요)' : ''}`;
      setTimeout(() => { $('ar-lock').classList.add('hide'); setQ(r.next); }, r.lockMs);
    }
  }));
  function chargeFlash() { const el = $('ar-strike'); el.classList.remove('charged'); void el.offsetWidth; el.classList.add('charged'); }

  /* ---------- 아래쪽: 친구들 하트 ---------- */
  function drawPlayers(s) {
    if (!A) return;
    $('ar-players').innerHTML = A.players.map((p, i) => {
      const sp = s && s.p[i], hearts = sp ? sp[4] : p.hearts, out = sp ? sp[5] : p.out, rev = sp && sp[9] > 0, gone = sp && sp[11];
      return `<div class="arp ${out && !rev ? 'out' : ''} ${rev ? 'rev' : ''} ${i === me ? 'me' : ''}" style="--c:${COLOR_HEX[p.color]}" title="${rev ? '부활 도전 중' : gone ? '경기 끝' : ''}"><img class="arp-r" src="img/arena/robots/${p.color}-right-idle.webp" alt=""><div><b>${i === me ? '나 · ' : ''}${p.isBot ? '🤖 ' : ''}${esc(p.name)}</b><span>${Array.from({ length: A.hearts0 }, (_, k) => `<img src="img/arena/ui/heart-${k < hearts ? 'full' : 'empty'}.webp" alt="">`).join('')}</span></div></div>`;
    }).join('');
  }
  let hudKey = '';
  function updateHud(s) {
    const tl = Math.ceil(s.tl / 1000); $('ar-time').textContent = `${Math.floor(tl / 60)}:${String(tl % 60).padStart(2, '0')}`; $('ar-time').classList.toggle('warn', tl <= 20);
    const p = s.p[me]; if (!p) return;
    const k = s.p.map(x => x[4] + '' + x[5] + x[11] + (x[9] > 0 ? 'r' : '')).join(',');
    if (k !== hudKey) { hudKey = k; drawPlayers(s); }
    const ch = p[6], sup = !!p[8]; $('ar-strike-img').src = `img/arena/ui/strike-charge-${Math.min(3, ch)}.webp`; $('ar-strike').classList.toggle('empty', ch <= 0 && !sup); $('ar-strike').classList.toggle('super', sup);
    $('ar-strike').setAttribute('aria-label', `치기, 충전 ${ch}번${sup ? ', 슈퍼 치기 준비' : ''}`);
    const out = !!p[5], rev = p[9] > 0; $('ar-spec').classList.toggle('hide', !out || rev); $('scr-arena').classList.toggle('spectating', out && !rev);
    const rv = $('ar-revive'); rv.classList.toggle('hide', !rev);
    if (rev) rv.innerHTML = `<b>부활 도전! ${p[9]}초</b><span>3문제 연속 정답이면 하트 1개로 다시 들어가요</span><i>${[0, 1, 2].map(k => `<em class="${k < p[10] ? 'on' : ''}"></em>`).join('')}</i>`;
    $('scr-arena').classList.toggle('fever', !!s.fv); $('ar-fever').classList.toggle('hide', !s.fv);
    $('ar-rally').classList.toggle('on', s.r > 0); $('ar-rally').textContent = `RALLY ${s.r}`;
    const ov = $('ar-over');
    if (s.st === 'paused') { ov.classList.remove('hide'); ov.innerHTML = '<div class="big">⏸</div><div class="msg">선생님이 잠시 멈췄어요</div>'; }
    else if (s.st === 'serve' && !ended) { ov.classList.add('hide'); serveMsg(s.sv); }
    else if (s.st !== 'countdown') { ov.classList.add('hide'); $('ar-serve').classList.add('hide'); }
  }
  function serveMsg(ms) { const el = $('ar-serve'); el.classList.remove('hide'); el.textContent = ms > 300 ? `공이 곧 나와요 ${Math.ceil(ms / 1000)}` : '시작!'; }
  let cdT = null;
  function countdown(ms) {
    const ov = $('ar-over'); ov.classList.remove('hide'); const end = Date.now() + ms;
    const names = A.players.map(p => `<span style="color:${COLOR_HEX[p.color]}">${esc(p.name)}</span>`).join(' · ');
    clearInterval(cdT); const f = () => { const n = Math.ceil((end - Date.now()) / 1000); ov.innerHTML = `<div class="vs">${names}</div><div class="big">${n > 0 ? n : 'GO!'}</div><div class="msg">문제를 맞혀 치기를 모으고, 공이 오면 치기!</div>`; if (n <= 0) { clearInterval(cdT); setTimeout(() => ov.classList.add('hide'), 600); } };
    f(); cdT = setInterval(f, 200);
  }
  let msgT = null;
  function flashMsg(t, kind) { const el = $('ar-msg'); el.textContent = t; el.className = 'ar-msg on ' + (kind || ''); clearTimeout(msgT); msgT = setTimeout(() => el.classList.remove('on'), 1600); }

  /* ---------- 이벤트 ---------- */
  function onEvent(e) {
    if (!A) return;
    const P = A.players;
    if (e.k === 'swing') { swingAt[e.who] = performance.now(); if (e.who === me) RB.sfx.click(); }
    if (e.k === 'hit') {
      effects.push({ k: 'hit-effect', x: e.x, y: e.y, t0: performance.now(), dur: 650, d: 260 * sc(e.y), ax: 254, ay: 257 });
      const hp = lastPs && lastPs[e.who];
      if (e.perfect && hp) { const s2 = sc(hp.y); effects.push({ k: 'perfect-sweep', x: hp.x + (hp.dir >= 0 ? 1 : -1) * 75 * s2, y: hp.y - 88 * s2, t0: performance.now(), dur: 340, d: 240 * s2, ax: 160, ay: 160, flip: hp.dir < 0, s0: .7, s1: 1.15, flash: true }); }
      effects.push({ k: 'text', text: e.perfect ? 'PERFECT!' : 'NICE!', color: e.perfect ? '#ffe14a' : '#7ff7ff', x: e.x, y: e.y - 70, t0: performance.now(), dur: 900 });
      RB.sfx.hit(); if (e.who === me) flashMsg(e.perfect ? '강 스매시! ⚡' : '받아쳤어요!', 'good');
    }
    if (e.k === 'ko') {
      effects.push({ k: 'miss-effect', x: e.x, y: e.y - 70 * sc(e.y), t0: performance.now(), dur: 800, d: 240 * sc(e.y), ax: 237, ay: 244 });
      if (e.out) { effects.push({ k: 'elimination-effect', x: e.x, y: e.y - 85 * sc(e.y), t0: performance.now(), dur: 1500, d: 210 * sc(e.y), ax: 160, ay: 160 }); outFade[e.who] = performance.now(); }
      if (e.who === me) { RB.sfx.miss(); flashMsg(e.out ? (e.reviving ? '하트를 모두 잃었어요! 부활 도전 — 3문제 연속 정답!' : '하트를 모두 잃었어요.') : `공에 맞았어요! 하트 ${e.hearts}개 남음`, 'danger'); }
      else { RB.sfx.point(); flashMsg(`${P[e.who].name} ${e.out ? (e.reviving ? '부활 도전 중!' : '탈락!') : '공에 맞았어요!'}`); }
    }
    if (e.k === 'revive') { effects.push({ k: 'revive-halo', x: e.x, y: e.y - 85 * sc(e.y), t0: performance.now(), dur: 950, d: 260 * sc(e.y), ax: 160, ay: 160, s0: .5, s1: 1.6 }); effects.push({ k: 'text', text: '부활!', color: '#7dffb0', x: e.x, y: e.y - 150 * sc(e.y), t0: performance.now(), dur: 1200 }); if (e.who !== me) flashMsg(`${P[e.who].name} 부활!`); RB.sfx.ready(); }
    if (e.k === 'gone' && e.who !== me) flashMsg(`${P[e.who].name} ${e.place}위로 경기 끝`);
    if (e.k === 'fever') { banner('🔥 피버 타임!', '받아치기 점수 2배 · 공이 불타올라요', 'fever'); RB.sfx.win(); }
    if (e.k === 'final') { const n = e.names; banner(e.tourFinal ? '🏆 토너먼트 결승!' : '⚔️ 마지막 대결!', `${esc(n[0])} VS ${esc(n[1])} · 공이 더 빨라져요`, 'final', e.idx); RB.sfx.win(); }
    if (e.k === 'end') { ended = e; }
    if (e.k === 'result') { ended = ended || e; setTimeout(() => showResult(e), e.early ? 700 : 900); }
  }

  let banT = null;
  function banner(title, sub, kind, idx) {
    const el = $('ar-banner'); const vs = idx ? `<div class="bn-vs">${idx.map(i => `<img src="img/arena/robots/${A.players[i].color}-${i === idx[0] ? 'right' : 'left'}-idle.webp" alt="">`).join('<b>VS</b>')}</div>` : '';
    el.className = 'ar-banner ' + kind; el.innerHTML = `${vs}<div class="bn-t">${title}</div><div class="bn-s">${sub}</div>`;
    clearTimeout(banT); banT = setTimeout(() => el.classList.add('hide'), kind === 'final' ? 3300 : 2200);
  }

  /* ---------- 결과 (먼저 탈락하면 바로 내 결과, 나머지는 경기 끝에) ---------- */
  let resT = null;
  function showResult(e) {
    if (!A) return;
    const P = A.players, rows = e.places.filter(r => r.place).sort((a, b) => a.place - b.place);
    if (e.place === 1) RB.sfx.win();
    const el = $('ar-result'); el.classList.remove('hide');
    const champ = e.tour && e.tour.final && e.place === 1;
    const tourLine = e.tour ? (champ ? '👑 토너먼트 우승!' : e.tour.final ? '토너먼트 결승을 마쳤어요' : e.advanced ? `✅ ${e.tour.round + 1}라운드 진출! 다음 라운드를 기다려요` : '토너먼트는 여기까지 — 탈락한 친구들과 자유 경기로 계속해요') : '';
    const head = champ ? '우승! 👑' : e.place === 1 ? '1등! 🏆' : `${e.place}등`;
    el.innerHTML = `<div class="arr-head ${e.place === 1 ? 'win' : ''}">${head}</div>
      <div class="arr-sub">${e.label} · ${e.of}명 중 ${e.place}등${e.practice ? ' · 연습이라 점수에 안 들어가요' : ` · +${e.gain}점 (치기 ${e.hits} · 정답 ${e.correct})`}</div>
      ${tourLine ? `<div class="arr-tour ${e.advanced || champ ? 'ok' : ''}">${tourLine}</div>` : ''}
      <div class="arr-list">${rows.map(r => { const p = P[r.idx]; return `<div class="arr-row ${r.idx === me ? 'me' : ''}" style="--c:${COLOR_HEX[p.color]}"><b class="pl">${r.place}</b><img src="img/arena/robots/${p.color}-right-idle.webp" alt=""><span class="nm">${p.isBot ? '🤖 ' : ''}${esc(p.name)}</span><span>치기 ${r.hits}</span><span>정답 ${r.correct}</span><span class="hearts">${'❤'.repeat(r.hearts)}</span><span class="gain">${e.practice ? '' : '+' + r.gain + '점'}</span></div>`; }).join('')}
        ${e.early ? `<div class="arr-row wait"><span>아직 ${P.length - rows.length}명이 경기 중이에요</span></div>` : ''}</div>
      ${(e.history || []).length ? `<div class="arr-rev"><h4>내가 틀린 문제</h4>${e.history.slice(-3).map(h => `<div><span class="q">${esc(h.q)}</span><span class="a">✔ ${esc(h.answer)}</span><span class="x">내 답: ${esc(h.picked)}</span></div>`).join('')}</div>` : ''}
      <div class="arr-next" id="arr-next"></div>`;
    clearInterval(resT); const end = Date.now() + (e.early ? 6000 : 10000);
    const f = () => { const s = Math.max(0, Math.ceil((end - Date.now()) / 1000)); const n = $('arr-next'); if (!n) return clearInterval(resT);
      n.textContent = e.practice ? '잠시 후 대기실로 돌아가요' : e.advanced && !(e.tour && e.tour.final) ? '다음 라운드가 시작되면 자동으로 들어가요' : (s > 0 ? `${s}초 뒤 ${e.early ? '먼저 끝난 친구들과' : '새 친구들과'} 자동으로 경기해요` : '새 경기장을 찾고 있어요…'); };
    f(); resT = setInterval(f, 300);
  }

  /* ---------- 조작: 조이스틱 · 방향키 · 치기 ---------- */
  let joyId = null, jv = { x: 0, y: 0 }, keys = {}, sentAt = 0, sentV = { x: 0, y: 0 };
  const joy = $('ar-joy'), thumb = $('ar-thumb');
  function stagePt(e) { const r = document.getElementById('stage').getBoundingClientRect(), k = r.width / 1600; return { x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k }; }
  const JC = { x: 160, y: 760 }, JR = 92;
  function joyMove(e) { const p = stagePt(e); let dx = p.x - JC.x, dy = p.y - JC.y; const l = Math.hypot(dx, dy); if (l > JR) { dx = dx / l * JR; dy = dy / l * JR; } jv = { x: dx / JR, y: dy / JR }; thumb.style.transform = `translate(${dx}px,${dy}px)`; sendMove(); }
  joy.addEventListener('pointerdown', e => { joyId = e.pointerId; try { joy.setPointerCapture(e.pointerId); } catch (_) {} joyMove(e); joy.classList.add('on'); });
  joy.addEventListener('pointermove', e => { if (e.pointerId === joyId) joyMove(e); });
  const joyUp = e => { if (e.pointerId !== joyId) return; joyId = null; jv = { x: 0, y: 0 }; thumb.style.transform = ''; joy.classList.remove('on'); sendMove(true); };
  joy.addEventListener('pointerup', joyUp); joy.addEventListener('pointercancel', joyUp);
  function stopJoy() { joyId = null; jv = { x: 0, y: 0 }; keys = {}; thumb.style.transform = ''; }
  function inputV() { let x = jv.x, y = jv.y; const kx = (keys.ArrowRight || keys.KeyD ? 1 : 0) - (keys.ArrowLeft || keys.KeyA ? 1 : 0), ky = (keys.ArrowDown || keys.KeyS ? 1 : 0) - (keys.ArrowUp || keys.KeyW ? 1 : 0); if (kx || ky) { const l = Math.hypot(kx, ky); x = kx / l; y = ky / l; } return { x, y }; }
  function sendMove(force) { const v = inputV(), now = performance.now(); if (!force && now - sentAt < 60 && Math.hypot(v.x - sentV.x, v.y - sentV.y) < .25) return; sentAt = now; sentV = v; RB.socket.emit('amove', v); }
  setInterval(() => { if (active) { const v = inputV(); if (Math.hypot(v.x - sentV.x, v.y - sentV.y) > .02) sendMove(true); } }, 80);
  addEventListener('keydown', e => { if (!active) return; if (e.code === 'Space') { e.preventDefault(); strike(); return; } if (/^(Arrow|Key[WASD])/.test(e.code)) { keys[e.code] = true; sendMove(true); e.preventDefault(); } });
  addEventListener('keyup', e => { if (!active) return; if (keys[e.code]) { delete keys[e.code]; sendMove(true); } });
  async function strike() {
    if (!active) return; const r = await RB.call('astrike');
    if (r && r.err) { flashMsg(r.err); const b = $('ar-strike'); b.classList.remove('nope'); void b.offsetWidth; b.classList.add('nope'); }
  }
  $('ar-strike').addEventListener('pointerdown', e => { e.preventDefault(); strike(); });
  $('ar-quit').addEventListener('click', async () => { await RB.call('leavePractice'); close(); RB.route(); });

  /* ---------- 그리기 ---------- */
  function interp(now) {
    if (!snaps.length) return null;
    const rt = now - 110; let a = snaps[0], b = snaps[snaps.length - 1];
    for (let i = snaps.length - 1; i > 0; i--) if (snaps[i - 1].rt <= rt) { a = snaps[i - 1]; b = snaps[i]; break; }
    const k = b.rt === a.rt ? 1 : Math.max(0, Math.min(1, (rt - a.rt) / (b.rt - a.rt)));
    const L = (x, y) => x + (y - x) * k;
    const ps = b.p.map((pb, i) => { const pa = a.p[i] || pb; return { x: L(pa[0], pb[0]), y: L(pa[1], pb[1]), dir: pb[2], moving: pb[3], hearts: pb[4], out: pb[5], charges: pb[6], striking: pb[7], sup: pb[8], rev: pb[9], gone: pb[11], fx: pb[12], fy: pb[13] }; });
    let ball = null; if (b.b && a.b) ball = { x: L(a.b[0], b.b[0]), y: L(a.b[1], b.b[1]), target: b.b[2], v: b.b[3], hot: b.b[4], sup: b.b[5] }; else if (b.b) ball = { x: b.b[0], y: b.b[1], target: b.b[2], v: b.b[3], hot: b.b[4], sup: b.b[5] };
    return { ps, ball, last: snaps[snaps.length - 1] };
  }
  let lastFrame = performance.now(), prevBall = null, trailAng = 0, aimF = { x: 1, y: 0 }, lastPs = null;
  let slowAvg = 16, half = false, skip = false;
  function frame(now) {
    requestAnimationFrame(frame);
    if (half && (skip = !skip)) return;           // 느린 기기는 한 번씩 건너뛰어 1초 30번만 그려요
    const raw = now - lastFrame, dt = Math.min(.05, raw / 1000); lastFrame = now;
    if (!active || !A) return;
    slowAvg = slowAvg * .95 + Math.min(100, raw / (half ? 2 : 1)) * .05;
    if (!half && slowAvg > 24) half = true; else if (half && slowAvg < 12) half = false;
    const S = interp(now); g.clearRect(0, 0, 1600, 900); if (!S) return;
    // 내 로봇은 조이스틱대로 먼저 움직이고, 서버 위치로 살살 맞춰요
    const srv = S.last.p[me];
    if (srv && mine) {
      if (!srv[5] && S.last.st !== 'countdown' && S.last.st !== 'paused' && !ended) { const v = inputV(), l = Math.hypot(v.x, v.y); if (l > .15) { const s = sc(mine.y); mine.x += v.x * P_SPEED * s * dt; mine.y += v.y * P_SPEED * s * .75 * dt; clampP(mine); } }
      mine.x += (srv[0] - mine.x) * Math.min(1, dt * 5); mine.y += (srv[1] - mine.y) * Math.min(1, dt * 5);
      S.ps[me].x = mine.x; S.ps[me].y = mine.y; const v = inputV(); if (Math.abs(v.x) > .15) S.ps[me].dir = v.x > 0 ? 1 : -1; if (Math.hypot(v.x, v.y) > .15) S.ps[me].moving = 1;
    }
    lastPs = S.ps;
    const ball = S.ball;
    // 발밑: 공이 쫓는 친구 빨간 원, 내 치기 범위
    if (ball) {
      const t = S.ps[ball.target];
      if (t && ok(IMG['target-floor-ring'])) { const w = 170 * sc(t.y), h = w * 160 / 280, pul = 1 + Math.sin(now / 120) * .06; g.globalAlpha = .95; g.drawImage(IMG['target-floor-ring'], t.x - w * pul / 2, t.y - h * pul / 2, w * pul, h * pul); g.globalAlpha = 1; }
      if (ball.target === me && t && !t.out && ok(IMG['strike-ring'])) {
        const cy = t.y - 40 * sc(t.y), rx = STRIKE_R * sc(t.y), ry = rx * .75, d = Math.hypot(ball.x - t.x, (ball.y - cy) / .75) / sc(t.y), inside = d < STRIKE_R;
        g.save(); g.globalAlpha = inside ? 1 : .55; g.drawImage(IMG['strike-ring'], t.x - rx * 1.06, cy - ry, rx * 2, ry * 2); if (inside) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = .55 + Math.sin(now / 70) * .25; g.drawImage(IMG['strike-ring'], t.x - rx * 1.12, cy - ry * 1.06, rx * 2.12, ry * 2.12); } g.restore();
        $('ar-strike').classList.toggle('now', inside && (S.ps[me].charges > 0 || S.ps[me].sup)); $('scr-arena').classList.toggle('danger', true);
      } else { $('ar-strike').classList.remove('now'); $('scr-arena').classList.remove('danger'); }
    } else { $('ar-strike').classList.remove('now'); $('scr-arena').classList.remove('danger'); }
    // 조준: 치기가 충전돼 있으면 공이 날아갈 친구에게 점선 화살표 (마지막으로 움직인 방향 기준)
    const mp = S.ps[me];
    if (mp && !mp.out && (mp.charges > 0 || mp.sup) && S.last.st !== 'countdown') {
      const v = inputV(); let fx = mp.fx, fy = mp.fy; if (Math.hypot(v.x, v.y) > .15) { fx = v.x; fy = v.y; } aimF = Math.hypot(fx, fy) > .05 ? { x: fx, y: fy } : aimF;
      const fl = Math.hypot(aimF.x, aimF.y) || 1; let best = null, bs = -9;
      S.ps.forEach((p, i) => { if (i === me || p.out) return; const dx = p.x - mp.x, dy = (p.y - mp.y) / .75, d = Math.hypot(dx, dy) || 1, sc2 = (dx * aimF.x + dy * aimF.y) / (d * fl); if (sc2 > bs) { bs = sc2; best = p; } });
      if (best) {
        const x0 = mp.x, y0 = mp.y - 30 * sc(mp.y), x1 = best.x, y1 = best.y - 30 * sc(best.y), ang = Math.atan2(y1 - y0, x1 - x0), len = Math.hypot(x1 - x0, y1 - y0);
        g.save(); g.strokeStyle = mp.sup ? 'rgba(120,230,255,.85)' : 'rgba(255,225,90,.75)'; g.lineWidth = 5; g.setLineDash([16, 12]); g.lineDashOffset = -now / 30;
        g.beginPath(); g.moveTo(x0 + Math.cos(ang) * 50, y0 + Math.sin(ang) * 50); g.lineTo(x1 - Math.cos(ang) * 60, y1 - Math.sin(ang) * 60); g.stroke(); g.setLineDash([]);
        const hx = x1 - Math.cos(ang) * 55, hy = y1 - Math.sin(ang) * 55; g.fillStyle = g.strokeStyle; g.beginPath(); g.moveTo(hx + Math.cos(ang) * 18, hy + Math.sin(ang) * 18); g.lineTo(hx + Math.cos(ang + 2.5) * 18, hy + Math.sin(ang + 2.5) * 18); g.lineTo(hx + Math.cos(ang - 2.5) * 18, hy + Math.sin(ang - 2.5) * 18); g.fill();
        g.restore();
      }
    }
    // 그림자
    const draw = [];
    S.ps.forEach((p, i) => draw.push({ y: p.y, f: () => robot(p, i, now) }));
    if (ball) {
      const shY = ball.y + 40 * sc(ball.y);
      g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(ball.x, shY, 34 * sc(ball.y), 12 * sc(ball.y), 0, 0, Math.PI * 2); g.fill();
      draw.push({ y: shY + 1, f: () => drawBall(ball, now) });
    }
    draw.sort((a, b) => a.y - b.y).forEach(d => d.f());
    // 효과
    effects = effects.filter(e => now - e.t0 < e.dur);
    for (const e of effects) {
      const t = (now - e.t0) / e.dur;
      if (e.k === 'text') { g.save(); g.globalAlpha = 1 - Math.max(0, t - .6) / .4; g.font = '900 46px Montserrat, Jua, sans-serif'; g.textAlign = 'center'; g.lineWidth = 8; g.strokeStyle = '#0b1830'; const yy = e.y - t * 40; g.strokeText(e.text, e.x, yy); g.fillStyle = e.color; g.fillText(e.text, e.x, yy); g.restore(); continue; }
      const im = IMG[e.k]; if (!ok(im)) continue;
      const s = e.s0 != null ? e.s0 + (e.s1 - e.s0) * (1 - Math.pow(1 - t, 2)) : e.k === 'elimination-effect' ? .8 + Math.min(1, t * 4) * .3 : .6 + t * .7;
      g.save(); g.globalAlpha = e.flash ? (t < .25 ? t / .25 : 1 - (t - .25) / .75) : e.k === 'elimination-effect' ? (t < .8 ? 1 : (1 - t) / .2) : 1 - t;
      const d = e.d * s; g.translate(e.x, e.y); if (e.flip) g.scale(-1, 1); g.drawImage(im, -d * e.ax / im.naturalWidth, -d * e.ay / im.naturalHeight, d, d); g.restore();
    }
  }
  function robot(p, i, now) {
    const P = A.players[i], s = sc(p.y), h = ROBOT_H * s, w = h * 330 / 313;
    // 받아치기 중이면 걷기보다 타격 그림을 먼저 보여 줘요
    const st = swingAt[i] ? now - swingAt[i] : 1e9, swingF = !p.out && st < 260 ? SWING.find(x => st < x[0])[1] : null;
    const frameName = swingF || (p.moving && !p.out ? WALK[Math.floor(now / WALK_MS + i * 1.7) % 4] : 'idle');
    const im = IMG[`${P.color}-${p.dir >= 0 ? 'right' : 'left'}-${frameName}`];
    const footY = frameName.startsWith('walk') ? 298 : 293; // 걷기 그림은 발바닥이 4~5픽셀 아래
    g.fillStyle = 'rgba(0,0,0,.38)'; g.beginPath(); g.ellipse(p.x, p.y, 46 * s, 15 * s, 0, 0, Math.PI * 2); g.fill();
    if (i === me && !p.out) { g.strokeStyle = 'rgba(64,234,255,.9)'; g.lineWidth = 4; g.beginPath(); g.ellipse(p.x, p.y, 56 * s, 19 * s, 0, 0, Math.PI * 2); g.stroke(); }
    if (p.gone) return;
    g.save();
    if (p.out) g.globalAlpha = p.rev ? .35 + Math.sin(now / 150) * .15 : .32;
    const sw = 0;
    g.translate(p.x, p.y);
    if (ok(im)) g.drawImage(im, -w * 165 / 330, -h * footY / 313, w, h);
    g.restore();
    if (swingF === 'swing-contact') { const sw2 = .5; g.save(); g.strokeStyle = `rgba(127,247,255,${sw2})`; g.lineWidth = 10 * s; g.beginPath(); const cx = p.x + p.dir * 40 * s, cy = p.y - 70 * s; g.arc(cx, cy, 70 * s, p.dir > 0 ? -1.2 : Math.PI - 1.2, p.dir > 0 ? 1.2 : Math.PI + 1.2); g.stroke(); g.restore(); }
    // 이름표
    g.save(); g.font = `${Math.round(24 * s + 4)}px Jua, sans-serif`; g.textAlign = 'center';
    const label = (i === me ? '▼ 나' : P.name), ty = p.y - h - 8; const tw = g.measureText(label).width + 20;
    g.globalAlpha = p.out ? .5 : 1; g.fillStyle = 'rgba(8,20,48,.78)'; g.beginPath(); g.roundRect ? g.roundRect(p.x - tw / 2, ty - 24 * s - 6, tw, 24 * s + 14, 10) : g.rect(p.x - tw / 2, ty - 24 * s - 6, tw, 24 * s + 14); g.fill();
    g.fillStyle = i === me ? '#7ff7ff' : COLOR_HEX[P.color]; g.fillText(label, p.x, ty); g.restore();
  }
  function drawBall(b, now) {
    const s = sc(b.y), d = 120 * s;
    if (prevBall) { const dx = b.x - prevBall.x, dy = b.y - prevBall.y; if (Math.hypot(dx, dy) > .5) trailAng = Math.atan2(dy, dx); }
    prevBall = { x: b.x, y: b.y };
    const tr = IMG['ball-trail'];
    if (ok(tr)) { const td = 230 * s; g.save(); g.translate(b.x, b.y); g.rotate(trailAng - 153 * Math.PI / 180); g.globalAlpha = .9; g.drawImage(tr, -td * .117, -td * .68, td, td); g.restore(); }
    const im = IMG['energy-ball'];
    g.save(); g.translate(b.x, b.y); if (b.hot || b.sup) { g.globalCompositeOperation = 'lighter'; g.fillStyle = b.sup ? 'rgba(90,220,255,.35)' : 'rgba(255,110,30,.35)'; g.beginPath(); g.arc(0, 0, d * .55, 0, Math.PI * 2); g.fill(); g.globalCompositeOperation = 'source-over'; } g.rotate(now / 160);
    if (ok(im)) g.drawImage(im, -d * 274 / 512, -d * 264 / 512, d, d); g.restore();
  }
  requestAnimationFrame(frame);

  RB.socket.on('champion', c => { if (!c.name) return; RB.toast(`👑 토너먼트 우승: ${c.name}!`, 6000); RB.sfx.win(); const el = $('ar-crown'); if (active) { el.innerHTML = `<b>👑 ${esc(c.name)}</b><span>토너먼트 우승! 모두 박수!</span>`; el.classList.remove('hide'); setTimeout(() => el.classList.add('hide'), 4500); } });
  RB.socket.on('arena', v => { open(v); });
  RB.socket.on('as', s => { if (active) push(s); });
  RB.socket.on('aev', e => { if (active) onEvent(e); });
  return { open, close, get active() { return active; }, get fresh() { return performance.now() - openedAt < 2500; }, get state() { return { A, me, snaps: snaps.length, mine, ended: !!ended }; },
    debug: () => { const S = interp(performance.now()); return S && { me, mine, ball: S.ball, ps: S.ps, st: S.last.st, charges: S.last.p[me] && S.last.p[me][6] }; },
    toClient(p) { const r = document.getElementById('stage').getBoundingClientRect(), k = r.width / 1600; return { x: r.left + p.x * k, y: r.top + p.y * k }; }, q: () => q, locked: () => Date.now() < lockUntil };
})();
