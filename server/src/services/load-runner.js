import autocannon from 'autocannon';
import { env } from '../config/env.js';

// Thin orchestration around autocannon: it is the traffic engine (battle
// tested; hand-rolling a load generator invites subtle lies like coordinated
// omission). What we add is warmup, an error-budget abort, and a tick
// callback for live progress — the parts specific to Assay's consent model.
//
// onTick(sample) fires roughly once a second with cumulative interim stats.
// Returns autocannon's final result object (it already reports p50/p75/p90/
// p97.5/p99/p99.9 latency via its own internal histogram).
// Resolves { result, aborted } -- aborted is true iff we called instance.stop()
// ourselves because the error budget was exceeded (vs. a normal finish).
export function runLoadCampaign({ url, connections, durationS, pipelining, onTick }) {
  return new Promise((resolve, reject) => {
    let aborted = false;
    const instance = autocannon(
      {
        url,
        connections,
        duration: durationS,
        pipelining,
        // Warmup: 1s at low concurrency so the target's connection pools /
        // JIT are warm before the numbers that go into the report are taken.
        warmup: { connections: 1, duration: 1 },
      },
      (err, result) => {
        if (err) return reject(err);
        resolve({ result, aborted });
      }
    );

    instance.on('tick', (counter) => {
      const total = counter.counter;
      const errored = (counter.errors || 0) + (counter.timeouts || 0);
      const errorPct = total > 0 ? (errored / total) * 100 : 0;

      if (onTick) {
        onTick({
          elapsed_s: counter.elapsed ? Math.round(counter.elapsed / 1000) : undefined,
          requests: total,
          errors: errored,
          error_pct: Number(errorPct.toFixed(1)),
        });
      }

      // Abort-on-error-budget: a sustained error rate above the budget means
      // we are hurting the target, not measuring it. Stop rather than keep
      // hammering a struggling service.
      if (!aborted && total >= 20 && errorPct > env.CAMPAIGN_ERROR_BUDGET_PCT) {
        aborted = true;
        instance.stop();
      }
    });
  });
}

// Normalize autocannon's result into the numbers the report cares about.
export function summarizeResult(result) {
  return {
    duration_s: result.duration,
    connections: result.connections,
    requests_total: result.requests.total,
    rps_avg: Math.round(result.requests.average),
    rps_sustained: Math.round(result.requests.mean ?? result.requests.average),
    // autocannon's histogram doesn't bucket at exactly p95; report the real
    // percentiles it gives rather than mislabeling p97.5 as "p95".
    latency_p50_ms: result.latency.p50,
    latency_p90_ms: result.latency.p90,
    latency_p97_5_ms: result.latency.p97_5,
    latency_p99_ms: result.latency.p99,
    latency_max_ms: result.latency.max,
    errors: result.errors,
    timeouts: result.timeouts,
    non2xx: result.non2xx,
    throughput_bytes_avg: result.throughput?.average ?? null,
  };
}
