// 영어 리턴볼 — 게임 서버 (1대1 영어 대결, 직접 터치 반격)
// 1) 공이 나에게 날아오는 동안 영어 질문에 알맞은 응답을 골라요. (오답·시간 초과면 상대 1점)
// 2) 정답이면 선택지가 사라지고 공이 다가오며 바깥 원이 줄어들어요.
// 3) 두 원이 겹칠 때 움직이는 공을 터치하면 반격! 너무 빠르거나 늦으면 상대 1점.
// 랠리가 이어질수록 공이 빨라지고(문제 시간·터치 시간이 줄고), PERFECT 반격은 상대 문제 시간을 1초 줄여요.
// 실행: npm install → npm start → 학생 http://localhost:3000   교사 http://localhost:3000/teacher.html
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { Server } = require('socket.io');
const { UNITS, buildQuestions } = require('./questions');

const PORT = process.env.PORT || 3000;
const FAST = process.env.FAST === '1'; // 시험용: 대기 시간을 짧게
// 교사 비밀번호: 다른 게임(그랑프리·뿌요팡)과 같은 비밀번호예요. 코드에는 알아볼 수 없는 값만 들어 있어요.
// Render의 Environment에 TEACHER_PASSWORD 를 넣으면 그 값으로 바뀌어요.
const PW_SALT = 'd057941223c441b7d5e80c1f', PW_HASH = 'c16e713ee933471431d0657ac15d0886d387e97319e6ab154de8e6ecb5aee38e';
function checkPw(pw) {
  pw = String(pw || '');
  if (process.env.TEACHER_PASSWORD) return pw === process.env.TEACHER_PASSWORD;
  const a = crypto.scryptSync(pw, PW_SALT, 32), b = Buffer.from(PW_HASH, 'hex');
  return crypto.timingSafeEqual(a, b);
}
const BASE_Q = buildQuestions();

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.get('/teacher', (q, res) => res.sendFile(path.join(__dirname, 'public', 'teacher.html')));
app.get('/healthz', (q, res) => res.json({ ok: true, classes: Object.keys(DB.classes).length, matches: matches.size }));
const server = http.createServer(app);
const io = new Server(server, { pingInterval: 10000, pingTimeout: 20000 });

/* ===================== 저장 ===================== */
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'state.json');
const DB = { classes: {}, custom: [], disabled: [], qseq: 0 };
const teacherTokens = new Set();
let saveTimer = null;
function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const classes = {};
    for (const [code, c] of Object.entries(DB.classes)) {
      classes[code] = { code, name: c.name, grade: c.grade, settings: c.settings, qstats: c.qstats, log: c.log.slice(-2000),
        students: Object.fromEntries(Object.values(c.students).map(s => [s.id, { id: s.id, name: s.name, token: s.token, stats: s.stats, joinedAt: s.joinedAt }])) };
    }
    try { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(DATA_FILE + '.tmp', JSON.stringify({ classes, custom: DB.custom, disabled: DB.disabled, qseq: DB.qseq })); fs.renameSync(DATA_FILE + '.tmp', DATA_FILE); }
    catch (e) { console.error('저장 실패', e.message); }
  }, 1500);
}
function load() {
  try {
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    DB.custom = raw.custom || []; DB.disabled = raw.disabled || []; DB.qseq = raw.qseq || 0;
    for (const [code, c] of Object.entries(raw.classes || {})) {
      const cl = blankClass(code, c.name, c.grade);
      cl.settings = Object.assign(defaultSettings(), c.settings || {}); cl.qstats = c.qstats || {}; cl.log = c.log || [];
      for (const s of Object.values(c.students || {})) cl.students[s.id] = newStudent(s.id, s.name, s.token, Object.assign(blankStats(), s.stats), s.joinedAt);
      DB.classes[code] = cl;
    }
  } catch (e) { /* 처음 켬 */ }
}

/* ===================== 반 · 학생 ===================== */
function defaultSettings() { return { unit: 11, qSec: 8, minSec: 4, speedUp: true, target: 5, aiFill: true, botAcc: 70, tts: false, strikeWin: 'normal', mode: 'arena', groupSize: 4, hearts: 2, arenaMin: 3, comp: 'free', leagueGames: 4 }; }
// 터치 판정 폭(ms): 원이 겹치는 순간 앞뒤로 이만큼 안에 터치하면 성공. PERFECT는 그 40% 안쪽.
const STRIKE_WIN = { easy: 300, normal: 220, strict: 150 };
function blankClass(code, name, grade) { return { code, name: name || `${code}반`, grade: Number(grade) || 6, settings: defaultSettings(), students: {}, qstats: {}, log: [], running: false, paused: false }; }
function blankStats() { return { points: 0, games: 0, wins: 0, losses: 0, correct: 0, wrong: 0, timeouts: 0, bestRally: 0, aiGames: 0, fastest: 0 }; }
function newStudent(id, name, token, stats, joinedAt) { return { id, name, token, stats: stats || blankStats(), joinedAt: joinedAt || Date.now(), online: false, socketId: null, status: 'lobby', matchId: null, readyAt: 0, waitSince: 0, lastOpp: null, recentOpp: [] }; }
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function clean(s, n) { return String(s || '').replace(/[<>]/g, '').trim().slice(0, n); }
function rid() { return crypto.randomBytes(6).toString('hex'); }

/* ===================== 문제 ===================== */
function allQuestions() { return BASE_Q.concat(DB.custom); }
function poolFor(unit) { const off = new Set(DB.disabled); let p = allQuestions().filter(q => q.unit === unit && !off.has(q.id)); if (!p.length) p = allQuestions().filter(q => q.unit === unit); return p; }
function pickQuestion(m, p) {
  // 같은 경기에서 이 학생이 본 문제는 다 돌기 전까지 다시 안 나와요. 많이 틀린 문제는 조금 더 자주.
  let cand = m.pool.filter(q => !p.seen.has(q.id));
  if (!cand.length) { p.seen.clear(); cand = m.pool.filter(q => q.id !== p.lastQ); }
  if (!cand.length) cand = m.pool;
  const w = cand.map(q => 1 + (p.missed.has(q.id) ? 2 : 0));
  let r = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < cand.length; i++) { r -= w[i]; if (r <= 0) return cand[i]; }
  return cand[cand.length - 1];
}

