# demo-app

Minimal HTTP workload for autoscaling experiments (baseline / HPA / IDO / KEDA).
Python (FastAPI + uvicorn), Prometheus metrics, liveness + readiness probes, graceful shutdown.

## Endpoints

| Path | Purpose |
|---|---|
| `/` | Hello world (+ pod hostname) |
| `/work?iter=N&sleep_ms=M` | N SHA-256 iterations (CPU), then M ms sleep (simulated I/O). Default `iter=20000`, max `5000000` |
| `/healthz` | Liveness — 200 while the process runs |
| `/readyz` | Readiness — 503 once shutdown starts |
| `/metrics` | Prometheus metrics |

`/work` does a **fixed amount of work**, not a fixed duration. When the pod is CPU-throttled, latency rises — that's the signal autoscalers react to.

## Metrics

| Metric | Type | Labels |
|---|---|---|
| `http_request_duration_seconds` | histogram | `path`, `method`, `code` |
| `http_requests_in_flight` | gauge | — |
| Python process / GC metrics | default | — |

Only `/` and `/work` are measured, so probes and scrapes don't skew latency.

Useful PromQL:

```promql
# P99 latency of /work
histogram_quantile(0.99, sum by (le) (rate(http_request_duration_seconds_bucket{path="/work"}[1m])))

# Throughput (req/s)
sum(rate(http_request_duration_seconds_count{path="/work"}[1m]))

# Error rate
sum(rate(http_request_duration_seconds_count{code=~"5.."}[1m]))
```

## Design notes

- **1 uvicorn worker per pod.** Python's GIL means one process ≈ one core, and multiple workers would break Prometheus metrics (needs multiprocess mode). Scale with replicas, not workers — that's what we're measuring anyway.
- **CPU limit ≤ 1 core** for the same reason; extra CPU would be wasted.
- **Graceful shutdown:** `preStop` sleeps 5s so the Service removes the pod before uvicorn stops accepting, then uvicorn drains for up to 15s. Avoids fake 5xx errors on scale-down.

## Run locally

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --port 8080
curl "localhost:8080/work?iter=50000"
curl localhost:8080/metrics | grep http_request
```

## Docker

```bash
docker build -t demo-app:dev .
docker run --rm -p 8080:8080 demo-app:dev
```

## kind

```bash
kind load docker-image demo-app:dev
kubectl apply -f k8s/deployment.yaml
kubectl port-forward svc/demo-app 8080:80
# after kube-prometheus-stack is installed:
kubectl apply -f k8s/servicemonitor.yaml
```

## Calibrate before benchmarking

Pick an `iter` value so **one** request takes ~20–50 ms on an idle pod (inside the cluster, with the CPU limit applied), and record it with hardware + limits in your experiment notes. Every experiment must use the same value.

```bash
for i in 1 2 3 4 5; do curl -s -o /dev/null -w "%{time_total}\n" "localhost:8080/work?iter=20000"; done
```