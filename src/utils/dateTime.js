/**
 * Indian Standard Time (IST) Date and Time Utilities
 * Time Zone: Asia/Kolkata (UTC+05:30)
 * Date Format: DD-MM-YYYY
 * Time Format: 12-hour hh:mm A (AM/PM)
 */

export const TIMEZONE = 'Asia/Kolkata';

/**
 * Normalizes any date string or Date object into the canonical DD-MM-YYYY string in Asia/Kolkata.
 * Handles:
 *  - Date objects
 *  - ISO strings (e.g., 2026-07-15T04:30:00.000Z)
 *  - YYYY-MM-DD (e.g., 2026-07-15 -> 15-07-2026)
 *  - DD-MM-YYYY (e.g., 15-07-2026 -> 15-07-2026)
 *  - M/D/YYYY or D/M/YYYY
 */
export function normalizeToISTDate(input) {
  if (!input) return '';
  if (input instanceof Date) {
    return formatISTDate(input);
  }
  const str = String(input).trim();
  
  // If DD-MM-YYYY or DD/MM/YYYY
  const dmyMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    const year = dmyMatch[3];
    return `${day}-${month}-${year}`;
  }

  // If YYYY-MM-DD or YYYY/MM/DD
  const ymdMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (ymdMatch) {
    const year = ymdMatch[1];
    const month = ymdMatch[2].padStart(2, '0');
    const day = ymdMatch[3].padStart(2, '0');
    return `${day}-${month}-${year}`;
  }

  // Fallback parse as Date
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return formatISTDate(d);
  }

  return str;
}

/**
 * Normalizes any time representation to strict 12-hour hh:mm A format (e.g., "09:00 AM", "02:30 PM").
 * Handles:
 *  - 24-hour time strings ("09:00", "14:30", "14:30:00")
 *  - 12-hour strings ("9:00 am", "09:00 AM", "2:30 PM")
 *  - Date objects (formats to 12-hour in Asia/Kolkata)
 */
export function normalizeTo12HourTime(input) {
  if (!input) return '';
  if (input instanceof Date) {
    return formatISTTime(input);
  }
  const str = String(input).trim();

  // Matches 12-hour time: "9:00 AM", "09:00 am", "12:30 PM", etc.
  const ampmMatch = str.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([aApP][mM])$/);
  if (ampmMatch) {
    let hour = parseInt(ampmMatch[1], 10);
    const minute = ampmMatch[2];
    const period = ampmMatch[3].toUpperCase();
    if (hour === 0) hour = 12;
    return `${String(hour).padStart(2, '0')}:${minute} ${period}`;
  }

  // Matches 24-hour time: "09:00", "14:30", "14:30:00"
  const h24Match = str.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (h24Match) {
    let hour = parseInt(h24Match[1], 10);
    const minute = h24Match[2];
    const period = hour >= 12 ? 'PM' : 'AM';
    hour = hour % 12;
    if (hour === 0) hour = 12;
    return `${String(hour).padStart(2, '0')}:${minute} ${period}`;
  }

  return str;
}

/**
 * Formats a Date object, ISO timestamp, or date string into DD-MM-YYYY strictly in Asia/Kolkata.
 */
export function formatISTDate(dateInput) {
  if (!dateInput) return '';
  
  if (typeof dateInput === 'string') {
    // If already in DD-MM-YYYY format
    if (/^\d{2}-\d{2}-\d{4}$/.test(dateInput)) {
      return dateInput;
    }
    // If in YYYY-MM-DD format (no time component), convert directly to avoid UTC midnight shifts
    const ymd = dateInput.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (ymd) {
      return `${ymd[3]}-${ymd[2]}-${ymd[1]}`;
    }
  }

  const dateObj = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(dateObj.getTime())) {
    return String(dateInput);
  }

  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });

  const parts = formatter.formatToParts(dateObj);
  const day = parts.find(p => p.type === 'day')?.value || '01';
  const month = parts.find(p => p.type === 'month')?.value || '01';
  const year = parts.find(p => p.type === 'year')?.value || '1970';
  return `${day}-${month}-${year}`;
}

