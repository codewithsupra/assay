import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../lib/auth';
import { Button, Card, Input, Spinner } from '../components/ui';
import EmberField from '../components/EmberField';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(form.email, form.password);
      navigate('/app');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <motion.form
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        onSubmit={onSubmit}
      >
        <Card className="w-full max-w-sm p-8">
          <h1 className="font-display text-2xl font-bold text-ink-100">Welcome back</h1>
          <p className="mt-1 text-sm text-ink-500">Sign in to your Assay account.</p>
          <div className="mt-6 space-y-4">
            <Input
              label="Email"
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            <Input
              label="Password"
              type="password"
              required
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>
          {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
          <Button type="submit" disabled={busy} className="mt-6 w-full">
            {busy ? <Spinner className="h-4 w-4" /> : 'Sign in'}
          </Button>
          <p className="mt-5 text-center text-sm text-ink-500">
            No account?{' '}
            <Link to="/register" className="text-ember-400 hover:text-ember-300">
              Register
            </Link>
          </p>
        </Card>
      </motion.form>
    </AuthShell>
  );
}

export function AuthShell({ children }) {
  return (
    <div className="relative flex min-h-[calc(100vh-73px)] items-center justify-center overflow-hidden px-6 py-16">
      <EmberField density={40} className="absolute inset-0 h-full w-full opacity-60" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-void via-void/70 to-void" />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
