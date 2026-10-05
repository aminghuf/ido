## Day 1: 2026-10-01 · Local dev cluster setup

**Goal:** Set up a local sandbox cluster with monitoring and KEDA for learning and development.

### Environment
- Host: HP Omen (Windows), WSL2 Ubuntu
- Container runtime: Docker <!-- Engine in WSL / Desktop -->
- Tools: kubectl, kind, helm
- Purpose: dev/learning only. Performance measurements will run on a dedicated ThinkPad cluster (kubeadm) to avoid WSL/kind overhead and noise.

### Done
- Created a 3-node kind cluster `thesis` (1 control-plane, 2 workers) from `kind.yaml`.
- Installed kube-prometheus-stack via Helm in namespace `monitoring` (release `prom`).
  - Prometheus: `svc/prom-kube-prometheus-stack-prometheus:9090`
  - Grafana: `svc/prom-grafana:80`
  - In-cluster address for KEDA: `http://prom-kube-prometheus-stack-prometheus.monitoring.svc:9090`
- Installed KEDA via Helm in namespace `keda`.

### Prepared
- `hello.yaml`: Deployment and Service for `ghcr.io/kljensen/hello-world-http:0.5.0` (port 8000, CPU/memory requests set).
- `load.js`: k6 script with ramp up, sustained load, ramp down, and an idle stage to observe scale-in. Runs inside the cluster to avoid the port-forward bottleneck.

### Versions
| Component | Version |
|---|---|
| Kubernetes (kind node) | |
| kind | |
| Helm | |
| kube-prometheus-stack | |
| KEDA | |

### Notes / Decisions
- The VPS is excluded from the cluster because WAN latency would distort performance data.
- The hello app has no `/metrics` endpoint, so the first ScaledObject will use a `cpu` trigger. Request-rate scaling needs an ingress with metrics later.
- Image tags are pinned for reproducibility.

### Next (Day 2)
- Deploy the hello app and a KEDA `cpu` ScaledObject, then run k6 and verify scaling 1 → N → 1.
- Document the KEDA → HPA → Deployment flow.
- Read the IDO docs and check whether it supports kind.