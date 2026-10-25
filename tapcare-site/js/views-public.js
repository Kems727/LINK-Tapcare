import * as S from "./store.js";
import { h, field, kv, badge, statusBadge, scheduleText, toast, tel, clear } from "./ui.js";

const go = (hash) => (location.hash = hash);
const hospName = (id) => S.pub().hospitals.find((x) => x.id === id)?.name || "";

const tapIcon = () => {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 64 64");
  s.setAttribute("class", "tapart");
  s.setAttribute("aria-hidden", "true");
  s.innerHTML = '<rect x="6" y="16" width="38" height="28" rx="6" fill="#fff"/><rect x="6" y="22" width="38" height="6" fill="#0B4FCC" opacity=".2"/><path d="M22 30v10M17 35h10" stroke="#0B4FCC" stroke-width="3.4" stroke-linecap="round"/><path d="M48 24a11 11 0 0 1 0 20M54 18a19 19 0 0 1 0 32" fill="none" stroke="#9CC3FF" stroke-width="3.4" stroke-linecap="round"/>';
  return s;
};

export function home() {
  const p = S.pub();
  const docs = p.staff.filter((s) => s.role === "doctor");
  const here = docs.filter((d) => S.staffStatus(d.id).state === "present").length;
  return h("div",
    h("section", { class: "hero" }, h("div", { class: "wrap" },
      tapIcon(),
      h("h1", "One tap to your health records."),
      h("p", "TapCare is an NFC health access card. Tap your card, enter your PIN, and your records, appointments and your doctors' availability are in one secure place."),
      h("div", { class: "actions" },
        h("a", { class: "btn light", href: "#/login" }, "Open my records"),
        h("a", { class: "btn ghost", href: "#/doctors" }, "Check doctor availability"),
        h("a", { class: "btn ghost", href: "#/hospitals" }, "Hospital hotlines")))),
    h("div", { class: "wrap" },
      h("div", { class: "grid g3", style: "margin-top:-30px" },
        h("a", { class: "card", href: "#/doctors", style: "text-decoration:none;color:inherit" }, h("h3", "Doctors available now"), h("div", { style: "font-size:2rem;font-weight:800;color:var(--blue)" }, String(here)), h("p", { class: "muted small" }, "of " + docs.length + " doctors in the sample network are clocked in today.")),
        h("a", { class: "card", href: "#/hospitals", style: "text-decoration:none;color:inherit" }, h("h3", "Hospitals in Calamba & Cabuyao"), h("div", { style: "font-size:2rem;font-weight:800;color:var(--blue)" }, String(p.hospitals.length)), h("p", { class: "muted small" }, "Hotlines and partnered helpdesk numbers.")),
        h("a", { class: "card", href: "#/register", style: "text-decoration:none;color:inherit" }, h("h3", "New to TapCare?"), h("p", "Register your digital identity online, then verify at the hospital helpdesk and get your card."), h("span", { class: "btn sm ghost" }, "Register now"))),
      h("h2", { style: "margin-top:28px" }, "How it works"),
      h("div", { class: "grid g3" },
        step("1", "Register", "Fill in your details on this website, or let the hospital helpdesk register you at the counter."),
        step("2", "Get your card", "Your NFC card holds only a unique ID number. It never stores your medical data."),
        step("3", "Tap and verify", "Tap the card on a phone, enter your PIN, and your records open. Staff also enter a password after tapping.")),
      h("h2", { style: "margin-top:28px" }, "How your data is protected"),
      h("div", { class: "grid g2" },
        h("div", { class: "card" }, h("h3", "Encrypted database"), h("p", "Every record is encrypted with AES-256-GCM before it is stored. Without the right PIN or staff password, the stored file is unreadable.")),
        h("div", { class: "card" }, h("h3", "Two-step identity check"), h("p", "Something you have (the card) plus something you know (PIN or password). A lost card alone cannot open a record.")),
        h("div", { class: "card" }, h("h3", "Role-based access"), h("p", "Patients see only their own record. Doctors and nurses see clinical data. Helpdesk sees the directory but not clinical details. Admins see no patient records.")),
        h("div", { class: "card" }, h("h3", "Audit trail & lockout"), h("p", "Every access is logged and patients can see who opened their record. Five wrong attempts lock the card for a minute; idle sessions sign out after five minutes."))),
      h("p", { class: "muted small", style: "margin-top:18px" }, "Class project demo. All hospitals, doctors, phone numbers and patients on this site are fictional samples. ", h("a", { href: "#/demo" }, "Try the demo cards"), ".")));
}
const step = (n, t, d) => h("div", { class: "card flat" }, h("div", { class: "badge" }, "Step " + n), h("h3", { style: "margin-top:8px" }, t), h("p", { class: "muted" }, d));

