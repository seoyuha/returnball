import sys, time, json
from playwright.sync_api import sync_playwright
URL = sys.argv[1]; OUT = sys.argv[2]
AUTO = """window.__auto=setInterval(()=>{const a=document.querySelector('#answers:not(.off):not(.locked)'); if(!a||document.querySelector('#scr-match').classList.contains('hide'))return;
 if(!window.__w){window.__w=Date.now()+1200+Math.random()*1500;return} if(Date.now()<window.__w)return; window.__w=0;
 const bs=[...a.querySelectorAll('.ans')]; bs[Math.floor(Math.random()*3)].click();},200)"""
def wait_for(page, js, t=40):
    end=time.time()+t
    while time.time()<end:
        if page.evaluate(js): return True
        time.sleep(0.1)
    return False
with sync_playwright() as p:
    b = p.chromium.launch()
    errs=[]
    def mk(w,h):
        pg=b.new_context(viewport={'width':w,'height':h}).new_page(); pg.on('pageerror',lambda e: errs.append(str(e))); return pg
    T = mk(1440,900); T.goto(URL+'/teacher.html'); T.screenshot(path=OUT+'/t0_login.png')
    T.fill('#pw','finel9932!'); T.click('#login-form button'); T.wait_for_selector('#app:not(.hide)'); time.sleep(.8)
    A = mk(1600,900); A.goto(URL); time.sleep(1.2); A.screenshot(path=OUT+'/s1_title.png')
    A.click('#b-howto'); time.sleep(.3); A.screenshot(path=OUT+'/s2_howto.png'); A.click('#howto [data-close]')
    A.click('#b-enter'); A.fill('#j-code','0608'); A.fill('#j-name','김민준'); A.screenshot(path=OUT+'/s3_join.png'); A.click('#j-go'); time.sleep(.8)
    A.screenshot(path=OUT+'/s4_lobby.png')
    pages=[A]
    for n in ['이서연','박지호']:
        pg=mk(1280,800); pg.goto(URL); time.sleep(.6); pg.click('#b-enter'); pg.fill('#j-code','0608'); pg.fill('#j-name',n); pg.click('#j-go'); time.sleep(.4); pages.append(pg)
    T.screenshot(path=OUT+'/t1_dash_before.png', full_page=True)
    T.click('#b-start'); 
    wait_for(A,"!document.querySelector('#scr-match').classList.contains('hide')",20); time.sleep(.6); A.screenshot(path=OUT+'/s5_countdown.png')
    for pg in pages[1:]: pg.evaluate(AUTO)
    # 내 차례 공
    wait_for(A,"!document.querySelector('#answers').classList.contains('off') && document.querySelector('#gauge').style.width.replace('%','')<80",20); A.screenshot(path=OUT+'/s6_mine_u11.png')
    A.click('.ans[data-i="0"]'); time.sleep(.5); A.screenshot(path=OUT+'/s7_after_answer.png')
    wait_for(A,"document.querySelector('#qpanel').classList.contains('opp') && !!document.querySelector('#answers.off')",15); time.sleep(.6); A.screenshot(path=OUT+'/s8_opp_turn.png')
    A.evaluate(AUTO)
    wait_for(A,"!!document.querySelector('#explain')",40); time.sleep(.3); A.screenshot(path=OUT+'/s9_point.png')
    time.sleep(1.5); T.screenshot(path=OUT+'/t2_dash_live.png', full_page=True)
    C=pages[2]; wait_for(C,"!document.querySelector('#scr-match').classList.contains('hide')",30); time.sleep(5); C.screenshot(path=OUT+'/s10_vs_ai_1280.png')
    wait_for(A,"!document.querySelector('#scr-result').classList.contains('hide')",120); time.sleep(.5); A.screenshot(path=OUT+'/s11_result.png')
    # 12단원
    T.click('#units button[data-unit="12"]'); time.sleep(.5)
    wait_for(A,"!document.querySelector('#scr-match').classList.contains('hide') && document.querySelector('#scr-match').classList.contains('u12')",60)
    A.evaluate("clearInterval(window.__auto)")
    wait_for(A,"!document.querySelector('#answers').classList.contains('off') && !document.querySelector('#q-pic').classList.contains('hide')",60); time.sleep(.8); A.screenshot(path=OUT+'/s12_mine_u12.png')
    A.evaluate(AUTO)
    time.sleep(25)
    for tab in ['rank','wrong','ques','stud']:
        T.click(f'#tabs button[data-tab="{tab}"]'); time.sleep(.8); T.screenshot(path=OUT+f'/t3_{tab}.png', full_page=True)
    T.click('#tabs button[data-tab="wrong"]'); time.sleep(.5)
    if T.query_selector('.wrow'):
        T.click('.wrow'); time.sleep(.4); T.click('#bq-show'); time.sleep(.3); T.screenshot(path=OUT+'/t4_bigwrong.png'); T.click('#big-close')
    T.click('#tabs button[data-tab="rank"]'); time.sleep(.5); T.click('#b-rkbig'); time.sleep(.3); T.screenshot(path=OUT+'/t5_bigrank.png'); T.click('#big-close')
    T.click('#tabs button[data-tab="live"]'); T.click('#b-bigcode'); time.sleep(.6); T.screenshot(path=OUT+'/t6_bigcode.png'); T.click('#big-close')
    T.click('#b-pause'); time.sleep(.6); A.screenshot(path=OUT+'/s13_paused.png'); T.click('#b-pause')
    print('errors:', errs)
    b.close()
