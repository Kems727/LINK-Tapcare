// TapCare demo crypto helpers (WebCrypto). Works in browsers and Node 18+.
// Scheme: envelope encryption.
//   record  --AES-256-GCM-->  ciphertext          (key = record key RK, one per record)
//   RK      --wrapped by-->   patient PIN key     (patient can open only their own record)
//   RK      --wrapped by-->   master key MK       (authorized staff can open any record)
//   MK      --wrapped by-->   each staff member's password key (PBKDF2-SHA256)
// Every ciphertext is bound to its record id with AES-GCM additional data (AAD).

const enc = new TextEncoder();
const dec = new TextDecoder();
const subtle = globalThis.crypto.subtle;

export const KDF_ITER = 250000;

export const b64 = {
  to(buf) {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  },
  from(str) {
    const bin = atob(str);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  },
};

export const randomB64 = (n = 16) => b64.to(globalThis.crypto.getRandomValues(new Uint8Array(n)));

export async function deriveKey(secret, saltB64, iter = KDF_ITER) {
  const base = await subtle.importKey("raw", enc.encode(secret), "PBKDF2", false, ["deriveKey"]);
  return subtle.deriveKey(
    { name: "PBKDF2", salt: b64.from(saltB64), iterations: iter, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export const newKey = () => subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
export const importKey = (raw) => subtle.importKey("raw", raw, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
export const exportKey = async (key) => new Uint8Array(await subtle.exportKey("raw", key));

export async function seal(key, bytes, aad = "") {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(aad) }, key, bytes);
  return { iv: b64.to(iv), ct: b64.to(ct) };
}

// Throws if the key is wrong or the data/AAD was tampered with.
export async function open(key, blob, aad = "") {
  const pt = await subtle.decrypt(
    { name: "AES-GCM", iv: b64.from(blob.iv), additionalData: enc.encode(aad) },
    key,
    b64.from(blob.ct)
  );
  return new Uint8Array(pt);
}

export const sealJSON = (key, obj, aad = "") => seal(key, enc.encode(JSON.stringify(obj)), aad);
export const openJSON = async (key, blob, aad = "") => JSON.parse(dec.decode(await open(key, blob, aad)));

// Wrap a key under another (already derived) key.
export async function wrapKey(keyToWrap, wrapper, aad) {
  return seal(wrapper, await exportKey(keyToWrap), aad);
}
export async function unwrapKey(blob, wrapper, aad) {
  return importKey(await open(wrapper, blob, aad));
}

// RSA-OAEP: lets a self-registering patient hand a record key to staff without ever seeing the master key.
export async function newRsa() {
  const pair = await subtle.generateKey(
    { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["encrypt", "decrypt"]
  );
  return { publicJwk: await subtle.exportKey("jwk", pair.publicKey), privateKey: pair.privateKey };
}
export const exportPrivate = async (priv) => new Uint8Array(await subtle.exportKey("pkcs8", priv));
export const importPrivate = (bytes) =>
  subtle.importKey("pkcs8", bytes, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["decrypt"]);
export async function rsaWrap(publicJwk, key) {
  const pub = await subtle.importKey("jwk", publicJwk, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]);
  return b64.to(await subtle.encrypt({ name: "RSA-OAEP" }, pub, await exportKey(key)));
}
export async function rsaUnwrap(privateKey, wrappedB64) {
  const raw = await subtle.decrypt({ name: "RSA-OAEP" }, privateKey, b64.from(wrappedB64));
  return importKey(new Uint8Array(raw));
}
