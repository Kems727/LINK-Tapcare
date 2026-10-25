// TapCare demo data layer: loading, login, role-based access, audit log, attendance.
// DEMO NOTE: this is a static site, so "the database" is an encrypted JSON file plus a browser-local overlay.
// A real deployment would move all of this behind a server with real authentication.
import * as C from "./crypto.js";

export const CONFIG = {
  idleMinutes: 5, // auto sign-out after this much inactivity
  maxFails: 5, // wrong PIN/password attempts before a lockout
  lockSeconds: 60,
  helpdeskSeesClinical: false, // helpdesk can list every patient, but clinical details stay masked
};

export const ROLE_LABEL = { patient: "Patient", doctor: "Doctor", nurse: "Nurse", helpdesk: "Helpdesk", admin: "Administrator" };
export const STAFF_ROLES = ["doctor", "nurse", "helpdesk", "admin"];
const PREFIX = { P: "patient", D: "doctor", N: "nurse", H: "helpdesk", A: "admin" };

// What each verified role is allowed to do. The UI and the data layer both check this.
const PERMS = {
  patient: ["own:read", "own:pin"],
  doctor: ["patients:list", "patients:read", "patients:clinical", "notes:write", "attendance:self", "profile:self"],
  nurse: ["patients:list", "patients:read", "patients:clinical", "vitals:write", "attendance:self", "profile:self"],
  helpdesk: ["patients:list", "patients:read", "patients:register", "patients:verify", "attendance:self", "profile:self"],
  admin: ["staff:roster", "audit:view", "attendance:all", "profile:self"],
};

export class AppError extends Error {
  constructor(code, extra = {}) {
    super(code);
    this.code = code;
    Object.assign(this, extra);
  }
}

let PUB = null;
let VAULT = null;
let overlay = blank();
let session = null;
const listeners = {};

const LS_KEY = "tapcare.v1.overlay";
const LOCK_KEY = "tapcare.v1.lock";
const memory = {};
const ls = {
  get(k) {
    try {
      return localStorage.getItem(k);
    } catch {
      return memory[k] ?? null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, v);
    } catch {
      memory[k] = v;
    }
  },
  del(k) {
    try {
      localStorage.removeItem(k);
    } catch {
      delete memory[k];
    }
  },
};

function blank() {
  return { records: {}, meta: {}, audit: [], attendance: {} };
}
function readOverlay() {
  try {
    return { ...blank(), ...(JSON.parse(ls.get(LS_KEY)) || {}) };
  } catch {
    return blank();
  }
}
function persist() {
  ls.set(LS_KEY, JSON.stringify(overlay));
  emit("change");
}

export const on = (evt, fn) => ((listeners[evt] ||= []).push(fn), () => (listeners[evt] = listeners[evt].filter((f) => f !== fn)));
const emit = (evt) => (listeners[evt] || []).forEach((fn) => fn());

async function getJson(path) {
  const res = await fetch(path + "?v=" + (window.TAPCARE_BUILD || "1"), { cache: "no-cache" });
  if (!res.ok) throw new Error("Could not load " + path);
  return res.json();
}

export async function init() {
  if (PUB) return;
  [PUB, VAULT] = await Promise.all([getJson("data/public.json"), getJson("data/vault.json")]);
  overlay = readOverlay();
  window.addEventListener("storage", (e) => {
    if (e.key === LS_KEY) {
      overlay = readOverlay();
      emit("sync");
    }
  });
}

export const pub = () => PUB;
export const getSession = () => session;

// ---------- identity helpers ----------
export const normId = (s) => String(s || "").trim().toUpperCase();
export function roleOf(id) {
  const m = /^TC-([PDNHA])-(\d{4,})$/.exec(normId(id));
  return m ? PREFIX[m[1]] : null;
}
const entry = (id) => overlay.records[id] || VAULT.records[id] || null;
export const cardExists = (id) => !!entry(normId(id));
export const displayName = (p) =>
  [p.prefix, p.first, p.middle, p.last, p.suffix].filter(Boolean).join(" ");
export const metaOf = (id) => overlay.meta[id] || {};