export function hospitals() {
  const p = S.pub();
  const city = (c) => h("div", { class: "stack" },
    h("h2", c),
    h("div", { class: "grid g2" }, p.hospitals.filter((x) => x.city === c).map((x) => {
      const docs = p.staff.filter((s) => s.hospitalId === x.id && s.role === "doctor");
      return h("div", { class: "card" },
        h("h3", x.name), h("p", { class: "muted small" }, x.address),
        kv([["Main hotline", tel(x.hotline)], ["Partnered helpdesk", tel(x.helpdesk)], ["Emergency", tel(x.er)], ["Hours", x.hours]]),
        h("div", { class: "row", style: "margin-top:12px" }, badge(x.note), docs.length ? h("a", { class: "btn sm ghost", href: "#/doctors?h=" + x.id }, `${docs.length} doctor${docs.length > 1 ? "s" : ""}`) : null));
    })));
  return h("div", { class: "wrap stack" },
    h("h1", "Hospital hotlines"),
    h("p", { class: "muted" }, "Sample partner hospitals in Calamba and Cabuyao, Laguna. Numbers are fictional placeholders for the demo."),
    city("Calamba"), city("Cabuyao"));
}

export function doctors() {
  const p = S.pub();
  const q = new URLSearchParams((location.hash.split("?")[1] || ""));
  const docs = p.staff.filter((s) => s.role === "doctor");
  const list = h("div", { class: "grid g2" });
  const qIn = h("input", { type: "search", placeholder: "Search doctor or specialty", "aria-label": "Search doctors" });
  const hSel = h("select", { "aria-label": "Hospital" }, h("option", { value: "" }, "All hospitals"), p.hospitals.map((x) => h("option", { value: x.id, selected: q.get("h") === x.id }, x.name)));
  const nowOnly = h("input", { type: "checkbox", style: "width:auto" });
  const paint = () => {
    clear(list);
    const t = qIn.value.trim().toLowerCase();
    const rows = docs.filter((d) => (!hSel.value || d.hospitalId === hSel.value) && (!t || (d.name + d.title + d.department).toLowerCase().includes(t)) && (!nowOnly.checked || S.staffStatus(d.id).state === "present"));
    if (!rows.length) list.append(h("div", { class: "card muted" }, "No doctors match."));
    for (const d of rows) {
      const st = S.staffStatus(d.id);
      list.append(h("div", { class: "card" },
        h("div", { class: "row between" }, h("h3", { style: "margin:0" }, d.name), statusBadge(st)),
        h("p", { class: "muted", style: "margin:2px 0 8px" }, d.title),
        kv([["Hospital", hospName(d.hospitalId)], ["Clinic", d.room], ["Clinic hours", h("div", scheduleText(d.schedule).map((l) => h("div", l)))]]),
        st.demo ? h("p", { class: "hint" }, "Sample status for demo purposes.") : null));
    }
  };
  [qIn, hSel, nowOnly].forEach((e) => e.addEventListener("input", paint));
  paint();
  return h("div", { class: "wrap stack" },
    h("h1", "Doctor availability"),
    h("p", { class: "muted" }, "Doctors are shown as present once they tap their TapCare card and verify at the hospital. Clinic hours are their regular schedule."),
    h("div", { class: "card flat" }, h("div", { class: "grid g3" }, field("Search", qIn), field("Hospital", hSel), h("div", { class: "field" }, h("label", "Show"), h("label", { style: "font-weight:500;display:flex;gap:8px;align-items:center" }, nowOnly, "Present now only")))),
    list);
}

