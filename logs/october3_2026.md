# Daily Log — IDO & KEDA Internship / Thesis

One entry per working day, newest on top.
Template: **Done · Decisions (why) · Problems (fix) · Next · Open questions**

---

## 2026-10-03 (Sat)

### Done
- Reviewed the task plan (Notion "MY thoughts"); reordered it: workload first, then monitoring, baseline, HPA, IDO, KEDA.
- Built the demo workload (`app/`): Python, FastAPI + uvicorn.
  - Endpoints: `/`, `/work?iter=N&sleep_ms=M`, `/healthz`, `/readyz`, `/metrics`
  - Metrics: `http_request_duration_seconds` histogram (`path`, `method`, `code`), `http_requests_in_flight` gauge
  - Dockerfile (python:3.12-slim, non-root), k8s Deployment + Service + ServiceMonitor
- Ran the app in Docker, verified metrics with `curl localhost:8080/metrics`.
- Added `docker-compose.yml`: app + Prometheus + Grafana.
  - Prometheus scrapes `app:8080` every 5s
  - Grafana data source and `demo-app` dashboard auto-provisioned (P50/P95/P99, throughput, 5xx, in-flight, CPU, memory)
- Stack up and showing data.

### Decisions (why)
- **Python over Go**: personal preference. Trade-off: GIL → ~1 core per process, more latency noise. Mitigation: same app for every experiment; note in methodology.
- **`/work` = fixed amount of CPU work, not fixed duration**: latency must rise under CPU throttling, otherwise autoscalers have nothing to react to.
- **1 uvicorn worker per pod**: clean Prometheus metrics; scale via replicas (that's what's measured).
- **CPU request 250m / limit 500m** (k8s) and `cpus: 0.5` (compose): identical limits so results are comparable.
- **Probes and `/metrics` not instrumented**: don't dilute latency data.
- **preStop sleep 5s + graceful drain**: avoid fake 5xx on scale-down.
- **Access logs off**: less overhead during benchmarks.
- **Pinned image versions** (prometheus v3.5.0, grafana 12.1.0): reproducibility.
- **Node Exporter** = infra/validity layer (host saturation check), not a result metric.
- **Thesis figures from Prometheus API → CSV → Python**, not Grafana screenshots.

### Problems (fix)
- Wrong port when running uvicorn without `--port` (default 8000) → always pass `--port 8080`.
- No request lines in `docker logs` → expected, `--no-access-log` is set.
- `prometheus.yml` mount error ("not a directory") → Docker auto-created the path as a directory because the file didn't exist on first `up`. Fix: `docker compose down`, `rm -rf` the directory, put the real file, `up` again.

### Next
1. Calibrate `iter` (~20–50 ms per request on an idle pod, inside kind with CPU limit) and record value + hardware.
2. Add Node Exporter to compose; import Grafana dashboard 1860.
3. Choose and install the load tool (k6).
4. Baseline run: fixed replicas, no autoscaler.
5. Move to kind: kube-prometheus-stack, deploy app, build the combined experiment dashboard (P99 + replicas + throttling + request rate).

### Open questions
- Research question not yet written — draft one before the first real experiment.
- Which machine runs the load generator vs the cluster (avoid same-host measurement bias).