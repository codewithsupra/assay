import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../lib/auth';
import { Button, Card, Input, Spinner } from '../components/ui';
import { AuthShell } from './Login';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', name: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await register(form.email, form.name, form.password);
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
          <h1 className="font-display text-2xl font-bold text-ink-100">Get verified</h1>
          <p className="mt-1 text-sm text-ink-500">Create an account to register your first project.</p>
          <div className="mt-6 space-y-4">
            <Input label="Name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
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
              minLength={8}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>
          {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
          <Button type="submit" disabled={busy} className="mt-6 w-full">
            {busy ? <Spinner className="h-4 w-4" /> : 'Create account'}
          </Button>
          <p className="mt-5 text-center text-sm text-ink-500">
            Already have an account?{' '}
            <Link to="/login" className="text-ember-400 hover:text-ember-300">
              Sign in
            </Link>
          </p>
        </Card>
      </motion.form>
    </AuthShell>
  );
}
