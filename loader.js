const particles = Array.from({ length: 30 }, (_, i) => {
  const x = (i * 37) % 100;
  const y = (i * 61) % 100;
  const d = 1.8 + ((i * 17) % 26) / 10;
  const s = 0.9 + ((i * 11) % 18) / 10;
  return `<i class="loader-particle" style="--x:${x}%;--y:${y}%;--d:${d}s;--s:${s}px"></i>`;
}).join('');

export const loader = () => `
  <div class="launch-screen" id="launch-screen" aria-label="Loading LFG Outreach CRM">
    <div class="loader-grid"></div>
    <div class="loader-particles">${particles}</div>
    <div class="loader-stage">
      <div class="loader-orbit orbit-one"></div>
      <div class="loader-orbit orbit-two"></div>
      <div class="loader-logo-stack" aria-hidden="true">
        <img class="loader-logo layer layer-3" src="./lfg-logo.png" alt="">
        <img class="loader-logo layer layer-2" src="./lfg-logo.png" alt="">
        <img class="loader-logo layer layer-1" src="./lfg-logo.png" alt="">
      </div>
      <div class="loader-wordmark">LFG</div>
      <div class="loader-copy"><span>LAISSEZ-FAIRE GROUP</span><strong>OUTREACH INTELLIGENCE</strong></div>
      <div class="loader-progress"><i></i></div>
    </div>
  </div>`;