// ---- manual login (when a card is not at hand) ----
export function login() {
  const id = h("input", { placeholder: "TC-P-0001", autocomplete: "off", autocapitalize: "characters", style: "text-transform:uppercase" });
  return h("div", { class: "wrap" }, h("div", { class: "card gate stack" },
    h("h2", "Open my records"),
    h("p", { class: "muted" }, "Tap your TapCare card on your phone and it opens here automatically. No card with you? Type the ID number printed on it."),
    h("form", { on: { submit: (e) => { e.preventDefault(); if (id.value.trim()) go("#/tap/" + id.value.trim().toUpperCase()); } } },
      field("Card ID number", id), h("button", { class: "btn", style: "width:100%" }, "Continue")),
    h("p", { class: "small muted" }, "Staff (doctors, nurses, helpdesk, admin) use the same page with their staff card ID.")));
}

// ---- tap gate: card detected -> second factor ----
export function tap(rawId) {
  const id = S.normId(rawId);
  const role = S.roleOf(id);
  const ses = S.getSession();
  if (ses && ses.id === id) { queueMicrotask(() => go(landing(ses.role))); return h("div"); }
  if (!role || !S.cardExists(id)) {
    return h("div", { class: "wrap" }, h("div", { class: "card gate stack center" }, h("h2", "Card not recognised"), h("p", { class: "muted" }, "We could not find an active TapCare record for this card. Check the ID or visit the hospital helpdesk."), h("a", { class: "btn", href: "#/login" }, "Try again")));
  }
  const isStaff = role !== "patient";
  const secret = h("input", { type: "password", autocomplete: isStaff ? "current-password" : "off", inputmode: isStaff ? "text" : "numeric", class: isStaff ? "" : "pin", maxlength: isStaff ? 64 : 6, placeholder: isStaff ? "Password" : "••••••", autofocus: true });
  const msg = h("div");
  const btn = h("button", { class: "btn", style: "width:100%" }, "Verify identity");
  let timer;
  const lockUI = (secs) => {
    btn.disabled = true;
    let left = secs;
    clearInterval(timer);
    const tick = () => {
      msg.replaceChildren(h("div", { class: "alert bad" }, `Too many wrong attempts. This card is locked for ${left} second${left === 1 ? "" : "s"}.`));
      if (left-- <= 0) { clearInterval(timer); btn.disabled = false; msg.replaceChildren(); }
    };
    tick();
    timer = setInterval(tick, 1000);
  };
  const st = S.lockStatus(id);
  if (st.locked) setTimeout(() => lockUI(st.seconds));
  const form = h("form", { on: { submit: async (e) => {
    e.preventDefault();
    if (btn.disabled) return;
    btn.disabled = true; btn.textContent = "Verifying...";
    try {
      const s = isStaff ? await S.loginStaff(id, secret.value) : await S.loginPatient(id, secret.value);
      go(landing(s.role));
    } catch (err) {
      btn.textContent = "Verify identity"; btn.disabled = false;
      secret.value = ""; secret.focus();
      if (err.code === "LOCKED") lockUI(err.seconds || 60);
      else if (err.code === "BAD_SECRET") msg.replaceChildren(h("div", { class: "alert bad" }, `Incorrect ${isStaff ? "password" : "PIN"}. ${err.remaining} attempt${err.remaining === 1 ? "" : "s"} left before this card is locked.`));
      else msg.replaceChildren(h("div", { class: "alert bad" }, "Card not recognised."));
    }
  } } },
    field(isStaff ? "Staff password" : "Your 6-digit PIN", secret, isStaff ? "Your card alone cannot open anything. The password confirms it is really you." : "Your card alone cannot open your record. The PIN confirms it is really you."),
    btn);
  return h("div", { class: "wrap" }, h("div", { class: "card gate stack" },
    h("div", { class: "tapring" }, tapGlyph()),
    h("div", { class: "center" }, h("h2", { style: "margin-bottom:2px" }, "Card detected"), h("div", { class: "row", style: "justify-content:center" }, badge(S.ROLE_LABEL[role] + " card"), h("code", id))),
    form, msg,
    h("p", { class: "small muted center" }, isStaff ? "Verified staff are automatically marked present for today." : "Demo PIN is on the Demo page."),
    h("p", { class: "center small" }, h("a", { href: "#/" }, "Cancel"))));
}
function tapGlyph() {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 64 64"); s.setAttribute("width", "46"); s.setAttribute("height", "46");
  s.innerHTML = '<rect x="8" y="18" width="34" height="26" rx="5" fill="#0B4FCC"/><path d="M25 26v12M19 32h12" stroke="#fff" stroke-width="3.4" stroke-linecap="round"/><path d="M47 25a10 10 0 0 1 0 18M53 19a18 18 0 0 1 0 30" fill="none" stroke="#2F80FF" stroke-width="3.4" stroke-linecap="round"/>';
  return s;
}
export const landing = (role) => (role === "patient" ? "#/me" : role === "admin" ? "#/admin" : "#/portal");

