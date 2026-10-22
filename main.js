/* ============================================================
   One request, nine hops. Scroll position is the request's progress:
   the packet travels the topology, the path lights behind it, and the
   trace log prints each hop as its chapter reaches mid-screen.
   No libraries, no RAF loop at rest — work happens only on scroll.
   ============================================================ */

/* Public profile links. Leave a value empty to hide it. */
const LINKS = {
  github: "https://github.com/yepsamii",
  linkedin: "https://www.linkedin.com/in/yepsami/",
};

const HOPS = [
  { id: "client",  name: "client",       c: "--blue",   log: ["GET", "/abdur-rahman", "→"] },
  { id: "gateway", name: "api-gateway",  c: "--blue",   log: ["gw", "route /summary", "ok"] },
  { id: "auth",    name: "auth · jwt",   c: "--blue",   log: ["auth", "role=software-engineer", "ok"] },
  { id: "cache",   name: "redis",        c: "--yellow", log: ["redis", "GET skills:*", "HIT", "hit"] },
  { id: "courses", name: "course-svc",   c: "--blue",   log: ["pg", "SELECT course_v3", "ok"] },
  { id: "deploy",  name: "k8s · argocd", c: "--blue",   log: ["k8s", "argocd sync", "synced"] },
  { id: "sentry",  name: "sentry",       c: "--red",    log: ["sentry", "issue captured → fixed", "ERR", "err"] },
  { id: "puku",    name: "puku-desktop", c: "--blue",   log: ["puku", "code-tab", "wip"] },
  { id: "response",name: "200 ok",       c: "--green",  log: ["200", "body=awards,edu,contact", "OK", "ok"] },
];

/* Two topologies: a vertical zig-zag for the desktop column, a strip for mobile. */
const TALL = { vb: "0 0 320 560", pts: [[40,30],[160,80],[280,140],[160,205],[40,270],[160,335],[280,400],[160,465],[40,530]] };
const WIDE = { vb: "0 0 360 40",  pts: HOPS.map((_, i) => [14 + i * 41, 20]) };

const SVGNS = "http://www.w3.org/2000/svg";
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)");
const DESKTOP = matchMedia("(min-width: 60rem)");

const mapEl = document.querySelector("[data-map]");
const logEl = document.querySelector("[data-log]");
const sections = [...document.querySelectorAll("[data-hop]")];

document.documentElement.classList.add("js");

/* ---------- build the map ---------- */
let geo = null;   // { pts, cum, total, nodes, packet, halo, lit }

