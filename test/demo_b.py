# B안 시연 녹화: 학생 2명(자동 조작) + AI 2명이 경기장에서 겨루는 모습
import sys, time, json
from playwright.sync_api import sync_playwright
URL, OUT, ANS = sys.argv[1], sys.argv[2], sys.argv[3]
answers = json.load(open(ANS))
AUTO = """(cfg) => { const A = cfg.answers; let nextAns = 0, wp = null, wpT = 0, lastStrike = 0, down = false;
 const joy = document.getElementById('ar-joy');
 const JC = { x: 160, y: 760 }, JR = 92;
 function joyTo(vx, vy) { const R = window.ARENA; const p = R.toClient({ x: JC.x + vx * JR, y: JC.y + vy * JR });
   const t = down ? 'pointermove' : 'pointerdown'; joy.dispatchEvent(new PointerEvent(t, { pointerId: 7, clientX: p.x, clientY: p.y, bubbles: true })); down = true; }
 function joyUp() { if (!down) return; joy.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, bubbles: true })); down = false; }
 setInterval(() => { const R = window.ARENA; if (!R || !R.active) { joyUp(); return; } const D = R.debug(); if (!D || D.st === 'countdown' || D.st === 'paused') return;
   const me = D.ps[D.me]; if (!me || me.out) { joyUp(); }
   // 문제 풀기
   const q = R.q(); if (q && !R.locked() && Date.now() > nextAns) { nextAns = Date.now() + cfg.think[0] + Math.random() * cfg.think[1];
     let i = q.choices.indexOf(A[q.q]); if (Math.random() > cfg.acc) i = [0,1,2].filter(x => x !== i)[Math.floor(Math.random()*2)];
     const b = document.querySelectorAll('.ar-ans')[i]; if (b && !b.disabled) b.click(); }
   if (!me || me.out) return;
   const ball = D.ball; let vx = 0, vy = 0;
   if (ball && ball.target === D.me) { let ax = me.x - ball.x, ay = (me.y - 40 - ball.y) / .75; const l = Math.hypot(ax, ay) || 1; ax /= l; ay /= l; const sd = Math.sin(Date.now() / 700) > 0 ? 1 : -1; vx = ax * .6 - ay * .7 * sd; vy = ay * .6 + ax * .7 * sd;
     if (me.x < 260) vx = Math.abs(vx); if (me.x > 1340) vx = -Math.abs(vx); if (me.y < 300) vy = Math.abs(vy); if (me.y > 690) vy = -Math.abs(vy);
     const d = Math.hypot(ball.x - me.x, (ball.y - (me.y - 40)) / .75);
     if (d < cfg.reach && D.charges > 0 && Date.now() - lastStrike > 700) { lastStrike = Date.now(); if (Math.random() < cfg.skill) document.getElementById('ar-strike').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); }
   } else { if (!wp || Date.now() > wpT || Math.hypot(wp.x - me.x, wp.y - me.y) < 40) { wp = { x: 350 + Math.random() * 900, y: 320 + Math.random() * 340 }; wpT = Date.now() + 2500; }
     const dx = wp.x - me.x, dy = wp.y - me.y, l = Math.hypot(dx, dy) || 1; vx = dx / l * .8; vy = dy / l * .8; }
   joyTo(vx, vy);
 }, 60); }"""