// ---- self-registration ----
export function register() {
  const f = {};
  const mk = (name, props = {}) => (f[name] = h("input", { name, ...props }));
  const sel = (name, opts) => (f[name] = h("select", { name }, opts.map((o) => (Array.isArray(o) ? h("option", { value: o[0] }, o[1]) : h("option", o))))) ;
  mk("first", { required: true, autocomplete: "given-name" }); mk("middle"); mk("last", { required: true, autocomplete: "family-name" }); mk("suffix", { placeholder: "Jr., III (optional)" });
  mk("dob", { type: "date", required: true, max: S.manilaDate() });
  sel("sex", [["", "Select"], "Female", "Male"]);
  sel("bloodType", ["Unknown", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]);
  mk("phone", { type: "tel", required: true, placeholder: "09xx xxx xxxx" }); mk("email", { type: "email" });
  mk("line", { placeholder: "House no., street" }); mk("barangay");
  sel("city", ["Calamba City", "Cabuyao City", "Other (Laguna)"]);
  sel("hospitalId", [["", "No preference"], ...S.pub().hospitals.map((x) => [x.id, x.name])]);
  mk("emName"); mk("emRelation"); mk("emPhone", { type: "tel" });
  mk("allergies", { placeholder: "e.g. Penicillin, shrimp" }); mk("conditions", { placeholder: "e.g. Asthma, hypertension" });
  f.sex.required = true;
  const pin = h("input", { type: "password", inputmode: "numeric", maxlength: 6, class: "pin", required: true, autocomplete: "new-password" });
  const pin2 = h("input", { type: "password", inputmode: "numeric", maxlength: 6, class: "pin", required: true, autocomplete: "new-password" });
  const consent = h("input", { type: "checkbox", required: true, style: "width:auto" });
  const msg = h("div");
  const root = h("div", { class: "wrap" });
  const form = h("form", { class: "card stack", on: { submit: async (e) => {
    e.preventDefault();
    msg.replaceChildren();
    if (!/^\d{6}$/.test(pin.value)) return msg.append(h("div", { class: "alert bad" }, "PIN must be exactly 6 digits."));
    if (pin.value !== pin2.value) return msg.append(h("div", { class: "alert bad" }, "The two PINs do not match."));
    const data = Object.fromEntries(Object.entries(f).map(([k, el]) => [k, el.value]));
    data.province = "Laguna";
    try {
      const id = await S.registerSelf(data, pin.value);
      clear(root);
      root.append(h("div", { class: "card gate stack center" },
        h("h2", "You are registered"),
        h("div", { class: "alert ok" }, "Your TapCare ID number"), h("div", { style: "font-size:1.8rem;font-weight:800;color:var(--navy);letter-spacing:.04em" }, id),
        h("p", { class: "muted" }, "Your record is encrypted with your PIN. It shows as unverified until a helpdesk officer checks your valid ID at the hospital. Then you can get your NFC card."),
        h("a", { class: "btn", href: "#/tap/" + id }, "Open my record")));
    } catch (err) { msg.append(h("div", { class: "alert bad" }, "Could not register: " + err.message)); }
  } } },
    h("h2", "Register your digital identity"),
    h("div", { class: "alert info" }, "Your details are encrypted in your browser using your PIN before they are saved. Nobody can read them without your PIN or an authorized hospital login."),
    h("h3", "Personal details"),
    h("div", { class: "fgrid" }, field("First name", f.first), field("Middle name", f.middle), field("Last name", f.last), field("Suffix", f.suffix), field("Date of birth", f.dob), field("Sex", f.sex), field("Blood type", f.bloodType)),
    h("h3", "Contact"),
    h("div", { class: "fgrid" }, field("Mobile number", f.phone), field("Email (optional)", f.email), field("Street address", f.line), field("Barangay", f.barangay), field("City", f.city), field("Preferred hospital", f.hospitalId)),
    h("h3", "Emergency contact"),
    h("div", { class: "fgrid" }, field("Name", f.emName), field("Relationship", f.emRelation), field("Mobile number", f.emPhone)),
    h("h3", "Health basics (optional)"),
    h("div", { class: "fgrid" }, field("Known allergies", f.allergies, "Separate with commas"), field("Existing conditions", f.conditions, "Separate with commas")),
    h("h3", "Create your 6-digit PIN"),
    h("div", { class: "fgrid" }, field("PIN", pin, "Do not use birthdays or 123456."), field("Confirm PIN", pin2)),
    h("label", { style: "font-weight:500;display:flex;gap:10px;align-items:flex-start" }, consent, "I agree that TapCare and my partner hospital may store and process my health information in line with the Data Privacy Act of 2012 (sample consent text for the class demo)."),
    msg, h("button", { class: "btn" }, "Create my TapCare identity"));
  root.append(form);
  return root;
}