// ---------- permissions ----------
export const can = (perm) => !!session && PERMS[session.role].includes(perm);
export function requirePerm(perm) {
  if (!session) throw new AppError("NO_SESSION");
  if (!PERMS[session.role].includes(perm)) {
    logAudit({ action: "denied:" + perm, targetId: "" });
    throw new AppError("DENIED", { perm });
  }
}

// ---------- audit log ----------
export function logAudit({ action, targetId = "", actorId, actorRole, actorName }) {
  const s = session;
  const role = actorRole ?? s?.role ?? "";
  overlay.audit.push({
    ts: new Date().toISOString(),
    actorId: actorId ?? s?.id ?? "",
    actorRole: role,
    // Patient names are never written to the (unencrypted) audit log; only the ID is kept.
    actorName: role === "patient" ? "" : actorName ?? s?.name ?? "",
    action,
    targetId,
  });
  if (overlay.audit.length > 500) overlay.audit.splice(0, overlay.audit.length - 500);
  persist();
}
export function getAudit(filter = () => true) {
  requirePerm("audit:view");
  return overlay.audit.filter(filter).slice().reverse();
}
// A patient may always see who touched their own record.
export function auditForSelf() {
  if (!session || session.role !== "patient") throw new AppError("DENIED");
  return overlay.audit.filter((a) => a.targetId === session.id && a.actorId !== session.id).slice().reverse();
}

// ---------- lockout ----------
function lockTable() {
  try {
    return JSON.parse(ls.get(LOCK_KEY)) || {};
  } catch {
    return {};
  }
}
export function lockStatus(id) {
  const t = lockTable()[id];
  if (t && t.until && t.until > Date.now()) return { locked: true, seconds: Math.ceil((t.until - Date.now()) / 1000) };
  return { locked: false, fails: t?.n || 0 };
}
function noteFail(id) {
  const t = lockTable();
  const cur = t[id] && (!t[id].until || t[id].until > Date.now()) ? t[id] : { n: 0 };
  cur.n = (cur.n || 0) + 1;
  if (cur.n >= CONFIG.maxFails) {
    cur.until = Date.now() + CONFIG.lockSeconds * 1000;
    cur.n = 0;
  }
  t[id] = cur;
  ls.set(LOCK_KEY, JSON.stringify(t));
  return { remaining: Math.max(0, CONFIG.maxFails - (cur.n || 0)), locked: !!cur.until && cur.until > Date.now() };
}
function clearFails(id) {
  const t = lockTable();
  delete t[id];
  ls.set(LOCK_KEY, JSON.stringify(t));
}
function assertUnlocked(id) {
  const s = lockStatus(id);
  if (s.locked) throw new AppError("LOCKED", { seconds: s.seconds });
}

// ---------- login ----------
export async function loginPatient(rawId, pin) {
  const id = normId(rawId);
  if (roleOf(id) !== "patient" || !entry(id)) throw new AppError("NOT_FOUND");
  assertUnlocked(id);
  const e = entry(id);
  let rk;
  try {
    const key = await C.deriveKey(pin, e.rkPw.salt, VAULT.iter);
    rk = await C.unwrapKey(e.rkPw, key, "rk:" + id);
  } catch {
    const r = noteFail(id);
    logAudit({ action: "login_failed", targetId: id, actorId: id, actorRole: "patient", actorName: "" });
    throw new AppError(r.locked ? "LOCKED" : "BAD_SECRET", { remaining: r.remaining, seconds: CONFIG.lockSeconds });
  }
  clearFails(id);
  const rec = await C.openJSON(rk, e.rec, "rec:" + id);
  session = { id, role: "patient", name: displayName(rec.profile), rk, started: Date.now(), mustChangePin: !!metaOf(id).mustChangePin };
  logAudit({ action: "login", targetId: id });
  emit("session");
  return session;
}

