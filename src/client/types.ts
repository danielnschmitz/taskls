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

export interface JiraDemand {
  id: string;
  key: string;
  summary: string;
  duedate: string; // 'YYYY-MM-DD'
  project: {
    key: string;
    name: string;
  };
  rawStatus: string;
  displayStatus: string;
  assignee: {
    displayName: string;
    avatarUrl?: string;
  } | null;
  epic: {
    key: string;
    summary?: string;
  } | null;
  industry: string | null;
  layout: string | null;
  isBlocked?: boolean;
  blockedReason?: string | null;
  url: string;
}

export interface JiraDayGroup {
  date: string; // 'YYYY-MM-DD'
  dayOfWeek: number; // 1-5 (Segunda a Sexta)
  dayName: string;
  dayNumber: number;
  monthName: string;
  isToday: boolean;
  demands: JiraDemand[];
}

export interface JiraTimelineSection {
  demands: JiraDemand[];
  total: number;
}

export interface JiraWeekResponse {
  startDate: string;
  endDate: string;
  days: JiraDayGroup[];
  totalDemands: number;
  lastUpdated: string;
  overdue?: JiraTimelineSection;
  future?: JiraTimelineSection;
}

export interface JiraConfig {
  domain: string;
  email: string;
  api_token?: string;
  projects: string[];
  statuses: string[];
  custom_fields?: {
    industry: string;
    layout: string;
  };
  hasApiToken?: boolean;
  allPossibleStatuses?: string[];
}

export type ModuleType = 'tasks' | 'cards' | 'settings';

export interface CardTemplate {
  id: string;
  userId?: string;
  title: string;
  description?: string | null;
  category: string;
  content: string;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SavedCard {
  id: string;
  userId: string;
  templateId?: string | null;
  templateTitle?: string;
  title: string;
  macroValues: Record<string, string>;
  contentMarkdown: string;
  createdAt: string;
  updatedAt?: string;
}

export interface CardMacro {
  name: string;
  label: string;
  isMultiline: boolean;
}

export type JiraEventType =
  | 'status_changed'
  | 'flagged_changed'
  | 'comment_added'
  | 'issue_created'
  | 'assignee_changed'
  | 'field_updated';

export interface JiraEventDiff {
  field: string;
  label: string;
  from?: string | null;
  to?: string | null;
  text?: string;
  isBlocked?: boolean;
  [key: string]: any;
}

export interface JiraReviewEvent {
  id: number;
  eventId: string;
  issueKey: string;
  issueId?: string;
  projectKey: string;
  summary: string;
  eventType: JiraEventType;
  authorName: string;
  authorAvatar?: string | null;
  eventTime: string;
  diff: JiraEventDiff;
  cardData: JiraDemand;
  isReviewed: boolean;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  createdAt: string;
}

export interface JiraEventsResponse {
  events: JiraReviewEvent[];
  totalPending: number;
  totalReviewed: number;
  total: number;
}

