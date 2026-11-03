# Scheduling Configuration Report

**Application:** Psychology Portfolio (Verdant Mind)  
**Governance Standard:** Indian Standard Time (`Asia/Kolkata`)  
**Target:** Practice Operating Hours, Buffers & Horizon Management  
**Status:** Implemented & Verified  

---

## 1. Governance Overview

The Verdant Mind practice operates under structured scheduling governance designed to protect therapist availability, prevent clinical burnout, provide predictable client consultation windows, and enforce mandatory clinical buffers.

---

## 2. Core Scheduling Rules Matrix

| Parameter | Practice Setting | Governance Description |
| :--- | :--- | :--- |
| **Authoritative Time Zone** | `Asia/Kolkata` (UTC+05:30) | Standard across all portals, APIs, and alerts |
| **Practice Days** | Monday – Friday (`[1, 2, 3, 4, 5]`) | Configurable by administrator via Admin Console |
| **Shift Start Hour** | `09:00` IST | Earliest permissible consultation start time |
| **Shift End Hour** | `17:00` IST | Latest permissible consultation completion time |
| **Lunch / Break Period** | `13:00` – `14:00` IST | Mandatory midday rest window; blocked from booking |
| **Default Duration** | `60` Minutes | Standard comprehensive psychotherapy session |
| **Permitted Durations** | `[30, 45, 60]` Minutes | Client can choose 30m check-in, 45m focused, or 60m full session |
| **Practice Buffer Interval** | `15` Minutes | Required turnaround window after every session |
| **Minimum Advance Notice** | `2` Hours | Prevents unmanageable last-minute booking requests |
| **Maximum Advance Horizon** | `60` Days | Prevents distant scheduling conflicts and drift |
| **Max Sessions / Day** | `8` Appointments | Hard daily cap to prevent therapist cognitive fatigue |
| **Cancellation Deadline** | `24` Hours | Minimum notice required for standard cancellation |
| **Rescheduling Deadline** | `12` Hours | Minimum notice required for client-initiated rescheduling |

---

## 3. Administrative Control Architecture

Administrators and Super Admins manage practice governance via dedicated endpoints and frontend controls:

### 3.1 REST API Specification
- **`GET /api/admin/scheduling-config`**: Returns active availability schema with full scheduling governance parameters. Restricted to authenticated staff.
- **`PUT /api/admin/scheduling-config`**: Updates practice configuration parameters. Restricted to `Super Admin` and `Administrator`. Logs action to `AuditLog`.

### 3.2 Frontend Admin Console Integration
Located in `src/components/AdminManagement.jsx` under the **Practice Scheduling & IST** tab:
1. **Consultation Days:** Dynamic checkboxes for Sunday through Saturday.
2. **Operating Hours:** Inputs for daily start hour, end hour, and lunch break.
3. **Turnaround & Duration:** Dropdown selectors for default session duration (30/45/60 min) and practice buffer (10/15/20/30 min).
4. **Advance Booking Horizons:** Numerical bounds for minimum hours notice and maximum days horizon.
5. **Notice Deadlines:** Configuration for cancellation notice (24h) and rescheduling notice (12h).
6. **Time Zone Banner:** Authoritative badge confirming `Asia/Kolkata` UTC+05:30 standard.

---

## 4. Double-Booking & Horizon Enforcement Logic

When an appointment is requested via `POST /api/appointments`:
1. **Horizon Check:** Date is verified to be within $[now + minAdvanceHours, now + maxAdvanceDays]$.
2. **Working Day Check:** Date day of week must be present in `workingDays`.
3. **Blocked Date & Range Check:** Date must not match any entry in `blockedDates` or overlap with any range in `blockedRanges`.
4. **Buffer & Interval Collision Check:** The interval $[startUtc, startUtc + duration + buffer]$ is tested against all existing active appointments on that day using `doAppointmentsOverlap`.
5. **Daily Quota Check:** Total active sessions on the requested date must not exceed `maxAppointmentsPerDay`.

---

## 5. Verification Results

- Verified administrative fetch and update via automated **Test 45** (`Admin Scheduling Config: Allows Super Admin to view and update practice scheduling governance`).
- Test verified persistent update of operating hours (`08:30` – `18:30`), buffer (`20 min`), default duration (`45 min`), and expanded working days (`[1, 2, 3, 4, 5, 6]`).
