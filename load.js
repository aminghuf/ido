// load.js
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';

export const options = {
  stages: [
    { duration: '1m', target: 20 },  // ramp up
    { duration: '3m', target: 50 },  // sustained load: scale-out should happen here
    { duration: '1m', target: 0 },   // ramp down
    { duration: '3m', target: 0 },   // idle: watch scale-in (cooldown)
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],   // <1% errors
    http_req_duration: ['p(95)<500'], // p95 under 500 ms
  },
};

export default function () {
  const res = http.get(`${BASE_URL}/`);
  check(res, { 'status 200': (r) => r.status === 200 });
  sleep(0.1);
}
