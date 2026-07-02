import dotenv from 'dotenv';

dotenv.config();

const NODE_ENV = process.env.NODE_ENV || 'development';

const defaults = {
  development: 'postgres://localhost:5432/assay_dev',
  test: 'postgres://localhost:5432/assay_test',
  production: undefined,
};

export const env = {
  NODE_ENV,
  PORT: parseInt(process.env.PORT || '8001', 10),
  DATABASE_URL: process.env.DATABASE_URL || defaults[NODE_ENV],
  JWT_SECRET: process.env.JWT_SECRET || (NODE_ENV === 'production' ? undefined : 'dev-only-insecure-secret'),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  // Ed25519 signing key (PKCS#8 PEM). Generated on boot in dev if absent.
  SIGNING_KEY_PEM: process.env.SIGNING_KEY_PEM || null,
  // How long a claimed job may be held before it is considered abandoned.
  JOB_LEASE_MS: parseInt(process.env.JOB_LEASE_MS || '60000', 10),
  // Ownership-verification token file path served by the target.
  VERIFY_PATH: '/.well-known/assay-verify.txt',
  // Consent guardrails.
  PROBE_TIMEOUT_MS: parseInt(process.env.PROBE_TIMEOUT_MS || '10000', 10),
  MIN_PROBE_INTERVAL_S: parseInt(process.env.MIN_PROBE_INTERVAL_S || '30', 10),
  PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL || 'http://localhost:8001',

  // Load-campaign guardrails (M2). Hard caps, not suggestions: this is the
  // difference between a load tester and a DDoS cannon. Raised per-plan later.
  MAX_CAMPAIGN_CONNECTIONS: parseInt(process.env.MAX_CAMPAIGN_CONNECTIONS || '50', 10),
  MAX_CAMPAIGN_DURATION_S: parseInt(process.env.MAX_CAMPAIGN_DURATION_S || '30', 10),
  CAMPAIGN_COOLDOWN_S: parseInt(process.env.CAMPAIGN_COOLDOWN_S || '300', 10),
  CAMPAIGN_ERROR_BUDGET_PCT: parseFloat(process.env.CAMPAIGN_ERROR_BUDGET_PCT || '20'),
};

if (env.NODE_ENV === 'production') {
  for (const key of ['DATABASE_URL', 'JWT_SECRET']) {
    if (!env[key]) throw new Error(`Missing required env var: ${key}`);
  }
}
