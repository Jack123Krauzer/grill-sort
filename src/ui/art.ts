const icons: Record<string, string> = {
  flame: '<path d="M12 22c4.4 0 7-3 7-6.7 0-2.7-1.5-4.7-3-6.3-.1 2-1.1 3.1-2 3.7.5-4.4-1.7-7.7-4-9.7.4 3.7-1 5.8-2.8 8-1.1 1.4-2.2 2.9-2.2 5 0 3.4 2.9 6 7 6Z"/><path d="M12 22c1.7 0 2.9-1.2 2.9-2.8 0-1.3-1.2-2.7-2.9-4.2-1.7 1.5-2.9 2.9-2.9 4.2 0 1.6 1.2 2.8 2.9 2.8Z"/>',
  play: '<path d="m9 5 11 7-11 7Z" fill="currentColor"/>',
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  back: '<path d="M20 12H5m6-6-6 6 6 6"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v8h14v-8m-7-4v12m0-12C7 8 6 7 6 5.5A2 2 0 0 1 8 3.5c2 0 3.3 2.6 4 4.5Zm0 0c5 0 6-1 6-2.5a2 2 0 0 0-2-2c-2 0-3.3 2.6-4 4.5Z"/>',
  settings: '<path d="M10 3h4l.5 2.4 2 .9 2.1-1.2 2.8 2.8-1.2 2.1.9 2 2.4.5v4l-2.4.5-.9 2 1.2 2.1-2.8 2.8-2.1-1.2-2 .9L14 26h-4l-.5-2.4-2-.9-2.1 1.2-2.8-2.8 1.2-2.1-.9-2L.5 16.5v-4l2.4-.5.9-2-1.2-2.1 2.8-2.8 2.1 1.2 2-.9Z" transform="translate(2 0) scale(.83)"/><circle cx="12" cy="12" r="3"/>',
  coin: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v10m3-8.5h-4a1.75 1.75 0 0 0 0 3.5h2a1.75 1.75 0 0 1 0 3.5H9"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.2"/><rect x="14" y="3" width="7" height="7" rx="1.2"/><rect x="3" y="14" width="7" height="7" rx="1.2"/><rect x="14" y="14" width="7" height="7" rx="1.2"/>',
  chef: '<path d="M6.5 13.5A4 4 0 0 1 7 5.6 5.3 5.3 0 0 1 17 5.6a4 4 0 0 1 .5 7.9V20h-11Zm0 3.5h11"/>',
  spark: '<path d="M12 2c0 6.1 3.9 10 10 10-6.1 0-10 3.9-10 10 0-6.1-3.9-10-10-10 6.1 0 10-3.9 10-10Z"/>',
  share: '<path d="M12 16V3m-5 5 5-5 5 5M5 13v7h14v-7"/>',
  clock: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 1.5M9 2h6"/>',
  pause: '<path d="M9 5v14m6-14v14" stroke-width="3"/>',
  undo: '<path d="M5 10h9a5 5 0 0 1 0 10h-2M9 5l-5 5 5 5"/>',
  shuffle: '<path d="M3 6h3c4 0 6 12 11 12h4m-4-4 4 4-4 4M3 18h3c4 0 6-12 11-12h4m-4-4 4 4-4 4"/>',
  key: '<circle cx="8" cy="9" r="4"/><path d="m11 12 8 8m-4-4 2-2m0 4 2-2"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5Zm-9 9 9 5 9-5m-18 4 9 5 9-5"/>',
  x: '<path d="m6 6 12 12M18 6 6 18"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4m-4 4v2"/>',
  sound: '<path d="M3 9h4l5-4v14l-5-4H3Zm13-1a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.6 2.6 0 1 1 3.2 2.5c-.5.2-.7.7-.7 1.5m0 3.5h.01"/>',
  refresh: '<path d="M19.5 7a8.5 8.5 0 1 0 .8 9M20 3v5h-5"/>',
  ice: '<path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9 4l3 3 3-3M9 20l3-3 3 3M3 10l4-1-1-4m15 9-4 1 1 4M3 14l4 1-1 4m15-9-4-1 1-4"/>',
  flag: '<path d="M5 22V3m0 1c5-4 9 4 15 0v11c-6 4-10-4-15 0"/>',
};

