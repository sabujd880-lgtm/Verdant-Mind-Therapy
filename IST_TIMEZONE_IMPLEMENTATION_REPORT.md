# Indian Standard Time (IST) Implementation Report

**Application:** Psychology Portfolio (Verdant Mind)  
**Authoritative Time Zone:** `Asia/Kolkata` (UTC+05:30)  
**Date Format:** `DD-MM-YYYY`  
**Time Format:** 12-hour AM/PM (`hh:mm A`)  
**Standard:** Indian Standard Time (No Daylight Saving Time)  
**Status:** Production Standard Implemented & Verified  

---

## 1. Architectural Principles

The scheduling and timestamping architecture of Verdant Mind is governed by three fundamental principles:

1. **Storage Exclusively in UTC:** All timestamps, appointment moments, and audit log entries are stored in MongoDB as UTC `Date` objects (ISO-8601 representation: `YYYY-MM-DDTHH:mm:ss.sssZ`).
2. **Authoritative Presentation in IST (`Asia/Kolkata`):** Irrespective of client browser locale or hosting server region, all dates presented to users are strictly formatted in Indian Standard Time (`UTC+05:30`) using `DD-MM-YYYY`.
3. **Deterministic Input Interpretation:** When a user selects a date (e.g. `15-07-2026`) and time (e.g. `10:00 AM`), the application interprets this explicitly as local Indian Standard Time ($10:00\text{ AM IST} = 04:30\text{ UTC}$) before persistence.

---

## 2. Server Process Configuration

To guarantee that backend date formatting and logging do not depend on the cloud host's regional settings:
```javascript
// server.js - Process Time Zone Initialization
process.env.TZ = 'Asia/Kolkata';
```
Additionally, `/api/health` exposes active system timezone telemetry:
```json
{
  "status": "UP",
  "version": "1.0.0",
  "timezone": "Asia/Kolkata",
  "currentTimeIST": "Tuesday, 03 November 2026 | 11:30 AM IST",
  "database": "CONNECTED"
}
```

---

## 3. Core Date-Time Utility Suite (`src/utils/dateTime.js`)

The platform utilizes a centralized, zero-dependency, unit-tested date-time library in `src/utils/dateTime.js`:

### 3.1 Normalization Functions
- **`normalizeToISTDate(input)`**: Converts any date string, Date object, or legacy `YYYY-MM-DD` representation into canonical `DD-MM-YYYY`.
- **`normalizeTo12HourTime(input)`**: Converts 24-hour time strings (`"14:30"`) or unstandardized strings into canonical 12-hour format (`"02:30 PM"`).

### 3.2 Parsing Functions
- **`parseISTDateTimeToUTC(dateStr, timeStr)`**:
  Constructs an ISO string anchored strictly in `+05:30`:
  ```javascript
  const istIso = `${yyyy}-${mm}-${dd}T${hhStr}:${mmStr}:00+05:30`;
  const utcDate = new Date(istIso);
  ```
  This eliminates browser timezone shifts when users book from abroad.

### 3.3 Formatting Functions
- **`formatISTDate(dateInput)`**: Uses `Intl.DateTimeFormat` with `timeZone: 'Asia/Kolkata'` to render `DD-MM-YYYY`.
- **`formatISTTime(dateInput)`**: Uses `Intl.DateTimeFormat` to render `hh:mm A` in IST.
- **`formatISTDateTime(dateInput)`**: Renders `DD-MM-YYYY, hh:mm A IST`.
- **`formatISTDateTimeWithZone(dateInput)`**: Renders `DD-MM-YYYY | hh:mm A IST`.

### 3.4 Live Clock Component
- **`formatLiveISTClock(date, includeSeconds)`**: Generates the authoritative live clock header:
  `Tuesday, 03 November 2026 | 11:30 AM IST`.
- **`<LiveISTClock />`**: Renders an accessible, ticking indicator in the platform navigation header:
  ```jsx
  <div className="live-clock-badge" title="Practice Standard Time (Asia/Kolkata)">
    <Clock size={13} className="clock-pulse" />
    <span>{timeString}</span>
  </div>
  ```

---

## 4. Calendar Navigation & Multi-View Math

### 4.1 Month View
Calculates month offsets and first day of week ($0 = \text{Sunday}, \dots, 6 = \text{Saturday}$) based on Indian Standard Time midday ($12:00\text{ IST}$) to eliminate date boundary rollover.

### 4.2 Week View
Implements `getISTWeekDays(currentDate)`:
- Computes Monday as the start of the clinical practice week.
- Returns the 7 days of the active week with localized weekday names and date strings.
- Synchronizes with therapist availability and public booking engine.

### 4.3 Day View
Provides single-day hourly focus view with fast navigation for granular session inspection.

---

## 5. Automated Verification Results

All date and time functions have been verified under automated test conditions:
- **Test 40:** Verified `Asia/Kolkata` conversion accuracy across midnight boundaries, midday, and legacy strings.
- **Test 41:** Verified UTC storage in MongoDB with exact `05:30:00.000Z` conversion for an `11:00 AM IST` consultation.

**Status:** Certified Production-Ready.
