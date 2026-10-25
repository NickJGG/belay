/* Grill preview shell v1: shared plumbing. Never edited or copied per doc; a breaking change becomes v2.
   Reads DOC, CONTROLS, BASE, QUESTIONS and renderScreen from the session's preview.spec.js.
   Mocks render in srcdoc iframes (links resolve against preview.html), so the app's media queries,
   viewport units and fixed positioning see the frame, not the window. */
window.__previewShell = 1;

document.body.insertAdjacentHTML('afterbegin', '<div class="pv-shell"><nav class="pv-toc" id="pv-toc"></nav><main class="pv-doc" id="pv-doc"></main></div>');

const KEY = `grill-preview:${DOC.slug}`;
const THEME_KEY = 'grill-preview-theme';

const SECTIONS = [
  { id: 'current', kind: 'current', title: 'Current design', controls: DOC.currentControls },
  ...(DOC.page === 'existing' ? [{ id: 'today', kind: 'today', title: 'Today', controls: DOC.currentControls }] : []),
  ...QUESTIONS.map(q => ({ id: q.id, kind: 'q', title: `Q${q.n} · ${q.title}`, controls: q.controls || [], q })),
];
const secById = id => SECTIONS.find(s => s.id === id);

function defaults(s) {
  const ctl = {};
  for (const k of s.controls) ctl[k] = CONTROLS[k].def;
  return { opt: s.q ? (s.q.picked || s.q.rec) : null, ctl: { ...ctl, ...((s.q && s.q.starts) || {}) }, view: 'desktop' };
}
function validate(s, st) {
  const d = defaults(s);
  if (!st || typeof st !== 'object') return d;
  const out = { opt: d.opt, ctl: { ...d.ctl }, view: st.view === 'phone' ? 'phone' : 'desktop' };
  if (s.q && (st.opt === 'before' || st.opt in s.q.opts)) out.opt = st.opt;
  for (const k of s.controls) if (st.ctl && CONTROLS[k].items.some(([v]) => String(v) === String(st.ctl[k]))) out.ctl[k] = st.ctl[k];
  return out;
}

let S = { secs: {}, y: 0 };
try { S = JSON.parse(sessionStorage.getItem(KEY)) || S; } catch {}
for (const s of SECTIONS) S.secs[s.id] = validate(s, S.secs && S.secs[s.id]);
function save() { try { sessionStorage.setItem(KEY, JSON.stringify({ secs: S.secs, y: scrollY })); } catch {} }

let themePref = 'system';
try { themePref = localStorage.getItem(THEME_KEY) || 'system'; } catch {}
const osDark = matchMedia('(prefers-color-scheme: dark)');
const themeNow = () => themePref === 'system' ? (osDark.matches ? 'dark' : 'light') : themePref;
function applyTheme() {
  const t = themeNow();
  document.documentElement.dataset.theme = t;
  document.documentElement.classList.toggle('dark', t === 'dark');
}
applyTheme();
osDark.addEventListener('change', () => { if (themePref === 'system') { applyTheme(); renderAll(); } });

/* 'before' is the shell-made option: the question's region without its own patch. */
function decisionsFor(s, st) {
  if (s.kind === 'today') return { ...BASE };
  const d = { ...BASE };
  for (const q of QUESTIONS) if (q.picked && (s.kind === 'current' || q.id !== s.id)) Object.assign(d, q.opts[q.picked].patch);
  if (s.kind === 'q') Object.assign(d, s.q.requires || {}, st.opt === 'before' ? {} : s.q.opts[st.opt].patch);
  return d;
}
function ctxFor(s, st, phone) { return { ...st.ctl, ...((s.q && s.q.fixed) || {}), phone }; }
function screenHTML(s, st, phone) {
  const d = decisionsFor(s, st), ctx = ctxFor(s, st, phone);
  return (s.q && s.q.render ? s.q.render : renderScreen)(d, ctx);
}