export function icon(name: string, extra = ''): string {
  return `<svg class="icon ${extra}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] ?? icons.spark}</svg>`;
}

const foodShapes: Record<string, string> = {
  sausage: '<rect x="8" y="19" width="40" height="21" rx="10.5" fill="#963f2c"/><rect x="8" y="16" width="40" height="21" rx="10.5" fill="#df6846"/><path d="M13 23c3-4 6-4 9-4h17" stroke="#f59262" stroke-width="2" fill="none" stroke-linecap="round"/><path d="m20 23-4 7m13-7-4 7m13-7-4 7" stroke="#a63c2c" stroke-width="2.5" stroke-linecap="round"/>',
  corn: '<rect x="12" y="15" width="34" height="25" rx="10" fill="#d08123"/><rect x="12" y="12" width="34" height="25" rx="10" fill="#ffd15e"/><path d="M17 18h24M14 24h30m-28 6h26M22 14v20m7-20v21m7-21v19" stroke="#e89b35" stroke-width="1.5" stroke-linecap="round"/><path d="M9 33c8 1 13-4 19-9-3 9-7 16-16 16Z" fill="#668949"/>',
  mushroom: '<path d="M23 27h11l2 13c0 5-15 5-15 0Z" fill="#e5c3a0"/><path d="M8 29c0-11 9-18 20-18s20 7 20 18c-5 6-35 6-40 0Z" fill="#c78158"/><path d="M11 24c3-8 9-11 17-11s14 3 17 11c-7 5-27 5-34 0Z" fill="#e5a67b"/><circle cx="20" cy="21" r="2" fill="#f7d4ad"/><circle cx="32" cy="17" r="2.3" fill="#f7d4ad"/>',
  shrimp: '<path d="M48 28C45 12 27 8 16 15 5 22 9 39 25 40l5-8c-10 0-12-5-9-8 5-4 13-1 14 5l7 7 5-2Z" fill="#d66647"/><path d="M46 25C43 10 25 6 14 13 4 20 8 35 23 37l4-7c-10 0-12-5-9-8 5-4 13-1 14 5l8 7 6-3Z" fill="#f38e6b"/><path d="m16 13 4 7m5-9 1 8m8-5-4 6m11-1-6 5" stroke="#fbc2a2" stroke-width="2.4" stroke-linecap="round"/><path d="m24 35 8-4 1 8-6-2-4 4Z" fill="#f09b67"/>',
  steak: '<path d="M11 20c4-10 11-12 17-5 6 7 18 0 20 12 2 11-9 14-21 13C15 39 5 36 11 20Z" fill="#873f38"/><path d="M11 17c4-10 11-12 17-5 6 7 18 0 20 12 2 11-9 14-21 13C15 36 5 33 11 17Z" fill="#c05a4c"/><path d="M15 20c2-6 7-7 11-3 6 6 17 0 18 9m-27 3 12-4m-6 8 12-4m-3 5 8-3" fill="none" stroke="#e99877" stroke-width="1.8" stroke-linecap="round"/>',
  broccoli: '<path d="m24 23-4 16c2 5 15 6 17 1l-4-18Z" fill="#8aaf60"/><path d="M20 34c5 3 12 3 15 0l1 5c-2 4-14 4-16 0Z" fill="#6a924b"/><path d="M10 24c-5-6 0-13 6-12 1-6 9-7 13-3 5-5 12-2 13 3 7-1 10 7 5 12-6 8-30 9-37 0Z" fill="#57914e"/><path d="M12 18c1-4 5-5 7-3m3-3c2-3 6-2 8 0m5 2c3-2 7 0 8 3" fill="none" stroke="#80ae5b" stroke-width="3" stroke-linecap="round"/>',
  pepper: '<path d="M24 14c-10-6-17 2-15 10 3 12 12 16 21 13 11-3 19-10 21-19-7 5-11 0-16-4-4-4-7-3-11 0Z" fill="#ab4332"/><path d="M24 11c-10-6-17 2-15 10 3 12 12 16 21 13 11-3 19-10 21-19-7 5-11 0-16-4-4-4-7-3-11 0Z" fill="#ed6650"/><path d="M24 13c-6-2-7-7-4-10l3 1c-1 5 2 5 5 6Z" fill="#7c9d50"/><path d="M13 18c0-4 4-5 8-4" stroke="#fcab80" stroke-width="2" fill="none" stroke-linecap="round"/>',
  fish: '<path d="M9 26c7-12 20-16 31-6l9-5v18l-9-5C29 38 16 37 9 26Z" fill="#407e88"/><path d="M9 22c7-12 20-16 31-6l9-5v18l-9-5C29 34 16 33 9 22Z" fill="#7abac0"/><path d="M23 14c3 4 3 11 0 15m6-12 5 4-5 4" fill="none" stroke="#4c939b" stroke-width="2"/><circle cx="16" cy="21" r="2" fill="#294c50"/>',
  tomato: '<path d="M12 24c0-9 7-15 16-15s17 6 17 15c0 10-7 17-17 17s-16-7-16-17Z" fill="#ad4433"/><path d="M12 21c0-9 7-15 16-15s17 6 17 15c0 10-7 17-17 17s-16-7-16-17Z" fill="#ed6852"/><path d="m28 6 2 5 7-2-4 5 3 3-8-2-7 2 2-5-5-2 8-1 2-4Z" fill="#769551"/><path d="M17 21c0-4 3-7 6-7" fill="none" stroke="#ff9b79" stroke-width="2.5" stroke-linecap="round"/>',
  eggplant: '<path d="M13 24c5-4 11-4 15-9 5-7 11-7 16-2 6 7 0 16-6 21-8 7-21 9-27 3-5-4-3-10 2-13Z" fill="#5b4a79"/><path d="M12 21c5-4 11-4 15-9 5-7 11-7 16-2 6 7 0 16-6 21-8 7-21 9-27 3-5-4-3-10 2-13Z" fill="#9178ad"/><path d="m34 8 6-4 4 1-2 4 5 3-4 6-3-5-6 3 2-6Z" fill="#799b63"/><path d="M13 27c3-4 9-5 14-8" fill="none" stroke="#b9a0ce" stroke-width="2.5" stroke-linecap="round"/>',
  pineapple: '<path d="M13 16h30l-2 22H15Z" fill="#ce8b3c"/><path d="M10 12h36l-3 23H13Z" fill="#f4bc58"/><path d="m13 15 19 19M22 13l20 19m-8-19 9 9m-31 3 10 9m20-19L23 34m10-21L13 32m8-19-9 9m31 3-10 9" stroke="#df9a41" stroke-width="1.5" fill="none"/><path d="m18 12-4-7 11 4 2-8 5 8 10-5-4 8Z" fill="#73955b"/>',
  onion: '<path d="M11 26c0-11 8-11 17-20 9 9 17 9 17 20 0 9-7 15-17 15s-17-6-17-15Z" fill="#a66b8c"/><path d="M11 23c0-11 8-11 17-20 9 9 17 9 17 20 0 9-7 15-17 15s-17-6-17-15Z" fill="#d396ae"/><path d="M23 12c-10 12-5 20 1 23m9-23c10 12 5 20-1 23m-4-23v22" fill="none" stroke="#b77b98" stroke-width="1.7" stroke-linecap="round"/><path d="m26 5 2-4 2 4Z" fill="#8c9870"/>',
  zucchini: '<path d="M8 24c3-5 26-13 33-11 7 2 10 9 7 15-3 7-27 12-35 11-8-1-10-9-5-15Z" fill="#42784d"/><path d="M8 21c3-5 26-13 33-11 7 2 10 9 7 15-3 7-27 12-35 11-8-1-10-9-5-15Z" fill="#659e62"/><path d="M9 24c9-3 17-8 29-11m-27 17c10-2 20-6 27-8" fill="none" stroke="#96bf78" stroke-width="1.8" stroke-linecap="round"/><ellipse cx="44" cy="19" rx="6.5" ry="8.5" fill="#c5d796" transform="rotate(-11 44 19)"/><path d="m42 18 2 3 2-4" fill="none" stroke="#8ba66b" stroke-width="1.2" stroke-linecap="round"/>',
};

