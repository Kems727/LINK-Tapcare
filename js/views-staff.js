import * as S from "./store.js";
import { h, field, kv, badge, statusBadge, tabs, fmtDate, fmtTime, fmtStamp, scheduleGrid, scheduleText, toast, clear, age } from "./ui.js";
import * as P from "./views-patient.js";

const go = (x) => (location.hash = x);
const hospName = (id) => S.pub().hospitals.find((x) => x.id === id)?.name || "";
const table = (heads, rows, empty = "Nothing to show.") =>
  rows.length ? h("div", { class: "scroll" }, h("table", { class: "tbl" }, h("thead", h("tr", heads.map((x) => h("th", x)))), h("tbody", rows.map((r) => (Array.isArray(r) ? h("tr", r.map((c) => h("td", c))) : r))))) : h("p", { class: "muted" }, empty);

// ---------- attendance banner ----------
function attendanceCard(rerender) {
  const ses = S.getSession();
  const a = S.attendanceToday(ses.id);
  const on = a && !a.out;
  return h("div", { class: "big-status " + (on ? "present" : "") },
    h("div", { class: "row between" },
      h("div", h("div", { class: "small", style: "opacity:.85" }, S.ROLE_LABEL[ses.role] + "  |  " + ses.id),
        h("h2", on ? "You are marked PRESENT" : a ? "You clocked out" : "Not clocked in"),
        h("p", a ? `Time in ${fmtTime(a.in)}${a.out ? "  |  Time out " + fmtTime(a.out) : ""}  |  ${hospName(ses.rec.employment.hospitalId)}` : "Verify your card to be marked present.")),
      on ? h("button", { class: "btn light", on: { click: () => { S.timeOut(); toast("Clocked out. Patients will see you as not in the hospital."); rerender(); } } }, "Clock out")
        : h("button", { class: "btn light", on: { click: () => { S.timeInAgain(); toast("You are marked present."); rerender(); } } }, "Back on duty")));
}

// ---------- portal home: attendance + patient directory ----------
export async function portal(rerender) {
  const ses = S.getSession();
  const list = await S.listPatients();
  const out = h("div");
  const q = h("input", { type: "search", placeholder: "Search by name, ID or phone", "aria-label": "Search patients", autofocus: true });
  const paint = () => {
    clear(out);
    const t = q.value.trim().toLowerCase();
    const rows = list.filter((x) => !t || `${x.last} ${x.first} ${x.middle} ${x.id} ${x.phone}`.toLowerCase().includes(t));
    if (!rows.length) return out.append(h("div", { class: "card muted" }, "No patients match your search."));
    let cur = "";
    const trs = [];
    for (const x of rows) {
      const L = x.last[0].toUpperCase();
      if (L !== cur) { cur = L; trs.push(h("tr", h("td", { colspan: 6, class: "letter" }, L))); }
      trs.push(h("tr", { class: "click", tabindex: 0, on: { click: () => go("#/portal/patient/" + x.id), keydown: (e) => e.key === "Enter" && go("#/portal/patient/" + x.id) } },
        h("td", h("b", `${x.last}${x.suffix ? " " + x.suffix : ""}, ${x.first}`), x.middle ? " " + x.middle : ""),
        h("td", h("code", x.id)), h("td", `${age(x.dob)} / ${x.sex[0]}`), h("td", x.city), h("td", { class: "small" }, hospName(x.hospitalId)),
        h("td", x.verified ? badge("Verified", "ok") : badge("Unverified", "warn"))));
    }
    out.append(h("div", { class: "card", style: "padding:6px" }, h("div", { class: "scroll" }, h("table", { class: "tbl dir" }, h("thead", h("tr", ["Patient (A-Z by last name)", "ID", "Age / Sex", "City", "Hospital", "Identity"].map((x) => h("th", x)))), h("tbody", trs)))),
      h("p", { class: "small muted" }, `${rows.length} of ${list.length} patients. Every record you open is written to the audit log.`));
  };
  q.addEventListener("input", paint);
  paint();
  return h("div", { class: "wrap stack" },
    attendanceCard(rerender),
    h("div", { class: "row between" }, h("h2", { style: "margin:0" }, "Patient directory"),
      S.can("patients:register") ? h("a", { class: "btn", href: "#/portal/register" }, "+ Register walk-in patient") : null),
    ses.role === "helpdesk" ? h("div", { class: "alert info" }, "Helpdesk view: you can see who is registered and verify identities. Clinical details are hidden.") : null,
    h("div", { class: "search" }, q), out);
}

