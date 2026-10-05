FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .

RUN useradd --uid 10001 --no-create-home appuser
USER 10001

EXPOSE 8080
# 1 worker on purpose: one process = clean Prometheus metrics. Scale with replicas, not workers.
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080", \
     "--workers", "1", "--no-access-log", "--timeout-graceful-shutdown", "15"]