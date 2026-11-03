# P1 Health Monitoring Report: Observability & Operational Diagnostics

**Application:** Verdant Mind – Counselling Management Portal  
**Endpoints:** `GET /api/health`, `GET /api/health/ready`  
**Date:** 2026-11-02  

---

## 1. Executive Summary

A dedicated health-checking and operational monitoring suite was established to support cloud load balancers (AWS ALB, App Runner, Render, Kubernetes), container orchestration health probes, and structured error logging without exposing sensitive clinical records or system credentials.

---

## 2. Health & Readiness Endpoints

### 1. `GET /api/health` (Liveness & Deep Diagnostics)
- **Status Codes:**
  - `HTTP 200 OK`: Database connected (`readyState === 1`) and system operational.
  - `HTTP 503 Service Unavailable`: Database disconnected in production mode.
- **Payload Schema:**
  ```json
  {
    "status": "UP",
    "version": "1.0.0",
    "environment": "production",
    "database": "CONNECTED",
    "uptimeSeconds": 1420,
    "memory": {
      "rssMb": 84,
      "heapUsedMb": 42
    },
    "timestamp": "2026-11-02T14:15:00.000Z"
  }
  ```
- **Information Leakage Prevention:** Passwords, connection URIs, database hostnames, internal stack traces, and environment dump arrays are strictly excluded.

### 2. `GET /api/health/ready` (Kubernetes / ECS Traffic Readiness)
- Returns `HTTP 200 { ready: true, database: 'CONNECTED' }` only when MongoDB connection is active and ready to accept traffic.
- Returns `HTTP 503` during startup or connection dropouts, preventing reverse proxies from routing user requests to unready container instances.

---

## 3. Structured Logging & Operational Alerting

1. **Structured CloudWatch / Sentry Logging:**
   Central error handler intercepts uncaught application errors and emits structured JSON entries:
   ```json
   {
     "timestamp": "2026-11-02T14:15:00.000Z",
     "method": "POST",
     "path": "/api/appointments",
     "status": 500,
     "message": "Error description",
     "ip": "203.0.113.1"
   }
   ```
2. **Clinical Data Redaction:**
   Request payloads, client names, diagnostic codes, MSE answers, and audio streams are **never** logged to stdout or external APM collectors.
3. **Database Disconnection Listeners:**
   Mongoose connection event listeners emit immediate alerts when database connectivity fluctuates:
   - `[DATABASE ALERT] MongoDB Atlas connection lost! Retrying...`
   - `[DATABASE ALERT] MongoDB Atlas connection restored.`

---

## 4. Test Verification & Results

- **Test 23 & Test 24 in `tests/run_tests.js`:** Health and readiness endpoints return valid status and metrics.
- **Test 35 in `tests/run_tests.js`:** Health endpoint confirms `version: '1.0.0'` and positive uptime.
- **Result:** **PASSED**.

