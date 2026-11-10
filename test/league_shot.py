# 리그전 교사 화면 확인: 자동 학생 6명, 1인 2경기
import sys, time, subprocess, os
from playwright.sync_api import sync_playwright
URL, OUT = sys.argv[1], sys.argv[2]
with sync_playwright() as p:
    b = p.chromium.launch(); T = b.new_context(viewport={'width': 1440, 'height': 900}).new_page(); errs = []; T.on('pageerror', lambda e: errs.append(str(e)))
    T.goto(URL + '/teacher.html'); T.fill('#pw', 'finel9932!'); T.click('#login-form button'); T.wait_for_selector('#app:not(.hide)'); time.sleep(.5)
    T.click('#modes button[data-mode="arena"]'); time.sleep(.2); T.click('#comps button[data-v="league"]'); time.sleep(.2); T.select_option('#lg-games', '2'); time.sleep(.2)
    T.select_option('#settings select[data-k="hearts"]', '1'); T.select_option('#settings select[data-k="arenaMin"]', '2'); time.sleep(.3)
    S = b.new_context(viewport={'width': 1280, 'height': 720}).new_page(); S.goto(URL); time.sleep(.8); S.click('#b-enter'); S.fill('#j-code', '0608'); S.fill('#j-name', '관찰용'); S.click('#j-go'); time.sleep(.5)
    bots = subprocess.Popen(['node', 'test/bots.js'], env=dict(os.environ, URL=URL, SKILL='0.4', NAMES='민준,서연,지호,하은,도윤,수아'), cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    time.sleep(2); T.click('#b-start'); t0 = time.time(); shot = False
    while time.time() - t0 < 300:
        txt = T.evaluate("document.getElementById('comp-body').innerText")
        if not shot and time.time() - t0 > 40: T.screenshot(path=OUT + '/l1_league_mid.png', full_page=True); shot = True
        if '리그 끝' in txt: break
        time.sleep(1)
    time.sleep(1); T.screenshot(path=OUT + '/l2_league_done.png', full_page=True); S.screenshot(path=OUT + '/l3_student_lobby.png')
    T.click('#b-compbig'); time.sleep(.5); T.screenshot(path=OUT + '/l4_league_big.png')
    bots.kill(); print('secs', int(time.time() - t0), 'errors', errs); b.close()