const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const attr = t => esc(t).replace(/"/g, '&quot;');
function statusOf(q) {
  if (q.picked) return { text: `✓ ${q.picked} · ${q.opts[q.picked].label}`, cls: 'picked' };
  if (q.status === 'deferred' || q.status === 'dropped') return { text: q.status, cls: q.status };
  if (q.status && q.status.see) return { text: `↪ see Q${q.status.see}`, cls: 'see', see: q.status.see };
  return { text: 'open', cls: '' };
}
function seg(sec, k, items, cur) {
  return `<span class="pv-seg">${items.map(([v, l]) => `<button data-sec="${sec}" data-k="${k}" data-v="${v}" class="${String(cur) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</span>`;
}

function sectionInner(s) {
  const st = S.secs[s.id], q = s.q;
  let h = `<h2>${esc(s.title)}`;
  if (q) {
    const so = statusOf(q);
    const target = so.see && QUESTIONS.find(x => x.n === so.see);
    h += target ? `<a class="pv-chip see" href="#${target.id}">${so.text}</a>` : `<span class="pv-chip ${so.cls}">${so.text}</span>`;
  }
  h += `</h2>`;
  const note = q ? q.note : s.kind === 'current'
    ? `Every decision you’ve made so far, combined. Nothing proposed: a part whose question is still open is drawn as it ${DOC.page === 'existing' ? 'looks before this session' : 'will sit, as a labelled grey block'}.`
    : 'The page as it was before this session. This never changes.';
  h += `<p class="pv-note">${note}</p>`;
  if (q && q.answer) h += `<p class="pv-answer"><b>Your answer:</b> ${q.answer}</p>`;
  h += `<div class="pv-bar">`;
  if (q) {
    const btn = (k, o, root) => `<button class="pv-opt ${st.opt === k ? 'on' : ''} ${o.out ? 'out' : ''} ${root && k !== root ? 'kid' : ''}" data-sec="${s.id}" data-k="opt" data-v="${k}">${k} · ${esc(o.label)}`
      + (root && o.from && o.from !== root ? `<span class="pv-from">from ${esc(o.from)}</span>` : '')
      + (k === q.rec ? '<span class="pv-tag">My rec</span>' : '')
      + (k === q.picked ? '<span class="pv-tag picked">✓ Picked</span>' : '')
      + (o.yours ? '<span class="pv-tag yours">Yours</span>' : '')
      + (o.current ? '<span class="pv-tag current">Current</span>' : '')
      + `</button>`;
    /* Variants (opts with `from`) group after their root and only open while the root or one of them is selected. */
    const rootOf = k => { let r = k; for (let i = 0; q.opts[r] && q.opts[r].from && q.opts[q.opts[r].from] && i < 20; i++) r = q.opts[r].from; return r; };
    const keys = Object.keys(q.opts), tops = keys.filter(k => rootOf(k) === k);
    const opts = tops.map(t => {
      const kids = keys.filter(k => k !== t && rootOf(k) === t);
      if (!kids.length) return btn(t, q.opts[t]);
      const open = st.opt === t || kids.includes(st.opt);
      return `<span class="pv-fam"><span class="pv-fam-lbl">${esc(t)} · variants</span>${btn(t, q.opts[t], t)}`
        + (open ? kids.map(k => btn(k, q.opts[k], t)).join('') : `<span class="pv-fam-count">+${kids.length}</span>`) + `</span>`;
    }).join('');
    h += `<div class="pv-opts${tops.length < keys.length ? ' has-fam' : ''}"><button class="pv-opt before ${st.opt === 'before' ? 'on' : ''}" data-sec="${s.id}" data-k="opt" data-v="before">Before</button>${opts}</div>`;
  }
  h += `<div class="pv-row">`;
  for (const k of s.controls) h += `<span><span class="pv-lbl">${CONTROLS[k].label}</span>${seg(s.id, k, CONTROLS[k].items, st.ctl[k])}</span>`;
  h += `<span><span class="pv-lbl">View</span>${seg(s.id, 'view', [['desktop', 'Desktop'], ['phone', 'Phone']], st.view)}</span></div>`;
  if (q) h += `<p class="pv-expl">${st.opt === 'before'
    ? '<b>Before.</b> This question’s region without its change: your other picks, but not this one.'
    : `<b>${st.opt}.</b> ${q.opts[st.opt].from ? `<span class="pv-from">from ${esc(q.opts[st.opt].from)}</span> ` : ''}${q.opts[st.opt].expl}`}</p>`;
  h += `</div>`;
  const d = decisionsFor(s, st), ctx = ctxFor(s, st, st.view === 'phone');
  const route = ((q && q.route) || DOC.route)(d, ctx);
  if (st.view === 'phone') {
    h += `<div class="pv-frame phone"><div class="pv-route">${esc(route)} · 390px</div><div class="pv-body"><iframe class="pv-mock" data-sec="${s.id}" data-phone="1"></iframe></div></div>`;
  } else {
    const screen = (q && q.screen) || DOC.screen;
    h += `<div class="pv-frame"><div class="pv-route">${esc(route)}</div><div class="pv-fit" data-screen="${screen}"><iframe class="pv-mock" data-sec="${s.id}" data-phone="0"></iframe></div></div>`;
  }
  return h;
}

/* Injected before the app's CSS so the app can override it. .pv-undecided is drawn inside mocks, so it lives here. */
const FRAME_CSS = `html, body { margin: 0; } html { background: var(--paper, Canvas); color-scheme: light; } :root[data-theme="dark"] { color-scheme: dark; }
.pv-undecided { display: grid; place-items: center; min-height: 80px; border: 2px dashed var(--faint, #9a948a); border-radius: 10px; background: var(--wash, #f2f0ea); color: var(--muted, #6b665c); font: 600 13px system-ui, -apple-system, "Segoe UI", sans-serif; }`;
function frameDoc(s, st, phone) {
  const t = themeNow();
  const links = [...(DOC.fonts || []), ...(DOC.appCss ? ['preview.app.css'] : []), 'preview.mock.css']
    .map(href => `<link rel="stylesheet" href="${attr(href)}">`).join('');
  return `<!doctype html><html lang="en" data-theme="${t}"${t === 'dark' ? ' class="dark"' : ''}><head><meta charset="utf-8"><style>${FRAME_CSS}</style>${links}</head><body>${screenHTML(s, st, phone)}</body></html>`;
}

/* Desktop: the frame is max(DOC.floor, column) wide, scaled down from outside below the floor (never above 1).
   Height: 'shell' fills the window under the sticky bar and scrolls inside; 'page' is the frame's content height,
   measured from a short frame so it can shrink as well as grow. Before measuring, 'page' keeps the wrapper's height. */
function sizeFrame(f, measure) {
  if (f.dataset.phone === '1') return;
  const wrap = f.parentNode, cw = wrap.clientWidth;
  const W = Math.max(DOC.floor, cw), k = cw / W;
  f.style.width = W + 'px';
  f.style.transform = k < 1 ? `scale(${k})` : '';
  let h = 0;
  if (wrap.dataset.screen !== 'shell') {
    if (!measure) { f.style.height = parseFloat(getComputedStyle(wrap).height) / k + 'px'; return; }
    try { f.style.height = '150px'; h = f.contentDocument.documentElement.scrollHeight; } catch {}
  }
  if (!h) {
    const bar = wrap.closest('.pv-sec').querySelector('.pv-bar');
    h = Math.max(360, innerHeight - (bar ? bar.offsetHeight : 0) - 56) / k;
  }
  f.style.height = h + 'px';
  wrap.style.height = h * k + 'px';
}

const domPath = (n, root) => { const p = []; while (n !== root) { p.unshift([...n.parentNode.children].indexOf(n)); n = n.parentNode; } return p; };
const fromPath = (p, root) => p.reduce((n, i) => n && n.children[i], root);
function frameScroll(f) {
  try {
    const cd = f.contentDocument, root = cd.documentElement;
    return [...cd.querySelectorAll('*')].filter(n => n.scrollTop || n.scrollLeft).map(n => [domPath(n, root), n.scrollTop, n.scrollLeft]);
  } catch { return []; }
}

function mountFrames(root, keep) {
  return Promise.all([...root.querySelectorAll('iframe.pv-mock')].map(f => new Promise(done => {
    const s = secById(f.dataset.sec);
    f.addEventListener('load', () => {
      sizeFrame(f, true);
      try {
        const de = f.contentDocument.documentElement;
        for (const [p, t, l] of (keep && keep[f.dataset.sec + f.dataset.phone]) || []) { const n = fromPath(p, de); if (n) { n.scrollTop = t; n.scrollLeft = l; } }
        f.contentDocument.fonts.ready.then(() => sizeFrame(f, true));
      } catch {}
      done();
    }, { once: true });
    sizeFrame(f, false);
    f.srcdoc = frameDoc(s, S.secs[s.id], f.dataset.phone === '1');
  })));
}

/* Replace el's contents, keeping the page's scroll, each surviving frame's inner scroll, and its height until re-measured. */
function rerender(el, html) {
  const y = scrollY, keep = {}, heights = {};
  el.querySelectorAll('iframe.pv-mock').forEach(f => {
    const id = f.dataset.sec + f.dataset.phone;
    keep[id] = frameScroll(f);
    if (f.dataset.phone === '0') heights[id] = f.parentNode.style.height;
  });
  el.innerHTML = html;
  el.querySelectorAll('iframe.pv-mock').forEach(f => { const h = heights[f.dataset.sec + f.dataset.phone]; if (h) f.parentNode.style.height = h; });
  scrollTo(0, y);
  return mountFrames(el, keep).then(() => scrollTo(0, y));
}

function renderToc() {
  document.getElementById('pv-toc').innerHTML = `<h4>Grill session</h4><div class="pv-slug">${esc(DOC.slug)}</div>`
    + SECTIONS.map(s => {
      const so = s.q && statusOf(s.q);
      return `<a href="#${s.id}" data-id="${s.id}" class="${so && so.cls === 'dropped' ? 'dropped' : ''}">${s.q ? `Q${s.q.n} · ${esc(s.q.short || s.q.title)}` : s.title}${so ? `<small>${so.text}</small>` : ''}</a>`;
    }).join('')
    + `<div class="pv-theme">${seg('_', 'theme', [['light', 'Light'], ['dark', 'Dark'], ['system', 'System']], themePref)}</div>`;
  spy();
}

function renderAll() {
  const p = rerender(document.getElementById('pv-doc'), SECTIONS.map(s => `<section class="pv-sec" id="${s.id}">${sectionInner(s)}</section>`).join(''));
  renderToc();
  return p;
}

function renderSection(id) {
  const p = rerender(document.getElementById(id), sectionInner(secById(id)));
  renderToc();
  return p;
}

document.addEventListener('click', e => {
  const b = e.target.closest('[data-k]');
  if (!b) return;
  const { sec, k, v } = b.dataset;
  if (k === 'theme') {
    themePref = v;
    try { localStorage.setItem(THEME_KEY, v); } catch {}
    applyTheme();
    renderAll();
    return;
  }
  const st = S.secs[sec];
  if (k === 'opt') st.opt = v;
  else if (k === 'view') st.view = v;
  else st.ctl[k] = v;
  save();
  renderSection(sec);
});

function spy() {
  const secs = [...document.querySelectorAll('.pv-sec')];
  let cur = secs[0];
  for (const s of secs) if (s.getBoundingClientRect().top <= innerHeight / 3) cur = s;
  if (innerHeight + scrollY >= document.documentElement.scrollHeight - 2) cur = secs[secs.length - 1];
  document.querySelectorAll('.pv-toc a').forEach(a => a.classList.toggle('on', !!cur && a.dataset.id === cur.id));
}
addEventListener('scroll', spy, { passive: true });
addEventListener('resize', () => document.querySelectorAll('iframe.pv-mock').forEach(f => sizeFrame(f, true)));
addEventListener('beforeunload', save);

renderAll().then(() => { if (S.y) scrollTo(0, S.y); spy(); });

/* Live reload: poll preview.version.js (fetch is blocked on file://). The baseline comes from the copy loaded in <head>,
   so an edit made while the page was still loading isn't missed; without one, the first successful poll sets it. */
{
  let ver = window.__previewVersion ?? null;
  setInterval(() => {
    const sc = document.createElement('script');
    sc.src = `preview.version.js?t=${Date.now()}`;
    sc.onload = () => {
      sc.remove();
      const v = window.__previewVersion;
      if (ver === null) ver = v;
      else if (v !== ver) { save(); location.reload(); }
    };
    sc.onerror = () => sc.remove();
    document.head.appendChild(sc);
  }, 1000);
}
