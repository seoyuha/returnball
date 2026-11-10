// 영어 리턴볼 — 선생님 관리
(() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const socket = io({ transports: ['websocket', 'polling'] });
  const call = (ev, d) => new Promise(r => socket.emit(ev, d || {}, r));
  let TK = null, CODE = null, V = null, CLASSES = [], LIVE = {}, tab = 'live';
  try { TK = sessionStorage.getItem('rb_t'); CODE = localStorage.getItem('rb_cls'); } catch (e) {}
  function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('on'), 2200); }
  const STATUS = { playing: '경기 중', waiting: '대기', result: '결과', practice: 'AI 연습', lobby: '대기' };

  /* ---------- 로그인 ---------- */
  async function login(pw) {
    const r = await call('t:login', { pw, token: TK });
    if (!r.ok) { $('login-err').textContent = r.err; TK = null; return; }
    TK = r.token; try { sessionStorage.setItem('rb_t', TK); } catch (e) {}
    CLASSES = r.classes; $('login').classList.add('hide'); $('app').classList.remove('hide');
    openClass(CLASSES.find(c => c.code === CODE) ? CODE : CLASSES[0] && CLASSES[0].code);
  }
  $('login-form').onsubmit = e => { e.preventDefault(); $('login-err').textContent = ''; login($('pw').value); };
  socket.on('connect', () => { if (TK) login(''); });

  /* ---------- 반 ---------- */
  function drawClasses() {
    $('classes').innerHTML = CLASSES.map(c => `<button data-code="${c.code}" class="${c.code === CODE ? 'on' : ''}">${esc(c.name)}<i>${c.online}/${c.students}명</i>${c.running ? '<span class="dot"></span>' : ''}</button>`).join('');
  }
  $('classes').onclick = e => { const b = e.target.closest('button'); if (b) openClass(b.dataset.code); };
  $('b-newclass').onclick = async () => { const name = prompt('새 반 이름 (예: 6학년 11반)'); if (!name) return; const r = await call('t:newClass', { name }); if (r.ok) { CLASSES = r.classes; drawClasses(); toast('반을 만들었어요. 입장 코드는 반 탭에서 볼 수 있어요.'); } };
  async function openClass(code) {
    if (!code) return; CODE = code; try { localStorage.setItem('rb_cls', code); } catch (e) {}
    const r = await call('t:open', { code }); if (!r.ok) return toast(r.err);
    V = r.view; LIVE = {}; for (const m of V.live) LIVE[m.id] = m;
    drawClasses(); drawAll(); refreshTab();
  }
  socket.on('tstate', v => { if (v.code !== CODE) return; V = v; for (const m of v.live) LIVE[m.id] = m; drawAll(); const c = CLASSES.find(x => x.code === v.code); if (c) { c.online = v.students.filter(s => s.online).length; c.students = v.students.length; c.running = v.running; drawClasses(); } });
  socket.on('tmatch', m => { LIVE[m.id] = m; if (WATCH && WATCH.id === m.id) { WATCH = m; renderWatch(); } if (m.state === 'ended') setTimeout(() => { delete LIVE[m.id]; drawMatches(); }, 15000); drawMatches(); });
  socket.on('feed', t => toast(t));

  /* ---------- 탭 ---------- */
  $('tabs').onclick = e => { const b = e.target.closest('button'); if (!b) return; tab = b.dataset.tab; [...$('tabs').children].forEach(x => x.classList.toggle('on', x === b)); document.querySelectorAll('.tab').forEach(t => t.classList.toggle('hide', t.id !== 'tab-' + tab)); refreshTab(); };
  function refreshTab() { if (tab === 'rank') loadRank(); if (tab === 'wrong') loadWrong(); if (tab === 'ques') loadQ(); if (tab === 'stud') drawStud(); }

  /* ---------- 경기 현황 ---------- */
  function drawAll() {
    if (!V) return; const st = V.settings;
    document.querySelectorAll('#units button').forEach(b => b.classList.toggle('on', Number(b.dataset.unit) === st.unit));
    document.querySelectorAll('#settings select').forEach(s => { s.value = String(st[s.dataset.k]); });
    $('b-start').disabled = V.running && !V.paused; $('b-start').textContent = V.running ? '▶ 경기 진행 중' : '▶ 경기 시작 (자동 짝 배정)';
    $('b-summary').classList.toggle('hide', !V.hasSummary || V.running);
    $('b-pause').disabled = !V.running; $('b-pause').textContent = V.paused ? '▶ 다시 시작' : '⏸ 잠시 멈춤'; $('b-stop').disabled = !V.running;
    const ar = st.mode === 'arena';
    document.querySelectorAll('#modes button').forEach(b => b.classList.toggle('on', b.dataset.mode === st.mode));
    document.querySelectorAll('#settings label[data-for]').forEach(l => l.classList.toggle('hide', l.dataset.for !== st.mode));
    $('comprow').classList.toggle('hide', !ar);
    document.querySelectorAll('#comps button').forEach(b => b.classList.toggle('on', b.dataset.v === (st.comp || 'free')));
    $('lg-wrap').classList.toggle('hide', st.comp !== 'league'); $('lg-games').value = String(st.leagueGames || 4);
    const CH = { free: '시작하면 계속 자동으로 모여 경기해요. 먼저 탈락한 친구들은 서로 묶여 새 경기를 해요.', tournament: '시작할 때 들어와 있는 학생으로 대진을 짜요. 경기마다 상위 2명(2명 경기는 1명) 진출, 4명 이하가 되면 결승! 탈락한 학생은 자유 경기를 계속해요.', league: `한 사람당 ${st.leagueGames || 4}경기씩, 순위에 따라 승점(4명 경기 1등 3점·2등 2점·3등 1점)을 모아요.` };
    $('comp-hint').textContent = CH[st.comp || 'free'] + (V.running && V.comp && V.comp.active && V.comp.type !== (st.comp || 'free') ? ' (지금 진행 중인 대회는 그대로예요. 경기 끝내기 후 다시 시작하면 바뀌어요)' : '');
    drawComp();
    $('run-state').textContent = !V.running ? `지금은 대기 중이에요. ${st.unit}단원 · ${ar ? 'B 경기장 이동' : 'A 터치 반격'}으로 시작할 준비가 됐어요.` : V.paused ? '잠시 멈춤 중 — 모든 경기의 공이 멈춰 있어요.' : ar ? `${st.unit}단원 경기장 경기 중 — ${st.groupSize}명씩 자동으로 모이고, 모자라면 AI가 채워요.` : `${st.unit}단원 경기 중 — 경기가 끝난 학생은 ${8}초 뒤 다른 친구와 자동으로 다시 경기해요.`;
    $('j-code').textContent = V.code; const url = location.origin + '/'; $('j-url').textContent = url;
    const qr = $('qr'); qr.classList.toggle('hide', !window.QRCode); if (qr.dataset.v !== url && window.QRCode) { qr.innerHTML = ''; new QRCode(qr, { text: url, width: 140, height: 140 }); qr.dataset.v = url; }
    const on = V.students.filter(s => s.online);
    $('stud-count').textContent = `접속 ${on.length}명 / 전체 ${V.students.length}명`;
    $('chips').innerHTML = V.students.length ? V.students.map(s => `<span class="chip st-${s.online ? s.status : 'off'}" title="${STATUS[s.status] || ''}">${esc(s.name)}</span>`).join('') : '<div class="empty">아직 들어온 학생이 없어요</div>';
    $('log').innerHTML = V.log.length ? V.log.map(l => `<div><small>${new Date(l.at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</small>${l.text ? esc(l.text) : `${esc(l.a)} <b>${l.sa}:${l.sb}</b> ${esc(l.b)}`} <small>${l.unit}단원 · 랠리 ${l.rally}</small></div>`).join('') : '<div class="empty">아직 끝난 경기가 없어요</div>';
    drawMatches(); if (tab === 'stud') drawStud();
  }
  const RCOL = { blue: '#3cc8ff', red: '#ff6a5a', green: '#5ff08a', purple: '#c98bff' };
  const mmss = ms => { const t = Math.ceil(ms / 1000); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
  const heartsHtml = (n, max) => Array.from({ length: max }, (_, k) => `<img class="hrt" src="img/arena/ui/heart-${k < n ? 'full' : 'empty'}.webp" alt="">`).join('');
  function arenaCard(m) {
    const max = Math.max(V.settings.hearts || 2, ...m.players.map(p => p.hearts));
    const st = m.state === 'ended' ? `🏆 ${esc(m.players[m.winner].name)} 1위` : m.state === 'paused' ? '⏸ 멈춤' : m.state === 'countdown' ? '곧 시작' : `남은 시간 ${mmss(m.timeLeft)} · 랠리 ${m.rally}`;
    return `<div class="mcard arena ${m.state === 'ended' ? 'ended' : ''}" data-watch="${m.id}"><div class="ap-tag">${esc(m.label || '')}${m.finalOn ? (/결승/.test(m.label || '') ? '' : ' · ⚔️ 마지막 대결') : ''}${m.fever ? ' · 🔥 피버' : ''}</div><div class="ap-list">${m.players.map((p, i) => `<div class="ap ${p.out && !p.reviving ? 'out' : ''} ${p.reviving ? 'rev' : ''}" style="--c:${RCOL[p.color]}"><span class="ap-n">${m.target === i && m.state !== 'ended' ? '⚽ ' : ''}${p.isBot ? '🤖' : ''}${esc(p.name)}</span><span>${p.reviving ? '<small>부활 도전</small>' : p.finished && m.state !== 'ended' ? `<small>${p.place}위</small>` : heartsHtml(p.hearts, max)}</span></div>`).join('')}</div>
      <div class="mfoot"><span class="meta">🏟 ${st}</span><button class="watchbtn" data-watch="${m.id}" aria-label="경기장 경기 크게 보기">경기 크게 보기</button></div></div>`;
  }
  function drawMatches() {
    const list = Object.values(LIVE).sort((a, b) => (a.state === 'ended') - (b.state === 'ended'));
    const n = list.filter(m => m.state !== 'ended').length;
    $('live-count').textContent = n ? `${n}경기 진행 중` : '';
    $('matches').innerHTML = list.length ? list.map(m => {
      if (m.mode === 'arena') return arenaCard(m);
      const [a, b] = m.players; const st = m.state === 'ended' ? (m.winner === -1 ? '무승부' : `🏆 ${esc(m.players[m.winner].name)} 승리`) : m.state === 'paused' ? '⏸ 멈춤' : m.state === 'countdown' ? '곧 시작' : `랠리 ${m.rally} · 최고 ${m.bestRally}`;
      return `<div class="mcard ${m.state === 'ended' ? 'ended' : ''}" data-watch="${m.id}"><div class="vs"><span class="p ${m.ballTo === 0 ? 'has' : ''}">${m.ballTo === 0 ? '⚽ ' : ''}${a.isBot ? '🤖' : ''}${esc(a.name)}</span><span class="sc"><span class="a">${a.score}</span> : <span class="b">${b.score}</span></span><span class="p r ${m.ballTo === 1 ? 'has' : ''}">${b.isBot ? '🤖' : ''}${esc(b.name)}${m.ballTo === 1 ? ' ⚽' : ''}</span></div>
        <div class="q">${m.q ? esc(m.q) : ''}</div><div class="mfoot"><span class="meta">${st} · 먼저 ${m.target}점</span><button class="watchbtn" data-watch="${m.id}" aria-label="${esc(a.name)} 대 ${esc(b.name)} 경기 크게 보기">경기 크게 보기</button></div></div>`;
    }).join('') : '<div class="empty">경기를 시작하면 여기에 경기가 보여요</div>';
  }
  $('comps').onclick = async e => { const b = e.target.closest('button'); if (!b) return; const r = await call('t:settings', { code: CODE, settings: { comp: b.dataset.v } }); if (r.ok) { V = r.view; drawAll(); } };
  $('lg-games').onchange = async e => { const r = await call('t:settings', { code: CODE, settings: { leagueGames: Number(e.target.value) } }); if (r.ok) { V = r.view; drawAll(); } };
  function compHtml(C, bigMode) {
    if (!C || !C.active) return '';
    if (C.type === 'tournament') {
      const champ = C.champion ? `<div class="champ">👑 우승 <b>${esc(C.champion)}</b></div>` : '';
      const rounds = (C.rounds || []).map(r => `<div class="tr-round"><h4>${r.final ? '🏆 결승' : r.round + '라운드'}</h4>${r.groups.map(g => `<div class="tr-g ${g.done ? 'done' : 'live'}">${g.names.map(n => `<span class="${g.advanced.includes(n) || (r.final && C.champion === n) ? 'adv' : g.done ? 'out' : ''}">${esc(n)}</span>`).join('')}<small>${g.done ? (r.final ? '끝' : '진출 ' + g.advanced.length + '명') : '경기 중 · 상위 ' + g.advance + '명 진출'}</small></div>`).join('')}</div>`).join('');
      return `${champ}<div class="tr-wrap">${rounds || '<div class="empty">곧 1라운드가 시작돼요</div>'}</div>${!C.champion ? `<p class="hint small">남은 학생 ${C.alive.length}명: ${C.alive.map(esc).join(', ')}${C.waitingNext ? ' — 곧 다음 라운드' : ''}</p>` : ''}`;
    }
    if (C.type === 'league') {
      const rows = C.table || [];
      return `${C.done ? '<div class="champ">📊 리그 끝! 1위 <b>' + esc(rows[0] ? rows[0].name : '') + '</b></div>' : ''}${rows.length ? `<table><tr><th>순위</th><th>이름</th><th>승점</th><th>경기</th><th>1등</th><th>받아치기</th><th>정답</th></tr>${rows.map(r => `<tr class="${r.rank === 1 ? 'top1' : ''}"><td>${r.rank}</td><td>${esc(r.name)}</td><td><b>${r.pts}</b></td><td>${r.played}/${C.games}</td><td>${r.wins}</td><td>${r.hits}</td><td>${r.correct}</td></tr>`).join('')}</table>` : '<div class="empty">첫 경기가 끝나면 승점표가 나와요</div>'}`;
    }
    return '';
  }
  function drawComp() {
    const C = V && V.comp, on = C && C.active && C.type !== 'free';
    $('comp-card').classList.toggle('hide', !on); if (!on) return;
    $('comp-title').textContent = C.type === 'tournament' ? `🏆 토너먼트${C.round ? ' · ' + C.round + '라운드' : ''}` : `📊 리그전 · 한 사람당 ${C.games}경기`;
    $('comp-body').innerHTML = compHtml(C);
  }
  $('b-compbig').onclick = () => { const C = V.comp; big(`<div class="bigrank comp-big"><h2>${C.type === 'tournament' ? '🏆 토너먼트 대진표' : '📊 리그전 승점표'}</h2>${compHtml(C, true)}</div>`); };
  socket.on('champion', c => { if (!c.name) return; toast(`👑 토너먼트 우승: ${c.name}!`); big(`<div class="crown-big"><div class="cb-crown">👑</div><div class="cb-name">${esc(c.name)}</div><div class="cb-sub">토너먼트 우승을 축하해요!</div></div>`); });
  $('modes').onclick = async e => { const b = e.target.closest('button'); if (!b) return; const r = await call('t:settings', { code: CODE, settings: { mode: b.dataset.mode } }); if (r.ok) { V = r.view; drawAll(); toast(b.dataset.mode === 'arena' ? 'B 경기장 이동형으로 바꿨어요. 다음 경기부터 적용돼요.' : 'A 터치 반격으로 바꿨어요. 다음 경기부터 적용돼요.'); } };
  $('units').onclick = async e => { const b = e.target.closest('button'); if (!b) return; const r = await call('t:settings', { code: CODE, settings: { unit: Number(b.dataset.unit) } }); if (r.ok) { V = r.view; drawAll(); toast(`${b.dataset.unit}단원으로 바꿨어요. 다음 경기부터 적용돼요.`); } };
  $('settings').onchange = async e => { const s = e.target; let v = s.value; if (v === 'true' || v === 'false') v = v === 'true'; else if (!isNaN(Number(v))) v = Number(v); const r = await call('t:settings', { code: CODE, settings: { [s.dataset.k]: v } }); if (r.ok) { V = r.view; drawAll(); toast('설정을 바꿨어요.'); } };
  $('b-start').onclick = async () => { const r = await call('t:start', { code: CODE }); if (r.ok) { V = r.view; drawAll(); } };
  $('b-pause').onclick = async () => { const r = await call('t:pause', { code: CODE }); if (r.ok) { V = r.view; drawAll(); } };
  $('b-stop').onclick = async () => { if (!confirm('모든 경기를 끝낼까요? 지금 점수로 결과가 정해져요.')) return; const r = await call('t:stop', { code: CODE }); if (!r.ok) return toast(r.err); V = r.view; drawAll(); if (r.summary && r.summary.matches) showSummary(r.summary); else toast('이번 수업에 끝난 경기가 없어서 마무리 화면은 건너뛰었어요.'); };
  $('b-summary').onclick = async () => { const r = await call('t:lastSummary', { code: CODE }); if (r.ok) showSummary(r.summary); else toast(r.err); };
  $('b-bigcode').onclick = () => { big(`<div class="bigcode"><div class="bq-unit">${V.settings.unit}단원 · ${V.units[V.settings.unit].short}</div><div class="code-label" style="font-size:3vw;margin-top:3vh">${esc(V.name)} 입장 코드</div><div class="code">${V.code}</div><div class="url">${esc(location.origin)}/</div><div class="qr" id="bigqr"></div></div>`); if (window.QRCode) new QRCode($('bigqr'), { text: location.origin + '/', width: 260, height: 260 }); };

  /* ---------- 크게 띄우기 ---------- */
  function big(html, keepWatch) { if (!keepWatch) WATCH = null; $('big-body').innerHTML = html; $('big').classList.remove('hide'); }
  function closeBig() { $('big').classList.add('hide'); WATCH = null; }
  $('big-close').onclick = closeBig;
  addEventListener('keydown', e => { if (e.key === 'Escape') closeBig(); });

  /* ---------- 경기 크게 보기 (칠판용 관전) ----------
     문제·선택지·정답은 보여 주지 않아요. 경기 정보가 바뀔 때마다 열린 창도 함께 바뀌어요. */
  let WATCH = null;
  $('matches').onclick = e => { const el = e.target.closest('[data-watch]'); if (!el) return; const m = LIVE[el.dataset.watch]; if (m) { WATCH = m; renderWatch(true); } };
  function renderWatch(open) {
    const m = WATCH; if (!m) return; if (!open && $('big').classList.contains('hide')) { WATCH = null; return; }
    if (m.mode === 'arena') {
      const max = Math.max(V.settings.hearts || 2, ...m.players.map(p => p.hearts)), ended = m.state === 'ended';
      const stTxt = ended ? '경기 종료' : m.state === 'paused' ? '잠시 멈춤' : m.state === 'countdown' ? '곧 시작' : m.state === 'serve' ? '공이 곧 나와요' : '경기 중';
      const order = ended ? m.players.map((p, i) => ({ p, i })).sort((a, b) => a.p.place - b.p.place) : m.players.map((p, i) => ({ p, i }));
      order.forEach(o => { if (o.p.reviving) o.p.out = true; });
      return big(`<div class="watch"><div class="bq-unit">${m.unit}단원 · ${esc(m.label || '경기장 이동')} · ${m.finalOn && !ended ? (/결승/.test(m.label || '') ? '🏆 결승 2인 대결' : '⚔️ 마지막 대결') : stTxt}${m.fever && !ended ? ' · 🔥 피버' : ''}</div>
        <div class="w-board arena">${order.map(({ p, i }) => `<div class="wa ${p.out ? 'out' : ''} ${!ended && m.target === i ? 'chased' : ''}" style="--c:${RCOL[p.color]}">${ended ? `<div class="wa-place">${p.place}위</div>` : ''}<img src="img/arena/robots/${p.color}-right-idle.webp" alt=""><div class="wa-name">${p.isBot ? '🤖 ' : ''}${esc(p.name)}</div><div class="wa-hearts">${heartsHtml(p.hearts, max)}</div>
          <div class="wa-meta">치기 ${p.hits} · 충전 ${p.charges}/3</div>${!ended && m.target === i ? '<div class="wa-tag">⚽ 공이 쫓는 중</div>' : p.reviving && !ended ? '<div class="wa-tag rev">부활 도전 중</div>' : p.finished && !ended ? `<div class="wa-tag out">${p.place}위 · 경기 끝</div>` : ''}</div>`).join('')}</div>
        <div class="w-foot"><span>남은 시간 <b>${mmss(m.timeLeft)}</b></span><span>현재 랠리 <b>${m.rally}</b></span><span>최고 랠리 <b>${m.bestRally}</b></span></div></div>`, true);
    }
    const [a, b] = m.players, ended = m.state === 'ended';
    const stTxt = ended ? '경기 종료' : m.state === 'paused' ? '잠시 멈춤' : m.state === 'countdown' ? '곧 시작' : m.state === 'point' ? '득점!' : '경기 중';
    let mid;
    if (ended) mid = `<div class="w-end">경기 종료</div><div class="w-win">${m.winner === -1 ? '무승부' : '🏆 ' + esc(m.players[m.winner].name) + ' 승리'}</div>`;
    else if (m.state === 'flight' && m.ballTo != null) mid = `<div class="w-dir ${m.ballTo === 0 ? 'to-a' : 'to-b'}"><span class="arr">${m.ballTo === 0 ? '◀◀' : ''}</span><img src="img/ball.webp" alt="공"><span class="arr">${m.ballTo === 1 ? '▶▶' : ''}</span></div><div class="w-sub">${esc(m.players[m.ballTo].name)}에게 가는 공</div>`;
    else mid = `<div class="w-end small">${stTxt}</div>`;
    const side = (p, i) => `<div class="w-p ${i ? 'b' : 'a'} ${!ended && m.ballTo === i && m.state === 'flight' ? 'has' : ''} ${ended && m.winner === i ? 'win' : ''}"><img class="w-robot" src="img/${i ? 'robot_red' : 'robot_blue'}.webp" alt=""><div class="w-name">${p.isBot ? '🤖 ' : ''}${esc(p.name)}</div><div class="w-score">${p.score}</div></div>`;
    const html = `<div class="watch"><div class="bq-unit">${m.unit}단원 · ${V.units[m.unit].short} · ${stTxt}</div>
      <div class="w-board">${side(a, 0)}<div class="w-mid">${mid}</div>${side(b, 1)}</div>
      <div class="w-foot"><span>현재 랠리 <b>${m.rally}</b></span><span>최고 랠리 <b>${m.bestRally}</b></span><span>먼저 <b>${m.target}</b>점</span></div></div>`;
    big(html, true);
  }

  /* ---------- 수업 마무리 ---------- */
  function showSummary(S) {
    const order = [2, 1, 3].map(k => S.podium.find(p => p.rank === k)).filter(Boolean);
    const medal = { 1: '🥇', 2: '🥈', 3: '🥉' }, cls = { 1: 'gold', 2: 'silver', 3: 'bronze' };
    const pod = order.length ? `<div class="podium">${order.map(p => `<div class="pod ${cls[p.rank]}"><div class="pod-rank">${medal[p.rank]} ${p.names.length > 1 ? '공동 ' : ''}${p.rank}위</div><div class="pod-names">${p.names.map(esc).join('<br>')}</div><div class="pod-pts">${p.points}점</div></div>`).join('')}</div>` : '<div class="empty big-empty">이번 수업에 끝난 경기가 없어요</div>';
    const best = S.best && S.best.rally ? `<div class="sc-big">${S.best.rally}<small>번</small></div><p>${S.best.names.slice(0, 2).map(esc).join('<br>')}${S.best.names.length > 2 ? `<br>외 ${S.best.names.length - 2}경기` : ''}</p>` : '<p class="none">이번 수업에는 랠리가 이어지지 않았어요</p>';
    const top = S.top ? `<div class="sc-q">${esc(S.top.q)}</div><p class="sc-a">정답 · ${esc(S.top.answer)}</p><p>오답 <b>${S.top.wrong}</b>번 · 응답 ${S.top.seen}번 (${S.top.rate}%)</p>` : '<p class="none">이번 수업에 틀린 문제가 없어요</p>';
    const t = d => new Date(d).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    big(`<div class="summary"><div class="bq-unit">${esc(S.cls)} · ${S.units.map(u => u + '단원').join(' · ')} 수업 마무리</div>${pod}
      <div class="sum-cards"><div class="scard"><h4>⚡ 오늘의 최고 랠리</h4>${best}</div><div class="scard"><h4>❗ 가장 많이 틀린 문제</h4>${top}</div></div>
      ${S.champion ? `<div class="sum-champ">👑 토너먼트 우승 <b>${esc(S.champion)}</b></div>` : ''}${S.league && S.league.length ? `<div class="sum-champ">📊 리그 1위 <b>${esc(S.league[0].name)}</b> (승점 ${S.league[0].pts})</div>` : ''}
      <div class="sum-foot">참여 ${S.players}명 · 경기 ${S.matches}번 · ${t(S.startedAt)} ~ ${t(S.endedAt)}</div></div>`);
  }

  /* ---------- 랭킹 ---------- */
  let rkScope = 'cls', rkBy = 'points', RK = null, rkView = 'table', gMetric = 'avg';
  $('rk-scope').onclick = e => seg(e, 'rk-scope', v => { rkScope = v; drawRank(); });
  $('g-metric').onclick = e => seg(e, 'g-metric', v => { gMetric = v; drawRank(); });
  $('b-graph').onclick = () => { rkView = rkView === 'graph' ? 'table' : 'graph'; drawRank(); };
  function niceMax(v) { if (v <= 10) return 10; const p = Math.pow(10, Math.floor(Math.log10(v))); for (const k of [1, 2, 2.5, 5, 10]) if (k * p >= v) return k * p; return v; }
  function graphHtml() {
    const acc = gMetric === 'acc', rows = RK.battle;
    const max = acc ? 100 : niceMax(Math.max(0, ...rows.filter(c => c.players).map(c => c.avg)));
    const ticks = [0, max / 4, max / 2, max * 3 / 4, max];
    return `<div class="graph" role="img" aria-label="반 대항전 ${acc ? '정답률' : '평균 점수'} 막대그래프">
      <div class="g-title">${acc ? '반별 정답률 (0~100%)' : '반별 평균 점수 (0점부터)'}</div>
      ${rows.map((c, i) => { const v = acc ? c.acc : c.avg; return `<div class="g-row ${i === 0 && c.players ? 'lead' : ''}"><div class="g-name">${esc(c.name)}<small>참가 ${c.players}명</small></div>
        <div class="g-track">${c.players ? `<div class="g-fill ${acc ? 'acc' : ''}" style="width:${(v / max * 100).toFixed(1)}%"></div>` : '<span class="g-none">경기 기록 없음</span>'}</div>
        <div class="g-val">${c.players ? (acc ? v + '%' : v + '점') : '-'}</div></div>`; }).join('')}
      <div class="g-axis"><div></div><div class="g-ticks">${ticks.map(x => `<span style="left:${x / max * 100}%">${Math.round(x)}${acc ? '%' : ''}</span>`).join('')}</div><div></div></div></div>`;
  }
  $('rk-by').onclick = e => seg(e, 'rk-by', v => { rkBy = v; loadRank(); });
  function seg(e, id, fn) { const b = e.target.closest('button'); if (!b) return; [...$(id).children].forEach(x => x.classList.toggle('on', x === b)); fn(b.dataset.v); }
  async function loadRank() { RK = await call('t:ranking', { code: CODE, by: rkBy }); drawRank(); }
  function rankHtml(limit) {
    if (!RK || !RK.ok) return '';
    if (rkScope === 'battle' && rkView === 'graph') return graphHtml();
    if (rkScope === 'battle') return `<table><tr><th>순위</th><th>반</th><th>평균 점수</th><th>정답률</th><th>참가 학생</th><th>경기 수</th></tr>${RK.battle.map((c, i) => `<tr class="${i === 0 ? 'top1' : ''}"><td>${i + 1}</td><td>${esc(c.name)}</td><td>${c.avg}</td><td>${c.acc}%</td><td>${c.players}명</td><td>${c.games}</td></tr>`).join('')}</table>`;
    const rows = (rkScope === 'cls' ? RK.cls : RK.grade).slice(0, limit || 999);
    if (!rows.length) return '<div class="empty">아직 경기 기록이 없어요</div>';
    return `<table><tr><th>순위</th><th>이름</th>${rkScope === 'grade' ? '<th>반</th>' : ''}<th>점수</th><th>승</th><th>패</th><th>정답률</th><th>최고 랠리</th><th>경기</th></tr>${rows.map(x => `<tr class="${x.rank === 1 ? 'top1' : ''}"><td>${x.rank}</td><td>${esc(x.name)}</td>${rkScope === 'grade' ? `<td>${esc(x.cls)}</td>` : ''}<td>${x.points}</td><td>${x.wins}</td><td>${x.losses}</td><td>${x.acc}%</td><td>${x.bestRally}</td><td>${x.games}</td></tr>`).join('')}</table>`;
  }
  function drawRank() {
    const bt = rkScope === 'battle'; $('b-graph').classList.toggle('hide', !bt); $('g-metric').classList.toggle('hide', !bt || rkView !== 'graph'); $('rk-by').classList.toggle('hide', bt);
    $('b-graph').textContent = rkView === 'graph' ? '표 보기' : '그래프 보기'; $('b-graph').setAttribute('aria-pressed', rkView === 'graph');
    $('rk-table').innerHTML = rankHtml();
  }
  $('b-rkbig').onclick = () => big(`<div class="bigrank"><h2>🏆 ${rkScope === 'battle' ? '반 대항전' + (rkView === 'graph' ? (gMetric === 'acc' ? ' · 정답률' : ' · 평균 점수') : '') : rkScope === 'grade' ? '6학년 전체 랭킹' : esc(V.name) + ' 랭킹'}</h2>${rankHtml(10)}</div>`);
  $('b-rkcsv').onclick = () => {
    if (!RK) return; const rows = rkScope === 'battle' ? [['순위', '반', '평균점수', '정답률', '참가'], ...RK.battle.map((c, i) => [i + 1, c.name, c.avg, c.acc + '%', c.players])]
      : [['순위', '이름', '반', '점수', '승', '패', '정답', '오답', '정답률', '최고랠리', '경기', 'AI경기'], ...(rkScope === 'cls' ? RK.cls : RK.grade).map(x => [x.rank, x.name, x.cls, x.points, x.wins, x.losses, x.correct, x.wrong, x.acc + '%', x.bestRally, x.games, x.aiGames])];
    download(`리턴볼_랭킹_${V.name}_${new Date().toISOString().slice(0, 10)}.csv`, rows);
  };
  function download(name, rows) {
    const csv = '﻿' + rows.map(r => r.map(c => { c = String(c == null ? '' : c); return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(',')).join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = name; a.click();
  }

  /* ---------- 오답 함께 보기 ---------- */
  let wrUnit = 11, QROWS = [];
  $('wr-unit').onclick = e => seg(e, 'wr-unit', v => { wrUnit = Number(v); drawWrong(); });
  async function loadWrong() { const r = await call('t:questions', { code: CODE }); QROWS = r.rows || []; if (V) { wrUnit = V.settings.unit; [...$('wr-unit').children].forEach(x => x.classList.toggle('on', Number(x.dataset.v) === wrUnit)); } drawWrong(); }
  const LV = { low: '낮음', medium: '보통', high: '높음' };
  function rateBadge(q, label) {
    if (!q.seen) return '<span class="norec">기록 없음</span>';
    const lv = q.rate < 30 ? 'low' : q.rate < 60 ? 'medium' : 'high';
    return `<span class="rate lv-${lv}" role="img" aria-label="틀린 비율 ${q.rate}% · ${LV[lv]}" title="${q.rate}% · ${LV[lv]}">${q.rate}%${label ? ' · ' + LV[lv] : ''}</span>`;
  }
  function topPick(q) { const e = Object.entries(q.picks || {}).sort((a, b) => b[1] - a[1])[0]; return e ? e : null; }
  function drawWrong() {
    const rows = QROWS.filter(q => q.unit === wrUnit && q.wrongN > 0).sort((a, b) => b.rate - a.rate || b.wrongN - a.wrongN);
    $('wr-list').innerHTML = rows.length ? `<table><tr><th>틀린 비율</th><th>질문</th><th>정답</th><th>가장 많이 고른 오답</th><th>푼 횟수</th></tr>${rows.map(q => { const t = topPick(q); return `<tr class="wrow" data-id="${q.id}"><td>${rateBadge(q, true)}</td><td class="en">${esc(q.q)}</td><td class="en"><span class="o">${esc(q.answer)}</span></td><td class="en">${t ? `<span class="x">${esc(t[0])}</span> <small>(${t[1]}명)</small>` : ''}</td><td>${q.seen}</td></tr>`; }).join('')}</table><p class="hint small">줄을 누르면 문제를 크게 띄워요.</p>`
      : '<div class="empty">아직 틀린 문제가 없어요. 경기가 끝나면 여기에 모여요.</div>';
  }
  $('wr-list').onclick = e => { const tr = e.target.closest('.wrow'); if (!tr) return; showBigQ(QROWS.find(q => q.id === tr.dataset.id)); };
  function showBigQ(q) {
    const choices = [q.answer, ...q.wrong].sort(() => Math.random() - .5); const total = q.seen || 0;
    const pic = q.pic ? (/^(img\/|https?:)/.test(q.pic.e) ? `<div class="bq-pic"><img src="${esc(q.pic.e)}" style="max-height:28vh;border-radius:16px"></div>` : `<div class="bq-pic">${esc(q.pic.e)}</div><div class="bq-cap">${esc(q.pic.cap || '')}</div>`) : '';
    big(`<div class="bq-unit">${q.unit}단원 · 많이 헷갈린 문제</div>${pic}<div class="bq-q">${esc(q.q)}</div>
      <div class="bq-ch">${choices.map(c => `<div data-c="${esc(c)}">${esc(c)}<small class="hide">${q.picks && q.picks[c] ? `${q.picks[c]}명이 골랐어요` : ''}</small></div>`).join('')}</div>
      <div class="bq-foot"><span>틀린 비율 ${q.rate}% (${total}번 중 ${q.wrongN}번)${q.picks && q.picks['(시간 초과)'] ? ` · 시간 초과 ${q.picks['(시간 초과)']}번` : ''}</span><button class="btn cyan" id="bq-show">정답 보기</button></div>
      <div class="bq-cap hide" id="bq-exp" style="margin-top:2vh;font-size:2vw;color:#fff3b0">💡 ${esc(q.exp || '')}</div>`);
    $('bq-show').onclick = () => { document.querySelectorAll('.bq-ch div').forEach(d => { if (d.dataset.c === q.answer) d.classList.add('right'); d.querySelector('small').classList.remove('hide'); }); if (q.exp) $('bq-exp').classList.remove('hide'); };
  }

  /* ---------- 문제 관리 ---------- */
  let qUnit = 11;
  $('q-unit').onclick = e => seg(e, 'q-unit', v => { qUnit = Number(v); drawQ(); });
  async function loadQ() { const r = await call('t:questions', { code: CODE }); QROWS = r.rows || []; drawQ(); }
  function drawQ() {
    const rows = QROWS.filter(q => q.unit === qUnit); const on = rows.filter(q => !q.off).length;
    $('q-count').textContent = `${qUnit}단원 문제 ${rows.length}개 · 경기에 나오는 문제 ${on}개`;
    $('q-list').innerHTML = `<table><tr><th>그림</th><th>질문</th><th>정답</th><th>오답</th><th>틀린 비율</th><th></th></tr>${rows.map(q => `<tr class="${q.off ? 'off' : ''}"><td>${q.pic ? (/^(img\/|https?:)/.test(q.pic.e) ? '🖼️' : esc(q.pic.e)) : ''}</td><td class="en">${esc(q.q)}${q.pic && q.pic.cap ? `<br><small style="font-family:var(--k);font-weight:400;color:var(--sub)">${esc(q.pic.cap)}</small>` : ''}</td><td class="en"><span class="o">${esc(q.answer)}</span></td><td class="en"><span class="x">${q.wrong.map(esc).join('<br>')}</span></td><td>${rateBadge(q, false)}</td>
      <td style="white-space:nowrap"><button class="qbtn ${q.off ? 'off' : 'on'}" data-tog="${q.id}" aria-pressed="${!q.off}" aria-label="경기에 ${q.off ? '안 나옴, 누르면 켜기' : '나옴, 누르면 끄기'}">${q.off ? '꺼짐' : '켜짐'}</button>${q.base ? '' : ` <button class="rmbtn" data-del="${q.id}">문제 삭제</button>`}</td></tr>`).join('')}</table>`;
  }
  $('q-list').onclick = async e => {
    const t = e.target.closest('[data-tog]'), d = e.target.closest('[data-del]');
    if (t) { const r = await call('t:toggleQ', { code: CODE, id: t.dataset.tog }); QROWS = r.rows; drawQ(); }
    if (d && confirm('이 문제를 지울까요?')) { const r = await call('t:delQ', { code: CODE, id: d.dataset.del }); QROWS = r.rows; drawQ(); }
  };
  $('addq').onsubmit = async e => {
    e.preventDefault();
    const r = await call('t:addQ', { code: CODE, unit: qUnit, q: $('aq-q').value, answer: $('aq-a').value, w1: $('aq-w1').value, w2: $('aq-w2').value, pic: $('aq-pic').value, cap: $('aq-cap').value });
    if (!r.ok) return toast(r.err); QROWS = r.rows; drawQ(); ['aq-q', 'aq-a', 'aq-w1', 'aq-w2', 'aq-pic', 'aq-cap'].forEach(id => $(id).value = ''); toast('문제를 추가했어요.');
  };
  $('b-qcsv').onclick = () => download(`리턴볼_문제_${qUnit}단원.csv`, [['단원', '질문', '정답', '오답1', '오답2', '그림', '그림설명', '해설', '틀린비율'], ...QROWS.filter(q => q.unit === qUnit).map(q => [q.unit, q.q, q.answer, q.wrong[0], q.wrong[1], q.pic ? q.pic.e : '', q.pic ? q.pic.cap : '', q.exp, q.seen ? q.rate + '%' : ''])]);
  function parseCSV(t) {
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < t.length; i++) { const c = t[i];
      if (q) { if (c === '"' && t[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
      else if (c === '"') q = true; else if (c === ',') { row.push(cur); cur = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; } else cur += c; }
    if (cur || row.length) { row.push(cur); rows.push(row); }
    return rows.filter(r => r.some(x => x.trim()));
  }
  $('q-file').onchange = async e => {
    const f = e.target.files[0]; if (!f) return; const text = (await f.text()).replace(/^﻿/, '');
    const list = parseCSV(text).filter(r => /^\d+$/.test((r[0] || '').trim())).map(r => ({ unit: Number(r[0]), q: r[1], answer: r[2], w1: r[3], w2: r[4], pic: r[5], cap: r[6], exp: r[7] }));
    const r = await call('t:addQ', { code: CODE, list }); e.target.value = '';
    if (!r.ok) return toast(r.err); QROWS = r.rows; drawQ(); toast(`${r.added}개 문제를 추가했어요.`);
  };

  /* ---------- 학생 관리 ---------- */
  function drawStud() {
    if (!V) return; const rows = V.students;
    $('s-table').innerHTML = rows.length ? `<table><tr><th>이름</th><th>상태</th><th>점수</th><th>경기</th><th>승</th><th>패</th><th>정답</th><th>오답</th><th>정답률</th><th>최고 랠리</th><th>가장 빠른 반격</th><th></th></tr>${rows.map(s => `<tr><td>${esc(s.name)}</td><td>${s.online ? STATUS[s.status] || s.status : '<span style="color:var(--sub)">나감</span>'}</td><td>${s.points}</td><td>${s.games}</td><td>${s.wins}</td><td>${s.losses}</td><td>${s.correct}</td><td>${s.wrong}</td><td>${s.acc}%</td><td>${s.bestRally}</td><td>${s.fastest ? (s.fastest / 1000).toFixed(1) + '초' : '-'}</td><td><button class="rmbtn" data-rm="${s.id}">학생 삭제</button></td></tr>`).join('')}</table>` : '<div class="empty">아직 들어온 학생이 없어요</div>';
  }
  $('s-table').onclick = async e => { const b = e.target.closest('[data-rm]'); if (!b || !confirm('이 학생을 목록에서 삭제할까요? 이 학생의 점수·경기 기록도 함께 지워져요. (CSV 저장과는 별개예요)')) return; const r = await call('t:removeStudent', { code: CODE, id: b.dataset.rm }); if (r.ok) { V = r.view; drawAll(); } };
  $('b-reset').onclick = async () => { if (!confirm(`${V.name}의 점수·랭킹·오답 기록을 모두 지울까요? 되돌릴 수 없어요.`)) return; const r = await call('t:resetStats', { code: CODE }); if (r.ok) { V = r.view; drawAll(); toast('기록을 지웠어요.'); } };
  $('b-rename').onclick = async () => { const name = prompt('반 이름', V.name); if (!name) return; const r = await call('t:renameClass', { code: CODE, name }); if (r.ok) { CLASSES = r.classes; V.name = name; drawClasses(); } };
})();
