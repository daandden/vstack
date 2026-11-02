(() => {
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const own = (section, id) => [...document.querySelectorAll(`#${section} [data-id]`)].filter(e => e.getAttribute('data-id') === id).flatMap(e => [...(e.matches('rect,path,text,circle,line,ellipse,polygon,polyline') ? [e] : e.querySelectorAll('rect,path,text,circle,line,ellipse,polygon,polyline'))].filter(n => n.closest('[data-id]') === e));
  const color = (e, property = 'fill') => getComputedStyle(e)[property];
  const shape = (s, id) => own(s, id).find(e => e.tagName !== 'text');
  const text = (s, id) => own(s, id).find(e => e.tagName === 'text');
  const mauve = 'rgb(203, 166, 247)', red = 'rgb(243, 139, 168)', green = 'rgb(166, 227, 161)', peach = 'rgb(250, 179, 135)', teal = 'rgb(148, 226, 213)';
  assert(color(shape('one', 'G')) === peach && color(shape('one', 'G'), 'stroke') === mauve, 'Group lost its fill or focus');
  assert(color(shape('two', 'G')) === red && color(shape('two', 'G'), 'stroke') === red, 'Group focus leaked to second figure');
  assert(color(shape('one', 'A')) === red && color(shape('two', 'A')) === green, 'Exact-key category or role leaked');
  assert(color(shape('one', 'B')) === teal && color(shape('one', 'B'), 'stroke') === teal, 'Group focus leaked to child');
  const sequence = own('sequence', 'A');
  assert(sequence.filter(e => e.tagName === 'rect').length === 2, 'Sequence lost header/footer ownership');
  assert(sequence.filter(e => e.tagName === 'text').every(e => color(e) === mauve), 'Participant multi-mark focus failed');
  assert(own('pie', 'Orders').filter(e => e.tagName !== 'text').every(e => color(e) === red), 'Pie slice and legend disagree with exact category key');
  const stops = [...document.querySelectorAll('#sankey-gradient stop')].map(e => getComputedStyle(e).stopColor);
  assert(JSON.stringify(stops) === JSON.stringify([green, red, green, teal, red, peach, teal, peach]), 'Gradient endpoint stops differ');
  const values = [...document.querySelectorAll('#sankey-source .pele-sankey-link')].map(e => color(e));
  assert(JSON.stringify(values) === JSON.stringify([green, green, red, teal]), 'Source mode endpoint paints differ');
  assert(JSON.stringify([...document.querySelectorAll('#sankey-target .pele-sankey-link')].map(e => color(e))) === JSON.stringify([red, teal, peach, peach]), 'Target mode endpoint paints differ');
  const keys = Array.from({ length: 150 }, (_, i) => `category-${i}`);
  const reference = keys.map(k => color(shape('keys-pie-0', k)));
  assert(new Set(reference).size === 13 && !reference.includes(mauve), 'Category pool lost an accent or includes Mauve');
  for (const family of ['pie', 'sankey', 'treemap']) for (let run = 0; run < 3; run++) assert(JSON.stringify(keys.map(k => color(shape(`keys-${family}-${run}`, k)))) === JSON.stringify(reference), `${family}/${run} changed exact-key colors`);
  const box = id => shape('readability', id).getBBox();
  assert(box('Wide').width === box('Narrow').width, 'Fixed-cell W/i widths differ');
  assert(box('Combined').width === box('Precomposed').width && box('Combined').width === box('Latin').width, 'Grapheme boxes differ');
  assert(box('Sub').width < box('Plain').width && box('Sup').width === box('Sub').width, 'Script geometry failed');
  assert(box('Wrap').height > box('Small').height, 'Smaller formatted label did not wrap to fewer lines');
  const scripts = [...document.querySelectorAll('#readability tspan[baseline-shift]')].map(e => getComputedStyle(e).fontSize);
  assert(scripts.length > 0 && scripts.every(size => size === '12px'), 'Explicit 75% script sizing changed');
  const loose = document.querySelector('#one .pele-edge-label text');
  assert(getComputedStyle(loose).paintOrder.split(' ')[0] === 'stroke' && getComputedStyle(loose).stroke === 'rgb(30, 30, 46)', 'Loose-label outline failed');
  const second = document.querySelector('#two .pele-edge-label text');
  const before = getComputedStyle(second).strokeWidth;
  const firstStyle = document.querySelector('#one style'), next = firstStyle.nextSibling, owner = firstStyle.parentNode;
  firstStyle.remove();
  try { assert(getComputedStyle(second).strokeWidth === before, 'Outline depends on sibling style'); }
  finally { owner.insertBefore(firstStyle, next); }
  const hex = ['1e1e2e','181825','11111b','313244','45475a','585b70','6c7086','7f849c','9399b2','a6adc8','bac2de','cdd6f4','f5e0dc','f2cdcd','f5c2e7','f38ba8','eba0ac','fab387','f9e2af','a6e3a1','94e2d5','89dceb','74c7ec','89b4fa','b4befe','cba6f7'];
  const palette = new Set(hex.map(h => `rgb(${parseInt(h.slice(0,2),16)}, ${parseInt(h.slice(2,4),16)}, ${parseInt(h.slice(4,6),16)})`));
  let paints = 0;
  for (const section of document.querySelectorAll('section')) {
    if (section.id === 'before-9a3a54b') continue;
    for (const element of section.querySelectorAll('svg rect,svg path,svg circle,svg ellipse,svg polygon,svg polyline,svg line,svg text,svg stop')) {
      const style = getComputedStyle(element);
      for (const property of element.tagName === 'stop' ? ['stopColor'] : ['fill', 'stroke']) {
        const paint = style[property];
        if (paint === 'none' || paint.startsWith('url(')) continue;
        assert(palette.has(paint), `${section.id}/${element.tagName}/${property} non-Mocha paint ${paint}`);
        paints++;
      }
    }
  }
  return { ok: true, paints, scripts, stops, categories: new Set(reference).size, font: getComputedStyle(text('readability', 'Plain')).fontFamily, checks: ['group and figure isolation', 'multi-mark ownership', 'native Sankey modes', 'category reorder/insertion/process/family stability', '13 accents and collisions', 'geometry and 75% sizing', 'outline independence', 'computed Mocha paints'] };
})()
