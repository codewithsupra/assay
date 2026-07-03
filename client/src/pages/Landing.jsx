import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import EmberField from '../components/EmberField';
import { Button, Card, Pill } from '../components/ui';

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } },
};

function Reveal({ children, className = '', delay = 0 }) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '-80px' }}
      variants={fadeUp}
      transition={{ delay }}
    >
      {children}
    </motion.div>
  );
}

function ReportMock() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 40, rotateX: 8 }}
      animate={{ opacity: 1, y: 0, rotateX: 0 }}
      transition={{ duration: 0.9, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="relative mx-auto w-full max-w-lg"
      style={{ perspective: 1000 }}
    >
      <Card className="p-6 shadow-[0_40px_120px_-20px_rgba(0,0,0,0.7)]">
        <div className="flex items-center justify-between border-b border-white/5 pb-4">
          <div>
            <p className="font-display text-sm font-semibold text-ink-100">Pulse — uptime monitor</p>
            <p className="text-xs text-ink-500">pulse-wy6e.onrender.com</p>
          </div>
          <Pill tone="verified">✓ Signature valid</Pill>
        </div>
        <div className="grid grid-cols-2 gap-4 py-5">
          <Stat label="Sustained RPS" value="120,838" />
          <Stat label="p99 load latency" value="0 ms" />
          <Stat label="Uptime (7d)" value="99.97%" />
          <Stat label="Contract violations" value="0" />
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-char-900 px-3 py-2 font-mono text-[11px] text-ink-500">
          <span className="text-verified-500">Ed25519</span>
          <span className="truncate">EAXI/wMGp+odfi4jcbvZEIeh30JIFUSVVYr/0lNb...</span>
        </div>
      </Card>
      <div className="absolute -right-6 -top-6 -z-10 h-40 w-40 rounded-full bg-ember-600/30 blur-3xl animate-drift" />
    </motion.div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-ink-500">{label}</p>
      <p className="font-display text-2xl font-bold text-ink-100">{value}</p>
    </div>
  );
}

const features = [
  {
    title: 'Consent is the gate',
    body: 'No probe or load test ever runs until you prove you own the target — serve a token, or publish a DNS record. Hard caps and cooldowns bound every campaign server-side.',
    icon: '🔒',
  },
  {
    title: 'Real load, not a screenshot',
    body: 'A dedicated runner fleet drives sustained traffic with autocannon — warmup, ramp, abort-on-error-budget — and reports honest percentiles, not vibes.',
    icon: '🔥',
  },
  {
    title: 'Signed, not self-reported',
    body: 'Every report is Ed25519-signed over a canonical payload. Anyone can verify it independently. Tamper with one number and the signature breaks.',
    icon: '🗝️',
  },
];

export default function Landing() {
  return (
    <div className="grain overflow-x-hidden">
      {/* Hero */}
      <section className="relative isolate flex min-h-[92vh] items-center overflow-hidden">
        <EmberField density={90} className="absolute inset-0 h-full w-full" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-void via-void/60 to-void" />
        <div
          className="pointer-events-none absolute left-1/2 top-1/3 -z-10 h-[500px] w-[700px] -translate-x-1/2 rounded-full opacity-40 blur-[120px] animate-drift"
          style={{ background: 'radial-gradient(circle, #ff5a2e, transparent 70%)' }}
        />

        <div className="relative z-10 mx-auto grid max-w-6xl gap-16 px-6 py-24 lg:grid-cols-2 lg:items-center">
          <div>
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
              <Pill tone="ember">Verified proof-of-skill</Pill>
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
              className="mt-6 font-display text-5xl font-bold leading-[1.05] tracking-tight text-ink-100 sm:text-6xl"
            >
              Your project doesn't just <span className="text-gradient-ember">exist</span>.
              <br />
              Prove it <span className="text-gradient-ember">runs</span>.
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.2 }}
              className="mt-6 max-w-lg text-lg leading-relaxed text-ink-300"
            >
              Assay puts your deployed app through the fire: uptime probes, API contract checks, and real load
              campaigns — then hands you a cryptographically signed report you can drop straight into your README.
              No screenshots. No self-reported numbers. Verified.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.3 }}
              className="mt-9 flex flex-wrap items-center gap-4"
            >
              <Button as={Link} to="/register">
                Get your project verified →
              </Button>
              <Button as={Link} to="/login" variant="ghost">
                I have an account
              </Button>
            </motion.div>
          </div>
          <ReportMock />
        </div>
      </section>

      {/* The problem */}
      <section className="mx-auto max-w-4xl px-6 py-24 text-center">
        <Reveal>
          <p className="font-display text-2xl font-semibold text-ink-100 sm:text-3xl">
            "It's deployed" is not the same claim as{' '}
            <span className="text-gradient-ember">"it holds up under load."</span>
          </p>
          <p className="mx-auto mt-4 max-w-xl text-ink-500">
            A live URL in a README proves nothing an interviewer can check in thirty seconds. A signed report does.
          </p>
        </Reveal>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="grid gap-6 md:grid-cols-3">
          {features.map((f, i) => (
            <Reveal key={f.title} delay={i * 0.1}>
              <Card className="h-full p-7 transition-transform hover:-translate-y-1">
                <div className="mb-4 text-3xl">{f.icon}</div>
                <h3 className="font-display text-lg font-semibold text-ink-100">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-500">{f.body}</p>
              </Card>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Dogfood loop */}
      <section className="border-y border-white/5 bg-char-950/60">
        <div className="mx-auto max-w-5xl px-6 py-24">
          <Reveal className="text-center">
            <Pill tone="verified">The dogfood loop</Pill>
            <h2 className="mt-5 font-display text-3xl font-bold text-ink-100 sm:text-4xl">
              Assay verifies Pulse. Pulse's README proves Assay works.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-ink-500">
              Two independently-built systems, verifying each other in public. Pulse's badge lives in its README,
              signed by Assay; Assay's own numbers come from load-testing itself. Neither side can fake the other's
              signature.
            </p>
          </Reveal>
          <Reveal delay={0.15} className="mx-auto mt-12 flex max-w-2xl flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Card className="flex items-center gap-3 px-5 py-4">
              <span className="h-2 w-2 rounded-full bg-verified-500" />
              <span className="text-sm text-ink-300">Pulse — real-time uptime monitor</span>
            </Card>
            <span className="text-2xl text-ember-500">⇄</span>
            <Card className="flex items-center gap-3 px-5 py-4">
              <span className="h-2 w-2 rounded-full bg-ember-500" />
              <span className="text-sm text-ink-300">Assay — verified proof-of-skill</span>
            </Card>
          </Reveal>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-4xl px-6 py-28 text-center">
        <Reveal>
          <h2 className="font-display text-3xl font-bold text-ink-100 sm:text-4xl">
            Stop asking people to trust your <span className="text-gradient-ember">screenshots</span>.
          </h2>
          <div className="mt-9">
            <Button as={Link} to="/register" className="px-9 py-4 text-base">
              Verify your first project
            </Button>
          </div>
        </Reveal>
      </section>

      <footer className="border-t border-white/5 px-6 py-10 text-center text-xs text-ink-700">
        Assay — verified proof-of-skill for deployed projects.
      </footer>
    </div>
  );
}
