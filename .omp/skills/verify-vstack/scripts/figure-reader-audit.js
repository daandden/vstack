(() => {
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const canvas = document.createElement('canvas'), context = canvas.getContext('2d');
  canvas.width = canvas.height = 1;
  const rgb = paint => {
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = paint;
    context.fillRect(0, 0, 1, 1);
    return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3);
  };
  const near = (actual, expected) => actual.every((value, index) => Math.abs(value - expected[index]) <= 3);
  const theme = document.querySelector('button[aria-pressed="true"]')?.textContent?.trim();
  assert(theme === 'Light' || theme === 'Dark', 'Select Light or Dark explicitly before auditing');
  const colors = theme === 'Light'
    ? { cart: '#40a02b', stock: '#df8e1d', retry: '#d20f39', payment: '#1e66f5', reader: '#ea76cb', database: '#179299', service: '#fe640b', text: '#4c4f69', mauve: '#8839ef', base: '#eff1f5' }
    : { cart: '#a6e3a1', stock: '#f9e2af', retry: '#f38ba8', payment: '#89b4fa', reader: '#f5c2e7', database: '#94e2d5', service: '#fab387', text: '#cdd6f4', mauve: '#cba6f7', base: '#1e1e2e' };
  const diagrams = [];
  for (const host of document.querySelectorAll('.diagram[data-render="drawn"]')) {
    const root = host.shadowRoot;
    if (!root?.querySelector('[data-id="cart"]')) continue;
    const focused = host.getAttribute('aria-label') === 'Disposable seven-role source figure';
    const nodes = Object.entries(colors).filter(([id]) => !['text', 'mauve', 'base'].includes(id)).map(([id, accent]) => {
      const node = root.querySelector(`.pele-node[data-id="${id}"]`);
      assert(node, `Missing role node ${id}`);
      const shape = node.querySelector('rect,path,polygon,circle,ellipse'), text = node.querySelector('text');
      const style = getComputedStyle(shape), label = rgb(getComputedStyle(text).fill);
      const fill = rgb(style.fill), stroke = rgb(style.stroke), isFocus = focused && id === 'cart';
      assert(near(fill, rgb(accent)) && style.fillOpacity === '0.22', `${theme}/${id} lost its 22% role fill`);
      assert(near(stroke, rgb(isFocus ? colors.mauve : accent)), `${theme}/${id} has the wrong border`);
      assert(near(label, rgb(colors.text)), `${theme}/${id} lost ordinary label text`);
      if (isFocus) assert(style.strokeWidth === '2.5px', 'Focus border is not 2.5px');
      return { id, fill, fillOpacity: style.fillOpacity, stroke, strokeWidth: style.strokeWidth, label };
    });
    const edges = [...root.querySelectorAll('.pele-edge > path:first-child')].map(path => path.getAttribute('d'));
    assert(edges.length > 0 && edges.every(path => !/[Cc]/.test(path)), 'Reader lost step routing');
    const outlined = [...root.querySelectorAll('.pele-edge-label text, text.pele-cluster-label')].map(text => {
      const style = getComputedStyle(text);
      assert(style.paintOrder.split(' ')[0] === 'stroke' && near(rgb(style.stroke), rgb(colors.base)) && parseFloat(style.strokeWidth) > 0, 'Reader lost Base label outlines');
      return { text: text.textContent, stroke: rgb(style.stroke), width: style.strokeWidth, order: style.paintOrder };
    });
    assert(outlined.length >= 4, 'Missing edge or cluster labels');
    diagrams.push({ name: host.getAttribute('aria-label'), focused, nodes, edges, outlined, clientWidth: host.clientWidth, scrollWidth: host.scrollWidth });
  }
  assert(diagrams.length >= 2 && diagrams.some(diagram => !diagram.focused) && diagrams.some(diagram => diagram.focused), 'Expected both captured Mermaid and Document code diagrams');
  return { ok: true, theme, diagrams, pageOverflow: document.documentElement.scrollWidth > innerWidth };
})()
