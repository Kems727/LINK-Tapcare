// Small DOM helpers. Everything is built with textContent (never innerHTML) so user-entered data cannot inject markup.
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs && (typeof attrs !== "object" || attrs instanceof Node || Array.isArray(attrs))) {
    kids.unshift(attrs);
    attrs = null;
  }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "on") for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
    else if (k === "value") el.value = v;
    else if (k in el && k !== "list" && k !== "form") el[k] = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  add(el, kids);
  return el;
}
function add(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}
export const $ = (sel, root = document) => root.querySelector(sel);
export const clear = (el) => el.replaceChildren();

export function toast(msg, ms = 3200) {
  let t = document.getElementById("toast");
  if (!t) {
    t = h("div", { id: "toast", role: "status" });
    document.body.append(t);
  }
  t.textContent = msg;
  t.style.display = "block";
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.style.display = "none"), ms);
}

// ---- formatting ----
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function fmtDate(s) {
  if (!s) return "-";
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(s);
  if (!m) return s;
  return (m[3] ? `${MONTHS[+m[2] - 1]} ${+m[3]}, ` : `${MONTHS[+m[2] - 1]} `) + m[1];
}
export function fmtTime(iso) {
  if (!iso) return "-";
  if (/^\d{2}:\d{2}$/.test(iso)) return t12(iso);
  return new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso));
}
export function fmtStamp(iso) {
  return new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso));
}
export function t12(hhmm) {
  let [hh, mm] = hhmm.split(":").map(Number);
  const ap = hh >= 12 ? "PM" : "AM";
  hh = hh % 12 || 12;
  return `${hh}:${String(mm).padStart(2, "0")} ${ap}`;
}
export function age(dob) {
  const d = new Date(dob), n = new Date();
  let a = n.getFullYear() - d.getFullYear();
  if (n < new Date(n.getFullYear(), d.getMonth(), d.getDate())) a--;
  return a;
}
const DAYS = [["mon", "Mon"], ["tue", "Tue"], ["wed", "Wed"], ["thu", "Thu"], ["fri", "Fri"], ["sat", "Sat"], ["sun", "Sun"]];
export function scheduleText(s) {
  const parts = [];
  for (const [k, lab] of DAYS) if (s[k]?.length) parts.push(`${lab} ${s[k].map(([a, b]) => `${t12(a)}-${t12(b)}`).join(", ")}`);
  return parts;
}
export function scheduleGrid(sched) {
  return h("div", { class: "scroll" }, h("table", { class: "tbl" },
    h("thead", h("tr", DAYS.map(([, l]) => h("th", l)))),
    h("tbody", h("tr", DAYS.map(([k]) => h("td", sched[k]?.length ? sched[k].map(([a, b]) => h("div", `${t12(a)} - ${t12(b)}`)) : h("span", { class: "muted" }, "Off")))))));
}

export const badge = (text, kind = "") => h("span", { class: "badge " + kind }, text);
export function statusBadge(st) {
  const map = {
    present: ["Present - in the hospital", "ok"],
    out: ["Clocked out", "gray"],
    awaiting: ["Scheduled now - not yet clocked in", "warn"],
    later: ["Not in yet - later today", "gray"],
    done: ["Shift finished", "gray"],
    off: ["Off today", "gray"],
  };
  const [t, k] = map[st.state] || ["Unknown", "gray"];
  return h("span", { class: "badge " + k }, h("span", { class: "dot" }), t);
}

export function field(label, input, hint) {
  const id = "f" + Math.random().toString(36).slice(2, 8);
  input.id = id;
  return h("div", { class: "field" }, h("label", { for: id }, label), input, hint && h("div", { class: "hint" }, hint));
}
export const kv = (pairs) =>
  h("dl", { class: "kv" }, pairs.filter(Boolean).flatMap(([k, v]) => [h("dt", k), h("dd", v == null || v === "" ? "-" : v)]));

export function tabs(items, initial, render) {
  const body = h("div");
  const bar = h("div", { class: "tabs", role: "tablist" });
  const btns = {};
  const show = (key) => {
    for (const k in btns) btns[k].classList.toggle("on", k === key);
    clear(body);
    body.append(render(key));
  };
  for (const [key, label] of items) {
    btns[key] = h("button", { role: "tab", on: { click: () => show(key) } }, label);
    bar.append(btns[key]);
  }
  show(initial || items[0][0]);
  return h("div", bar, body);
}

export const tel = (num) => h("a", { href: "tel:" + num.replace(/[^\d+]/g, "") }, num);
