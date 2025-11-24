import { p as U } from './chunk-ANTBXLJU-ZYRP95VF.js';
import {
  ai as S,
  ad as z,
  aX as X,
  _ as p,
  h as Q,
  e as Z,
  i as q,
  j as H,
  B as J,
  A as K,
  m as F,
  k as Y,
  O as ee,
  S as te,
  X as ae,
  n as re,
  G as ne,
  Q as ie,
} from './index-DA3ohzAm.js';
import { p as se } from './treemap-75Q7IDZK-DMPy7dTl.js';
import { d as I } from './arc-BLRzZSZJ.js';
import { o as le } from './ordinal-Cboi1Yqb.js';
import './init-Gi6I4Gst.js';
function oe(e, a) {
  return a < e ? -1 : a > e ? 1 : a >= e ? 0 : NaN;
}
function ce(e) {
  return e;
}
function ue() {
  var e = ce,
    a = oe,
    f = null,
    x = S(0),
    s = S(z),
    o = S(0);
  function l(t) {
    var n,
      c = (t = X(t)).length,
      g,
      y,
      m = 0,
      u = new Array(c),
      i = new Array(c),
      v = +x.apply(this, arguments),
      A = Math.min(z, Math.max(-z, s.apply(this, arguments) - v)),
      h,
      C = Math.min(Math.abs(A) / c, o.apply(this, arguments)),
      $ = C * (A < 0 ? -1 : 1),
      d;
    for (n = 0; n < c; ++n) (d = i[(u[n] = n)] = +e(t[n], n, t)) > 0 && (m += d);
    for (
      a != null
        ? u.sort(function (w, D) {
            return a(i[w], i[D]);
          })
        : f != null &&
          u.sort(function (w, D) {
            return f(t[w], t[D]);
          }),
        n = 0,
        y = m ? (A - c * $) / m : 0;
      n < c;
      ++n, v = h
    )
      ((g = u[n]),
        (d = i[g]),
        (h = v + (d > 0 ? d * y : 0) + $),
        (i[g] = { data: t[g], index: n, value: d, startAngle: v, endAngle: h, padAngle: C }));
    return i;
  }
  return (
    (l.value = function (t) {
      return arguments.length ? ((e = typeof t == 'function' ? t : S(+t)), l) : e;
    }),
    (l.sortValues = function (t) {
      return arguments.length ? ((a = t), (f = null), l) : a;
    }),
    (l.sort = function (t) {
      return arguments.length ? ((f = t), (a = null), l) : f;
    }),
    (l.startAngle = function (t) {
      return arguments.length ? ((x = typeof t == 'function' ? t : S(+t)), l) : x;
    }),
    (l.endAngle = function (t) {
      return arguments.length ? ((s = typeof t == 'function' ? t : S(+t)), l) : s;
    }),
    (l.padAngle = function (t) {
      return arguments.length ? ((o = typeof t == 'function' ? t : S(+t)), l) : o;
    }),
    l
  );
}
var pe = ie.pie,
  G = { sections: new Map(), showData: !1 },
  T = G.sections,
  N = G.showData,
  ge = structuredClone(pe),
  de = p(() => structuredClone(ge), 'getConfig'),
  fe = p(() => {
    ((T = new Map()), (N = G.showData), ne());
  }, 'clear'),
  he = p(({ label: e, value: a }) => {
    if (a < 0)
      throw new Error(
        `"${e}" has invalid value: ${a}. Negative values are not allowed in pie charts. All slice values must be >= 0.`
      );
    T.has(e) || (T.set(e, a), F.debug(`added new section: ${e}, with value: ${a}`));
  }, 'addSection'),
  me = p(() => T, 'getSections'),
  ve = p((e) => {
    N = e;
  }, 'setShowData'),
  Se = p(() => N, 'getShowData'),
  L = {
    getConfig: de,
    clear: fe,
    setDiagramTitle: K,
    getDiagramTitle: J,
    setAccTitle: H,
    getAccTitle: q,
    setAccDescription: Z,
    getAccDescription: Q,
    addSection: he,
    getSections: me,
    setShowData: ve,
    getShowData: Se,
  },
  xe = p((e, a) => {
    (U(e, a), a.setShowData(e.showData), e.sections.map(a.addSection));
  }, 'populateDb'),
  ye = {
    parse: p(async (e) => {
      const a = await se('pie', e);
      (F.debug(a), xe(a, L));
    }, 'parse'),
  },
  Ae = p(
    (e) => `
  .pieCircle{
    stroke: ${e.pieStrokeColor};
    stroke-width : ${e.pieStrokeWidth};
    opacity : ${e.pieOpacity};
  }
  .pieOuterCircle{
    stroke: ${e.pieOuterStrokeColor};
    stroke-width: ${e.pieOuterStrokeWidth};
    fill: none;
  }
  .pieTitleText {
    text-anchor: middle;
    font-size: ${e.pieTitleTextSize};
    fill: ${e.pieTitleTextColor};
    font-family: ${e.fontFamily};
  }
  .slice {
    font-family: ${e.fontFamily};
    fill: ${e.pieSectionTextColor};
    font-size:${e.pieSectionTextSize};
    // fill: white;
  }
  .legend text {
    fill: ${e.pieLegendTextColor};
    font-family: ${e.fontFamily};
    font-size: ${e.pieLegendTextSize};
  }
`,
    'getStyles'
  ),
  we = Ae,
  De = p((e) => {
    const a = [...e.values()].reduce((s, o) => s + o, 0),
      f = [...e.entries()]
        .map(([s, o]) => ({ label: s, value: o }))
        .filter((s) => (s.value / a) * 100 >= 1)
        .sort((s, o) => o.value - s.value);
    return ue().value((s) => s.value)(f);
  }, 'createPieArcs'),
  Ce = p((e, a, f, x) => {
    F.debug(
      `rendering pie chart
` + e
    );
    const s = x.db,
      o = Y(),
      l = ee(s.getConfig(), o.pie),
      t = 40,
      n = 18,
      c = 4,
      g = 450,
      y = g,
      m = te(a),
      u = m.append('g');
    u.attr('transform', 'translate(' + y / 2 + ',' + g / 2 + ')');
    const { themeVariables: i } = o;
    let [v] = ae(i.pieOuterStrokeWidth);
    v ?? (v = 2);
    const A = l.textPosition,
      h = Math.min(y, g) / 2 - t,
      C = I().innerRadius(0).outerRadius(h),
      $ = I()
        .innerRadius(h * A)
        .outerRadius(h * A);
    u.append('circle')
      .attr('cx', 0)
      .attr('cy', 0)
      .attr('r', h + v / 2)
      .attr('class', 'pieOuterCircle');
    const d = s.getSections(),
      w = De(d),
      D = [
        i.pie1,
        i.pie2,
        i.pie3,
        i.pie4,
        i.pie5,
        i.pie6,
        i.pie7,
        i.pie8,
        i.pie9,
        i.pie10,
        i.pie11,
        i.pie12,
      ];
    let k = 0;
    d.forEach((r) => {
      k += r;
    });
    const O = w.filter((r) => ((r.data.value / k) * 100).toFixed(0) !== '0'),
      E = le(D);
    (u
      .selectAll('mySlices')
      .data(O)
      .enter()
      .append('path')
      .attr('d', C)
      .attr('fill', (r) => E(r.data.label))
      .attr('class', 'pieCircle'),
      u
        .selectAll('mySlices')
        .data(O)
        .enter()
        .append('text')
        .text((r) => ((r.data.value / k) * 100).toFixed(0) + '%')
        .attr('transform', (r) => 'translate(' + $.centroid(r) + ')')
        .style('text-anchor', 'middle')
        .attr('class', 'slice'),
      u
        .append('text')
        .text(s.getDiagramTitle())
        .attr('x', 0)
        .attr('y', -400 / 2)
        .attr('class', 'pieTitleText'));
    const W = [...d.entries()].map(([r, M]) => ({ label: r, value: M })),
      b = u
        .selectAll('.legend')
        .data(W)
        .enter()
        .append('g')
        .attr('class', 'legend')
        .attr('transform', (r, M) => {
          const R = n + c,
            B = (R * W.length) / 2,
            V = 12 * n,
            j = M * R - B;
          return 'translate(' + V + ',' + j + ')';
        });
    (b
      .append('rect')
      .attr('width', n)
      .attr('height', n)
      .style('fill', (r) => E(r.label))
      .style('stroke', (r) => E(r.label)),
      b
        .append('text')
        .attr('x', n + c)
        .attr('y', n - c)
        .text((r) => (s.getShowData() ? `${r.label} [${r.value}]` : r.label)));
    const _ = Math.max(
        ...b
          .selectAll('text')
          .nodes()
          .map((r) => (r == null ? void 0 : r.getBoundingClientRect().width) ?? 0)
      ),
      P = y + t + n + c + _;
    (m.attr('viewBox', `0 0 ${P} ${g}`), re(m, g, P, l.useMaxWidth));
  }, 'draw'),
  $e = { draw: Ce },
  Fe = { parser: ye, db: L, renderer: $e, styles: we };
export { Fe as diagram };