export async function loginStaff(rawId, password) {
  const id = normId(rawId);
  const role = roleOf(id);
  if (!STAFF_ROLES.includes(role) || !VAULT.mk[id] || !entry(id)) throw new AppError("NOT_FOUND");
  assertUnlocked(id);
  const e = entry(id);
  let mk, rk;
  try {
    const key = await C.deriveKey(password, VAULT.mk[id].salt, VAULT.iter);
    mk = await C.unwrapKey(VAULT.mk[id], key, "mk:" + id);
    rk = await C.unwrapKey(e.rkPw, key, "rk:" + id);
  } catch {
    const r = noteFail(id);
    logAudit({ action: "login_failed", targetId: id, actorId: id, actorRole: role, actorName: "" });
    throw new AppError(r.locked ? "LOCKED" : "BAD_SECRET", { remaining: r.remaining, seconds: CONFIG.lockSeconds });
  }
  clearFails(id);
  const rec = await C.openJSON(rk, e.rec, "rec:" + id);
  const rsaPriv = await C.importPrivate(await C.open(mk, VAULT.rsa.priv, "rsa-priv"));
  session = { id, role, name: displayName(rec.profile), mk, rk, rsaPriv, rec, started: Date.now() };
  logAudit({ action: "login", targetId: id });
  if (PERMS[role].includes("attendance:self")) timeInIfFirstToday(id);
  emit("session");
  return session;
}

export function logout() {
  if (session) logAudit({ action: "logout", targetId: session.id });
  session = null;
  emit("session");
}

// ---------- record access ----------
async function rkFor(id) {
  const e = entry(id);
  if (!e) throw new AppError("NOT_FOUND");
  if (session.role === "patient") {
    if (id !== session.id) {
      logAudit({ action: "denied:other_record", targetId: id });
      throw new AppError("DENIED");
    }
    return session.rk;
  }
  if (e.rkMk) return C.unwrapKey(e.rkMk, session.mk, "rk:" + id);
  if (e.rkRsa) return C.rsaUnwrap(session.rsaPriv, e.rkRsa);
  throw new AppError("NOT_FOUND");
}

export async function getOwnRecord() {
  if (!session || session.role !== "patient") throw new AppError("DENIED");
  const id = session.id;
  return C.openJSON(session.rk, entry(id).rec, "rec:" + id);
}

export async function getPatientRecord(id) {
  requirePerm("patients:read");
  if (roleOf(id) !== "patient") throw new AppError("NOT_FOUND");
  const rk = await rkFor(id);
  const rec = await C.openJSON(rk, entry(id).rec, "rec:" + id);
  logAudit({ action: "view_record", targetId: id });
  const clinicalAllowed = can("patients:clinical") || CONFIG.helpdeskSeesClinical;
  return { rec, clinicalAllowed, meta: metaOf(id) };
}

async function saveRecord(id, rk, rec) {
  const e = entry(id);
  overlay.records[id] = { ...e, rec: await C.sealJSON(rk, rec, "rec:" + id) };
  persist();
}

const newId = () => "n" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export async function addNote(patientId, note) {
  requirePerm("notes:write");
  const rk = await rkFor(patientId);
  const rec = await C.openJSON(rk, entry(patientId).rec, "rec:" + patientId);
  rec.history.unshift({
    id: newId(),
    date: manilaDate(),
    type: note.type || "Outpatient consultation",
    hospitalId: session.rec.employment?.hospitalId || "",
    doctorId: session.id,
    doctorName: session.name,
    department: session.rec.employment?.department || "",
    complaint: note.complaint,
    icd: note.icd || "",
    diagnosis: note.diagnosis,
    notes: note.notes,
    plan: note.plan,
    followUp: note.followUp || "",
  });
  await saveRecord(patientId, rk, rec);
  logAudit({ action: "add_note", targetId: patientId });
  return rec;
}

export async function addVitals(patientId, v) {
  requirePerm("vitals:write");
  const rk = await rkFor(patientId);
  const rec = await C.openJSON(rk, entry(patientId).rec, "rec:" + patientId);
  rec.vitals.unshift({ date: manilaDate(), recordedBy: session.name, ...v });
  await saveRecord(patientId, rk, rec);
  logAudit({ action: "add_vitals", targetId: patientId });
  return rec;
}

// ---------- patient directory (staff) ----------
export function toIndex(id, rec, meta = {}) {
  const p = rec.profile;
  return {
    id,
    last: p.last,
    first: p.first,
    middle: p.middle || "",
    suffix: p.suffix || "",
    dob: p.dob,
    sex: p.sex,
    phone: p.phone,
    city: p.address?.city || "",
    hospitalId: p.primaryHospitalId || "",
    verified: meta.verified !== false,
  };
}

