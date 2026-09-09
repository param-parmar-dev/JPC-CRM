import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const EASTERN_TIME_ZONE = 'America/New_York';

export const getCurrentEasternISOString = (): string => {
  try {
    const formatter = new Intl.DateTimeFormat('sv-SE', {
      timeZone: EASTERN_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    const formatted = formatter.format(new Date());
    return formatted.replace(' ', 'T');
  } catch (e) {
    const estDateString = new Date().toLocaleString("en-US", { timeZone: EASTERN_TIME_ZONE });
    const d = new Date(estDateString);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${y}-${m}-${dd}T${hh}:${mm}:${ss}`;
  }
};

export const getEasternDate = () => {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: EASTERN_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
};

export const getCurrentEasternHourAndMinute = (): { hour: number; minute: number } => {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: EASTERN_TIME_ZONE,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false
    });
    const parts = formatter.formatToParts(new Date());
    let hour = 12;
    let minute = 0;
    
    parts.forEach(p => {
      if (p.type === 'hour') hour = parseInt(p.value, 10);
      if (p.type === 'minute') minute = parseInt(p.value, 10);
    });
    
    return { hour, minute };
  } catch (e) {
    const date = new Date();
    // basic fallback
    return { hour: date.getHours(), minute: date.getMinutes() };
  }
};

export const isEasternDayOngoing = (checkDateStr: string): boolean => {
  const todayStr = getEasternDate();
  if (checkDateStr !== todayStr) return false;
  
  const { hour, minute } = getCurrentEasternHourAndMinute();
  const timeVal = hour * 100 + minute;
  return timeVal < 1815; // 18:15 is 6:15 PM
};

/**
 * Validates if the given date/time is within Sales Person working hours:
 * Monday through Friday, 9:30 AM to 6:30 PM Eastern Time (America/New_York).
 */
export const isSalesWorkingHours = (date: Date = new Date()): boolean => {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: EASTERN_TIME_ZONE,
      weekday: 'short',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false
    });
    const parts = formatter.formatToParts(date);
    let weekday = '';
    let hour = 0;
    let minute = 0;

    parts.forEach(p => {
      if (p.type === 'weekday') weekday = p.value;
      if (p.type === 'hour') hour = parseInt(p.value, 10);
      if (p.type === 'minute') minute = parseInt(p.value, 10);
    });

    const isWeekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(weekday);
    if (!isWeekday) return false;

    // 9:30 AM = 570 mins, 6:30 PM = 1110 mins
    const totalMinutes = hour * 60 + minute;
    return totalMinutes >= 570 && totalMinutes <= 1110;
  } catch (e) {
    console.error('Error checking sales working hours:', e);
    return false;
  }
};

export const getEasternTimeString = (date: Date = new Date()): string => {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: EASTERN_TIME_ZONE,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).format(date);
  } catch (e) {
    return date.toLocaleTimeString();
  }
};


export const getLocalYYYYMMDD = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export function parseLocalTimeToDate(localStr: string, timeZone: string = 'America/New_York'): Date {
  const parts = localStr.split('T');
  const dateParts = parts[0].split('-');
  const timeParts = (parts[1] || '00:00:00').split(':');
  
  const year = parseInt(dateParts[0], 10);
  const month = parseInt(dateParts[1], 10) - 1;
  const day = parseInt(dateParts[2], 10);
  const hour = parseInt(timeParts[0], 10);
  const minute = parseInt(timeParts[1], 10);
  const second = parseInt(timeParts[2] || '0', 10);
  
  let utcGuess = new Date(Date.UTC(year, month, day, hour, minute, second));
  
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    });
    
    const partsOfFormatted = formatter.formatToParts(utcGuess);
    const getPartVal = (type: Intl.DateTimeFormatPartTypes) => 
      parseInt(partsOfFormatted.find(p => p.type === type)?.value || '0', 10);
    
    const formattedYear = getPartVal('year');
    const formattedMonth = getPartVal('month');
    const formattedDay = getPartVal('day');
    const formattedHour = getPartVal('hour');
    const formattedMinute = getPartVal('minute');
    
    const formattedLocal = Date.UTC(
      formattedYear, formattedMonth - 1, formattedDay,
      formattedHour % 24, formattedMinute, 0
    );
    
    const originalWantedLocal = Date.UTC(year, month, day, hour, minute, 0);
    const diffMs = originalWantedLocal - formattedLocal;
    
    return new Date(utcGuess.getTime() + diffMs);
  } catch (e) {
    return new Date(year, month, day, hour, minute, second);
  }
}

export interface CalendarDate {
  dateStr: string;
  year: number;
  month: number;
  day: number;
  weekdayShort: string;
  weekdayLong: string;
  monthLong: string;
}

export function getCalendarDateInfo(dateStr: string): CalendarDate {
  const parts = dateStr.split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  
  // Construct a Date object representing UTC noon to completely avoid any edge case or DST transitions
  const dateUtc = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  
  // Format the elements in UTC timezone to be 100% timezone-safe
  const weekdayShort = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(dateUtc);
  const weekdayLong = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' }).format(dateUtc);
  const monthLong = new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' }).format(dateUtc);
  
  return {
    dateStr,
    year,
    month,
    day,
    weekdayShort,
    weekdayLong,
    monthLong
  };
}

export const formatDisplayDateWithWeekday = (dateStr: string | undefined | null, timeZone: string = 'America/New_York'): string => {
  if (!dateStr) return 'N/A';
  try {
    const pureDateParts = dateStr.split('-');
    if (pureDateParts.length === 3 && !dateStr.includes('T')) {
      const info = getCalendarDateInfo(dateStr);
      return `${info.weekdayShort}, ${info.monthLong} ${info.day}, ${info.year}`;
    }
    
    const cleanStr = dateStr.includes('.') ? dateStr.split('.')[0] : dateStr;
    const date = parseLocalTimeToDate(cleanStr, timeZone);
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone,
      weekday: 'short',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    }).format(date);
  } catch (e) {
    return dateStr;
  }
};

export const formatDisplayDate = (dateStr: string | undefined | null) => {
  if (!dateStr) return 'N/A';
  // If it's YYYY-MM-DD, parse manually to avoid local timezone shift
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const [year, month, day] = parts;
    return `${month}/${day}/${year}`;
  }
  // Fallback for other formats
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      timeZone: EASTERN_TIME_ZONE
    });
  } catch (e) {
    return dateStr;
  }
};
