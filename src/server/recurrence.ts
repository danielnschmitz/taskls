import {
  getDaysInMonth,
  startOfMonth,
  endOfMonth,
  format,
  parseISO,
  isSameDay,
  isAfter,
  isBefore,
  addMonths,
  addDays,
} from 'date-fns';

export interface SubtaskItem {
  id: string;
  title: string;
  completed: boolean;
}

export interface TaskRecord {
  id: string;
  title: string;
  description: string | null;
  type: 'weekly' | 'once' | 'monthly' | 'none';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  category: string;
  due_date: string | null; // 'YYYY-MM-DD'
  weekly_days: number[] | null; // [0, 1, 2, ...]
  monthly_type: 'day_of_month' | 'pattern' | null;
  monthly_day: number | null; // 1 - 31
  monthly_pattern: 'first' | 'second' | 'third' | 'fourth' | 'last' | null;
  monthly_weekday: number | null; // 0 - 6
  notification_times: string[];
  is_completed: boolean;
  completed_at: string | null;
  subtasks?: SubtaskItem[];
  snoozed_until?: string | null;
  user_id?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Returns the day of the month (1-31) that matches the pattern for a given year and month.
 * e.g. "last" Friday, "second" Tuesday, etc.
 */
export function calculatePatternDay(
  year: number,
  monthIndex: number, // 0 to 11
  pattern: 'first' | 'second' | 'third' | 'fourth' | 'last',
  targetWeekday: number // 0 to 6
): number {
  const daysInMonth = getDaysInMonth(new Date(year, monthIndex, 1));
  const matchingDays: number[] = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, monthIndex, day);
    if (d.getDay() === targetWeekday) {
      matchingDays.push(day);
    }
  }

  if (matchingDays.length === 0) return 1;

  switch (pattern) {
    case 'first':
      return matchingDays[0];
    case 'second':
      return matchingDays[1] || matchingDays[0];
    case 'third':
      return matchingDays[2] || matchingDays[matchingDays.length - 1];
    case 'fourth':
      return matchingDays[3] || matchingDays[matchingDays.length - 1];
    case 'last':
      return matchingDays[matchingDays.length - 1];
    default:
      return matchingDays[0];
  }
}

/**
 * Checks if a task occurs on a specific target date.
 */
export function isTaskOccurringOnDate(task: TaskRecord, targetDate: Date): boolean {
  const dateStr = format(targetDate, 'yyyy-MM-dd');

  switch (task.type) {
    case 'once': {
      if (!task.due_date) return false;
      // Handle either string or Date object from PG
      const taskDue = typeof task.due_date === 'string'
        ? task.due_date.substring(0, 10)
        : format(new Date(task.due_date), 'yyyy-MM-dd');
      return taskDue === dateStr;
    }

    case 'weekly': {
      if (!task.weekly_days || task.weekly_days.length === 0) return false;
      const dayOfWeek = targetDate.getDay();
      return task.weekly_days.includes(dayOfWeek);
    }

    case 'monthly': {
      const year = targetDate.getFullYear();
      const month = targetDate.getMonth();
      const dayOfMonth = targetDate.getDate();

      if (task.monthly_type === 'day_of_month') {
        if (!task.monthly_day) return false;
        const daysInCurrentMonth = getDaysInMonth(targetDate);
        // If task is set for 31st, but current month has 30 days, it falls on the 30th
        const effectiveDay = Math.min(task.monthly_day, daysInCurrentMonth);
        return dayOfMonth === effectiveDay;
      }

      if (task.monthly_type === 'pattern') {
        if (!task.monthly_pattern || task.monthly_weekday === null || task.monthly_weekday === undefined) {
          return false;
        }
        const patternDay = calculatePatternDay(
          year,
          month,
          task.monthly_pattern,
          task.monthly_weekday
        );
        return dayOfMonth === patternDay;
      }

      return false;
    }

    case 'none':
    default:
      return false;
  }
}

/**
 * Computes the next occurrence of a task starting from a given date (inclusive).
 */
export function getNextOccurrence(task: TaskRecord, fromDate: Date = new Date()): Date | null {
  const startDay = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());

  if (task.type === 'once') {
    if (!task.due_date) return null;
    const due = typeof task.due_date === 'string'
      ? parseISO(task.due_date.substring(0, 10))
      : new Date(task.due_date);
    return new Date(due.getFullYear(), due.getMonth(), due.getDate());
  }

  if (task.type === 'monthly') {
    // Check current month, then up to 12 months in the future
    for (let i = 0; i < 12; i++) {
      const candidateMonth = addMonths(startDay, i);
      const year = candidateMonth.getFullYear();
      const month = candidateMonth.getMonth();

      let targetDayNumber = 1;
      if (task.monthly_type === 'day_of_month' && task.monthly_day) {
        const daysInMonth = getDaysInMonth(candidateMonth);
        targetDayNumber = Math.min(task.monthly_day, daysInMonth);
      } else if (task.monthly_type === 'pattern' && task.monthly_pattern && task.monthly_weekday !== null) {
        targetDayNumber = calculatePatternDay(year, month, task.monthly_pattern, task.monthly_weekday);
      } else {
        continue;
      }

      const occurrence = new Date(year, month, targetDayNumber);
      if (isSameDay(occurrence, startDay) || isAfter(occurrence, startDay)) {
        return occurrence;
      }
    }
  }

  if (task.type === 'weekly') {
    if (!task.weekly_days || task.weekly_days.length === 0) return null;
    // Check up to 7 days ahead
    for (let i = 0; i <= 7; i++) {
      const candidate = addDays(startDay, i);
      if (task.weekly_days.includes(candidate.getDay())) {
        return candidate;
      }
    }
  }

  return null;
}