/* ===================== 경기 ===================== */
const matches = new Map();
const COUNTDOWN = FAST ? 600 : 3200, POINT_PAUSE = FAST ? 500 : 2400, RESULT_STAY = FAST ? 1500 : 8000, AI_WAIT = FAST ? 1500 : 10000, MAX_MATCH = 6 * 60 * 1000;
const BOT_NAMES = ['로봇 볼트', '로봇 스파크', '로봇 핑퐁', '로봇 블리츠', '로봇 코멧'];

function later(m, fn, ms) { const t = setTimeout(() => { m.timers.delete(t); fn(); }, Math.max(0, ms)); m.timers.add(t); return t; }
function clearTimers(m) { for (const t of m.timers) clearTimeout(t); m.timers.clear(); }
function clsOf(m) { return DB.classes[m.code]; }
function sockOf(m, p) { if (p.isBot) return null; const c = clsOf(m); const s = c && c.students[p.pid]; return s && s.online && s.matchId === m.id ? s.socketId : null; }

function createMatch(c, studs, opts = {}) {
  const id = rid(); const st = c.settings;
  const mk = (s, side) => ({ pid: s ? s.id : 'bot-' + rid(), name: s ? s.name : opts.botName || BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)], isBot: !s, side, score: 0, seen: new Set(), missed: new Set(), lastQ: null, correct: 0, wrong: 0, timeouts: 0, fastest: 0 });
  const players = [mk(studs[0], 0), mk(studs[1] || null, 1)];
  const m = { id, code: c.code, unit: st.unit, practice: !!opts.practice, pool: poolFor(st.unit), target: st.target, qMs: st.qSec * 1000, minMs: Math.min(st.minSec, st.qSec) * 1000, speedUp: st.speedUp, botAcc: st.botAcc, win: STRIKE_WIN[st.strikeWin] || 220,
    players, state: 'countdown', rally: 0, bestRally: 0, server: Math.random() < 0.5 ? 0 : 1, ball: null, last: null, history: [], timers: new Set(), createdAt: Date.now(), startAt: Date.now() + COUNTDOWN };
  matches.set(id, m);
  for (const s of studs) if (s) { s.matchId = id; s.status = opts.practice ? 'practice' : 'playing'; s.waitSince = 0; if (!opts.practice) { const o = studs.find(x => x && x !== s); s.lastOpp = o ? o.id : 'bot'; if (o) { s.recentOpp.unshift(o.id); s.recentOpp = s.recentOpp.slice(0, 3); } } }
  later(m, () => launch(m, m.server), COUNTDOWN);
  later(m, () => { if (m.state !== 'ended') endMatch(m, 'time'); }, MAX_MATCH);
  pushMatch(m); if (!m.practice) { pushClass(c); feed(c, `⚡ ${players[0].name} vs ${players[1].name} 경기 시작!`); }
  return m;
}

function flightMs(m) { return m.speedUp ? Math.max(m.minMs, m.qMs - m.rally * 450) : m.qMs; }
// 정답 뒤 공이 다가와 원이 겹칠 때까지 걸리는 시간 (랠리가 길수록 짧아져요)
function strikeMs(m) { return m.speedUp ? Math.max(1000, 1700 - m.rally * 70) : 1500; }

function launch(m, toIdx, keepMs, smash) {
  if (m.state === 'ended') return;
  const p = m.players[toIdx]; const q = pickQuestion(m, p);
  p.seen.add(q.id); p.lastQ = q.id;
  const choices = shuffle([q.answer, ...q.wrong].slice());
  const dur = keepMs || Math.max(m.minMs, flightMs(m) - (smash ? 1000 : 0));
  m.ball = { to: toIdx, qid: q.id, q, choices, correctIdx: choices.indexOf(q.answer), dur, full: keepMs ? m.ball.full : dur, deadline: Date.now() + dur, answered: false, phase: 'question', smash: !!smash };
  m.state = 'flight'; m.last = null;
  m.ball.timer = later(m, () => resolve(m, toIdx, null), dur + 250); // 네트워크 여유
  if (p.isBot) botAnswer(m, p);
  pushMatch(m);
}

function botAnswer(m, p) {
  const b = m.ball; const think = Math.min(b.dur - 600, 1400 + Math.random() * (b.dur * 0.55));
  later(m, () => {
    if (m.state !== 'flight' || m.ball !== b || b.answered) return;
    const ok = Math.random() * 100 < m.botAcc;
    const pick = ok ? b.correctIdx : [0, 1, 2].filter(i => i !== b.correctIdx)[Math.floor(Math.random() * 2)];
    resolve(m, b.to, pick);
    if (ok && m.ball === b && b.phase === 'strike') { // AI도 원이 겹칠 때 공을 쳐요 (가끔 놓쳐요)
      const good = Math.random() < 0.82, off = good ? (Math.random() * 2 - 1) * m.win * 0.7 : m.win * (1.3 + Math.random() * 0.5) * (Math.random() < 0.5 ? -1 : 1);
      later(m, () => strike(m, b.to, Math.round(off), b), b.hitAt - Date.now() + off);
    }
  }, Math.max(700, think));
}

