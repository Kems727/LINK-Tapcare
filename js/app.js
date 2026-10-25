import * as S from "./store.js";
import { h, clear, toast } from "./ui.js";
import * as Pub from "./views-public.js";
import * as Pat from "./views-patient.js";
import * as Stf from "./views-staff.js";

const app = document.getElementById("app");
const top = document.getElementById("topbar");
let lastActive = Date.now();
let seq = 0;

function parse() {
  const raw = location.hash.replace(/^#\/?/, "");
  const [path, query = ""] = raw.split("?");
  return { parts: path.split("/").filter(Boolean).map(decodeURIComponent), query };
}
const ROUTE_ROLES = { me: ["patient"], portal: ["doctor", "nurse", "helpdesk"], admin: ["admin"] };

function nav() {
  const ses = S.getSession();
  const cur = location.hash;
  const a = (href, label) => h("a", { href, class: cur === href || (href !== "#/" && cur.startsWith(href)) ? "on" : "" }, label);
  const links = [a("#/", "Home"), a("#/doctors", "Doctors"), a("#/hospitals", "Hospitals")];
  if (!ses) links.push(a("#/register", "Register"), a("#/login", "Sign in"));
  else {
    if (ses.role === "patient") links.push(a("#/me", "My records"));
    else if (ses.role === "admin") links.push(a("#/admin", "Admin"));
    else links.push(a("#/portal", "Portal"), a("#/portal/profile", "My profile"));
    links.push(h("span", { class: "who" }, `${ses.name} (${S.ROLE_LABEL[ses.role]})`), h("button", { on: { click: () => { S.logout(); location.hash = "#/"; } } }, "Sign out"));
  }
  clear(top);
  top.append(h("a", { class: "brand", href: "#/" }, h("img", { src: "assets/logo.svg", alt: "" }), "TapCare"), h("nav", { class: "nav", "aria-label": "Main" }, links));
}

async function render() {
  const my = ++seq;
  nav();
  const { parts } = parse();
  const ses = S.getSession();
  const head = parts[0] || "";
  window.scrollTo(0, 0);
  const guard = ROUTE_ROLES[head];
  let view;
  try {
    if (guard) {
      if (!ses) { toast("Please tap your card and verify first."); location.hash = "#/login"; return; }
      if (!guard.includes(ses.role)) { S.logAudit({ action: "denied:route", targetId: location.hash.slice(0, 60) }); view = deny(); }
    }
    if (!view) view = await route(head, parts);
  } catch (e) {
    if (e.code === "DENIED") view = deny();
    else if (e.code === "NO_SESSION") { location.hash = "#/login"; return; }
    else { console.error(e); view = h("div", { class: "wrap" }, h("div", { class: "card alert bad" }, "Something went wrong: " + e.message)); }
  }
  if (my !== seq) return; // a newer navigation won
  clear(app);
  app.append(view);
}
const deny = () => h("div", { class: "wrap" }, h("div", { class: "card gate stack center" }, h("h2", "Access denied"), h("p", { class: "muted" }, "Your role is not allowed to open this page. The attempt was recorded in the audit log."), h("a", { class: "btn", href: "#/" }, "Back to home")));

async function route(head, parts) {
  switch (head) {
    case "": return Pub.home();
    case "hospitals": return Pub.hospitals();
    case "doctors": return Pub.doctors();
    case "register": return Pub.register();
    case "login": return Pub.login();
    case "demo": return Pub.demo();
    case "tap": return Pub.tap(parts[1] || "");
    case "me": return Pat.me(render);
    case "admin": S.requirePerm("staff:roster"); return Stf.admin(render);
    case "portal":
      if (!parts[1]) return Stf.portal(render);
      if (parts[1] === "patient" && parts[2]) return Stf.patient(decodeURIComponent(parts[2]).toUpperCase(), render);
      if (parts[1] === "register") { S.requirePerm("patients:register"); return Stf.registerWalkIn(); }
      if (parts[1] === "profile") { S.requirePerm("profile:self"); return Stf.myProfile(); }
      return Pub.home();
    default: return h("div", { class: "wrap" }, h("div", { class: "card gate center stack" }, h("h2", "Page not found"), h("a", { class: "btn", href: "#/" }, "Home")));
  }
}

// auto sign-out after inactivity
["pointerdown", "keydown", "touchstart", "scroll"].forEach((ev) => addEventListener(ev, () => (lastActive = Date.now()), { passive: true }));
setInterval(() => {
  if (S.getSession() && Date.now() - lastActive > S.CONFIG.idleMinutes * 60000) {
    S.logout();
    toast("Signed out after " + S.CONFIG.idleMinutes + " minutes of inactivity.", 6000);
    location.hash = "#/login";
  }
}, 5000);
// keep availability fresh (clock-based status + other tabs)
setInterval(() => { const h0 = parse().parts[0] || ""; if (["", "doctors", "admin"].includes(h0) && !document.hidden && !document.activeElement?.matches?.("input,textarea,select")) render(); }, 30000);

S.on("session", nav);
S.on("sync", () => { const h0 = parse().parts[0] || ""; if (["", "doctors", "admin"].includes(h0)) render(); });
addEventListener("hashchange", () => { lastActive = Date.now(); render(); });

try {
  await S.init();
  await render();
} catch (e) {
  app.replaceChildren(h("div", { class: "wrap" }, h("div", { class: "card alert bad" }, "Could not load TapCare data. If you opened index.html straight from your files, host it on a web server or GitHub Pages instead. (" + e.message + ")")));
}
