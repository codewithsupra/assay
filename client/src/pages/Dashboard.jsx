import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../lib/api';
import { Button, Card, Input, Pill, Spinner } from '../components/ui';

export default function Dashboard() {
  const [projects, setProjects] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState(null);

  async function refresh() {
    try {
      const d = await api.listProjects();
      setProjects(d.projects);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink-100">Your projects</h1>
          <p className="mt-1 text-sm text-ink-500">Register a deployed app, prove ownership, then put it through the fire.</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>+ New project</Button>
      </div>

      {error && <p className="mt-6 text-sm text-red-400">{error}</p>}

      {!projects ? (
        <div className="mt-16 flex justify-center text-ink-500">
          <Spinner className="h-6 w-6" />
        </div>
      ) : projects.length === 0 ? (
        <EmptyState onCreate={() => setShowCreate(true)} />
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </div>
      )}

      <AnimatePresence>
        {showCreate && (
          <CreateProjectModal
            onClose={() => setShowCreate(false)}
            onCreated={() => {
              setShowCreate(false);
              refresh();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function EmptyState({ onCreate }) {
  return (
    <Card className="mt-10 flex flex-col items-center gap-4 p-16 text-center">
      <div className="text-4xl">🔥</div>
      <p className="font-display text-lg font-semibold text-ink-100">No projects yet</p>
      <p className="max-w-sm text-sm text-ink-500">
        Register the URL of something you've deployed. You'll need to prove you own it before Assay probes it.
      </p>
      <Button onClick={onCreate}>Register a project</Button>
    </Card>
  );
}

function ProjectCard({ project }) {
  return (
    <Link to={`/app/projects/${project.id}`}>
      <Card className="h-full p-6 transition-transform hover:-translate-y-1 hover:border-ember-500/30">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-display font-semibold text-ink-100">{project.name}</p>
            <p className="mt-0.5 truncate text-xs text-ink-500">{project.target_url}</p>
          </div>
          {project.verified_at ? (
            <Pill tone="verified">Verified</Pill>
          ) : (
            <Pill tone="ember">Unverified</Pill>
          )}
        </div>
        {project.paused && (
          <Pill tone="danger" className="mt-4">
            Paused
          </Pill>
        )}
      </Card>
    </Link>
  );
}

function CreateProjectModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', target_url: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.createProject(form);
      onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.form
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.2 }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={onSubmit}
      >
        <Card className="w-full max-w-md p-7">
          <h2 className="font-display text-xl font-bold text-ink-100">Register a project</h2>
          <div className="mt-5 space-y-4">
            <Input
              label="Name"
              required
              placeholder="Pulse"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <Input
              label="Target URL"
              required
              type="url"
              placeholder="https://your-app.onrender.com"
              value={form.target_url}
              onChange={(e) => setForm({ ...form, target_url: e.target.value })}
            />
          </div>
          {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
          <div className="mt-6 flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? <Spinner className="h-4 w-4" /> : 'Register'}
            </Button>
          </div>
        </Card>
      </motion.form>
    </motion.div>
  );
}
