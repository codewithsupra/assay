import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../lib/api';
import { connectSocket, getSocket } from '../lib/socket';
import { Button, Card, Input, Pill, Spinner } from '../components/ui';

export default function ProjectDetail() {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [verification, setVerification] = useState(null);
  const [probes, setProbes] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [liveProgress, setLiveProgress] = useState(null);
  const [error, setError] = useState(null);
  const [verifying, setVerifying] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [p, probeData, campaignData] = await Promise.all([
        api.getProject(id),
        api.recentProbes(id).catch(() => ({ probes: [] })),
        api.listCampaigns(id).catch(() => ({ campaigns: [] })),
      ]);
      setProject(p.project);
      setProbes(probeData.probes);
      setCampaigns(campaignData.campaigns);
    } catch (err) {
      setError(err.message);
    }
  }, [id]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 8000);
    return () => clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    const socket = connectSocket();
    socket.emit('subscribe', id);
    const onProgress = (evt) => {
      if (evt.projectId !== id) return;
      if (evt.type === 'campaign:progress') setLiveProgress(evt.sample);
      if (['campaign:done', 'campaign:aborted', 'campaign:failed'].includes(evt.type)) {
        setLiveProgress(null);
        refresh();
      }
    };
    socket.on('campaign:progress', onProgress);
    socket.on('campaign:done', onProgress);
    socket.on('campaign:aborted', onProgress);
    socket.on('campaign:failed', onProgress);
    return () => {
      socket.off('campaign:progress', onProgress);
      socket.off('campaign:done', onProgress);
      socket.off('campaign:aborted', onProgress);
      socket.off('campaign:failed', onProgress);
    };
  }, [id, refresh]);

  async function handleVerify() {
    setVerifying(true);
    setError(null);
    try {
      await api.verifyProject(id);
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setVerifying(false);
    }
  }

  if (!project) {
    return (
      <div className="flex justify-center py-24">
        <Spinner className="h-6 w-6 text-ink-500" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <Link to="/app" className="text-sm text-ink-500 hover:text-ink-300">
        ← All projects
      </Link>

      <div className="mt-4 flex items-start justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink-100">{project.name}</h1>
          <a href={project.target_url} target="_blank" rel="noreferrer" className="text-sm text-ink-500 hover:text-ember-400">
            {project.target_url}
          </a>
        </div>
        {project.verified_at ? <Pill tone="verified">Verified</Pill> : <Pill tone="ember">Unverified</Pill>}
      </div>

      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

      {!project.verified_at && (
        <VerifyPanel projectId={id} onVerify={handleVerify} verifying={verifying} />
      )}

      {project.verified_at && (
        <>
          <ProbesPanel probes={probes} />
          <CampaignPanel projectId={id} campaigns={campaigns} liveProgress={liveProgress} onRefresh={refresh} />
          <ReportPanel projectId={id} />
        </>
      )}
    </div>
  );
}

function VerifyPanel({ projectId, onVerify, verifying }) {
  const [details, setDetails] = useState(null);

  // The create-project response carries verification instructions, but if the
  // user navigated here directly we don't have them -- refetch the project
  // only has verify_token, not the instructions object, so reconstruct the
  // well-known path client-side; the token itself is visible on the project.
  useEffect(() => {
    api.getProject(projectId).then((d) => setDetails(d.project));
  }, [projectId]);

  return (
    <Card className="mt-8 p-7">
      <h2 className="font-display text-lg font-semibold text-ink-100">Prove you own this target</h2>
      <p className="mt-1 text-sm text-ink-500">
        No probe or load test runs until this passes. Either method works.
      </p>
      <div className="mt-5 space-y-3 rounded-xl bg-char-900 p-4 font-mono text-xs text-ink-300">
        <p className="text-ink-500"># Option 1 — serve this file:</p>
        <p>
          GET {details?.target_url}
          <span className="text-ember-400">/.well-known/assay-verify.txt</span>
        </p>
        <p className="break-all text-verified-400">{details?.verify_token}</p>
        <p className="pt-2 text-ink-500"># Option 2 — DNS TXT record:</p>
        <p>assay-verify.{details?.target_host} = "{details?.verify_token}"</p>
      </div>
      <Button onClick={onVerify} disabled={verifying} className="mt-5">
        {verifying ? <Spinner className="h-4 w-4" /> : "I've set it up — verify now"}
      </Button>
    </Card>
  );
}

