import * as S from "./store.js";
import { h, field, kv, badge, tabs, fmtDate, fmtStamp, age, toast, clear } from "./ui.js";

const hospName = (id) => S.pub().hospitals.find((x) => x.id === id)?.name || "";
const nameOf = (r) => S.displayName(r.profile);
const addr = (a) => [a.line, a.barangay, a.city, a.province].filter(Boolean).join(", ");

const table = (heads, rows, empty = "Nothing recorded.") =>
  rows.length
    ? h("div", { class: "scroll" }, h("table", { class: "tbl" }, h("thead", h("tr", heads.map((x) => h("th", x)))), h("tbody", rows.map((r) => h("tr", r.map((c) => h("td", c)))))))
    : h("p", { class: "muted" }, empty);

// ---------- shared record view (patient sees own; staff see via portal) ----------
export function recordHeader(rec, meta = {}) {
  const p = rec.profile;
  return h("div", { class: "card" },
    h("div", { class: "row between" },
      h("div", h("h1", { style: "margin:0" }, nameOf(rec)), h("div", { class: "muted" }, `${age(p.dob)} yrs, ${p.sex}  |  Born ${fmtDate(p.dob)}`)),
      h("div", { class: "stack", style: "text-align:right" }, h("code", rec.id), meta.verified === false ? badge("Identity not yet verified", "warn") : badge("Identity verified", "ok"))),
    rec.allergies.length
      ? h("div", { style: "margin-top:12px" }, h("div", { class: "small muted" }, "ALLERGIES"), h("div", { class: "alert-strip" }, rec.allergies.map((a) => h("span", { class: "chip" }, `${a.name} - ${a.reaction}`))))
      : h("p", { class: "small muted", style: "margin-top:10px" }, "No known allergies recorded."));
}

export function overview(rec, { clinical = true } = {}) {
  const p = rec.profile;
  const v = rec.vitals[0];
  const next = rec.appointments.find((a) => a.date >= S.manilaDate());
  return h("div", { class: "grid g2" },
    h("div", { class: "card flat" }, h("h3", "Personal"), kv([["Full name", nameOf(rec)], ["Date of birth", fmtDate(p.dob)], ["Sex", p.sex], ["Civil status", p.civil], ["Blood type", clinical ? p.bloodType : null], ["PhilHealth", p.philhealth], ["Address", addr(p.address)], ["Mobile", p.phone], ["Email", p.email]])),
    h("div", { class: "card flat" }, h("h3", "Emergency contact & care"), kv([["Contact", p.emergency.name], ["Relationship", p.emergency.relation], ["Contact mobile", p.emergency.phone], ["Primary hospital", hospName(p.primaryHospitalId)], ["Attending doctor", rec.history[0]?.doctorName && clinical ? rec.history[0].doctorName : null], ["Registered", fmtDate((p.registeredAt || "").slice(0, 10))]])),
    clinical
      ? [
          h("div", { class: "card flat" }, h("h3", "Active conditions"), rec.conditions.length ? h("ul", { style: "margin:0;padding-left:18px" }, rec.conditions.map((c) => h("li", h("b", c.name), `  (${c.status}${c.since ? ", since " + c.since : ""})`, c.notes ? h("div", { class: "small muted" }, c.notes) : null))) : h("p", { class: "muted" }, "None recorded.")),
          h("div", { class: "card flat" }, h("h3", "Latest vitals"), v ? kv([["Taken", fmtDate(v.date)], ["Blood pressure", v.bp && v.bp + " mmHg"], ["Heart rate", v.hr && v.hr + " bpm"], ["Temperature", v.temp && v.temp + " °C"], ["SpO2", v.spo2 && v.spo2 + " %"], ["Weight / Height", v.weightKg && `${v.weightKg} kg / ${v.heightCm} cm`], ["Recorded by", v.recordedBy]]) : h("p", { class: "muted" }, "No vitals yet.")),
          next ? h("div", { class: "card flat" }, h("h3", "Next appointment"), kv([["Date", fmtDate(next.date) + " at " + next.time], ["Doctor", next.doctorName], ["Where", hospName(next.hospitalId)], ["Reason", next.reason], ["Status", next.status]])) : null,
        ]
      : h("div", { class: "masked", style: "grid-column:1/-1" }, "Clinical details (conditions, vitals, medicines, history, results) are hidden for the helpdesk role."));
}

export function visits(rec) {
  if (!rec.history.length) return h("p", { class: "muted" }, "No visits recorded yet.");
  return h("div", { class: "timeline" }, rec.history.map((x) =>
    h("div", { class: "tl" },
      h("div", { class: "when" }, `${fmtDate(x.date)}  |  ${x.type}`),
      h("h3", { style: "margin:2px 0" }, x.diagnosis),
      h("div", { class: "small muted" }, `${x.doctorName}${x.department ? ", " + x.department : ""}${x.hospitalId ? "  |  " + hospName(x.hospitalId) : ""}`),
      kv([["Complaint", x.complaint], ["Diagnosis code", x.icd], ["Findings", x.notes], ["Plan", x.plan], ["Follow-up", x.followUp && fmtDate(x.followUp)]]))));
}

