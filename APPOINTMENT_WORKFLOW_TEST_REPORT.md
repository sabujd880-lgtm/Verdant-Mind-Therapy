# Appointment Workflow Test Report

**Application:** Psychology Portfolio (Verdant Mind)  
**Scope:** Complete Appointment Lifecycle & Clinical Workflow Verification  
**Standard:** Indian Standard Time (`Asia/Kolkata`)  
**Status:** All Scenarios Passed  

---

## 1. Lifecycle Overview

The appointment lifecycle encompasses five primary stages:
1. **Inquiry / Initial Booking:** Client submits request through public Booking Engine.
2. **Review & Confirmation:** Counsellor reviews clinical details and confirms session.
3. **Clinical Documentation:** Counsellor records consultation notes and generates care documents.
4. **Rescheduling (Optional):** Counsellor or client reschedules with full audit history.
5. **Cancellation (Optional):** Counsellor or client cancels with mandatory reason.

---

## 2. Test Execution & Results Matrix

| Scenario # | Workflow Description | Inputs / Parameters | Expected Output | Actual Result |
| :---: | :--- | :--- | :--- | :---: |
| **WF-01** | Client submits consultation inquiry | `clientEmail`, `name`, `date` (`18-09-2030`), `time` (`11:00 AM`), `sessionMode` | HTTP 200, status `Pending`, `appointmentUtc` stored in UTC (`2030-09-18T05:30:00.000Z`), Brevo alert sent | **PASSED** |
| **WF-02** | Collision rejection on booked slot | Same date and time requested by different client | HTTP 409 Conflict with clear error message | **PASSED** |
| **WF-03** | Duration overlap rejection | Booked `10:00 AM` (60m + 15m buf); attempt `10:30 AM` | HTTP 409 Conflict | **PASSED** |
| **WF-04** | Buffer window collision rejection | Attempt `11:05 AM` within 15-minute buffer | HTTP 409 Conflict | **PASSED** |
| **WF-05** | Booking outside buffer | Attempt `11:30 AM` (after 11:15 AM busy window) | HTTP 200 OK | **PASSED** |
| **WF-06** | Counsellor confirms appointment | `PATCH /api/appointments/:id/status` `{ status: 'Confirmed' }` | HTTP 200 OK, status `Confirmed`, confirmation email sent to client | **PASSED** |
| **WF-07** | Counsellor updates session notes | `PATCH /api/appointments/:id/notes` `{ notes: '...' }` | HTTP 200 OK, updated `notes` field persisted | **PASSED** |
| **WF-08** | Appointment rescheduling | `PATCH /api/appointments/:id/reschedule` `{ date: '06-11-2038', time: '04:00 PM', durationMinutes: 45, reason: 'Work conflict' }` | HTTP 200 OK, slot updated, `rescheduledFrom` preserved, `history` entry logged, Brevo email sent | **PASSED** |
| **WF-09** | Rescheduling collision detection | Reschedule attempt to already booked slot | HTTP 409 Conflict | **PASSED** |
| **WF-10** | Appointment cancellation | `PATCH /api/appointments/:id/status` `{ status: 'Cancelled', cancellationReason: 'Medical emergency' }` | HTTP 200 OK, status `Cancelled`, `cancellationReason` stored, `CANCELLED` history entry added | **PASSED** |
| **WF-11** | IDOR authorization enforcement | Client A attempts to modify or view Client B's appointment | HTTP 403 Forbidden | **PASSED** |
| **WF-12** | Admin scheduling config governance | Super Admin modifies operating hours and buffer minutes | HTTP 200 OK, new rules stored in `Availability` | **PASSED** |

---

## 3. Detailed Workflow Walkthroughs

### 3.1 Rescheduling Workflow Walkthrough
1. **State Before:** Appointment `apt-101` scheduled for `05-11-2038` at `02:00 PM`.
2. **API Invocation:**
   ```http
   PATCH /api/appointments/apt-101/reschedule HTTP/1.1
   Cookie: counselling_portal_sid=...
   Content-Type: application/json

   {
     "date": "06-11-2038",
     "time": "04:00 PM",
     "durationMinutes": 45,
     "reason": "Client requested evening slot due to work conflict"
   }
   ```
3. **Processing:**
   - Date normalized to `06-11-2038`.
   - Time normalized to `04:00 PM`.
   - UTC moment calculated: `2038-11-06T10:30:00.000Z`.
   - Conflict check confirms slot is open.
   - `rescheduledFrom` populated:
     ```json
     {
       "date": "05-11-2038",
       "time": "02:00 PM",
       "rescheduledAt": "2026-11-03T11:25:00.000Z",
       "rescheduledBy": "sabujd880@gmail.com"
     }
     ```
   - History entry appended: `action: 'RESCHEDULED'`.
   - Brevo notification sent to client.
4. **State After:** Appointment confirmed for new slot, old history preserved.

### 3.2 Cancellation Governance Walkthrough
1. **API Invocation:**
   ```http
   PATCH /api/appointments/apt-102/status HTTP/1.1
   Content-Type: application/json

   {
     "status": "Cancelled",
     "cancellationReason": "Client had sudden medical emergency"
   }
   ```
2. **Processing:**
   - Stores `apt.cancellationReason = "Client had sudden medical emergency"`.
   - Appends `{ action: 'CANCELLED', details: { reason: 'Client had sudden medical emergency' } }` to `history`.
   - Creates `AuditLog` entry.
   - Dispatches cancellation email notice via Brevo.

---

## 4. Conclusion

All appointment lifecycle workflows, edge cases, error conditions, and notifications have been executed and verified in the automated testing environment.