function resolve(m, who, pick) {
  const b = m.ball; if (m.state !== 'flight' || !b || b.answered || b.to !== who) return { err: '지금은 답할 차례가 아니에요.' };
  b.answered = true; clearTimeout(b.timer); m.timers.delete(b.timer);
  const p = m.players[who], o = m.players[1 - who];
  const timeout = pick == null || pick < 0 || Date.now() > b.deadline + 400;
  const ok = !timeout && pick === b.correctIdx;
  const ms = b.full - Math.max(0, b.deadline - Date.now());
  stat(m, p, b.q, ok, timeout, timeout ? null : b.choices[pick]);
  if (ok) {
    p.correct++; if (!p.fastest || ms < p.fastest) p.fastest = ms;
    // 반격 준비: 선택지가 사라지고, 공이 다가오며 바깥 원이 줄어들어요
    b.phase = 'strike'; b.strikeDur = strikeMs(m); b.hitAt = Date.now() + b.strikeDur; b.answerMs = ms;
    b.timer = later(m, () => strike(m, who, null, b), b.strikeDur + m.win + 700); // 끝까지 안 치면 놓친 것
    m.last = { kind: 'ready', who, pick, correctIdx: b.correctIdx, ms, at: Date.now() };
    pushMatch(m);
    return { ok: true, correct: true };
  }
  if (timeout) p.timeouts++; else p.wrong++;
  p.missed.add(b.q.id);
  o.score++;
  m.state = 'point';
  m.last = { kind: timeout ? 'timeout' : 'miss', who, pick: timeout ? -1 : pick, correctIdx: b.correctIdx, choices: b.choices, q: b.q.q, answer: b.q.answer, exp: b.q.exp, scorer: 1 - who, rally: m.rally, at: Date.now() };
  m.history.push({ q: b.q.q, answer: b.q.answer, picked: timeout ? '(시간 초과)' : b.choices[pick], who: p.name });
  m.rally = 0;
  pushMatch(m);
  if (o.score >= m.target) later(m, () => endMatch(m, 'score'), 1600);
  else later(m, () => launch(m, 1 - who), POINT_PAUSE); // 다음 공은 점수를 낸 쪽으로 날아가요
  return { ok: true, correct: false };
}

// 공 터치 판정. off = 원이 겹치는 순간과의 차이(ms, 음수면 빠름). 학생 기기가 자기 화면 기준으로 재서 보내요.
function strike(m, who, off, ball) {
  const b = m.ball; if (m.state !== 'flight' || !b || b.phase !== 'strike' || b.to !== who || (ball && ball !== b)) return { err: '지금은 칠 수 없어요.' };
  if (off != null && off < -m.win - 450) return { ok: true, early: true }; // 너무 일찍 누른 건 무시하고 한 번 더 기회
  clearTimeout(b.timer); m.timers.delete(b.timer); b.phase = 'done';
  const p = m.players[who], o = m.players[1 - who];
  const good = off != null && Math.abs(off) <= m.win;
  if (good) {
    const judge = Math.abs(off) <= m.win * 0.4 ? 'perfect' : 'good';
    m.rally++; m.bestRally = Math.max(m.bestRally, m.rally); p.strikes = (p.strikes || 0) + 1; if (judge === 'perfect') p.perfects = (p.perfects || 0) + 1;
    m.last = { kind: 'hit', who, judge, off, ms: b.answerMs, q: b.q.q, answer: b.q.answer, at: Date.now() };
    pushMatch(m);
    later(m, () => launch(m, 1 - who, null, judge === 'perfect'), 450);
    return { ok: true, hit: true, judge };
  }
  const judge = off == null ? 'none' : off < 0 ? 'early' : 'late';
  o.score++; m.state = 'point'; p.strikeMiss = (p.strikeMiss || 0) + 1;
  m.last = { kind: 'strikeMiss', who, judge, off, choices: b.choices, correctIdx: b.correctIdx, pick: b.correctIdx, q: b.q.q, answer: b.q.answer, scorer: 1 - who, rally: m.rally, at: Date.now() };
  m.rally = 0; pushMatch(m);
  if (o.score >= m.target) later(m, () => endMatch(m, 'score'), 1600);
  else later(m, () => launch(m, 1 - who), POINT_PAUSE);
  return { ok: true, hit: false, judge };
}

function stat(m, p, q, ok, timeout, picked) {
  if (m.practice || p.isBot) return;
  const c = clsOf(m); if (!c) return;
  const qs = c.qstats[q.id] || (c.qstats[q.id] = { seen: 0, wrong: 0, picks: {} });
  qs.seen++; if (!ok) { qs.wrong++; const k = timeout ? '(시간 초과)' : picked; qs.picks[k] = (qs.picks[k] || 0) + 1; }
  if (c.session) { const ss = c.session.q[q.id] || (c.session.q[q.id] = { seen: 0, wrong: 0 }); ss.seen++; if (!ok) ss.wrong++; }
}

/* ===================== 이번 수업 집계 =====================
   누적 기록(학생 점수·최고 랠리·문항 통계)과 따로, '경기 시작'부터 '경기 끝내기'까지를 한 수업으로 모아요.
   잠시 멈춤·다시 시작은 같은 수업으로 이어져요. */
