// 영어 리턴볼 — 임시 그래픽 (나중에 public/img/ 에 같은 이름의 그림을 넣으면 자동으로 바뀌어요)
// 그림 자리: logo.webp, robot_blue.webp, robot_red.webp, ball.webp, title_bg.webp, court11.webp, court12.webp
window.ART = (() => {
  let uid = 0;
  function robot(kind) {
    const u = 'r' + (++uid);
    const c = kind === 'red' ? { main: '#ff6a4d', glow: '#ff9a7a', dark: '#2a1a24' } : { main: '#22d3d8', glow: '#7ff7ff', dark: '#14243a' };
    return `<svg viewBox="0 0 300 360" class="robot-svg" aria-hidden="true">
      <defs><linearGradient id="${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#cfd8e6"/></linearGradient></defs>
      <g class="leg-b"><rect x="95" y="250" width="44" height="80" rx="18" fill="url(#${u})" stroke="${c.dark}" stroke-width="5"/><rect x="85" y="312" width="64" height="28" rx="12" fill="${c.main}" stroke="${c.dark}" stroke-width="5"/></g>
      <g class="leg-f"><rect x="165" y="250" width="44" height="80" rx="18" fill="url(#${u})" stroke="${c.dark}" stroke-width="5"/><rect x="157" y="312" width="64" height="28" rx="12" fill="${c.main}" stroke="${c.dark}" stroke-width="5"/></g>
      <g class="arm-b"><rect x="40" y="170" width="70" height="34" rx="17" fill="url(#${u})" stroke="${c.dark}" stroke-width="5"/><circle cx="40" cy="187" r="22" fill="${c.dark}"/></g>
      <rect x="88" y="150" width="128" height="115" rx="34" fill="url(#${u})" stroke="${c.dark}" stroke-width="6"/>
      <rect x="118" y="180" width="68" height="40" rx="12" fill="${c.main}"/>
      <g class="arm-f"><rect x="196" y="160" width="74" height="34" rx="17" fill="url(#${u})" stroke="${c.dark}" stroke-width="5"/>
        <g fill="${c.dark}"><rect x="262" y="132" width="14" height="44" rx="7"/><rect x="278" y="136" width="14" height="44" rx="7"/><rect x="292" y="146" width="12" height="38" rx="6"/></g></g>
      <ellipse cx="152" cy="92" rx="92" ry="82" fill="url(#${u})" stroke="${c.dark}" stroke-width="6"/>
      <path d="M78 70 Q152 20 226 70" fill="none" stroke="${c.main}" stroke-width="12" stroke-linecap="round"/>
      <rect x="92" y="78" width="122" height="66" rx="28" fill="${c.dark}"/>
      <path d="M118 104 l22 10 M186 104 l-22 10" stroke="${c.glow}" stroke-width="8" stroke-linecap="round"/>
      <rect x="130" y="118" width="12" height="16" rx="5" fill="${c.glow}"/><rect x="164" y="118" width="12" height="16" rx="5" fill="${c.glow}"/>
      <circle cx="70" cy="108" r="22" fill="${c.dark}" stroke="${c.main}" stroke-width="8"/>
    </svg>`;
  }
  function ball() {
    const u = 'b' + (++uid);
    return `<svg viewBox="0 0 100 100" class="ball-svg" aria-hidden="true">
      <defs><radialGradient id="${u}" cx="38%" cy="32%" r="70%"><stop offset="0" stop-color="#fff8b0"/><stop offset=".55" stop-color="#ffd21f"/><stop offset="1" stop-color="#f29a00"/></radialGradient></defs>
      <circle cx="50" cy="50" r="46" fill="url(#${u})" stroke="#fff3a0" stroke-width="3"/>
      <g fill="#f5b300" stroke="#fff6c0" stroke-width="2.5" stroke-linejoin="round">
        <polygon points="50,33 64,43 59,59 41,59 36,43"/>
        <polygon points="50,6 62,13 50,22 38,13"/><polygon points="88,40 92,55 78,51 76,38"/><polygon points="12,40 24,38 22,51 8,55"/>
        <polygon points="30,86 24,74 36,69 43,82"/><polygon points="70,86 57,82 64,69 76,74"/>
      </g></svg>`;
  }
  // 그림 파일이 있으면 그걸 쓰고, 없으면 위의 임시 그림을 써요
  const files = { logo: 'img/logo.webp', robot_blue: 'img/robot_blue.webp', robot_red: 'img/robot_red.webp', ball: 'img/ball.webp', title_bg: 'img/title_bg.webp', court11: 'img/court11.webp', court12: 'img/court12.webp' };
  const ready = {};
  for (const [k, src] of Object.entries(files)) {
    const im = new Image(); im.onload = () => { ready[k] = src; document.documentElement.style.setProperty('--img-' + k, `url(${src})`); document.documentElement.classList.add('has-' + k); window.dispatchEvent(new Event('art')); }; im.src = src;
  }
  function el(key, kind) {
    if (ready[key]) return `<img src="${ready[key]}" class="art-img" alt="">`;
    if (key.startsWith('robot')) return robot(kind);
    if (key === 'ball') return ball();
    return '';
  }
  function hanok(w) {
    return `<svg viewBox="0 0 300 170" width="${w}" aria-hidden="true">
      <rect x="40" y="88" width="220" height="70" fill="#f4e6cc" stroke="#5a3a22" stroke-width="4"/>
      <g fill="#8a5a36"><rect x="56" y="92" width="10" height="66"/><rect x="146" y="92" width="10" height="66"/><rect x="236" y="92" width="10" height="66"/></g>
      <g fill="#e9c98f" stroke="#5a3a22" stroke-width="3"><rect x="76" y="104" width="56" height="40"/><rect x="166" y="104" width="56" height="40"/></g>
      <path d="M8 74 Q60 92 150 86 Q240 92 292 74 L282 96 Q220 104 150 100 Q80 104 18 96 Z" fill="#33415e" stroke="#1d2840" stroke-width="4"/>
      <path d="M40 76 Q150 20 260 76" fill="#46577a" stroke="#1d2840" stroke-width="4"/>
      <rect x="0" y="156" width="300" height="12" rx="4" fill="#9aa4b5"/></svg>`;
  }
  return { robot, ball, el, ready, hanok };
})();