// ---------- one patient ----------
export async function patient(id, rerender) {
  const { rec, clinicalAllowed, meta } = await S.getPatientRecord(id);
  const ses = S.getSession();
  const extra = {};
  const reload = () => rerender();
  if (S.can("notes:write")) extra.note = { label: "+ Add consultation note", render: () => noteForm(rec, reload) };
  if (S.can("vitals:write")) extra.vit = { label: "+ Record vital signs", render: () => vitalsForm(rec, reload) };
  const verified = meta.verified !== false;
  return h("div", { class: "wrap stack" },
    h("a", { href: "#/portal" }, "< Back to directory"),
    !verified ? h("div", { class: "alert warn row between" }, h("span", "This patient registered online. Check a valid ID, then mark the identity as verified."),
      S.can("patients:verify") ? h("button", { class: "btn sm", on: { click: () => { S.verifyPatient(id); toast("Identity verified."); reload(); } } }, "Verify identity") : null) : null,
    meta.mustChangePin ? h("div", { class: "alert info" }, "Temporary PIN issued. The patient must choose a new PIN at first sign-in.") : null,
    P.recordHeader(clinicalAllowed ? rec : { ...rec, allergies: [] }, meta),
    P.recordTabs(rec, { clinical: clinicalAllowed, extra, meta }));
}

const sel = (name, opts) => h("select", { name }, opts.map((o) => h("option", o)));
function noteForm(rec, done) {
  const f = {
    type: sel("type", ["Outpatient consultation", "Follow-up visit", "Annual check-up", "Emergency visit", "Vaccination", "Admission / ward round"]),
    complaint: h("input", { required: true }), icd: h("input", { placeholder: "e.g. J45.20" }), diagnosis: h("input", { required: true }),
    notes: h("textarea", { required: true }), plan: h("textarea", { required: true }), followUp: h("input", { type: "date" }),
  };
  return h("form", { class: "card flat stack", on: { submit: async (e) => {
    e.preventDefault();
    await S.addNote(rec.id, Object.fromEntries(Object.entries(f).map(([k, el]) => [k, el.value])));
    toast("Consultation note saved to the encrypted record.");
    done();
  } } }, h("h3", "New consultation note"), h("p", { class: "small muted" }, "Saved under your name and logged in the audit trail."),
    h("div", { class: "fgrid" }, field("Visit type", f.type), field("Chief complaint", f.complaint), field("Diagnosis", f.diagnosis), field("ICD-10 code", f.icd), field("Follow-up date", f.followUp)),
    field("Findings / notes", f.notes), field("Plan / prescription", f.plan), h("button", { class: "btn" }, "Save note"));
}
function vitalsForm(rec, done) {
  const n = (name, ph, step = "any") => h("input", { name, type: "number", step, placeholder: ph });
  const f = { bp: h("input", { placeholder: "120/80", pattern: "\\d{2,3}/\\d{2,3}", required: true }), hr: n("hr", "bpm", 1), temp: n("temp", "°C", 0.1), rr: n("rr", "per min", 1), spo2: n("spo2", "%", 1), weightKg: n("weightKg", "kg", 0.1), heightCm: n("heightCm", "cm", 0.1) };
  return h("form", { class: "card flat stack", on: { submit: async (e) => {
    e.preventDefault();
    const v = {};
    for (const [k, el] of Object.entries(f)) v[k] = k === "bp" ? el.value : el.value === "" ? null : Number(el.value);
    await S.addVitals(rec.id, v);
    toast("Vital signs saved.");
    done();
  } } }, h("h3", "Record vital signs"),
    h("div", { class: "fgrid" }, field("Blood pressure", f.bp), field("Heart rate", f.hr), field("Temperature", f.temp), field("Resp. rate", f.rr), field("SpO2", f.spo2), field("Weight", f.weightKg), field("Height", f.heightCm)),
    h("button", { class: "btn" }, "Save vitals"));
}