function newSession(c) { return { startedAt: Date.now(), units: [c.settings.unit], players: {}, matches: 0, best: { rally: 0, names: [] }, q: {} }; }
function sessionMatch(c, m, win) {
  const S = c.session; if (!S) return;
  S.matches++; if (!S.units.includes(m.unit)) S.units.push(m.unit);
  for (const p of m.players) {
    if (p.isBot) continue;
    const r = S.players[p.pid] || (S.players[p.pid] = { id: p.pid, name: p.name, points: 0, games: 0, wins: 0, correct: 0, wrong: 0 });
    r.name = p.name; r.points += p.gain || 0; r.games++; if (win === p.side) r.wins++; r.correct += p.correct; r.wrong += p.wrong + p.timeouts;
  }
  const humans = m.players.map(p => p.name + (p.isBot ? ' (AI)' : ''));
  if (m.bestRally > S.best.rally) S.best = { rally: m.bestRally, names: [humans.join(' vs ')] };
  else if (m.bestRally > 0 && m.bestRally === S.best.rally) S.best.names.push(humans.join(' vs '));
}
function sessionSummary(c) {
  const S = c.session; if (!S) return null;
  const rows = Object.values(S.players).sort((a, b) => b.points - a.points || b.wins - a.wins || b.correct - a.correct);
  let prev = null, rank = 0; rows.forEach((r, i) => { if (r.points !== prev) rank = i + 1; r.rank = rank; prev = r.points; });
  const podium = [1, 2, 3].map(k => ({ rank: k, names: rows.filter(r => r.rank === k).map(r => r.name), points: (rows.find(r => r.rank === k) || {}).points || 0 })).filter(x => x.names.length);
  const byId = Object.fromEntries(allQuestions().map(q => [q.id, q]));
  const qs = Object.entries(S.q).filter(([id, v]) => v.wrong > 0 && byId[id]).map(([id, v]) => ({ id, ...v, rate: Math.round(v.wrong / v.seen * 100) }));
  qs.sort((a, b) => b.wrong - a.wrong || b.rate - a.rate);
  const top = qs[0] ? { q: byId[qs[0].id].q, answer: byId[qs[0].id].answer, wrong: qs[0].wrong, seen: qs[0].seen, rate: qs[0].rate, unit: byId[qs[0].id].unit } : null;
  return { cls: c.name, code: c.code, units: S.units.slice().sort(), startedAt: S.startedAt, endedAt: Date.now(), players: rows.length, matches: S.matches, podium, rows: rows.slice(0, 10), best: S.best, top };
}

function endMatch(m, why) {
  if (m.state === 'ended') return;
  clearTimers(m); m.state = 'ended'; m.endedAt = Date.now(); m.ball = null; m.why = why;
  const [a, b] = m.players; const win = a.score === b.score ? -1 : a.score > b.score ? 0 : 1; m.winner = win;
  const c = clsOf(m);
  if (c && !m.practice) {
    for (const p of m.players) {
      if (p.isBot) continue; const s = c.students[p.pid]; if (!s) continue; const S = s.stats;
      const vsBot = m.players.some(x => x.isBot);
      S.games++; if (vsBot) S.aiGames++;
      const gain = (win === p.side ? 10 : win === -1 ? 6 : 3) + p.correct;
      p.gain = gain; S.points += gain;
      if (win === p.side) S.wins++; else if (win !== -1) S.losses++;
      S.correct += p.correct; S.wrong += p.wrong; S.timeouts += p.timeouts; S.bestRally = Math.max(S.bestRally, m.bestRally);
      if (p.fastest && (!S.fastest || p.fastest < S.fastest)) S.fastest = p.fastest;
    }
    c.log.push({ at: Date.now(), unit: m.unit, a: a.name, b: b.name, sa: a.score, sb: b.score, rally: m.bestRally, why });
    sessionMatch(c, m, win);
    feed(c, win === -1 ? `🤝 ${a.name} ${a.score} : ${b.score} ${b.name} 무승부` : `🏆 ${m.players[win].name} 승리! (${a.score} : ${b.score})`);
    save();
  }
  pushMatch(m);
  for (const p of m.players) {
    if (p.isBot || !c) continue; const s = c.students[p.pid];
    if (s && s.matchId === m.id) { s.status = m.practice ? (c.running ? 'waiting' : 'lobby') : 'result'; s.readyAt = Date.now() + (m.practice ? 0 : RESULT_STAY); s.waitSince = s.readyAt; if (m.practice) s.matchId = null; }
  }
  if (c) pushClass(c);
  setTimeout(() => matches.delete(m.id), 60000);
}

function leaveMatch(c, s) {
  const m = matches.get(s.matchId); s.matchId = null; if (!m || m.state === 'ended') return;
  if (m.mode === 'arena') return arena.leave(m, s);
  if (m.practice) { clearTimers(m); m.state = 'ended'; matches.delete(m.id); return; }
  // 나간 학생은 진 것으로, 상대에게 알려요
  const p = m.players.find(x => x.pid === s.id); if (p) { const o = m.players[1 - p.side]; o.score = Math.max(o.score, m.target); }
  endMatch(m, 'left');
}

/* ===================== B안: 경기장 이동형 ===================== */
const arena = require('./arena')({ io, matches, clsOf, feed, pushClass, save, stat, sessionMatch, poolFor, pickQuestion, shuffle, rid, BOT_NAMES, COUNTDOWN, RESULT_STAY,
  studentOf: (m, p) => { const c = clsOf(m); return c && c.students[p.pid]; },
  leavePractice: (c, list) => { for (const x of list) if (x.status === 'practice') leaveMatch(c, x); } });

/* ===================== 자동 짝 배정 ===================== */
function available(c, s) {
  if (!s.online) return false;
  if (s.status === 'waiting') return true;
  if (s.status === 'practice') return true;
  if (s.status === 'result' && Date.now() >= s.readyAt) return true;
  return false;
}
function matchmake(c) {
  if (!c.running || c.paused) return;
  const free = shuffle(Object.values(c.students).filter(s => available(c, s)));
  let changed = false;
  for (const s of free) if (s.status === 'result') { s.status = 'waiting'; s.matchId = null; s.waitSince = s.readyAt; changed = true; }
  if (changed) pushClass(c); // 결과 화면 → 대기실로 돌아갔다고 학생 기기에 알려요
  const used = new Set();
  if (c.settings.mode === 'arena') return arena.matchmake(c, free, used, AI_WAIT);
  // 오래 기다린 학생부터, 최근에 만난 친구는 피해서 짝
  free.sort((a, b) => (a.waitSince || 0) - (b.waitSince || 0));
  for (const s of free) {
    if (used.has(s.id)) continue;
    const others = free.filter(x => x !== s && !used.has(x.id));
    if (!others.length) break;
    let pick = others.find(x => !s.recentOpp.includes(x.id) && !x.recentOpp.includes(s.id)) || others.find(x => x.id !== s.lastOpp) || others[0];
    if (pick.id === s.lastOpp && Date.now() - Math.max(s.waitSince, pick.waitSince) < AI_WAIT) continue; // 방금 만난 친구뿐이면 10초쯤 더 기다려 다른 친구를 찾아요
    used.add(s.id); used.add(pick.id);
    for (const x of [s, pick]) if (x.status === 'practice') leaveMatch(c, x);
    createMatch(c, [s, pick]);
  }
  if (!c.settings.aiFill) return;
  for (const s of free) {
    if (used.has(s.id)) continue;
    if (Date.now() - (s.waitSince || Date.now()) < AI_WAIT) continue;
    if (s.status === 'practice') leaveMatch(c, s);
    used.add(s.id); createMatch(c, [s]);
  }
}
setInterval(() => { for (const c of Object.values(DB.classes)) matchmake(c); }, FAST ? 300 : 1500);

