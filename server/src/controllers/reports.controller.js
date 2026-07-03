import { asyncHandler, ApiError } from '../middleware/error.js';
import { getReportByPublicId } from '../services/reports.js';
import { verifyReport } from '../services/signing.js';

// Public, unauthenticated report JSON. Anyone with the public_id can fetch and
// independently verify the signature — that is the whole point.
export const publicReportJson = asyncHandler(async (req, res) => {
  const report = await getReportByPublicId(req.params.publicId);
  if (!report) throw new ApiError(404, 'report not found');
  const valid = verifyReport(report.payload, report.signature, report.public_key);
  res.json({
    payload: report.payload,
    signature: report.signature,
    public_key: report.public_key,
    signature_valid: valid,
    created_at: report.created_at,
  });
});

// SVG badge (Verified: 300 req/s · p99 142ms · 99.97% up). Embeddable in a README.
export const reportBadge = asyncHandler(async (req, res) => {
  const report = await getReportByPublicId(req.params.publicId);
  if (!report) throw new ApiError(404, 'report not found');
  const { summary: s, load } = report.payload;
  const label = 'Assay verified';
  const value = load
    ? `${load.rps_sustained} req/s · p99 ${load.latency_p99_ms}ms · ${s.uptime_pct ?? '—'}% up`
    : s.uptime_pct != null
      ? `${s.uptime_pct}% up · p95 ${s.p95_latency_ms ?? '—'}ms`
      : 'pending';
  const valueWidth = 8 + value.length * 6.5;
  const labelWidth = 86;
  const total = labelWidth + valueWidth;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${total}" height="20" role="img" aria-label="${label}: ${value}">
  <defs>
    <linearGradient id="ember" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ff8a3d"/>
      <stop offset="100%" stop-color="#e63a1f"/>
    </linearGradient>
  </defs>
  <rect rx="3" width="${total}" height="20" fill="#121116"/>
  <rect rx="3" x="${labelWidth}" width="${valueWidth}" height="20" fill="url(#ember)"/>
  <g fill="#f4f2f7" text-anchor="middle" font-family="Verdana,sans-serif" font-size="11">
    <text x="${labelWidth / 2}" y="14">${label}</text>
    <text x="${labelWidth + valueWidth / 2}" y="14">${value}</text>
  </g>
</svg>`;
  res.set('Content-Type', 'image/svg+xml');
  res.set('Cache-Control', 'max-age=300');
  res.send(svg);
});

// Minimal public HTML report page.
export const publicReportPage = asyncHandler(async (req, res) => {
  const report = await getReportByPublicId(req.params.publicId);
  if (!report) return res.status(404).send('<h1>Report not found</h1>');
  const { payload } = report;
  const s = payload.summary;
  const load = payload.load;
  const valid = verifyReport(payload, report.signature, report.public_key);
  const loadCard = load
    ? `<div class="card grid">
    <div><div class="label">Sustained RPS</div><div class="metric">${load.rps_sustained}</div></div>
    <div><div class="label">p99 load latency</div><div class="metric">${load.latency_p99_ms} ms</div></div>
    <div><div class="label">Load errors</div><div class="metric">${load.errors + load.timeouts}</div></div>
    <div><div class="label">Campaign duration</div><div class="metric">${load.duration_s}s @ ${load.connections}c</div></div>
  </div>`
    : '';
  res.set('Content-Type', 'text/html');
  res.send(`<!doctype html><html><head><meta charset="utf-8">
<title>Assay report · ${payload.project.name}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root{
    --void:#08070a; --char-900:#121116; --char-800:#18171d;
    --ink-100:#f4f2f7; --ink-300:#cac6d4; --ink-500:#8d879b;
    --ember-400:#ffb86b; --ember-600:#ff5a2e; --ember-700:#e63a1f;
    --verified-500:#34d399;
  }
  html{background:var(--void)}
  body{
    font-family:'Inter',system-ui,sans-serif; max-width:640px; margin:0 auto;
    padding:4rem 1.5rem; color:var(--ink-100); background:var(--void); min-height:100vh;
  }
  h1{font-family:'Space Grotesk',sans-serif; font-size:1.75rem; font-weight:700; letter-spacing:-0.02em; margin:0 0 .5rem}
  .brand{display:flex; align-items:center; gap:.5rem; margin-bottom:2rem; color:var(--ink-500); font-size:.85rem; font-weight:600}
  .brand .dot{width:9px;height:9px;border-radius:50%;background:linear-gradient(135deg,var(--ember-400),var(--ember-700));box-shadow:0 0 10px 1px rgba(255,90,46,.6)}
  .card{border:1px solid rgba(255,255,255,.08); background:rgba(24,23,29,.7); border-radius:16px; padding:1.5rem; margin:1rem 0}
  .grid{display:grid; grid-template-columns:1fr 1fr; gap:1.25rem}
  .metric{font-family:'Space Grotesk',sans-serif; font-size:1.7rem; font-weight:700; color:var(--ink-100)}
  .label{color:var(--ink-500); font-size:.7rem; text-transform:uppercase; letter-spacing:.07em; margin-bottom:.15rem}
  .sig{font-family:'JetBrains Mono',monospace; font-size:.7rem; word-break:break-all; color:var(--ink-500); background:var(--char-900); padding:.75rem; border-radius:8px; margin-top:.5rem}
  .ok{color:var(--verified-500); font-weight:600}.bad{color:#f87171; font-weight:600}
  a{color:var(--ember-400); text-decoration:none}
  a:hover{color:var(--ember-400); text-decoration:underline}
  .target{color:var(--ink-500); font-size:.9rem; margin-bottom:2rem}
  .footer{color:#5c5768; font-size:.75rem; margin-top:2rem}
  img.badge{vertical-align:middle}
</style></head><body>
  <div class="brand"><span class="dot"></span>ASSAY VERIFIED REPORT</div>
  <h1>${payload.project.name}</h1>
  <p class="target"><a href="${payload.project.target_url}">${payload.project.target_url}</a></p>
  <div class="card grid">
    <div><div class="label">Uptime</div><div class="metric">${s.uptime_pct ?? '—'}%</div></div>
    <div><div class="label">p95 latency</div><div class="metric">${s.p95_latency_ms ?? '—'} ms</div></div>
    <div><div class="label">Contract violations</div><div class="metric">${s.contract_violations}</div></div>
    <div><div class="label">Probes (${s.window_hours}h)</div><div class="metric">${s.total_probes}</div></div>
  </div>
  ${loadCard}
  <div class="card">
    <div class="label">Signature (Ed25519)</div>
    <p class="${valid ? 'ok' : 'bad'}">${valid ? '✓ Signature valid — this report is tamper-evident' : '✗ Signature INVALID'}</p>
    <div class="sig">${report.signature}</div>
    <p style="margin-top:1rem"><a href="/r/${payload.public_id}.json">Raw signed JSON</a> &nbsp;·&nbsp; <img class="badge" src="/r/${payload.public_id}/badge.svg" alt="badge"></p>
  </div>
  <p class="footer">Issued ${payload.issued_at}</p>
</body></html>`);
});