export async function listPatients() {
  requirePerm("patients:list");
  const base = await C.openJSON(session.mk, VAULT.index, "index");
  const have = new Set(base.map((x) => x.id));
  for (const [id, e] of Object.entries(overlay.records)) {
    if (roleOf(id) !== "patient" || have.has(id)) continue;
    try {
      const rk = await rkFor(id);
      base.push(toIndex(id, await C.openJSON(rk, e.rec, "rec:" + id), metaOf(id)));
    } catch {
      /* skip unreadable */
    }
  }
  base.forEach((x) => {
    if (overlay.meta[x.id]) x.verified = overlay.meta[x.id].verified !== false;
  });
  base.sort(
    (a, b) =>
      a.last.localeCompare(b.last, "en", { sensitivity: "base" }) ||
      a.first.localeCompare(b.first, "en", { sensitivity: "base" })
  );
  logAudit({ action: "list_patients", targetId: "" });
  return base;
}

// ---------- registration ----------
function nextPatientId() {
  const nums = [...Object.keys(VAULT.records), ...Object.keys(overlay.records)]
    .map((k) => /^TC-P-(\d+)$/.exec(k))
    .filter(Boolean)
    .map((m) => +m[1]);
  return "TC-P-" + String(Math.max(1000, ...nums) + 1).padStart(4, "0");
}

function buildPatientRecord(id, f) {
  const csv = (s) => String(s || "").split(",").map((x) => x.trim()).filter(Boolean);
  return {
    id,
    kind: "patient",
    profile: {
      first: f.first.trim(),
      middle: (f.middle || "").trim(),
      last: f.last.trim(),
      suffix: (f.suffix || "").trim(),
      dob: f.dob,
      sex: f.sex,
      civil: f.civil || "",
      bloodType: f.bloodType || "Unknown",
      heightCm: null,
      weightKg: null,
      address: { line: f.line || "", barangay: f.barangay || "", city: f.city || "", province: f.province || "Laguna" },
      phone: f.phone,
      email: f.email || "",
      philhealth: "",
      emergency: { name: f.emName || "", relation: f.emRelation || "", phone: f.emPhone || "" },
      primaryHospitalId: f.hospitalId || "",
      attendingId: "",
      registeredAt: new Date().toISOString(),
    },
    allergies: csv(f.allergies).map((name) => ({ name, reaction: "Self-reported", severity: "Unverified" })),
    conditions: csv(f.conditions).map((name) => ({ name, since: "", status: "Self-reported", notes: "" })),
    medications: [],
    immunizations: [],
    vitals: [],
    history: [],
    labs: [],
    appointments: [],
    sharedWith: f.hospitalId ? [f.hospitalId] : [],
    accessLog: [],
  };
}

export async function registerSelf(f, pin) {
  await init();
  const id = nextPatientId();
  const rec = buildPatientRecord(id, f);
  const rk = await C.newKey();
  const salt = C.randomB64(16);
  const key = await C.deriveKey(pin, salt, VAULT.iter);
  overlay.records[id] = {
    rec: await C.sealJSON(rk, rec, "rec:" + id),
    rkPw: { salt, ...(await C.wrapKey(rk, key, "rk:" + id)) },
    rkRsa: await C.rsaWrap(PUB.rsaPublic, rk),
  };
  overlay.meta[id] = { verified: false, source: "self", createdAt: new Date().toISOString() };
  logAudit({ action: "self_register", targetId: id, actorId: id, actorRole: "patient", actorName: "" });
  return id;
}

export async function registerByHelpdesk(f) {
  requirePerm("patients:register");
  const id = nextPatientId();
  const rec = buildPatientRecord(id, f);
  rec.profile.attendingId = "";
  const rk = await C.newKey();
  const tempPin = String(globalThis.crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, "0");
  const salt = C.randomB64(16);
  const key = await C.deriveKey(tempPin, salt, VAULT.iter);
  overlay.records[id] = {
    rec: await C.sealJSON(rk, rec, "rec:" + id),
    rkPw: { salt, ...(await C.wrapKey(rk, key, "rk:" + id)) },
    rkMk: await C.wrapKey(rk, session.mk, "rk:" + id),
  };
  overlay.meta[id] = { verified: true, verifiedBy: session.name, verifiedAt: new Date().toISOString(), mustChangePin: true, source: "helpdesk" };
  logAudit({ action: "register_patient", targetId: id });
  return { id, tempPin };
}

