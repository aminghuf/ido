## 2026-10-05 (Mon)

### Done
- **Node Exporter** added to compose; Grafana dashboard 1860 imported.
- **Grafana `demo-app` dashboard** fixed: `demo-app.json` was never in `monitoring/grafana/dashboards/` → recreated, auto-provisioned.
- **Experiment focus decided**: spikes = main scenario (reaction speed), steady = control (efficiency, oscillation).
  - Draft RQ: *How do HPA, KEDA, and IDO compare in SLO compliance and resource efficiency under sudden traffic spikes versus steady load?*
- **k6 script rewritten** (`load/scenarios.js`): open model (`ramping-arrival-rate` / `constant-arrival-rate`), `spike` + `steady` profiles, all params via `-e`, tracks `dropped_iterations`.
- **Calibration + saturation test (Docker, 0.5 CPU)**:

  | Rate | p50 | p99 | Fail |
  |---|---|---|---|
  | 15 rps | 20 ms | 181 ms | 0% |
  | 20 rps | 18 ms | 318 ms | 0% |
  | 40 rps | 10 s | 10 s | 59% |
  | 60 rps | 10 s | 10 s | 100% |

  - Capacity check 15 rps × 3: p99 = 179 / 175 / 142 ms → **capacity 15 rps** (Docker).
  - Parameters recorded in `ido-experiment-parameters.xlsx`.
- **Moved to kind**:
  - kube-prometheus-stack installed (ns `monitoring`, release `prometheus-stack`)
  - App deployed in ns `ido`, ServiceMonitor `release: prometheus-stack`, scraped OK
  - Service changed to **NodePort 30080**
  - k6 runs as container on the `kind` Docker network → `http://kind-control-plane:30080`
- **kind capacity check at 15 rps: p99 ≈ 21 ms** (k6). Grafana: CPU ≈ 0.27 cores (54% of limit), no throttling.

### Decisions (why)
- **`ITER=60000` fixed** for all experiments (p50 ≈ 18–20 ms).
- **SLO = P99 < 200 ms.**
- **Open-model load**: closed model (VUs + sleep) backs off when the server slows, hiding overload.
- **No `kubectl port-forward` for load**: tunnels through the API server → benchmarks the tunnel. Port-forward only for UIs.
- **k6 in a container on the cluster's network**, not `localhost` → avoids Docker port-publishing overhead.
- **Compose stack stopped during kind runs**: avoids CPU contention.
- **≥5 repetitions per scaler × scenario**, report mean + range (run-to-run spread at 15 rps was 142–179 ms).

### Findings
- Docker p99 tail (142–179 ms) vs kind (21 ms) at the same load: tail came from the environment (likely `localhost` port-publishing path on WSL + background stack), not the app. → Methodology note: never route load through published ports.
- **Histogram buckets too coarse**: most requests fall in 10–25 ms bucket → Prometheus quantiles are linear interpolation (flat P50/P95/P99 lines; P99 ≈ 25 ms vs k6 21 ms). 200 ms SLO is not a bucket boundary → can't compute SLO compliance exactly.

### Problems (fix)
- Compose ran only the app; Grafana/node-exporter stuck in `Created` → node-exporter failed: `path / is mounted on / but it is not a shared or slave mount` (WSL). Fix: mount `/proc` and `/sys` instead of `/` with `rslave`.
- Saturation loop: 10 s timeouts from 40 rps upward → expected (overload). Fix: finer rate steps, 30 s pause between runs, stop at first failing rate.
- `kubectl port-forward ... 9090`: address in use → compose Prometheus still running. Fix: `docker compose down`.
- Typed `<release>` literally → bash read it as file redirect. Placeholder, replace with real name.

### Next
1. Finer histogram buckets in `app.py` (include 0.2 s boundary); rebuild, `kind load`, rollout restart.
2. Add SLO-compliance panel in Grafana (`le="0.2"` / count).
3. Saturation test in kind: 15 / 20 / 25 / 30 rps → new capacity (expect ≈ 25 rps); update spreadsheet.
4. Set BASE / PEAK / STEADY from kind capacity.
5. Baseline in kind: fixed replicas, spike + steady, 5 runs each.

### Open questions
- Confirm Docker-tail cause: rerun Docker test with k6 on compose network (`http://app:8080`).
- Final runs: load generator on a separate machine (VPS / ThinkPad).
- Show draft research question to supervisor.

---