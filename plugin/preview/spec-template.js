/* Grill mock spec. Copy to <session dir>/preview.spec.js and fill in CONTROLS, BASE, renderScreen and route.
   Questions, options, patches and per-question mock fields live in session.json (references/session-format.md);
   this file only draws. A plain classic script: no imports, no build step, no framework. */

/* Shared control registry. A question's mock.controls lists the keys its bar shows; values must be in `items`. */
const CONTROLS = {
  auth: { label: 'Player', items: [['in', 'Signed in'], ['out', 'Signed out']], def: 'in' },
};

/* The app as it is now (for mock.page 'new': the parts already settled; leave undecided keys out). */
const BASE = { actions: 'none' };

/* Pure: decisions come in as d, control values as ctx (+ ctx.phone, ctx.q: the question number or null on Current
   design and Today). Returns the frame's <body> HTML. An undecided key is undefined: draw it as a grey
   `pv-undecided` block in its real spot. */
function renderScreen(d, ctx) {
  const acts = d.actions === undefined ? `<div class="pv-undecided">Q1 · not decided yet</div>`
    : d.actions === 'row' && ctx.auth === 'in' ? `<div class="acts"><span>✎ Rename</span><span>↗ Share</span><span>🗑 Trash</span></div>` : '';
  const cards = ['The Salt Road', 'Lanterns Over Vell', 'Ninth Floor', 'Low Tide'].map(t => `<div class="ex-card"><div class="cv"></div><div class="t">${t}</div>${acts}</div>`).join('');
  return `<div class="ex-page"><h1>Your stories</h1><div class="ex-grid">${cards}</div></div>`;
}

/* The frame label: route + the state shown. */
function route(d, ctx) {
  return `/stories${ctx.auth === 'out' ? ' · signed out' : ''}`;
}