export function verifyPatient(id) {
  requirePerm("patients:verify");
  overlay.meta[id] = { ...(overlay.meta[id] || {}), verified: true, verifiedBy: session.name, verifiedAt: new Date().toISOString() };
  logAudit({ action: "verify_identity", targetId: id });
}

export async function changePin(newPin) {
  if (!session || session.role !== "patient") throw new AppError("DENIED");
  const id = session.id;
  const salt = C.randomB64(16);
  const key = await C.deriveKey(newPin, salt, VAULT.iter);
  overlay.records[id] = { ...entry(id), rkPw: { salt, ...(await C.wrapKey(session.rk, key, "rk:" + id)) } };
  overlay.meta[id] = { ...(overlay.meta[id] || {}), mustChangePin: false };
  session.mustChangePin = false;
  logAudit({ action: "change_pin", targetId: id });
}

// ---------- attendance ----------
export const manilaDate = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(d);
export function manilaNow(d = new Date()) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return { dow: p.weekday.toLowerCase().slice(0, 3), minutes: (+p.hour % 24) * 60 + +p.minute };
}
const toMin = (hhmm) => +hhmm.slice(0, 2) * 60 + +hhmm.slice(3, 5);

function timeInIfFirstToday(id) {
  const today = manilaDate();
  overlay.attendance[id] ||= {};
  if (!overlay.attendance[id][today]) {
    overlay.attendance[id][today] = { in: new Date().toISOString(), out: null };
    logAudit({ action: "time_in", targetId: id });
  }
}
export function timeOut() {
  requirePerm("attendance:self");
  const a = overlay.attendance[session.id]?.[manilaDate()];
  if (a && !a.out) {
    a.out = new Date().toISOString();
    logAudit({ action: "time_out", targetId: session.id });
  }
}
export function timeInAgain() {
  requirePerm("attendance:self");
  const a = overlay.attendance[session.id]?.[manilaDate()];
  if (a && a.out) {
    a.out = null;
    logAudit({ action: "time_in_again", targetId: session.id });
  } else timeInIfFirstToday(session.id);
}
export const attendanceToday = (id) => overlay.attendance[id]?.[manilaDate()] || null;
export function attendanceHistory(id) {
  const seed = PUB.attendanceSeed?.[id] || {};
  const rows = Object.entries(seed).map(([date, v]) => ({ date, in: v.in, out: v.out, seeded: true }));
  for (const [date, v] of Object.entries(overlay.attendance[id] || {})) {
    const fmt = (iso) => (iso ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso)) : "");
    const i = rows.findIndex((r) => r.date === date);
    const row = { date, in: fmt(v.in), out: fmt(v.out), seeded: false };
    if (i >= 0) rows[i] = row;
    else rows.push(row);
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date));
}

// Public availability: combines the weekly schedule with real card-tap attendance.
export function staffStatus(id, now = new Date()) {
  const st = PUB.staff.find((s) => s.id === id);
  const att = overlay.attendance[id]?.[manilaDate(now)];
  if (att) return att.out ? { state: "out", at: att.out } : { state: "present", at: att.in };
  const { dow, minutes } = manilaNow(now);
  const windows = st?.schedule?.[dow] || [];
  if (!windows.length) return { state: "off" };
  if (st.demoPresent) return { state: "present", at: null, demo: true };
  const inWin = windows.some(([a, b]) => minutes >= toMin(a) && minutes < toMin(b));
  if (inWin) return { state: "awaiting" };
  if (windows.every(([, b]) => minutes >= toMin(b))) return { state: "done" };
  return { state: "later" };
}

export function allAttendanceToday() {
  requirePerm("attendance:all");
  return PUB.staff.map((s) => ({ ...s, status: staffStatus(s.id), today: attendanceToday(s.id) }));
}

// Reset all demo data stored in this browser (patients registered, notes, attendance, audit log).
export function resetDemo() {
  ls.del(LS_KEY);
  ls.del(LOCK_KEY);
  overlay = blank();
  session = null;
  emit("session");
  emit("change");
}