/**
 * Formats a Date object, ISO timestamp, or time string into 12-hour hh:mm A strictly in Asia/Kolkata.
 */
export function formatISTTime(dateInput) {
  if (!dateInput) return '';
  
  if (typeof dateInput === 'string' && dateInput.includes(':') && !dateInput.includes('T')) {
    return normalizeTo12HourTime(dateInput);
  }

  const dateObj = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(dateObj.getTime())) {
    return normalizeTo12HourTime(dateInput);
  }

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });

  return formatter.format(dateObj);
}

/**
 * Formats a Date object or ISO timestamp into "DD-MM-YYYY, hh:mm A" strictly in Asia/Kolkata.
 */
export function formatISTDateTime(dateInput) {
  if (!dateInput) return '';
  const d = formatISTDate(dateInput);
  const t = formatISTTime(dateInput);
  return `${d}, ${t}`;
}

/**
 * Formats a Date object or ISO timestamp into "DD-MM-YYYY, hh:mm A (IST)".
 */
export function formatISTDateTimeWithZone(dateInput) {
  if (!dateInput) return '';
  return `${formatISTDateTime(dateInput)} (IST)`;
}

/**
 * Parses a date (DD-MM-YYYY or YYYY-MM-DD) and time (hh:mm A or HH:mm) interpreted
 * strictly as Indian Standard Time (UTC+05:30), returning the corresponding UTC Date object.
 *
 * For example:
 *   date: "15-07-2026", time: "10:00 AM" (IST)
 *   -> UTC Date object: 2026-07-15T04:30:00.000Z
 */
export function parseISTDateTimeToUTC(dateStr, timeStr) {
  if (!dateStr) return null;
  
  let yyyy, mm, dd;
  const dmy = String(dateStr).match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmy) {
    dd = dmy[1].padStart(2, '0');
    mm = dmy[2].padStart(2, '0');
    yyyy = dmy[3];
  } else {
    const ymd = String(dateStr).match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (ymd) {
      yyyy = ymd[1];
      mm = ymd[2].padStart(2, '0');
      dd = ymd[3].padStart(2, '0');
    } else {
      return null;
    }
  }

  let hours = 0;
  let minutes = 0;
  if (timeStr) {
    const normTime = normalizeTo12HourTime(timeStr);
    const m = normTime.match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
    if (m) {
      let h = parseInt(m[1], 10);
      minutes = parseInt(m[2], 10);
      const ampm = m[3].toUpperCase();
      if (ampm === 'PM' && h < 12) h += 12;
      if (ampm === 'AM' && h === 12) h = 0;
      hours = h;
    }
  }

  const hhStr = String(hours).padStart(2, '0');
  const mmStr = String(minutes).padStart(2, '0');
  
  // Construct ISO-8601 string anchored in Asia/Kolkata (+05:30)
  const istIso = `${yyyy}-${mm}-${dd}T${hhStr}:${mmStr}:00+05:30`;
  const utcDate = new Date(istIso);
  return isNaN(utcDate.getTime()) ? null : utcDate;
}

/**
 * Returns current timestamp in UTC (new Date()), while providing formatted IST helpers.
 */
export function getISTNow() {
  const now = new Date();
  return {
    date: formatISTDate(now),
    time: formatISTTime(now),
    dateTime: formatISTDateTime(now),
    utcDate: now
  };
}

/**
 * Checks if two dates (which can be in DD-MM-YYYY or YYYY-MM-DD or Date) refer to the same calendar day in IST.
 */
export function isSameISTDate(dateA, dateB) {
  if (!dateA || !dateB) return false;
  return normalizeToISTDate(dateA) === normalizeToISTDate(dateB);
}

/**
 * Helper to format calendar day picker values (year, monthIndex, day) into canonical DD-MM-YYYY string.
 */
export function formatCalendarDateToIST(year, monthIndex, day) {
  const dd = String(day).padStart(2, '0');
  const mm = String(monthIndex + 1).padStart(2, '0');
  return `${dd}-${mm}-${year}`;
}

