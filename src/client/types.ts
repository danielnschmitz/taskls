export type TaskType = 'weekly' | 'once' | 'monthly' | 'none';
export type Priority = 'low' | 'medium' | 'high' | 'urgent';
export type MonthlyType = 'day_of_month' | 'pattern';
export type MonthlyPattern = 'first' | 'second' | 'third' | 'fourth' | 'last';

export interface SubtaskItem {
  id: string;
  title: string;
  completed: boolean;
}

export interface CategoryInfo {
  id: string;
  name: string;
  color: string;
  icon: string;
}

export interface DndStatus {
  enabled: boolean;
  until: string | null;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  type: TaskType;
  priority: Priority;
  category: string;
  due_date: string | null;
  weekly_days: number[] | null;
  monthly_type: MonthlyType | null;
  monthly_day: number | null;
  monthly_pattern: MonthlyPattern | null;
  monthly_weekday: number | null;
  notification_times: string[];
  is_completed: boolean;
  completed_at: string | null;
  subtasks?: SubtaskItem[];
  snoozed_until?: string | null;
  created_at: string;
  updated_at: string;
  // Dynamic fields from dashboard
  occurrence_date?: string;
  is_completed_for_date?: boolean;
  next_occurrence?: string | null;
}

export interface DayData {
  date: string; // 'YYYY-MM-DD'
  dayOfWeek: number; // 0-6
  dayName: string; // 'Segunda-feira'
  dayNumber: number; // 1-31
  monthName: string; // 'set'
  isToday: boolean;
  tasks: Task[];
}

export interface WeekData {
  startDate: string;
  endDate: string;
  days: DayData[];
}

export interface DashboardData {
  week: WeekData;
  upcoming: Task[];
  backlog: Task[];
  categories?: CategoryInfo[];
  dnd?: DndStatus;
}

export interface TaskFormData {
  id?: string;
  title: string;
  description: string;
  type: TaskType;
  priority: Priority;
  category: string;
  due_date: string;
  weekly_days: number[];
  monthly_type: MonthlyType;
  monthly_day: number;
  monthly_pattern: MonthlyPattern;
  monthly_weekday: number;
  notification_times: string[];
  subtasks: SubtaskItem[];
}
