import { addDays, format, parseISO, isSaturday, isSunday } from 'date-fns';

export interface ProjectHoliday {
  date: string; // 'YYYY-MM-DD'
  name: string;
}

export interface ProjectSettings {
  delivered_users: string[]; // e.g. ['Neogrid']
  work_hours_per_day: number; // e.g. 8
  plan_start_date: string; // 'YYYY-MM-DD'
  holidays: ProjectHoliday[];
  client_hours_markup_percent?: number;
  client_delivery_buffer_days?: number;
  issue_types?: string[];
}

export interface ProjectRecord {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  settings?: ProjectSettings;
  created_at?: string;
  updated_at?: string;
}

export interface PlanItemInput {
  id?: string;
  issue_key: string;
  summary: string;
  status?: string;
  assignee_name: string;
  estimate_hours: number;
  sort_order: number;
  metadata?: any;
}

export interface ScheduledPlanItem extends PlanItemInput {
  id: string;
  start_date: string; // 'YYYY-MM-DD'
  end_date: string;   // 'YYYY-MM-DD'
  working_days: number;
}

export function isWorkingDay(date: Date, holidaySet: Set<string>): boolean {
  if (isSaturday(date) || isSunday(date)) return false;
  const dateStr = format(date, 'yyyy-MM-dd');
  if (holidaySet.has(dateStr)) return false;
  return true;
}

export function getNextWorkingDay(date: Date, holidaySet: Set<string>): Date {
  let curr = new Date(date.getTime());
  while (!isWorkingDay(curr, holidaySet)) {
    curr = addDays(curr, 1);
  }
  return curr;
}

export function countWorkingDays(startDateStr: string, endDateStr: string, holidaySet: Set<string>): number {
  let curr = parseISO(startDateStr);
  const end = parseISO(endDateStr);
  let count = 0;
  while (curr <= end) {
    if (isWorkingDay(curr, holidaySet)) {
      count++;
    }
    curr = addDays(curr, 1);
  }
  return Math.max(1, count);
}

export function addWorkingDays(date: Date, days: number, holidaySet: Set<string>): Date {
  if (days <= 0) return new Date(date.getTime());
  let curr = new Date(date.getTime());
  let added = 0;
  while (added < days) {
    curr = addDays(curr, 1);
    if (isWorkingDay(curr, holidaySet)) {
      added++;
    }
  }
  return curr;
}

interface PersonTimelineState {
  currentDate: Date;
  hoursRemainingToday: number;
}

/**
 * Recalcula as datas de início e fim de cada item do plano no cliente
 */
export function calculatePlanSchedule(
  items: PlanItemInput[],
  settings: ProjectSettings
): ScheduledPlanItem[] {
  const holidaySet = new Set((settings.holidays || []).map((h) => h.date.trim()));
  const workHoursPerDay = Math.max(1, Number(settings.work_hours_per_day) || 8);
  
  let baseDate: Date;
  try {
    baseDate = settings.plan_start_date ? parseISO(settings.plan_start_date.substring(0, 10)) : new Date();
  } catch {
    baseDate = new Date();
  }
  const initialWorkDay = getNextWorkingDay(baseDate, holidaySet);

  const personStates = new Map<string, PersonTimelineState>();
  const sortedItems = [...items].sort((a, b) => a.sort_order - b.sort_order);
  const scheduledItems: ScheduledPlanItem[] = [];

  for (const item of sortedItems) {
    const personKey = (item.assignee_name || 'Não atribuído').trim() || 'Não atribuído';
    
    let person = personStates.get(personKey);
    if (!person) {
      person = {
        currentDate: new Date(initialWorkDay.getTime()),
        hoursRemainingToday: workHoursPerDay,
      };
      personStates.set(personKey, person);
    } else {
      if (person.hoursRemainingToday <= 0.001) {
        person.currentDate = getNextWorkingDay(addDays(person.currentDate, 1), holidaySet);
        person.hoursRemainingToday = workHoursPerDay;
      }
    }

    const itemStartDateStr = format(person.currentDate, 'yyyy-MM-dd');
    let neededHours = Math.max(0.5, Number(item.estimate_hours) || 1);
    let itemEndDateStr = itemStartDateStr;

    while (neededHours > 0.001) {
      const availableToday = person.hoursRemainingToday;

      if (neededHours <= availableToday) {
        person.hoursRemainingToday = parseFloat((availableToday - neededHours).toFixed(2));
        itemEndDateStr = format(person.currentDate, 'yyyy-MM-dd');
        neededHours = 0;
      } else {
        neededHours = parseFloat((neededHours - availableToday).toFixed(2));
        person.currentDate = getNextWorkingDay(addDays(person.currentDate, 1), holidaySet);
        person.hoursRemainingToday = workHoursPerDay;
        itemEndDateStr = format(person.currentDate, 'yyyy-MM-dd');
      }
    }

    const workingDays = countWorkingDays(itemStartDateStr, itemEndDateStr, holidaySet);

    scheduledItems.push({
      ...item,
      id: item.id || `item_${item.issue_key}_${Date.now()}`,
      start_date: itemStartDateStr,
      end_date: itemEndDateStr,
      working_days: workingDays,
    });
  }

  return scheduledItems;
}
