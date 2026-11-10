# 동작 확인: 자유 경기 1판 녹화 + 걷기·받아치기 연속 캡처
import sys, time, json, subprocess, os
from playwright.sync_api import sync_playwright
URL, OUT, ANS = sys.argv[1], sys.argv[2], sys.argv[3]
answers = json.load(open(ANS))
AUTO = open(os.path.join(os.path.dirname(__file__), 'demo_b.py')).read().split('AUTO = """')[1].split('"""')[0]
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    T = b.new_context(viewport={'width': 1440, 'height': 900}).new_page()
    T.goto(URL + '/teacher.html'); T.fill('#pw', 'finel9932!'); T.click('#login-form button'); T.wait_for_selector('#app:not(.hide)'); time.sleep(.5)
    T.click('#modes button[data-mode="arena"]'); time.sleep(.2); T.click('#comps button[data-v="free"]'); T.select_option('#settings select[data-k="hearts"]', '2'); T.select_option('#settings select[data-k="arenaMin"]', '2'); time.sleep(.3)
    vid = b.new_context(viewport={'width': 1280, 'height': 720}, record_video_dir=OUT + '/vid', record_video_size={'width': 1280, 'height': 720})
    A = vid.new_page(); A.on('pageerror', lambda e: errs.append(str(e)))
    A.goto(URL); time.sleep(1); A.click('#b-enter'); A.fill('#j-code', '0608'); A.fill('#j-name', '김민준'); A.click('#j-go'); time.sleep(.6)
    bots = subprocess.Popen(['node', 'test/bots.js'], env=dict(os.environ, URL=URL, SKILL='0.6', NAMES='서연,지호,하은'), cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    time.sleep(1.5); A.evaluate(AUTO, {'answers': answers, 'acc': .9, 'think': [1300, 1300], 'reach': 125, 'skill': .85})
    T.click('#b-start'); t0 = time.time(); walk = swing = perf = rev = 0
    while time.time() - t0 < 75:
        d = A.evaluate("(() => { const R = window.ARENA; if (!R || !R.active) return null; const D = R.debug(); return D && { st: D.st, x: D.mine && D.mine.x, y: D.mine && D.mine.y, mv: D.ps[D.me].moving }; })()")
        if d and d['st'] == 'play' and d['mv'] and walk < 4 and time.time() - t0 > 8:
            clip = {'x': max(0, d['x'] * .8 - 110), 'y': max(0, d['y'] * .8 - 175), 'width': 220, 'height': 200}
            for k in range(4): A.screenshot(path=f'{OUT}/walk_{k}.png', clip=clip); time.sleep(.115)
            walk = 4
        time.sleep(.05)
    A.screenshot(path=OUT + '/scene.png')
    vpath = A.video.path(); vid.close(); bots.kill(); print('video', vpath, 'errors', errs); b.close()
