"""demo-app: minimal HTTP workload for autoscaling experiments (HPA / IDO / KEDA)."""
import hashlib
import socket
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Query, Request, Response
from fastapi.responses import PlainTextResponse
from prometheus_client import CONTENT_TYPE_LATEST, Gauge, Histogram, generate_latest

DEFAULT_ITER = 20_000
MAX_ITER = 5_000_000
MAX_SLEEP_MS = 10_000

REQ_DURATION = Histogram(
    "http_request_duration_seconds",
    "HTTP request latency in seconds.",
    ["path", "method", "code"],
    buckets=(.005, .01, .025, .05, .1, .25, .5, 1, 2.5, 5, 10),
)
IN_FLIGHT = Gauge("http_requests_in_flight", "Requests currently being served.")

# Only these paths are measured: probes/metrics don't skew latency,
# and unknown paths can't explode label cardinality.
INSTRUMENTED = {"/", "/work"}

state = {"ready": False}


@asynccontextmanager
async def lifespan(_: FastAPI):
    state["ready"] = True
    yield
    state["ready"] = False  # shutting down


app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)


@app.middleware("http")
async def metrics_middleware(request: Request, call_next):
    path = request.url.path
    if path not in INSTRUMENTED:
        return await call_next(request)
    IN_FLIGHT.inc()
    start = time.perf_counter()
    code = 500
    try:
        response = await call_next(request)
        code = response.status_code
        return response
    finally:
        REQ_DURATION.labels(path, request.method, str(code)).observe(time.perf_counter() - start)
        IN_FLIGHT.dec()


def burn(iterations: int) -> str:
    """FIXED amount of CPU work (not a fixed duration): latency rises under throttling."""
    digest = b"ido"
    for _ in range(iterations):
        digest = hashlib.sha256(digest).digest()
    return digest[:8].hex()


@app.get("/", response_class=PlainTextResponse)
def root():
    return f"hello world from {socket.gethostname()}\n"


# Sync def -> runs in a threadpool, so the event loop (and probes) stay responsive.
@app.get("/work", response_class=PlainTextResponse)
def work(
    iter: int = Query(DEFAULT_ITER, ge=0, le=MAX_ITER),
    sleep_ms: int = Query(0, ge=0, le=MAX_SLEEP_MS),
):
    out = burn(iter)
    if sleep_ms:
        time.sleep(sleep_ms / 1000)  # simulated I/O
    return f"ok iter={iter} sleep_ms={sleep_ms} hash={out}\n"


@app.get("/healthz", response_class=PlainTextResponse)
def healthz():
    """Liveness: process is up."""
    return "ok\n"


@app.get("/readyz", response_class=PlainTextResponse)
def readyz(response: Response):
    """Readiness: 503 once shutdown starts."""
    if not state["ready"]:
        response.status_code = 503
        return "not ready\n"
    return "ready\n"


@app.get("/metrics")
def metrics():
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)