/**
 * Checks if two appointment time intervals with buffer periods overlap.
 * Both appointments define:
 *  - startUtc: Date object in UTC
 *  - durationMinutes: duration of the consultation (default 60)
 *  - bufferMinutes: buffer time required before next session (default 0 or practice buffer)
 */
export function doAppointmentsOverlap(aptA, aptB, defaultBufferMinutes = 0) {
  const startA = (aptA.startUtc instanceof Date ? aptA.startUtc : new Date(aptA.startUtc)).getTime();
  const durA = (Number(aptA.durationMinutes) || 60) * 60 * 1000;
  const bufA = (aptA.bufferMinutes !== undefined ? Number(aptA.bufferMinutes) : defaultBufferMinutes) * 60 * 1000;
  const busyUntilA = startA + durA + bufA;

  const startB = (aptB.startUtc instanceof Date ? aptB.startUtc : new Date(aptB.startUtc)).getTime();
  const durB = (Number(aptB.durationMinutes) || 60) * 60 * 1000;
  const bufB = (aptB.bufferMinutes !== undefined ? Number(aptB.bufferMinutes) : defaultBufferMinutes) * 60 * 1000;
  const busyUntilB = startB + durB + bufB;

  // Intersect if max(starts) < min(busys)
  return Math.max(startA, startB) < Math.min(busyUntilA, busyUntilB);
}

/**
 * Given a date in DD-MM-YYYY or Date object, returns an array of the 7 days (Monday to Sunday) in that IST week.
 */
export function getISTWeekDays(currentDateInput = new Date()) {
  let refDate;
  if (currentDateInput instanceof Date) {
    refDate = currentDateInput;
  } else {
    refDate = parseISTDateTimeToUTC(currentDateInput, '12:00 PM') || new Date();
  }
  
  const d = new Date(refDate.getTime());
  const dayOfWeek = d.getDay();
  // Monday as start of week: Monday=1 -> 0, Sunday=0 -> -6
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);

  const days = [];
  for (let i = 0; i < 7; i++) {
    const current = new Date(monday);
    current.setDate(monday.getDate() + i);
    days.push({
      dateStr: formatISTDate(current),
      dayNumber: current.getDate(),
      weekdayShort: new Intl.DateTimeFormat('en-IN', { timeZone: TIMEZONE, weekday: 'short' }).format(current),
      weekdayFull: new Intl.DateTimeFormat('en-IN', { timeZone: TIMEZONE, weekday: 'long' }).format(current),
      dateObj: current
    });
  }
  return days;
}

/**
 * Returns the current date and time components strictly according to Indian Standard Time (Asia/Kolkata).
 * Eliminates browser/server local timezone bias.
 */
export function getNowIST() {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false
  });
  const parts = formatter.formatToParts(new Date());
  const year = parseInt(parts.find(p => p.type === 'year').value, 10);
  const month = parseInt(parts.find(p => p.type === 'month').value, 10) - 1; // 0-indexed (0 = Jan, 11 = Dec)
  const day = parseInt(parts.find(p => p.type === 'day').value, 10);
  const hour = parseInt(parts.find(p => p.type === 'hour').value, 10);
  const minute = parseInt(parts.find(p => p.type === 'minute').value, 10);
  const second = parseInt(parts.find(p => p.type === 'second').value, 10);

  const dd = String(day).padStart(2, '0');
  const mm = String(month + 1).padStart(2, '0');

  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    dateObj: new Date(year, month, day, 12, 0, 0),
    dateStr: `${dd}-${mm}-${year}`,
    isoDateStr: `${year}-${mm}-${dd}`
  };
}

/**
 * Checks if a given calendar day (year, monthIndex, day) is strictly before today in Asia/Kolkata.
 */
export function isPastISTDate(year, monthIndex, day) {
  const now = getNowIST();
  if (year < now.year) return true;
  if (year > now.year) return false;
  if (monthIndex < now.month) return true;
  if (monthIndex > now.month) return false;
  return day < now.day;
}

/**
 * Checks if a given calendar day (year, monthIndex, day) is today in Asia/Kolkata.
 */
export function isTodayIST(year, monthIndex, day) {
  const now = getNowIST();
  return year === now.year && monthIndex === now.month && day === now.day;
}