/* ===================== 화면 데이터 ===================== */
function feed(c, text) { io.to('c:' + c.code).emit('feed', text); io.to('t:' + c.code).emit('feed', text); }
function matchView(m, viewer) {
  const b = m.ball;
  const v = { id: m.id, unit: m.unit, unitName: UNITS[m.unit].short, practice: m.practice, state: m.state, target: m.target, rally: m.rally, bestRally: m.bestRally, now: Date.now(), startIn: Math.max(0, m.startAt - Date.now()),
    players: m.players.map(p => ({ name: p.name, isBot: p.isBot, score: p.score, side: p.side, correct: p.correct, gain: p.gain || 0 })), last: m.last, winner: m.winner, why: m.why };
  if (b) {
    v.ball = { to: b.to, dur: b.dur, full: b.full, left: Math.max(0, b.deadline - Date.now()), q: b.q.q, pic: b.q.pic, choices: b.choices, answered: b.answered, speed: Math.round((m.qMs / b.full) * 10) / 10,
      phase: b.phase, smash: b.smash, strikeDur: b.strikeDur || 0, hitIn: b.hitAt ? b.hitAt - Date.now() : 0, win: m.win };
  }
  if (m.state === 'ended') v.history = m.history.slice(-12);
  v.me = viewer;
  return v;
}
function pushMatch(m) {
  for (const p of m.players) { const sid = sockOf(m, p); if (sid) io.to(sid).emit('match', matchView(m, p.side)); }
  if (!m.practice) io.to('t:' + m.code).emit('tmatch', teacherMatch(m));
}
function teacherMatch(m) {
  return { id: m.id, state: m.state, rally: m.rally, bestRally: m.bestRally, target: m.target, unit: m.unit, players: m.players.map(p => ({ name: p.name, isBot: p.isBot, score: p.score, correct: p.correct, wrong: p.wrong + p.timeouts })), ballTo: m.ball ? m.ball.to : null, q: m.ball ? m.ball.q.q : null, phase: m.ball ? m.ball.phase : null, winner: m.winner };
}
function acc(S) { const t = S.correct + S.wrong + S.timeouts; return t ? Math.round((S.correct / t) * 100) : 0; }
function studentRow(c, s) { const S = s.stats; return { id: s.id, name: s.name, cls: c.name, code: c.code, online: s.online, status: s.status, points: S.points, games: S.games, wins: S.wins, losses: S.losses, correct: S.correct, wrong: S.wrong + S.timeouts, acc: acc(S), bestRally: S.bestRally, aiGames: S.aiGames, fastest: S.fastest }; }
const SORTS = { points: (a, b) => b.points - a.points || b.wins - a.wins || b.acc - a.acc, wins: (a, b) => b.wins - a.wins || b.points - a.points, acc: (a, b) => b.acc - a.acc || b.correct - a.correct, rally: (a, b) => b.bestRally - a.bestRally || b.points - a.points };
const KEY = { points: x => x.points, wins: x => x.wins, acc: x => x.acc, rally: x => x.bestRally };
function ranked(rows, by) { rows.sort(SORTS[by] || SORTS.points); let prev = null, r = 0; rows.forEach((x, i) => { const k = (KEY[by] || KEY.points)(x); if (k !== prev) r = i + 1; x.rank = r; prev = k; }); return rows; }
function classRanking(c, by) { return ranked(Object.values(c.students).filter(s => s.stats.games > 0).map(s => studentRow(c, s)), by); }
function gradeRanking(grade, by) { return ranked(Object.values(DB.classes).filter(c => c.grade === grade).flatMap(c => Object.values(c.students).filter(s => s.stats.games > 0).map(s => studentRow(c, s))), by); }
function classBattle(grade) {
  return Object.values(DB.classes).filter(c => c.grade === grade).map(c => {
    const st = Object.values(c.students).filter(s => s.stats.games > 0); const n = st.length;
    const sum = k => st.reduce((a, s) => a + s.stats[k], 0); const tot = sum('correct') + sum('wrong') + sum('timeouts');
    return { code: c.code, name: c.name, players: n, avg: n ? Math.round(sum('points') / n) : 0, acc: tot ? Math.round(sum('correct') / tot * 100) : 0, games: Math.round(sum('games') / 2) };
  }).sort((a, b) => b.avg - a.avg);
}
function myRank(c, s) { const r = classRanking(c, 'points').find(x => x.id === s.id); const g = gradeRanking(c.grade, 'points').find(x => x.id === s.id && x.code === c.code); return { cls: r ? r.rank : null, clsN: classRanking(c, 'points').length, grade: g ? g.rank : null }; }
function studentView(c, s) {
  return { id: s.id, name: s.name, code: c.code, cls: c.name, status: s.status, running: c.running, paused: c.paused, unit: c.settings.unit, unitName: UNITS[c.settings.unit].short, unitTitle: UNITS[c.settings.unit].title, target: c.settings.target, qSec: c.settings.qSec, tts: c.settings.tts, mode: c.settings.mode, hearts: c.settings.hearts, arenaMin: c.settings.arenaMin, comp: arena.compForStudent(c, s),
    stats: studentRow(c, s), rank: myRank(c, s), waitLeft: s.status === 'result' ? Math.max(0, s.readyAt - Date.now()) : 0 };
}
function qRows(c) {
  return allQuestions().map(q => { const st = (c && c.qstats[q.id]) || { seen: 0, wrong: 0, picks: {} }; return { ...q, off: DB.disabled.includes(q.id), seen: st.seen, wrongN: st.wrong, rate: st.seen ? Math.round(st.wrong / st.seen * 100) : 0, picks: st.picks }; });
}
function teacherView(c) {
  const live = [...matches.values()].filter(m => m.code === c.code && !m.practice && (m.state !== 'ended' || Date.now() - m.endedAt < 15000)).map(m => m.mode === 'arena' ? arena.tView(m) : teacherMatch(m));
  return { code: c.code, name: c.name, grade: c.grade, settings: c.settings, running: c.running, paused: c.paused, units: UNITS, hasSummary: !!c.lastSummary, comp: arena.compView(c),
    sessionMatches: c.session ? c.session.matches : 0,
    students: Object.values(c.students).map(s => studentRow(c, s)).sort((a, b) => a.name.localeCompare(b.name, 'ko')), live, log: c.log.slice(-30).reverse() };
}
const classPush = new Map();
function pushClass(c) {
  if (classPush.has(c.code)) return;
  classPush.set(c.code, setTimeout(() => {
    classPush.delete(c.code);
    for (const s of Object.values(c.students)) if (s.online && s.socketId) io.to(s.socketId).emit('me', studentView(c, s));
    io.to('t:' + c.code).emit('tstate', teacherView(c));
  }, 120));
}
function classList() { return Object.values(DB.classes).map(c => ({ code: c.code, name: c.name, grade: c.grade, students: Object.keys(c.students).length, online: Object.values(c.students).filter(s => s.online).length, running: c.running, unit: c.settings.unit })).sort((a, b) => a.code.localeCompare(b.code)); }