export function foodArt(id: string, fallback = '✦'): string {
  const drawing = foodShapes[id];
  if (!drawing) return `<span class="food-fallback" aria-hidden="true">${fallback}</span>`;
  return `<svg class="food-art" viewBox="0 0 56 48" aria-hidden="true"><ellipse cx="28" cy="42" rx="17" ry="3" fill="#101818" opacity=".26"/>${drawing}</svg>`;
}

export function heroArt(): string {
  const skewers = [
    {x: -44, foods: ['tomato', 'mushroom', 'broccoli', 'sausage']},
    {x: 12, foods: ['shrimp', 'corn', 'pepper', 'mushroom']},
    {x: 68, foods: ['sausage', 'onion', 'corn', 'shrimp']},
  ].map(({x, foods}) => `<g transform="translate(${x} 0)"><path d="M0 35v191" stroke="#84543b" stroke-width="7" stroke-linecap="round"/><path d="M0 34v189" stroke="#efbf81" stroke-width="3" stroke-linecap="round"/>${foods.map((food, i) => `<g transform="translate(-28 ${46 + i * 35}) rotate(${i % 2 === 0 ? -7 : 8} 28 24)">${foodShapes[food]}</g>`).join('')}</g>`).join('');
  return `<svg class="hero-art" viewBox="0 0 340 280" aria-hidden="true">
    <defs>
      <radialGradient id="art-ember"><stop stop-color="#ff9e59" stop-opacity=".55"/><stop offset="1" stop-color="#b75b42" stop-opacity="0"/></radialGradient>
      <linearGradient id="art-pan" x2="1" y2="1"><stop stop-color="#485049"/><stop offset="1" stop-color="#272f2b"/></linearGradient>
      <pattern id="art-grate" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M0 0v10" stroke="#667168" stroke-opacity=".46" stroke-width="2"/></pattern>
    </defs>
    <ellipse cx="183" cy="154" rx="155" ry="125" fill="url(#art-ember)"/>
    <g fill="none" stroke="#ed9b6e" opacity=".34" stroke-linecap="round"><path d="M109 48c-20-9-27-25-7-35m28 45c-20-8-16-19-11-27m116 21c13-9 20-25 7-39" stroke-width="2"/><path d="M257 47c9-3 13-10 11-18" stroke-width="1.5"/></g>
    <g fill="#f3ad73"><circle cx="81" cy="69" r="2"/><circle cx="254" cy="66" r="2.5"/><circle cx="68" cy="103" r="1.5"/><circle cx="282" cy="117" r="2"/><circle cx="98" cy="231" r="2"/><circle cx="246" cy="226" r="2"/></g>
    <g stroke="#f2ae7c" stroke-width="2" stroke-linecap="round"><path d="M74 145h14m-7-7v14m187-62h11m-5.5-5.5v11m-28 142h14m-7-7v14m-147-195h10m-5-5v10" opacity=".8"/></g>
    <g transform="translate(171 3) rotate(15)">
      <rect x="-89" y="63" width="199" height="184" rx="25" fill="#121b17" opacity=".5"/>
      <path d="M-85 128h-22c-15 0-15 32 0 32h22m190-32h22c15 0 15 32 0 32h-22" fill="none" stroke="#202e28" stroke-width="10"/>
      <rect x="-89" y="55" width="199" height="183" rx="23" fill="#182620" stroke="#737260" stroke-width="2"/>
      <rect x="-85" y="53" width="191" height="176" rx="21" fill="url(#art-pan)" stroke="#95907a" stroke-width="2"/>
      <rect x="-74" y="64" width="169" height="154" rx="15" fill="#27342e"/>
      <rect x="-74" y="64" width="169" height="154" rx="15" fill="url(#art-grate)"/>
      <path d="M-62 84H84M-62 195H84" stroke="#181f1b" stroke-width="2" opacity=".7"/>
      ${skewers}
    </g>
  </svg>`;
}
