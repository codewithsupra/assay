import { env } from '../config/env.js';

// One probe = a liveness/latency check of the target plus contract checks of
// each declared endpoint. M1 is read-only, low-rate observation (uptime +
// contract). Sustained load generation is M2's runner fleet.

async function timedFetch(url, { method = 'GET', timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = process.hrtime.bigint();
  try {
    const res = await fetch(url, { method, signal: controller.signal, redirect: 'follow' });
    // Read the body once here so latency reflects a full response (not just
    // headers) and callers can inspect it without a second consume.
    const bodyText = await res.text();
    const latencyMs = Number((process.hrtime.bigint() - start) / 1000000n);
    return { res, latencyMs, bodyText };
  } finally {
    clearTimeout(timer);
  }
}

async function checkContractEntry(baseUrl, entry, timeoutMs) {
  const url = new URL(entry.path, baseUrl).toString();
  const method = (entry.method || 'GET').toUpperCase();
  try {
    const { res, bodyText } = await timedFetch(url, { method, timeoutMs });
    if (entry.expectStatus && res.status !== entry.expectStatus) {
      return { path: entry.path, reason: `expected status ${entry.expectStatus}, got ${res.status}` };
    }
    if (Array.isArray(entry.expectJsonKeys) && entry.expectJsonKeys.length) {
      let body;
      try {
        body = JSON.parse(bodyText);
      } catch {
        return { path: entry.path, reason: 'expected JSON body, got non-JSON' };
      }
      const missing = entry.expectJsonKeys.filter((k) => !(k in (body || {})));
      if (missing.length) {
        return { path: entry.path, reason: `missing JSON keys: ${missing.join(', ')}` };
      }
    }
    return null; // no violation
  } catch (err) {
    return { path: entry.path, reason: `request failed: ${err.message}` };
  }
}

// project: { target_url, endpoint_spec }
export async function runProbe(project) {
  const timeoutMs = env.PROBE_TIMEOUT_MS;
  const result = {
    ok: false,
    status_code: null,
    latency_ms: null,
    error: null,
    contract_ok: true,
    contract_violations: [],
  };

  try {
    const { res, latencyMs } = await timedFetch(project.target_url, { timeoutMs });
    result.status_code = res.status;
    result.latency_ms = latencyMs;
    result.ok = res.status >= 200 && res.status < 400;
    if (!result.ok) result.error = `status ${res.status}`;
  } catch (err) {
    result.error = err.name === 'AbortError' ? `timeout after ${timeoutMs}ms` : err.message;
    return result; // if the base target is down, skip contract checks
  }

  const spec = Array.isArray(project.endpoint_spec) ? project.endpoint_spec : [];
  for (const entry of spec) {
    const violation = await checkContractEntry(project.target_url, entry, timeoutMs);
    if (violation) result.contract_violations.push(violation);
  }
  result.contract_ok = result.contract_violations.length === 0;
  return result;
}