// ---- demo page ----
export function demo() {
  const row = (role, id, who, secret) => h("tr", { class: "click", on: { click: () => go("#/tap/" + id) } }, h("td", role), h("td", h("code", id)), h("td", who), h("td", h("code", secret)), h("td", h("span", { class: "btn sm ghost" }, "Simulate tap")));
  return h("div", { class: "wrap stack" },
    h("h1", "Demo & test cards"),
    h("div", { class: "alert warn" }, "Class demo only. These sign-in details are published here on purpose so the panel can try the system. A real deployment would never show passwords."),
    h("div", { class: "card" }, h("h3", "Tap a card"),
      h("p", { class: "muted" }, "On an iPhone with a written NFC card, just tap it. On a computer, click a row to simulate the tap."),
      h("div", { class: "scroll" }, h("table", { class: "tbl" }, h("thead", h("tr", ["Card", "ID", "Holder", "PIN / password", ""].map((x) => h("th", x)))),
        h("tbody",
          row("Patient", "TC-P-0001", "Pietrel Rigel Edward Khan", "PIN 482915"),
          row("Doctor", "TC-D-0001", "Dr. John Henrick Raquedan", "Raquedan#2026"),
          row("Nurse", "TC-N-0001", "Nurse Maria Cristina Santos", "Nurse#2026"),
          row("Helpdesk", "TC-H-0001", "Ana Marie Reyes", "Helpdesk#2026"),
          row("Admin", "TC-A-0001", "System Administrator", "Admin#2026"))))),
    h("div", { class: "card" }, h("h3", "Things to try"),
      h("ol", h("li", "Tap the doctor card, enter the password. You land on the portal and are marked Present."),
        h("li", "Open Doctor availability in another tab. Raquedan shows Present."),
        h("li", "Search the patient directory (alphabetical). Open Khan to see the full record."),
        h("li", "Sign in as helpdesk: the directory shows, clinical details are masked. Register a walk-in patient."),
        h("li", "Sign in as the patient with a wrong PIN five times to see the lockout."),
        h("li", "Sign in as admin: attendance board and audit log, but no patient records."))),
    h("div", { class: "row" }, h("a", { class: "btn ghost", href: "cards.html" }, "Printable cards & QR codes"), h("button", { class: "btn ghost", on: { click: () => { S.resetDemo(); toast("Demo data in this browser was reset."); } } }, "Reset demo data on this browser")));
}