/* ===================== 소켓 ===================== */
io.on('connection', socket => {
  let me = null; // { c, s }
  const S = fn => (d, cb) => { if (!me) return cb && cb({ err: '먼저 입장해 주세요.' }); let r; try { r = fn(d || {}); } catch (e) { console.error(e); r = { err: '문제가 생겼어요.' }; } if (cb) cb(r || { ok: true }); };
  let teacher = false;
  const T = fn => (d, cb) => { if (!teacher) return cb && cb({ err: '선생님 로그인이 필요해요.' }); let r; try { r = fn(d || {}); } catch (e) { console.error(e); r = { err: '문제가 생겼어요.' }; } if (cb) cb(r || { ok: true }); };

  socket.on('join', (d, cb) => {
    d = d || {}; const c = DB.classes[String(d.code || '').trim()];
    if (!c) return cb && cb({ err: '입장 코드가 맞지 않아요. 선생님께 코드를 확인해 주세요.' });
    let s = d.token && Object.values(c.students).find(x => x.token === d.token);
    const name = clean(d.name, 10);
    if (!s) {
      if (!name) return cb && cb({ err: '이름을 적어 주세요.' });
      s = Object.values(c.students).find(x => x.name === name);
      if (s && s.online) return cb && cb({ err: '같은 이름의 친구가 이미 들어와 있어요. 이름 뒤에 번호를 붙여 주세요.' });
      if (!s) { s = newStudent(rid(), name, rid() + rid()); c.students[s.id] = s; save(); }
    }
    if (s.online && s.socketId && s.socketId !== socket.id) io.to(s.socketId).emit('kicked', '다른 기기에서 같은 이름으로 들어왔어요.');
    s.online = true; s.socketId = socket.id; me = { c, s }; socket.join('c:' + c.code);
    const m = s.matchId && matches.get(s.matchId);
    if (!m || m.state === 'ended') { if (s.status !== 'result') { s.matchId = null; s.status = c.running ? 'waiting' : 'lobby'; s.waitSince = Date.now(); } }
    cb && cb({ ok: true, token: s.token, view: studentView(c, s) });
    if (m && m.state !== 'ended') { if (m.mode === 'arena') arena.rejoin(m, s, socket); else socket.emit('match', matchView(m, m.players.find(p => p.pid === s.id).side)); }
    pushClass(c);
  });
  socket.on('answer', S(d => {
    const { s } = me; const m = matches.get(s.matchId); if (!m) return { err: '경기가 없어요.' };
    const p = m.players.find(x => x.pid === s.id); if (!p) return { err: '경기가 없어요.' };
    if (!m.ball || m.ball.to !== p.side) return { err: '지금은 상대 차례예요.' };
    if (m.paused) return { err: '잠시 멈춤 중이에요.' };
    return resolve(m, p.side, Number(d.pick));
  }));
  socket.on('strike', S(d => {
    const { s } = me; const m = matches.get(s.matchId); if (!m || m.paused) return { err: '경기가 없어요.' };
    const p = m.players.find(x => x.pid === s.id); if (!p) return { err: '경기가 없어요.' };
    const off = Math.max(-5000, Math.min(5000, Math.round(Number(d.off) || 0)));
    return strike(m, p.side, off);
  }));
  // B안 입력: 움직이기(조이스틱 방향), 치기, 문제 답하기
  const arenaOf = () => { const { s } = me; const m = matches.get(s.matchId); if (!m || m.mode !== 'arena') return {}; return { m, p: m.players.find(x => x.pid === s.id) }; };
  socket.on('amove', d => { if (!me) return; const { m, p } = arenaOf(); if (p) arena.input(m, p, d || {}); });
  socket.on('astrike', S(() => { const { m, p } = arenaOf(); return p ? arena.press(m, p) : { err: '경기가 없어요.' }; }));
  socket.on('aanswer', S(d => { const { m, p } = arenaOf(); return p ? arena.answer(m, p, Number(d.pick)) : { err: '경기가 없어요.' }; }));
  socket.on('practice', S(() => { // 기다리는 동안 AI와 연습 (점수에 안 들어가요)
    const { c, s } = me; if (s.matchId && matches.get(s.matchId) && matches.get(s.matchId).state !== 'ended') return { err: '이미 경기 중이에요.' };
    if (c.settings.mode === 'arena') { const m = arena.create(c, [s], { practice: true }); s.status = 'practice'; s.waitSince = s.waitSince || Date.now(); pushClass(c); return { ok: true, id: m.id }; }
    const m = createMatch(c, [s], { practice: true, botName: '연습 로봇' }); s.status = 'practice'; s.waitSince = s.waitSince || Date.now(); pushClass(c); return { ok: true, id: m.id };
  }));
  socket.on('leavePractice', S(() => { const { c, s } = me; const m = matches.get(s.matchId); if (m && m.practice) leaveMatch(c, s); s.matchId = null; s.status = c.running ? 'waiting' : 'lobby'; s.waitSince = Date.now(); pushClass(c); }));
  socket.on('myRanking', S(d => { const { c, s } = me; const by = SORTS[d.by] ? d.by : 'points'; return { ok: true, cls: classRanking(c, by).slice(0, 40), grade: gradeRanking(c.grade, by).slice(0, 40), battle: classBattle(c.grade), me: s.id }; }));
  socket.on('disconnect', () => {
    if (me) { const { c, s } = me; if (s.socketId === socket.id) { s.online = false; s.socketId = null; const m = matches.get(s.matchId); if (m && m.practice) leaveMatch(c, s); pushClass(c); } }
  });

  /* ---------- 교사 ---------- */
  socket.on('t:login', (d, cb) => {
    d = d || {};
    if (d.token && teacherTokens.has(d.token)) { teacher = true; return cb({ ok: true, token: d.token, classes: classList() }); }
    if (!checkPw(d.pw)) return cb({ err: '비밀번호가 맞지 않아요.' });
    const tk = rid() + rid(); teacherTokens.add(tk); teacher = true; cb({ ok: true, token: tk, classes: classList() });
  });
  const cls = d => DB.classes[d.code];
  socket.on('t:classes', T(() => ({ ok: true, classes: classList() })));
  socket.on('t:newClass', T(d => { let code; do { code = String(Math.floor(1000 + Math.random() * 9000)); } while (DB.classes[code]); DB.classes[code] = blankClass(code, clean(d.name, 16) || '새 반', d.grade || 6); save(); return { ok: true, classes: classList() }; }));
  socket.on('t:renameClass', T(d => { const c = cls(d); if (!c) return { err: '반이 없어요.' }; c.name = clean(d.name, 16) || c.name; save(); pushClass(c); return { ok: true, classes: classList() }; }));
  socket.on('t:deleteClass', T(d => { const c = cls(d); if (!c) return { err: '반이 없어요.' }; for (const m of matches.values()) if (m.code === c.code) { clearTimers(m); if (m.loop) clearInterval(m.loop); matches.delete(m.id); } delete DB.classes[d.code]; save(); return { ok: true, classes: classList() }; }));
  socket.on('t:open', T(d => { const c = cls(d); if (!c) return { err: '반이 없어요.' }; for (const r of socket.rooms) if (r.startsWith('t:')) socket.leave(r); socket.join('t:' + c.code); return { ok: true, view: teacherView(c) }; }));
  socket.on('t:settings', T(d => {
    const c = cls(d); if (!c) return { err: '반이 없어요.' }; const st = c.settings, n = d.settings || {};
    if ([11, 12].includes(Number(n.unit))) { st.unit = Number(n.unit); }
    if (n.qSec) st.qSec = Math.min(20, Math.max(4, Number(n.qSec)));
    if (n.minSec) st.minSec = Math.min(st.qSec, Math.max(3, Number(n.minSec)));
    if (n.target) st.target = Math.min(15, Math.max(1, Number(n.target)));
    if (n.botAcc) st.botAcc = Math.min(95, Math.max(30, Number(n.botAcc)));
    for (const k of ['speedUp', 'aiFill', 'tts']) if (typeof n[k] === 'boolean') st[k] = n[k];
    if (STRIKE_WIN[n.strikeWin]) st.strikeWin = n.strikeWin;
    if (['touch', 'arena'].includes(n.mode)) st.mode = n.mode;
    if (n.groupSize) st.groupSize = Math.min(4, Math.max(2, Number(n.groupSize)));
    if (n.hearts) st.hearts = Math.min(3, Math.max(1, Number(n.hearts)));
    if (n.arenaMin) st.arenaMin = Math.min(5, Math.max(2, Number(n.arenaMin)));
    if (['free', 'tournament', 'league'].includes(n.comp)) st.comp = n.comp;
    if (n.leagueGames) st.leagueGames = Math.min(8, Math.max(2, Number(n.leagueGames)));
    save(); pushClass(c); return { ok: true, view: teacherView(c) };
  }));
  socket.on('t:start', T(d => { const c = cls(d); if (!c) return { err: '반이 없어요.' }; if (!c.session) c.session = newSession(c); c.running = true; c.paused = false; for (const s of Object.values(c.students)) if (s.online && s.status === 'lobby') { s.status = 'waiting'; s.waitSince = Date.now(); } feed(c, '🔔 선생님이 경기를 시작했어요! 자동으로 짝이 정해져요.'); if (c.settings.mode === 'arena' && !c.comp) arena.startComp(c); pushClass(c); matchmake(c); return { ok: true, view: teacherView(c) }; }));
  socket.on('t:pause', T(d => {
    const c = cls(d); if (!c) return { err: '반이 없어요.' }; c.paused = !c.paused;
    for (const m of matches.values()) {
      if (m.code !== c.code || m.practice || m.state === 'ended' || m.mode === 'arena') continue; // 경기장 경기는 계산 중에 멈춤을 확인해요
      if (c.paused) { if (m.state === 'flight' && m.ball) { m.pausedLeft = Math.max(1500, m.ball.deadline - Date.now()); } clearTimers(m); m.paused = true; m.pauseState = m.state; m.state = 'paused'; pushMatch(m); }
      else if (m.paused) {
        m.paused = false; m.state = m.pauseState;
        later(m, () => { if (m.state !== 'ended') endMatch(m, 'time'); }, MAX_MATCH);
        if (m.pauseState === 'flight' && m.ball) { const to = m.ball.to; m.ball.answered = true; m.ball.phase = 'done'; later(m, () => launch(m, to), 1200); } // 멈췄던 공은 새 문제로 다시 날아와요
        else if (m.pauseState === 'countdown') later(m, () => launch(m, m.server), 1500);
        else if (m.players.some(p => p.score >= m.target)) later(m, () => endMatch(m, 'score'), 800);
        else later(m, () => launch(m, m.last && m.last.scorer != null ? m.last.scorer : 0), 1200);
      }
    }
    feed(c, c.paused ? '⏸ 선생님이 잠시 멈췄어요.' : '▶ 다시 시작!'); pushClass(c); return { ok: true, view: teacherView(c) };
  }));
  socket.on('t:stop', T(d => {
    const c = cls(d); if (!c) return { err: '반이 없어요.' }; c.running = false; c.paused = false;
    for (const m of [...matches.values()]) if (m.code === c.code && m.state !== 'ended') { if (m.mode === 'arena') { if (!m.practice) arena.stop(m); continue; } m.paused = false; endMatch(m, 'stop'); }
    for (const s of Object.values(c.students)) { s.status = 'lobby'; s.matchId = null; }
    const summary = sessionSummary(c); c.session = null; if (summary) { const cv = arena.compView(c); if (cv.type === 'tournament' && cv.champion) summary.champion = cv.champion; if (cv.type === 'league') summary.league = cv.table.slice(0, 5); c.lastSummary = summary; }
    arena.stopComp(c);
    feed(c, '🏁 오늘 경기 끝! 랭킹을 확인해 보세요.'); pushClass(c); return { ok: true, view: teacherView(c), summary };
  }));
  socket.on('t:lastSummary', T(d => { const c = cls(d); if (!c) return { err: '반이 없어요.' }; return c.lastSummary ? { ok: true, summary: c.lastSummary } : { err: '아직 마친 수업이 없어요.' }; }));
  socket.on('t:ranking', T(d => { const c = cls(d); if (!c) return { err: '반이 없어요.' }; const by = SORTS[d.by] ? d.by : 'points'; return { ok: true, cls: classRanking(c, by), grade: gradeRanking(c.grade, by), battle: classBattle(c.grade) }; }));
  socket.on('t:questions', T(d => ({ ok: true, rows: qRows(cls(d)) })));
  socket.on('t:toggleQ', T(d => { const i = DB.disabled.indexOf(d.id); if (i >= 0) DB.disabled.splice(i, 1); else DB.disabled.push(d.id); save(); return { ok: true, rows: qRows(cls(d)) }; }));
  socket.on('t:addQ', T(d => {
    const list = Array.isArray(d.list) ? d.list : [d]; let n = 0;
    for (const x of list) {
      const unit = Number(x.unit); const q = clean(x.q, 120), a = clean(x.answer, 80), w1 = clean(x.w1, 80), w2 = clean(x.w2, 80);
      if (![11, 12].includes(unit) || !q || !a || !w1 || !w2) continue;
      const pic = clean(x.pic, 120); const cap = clean(x.cap, 60);
      DB.custom.push({ id: `c${unit}-${++DB.qseq}`, unit, q, answer: a, wrong: [w1, w2], pic: pic || cap ? { e: pic || '🖼️', cap } : null, exp: clean(x.exp, 80), base: false }); n++;
    }
    save(); return n ? { ok: true, added: n, rows: qRows(cls(d)) } : { err: '추가할 문제가 없어요. 단원(11/12), 질문, 정답, 오답 2개를 모두 적어 주세요.' };
  }));
  socket.on('t:delQ', T(d => { DB.custom = DB.custom.filter(q => q.id !== d.id); save(); return { ok: true, rows: qRows(cls(d)) }; }));
  socket.on('t:resetStats', T(d => { const c = cls(d); if (!c) return { err: '반이 없어요.' }; for (const s of Object.values(c.students)) s.stats = blankStats(); c.qstats = {}; c.log = []; save(); pushClass(c); return { ok: true, view: teacherView(c) }; }));
  socket.on('t:removeStudent', T(d => { const c = cls(d); if (!c) return { err: '반이 없어요.' }; const s = c.students[d.id]; if (!s) return { err: '학생이 없어요.' }; if (s.matchId) leaveMatch(c, s); if (s.socketId) io.to(s.socketId).emit('kicked', '선생님이 목록에서 내보냈어요. 다시 입장해 주세요.'); delete c.students[d.id]; save(); pushClass(c); return { ok: true, view: teacherView(c) }; }));
});


/* ===================== 시작 ===================== */
load();
// 우리 학년 반: 6학년 8반·9반·10반 (입장 코드 0608·0609·0610 — 서버가 다시 켜져도 코드가 그대로예요)
for (const [code, name] of [['0608', '6학년 8반'], ['0609', '6학년 9반'], ['0610', '6학년 10반']]) if (!DB.classes[code]) DB.classes[code] = blankClass(code, name, 6);
save();
server.listen(PORT, () => console.log(`영어 리턴볼 서버: http://localhost:${PORT}  (교사: /teacher.html)`));
