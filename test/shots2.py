# 화면 확인: 교사 1 + 8반 학생 3 + 9반 학생 2가 실제로 경기하며 모든 화면을 찍어요
import sys, time
from playwright.sync_api import sync_playwright
URL = sys.argv[1]; OUT = sys.argv[2]
AUTO = """window.__auto=setInterval(()=>{const a=document.querySelector('#answers:not(.off):not(.locked)'); if(!a||document.querySelector('#scr-match').classList.contains('hide')){window.__w=0;return}
 if(!window.__w){window.__w=Date.now()+900+Math.random()*1500;return} if(Date.now()<window.__w)return; window.__w=0;
 const bs=[...a.querySelectorAll('.ans')]; bs[Math.floor(Math.random()*3)].click();},150)"""
def wait_for(pg, js, t=40):
    end = time.time() + t
    while time.time() < end:
        if pg.evaluate(js): return True
        time.sleep(0.1)
    return False
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    def mk(w, h):
        pg = b.new_context(viewport={'width': w, 'height': h}).new_page(); pg.on('pageerror', lambda e: errs.append(str(e))); return pg
    def student(code, name, w=1280, h=800):
        pg = mk(w, h); pg.goto(URL); time.sleep(.6); pg.click('#b-enter'); pg.fill('#j-code', code); pg.fill('#j-name', name); pg.click('#j-go'); time.sleep(.4); return pg
    T = mk(1440, 900); T.goto(URL + '/teacher.html'); T.fill('#pw', 'finel9932!'); T.click('#login-form button'); T.wait_for_selector('#app:not(.hide)'); time.sleep(.8)
    T.select_option('#settings select[data-k="target"]', '3'); time.sleep(.3)
    A = mk(1600, 900); A.goto(URL); time.sleep(1.5); A.screenshot(path=OUT + '/s1_title.png')
    A.click('#b-howto'); time.sleep(.3); A.screenshot(path=OUT + '/s2_howto.png'); A.click('#howto [data-close]')
    A.click('#b-enter'); A.fill('#j-code', '0608'); A.fill('#j-name', '김민준'); A.screenshot(path=OUT + '/s3_join.png'); A.click('#j-go'); time.sleep(1)
    A.screenshot(path=OUT + '/s4_lobby.png')
    others = [student('0608', '이서연'), student('0608', '박지호')]
    nine = [student('0609', '최유나'), student('0609', '정하준')]
    for pg in others + nine: pg.evaluate(AUTO)
    T.screenshot(path=OUT + '/t1_live_before.png')
    T.click('#classes button[data-code="0609"]'); time.sleep(.5); T.click('#b-start'); time.sleep(.3)
    T.click('#classes button[data-code="0608"]'); time.sleep(.5); T.click('#b-start')
    wait_for(A, "!document.querySelector('#scr-match').classList.contains('hide')", 20); time.sleep(.8); A.screenshot(path=OUT + '/s5_countdown.png')
    wait_for(A, "!document.querySelector('#answers').classList.contains('off')", 25); time.sleep(.9); A.screenshot(path=OUT + '/s6_match11_mine.png')
    A.click('.ans[data-i="0"]'); time.sleep(.6)
    wait_for(A, "document.querySelector('#qpanel').classList.contains('opp') && !document.querySelector('#explain')", 15); time.sleep(.7); A.screenshot(path=OUT + '/s7_match11_opp.png')
    A.evaluate(AUTO)
    wait_for(A, "!!document.querySelector('#explain')", 40); time.sleep(.3); A.screenshot(path=OUT + '/s8_point.png')
    # 교사: 경기 현황과 경기 크게 보기
    time.sleep(1); T.screenshot(path=OUT + '/t2_live.png', full_page=True)
    T.wait_for_selector('.mcard:not(.ended) .watchbtn', timeout=20000)
    T.click('.mcard:not(.ended) .watchbtn'); time.sleep(.3)
    wait_for(T, "!!document.querySelector('.w-dir')", 20); time.sleep(.3); T.screenshot(path=OUT + '/t3_watch_live.png')
    wait_for(T, "!!document.querySelector('.w-win')", 120); time.sleep(.5); T.screenshot(path=OUT + '/t4_watch_end.png')
    T.keyboard.press('Escape')
    wait_for(A, "!document.querySelector('#scr-result').classList.contains('hide')", 120); time.sleep(.6); A.screenshot(path=OUT + '/s9_result.png')
    # 12단원
    T.click('#units button[data-unit="12"]'); time.sleep(.4)
    A.evaluate("clearInterval(window.__auto)")
    wait_for(A, "document.querySelector('#scr-match').classList.contains('u12') && !document.querySelector('#scr-match').classList.contains('hide') && !document.querySelector('#answers').classList.contains('off') && !document.querySelector('#q-pic').classList.contains('hide')", 90)
    time.sleep(.9); A.screenshot(path=OUT + '/s10_match12_mine.png')
    A.evaluate(AUTO)
    time.sleep(30)
    # 랭킹·그래프
    T.click('#tabs button[data-tab="rank"]'); time.sleep(.6); T.screenshot(path=OUT + '/t5_rank.png')
    T.click('#rk-scope button[data-v="battle"]'); time.sleep(.3); T.click('#b-graph'); time.sleep(.6); T.screenshot(path=OUT + '/t6_graph_avg.png')
    T.click('#g-metric button[data-v="acc"]'); time.sleep(.6); T.screenshot(path=OUT + '/t7_graph_acc.png')
    T.click('#b-rkbig'); time.sleep(.5); T.screenshot(path=OUT + '/t8_graph_big.png'); T.keyboard.press('Escape')
    for tab in ['wrong', 'ques', 'stud']:
        T.click(f'#tabs button[data-tab="{tab}"]'); time.sleep(.8); T.screenshot(path=OUT + f'/t9_{tab}.png')
    T.click('#tabs button[data-tab="live"]'); time.sleep(.3)
    T.click('#b-bigcode'); time.sleep(.6); T.screenshot(path=OUT + '/t10_bigcode.png'); T.keyboard.press('Escape')
    T.on('dialog', lambda d: d.accept())
    T.click('#b-stop'); wait_for(T, "!!document.querySelector('.summary')", 10); time.sleep(.6); T.screenshot(path=OUT + '/t11_summary.png')
    T.keyboard.press('Escape'); time.sleep(.3); T.screenshot(path=OUT + '/t12_live_after.png')
    print('errors:', errs)
    b.close()