// ---------- helpdesk: register walk-in ----------
export function registerWalkIn() {
  const f = {};
  const mk = (n, p = {}) => (f[n] = h("input", { name: n, ...p }));
  mk("first", { required: true }); mk("middle"); mk("last", { required: true }); mk("suffix");
  mk("dob", { type: "date", required: true, max: S.manilaDate() });
  f.sex = sel("sex", ["Female", "Male"]);
  f.bloodType = sel("bloodType", ["Unknown", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]);
  mk("phone", { type: "tel", required: true }); mk("email", { type: "email" }); mk("line"); mk("barangay");
  f.city = sel("city", ["Calamba City", "Cabuyao City", "Other (Laguna)"]);
  mk("emName"); mk("emRelation"); mk("emPhone", { type: "tel" }); mk("allergies"); mk("conditions");
  f.hospitalId = h("select", { name: "hospitalId" }, S.pub().hospitals.map((x) => h("option", { value: x.id, selected: x.id === S.getSession().rec.employment.hospitalId }, x.name)));
  const root = h("div", { class: "wrap stack" });
  root.append(h("a", { href: "#/portal" }, "< Back to directory"),
    h("form", { class: "card stack", on: { submit: async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(Object.entries(f).map(([k, el]) => [k, el.value]));
      data.province = "Laguna";
      const { id, tempPin } = await S.registerByHelpdesk(data);
      clear(root);
      root.append(h("div", { class: "card gate stack center" },
        h("h2", "Patient registered"), h("div", { style: "font-size:1.8rem;font-weight:800;color:var(--navy)" }, id),
        h("div", { class: "alert warn" }, "Temporary PIN (show once, hand to the patient):"), h("div", { style: "font-size:2rem;font-weight:800;letter-spacing:.3em" }, tempPin),
        h("p", { class: "muted small" }, "The patient must choose a new PIN at first sign-in. Now write the ID to a blank NFC card (see Printable cards)."),
        h("div", { class: "row", style: "justify-content:center" }, h("a", { class: "btn", href: "#/portal/patient/" + id }, "Open record"), h("a", { class: "btn ghost", href: "cards.html?id=" + id, target: "_blank" }, "Card & QR"), h("a", { class: "btn ghost", href: "#/portal" }, "Done"))));
    } } },
      h("h2", "Register a walk-in patient"),
      h("p", { class: "muted" }, "Check the patient's valid ID first. A record you create is marked identity-verified."),
      h("div", { class: "fgrid" }, field("First name", f.first), field("Middle name", f.middle), field("Last name", f.last), field("Suffix", f.suffix), field("Date of birth", f.dob), field("Sex", f.sex), field("Blood type", f.bloodType), field("Mobile number", f.phone), field("Email", f.email), field("Street address", f.line), field("Barangay", f.barangay), field("City", f.city), field("Hospital", f.hospitalId)),
      h("h3", "Emergency contact"), h("div", { class: "fgrid" }, field("Name", f.emName), field("Relationship", f.emRelation), field("Mobile", f.emPhone)),
      h("h3", "Health basics"), h("div", { class: "fgrid" }, field("Known allergies", f.allergies, "Comma separated"), field("Existing conditions", f.conditions, "Comma separated")),
      h("button", { class: "btn" }, "Register patient")));
  return root;
}

