export const MASK_TYPES = ['horizontal', 'vertical', 'checker', 'peephole', 'diagonal', 'blocks'];
export const MASK_LABELS = { horizontal:'横帯', vertical:'縦帯', checker:'市松', peephole:'のぞき穴', diagonal:'斜め', blocks:'ランダムブロック' };
// Generate geometry once per draw. Rendering uses only this saved geometry.
export function createMask(previousType, random = Math.random) {
  const types = MASK_TYPES.filter(type => type !== previousType);
  const type = types[Math.floor(random() * types.length)];
  const coverage = .4 + random() * .2;
  const phase = random(), direction = random() < .5 ? -1 : 1;
  const frequency = 2 + Math.floor(random() * 3);
  if (type === 'peephole') {
    const radius = Math.sqrt((1 - coverage) / Math.PI) * 100;
    return { type, coverage, radius, cx: radius + random() * (100 - 2 * radius), cy: radius + random() * (100 - 2 * radius) };
  }
  const size = type === 'blocks' || type === 'checker' ? 10 : 32;
  const phaseY = random();
  const cells = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let value;
    if (type === 'horizontal') value = Math.sin(((y + .5) / size * frequency + phase) * Math.PI * 2);
    if (type === 'vertical') value = Math.sin(((x + .5) / size * frequency + phase) * Math.PI * 2);
    if (type === 'diagonal') value = Math.sin((((x + .5 + direction * (y + .5)) / size) * frequency + phase) * Math.PI * 2);
    if (type === 'checker') value = (Math.floor(x / 2 + phase * 2) + Math.floor(y / 2 + phaseY * 2)) % 2 + random() * .05;
    if (type === 'blocks') value = random();
    cells.push({ x, y, value });
  }
  const hidden = cells.sort((a, b) => a.value - b.value).slice(0, Math.round(size * size * coverage)).map(({x,y}) => [x,y]);
  return { type, coverage: hidden.length / size ** 2, size, phase, phaseY, direction, frequency, hidden };
}
export function maskSvg(mask) {
  let d;
  if (mask.type === 'peephole') {
    const { radius:r, cx, cy } = mask;
    d = `M0 0H100V100H0Z M${cx-r} ${cy}a${r} ${r} 0 1 0 ${2*r} 0a${r} ${r} 0 1 0 ${-2*r} 0Z`;
  } else {
    const step = 100 / mask.size;
    d = mask.hidden.map(([x,y]) => `M${x*step} ${y*step}h${step}v${step}h${-step}Z`).join(' ');
  }
  return `<svg class="hide-mask" viewBox="0 0 100 100" aria-hidden="true" data-mask-type="${mask.type}"><path fill-rule="evenodd" d="${d}"/></svg>`;
}
