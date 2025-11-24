import { _ as e, m as s, S as o, n as i, T as g } from './index-DA3ohzAm.js';
import { p } from './treemap-75Q7IDZK-DMPy7dTl.js';
var v = {
    parse: e(async (r) => {
      const a = await p('info', r);
      s.debug(a);
    }, 'parse'),
  },
  d = { version: g.version + '' },
  m = e(() => d.version, 'getVersion'),
  c = { getVersion: m },
  f = e((r, a, n) => {
    s.debug(
      `rendering info diagram
` + r
    );
    const t = o(a);
    (i(t, 100, 400, !0),
      t
        .append('g')
        .append('text')
        .attr('x', 100)
        .attr('y', 40)
        .attr('class', 'version')
        .attr('font-size', 32)
        .style('text-anchor', 'middle')
        .text(`v${n}`));
  }, 'draw'),
  l = { draw: f },
  S = { parser: v, db: c, renderer: l };
export { S as diagram };
