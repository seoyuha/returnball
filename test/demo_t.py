# 토너먼트 시연 녹화: 영상 속 학생 1명(브라우저 자동 조작) + 자동 학생 5명
import sys, time, json, subprocess, os
from playwright.sync_api import sync_playwright
URL, OUT, ANS = sys.argv[1], sys.argv[2], sys.argv[3]
answers = json.load(open(ANS))
AUTO = open(os.path.join(os.path.dirname(__file__), 'demo_b.py')).read().split('AUTO = """')[1].split('"""')[0]
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
    T.click('#modes button[data-mode="arena"]'); time.sleep(.2); T.click('#comps button[data-v="tournament"]'); time.sleep(.2)
    T.select_option('#settings select[data-k="arenaMin"]', '2'); T.select_option('#settings select[data-k="hearts"]', '1'); time.sleep(.3)
    vid = b.new_context(viewport={'width': 1280, 'height': 720}, record_video_dir=OUT + '/vid', record_video_size={'width': 1280, 'height': 720})
    A = vid.new_page(); A.on('pageerror', lambda e: errs.append('A ' + str(e)))
    A.goto(URL); time.sleep(1.2); A.click('#b-enter'); A.fill('#j-code', '0608'); A.fill('#j-name', '김민준'); A.click('#j-go'); time.sleep(.8)
    bots = subprocess.Popen(['node', 'test/bots.js'], env=dict(os.environ, URL=URL, SKILL='0.45'), cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    time.sleep(2)
    A.evaluate(AUTO, {'answers': answers, 'acc': .9, 'think': [1300, 1300], 'reach': 125, 'skill': .55})
    T.screenshot(path=OUT + '/t0_before.png')
    T.click('#b-start'); time.sleep(5); T.screenshot(path=OUT + '/t1_round1.png', full_page=True)
    shots = {}; end = time.time() + 300; t0 = time.time(); champ = False
    while time.time() < end:
        st = A.evaluate("""(() => { const R = window.ARENA; const q = s => document.querySelector(s); const vis = s => q(s) && !q(s).classList.contains('hide');
          return { act: R && R.active, res: vis('#ar-result'), rev: vis('#ar-revive'), fev: vis('#ar-banner.fever'), fin: vis('#ar-banner.final'), crown: vis('#ar-crown'), lobby: vis('#scr-lobby'),
            aim: R && R.active && R.debug() && R.debug().charges > 0, sup: q('#ar-strike') && q('#ar-strike').classList.contains('super'), tour: q('.arr-tour') ? q('.arr-tour').textContent : '' }; })()""")
        for k, sel in (('rev', 'b2_revive'), ('fev', 'b3_fever'), ('fin', 'b4_final'), ('sup', 'b1_super_aim'), ('crown', 'b7_crown')):
            if st.get(k) and k not in shots: time.sleep(.35 if k in ('fev', 'fin') else .1); A.screenshot(path=f'{OUT}/{sel}.png'); shots[k] = 1
        if st.get('res') and ('res' + st.get('tour', '')) not in shots: time.sleep(1.2); A.screenshot(path=f'{OUT}/b5_result_{len([k for k in shots if k.startswith("res")])}.png'); shots['res' + st.get('tour', '')] = 1
        if st.get('lobby') and 'lobby' not in shots and time.time() - t0 > 20: time.sleep(1); A.screenshot(path=OUT + '/b6_lobby.png'); shots['lobby'] = 1
        if 'tmid' not in shots and time.time() - t0 > 90: T.screenshot(path=OUT + '/t2_bracket_mid.png', full_page=True); shots['tmid'] = 1
        if not champ and T.evaluate("!!document.querySelector('.crown-big')"):
            champ = True; time.sleep(.6); T.screenshot(path=OUT + '/t3_champion.png'); T.keyboard.press('Escape'); time.sleep(.4)
            T.screenshot(path=OUT + '/t4_bracket_final.png', full_page=True); T.click('#b-compbig'); time.sleep(.5); T.screenshot(path=OUT + '/t5_bracket_big.png'); T.keyboard.press('Escape')
            time.sleep(6); break
        time.sleep(0.06)
    vpath = A.video.path(); vid.close(); bots.kill()
    print('video', vpath); print('shots', sorted(shots)); print('errors', errs); print('secs', int(time.time() - t0))
    b.close()
