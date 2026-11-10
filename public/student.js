// 영어 리턴볼 — 학생 화면
(() => {
  const $ = id => document.getElementById(id);
  const stage = $('stage');
  function fit() { const s = Math.min(innerWidth / 1600, innerHeight / 900); stage.style.transform = `translate(-50%,-50%) scale(${s})`; }
  addEventListener('resize', fit); fit();

  // 그림 자리 채우기 (img/ 폴더에 그림이 생기면 자동으로 바뀌어요)
  function paintArt() { document.querySelectorAll('[data-art]').forEach(el => { const k = el.dataset.art; el.innerHTML = ART.el(k, k.includes('red') ? 'red' : 'blue'); }); }
  paintArt(); addEventListener('art', paintArt);

  /* ---------- 소리 ---------- */
  let ac = null;
  function tone(f, d = .12, type = 'sine', v = .15, slide) {
    try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.value = f; if (slide) o.frequency.exponentialRampToValueAtTime(slide, ac.currentTime + d);
      g.gain.setValueAtTime(v, ac.currentTime); g.gain.exponentialRampToValueAtTime(.001, ac.currentTime + d); o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + d); } catch (e) {}
  }
  const sfx = { hit: () => { tone(520, .08, 'square', .12, 1200); setTimeout(() => tone(900, .1, 'triangle', .1), 60); }, miss: () => tone(300, .35, 'sawtooth', .12, 90), point: () => { tone(660, .1); setTimeout(() => tone(990, .18), 100); },
    tick: () => tone(1200, .04, 'square', .05), ready: () => { tone(440, .12, 'triangle', .1, 880); setTimeout(() => tone(1320, .08, 'sine', .08), 90); }, click: () => tone(700, .05, 'triangle', .08), win: () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, .18, 'triangle', .14), i * 120)) };
  function speak(text) { try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = 'en-US'; u.rate = .9; speechSynthesis.speak(u); } catch (e) {} }

  function toast(t, ms = 2200) { const el = $('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('on'), ms); }
  function show(id) { document.querySelectorAll('.screen').forEach(s => s.classList.toggle('hide', s.id !== id)); }
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---------- 연결 ---------- */
  const socket = io({ transports: ['websocket', 'polling'] });
  let ME = null, M = null, saved = {};
  try { saved = JSON.parse(localStorage.getItem('returnball') || '{}'); } catch (e) {}
  const call = (ev, d) => new Promise(r => socket.emit(ev, d || {}, r));

  async function join(code, name, token) {
    const r = await call('join', { code, name, token });
    if (!r.ok) { $('j-err').textContent = r.err; if (token) { saved = {}; try { localStorage.removeItem('returnball'); } catch (e) {} show('scr-title'); } return; }
    saved = { code, token: r.token, name: r.view.name }; try { localStorage.setItem('returnball', JSON.stringify(saved)); } catch (e) {}
    ME = r.view; route();
  }
  socket.on('connect', () => { if (saved.token && saved.code) join(saved.code, '', saved.token); });
  socket.on('me', v => { ME = v; route(); });
  socket.on('match', m => { M = m; route(); renderMatch(); });
  socket.on('feed', t => { const f = $('feed'); f.textContent = t; f.animate([{ opacity: 0 }, { opacity: 1 }], 400); });
  socket.on('kicked', t => { alert(t); saved = {}; try { localStorage.removeItem('returnball'); } catch (e) {} location.reload(); });

  /* ---------- 첫 화면 · 입장 ---------- */
  $('b-enter').onclick = () => { sfx.click(); if (saved.token && ME) return route(); $('j-code').value = saved.code || ''; $('j-name').value = saved.name || ''; show('scr-join'); setTimeout(() => $(saved.code ? 'j-name' : 'j-code').focus(), 50); };
  $('b-howto').onclick = $('b-howto2').onclick = () => { sfx.click(); $('howto').classList.remove('hide'); };
  $('b-teacher').onclick = () => { location.href = 'teacher.html'; };
  $('j-back').onclick = () => show('scr-title');
  $('join-form').onsubmit = e => { e.preventDefault(); $('j-err').textContent = ''; const code = $('j-code').value.trim(), name = $('j-name').value.trim(); if (!code || !name) { $('j-err').textContent = '입장 코드와 이름을 모두 적어 주세요.'; return; } join(code, name); };
  document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => b.closest('.modal').classList.add('hide'));
  $('b-practice').onclick = async () => { sfx.click(); const r = await call('practice'); if (r.err) toast(r.err); };
  $('b-quitprac').onclick = async () => { await call('leavePractice'); M = null; route(); };

  /* ---------- 화면 고르기 ---------- */
  let resultTimer = null;
  function route() {
    if (!ME) return;
    if (window.ARENA && ARENA.active) { if (['playing', 'practice', 'result'].includes(ME.status) || ARENA.fresh) return; ARENA.close(); }
    const inMatch = M && M.state !== 'ended' && (ME.status === 'playing' || ME.status === 'practice');
    if (inMatch) { if ($('scr-match').classList.contains('hide')) { show('scr-match'); renderMatch(); } return; }
    if (M && M.state === 'ended' && !M.practice && (ME.status === 'result' || ME.status === 'playing')) { if ($('scr-result').classList.contains('hide')) showResult(); return; }
    if (M && M.state === 'ended' && M.practice && !$('scr-match').classList.contains('hide')) { const w = M.winner === M.me; toast(w ? '연습 경기 승리! 🎉' : '연습 경기 끝! 다시 도전해 봐요.'); M = null; }
    renderLobby();
    const cur = document.querySelector('.screen:not(.hide)');
    if (!cur || ['scr-match', 'scr-result', 'scr-join', 'scr-title'].includes(cur.id)) show('scr-lobby');
  }

  function renderLobby() {
    $('l-name').textContent = ME.name; $('l-cls').textContent = ME.mode === 'arena' ? `${ME.cls} · 경기장 이동형 · 하트 ${ME.hearts}개 · ${ME.arenaMin}분` : `${ME.cls} · 먼저 ${ME.target}점 · 문제당 ${ME.qSec}초`;
    $('l-unit').textContent = `${ME.unit}단원 · ${ME.unitName}`;
    const msg = ME.paused ? '선생님이 잠시 멈췄어요. 조금만 기다려 주세요.' : !ME.running ? '선생님이 경기를 시작하면 자동으로 상대가 정해져요.' : '새 상대를 찾고 있어요! 곧 경기가 시작돼요.';
    let cm = '';
    const C = ME.comp;
    if (C && C.type === 'tournament' && ME.running) cm = C.champion ? (C.inTour ? '' : `👑 토너먼트 우승: ${C.champion} · 지금은 자유 경기예요`) : !C.inTour ? '토너먼트는 끝났지만, 탈락한 친구들과 자유 경기를 계속해요!' : !C.started ? '🏆 토너먼트 참가! 곧 1라운드가 시작돼요.' : C.waitingNext ? `✅ ${C.round}라운드 통과! 곧 다음 라운드가 시작돼요.` : `🏆 토너먼트 ${C.round}라운드 진출! 경기를 기다려요. (기다리는 동안 AI 연습 가능)`;
    if (C && C.type === 'league' && ME.running) cm = C.played >= C.games ? `📊 리그 ${C.games}경기를 다 했어요! 승점 ${C.pts}점 · ${C.rank || '-'}위 / ${C.n}명` : `📊 리그전 ${C.played}/${C.games}경기 · 승점 ${C.pts}점${C.rank ? ' · ' + C.rank + '위' : ''} — 다음 경기를 찾는 중`;
    $('l-msg').textContent = cm || msg;
    const st = ME.stats, rk = ME.rank;
    $('l-stats').innerHTML = st.games ? `<span>🏅 반 ${rk.cls || '-'}등 / ${rk.clsN}명</span><span>⭐ ${st.points}점</span><span>${st.wins}승 ${st.losses}패</span><span>정답률 ${st.acc}%</span><span>최고 랠리 ${st.bestRally}</span>` : '<span>첫 경기를 기다려요!</span>';
    $('b-practice').classList.toggle('hide', !!ME.paused);
  }

  /* ---------- 경기 ---------- */
  const DECO = { 11: ['H|0|70', '🌸|250|20', 'H|500|60', '🌲|860|90', 'H|1000|60', '🌸|1260|30'], 12: ['🌳|40|30', '☀️|300|0', '🌿|520|90', '♻️|720|40', '🌳|930|20', '🌱|1130|90', '🍃|1320|30', '🌳|1480|20'] };
  let decoUnit = 0;
  // 화면 위치 (1600×900 무대 기준). 공은 상대 손 → 내 앞 '터치 지점'으로 날아와요.
  const OP_HAND = { x: 1345, y: 318, s: .45 }, ME_HAND = { x: 470, y: 420, s: 1.0 };
  const ME_STRIKE = { x: 700, y: 455, s: 1.0 }, OP_STRIKE = { x: 1215, y: 335, s: .55 };
  const ME_BODY = { x: 300, y: 500, s: 1.1 }, OP_BODY = { x: 1440, y: 330, s: .45 };
  const BALL_D = 166, BALL_AX = 274 / 512, BALL_AY = 264 / 512;   // 공 그림 크기와 기준점
  const RING_D = 232;                                             // 바깥 원이 이 크기가 되면 두 원이 겹쳐요
  const TRAIL_AX = .117, TRAIL_AY = .68, TRAIL_DIR = 153;          // 궤적 그림의 머리 위치·기본 방향(도)
  let fly = null;     // { toMe, phase, from, qT0, qFull, sT0, sHit, sDur, win, struck }
  let ballPos = { x: OP_HAND.x, y: OP_HAND.y, s: OP_HAND.s }, prevPos = null;
  let ballKey = '', lastAt = 0, pickedIdx = -1, lastPointAt = 0, hintShown = false;
  const lerp = (a, b, t) => a + (b - a) * t;
  function arc(A, B, e, h) { return { x: lerp(A.x, B.x, e), y: lerp(A.y, B.y, e) - Math.sin(Math.PI * Math.min(1, e)) * h, s: lerp(A.s, B.s, e) }; }

  function renderMatch() {
    if (!M || $('scr-match').classList.contains('hide') && M.state !== 'ended') return;
    const me = M.me, op = 1 - me, P = M.players;
    const court = $('scr-match'); court.classList.remove('u11', 'u12'); court.classList.add('u' + M.unit);
    if (decoUnit !== M.unit) { decoUnit = M.unit; $('deco').innerHTML = DECO[M.unit].map(x => { const [e, l, t] = x.split('|'); return `<span style="left:${l}px;top:${t}px">${e === 'H' ? ART.hanok(300) : e}</span>`; }).join(''); }
    $('m-unit').textContent = `${M.unit}단원 · ${M.unitName}`;
    setScore('sc-me', P[me].score); setScore('sc-op', P[op].score);
    $('nm-me').textContent = P[me].name + ' (나)'; $('nm-op').textContent = (P[op].isBot ? '🤖 ' : '') + P[op].name;
    $('m-target').textContent = `먼저 ${M.target}점을 얻으면 승리`;
    $('m-prac').classList.toggle('hide', !M.practice);
    const ra = $('m-rally'); ra.classList.toggle('on', M.rally > 0);
    if (M.rally > 0) ra.innerHTML = `RALLY ${M.rally}<small>${M.ball && M.ball.speed > 1 ? '속도 ×' + M.ball.speed : ''}</small>`;
    const ov = $('m-over');

    // 받아치기·점수 효과
    if (M.last && M.last.at !== lastAt) {
      lastAt = M.last.at; const L = M.last, mine = L.who === me;
      if (L.kind === 'hit') {
        swing(mine ? 'r-me' : 'r-op'); sfx.hit();
        fx('hit', ballPos); judgeText(L.judge === 'perfect' ? 'PERFECT!' : 'GOOD!', L.judge === 'perfect' ? '#ffe14a' : '#5ff3ff', ballPos);
        if (mine) pop(L.judge === 'perfect' ? '강 스매시! ⚡ 상대 시간 -1초' : '나이스 반격!', '#2ff0ff');
        fly = { phase: 'return', toMe: !mine, from: { ...ballPos }, t0: performance.now(), dur: 450 };
        setStrikeMode(false);
      } else if (L.kind === 'ready') {
        // 정답! 공이 다가오고 원이 줄어들어요 (서버가 곧 strike 단계 정보를 보내요)
      } else { // 점수
        const iMissed = mine; lastPointAt = Date.now();
        $(iMissed ? 'r-me' : 'r-op').classList.remove('hurt'); void $('r-me').offsetWidth; $(iMissed ? 'r-me' : 'r-op').classList.add('hurt');
        if (L.kind === 'strikeMiss') { fx('miss', ballPos); judgeText(L.judge === 'early' ? '너무 빨라요!' : L.judge === 'late' ? '늦었어요!' : 'MISS', '#ff7a8a', ballPos); }
        if (iMissed) { sfx.miss(); pop(L.kind === 'timeout' ? '시간 초과! 상대 +1' : L.kind === 'strikeMiss' ? '공을 놓쳤어요! 상대 +1' : '앗! 상대 +1', '#ff8a9a'); }
        else { sfx.point(); pop('득점! +1', '#ffd21f'); }
        setTimeout(() => { if (M && M.state === 'point') $('ball').classList.add('gone'); }, 500);
        fly = null; setStrikeMode(false); hideRings();
        showPoint(L, iMissed);
      }
    }

    if (M.state === 'countdown') {
      ov.classList.remove('hide'); fly = null; $('ball').classList.add('gone'); hideRings();
      ov.innerHTML = `<div class="vs"><b>${esc(P[me].name)}</b> VS <em>${esc(P[op].name)}</em></div><div class="big" id="cd">3</div><div class="msg">${M.practice ? '연습 경기예요. 편하게 해 봐요!' : '정답을 고르고, 원이 겹칠 때 공을 터치!'}</div>`;
      runCountdown(M.startIn); setPanelIdle('곧 첫 공이 날아와요!'); $('bubble').classList.remove('on'); setStrikeMode(false);
      return;
    }
    if (M.state === 'paused') { ov.classList.remove('hide'); ov.innerHTML = '<div class="big" style="font-size:120px">⏸</div><div class="msg">선생님이 잠시 멈췄어요</div>'; fly = null; hideRings(); setStrikeMode(false); return; }
    ov.classList.add('hide');
    if (M.state === 'flight' && M.ball) {
      const b = M.ball, toMe = b.to === me, now = performance.now();
      const key = b.q + '|' + b.choices.join('|') + '|' + b.full;
      if (b.phase === 'question' && !b.answered && key !== ballKey) {
        ballKey = key; pickedIdx = -1;
        fly = { toMe, phase: 'question', from: { ...ballPos }, born: now, qT0: now - (b.full - b.left), qFull: b.full };
        $('ball').classList.remove('gone'); $('ball').classList.toggle('hot', b.speed >= 1.4 || b.smash);
        $('explain') && $('explain').remove();
        setPanel(b, toMe); setStrikeMode(false);
        $('bubble').classList.toggle('on', toMe);
        if (b.smash && toMe) pop('강 스매시가 날아와요! ⚡', '#ffb020');
        if (toMe && ME && ME.tts) speak(b.q);
      }
      if (b.phase === 'strike' && fly && fly.phase !== 'strike' && key === ballKey) {
        // 반격 준비: 선택지를 숨기고, 공이 터치 지점으로 다가오며 바깥 원이 줄어들어요
        fly = { toMe, phase: 'strike', from: { ...ballPos }, born: now, sT0: now - (b.strikeDur - b.hitIn), sHit: now + b.hitIn, sDur: b.strikeDur, win: b.win, struck: false };
        setStrikeMode(true, toMe); $('bubble').classList.remove('on'); sfx.ready();
      }
    }
    if (M.state === 'ended') { fly = null; $('bubble').classList.remove('on'); hideRings(); setStrikeMode(false); }
  }
  function setScore(id, v) { const el = $(id); if (el.textContent !== String(v)) { el.textContent = v; el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); } }
  function swing(id) { const el = $(id); el.classList.remove('swing'); void el.offsetWidth; el.classList.add('swing'); }
  function pop(t, color) { const el = $('pop'); el.textContent = t; el.style.color = color; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); }
  let cdTimer = null;
  function runCountdown(ms) { clearInterval(cdTimer); const end = Date.now() + ms; const f = () => { const el = $('cd'); if (!el) return clearInterval(cdTimer); const n = Math.ceil((end - Date.now()) / 1000); el.textContent = n > 0 ? n : 'GO!'; if (n <= 0) clearInterval(cdTimer); }; f(); cdTimer = setInterval(f, 200); }
  function setStrikeMode(on, toMe) {
    const sc = $('scr-match'); sc.classList.toggle('strike-me', !!on && !!toMe); sc.classList.toggle('strike-op', !!on && !toMe);
    const g = $('strike-guide');
    if (on) { g.innerHTML = toMe ? '<b>원이 공에 닿을 때 <em>공을 터치!</em></b><span>영어 정답으로 반격 준비 완료</span>' : `<b>${esc(M.players[1 - M.me].name)}이(가) 반격을 노려요!</b><span>정답을 맞혀서 반격 준비 중이에요</span>`; g.classList.remove('hide'); }
    else g.classList.add('hide');
  }
  function hideRings() { $('ring-t').style.opacity = 0; $('ring-s').style.opacity = 0; $('strail').style.opacity = 0; }
  function fx(kind, p) {
    const el = document.createElement('img'); el.src = `img/strike/${kind === 'hit' ? 'hit-effect' : 'miss-effect'}.webp`; el.className = 'fx ' + kind; el.alt = '';
    const d = (kind === 'hit' ? 300 : 260) * Math.max(.55, p.s), ax = kind === 'hit' ? 254 / 512 : 237 / 512, ay = kind === 'hit' ? 257 / 512 : 244 / 512;
    el.style.cssText = `width:${d}px;height:${d}px;left:${p.x - d * ax}px;top:${p.y - d * ay}px;transform-origin:${ax * 100}% ${ay * 100}%`;
    $('scr-match').appendChild(el); setTimeout(() => el.remove(), 800);
  }
  function judgeText(t, color, p) {
    const el = document.createElement('div'); el.className = 'judge'; el.textContent = t; el.style.color = color;
    el.style.left = p.x + 'px'; el.style.top = (p.y - 110 * Math.max(.6, p.s)) + 'px'; $('scr-match').appendChild(el); setTimeout(() => el.remove(), 1000);
  }

  function setPic(pic) {
    const box = $('q-pic');
    if (!pic) { box.classList.add('hide'); return; }
    box.classList.remove('hide');
    $('q-pic-e').innerHTML = /^(img\/|https?:)/.test(pic.e) ? `<img src="${esc(pic.e)}" alt="">` : esc(pic.e);
    $('q-pic-cap').textContent = /^(img\/|https?:)/.test(pic.e) ? '' : pic.cap || '';
  }
  function setPanel(b, toMe) {
    const qp = $('qpanel'); qp.classList.toggle('opp', !toMe); qp.classList.toggle('small-q', b.q.length > 34);
    $('q-who').textContent = toMe ? '⚡ 나에게 오는 공! 알맞은 응답을 고르면 반격 준비' : `${M.players[1 - M.me].name}이(가) 문제를 푸는 중… 같이 생각해 봐요`;
    $('q-text').textContent = b.q; setPic(b.pic);
    const bs = document.querySelectorAll('.ans');
    bs.forEach((el, i) => { el.textContent = b.choices[i]; el.className = 'ans' + (b.choices[i].length > 30 ? ' long' : ''); });
    $('answers').classList.toggle('off', !toMe); $('answers').classList.remove('locked');
  }
  function setPanelIdle(text) { $('qpanel').classList.remove('opp'); $('q-who').textContent = ''; $('q-text').textContent = text; setPic(null); $('gauge').style.width = '100%'; document.querySelectorAll('.ans').forEach(el => { el.textContent = ''; el.className = 'ans'; }); $('answers').classList.add('off'); }
  function showPoint(L, iMissed) {
    // 정답과 고른 답을 보여 주고, 해설을 띄워요
    $('bubble').classList.remove('on');
    $('qpanel').classList.toggle('opp', !iMissed);
    const sm = L.kind === 'strikeMiss';
    $('q-who').textContent = iMissed ? (sm ? '정답은 맞혔지만 공을 놓쳤어요!' : L.kind === 'timeout' ? '시간이 다 됐어요. 정답을 확인해요!' : '아쉬워요! 정답을 확인해요') : (sm ? `${M.players[1 - M.me].name}이(가) 공을 놓쳤어요!` : `${M.players[1 - M.me].name}이(가) 놓쳤어요! 정답은?`);
    $('q-text').textContent = L.q;
    const bs = document.querySelectorAll('.ans');
    bs.forEach((el, i) => { if (L.choices) el.textContent = L.choices[i]; el.className = 'ans' + (el.textContent.length > 30 ? ' long' : '') + (i === L.correctIdx ? ' right' : i === L.pick ? ' wrong' : ''); });
    $('answers').classList.add('off'); $('gauge').style.width = '0%';
    let ex = $('explain'); if (!ex) { ex = document.createElement('div'); ex.id = 'explain'; ex.className = 'explain'; $('scr-match').appendChild(ex); }
    ex.textContent = sm ? (L.judge === 'early' ? '조금 빨랐어요! 바깥 원이 안쪽 원에 겹칠 때 공을 터치해요.' : L.judge === 'late' ? '조금 늦었어요! 원이 겹치는 순간을 노려 봐요.' : '공을 터치하지 않았어요. 정답 뒤에는 공을 직접 눌러야 반격돼요.') : `정답: ${L.answer}${L.exp ? '  ·  ' + L.exp : ''}`;
  }
  document.querySelectorAll('.ans').forEach(el => el.onclick = async () => {
    if (!M || M.state !== 'flight' || !M.ball || M.ball.to !== M.me || pickedIdx >= 0 || M.ball.phase !== 'question') return;
    pickedIdx = Number(el.dataset.i); el.classList.add('picked'); $('answers').classList.add('locked');
    const r = await call('answer', { pick: pickedIdx });
    if (r && r.ok) el.classList.add(r.correct ? 'right' : 'wrong'); else if (r && r.err) { toast(r.err); pickedIdx = -1; $('answers').classList.remove('locked'); }
  });
  $('b-speak').onclick = () => { const t = $('q-text').textContent; if (t) speak(t); };

  // 공 터치: 화면 어디를 눌러도 받되, 공 가까이를 눌렀을 때만 쳐요 (원·궤적·효과는 터치를 가로채지 않아요)
  function stagePoint(e) { const r = stage.getBoundingClientRect(); const k = r.width / 1600; return { x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k }; }
  $('scr-match').addEventListener('pointerdown', async e => {
    if (!fly || fly.phase !== 'strike' || !fly.toMe || fly.struck || !M || M.state !== 'flight') return;
    if (e.target.closest('button')) return;
    const p = stagePoint(e), d = Math.hypot(p.x - ballPos.x, p.y - ballPos.y), R = Math.max(85, 105 * ballPos.s);
    if (d > R) { if (!hintShown) { hintShown = true; toast('움직이는 공을 직접 터치해요!'); } tapMark(p, false); return; }
    const off = Math.round(performance.now() - fly.sHit);
    if (off < -fly.win - 450) { toast('아직이에요! 바깥 원이 안쪽 원에 겹칠 때 터치!', 1500); tapMark(p, false); return; }
    fly.struck = true; tapMark(p, true);
    const r = await call('strike', { off });
    if (r && r.early) fly.struck = false;
  });
  function tapMark(p, ok) { const el = document.createElement('i'); el.className = 'tap' + (ok ? ' ok' : ''); el.style.left = p.x + 'px'; el.style.top = p.y + 'px'; $('scr-match').appendChild(el); setTimeout(() => el.remove(), 500); }

  // 공·원·궤적 움직이기
  function frame(now) {
    requestAnimationFrame(frame);
    const ringT = $('ring-t'), ringS = $('ring-s'), tr = $('strail');
    if (!fly || !M || (M.state !== 'flight' && fly.phase !== 'return')) { if (!fly) { ringT.style.opacity = 0; ringS.style.opacity = 0; tr.style.opacity = 0; } return; }
    const toMe = fly.toMe, A = toMe ? OP_HAND : ME_HAND, S = toMe ? ME_STRIKE : OP_STRIKE, BODY = toMe ? ME_BODY : OP_BODY;
    let pos, ringScale = null;
    if (fly.phase === 'question') {
      const t = Math.min(1, (now - fly.qT0) / fly.qFull);
      const e = .52 * (1 - Math.pow(1 - t, 2)); // 문제를 푸는 동안 공은 절반쯤까지 천천히 다가와요
      pos = arc(A, S, e, 160); pos.y += Math.sin(now / 180) * 4 * pos.s;
      const left = 1 - t; const g = $('gauge'); g.style.width = (left * 100).toFixed(1) + '%'; g.classList.toggle('warn', left < .3 && toMe);
      if (toMe && left < .3 && !fly.ticked) { fly.ticked = true; sfx.tick(); }
    } else if (fly.phase === 'strike') {
      const u = (now - fly.sT0) / fly.sDur; // 0 → 1(원이 겹치는 순간) → 넘어가면 몸으로
      if (u <= 1) { const k = 1 - Math.pow(1 - Math.max(0, u), 3); pos = { x: lerp(fly.from.x, S.x, k), y: lerp(fly.from.y, S.y, k) - Math.sin(Math.PI * k) * 40 * S.s, s: lerp(fly.from.s, S.s, k) }; }
      else { const k = Math.min(1, (u - 1) * fly.sDur / 700); pos = { x: lerp(S.x, BODY.x, k), y: lerp(S.y, BODY.y, k), s: lerp(S.s, BODY.s, k) }; }
      ringScale = 1 + 1.45 * Math.max(0, 1 - u) - Math.max(0, u - 1) * 1.2;
    } else if (fly.phase === 'return') {
      const t = Math.min(1, (now - fly.t0) / fly.dur), T = fly.toMe ? arc(OP_HAND, ME_STRIKE, .3, 0) : arc(ME_HAND, OP_STRIKE, .3, 0);
      pos = { x: lerp(fly.from.x, T.x, t), y: lerp(fly.from.y, T.y, t) - Math.sin(Math.PI * t) * 90, s: lerp(fly.from.s, T.s, t) };
      if (t >= 1) fly.phase = 'hold';
    } else { pos = { ...ballPos }; }
    const blend = fly.born ? Math.min(1, (now - fly.born) / 240) : 1; // 이어서 부드럽게
    if (blend < 1 && fly.phase === 'question') pos = { x: lerp(fly.from.x, pos.x, blend), y: lerp(fly.from.y, pos.y, blend), s: lerp(fly.from.s, pos.s, blend) };
    prevPos = ballPos; ballPos = pos;
    const ball = $('ball'); ball.style.transform = `translate(${pos.x - BALL_D * BALL_AX}px,${pos.y - BALL_D * BALL_AY}px) scale(${pos.s}) rotate(${now / 4 % 360}deg)`;
    // 두 원: 안쪽 원은 공에 붙어 있고, 바깥 원이 줄어들다 겹치는 순간이 터치 타이밍
    if (ringScale != null && ringScale > .35) {
      const d = RING_D * pos.s, dt = d * ringScale, near = Math.abs(ringScale - 1) < .12;
      ringS.style.cssText = `opacity:1;width:${d}px;height:${d}px;transform:translate(${pos.x - d * 233 / 512}px,${pos.y - d * 256 / 512}px)`;
      ringT.style.cssText = `opacity:${ringScale < 1 ? Math.max(0, ringScale * 1.5 - .5) : 1};width:${dt}px;height:${dt}px;transform:translate(${pos.x - dt * 255 / 512}px,${pos.y - dt * 256 / 512}px)`;
      ringS.classList.toggle('near', near); ringT.classList.toggle('near', near);
    } else { ringT.style.opacity = 0; ringS.style.opacity = 0; }
    // 궤적: 진행 방향으로 돌려서 공 뒤에 붙여요
    if (prevPos) {
      const dx = pos.x - prevPos.x, dy = pos.y - prevPos.y, sp = Math.hypot(dx, dy);
      if (sp > .4) {
        const ang = Math.atan2(dy, dx) * 180 / Math.PI, d = 300 * pos.s;
        tr.style.cssText = `opacity:${Math.min(.95, .35 + sp / 10)};width:${d}px;height:${d}px;transform-origin:${TRAIL_AX * 100}% ${TRAIL_AY * 100}%;transform:translate(${pos.x - d * TRAIL_AX}px,${pos.y - d * TRAIL_AY}px) rotate(${ang - TRAIL_DIR}deg)`;
      } else tr.style.opacity = Math.max(0, (parseFloat(tr.style.opacity) || 0) - .05);
    }
  }
  requestAnimationFrame(frame);
  window.RB = { show, call, socket, toast, sfx, esc, route: () => route() };
  window.__rb = { get M() { return M; }, get fly() { return fly; }, get ballPos() { return ballPos; },
    toClient(p) { const r = stage.getBoundingClientRect(), k = r.width / 1600; return { x: r.left + p.x * k, y: r.top + p.y * k }; } };

  /* ---------- 결과 ---------- */
  function showResult() {
    show('scr-result'); $('trail').innerHTML = '';
    const me = M.me, P = M.players, win = M.winner === me, draw = M.winner === -1;
    const h = $('r-head'); h.textContent = draw ? 'DRAW' : win ? 'WIN!' : 'GOOD GAME'; h.classList.toggle('lose', !win && !draw);
    if (win) sfx.win();
    $('r-score').innerHTML = `${esc(P[me].name)} <b style="color:var(--cyan)">${P[me].score}</b> : <b style="color:#ff8a8a">${P[1 - me].score}</b> ${esc(P[1 - me].name)}`;
    $('r-gain').textContent = `이번 경기 +${P[me].gain}점 · 맞힌 문제 ${P[me].correct}개 · 최고 랠리 ${M.bestRally}${M.why === 'left' ? ' · 상대가 나갔어요' : M.why === 'stop' ? ' · 선생님이 경기를 마쳤어요' : ''}`;
    const hs = (M.history || []);
    $('r-review').innerHTML = hs.length ? hs.map(x => `<div class="rv"><div class="q">${esc(x.q)}</div><div class="a">✔ ${esc(x.answer)}</div><div class="x">${esc(x.who)}: ${esc(x.picked)}</div></div>`).join('') : '<div class="rv">놓친 공이 하나도 없었어요! 완벽해요 👏</div>';
    clearInterval(resultTimer);
    const end = Date.now() + (ME.waitLeft || 8000);
    const f = () => { const s = Math.max(0, Math.ceil((end - Date.now()) / 1000)); $('r-next').textContent = ME.running ? (s > 0 ? `${s}초 뒤 새 상대와 자동으로 경기해요` : '새 상대를 찾고 있어요…') : '오늘 경기가 끝났어요. 수고했어요!'; };
    f(); resultTimer = setInterval(f, 300);
  }

  /* ---------- 랭킹 ---------- */
  let rkTab = 'cls', rkData = null;
  $('b-rank').onclick = async () => { sfx.click(); $('rank').classList.remove('hide'); rkData = await call('myRanking', { by: 'points' }); drawRank(); };
  $('rk-tabs').onclick = e => { const b = e.target.closest('button'); if (!b) return; rkTab = b.dataset.t; [...$('rk-tabs').children].forEach(x => x.classList.toggle('on', x === b)); drawRank(); };
  function drawRank() {
    if (!rkData || !rkData.ok) return; const L = $('rk-list');
    if (rkTab === 'battle') { L.innerHTML = `<div class="rk head"><span>순위</span><span>반</span><span>평균점수</span><span>정답률</span><span>참가</span><span></span></div>` + rkData.battle.map((c, i) => `<div class="rk ${c.code === ME.code ? 'me' : ''}"><span class="n">${i + 1}</span><span>${esc(c.name)}</span><span>${c.avg}점</span><span>${c.acc}%</span><span>${c.players}명</span><span></span></div>`).join(''); return; }
    const rows = rkTab === 'cls' ? rkData.cls : rkData.grade;
    L.innerHTML = `<div class="rk head"><span>순위</span><span>이름</span><span>점수</span><span>승</span><span>정답률</span><span>최고 랠리</span></div>` + (rows.length ? rows.map(x => `<div class="rk ${x.id === rkData.me ? 'me' : ''}"><span class="n">${x.rank}</span><span>${esc(x.name)} ${rkTab === 'grade' ? `<small>${esc(x.cls)}</small>` : ''}</span><span>${x.points}</span><span>${x.wins}</span><span>${x.acc}%</span><span>${x.bestRally}</span></div>`).join('') : '<div class="rk"><span></span><span>아직 경기 기록이 없어요</span></div>');
  }
})();
