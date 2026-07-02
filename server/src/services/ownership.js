import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import { env } from '../config/env.js';

// THE CONSENT PILLAR.
//
// Assay is a load and probe generator. Pointed at an arbitrary URL it is a
// DDoS cannon. So no target is ever probed until its owner proves control of
// it. Verification is a hard gate in the data model (projects.verified_at) and
// enforced here, not a compliance checkbox.
//
// Two proof methods, either sufficient:
//   1. HTTP  — serve the token at https://<host>/.well-known/assay-verify.txt
//   2. DNS   — publish a TXT record: assay-verify.<host> = "assay-verify=<token>"

export function generateToken() {
  return `assay-verify-${crypto.randomBytes(24).toString('hex')}`;
}

export function hostFromUrl(rawUrl) {
  const u = new URL(rawUrl);
  return u.host;
}

async function checkHttp(targetUrl, token) {
  const origin = new URL(targetUrl).origin;
  const url = origin + env.VERIFY_PATH;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'manual' });
    if (!res.ok) return { ok: false, detail: `GET ${url} returned ${res.status}` };
    const body = (await res.text()).trim();
    if (body.includes(token)) return { ok: true, method: 'http' };
    return { ok: false, detail: `token not found at ${url}` };
  } catch (err) {
    return { ok: false, detail: `HTTP check failed: ${err.message}` };
  } finally {
    clearTimeout(timer);
  }
}

async function checkDns(targetUrl, token) {
  const host = new URL(targetUrl).hostname;
  const name = `assay-verify.${host}`;
  try {
    const records = await dns.resolveTxt(name);
    const flat = records.map((chunks) => chunks.join('')).join(' ');
    if (flat.includes(token)) return { ok: true, method: 'dns' };
    return { ok: false, detail: `TXT ${name} present but token not found` };
  } catch (err) {
    return { ok: false, detail: `DNS check failed: ${err.message}` };
  }
}

// Try HTTP first (fastest to set up), fall back to DNS.
export async function verifyOwnership(targetUrl, token) {
  const http = await checkHttp(targetUrl, token);
  if (http.ok) return http;
  const dnsResult = await checkDns(targetUrl, token);
  if (dnsResult.ok) return dnsResult;
  return { ok: false, detail: `${http.detail}; ${dnsResult.detail}` };
}
