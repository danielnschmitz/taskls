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
  global_assignees?: string[];
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

export const DEFAULT_BRAZILIAN_HOLIDAYS: ProjectHoliday[] = [
  // 2026
  { date: '2026-01-01', name: 'Confraternização Universal' },
  { date: '2026-02-16', name: 'Carnaval (Segunda-feira)' },
  { date: '2026-02-17', name: 'Carnaval (Terça-feira)' },
  { date: '2026-02-18', name: 'Quarta-feira de Cinzas' },
  { date: '2026-04-03', name: 'Sexta-feira Santa (Paixão de Cristo)' },
  { date: '2026-04-21', name: 'Tiradentes' },
  { date: '2026-05-01', name: 'Dia Mundial do Trabalho' },
  { date: '2026-06-04', name: 'Corpus Christi' },
  { date: '2026-09-07', name: 'Independência do Brasil' },
  { date: '2026-10-12', name: 'Nossa Senhora Aparecida' },
  { date: '2026-11-02', name: 'Finados' },
  { date: '2026-11-15', name: 'Proclamação da República' },
  { date: '2026-11-20', name: 'Dia da Consciência Negra' },
  { date: '2026-12-25', name: 'Natal' },
  // 2027
  { date: '2027-01-01', name: 'Confraternização Universal' },
  { date: '2027-02-08', name: 'Carnaval (Segunda-feira)' },
  { date: '2027-02-09', name: 'Carnaval (Terça-feira)' },
  { date: '2027-02-10', name: 'Quarta-feira de Cinzas' },
  { date: '2027-03-26', name: 'Sexta-feira Santa (Paixão de Cristo)' },
  { date: '2027-04-21', name: 'Tiradentes' },
  { date: '2027-05-01', name: 'Dia Mundial do Trabalho' },
  { date: '2027-05-27', name: 'Corpus Christi' },
  { date: '2027-09-07', name: 'Independência do Brasil' },
  { date: '2027-10-12', name: 'Nossa Senhora Aparecida' },
  { date: '2027-11-02', name: 'Finados' },
  { date: '2027-11-15', name: 'Proclamação da República' },
  { date: '2027-11-20', name: 'Dia da Consciência Negra' },
  { date: '2027-12-25', name: 'Natal' },
  // 2028
  { date: '2028-01-01', name: 'Confraternização Universal' },
  { date: '2028-02-28', name: 'Carnaval (Segunda-feira)' },
  { date: '2028-02-29', name: 'Carnaval (Terça-feira)' },
  { date: '2028-03-01', name: 'Quarta-feira de Cinzas' },
  { date: '2028-04-14', name: 'Sexta-feira Santa (Paixão de Cristo)' },
  { date: '2028-04-21', name: 'Tiradentes' },
  { date: '2028-05-01', name: 'Dia Mundial do Trabalho' },
  { date: '2028-06-15', name: 'Corpus Christi' },
  { date: '2028-09-07', name: 'Independência do Brasil' },
  { date: '2028-10-12', name: 'Nossa Senhora Aparecida' },
  { date: '2028-11-02', name: 'Finados' },
  { date: '2028-11-15', name: 'Proclamação da República' },
  { date: '2028-11-20', name: 'Dia da Consciência Negra' },
  { date: '2028-12-25', name: 'Natal' },
];

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  delivered_users: ['Neogrid'],
  work_hours_per_day: 8,
  plan_start_date: format(new Date(), 'yyyy-MM-dd'),
  holidays: DEFAULT_BRAZILIAN_HOLIDAYS,
  global_assignees: [],
  client_hours_markup_percent: 0,
  client_delivery_buffer_days: 1,
};

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

/**
 * Verifica se uma data é dia útil (Segunda a Sexta e fora da lista de feriados)
 */
export function isWorkingDay(date: Date, holidaySet: Set<string>): boolean {
  if (isSaturday(date) || isSunday(date)) return false;
  const dateStr = format(date, 'yyyy-MM-dd');
  if (holidaySet.has(dateStr)) return false;
  return true;
}

/**
 * Retorna o próximo dia útil a partir da data informada (inclusive ela mesma, se já for dia útil)
 */
export function getNextWorkingDay(date: Date, holidaySet: Set<string>): Date {
  let curr = new Date(date.getTime());
  while (!isWorkingDay(curr, holidaySet)) {
    curr = addDays(curr, 1);
  }
  return curr;
}

/**
 * Conta os dias úteis entre duas datas (inclusive)
 */
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

interface PersonTimelineState {
  currentDate: Date;
  hoursRemainingToday: number;
}

/**
 * Motor central de cálculo do cronograma:
 * - Respeita dias úteis (Seg-Sex)
 * - Pula feriados nacionais e recessos configurados
 * - Considera a jornada diária em horas
 * - Execução em paralelo entre pessoas distintas
 * - Execução sequencial para a mesma pessoa, aproveitando frações de dia restantes
 */
export function calculatePlanSchedule(
  items: PlanItemInput[],
  settings: ProjectSettings
): ScheduledPlanItem[] {
  const holidaySet = new Set((settings.holidays || []).map((h) => h.date.trim()));
  const workHoursPerDay = Math.max(1, Number(settings.work_hours_per_day) || 8);
  
  // Data base de início do planejamento
  let baseDate: Date;
  try {
    baseDate = settings.plan_start_date ? parseISO(settings.plan_start_date.substring(0, 10)) : new Date();
  } catch {
    baseDate = new Date();
  }
  const initialWorkDay = getNextWorkingDay(baseDate, holidaySet);

  // Mapa de estado por executor (pessoa)
  const personStates = new Map<string, PersonTimelineState>();

  // Ordena os itens pela ordem definida (sort_order)
  const sortedItems = [...items].sort((a, b) => a.sort_order - b.sort_order);

  const scheduledItems: ScheduledPlanItem[] = [];

  for (const item of sortedItems) {
    const personKey = (item.assignee_name || 'Não atribuído').trim() || 'Não atribuído';
    
    // Obtém ou inicializa a linha do tempo desta pessoa
    let person = personStates.get(personKey);
    if (!person) {
      person = {
        currentDate: new Date(initialWorkDay.getTime()),
        hoursRemainingToday: workHoursPerDay,
      };
      personStates.set(personKey, person);
    } else {
      // Se a pessoa gastou todas as horas do dia atual, avança para o próximo dia útil
      if (person.hoursRemainingToday <= 0.001) {
        person.currentDate = getNextWorkingDay(addDays(person.currentDate, 1), holidaySet);
        person.hoursRemainingToday = workHoursPerDay;
      }
    }

    // A tarefa se inicia no currentDate atual da pessoa
    const itemStartDateStr = format(person.currentDate, 'yyyy-MM-dd');
    let neededHours = Math.max(0.5, Number(item.estimate_hours) || 1);
    let itemEndDateStr = itemStartDateStr;

    // Aloca as horas dia a dia
    while (neededHours > 0.001) {
      const availableToday = person.hoursRemainingToday;

      if (neededHours <= availableToday) {
        // Conclui no próprio dia corrente
        person.hoursRemainingToday = parseFloat((availableToday - neededHours).toFixed(2));
        itemEndDateStr = format(person.currentDate, 'yyyy-MM-dd');
        neededHours = 0;
      } else {
        // Usa todo o saldo do dia corrente e avança para o próximo dia útil
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