function el(tag, attrs = {}) {
  const n = document.createElementNS(SVGNS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
}

function buildMap() {
  const layout = DESKTOP.matches ? TALL : WIDE;
  const { pts } = layout;
  const svg = el("svg", { viewBox: layout.vb, preserveAspectRatio: "xMidYMid meet", role: "presentation" });
  const d = "M" + pts.map((p) => p.join(",")).join(" L");

  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  const total = cum[cum.length - 1];

  svg.append(el("path", { d, class: "map-path" }));
  const lit = el("path", { d, class: "map-path map-path--lit", "stroke-dasharray": total, "stroke-dashoffset": total });
  svg.append(lit);

  const r = DESKTOP.matches ? 7 : 5;
  const nodes = HOPS.map((h, i) => {
    const [x, y] = pts[i];
    const g = el("g", { class: "node", style: `--c: var(${h.c})` });
    const a = el("a", { href: `#hop-${h.id}`, "aria-label": `${String(i).padStart(2, "0")} ${h.name}` });
    a.append(el("circle", { class: "hit", cx: x, cy: y, r: 20 }));
    a.append(el("circle", { class: "ring", cx: x, cy: y, r }));
    if (DESKTOP.matches) {
      const right = x < 200;
      const t = el("text", { x: right ? x + 16 : x - 16, y: y + 4, "text-anchor": right ? "start" : "end" });
      t.textContent = `${String(i).padStart(2, "0")} ${h.name}`;
      a.append(t);
    }
    g.append(a);
    svg.append(g);
    return g;
  });

  const halo = el("circle", { class: "packet-halo", r: r + 6, cx: 0, cy: 0 });
  const packet = el("circle", { class: "packet", r: r - 2, cx: 0, cy: 0 });
  svg.append(halo, packet);

  mapEl.replaceChildren(svg);
  geo = { pts, cum, total, nodes, packet, halo, lit };
}

/* ---------- trace log ---------- */
let shown = -1;

function renderLog(active) {
  if (active === shown) return;
  const grew = active > shown;
  logEl.replaceChildren(...HOPS.slice(0, active + 1).map((h, i) => {
    const [svc, msg, status, tone] = h.log;
    const li = document.createElement("li");
    if (grew && i > shown) li.className = "is-new";
    li.innerHTML = `<span>${svc}</span><span>${msg}</span><span class="${tone ?? "ms"}">${status}</span>`;
    return li;
  }));
  shown = active;
}

/* ---------- scroll → progress ---------- */
let tops = [];
let maxScroll = 0;

function measure() {
  const y = scrollY;
  tops = sections.map((s) => s.getBoundingClientRect().top + y);
  tops[0] = innerHeight * 0.5;                     // progress 0 at the very top
  maxScroll = document.documentElement.scrollHeight - innerHeight;
}

function progress() {
  const last = HOPS.length - 1;
  if (scrollY >= maxScroll - 2) return last;
  const probe = scrollY + innerHeight * 0.5;
  for (let i = last; i >= 0; i--) {
    if (probe >= tops[i]) {
      if (i === last) return last;
      return i + Math.min(1, (probe - tops[i]) / (tops[i + 1] - tops[i]));
    }
  }
  return 0;
}

function paint() {
  if (!geo) return;
  let p = progress();
  const active = Math.floor(p);
  if (REDUCED.matches) p = active;                 // jump between nodes, never travel

  const i = Math.min(active, HOPS.length - 2);
  const f = p - i;
  const [x0, y0] = geo.pts[i];
  const [x1, y1] = geo.pts[i + 1];
  const x = x0 + (x1 - x0) * f;
  const y = y0 + (y1 - y0) * f;
  const len = geo.cum[i] + (geo.cum[i + 1] - geo.cum[i]) * f;

  geo.packet.setAttribute("transform", `translate(${x} ${y})`);
  geo.halo.setAttribute("transform", `translate(${x} ${y})`);
  geo.lit.setAttribute("stroke-dashoffset", geo.total - len);

  const color = `var(${HOPS[active].c})`;
  geo.packet.style.fill = color;
  geo.halo.style.stroke = color;

  geo.nodes.forEach((n, k) => {
    n.classList.toggle("is-active", k === active);
    n.classList.toggle("is-passed", k < active);
  });
  renderLog(active);
}

let queued = false;
function onScroll() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; paint(); });
}

function rebuild() {
  buildMap();
  measure();
  shown = -1;
  paint();
}

/* ---------- small live details ---------- */
function initClock() {
  const node = document.querySelector("[data-clock]");
  if (!node) return;
  const fmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Dhaka" });
  const set = () => (node.textContent = `${fmt.format(new Date())} BST`);
  set();
  setInterval(set, 30_000);
}

function initLinks() {
  const list = document.querySelector("[data-links]");
  const names = { github: "GitHub", linkedin: "LinkedIn" };
  for (const [k, href] of Object.entries(LINKS)) {
    if (!href) continue;
    const li = document.createElement("li");
    li.innerHTML = `<a class="link" href="${href}" rel="me noopener" target="_blank">${names[k]} ↗</a>`;
    list.append(li);
  }
}

/* Footer prints this page's real transfer weight, measured on the visitor's device. */
function initWeight() {
  const node = document.querySelector("[data-total]");
  if (!node) return;
  const nav = performance.getEntriesByType("navigation")[0];
  const res = performance.getEntriesByType("resource");
  const bytes = (nav?.transferSize || nav?.encodedBodySize || 0)
    + res.reduce((s, r) => s + (r.transferSize || r.encodedBodySize || 0), 0);
  node.textContent = bytes ? `${(bytes / 1024).toFixed(1)} KB transferred` : "no framework, no tracking";
}

/* ---------- boot ---------- */
logEl.setAttribute("aria-hidden", "true");        // decorative mirror of the chapter labels
initClock();
initLinks();
rebuild();

addEventListener("scroll", onScroll, { passive: true });
let rt;
addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { measure(); paint(); }, 150); });
DESKTOP.addEventListener("change", rebuild);
REDUCED.addEventListener("change", paint);
addEventListener("load", () => { measure(); paint(); initWeight(); });