export function medsTab(rec) {
  return h("div", { class: "stack" },
    h("h3", "Medications"),
    table(["Medicine", "Dose", "For", "Since", "Prescriber", "Status"], rec.medications.map((m) => [h("b", m.name), m.dose, m.purpose, m.since, m.prescriber, badge(m.status, m.status === "Active" ? "ok" : m.status.includes("ALLERGY") ? "bad" : "")])),
    h("h3", "Allergies"),
    table(["Allergen", "Reaction", "Severity"], rec.allergies.map((a) => [h("b", a.name), a.reaction, a.severity])),
    h("h3", "Immunizations"),
    table(["Vaccine", "Date"], rec.immunizations.map((i) => [i.name, i.date])));
}

export function resultsTab(rec) {
  return h("div", { class: "stack" },
    h("h3", "Laboratory & imaging"),
    rec.labs.length ? rec.labs.map((l) => h("div", { class: "card flat" }, h("div", { class: "row between" }, h("b", l.panel), h("span", { class: "muted small" }, fmtDate(l.date))),
      table(["Test", "Result", "Reference", ""], l.results.map(([t, r, ref, f]) => [t, h("b", r), ref, f === "N" ? badge("Normal", "ok") : badge(f === "H" ? "High" : "Low", "warn")])))) : h("p", { class: "muted" }, "No results yet."),
    h("h3", "Vital-sign history"),
    table(["Date", "BP", "HR", "Temp", "SpO2", "Weight", "By"], rec.vitals.map((v) => [fmtDate(v.date), v.bp, v.hr, v.temp, v.spo2, v.weightKg && v.weightKg + " kg", v.recordedBy])));
}

export function apptTab(rec) {
  return table(["Date", "Time", "Doctor", "Where", "Reason", "Status"], rec.appointments.map((a) => [fmtDate(a.date), a.time, a.doctorName, hospName(a.hospitalId), a.reason, badge(a.status, "ok")]), "No upcoming appointments.");
}

export function recordTabs(rec, { clinical = true, extra = {}, meta = {} } = {}) {
  const items = [["ov", "Overview"]];
  if (clinical) items.push(["vis", "Visit history"], ["med", "Medicines & allergies"], ["res", "Results & vitals"], ["apt", "Appointments"]);
  for (const k of Object.keys(extra)) items.push([k, extra[k].label]);
  return tabs(items, "ov", (k) => ({ ov: () => overview(rec, { clinical }), vis: () => visits(rec), med: () => medsTab(rec), res: () => resultsTab(rec), apt: () => apptTab(rec) }[k]?.() || extra[k].render()));
}

// ---------- patient portal ----------
export async function me(refresh) {
  const ses = S.getSession();
  if (ses.mustChangePin) return forcePin(refresh);
  const rec = await S.getOwnRecord();
  const meta = S.metaOf(ses.id);
  const access = () => {
    const seeded = (rec.accessLog || []).map((a) => ({ ts: a.ts, who: a.who, role: a.role, action: a.action }));
    const live = S.auditForSelf().filter((a) => !["login_failed"].includes(a.action)).map((a) => ({ ts: a.ts, who: a.actorName || "Unknown", role: a.actorRole, action: nice(a.action) }));
    const all = [...live, ...seeded].sort((a, b) => b.ts.localeCompare(a.ts));
    return h("div", { class: "stack" }, h("p", { class: "muted" }, "Everyone who opened or changed your record. If you do not recognise an entry, tell the hospital helpdesk."),
      table(["When", "Who", "Role", "What"], all.map((a) => [fmtStamp(a.ts), a.who, a.role, a.action])));
  };
  return h("div", { class: "wrap stack" },
    meta.verified === false ? h("div", { class: "alert warn" }, "Your identity has not been verified yet. Please bring a valid ID to the hospital helpdesk so they can verify it and issue your card.") : null,
    recordHeader(rec, meta),
    recordTabs(rec, { extra: { acc: { label: "Who accessed my record", render: access }, sec: { label: "Security", render: () => pinForm(false, refresh) } }, meta }));
}
const nice = (a) => ({ view_record: "Viewed your record", add_note: "Added a consultation note", add_vitals: "Recorded vital signs", register_patient: "Registered your record", verify_identity: "Verified your identity" }[a] || a.replaceAll("_", " "));

function forcePin(refresh) {
  return h("div", { class: "wrap" }, h("div", { class: "gate" }, h("div", { class: "alert warn", style: "margin-bottom:12px" }, "The helpdesk gave you a temporary PIN. Choose your own private PIN before continuing."), pinForm(true, refresh)));
}
function pinForm(forced, refresh) {
  const a = h("input", { type: "password", inputmode: "numeric", maxlength: 6, class: "pin", required: true, autocomplete: "new-password" });
  const b = h("input", { type: "password", inputmode: "numeric", maxlength: 6, class: "pin", required: true, autocomplete: "new-password" });
  const msg = h("div");
  return h("form", { class: "card stack", style: "max-width:440px", on: { submit: async (e) => {
    e.preventDefault();
    msg.replaceChildren();
    if (!/^\d{6}$/.test(a.value)) return msg.append(h("div", { class: "alert bad" }, "PIN must be exactly 6 digits."));
    if (a.value !== b.value) return msg.append(h("div", { class: "alert bad" }, "The two PINs do not match."));
    await S.changePin(a.value);
    toast("PIN changed.");
    a.value = b.value = "";
    if (forced) refresh();
  } } }, h("h3", "Change my PIN"), field("New 6-digit PIN", a), field("Confirm new PIN", b), msg, h("button", { class: "btn" }, "Save PIN"),
  h("p", { class: "small muted" }, "Your record is re-protected with the new PIN. Keep it private; do not write it on the card."));
}