// ---------- my profile (credentials, tenure, service history, occupational health) ----------
export function myProfile() {
  const ses = S.getSession();
  const r = ses.rec, e = r.employment, c = r.credentials || {}, p = r.profile;
  const lic = c.license;
  const list = (a) => (a?.length ? h("ul", { style: "margin:0;padding-left:18px" }, a.map((x) => h("li", x))) : h("p", { class: "muted" }, "None recorded."));
  const years = (d) => { const n = new Date(), s = new Date(d); let y = n.getFullYear() - s.getFullYear(); if (n < new Date(n.getFullYear(), s.getMonth(), s.getDate())) y--; return y; };
  const hist = S.attendanceHistory(ses.id);
  return h("div", { class: "wrap stack" },
    h("a", { href: "#/portal" }, "< Back"),
    h("div", { class: "card" }, h("div", { class: "row between" }, h("div", h("h1", { style: "margin:0" }, ses.name), h("div", { class: "muted" }, `${e.title}  |  ${hospName(e.hospitalId)}`)), h("div", h("code", ses.id), " ", badge(e.status, "ok")))),
    tabs([["emp", "Employment & tenure"], ["cred", "Credentials"], ["svc", "Service history"], ["hlth", "Health record (staff)"], ["att", "Attendance"], ["sched", "Schedule"]], "emp", (k) => ({
      emp: () => h("div", { class: "grid g2" },
        h("div", { class: "card flat" }, h("h3", "Employment"), kv([["Employee no.", e.employeeNo], ["Position", e.title], ["Department", e.department], ["Clinic / station", e.room], ["Hospital", hospName(e.hospitalId)], ["Date hired", fmtDate(e.hired)], ["Tenure", `${years(e.hired)} years`], ["Section head since", e.sectionHeadSince && fmtDate(e.sectionHeadSince)], ["Reports to", e.reportsTo]])),
        h("div", { class: "card flat" }, h("h3", "Personal"), kv([["Full name", ses.name], ["Date of birth", fmtDate(p.dob)], ["Mobile", p.phone], ["Email", p.email], ["Address", [p.address.line, p.address.barangay, p.address.city].filter(Boolean).join(", ")]])),
        r.hospitalProfile ? h("div", { class: "card flat" }, h("h3", "In the hospital"), kv([["Years of service", r.hospitalProfile.yearsOfService], ["Patients served", r.hospitalProfile.patientsServedYear], ["Committees", r.hospitalProfile.committees.join("; ")], ["Languages", r.hospitalProfile.languages.join(", ")]])) : null),
      cred: () => h("div", { class: "grid g2" },
        h("div", { class: "card flat" }, h("h3", "Professional license"), lic ? kv([["Type", lic.type], ["License no.", lic.no], ["Issued by", lic.issuer], ["Issued", fmtDate(lic.issued)], ["Valid until", fmtDate(lic.validUntil)], ["Status", badge(lic.status, "ok")]]) : h("p", { class: "muted" }, "Not applicable for this role.")),
        c.specialty ? h("div", { class: "card flat" }, h("h3", "Specialty board"), kv([["Specialty", c.specialty.name], ["Board", c.specialty.board], ["Status", c.specialty.status], ["Since", c.specialty.since]])) : null,
        h("div", { class: "card flat" }, h("h3", "Education"), table(["Years", "School", "Degree"], (c.education || []).map((x) => [x.year, x.school, x.degree]))),
        h("div", { class: "card flat" }, h("h3", "Training & certifications"), list(c.training)),
        h("div", { class: "card flat" }, h("h3", "Awards"), list(c.awards))),
      svc: () => table(["Period", "Position", "Department", "Notes"], (r.serviceHistory || []).map((x) => [x.period, h("b", x.position), x.department, x.note])),
      hlth: () => r.occupationalHealth ? h("div", { class: "grid g2" },
        h("div", { class: "card flat" }, h("h3", "Fitness for work"), kv([["Result", badge(r.occupationalHealth.fitToWork.result, "ok")], ["Date", fmtDate(r.occupationalHealth.fitToWork.date)], ["Assessed by", r.occupationalHealth.fitToWork.by], ["Annual physical", `BP ${r.occupationalHealth.annualPhysical.bp}, BMI ${r.occupationalHealth.annualPhysical.bmi}`], ["Notes", r.occupationalHealth.annualPhysical.notes], ["Incidents", r.occupationalHealth.incidents]])),
        h("div", { class: "card flat" }, h("h3", "Staff immunizations"), list(r.occupationalHealth.immunizations))) : h("p", { class: "muted" }, "No occupational health record."),
      att: () => table(["Date", "Time in", "Time out"], hist.map((x) => [fmtDate(x.date), fmtTime(x.in), fmtTime(x.out)]), "No attendance yet."),
      sched: () => scheduleGrid(S.pub().staff.find((s) => s.id === ses.id)?.schedule || {}),
    }[k]())));
}

// ---------- admin ----------
export function admin(rerender) {
  const board = () => {
    const rows = S.allAttendanceToday();
    return h("div", { class: "stack" },
      h("p", { class: "muted" }, "Live status from card taps today (Asia/Manila time). Staff who have not tapped show their scheduled status."),
      table(["Staff", "Role", "Hospital", "Status", "Time in", "Time out"], rows.map((s) => [h("b", s.name), S.ROLE_LABEL[s.role], hospName(s.hospitalId), statusBadge(s.status), fmtTime(s.today?.in), fmtTime(s.today?.out)])));
  };
  const roster = () => table(["ID", "Name", "Role", "Title", "Hospital", "Clinic hours"], S.pub().staff.map((s) => [h("code", s.id), h("b", s.name), S.ROLE_LABEL[s.role], s.title, hospName(s.hospitalId), h("div", scheduleText(s.schedule).map((l) => h("div", { class: "small" }, l)))]));
  const log = () => {
    const rows = S.getAudit().slice(0, 150);
    return h("div", { class: "stack" }, h("p", { class: "muted" }, "Most recent 150 events on this browser's demo database."),
      table(["When", "Who", "Role", "Action", "Target"], rows.map((a) => [fmtStamp(a.ts), a.actorName || a.actorId || "-", a.actorRole, a.action.startsWith("denied") || a.action === "login_failed" ? badge(a.action, "bad") : a.action, a.targetId]), "No events yet."));
  };
  return h("div", { class: "wrap stack" },
    h("h1", "Administration"),
    h("div", { class: "alert info" }, "Admins manage staff and see the audit trail. They cannot open patient medical records."),
    tabs([["att", "Attendance board"], ["ros", "Staff roster"], ["aud", "Audit log"]], "att", (k) => ({ att: board, ros: roster, aud: log }[k]())));
}
