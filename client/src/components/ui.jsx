export function Button({ as: As = 'button', variant = 'ember', className = '', children, ...props }) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none';
  const variants = {
    ember:
      'bg-gradient-to-r from-ember-500 to-ember-700 text-white glow-ember hover:brightness-110 hover:-translate-y-0.5 active:translate-y-0',
    ghost: 'text-ink-100 border border-white/10 hover:bg-white/5 hover:-translate-y-0.5',
    subtle: 'text-ink-300 hover:text-ink-100',
  };
  return (
    <As className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
    </As>
  );
}

export function Card({ className = '', children, ...props }) {
  return (
    <div className={`glass rounded-2xl ${className}`} {...props}>
      {children}
    </div>
  );
}

export function Pill({ tone = 'ink', children, className = '' }) {
  const tones = {
    ink: 'bg-white/5 text-ink-300 border-white/10',
    ember: 'bg-ember-500/10 text-ember-400 border-ember-500/30',
    verified: 'bg-verified-500/10 text-verified-400 border-verified-500/30',
    danger: 'bg-red-500/10 text-red-400 border-red-500/30',
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function Input({ label, className = '', ...props }) {
  return (
    <label className="block text-left">
      {label && <span className="mb-1.5 block text-xs font-medium text-ink-500">{label}</span>}
      <input
        className={`w-full rounded-xl border border-white/10 bg-char-900 px-4 py-2.5 text-sm text-ink-100 placeholder:text-ink-700 outline-none transition focus:border-ember-500/50 focus:ring-2 focus:ring-ember-500/20 ${className}`}
        {...props}
      />
    </label>
  );
}

export function Spinner({ className = '' }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
