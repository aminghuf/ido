// load/scenarios.js — open-model load profiles for autoscaling experiments.
//
// Run:  k6 run -e SCENARIO=spike  load/scenarios.js
//       k6 run -e SCENARIO=steady load/scenarios.js
//
// Open model (arrival-rate): k6 sends a FIXED number of requests/s no matter how
// slow the server gets. A closed model (VUs + sleep) backs off when latency rises,
// which hides exactly the overload we want to measure.
import http from 'k6/http';
import { check } from 'k6';

const env = (k, d) => __ENV[k] || d;

const BASE_URL   = env('BASE_URL', 'http://localhost:8080');
const ITER       = env('ITER', '20000');               // calibrated work per request — same for every run
const SCENARIO   = env('SCENARIO', 'spike');
const SLO_P99_MS = Number(env('SLO_P99_MS', 200));

// Rates in requests/second. Set from the measured saturation point of ONE replica.
const BASE_RPS   = Number(env('BASE_RPS', 10));        // normal traffic
const PEAK_RPS   = Number(env('PEAK_RPS', 50));        // spike height (e.g. 3–5x one replica's capacity)
const STEADY_RPS = Number(env('STEADY_RPS', 30));

// Phase durations (shorten for smoke tests, keep fixed for real runs).
const WARMUP   = env('WARMUP', '2m');                  // baseline before the spike
const RISE     = env('RISE', '5s');                    // how sudden the spike is
const HOLD     = env('HOLD', '3m');                    // spike length
const COOLDOWN = env('COOLDOWN', '6m');                // watch scale-in (HPA default stabilization = 5m)
const DURATION = env('DURATION', '10m');               // steady run length

const vus = {
  preAllocatedVUs: Number(env('PRE_VUS', 50)),
  maxVUs: Number(env('MAX_VUS', 500)),                 // if exhausted, k6 reports dropped_iterations
};

const scenarios = {
  spike: {
    executor: 'ramping-arrival-rate',
    timeUnit: '1s',
    startRate: BASE_RPS,
    stages: [
      { duration: WARMUP,   target: BASE_RPS },
      { duration: RISE,     target: PEAK_RPS },
      { duration: HOLD,     target: PEAK_RPS },
      { duration: RISE,     target: BASE_RPS },
      { duration: COOLDOWN, target: BASE_RPS },
    ],
    ...vus,
  },
  steady: {
    executor: 'constant-arrival-rate',
    timeUnit: '1s',
    rate: STEADY_RPS,
    duration: DURATION,
    ...vus,
  },
};

if (!scenarios[SCENARIO]) throw new Error(`unknown SCENARIO "${SCENARIO}" (use spike | steady)`);

export const options = {
  scenarios: { [SCENARIO]: scenarios[SCENARIO] },
  // Informational: spikes are EXPECTED to break the SLO for a while — we measure
  // how badly and for how long, so the test is never aborted.
  thresholds: {
    http_req_failed:   ['rate<0.01'],
    http_req_duration: [`p(99)<${SLO_P99_MS}`],
    dropped_iterations: ['count<1'],                   // >0 means k6 itself couldn't keep up
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

const url = `${BASE_URL}/work?iter=${ITER}`;

export default function () {
  const res = http.get(url, { timeout: '10s', tags: { name: '/work' } });
  check(res, { 'status 200': (r) => r.status === 200 });
}