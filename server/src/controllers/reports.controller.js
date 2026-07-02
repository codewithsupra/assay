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

// SVG badge (Verified: 99.97% uptime · p95 142ms). Embeddable in a README.
export const reportBadge = asyncHandler(async (req, res) => {
  const report = await getReportByPublicId(req.params.publicId);
  if (!report) throw new ApiError(404, 'report not found');
  const s = report.payload.summary;
  const label = 'Assay verified';
  const value =
    s.uptime_pct != null
      ? `${s.uptime_pct}% up · p95 ${s.p95_latency_ms ?? '—'}ms`
      : 'pending';
  const valueWidth = 8 + value.length * 6.5;
  const labelWidth = 86;
  const total = labelWidth + valueWidth;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${total}" height="20" role="img" aria-label="${label}: ${value}">
  <rect rx="3" width="${total}" height="20" fill="#555"/>
  <rect rx="3" x="${labelWidth}" width="${valueWidth}" height="20" fill="#34d399"/>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,sans-serif" font-size="11">
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
  const valid = verifyReport(payload, report.signature, report.public_key);
  res.set('Content-Type', 'text/html');
  res.send(`<!doctype html><html><head><meta charset="utf-8">
<title>Assay report · ${payload.project.name}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  html{background:#f9fafb}
  body{font-family:system-ui,sans-serif;max-width:640px;margin:0 auto;padding:3rem 1rem;color:#111;background:#fff;min-height:100vh}
  .card{border:1px solid #e5e7eb;border-radius:12px;padding:1.5rem;margin:1rem 0}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:1rem}
  .metric{font-size:1.8rem;font-weight:700}
  .label{color:#6b7280;font-size:.8rem;text-transform:uppercase;letter-spacing:.05em}
  .sig{font-family:monospace;font-size:.75rem;word-break:break-all;color:#374151}
  .ok{color:#059669;font-weight:600}.bad{color:#dc2626;font-weight:600}
  a{color:#059669}
</style></head><body>
  <h1>Assay report</h1>
  <p><strong>${payload.project.name}</strong> — <a href="${payload.project.target_url}">${payload.project.target_url}</a></p>
  <div class="card grid">
    <div><div class="label">Uptime</div><div class="metric">${s.uptime_pct ?? '—'}%</div></div>
    <div><div class="label">p95 latency</div><div class="metric">${s.p95_latency_ms ?? '—'} ms</div></div>
    <div><div class="label">Contract violations</div><div class="metric">${s.contract_violations}</div></div>
    <div><div class="label">Probes (${s.window_hours}h)</div><div class="metric">${s.total_probes}</div></div>
  </div>
  <div class="card">
    <div class="label">Signature (Ed25519)</div>
    <p class="${valid ? 'ok' : 'bad'}">${valid ? '✓ Signature valid — this report is tamper-evident' : '✗ Signature INVALID'}</p>
    <div class="sig">${report.signature}</div>
    <p><a href="/r/${payload.public_id}.json">Raw signed JSON</a> · <img src="/r/${payload.public_id}/badge.svg" alt="badge"></p>
  </div>
  <p style="color:#9ca3af;font-size:.8rem">Issued ${payload.issued_at}</p>
</body></html>`);
});
