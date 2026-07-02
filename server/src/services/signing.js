import crypto from 'node:crypto';
import { env } from '../config/env.js';

// Ed25519 signing for tamper-evident reports. A signed report is worth more
// than a screenshot precisely because anyone can verify it wasn't edited.

let keyPair = null;

function loadOrGenerateKey() {
  if (keyPair) return keyPair;
  if (env.SIGNING_KEY_PEM) {
    const privateKey = crypto.createPrivateKey(env.SIGNING_KEY_PEM);
    const publicKey = crypto.createPublicKey(privateKey);
    keyPair = { privateKey, publicKey };
  } else {
    // Dev/test convenience: ephemeral key so nothing breaks without config.
    // In production SIGNING_KEY_PEM must be set (stable public key).
    keyPair = crypto.generateKeyPairSync('ed25519');
  }
  return keyPair;
}

// Deterministic serialization so the same payload always signs/verifies the
// same way regardless of key insertion order.
export function canonicalize(value) {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function publicKeyBase64() {
  const { publicKey } = loadOrGenerateKey();
  const raw = publicKey.export({ type: 'spki', format: 'der' });
  return raw.toString('base64');
}

export function signReport(payload) {
  const { privateKey } = loadOrGenerateKey();
  const message = Buffer.from(canonicalize(payload), 'utf8');
  const signature = crypto.sign(null, message, privateKey);
  return { signature: signature.toString('base64'), publicKey: publicKeyBase64() };
}

export function verifyReport(payload, signatureB64, publicKeyB64) {
  try {
    const publicKey = crypto.createPublicKey({
      key: Buffer.from(publicKeyB64, 'base64'),
      format: 'der',
      type: 'spki',
    });
    const message = Buffer.from(canonicalize(payload), 'utf8');
    return crypto.verify(null, message, publicKey, Buffer.from(signatureB64, 'base64'));
  } catch {
    return false;
  }
}