function ProbesPanel({ probes }) {
  return (
    <Card className="mt-8 p-7">
      <h2 className="font-display text-lg font-semibold text-ink-100">Recent probes</h2>
      {probes.length === 0 ? (
        <p className="mt-3 text-sm text-ink-500">No probes recorded yet — the scheduler runs on an interval.</p>
      ) : (
        <div className="mt-4 divide-y divide-white/5">
          {probes.slice(0, 8).map((p, i) => (
            <div key={i} className="flex items-center justify-between py-2.5 text-sm">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${p.ok ? 'bg-verified-500' : 'bg-red-500'}`} />
                <span className="text-ink-300">{new Date(p.created_at).toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-4 text-ink-500">
                <span>{p.latency_ms ?? '—'} ms</span>
                {!p.contract_ok && <Pill tone="danger">contract violation</Pill>}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function CampaignPanel({ projectId, campaigns, liveProgress, onRefresh }) {
  const [form, setForm] = useState({ connections: 10, durationS: 10 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const active = campaigns.find((c) => c.status === 'queued' || c.status === 'running');

  async function launch(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.createCampaign(projectId, form);
      onRefresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-8 p-7">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-ink-100">Load campaigns</h2>
        <span className="text-xs text-ink-700">Hard capped &amp; cooldown-protected — see docs</span>
      </div>

      <AnimatePresence>
        {active && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-4 overflow-hidden rounded-xl border border-ember-500/30 bg-ember-500/5 p-4"
          >
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ember-500 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-ember-500" />
              </span>
              <span className="text-sm font-medium text-ember-400">Campaign {active.status}…</span>
            </div>
            {liveProgress && (
              <p className="mt-2 font-mono text-xs text-ink-300">
                {liveProgress.requests} requests · {liveProgress.errors} errors ({liveProgress.error_pct}%)
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {!active && (
        <form onSubmit={launch} className="mt-4 flex flex-wrap items-end gap-3">
          <Input
            label="Connections"
            type="number"
            min={1}
            max={50}
            value={form.connections}
            onChange={(e) => setForm({ ...form, connections: e.target.value })}
            className="w-28"
          />
          <Input
            label="Duration (s)"
            type="number"
            min={1}
            max={30}
            value={form.durationS}
            onChange={(e) => setForm({ ...form, durationS: e.target.value })}
            className="w-28"
          />
          <Button type="submit" disabled={busy}>
            {busy ? <Spinner className="h-4 w-4" /> : 'Launch campaign'}
          </Button>
        </form>
      )}
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      <div className="mt-5 divide-y divide-white/5">
        {campaigns
          .filter((c) => c.status === 'done')
          .slice(0, 5)
          .map((c) => (
            <div key={c.id} className="flex items-center justify-between py-2.5 text-sm">
              <span className="text-ink-500">{new Date(c.created_at).toLocaleString()}</span>
              <span className="font-mono text-xs text-ink-300">
                {c.result?.rps_sustained} req/s · p99 {c.result?.latency_p99_ms}ms · {c.result?.errors} errors
              </span>
            </div>
          ))}
      </div>
    </Card>
  );
}

function ReportPanel({ projectId }) {
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const d = await api.createReport(projectId, 168);
      setReport(d);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-8 p-7">
      <h2 className="font-display text-lg font-semibold text-ink-100">Signed report</h2>
      <p className="mt-1 text-sm text-ink-500">Snapshot the last 7 days into a signed, publicly shareable report.</p>
      <Button onClick={generate} disabled={busy} className="mt-4">
        {busy ? <Spinner className="h-4 w-4" /> : 'Generate report'}
      </Button>
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      {report && (
        <div className="mt-5 rounded-xl bg-char-900 p-4">
          <a
            href={report.public_url}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-sm text-ember-400 hover:text-ember-300"
          >
            {report.public_url} ↗
          </a>
          <p className="mt-2 text-xs text-ink-500">
            Badge markdown:{' '}
            <code className="text-ink-300">
              [![Assay verified]({report.public_url}/badge.svg)]({report.public_url})
            </code>
          </p>
        </div>
      )}
    </Card>
  );
}