def wait_for(pg, js, t=60):
    end = time.time() + t
    while time.time() < end:
        if pg.evaluate(js): return True
        time.sleep(0.05)
    return False
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    T = b.new_context(viewport={'width': 1440, 'height': 900}).new_page(); T.on('pageerror', lambda e: errs.append('T ' + str(e)))
    T.goto(URL + '/teacher.html'); T.fill('#pw', 'finel9932!'); T.click('#login-form button'); T.wait_for_selector('#app:not(.hide)'); time.sleep(.6)
    T.click('#modes button[data-mode="arena"]'); time.sleep(.3)
    T.select_option('#settings select[data-k="arenaMin"]', '2'); time.sleep(.3)
    T.screenshot(path=OUT + '/b0_teacher_mode.png')
    vid = b.new_context(viewport={'width': 1280, 'height': 720}, record_video_dir=OUT + '/vid', record_video_size={'width': 1280, 'height': 720})
    A = vid.new_page(); A.on('pageerror', lambda e: errs.append('A ' + str(e)))
    A.goto(URL); time.sleep(1.5); A.click('#b-enter'); time.sleep(.3); A.fill('#j-code', '0608'); A.fill('#j-name', '김민준'); time.sleep(.3); A.click('#j-go'); time.sleep(1)
    B = b.new_context(viewport={'width': 1280, 'height': 720}).new_page(); B.on('pageerror', lambda e: errs.append('B ' + str(e)))
    B.goto(URL); time.sleep(.5); B.click('#b-enter'); B.fill('#j-code', '0608'); B.fill('#j-name', '이서연'); B.click('#j-go'); time.sleep(.4)
    for pg, cfg in ((A, {'acc': .85, 'think': [1400, 1500], 'reach': 125, 'skill': .9}), (B, {'acc': .8, 'think': [1600, 1800], 'reach': 120, 'skill': .8})):
        cfg['answers'] = answers; pg.evaluate(AUTO, cfg)
    T.click('#b-start')
    wait_for(A, "window.ARENA && ARENA.active", 30); time.sleep(1); A.screenshot(path=OUT + '/b1_countdown.png')
    shots = {}; end = time.time() + 170; t0 = time.time()
    while time.time() < end:
        st = A.evaluate("""(() => { const R = window.ARENA; if (!R || !R.active) return { res: false }; const D = R.debug(); const res = !document.getElementById('ar-result').classList.contains('hide');
          return { res, st: D && D.st, tg: D && D.ball ? D.ball.target === D.me : null, ch: D && D.charges, out: D && D.ps[D.me] && D.ps[D.me].out, danger: document.getElementById('scr-arena').classList.contains('danger'),
            now: document.getElementById('ar-strike').classList.contains('now'), hit: document.querySelector('.ar-msg.on.good') != null, msg: document.querySelector('.ar-msg.on') ? document.getElementById('ar-msg').textContent : '' }; })()""")
        if st.get('res'): time.sleep(2.5); A.screenshot(path=OUT + '/b7_result.png'); break
        if st.get('st') == 'play' and not st.get('tg') and 'play' not in shots and time.time() - t0 > 8: A.screenshot(path=OUT + '/b2_play.png'); shots['play'] = 1
        if st.get('now') and 'now' not in shots: A.screenshot(path=OUT + '/b3_strike_now.png'); shots['now'] = 1
        if st.get('hit') and 'hit' not in shots: A.screenshot(path=OUT + '/b4_hit.png'); shots['hit'] = 1
        if '맞았' in (st.get('msg') or '') or '탈락' in (st.get('msg') or ''):
            if 'ko' not in shots: A.screenshot(path=OUT + '/b5_ko.png'); shots['ko'] = 1
        if st.get('out') and 'spec' not in shots: time.sleep(.8); A.screenshot(path=OUT + '/b6_spectate.png'); shots['spec'] = 1
        if 'watch' not in shots and time.time() - t0 > 25:
            T.wait_for_selector('.mcard.arena .watchbtn', timeout=5000); T.click('.mcard.arena .watchbtn'); time.sleep(.6); T.screenshot(path=OUT + '/b8_teacher_watch.png'); T.keyboard.press('Escape'); time.sleep(.2); T.screenshot(path=OUT + '/b9_teacher_live.png'); shots['watch'] = 1
        time.sleep(0.05)
    vpath = A.video.path(); vid.close()
    print('video', vpath); print('shots', sorted(shots)); print('errors', errs)
    b.close()
