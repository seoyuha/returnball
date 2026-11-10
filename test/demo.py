# 시연 녹화: 교사가 경기를 시작하고 학생 두 명이 '정답 → 공 터치'로 겨루는 모습을 찍어요.
# 사용: python3 test/demo.py URL 출력폴더 답안.json
import sys, time, json, glob, os
from playwright.sync_api import sync_playwright
URL, OUT, ANS = sys.argv[1], sys.argv[2], sys.argv[3]
answers = json.load(open(ANS))
# 화면 속 자동 학생: 정답률·터치 정확도를 조금 섞어 실수 장면도 나오게 해요
AUTO = """(cfg) => { const A = cfg.answers; let qKey = '', wait = 0, sKey = '', sOff = 0;
 setInterval(() => { const R = window.__rb; if (!R || !R.M) return; const M = R.M, f = R.fly; if (M.state !== 'flight' || !M.ball || M.ball.to !== M.me) return;
  const b = M.ball;
  if (b.phase === 'question' && !b.answered) { const k = b.q + b.full; if (qKey !== k) { qKey = k; wait = Date.now() + cfg.think[0] + Math.random() * cfg.think[1]; return; }
    if (wait && Date.now() > wait) { wait = 0; const ok = Math.random() < cfg.acc; let i = b.choices.indexOf(A[b.q]); if (!ok) i = [0,1,2].filter(x => x !== i)[Math.floor(Math.random()*2)];
      const btn = document.querySelectorAll('.ans')[i]; if (btn) btn.click(); } }
  if (f && f.phase === 'strike' && f.toMe && !f.struck) { const k = f.sHit; if (sKey !== k) { sKey = k; const good = Math.random() < cfg.touch; sOff = good ? (Math.random()*2-1) * 110 : (Math.random() < .5 ? -1 : 1) * (300 + Math.random()*150); }
    if (performance.now() >= f.sHit + sOff) { const p = R.toClient(R.ballPos); const el = document.getElementById('scr-match');
      el.dispatchEvent(new PointerEvent('pointerdown', { clientX: p.x + (Math.random()*20-10), clientY: p.y + (Math.random()*20-10), bubbles: true })); sKey = 'done' + k; } }
 }, 16); }"""
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
    T.select_option('#settings select[data-k="target"]', '5'); time.sleep(.2)
    vid = b.new_context(viewport={'width': 1280, 'height': 720}, record_video_dir=OUT + '/vid', record_video_size={'width': 1280, 'height': 720})
    A = vid.new_page(); A.on('pageerror', lambda e: errs.append('A ' + str(e)))
    A.goto(URL); time.sleep(2.2)
    A.click('#b-enter'); time.sleep(.4); A.fill('#j-code', '0608'); time.sleep(.3); A.fill('#j-name', '김민준'); time.sleep(.4); A.click('#j-go'); time.sleep(1.5)
    B = b.new_context(viewport={'width': 1280, 'height': 720}).new_page(); B.on('pageerror', lambda e: errs.append('B ' + str(e)))
    B.goto(URL); time.sleep(.6); B.click('#b-enter'); B.fill('#j-code', '0608'); B.fill('#j-name', '이서연'); B.click('#j-go'); time.sleep(.5)
    B.evaluate(AUTO, {'answers': answers, 'acc': .85, 'touch': .7, 'think': [1500, 2200]})
    A.evaluate(AUTO, {'answers': answers, 'acc': .85, 'touch': .78, 'think': [1600, 1800]})
    T.click('#b-start')
    shots = {}
    end = time.time() + 150
    while time.time() < end:
        st = A.evaluate("""(() => { const R = window.__rb; if (!R || !R.M) return null; const M = R.M, f = R.fly, b = M.ball;
          return { s: M.state, ph: b && b.phase, me: b ? b.to === M.me : null, fly: f && f.phase, left: f && f.sHit ? f.sHit - performance.now() : null,
            res: !document.querySelector('#scr-result').classList.contains('hide'), fx: !!document.querySelector('.fx.hit'), mfx: !!document.querySelector('.fx.miss') }; })()""")
        if st:
            if st['s'] == 'flight' and st['ph'] == 'question' and st['me'] and 'q' not in shots: time.sleep(.9); A.screenshot(path=OUT + '/d1_question.png'); shots['q'] = 1
            elif st['fly'] == 'strike' and st['me'] and st['left'] is not None and st['left'] > 900 and 'big' not in shots: A.screenshot(path=OUT + '/d2_ring_big.png'); shots['big'] = 1
            elif st['fly'] == 'strike' and st['me'] and st['left'] is not None and abs(st['left']) < 60 and 'near' not in shots: A.screenshot(path=OUT + '/d3_ring_overlap.png'); shots['near'] = 1
            elif st['fx'] and 'hit' not in shots: A.screenshot(path=OUT + '/d4_hit.png'); shots['hit'] = 1
            elif st['mfx'] and 'miss' not in shots: time.sleep(.12); A.screenshot(path=OUT + '/d5_miss.png'); shots['miss'] = 1
            elif st['fly'] == 'strike' and st['me'] is False and 'opp' not in shots: time.sleep(.5); A.screenshot(path=OUT + '/d6_opp_strike.png'); shots['opp'] = 1
            if st['res']: time.sleep(4); A.screenshot(path=OUT + '/d7_result.png'); break
        time.sleep(0.03)
    T.screenshot(path=OUT + '/d8_teacher.png')
    vpath = A.video.path(); vid.close()
    print('video', vpath); print('shots', sorted(shots)); print('errors', errs)
    b.close()
