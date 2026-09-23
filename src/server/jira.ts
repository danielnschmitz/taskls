import { pool } from './db';

export interface JiraConfig {
  domain: string;
  email: string;
  api_token: string;
  projects: string[];
  statuses: string[];
  custom_fields: {
    industry: string;
    layout: string;
    flagged?: string;
  };
  ignored_fields?: string[];
}

export const DEFAULT_IGNORED_FIELDS = [
  'Classificação',
  '[BI] Priorizado',
  'labels',
  'IssueParentAssociation',
  'Link',
  'Attachment',
  '[BI] Desenvolvedor',
  '[BI] Desenvolvimento',
  '[BI] Finalizado',
];

export const ALL_POSSIBLE_STATUSES = [
  'Resolvido',
  'Validação técnica',
  'Aberto',
  'Pronto p/ fazer',
  'Desenvolvimento',
  'Deploy HML',
  'Teste de Aceitação',
  'Deploy',
  'Documentação',
  'Concluído',
  'Em produção',
  'Cancelado',
  'Desativado',
];

export const DEFAULT_JIRA_CONFIG: JiraConfig = {
  domain: process.env.JIRA_DOMAIN || 'sysmiddle.atlassian.net',
  email: process.env.JIRA_EMAIL || 'daniel.schmitz@sysmiddle.com.br',
  api_token: process.env.JIRA_API_TOKEN || '',
  projects: ['NEO', 'ESM'],
  statuses: [...ALL_POSSIBLE_STATUSES],
  custom_fields: {
    industry: 'customfield_10780',
    layout: 'customfield_10714',
    flagged: 'customfield_10021',
  },
  ignored_fields: [...DEFAULT_IGNORED_FIELDS],
};

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
  dayOfWeek: number; // 1 (Mon) - 5 (Fri)
  dayName: string; // 'Segunda-feira'
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

/**
 * Obtém a configuração atual do Jira salva no PostgreSQL
 */
export async function getJiraConfig(): Promise<JiraConfig> {
  const currentDefaults: JiraConfig = {
    domain: process.env.JIRA_DOMAIN || DEFAULT_JIRA_CONFIG.domain,
    email: process.env.JIRA_EMAIL || DEFAULT_JIRA_CONFIG.email,
    api_token: process.env.JIRA_API_TOKEN || '',
    projects: DEFAULT_JIRA_CONFIG.projects,
    statuses: DEFAULT_JIRA_CONFIG.statuses,
    custom_fields: { ...DEFAULT_JIRA_CONFIG.custom_fields },
    ignored_fields: [...DEFAULT_IGNORED_FIELDS],
  };

  const res = await pool.query(`SELECT value FROM app_settings WHERE key = 'jira_config'`);
  if (res.rows.length === 0) {
    // Seed initial configuration
    await pool.query(
      `INSERT INTO app_settings (key, value) VALUES ('jira_config', $1) ON CONFLICT (key) DO NOTHING`,
      [JSON.stringify(currentDefaults)]
    );
    return currentDefaults;
  }

  const saved = res.rows[0].value;
  return {
    ...currentDefaults,
    ...saved,
    api_token: saved.api_token || process.env.JIRA_API_TOKEN || '',
    domain: saved.domain || process.env.JIRA_DOMAIN || currentDefaults.domain,
    email: saved.email || process.env.JIRA_EMAIL || currentDefaults.email,
    projects: saved.projects || currentDefaults.projects,
    statuses: saved.statuses || currentDefaults.statuses,
    custom_fields: {
      ...currentDefaults.custom_fields,
      ...(saved.custom_fields || {}),
    },
    ignored_fields: Array.isArray(saved.ignored_fields)
      ? saved.ignored_fields
      : [...DEFAULT_IGNORED_FIELDS],
  };
}

/**
 * Salva a configuração do Jira no PostgreSQL
 */
export async function saveJiraConfig(newConfig: Partial<JiraConfig>): Promise<JiraConfig> {
  const current = await getJiraConfig();
  const merged: JiraConfig = {
    ...current,
    ...newConfig,
    projects: Array.isArray(newConfig.projects)
      ? newConfig.projects.map((p) => p.trim().toUpperCase()).filter(Boolean)
      : current.projects,
    statuses: Array.isArray(newConfig.statuses)
      ? newConfig.statuses
      : current.statuses,
    custom_fields: {
      ...current.custom_fields,
      ...(newConfig.custom_fields || {}),
    },
    ignored_fields: Array.isArray(newConfig.ignored_fields)
      ? Array.from(new Set(newConfig.ignored_fields.map((f) => f.trim()).filter(Boolean)))
      : current.ignored_fields || [...DEFAULT_IGNORED_FIELDS],
  };

  await pool.query(
    `INSERT INTO app_settings (key, value)
     VALUES ('jira_config', $1)
     ON CONFLICT (key) DO UPDATE SET value = $1`,
    [JSON.stringify(merged)]
  );

  return merged;
}

/**
 * Helper para verificar se um campo do Jira deve ser desconsiderado nas revisões
 */
export function isFieldIgnored(field: string, ignoredFields: string[] = []): boolean {
  if (!field) return false;
  const norm = field.trim().toLowerCase();
  return ignoredFields.some((f) => f.trim().toLowerCase() === norm);
}

/**
 * Monta o cabeçalho Basic Auth para a API Atlassian
 */
export function getAuthHeader(config: JiraConfig): string {
  const credentials = `${config.email.trim()}:${config.api_token.trim()}`;
  return `Basic ${Buffer.from(credentials).toString('base64')}`;
}

/**
 * Testa a conexão com o Jira buscando dados do usuário atual (/rest/api/3/myself)
 */
export async function testJiraConnection(config?: Partial<JiraConfig>): Promise<{ success: boolean; message: string; user?: any }> {
  try {
    const fullConfig = config ? { ...(await getJiraConfig()), ...config } : await getJiraConfig();

    if (!fullConfig.email || !fullConfig.api_token || !fullConfig.domain) {
      return { success: false, message: 'Domínio, e-mail e token de API são obrigatórios.' };
    }

    const host = fullConfig.domain.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    const url = `https://${host}/rest/api/3/myself`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: getAuthHeader(fullConfig),
        Accept: 'application/json',
      },
    });

    if (response.status === 401) {
      return {
        success: false,
        message: 'Falha de autenticação (401). Verifique se o e-mail e o token do Jira estão corretos.',
      };
    }

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        message: `Erro na API do Jira (${response.status}): ${errorText.substring(0, 200)}`,
      };
    }

    const user = await response.json();
    return {
      success: true,
      message: `Conexão bem sucedida com o Jira! Conectado como ${user.displayName || user.emailAddress}.`,
      user: {
        displayName: user.displayName,
        emailAddress: user.emailAddress,
        accountId: user.accountId,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Erro de conexão com o Jira: ${error.message}`,
    };
  }
}

/**
 * Transforma o status do card aplicando regras especiais (ex: NEO)
 */
export function formatDisplayStatus(projectKey: string, rawStatus: string): string {
  const normProject = (projectKey || '').toUpperCase().trim();
  const normStatus = (rawStatus || '').trim();

  if (normProject === 'NEO') {
    if (normStatus.toLowerCase() === 'deploy hml') {
      return 'Validação Diária';
    }
    if (normStatus.toLowerCase() === 'teste de aceitação' || normStatus.toLowerCase() === 'teste de aceitacao') {
      return 'Validação Histórica';
    }
  }

  return rawStatus;
}

/**
 * Helper para extrair valor de texto de campos customizados do Jira
 */
function extractFieldValue(val: any): string | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'string') return val.trim() || null;
  if (typeof val === 'number') return String(val);
  if (typeof val === 'object') {
    if (val.value) return String(val.value);
    if (val.name) return String(val.name);
  }
  return String(val);
}

const DONE_STATUS_NAMES = new Set([
  'concluído',
  'concluido',
  'resolvido',
  'em produção',
  'em producao',
  'cancelado',
  'desativado',
  'done',
  'closed',
  'resolved',
]);

/**
 * Converte issues do Jira no formato JiraDemand[]
 */
function parseJiraIssues(
  issues: any[],
  host: string,
  industryField: string,
  layoutField: string,
  flaggedField: string,
  allowedStatuses: Set<string>,
  excludeDone: boolean = false
): JiraDemand[] {
  const demands: JiraDemand[] = [];

  for (const issue of issues) {
    const rawStatus = issue.fields?.status?.name || 'Desconhecido';
    const normStatus = rawStatus.toLowerCase().trim();

    if (excludeDone && DONE_STATUS_NAMES.has(normStatus)) {
      continue;
    }

    // Se o status da demanda não estiver habilitado na configuração, ignora
    if (allowedStatuses.size > 0 && !allowedStatuses.has(normStatus)) {
      continue;
    }

    const projKey = issue.fields?.project?.key || '';
    const projName = issue.fields?.project?.name || projKey;
    const displayStatus = formatDisplayStatus(projKey, rawStatus);

    if (excludeDone && DONE_STATUS_NAMES.has(displayStatus.toLowerCase().trim())) {
      continue;
    }

    let epicInfo: { key: string; summary?: string } | null = null;
    if (issue.fields?.parent) {
      epicInfo = {
        key: issue.fields.parent.key,
        summary: issue.fields.parent.fields?.summary || issue.fields.parent.key,
      };
    }

    let assigneeInfo: { displayName: string; avatarUrl?: string } | null = null;
    if (issue.fields?.assignee) {
      assigneeInfo = {
        displayName: issue.fields.assignee.displayName || issue.fields.assignee.name || 'Sem nome',
        avatarUrl:
          issue.fields.assignee.avatarUrls?.['32x32'] ||
          issue.fields.assignee.avatarUrls?.['24x24'],
      };
    }

    const industryVal = extractFieldValue(issue.fields?.[industryField]);
    const layoutVal = extractFieldValue(issue.fields?.[layoutField]);

    // Verificação se o card está bloqueado / com impedimento (Flagged[Checkboxes] = Impediment)
    const flaggedVal =
      issue.fields?.[flaggedField] ??
      issue.fields?.customfield_10021 ??
      issue.fields?.['Flagged[Checkboxes]'] ??
      issue.fields?.flagged;

    let isBlocked = false;
    let blockedReason: string | null = null;

    if (Array.isArray(flaggedVal)) {
      for (const item of flaggedVal) {
        const valStr = (typeof item === 'string' ? item : item?.value || '').trim();
        if (valStr.toLowerCase().includes('impediment') || valStr.toLowerCase().includes('impedimento')) {
          isBlocked = true;
          blockedReason = valStr;
          break;
        }
      }
    } else if (typeof flaggedVal === 'string') {
      const valStr = flaggedVal.trim();
      if (valStr.toLowerCase().includes('impediment') || valStr.toLowerCase().includes('impedimento')) {
        isBlocked = true;
        blockedReason = valStr;
      }
    } else if (flaggedVal && typeof flaggedVal === 'object') {
      const valStr = (flaggedVal.value || '').trim();
      if (valStr.toLowerCase().includes('impediment') || valStr.toLowerCase().includes('impedimento')) {
        isBlocked = true;
        blockedReason = valStr;
      }
    }

    demands.push({
      id: issue.id,
      key: issue.key,
      summary: issue.fields?.summary || 'Sem resumo',
      duedate: issue.fields?.duedate, // 'YYYY-MM-DD'
      project: {
        key: projKey,
        name: projName,
      },
      rawStatus,
      displayStatus,
      assignee: assigneeInfo,
      epic: epicInfo,
      industry: industryVal,
      layout: layoutVal,
      isBlocked,
      blockedReason,
      url: `https://${host}/browse/${issue.key}`,
    });
  }

  return demands;
}

/**
 * Executa uma busca JQL no Jira REST API v3
 */
export async function executeJqlSearch(
  url: string,
  config: JiraConfig,
  jql: string,
  fields: string[],
  maxResults: number = 100
): Promise<any[]> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: getAuthHeader(config),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      jql,
      fields,
      maxResults,
    }),
  });

  const loginReason = response.headers.get('x-seraph-loginreason');
  if (response.status === 401 || loginReason === 'AUTHENTICATED_FAILED') {
    throw new Error('Falha de autenticação com o Jira (401). O seu token de API pode ter expirado ou sido revogado. Por favor, atualize o token no módulo Configurações.');
  }

  if (!response.ok) {
    const errText = await response.text();
    console.error('[Jira] Erro ao buscar via JQL:', response.status, errText);
    throw new Error(`Erro na API do Jira (${response.status}): ${errText.substring(0, 200)}`);
  }

  const searchData = await response.json();
  return searchData.issues || [];
}

/**
 * Busca e formata as demandas da semana, atrasadas e futuras na API do Jira
 */
export async function getJiraDemandsForWeek(
  weekStartStr?: string // 'YYYY-MM-DD' (Segunda-feira)
): Promise<JiraWeekResponse> {
  const config = await getJiraConfig();

  // Calcular dias úteis da semana (Segunda a Sexta)
  let baseDate = weekStartStr ? new Date(`${weekStartStr}T12:00:00Z`) : new Date();
  if (isNaN(baseDate.getTime())) {
    baseDate = new Date();
  }
  // Se não foi passada uma data válida, posicionar na segunda-feira da semana
  if (!weekStartStr || isNaN(new Date(`${weekStartStr}T12:00:00Z`).getTime())) {
    const day = baseDate.getDay();
    const diff = baseDate.getDate() - day + (day === 0 ? -6 : 1);
    baseDate = new Date(baseDate.setDate(diff));
  }
  const workDaysDates: { dateStr: string; date: Date; dayOfWeek: number }[] = [];

  for (let i = 0; i < 5; i++) {
    const d = new Date(baseDate);
    d.setDate(baseDate.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    workDaysDates.push({
      dateStr,
      date: d,
      dayOfWeek: i + 1, // 1 = Seg, 5 = Sex
    });
  }

  const mondayStr = workDaysDates[0].dateStr;
  const fridayStr = workDaysDates[4].dateStr;

  const monthNames = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const dayNames = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira'];

  const todayStr = new Date().toISOString().split('T')[0];

  // Se não houver projetos configurados ou token de API ausente, retorna estrutura vazia
  if (!config.projects || config.projects.length === 0 || !config.api_token) {
    return {
      startDate: mondayStr,
      endDate: fridayStr,
      days: workDaysDates.map((item, idx) => ({
        date: item.dateStr,
        dayOfWeek: item.dayOfWeek,
        dayName: dayNames[idx],
        dayNumber: item.date.getDate(),
        monthName: monthNames[item.date.getMonth()],
        isToday: item.dateStr === todayStr,
        demands: [],
      })),
      totalDemands: 0,
      lastUpdated: new Date().toISOString(),
      overdue: {
        demands: [],
        total: 0,
      },
      future: {
        demands: [],
        total: 0,
      },
    };
  }

  const host = config.domain.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const url = `https://${host}/rest/api/3/search/jql`;

  const industryField = config.custom_fields?.industry || 'customfield_10780';
  const layoutField = config.custom_fields?.layout || 'customfield_10714';
  const flaggedField = config.custom_fields?.flagged || 'customfield_10021';
  const fields = [
    'summary',
    'duedate',
    'project',
    'parent',
    'status',
    'priority',
    'assignee',
    flaggedField,
    industryField,
    layoutField,
  ];

  const projectsJql = config.projects.map((p) => `"${p}"`).join(', ');

  // 1. JQL da semana atual (Segunda a Sexta)
  const weekJql = `project in (${projectsJql}) AND duedate is not EMPTY AND duedate >= "${mondayStr}" AND duedate <= "${fridayStr}" ORDER BY duedate ASC`;

  // 2. JQL de atrasadas: últimos 2 meses até antes de segunda-feira da semana em visualização
  const twoMonthsAgo = new Date(baseDate);
  twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
  const twoMonthsAgoStr = twoMonthsAgo.toISOString().split('T')[0];
  const overdueJql = `project in (${projectsJql}) AND duedate is not EMPTY AND duedate >= "${twoMonthsAgoStr}" AND duedate < "${mondayStr}" AND statusCategory != Done ORDER BY duedate ASC`;

  // 3. JQL de futuras: além da semana em visualização (depois de sexta-feira)
  const futureJql = `project in (${projectsJql}) AND duedate is not EMPTY AND duedate > "${fridayStr}" AND statusCategory != Done ORDER BY duedate ASC`;

  // Executar as 3 consultas ao Jira em paralelo
  const [weekIssues, overdueIssues, futureIssues] = await Promise.all([
    executeJqlSearch(url, config, weekJql, fields, 100),
    executeJqlSearch(url, config, overdueJql, fields, 100).catch((err) => {
      console.warn('[Jira] Falha ao buscar demandas atrasadas:', err?.message);
      if (err?.message?.includes('401') || err?.message?.includes('autenticação')) throw err;
      return [];
    }),
    executeJqlSearch(url, config, futureJql, fields, 100).catch((err) => {
      console.warn('[Jira] Falha ao buscar demandas futuras:', err?.message);
      if (err?.message?.includes('401') || err?.message?.includes('autenticação')) throw err;
      return [];
    }),
  ]);

  // Conjunto de status permitidos (se configurado)
  const allowedStatuses = new Set(
    (config.statuses || ALL_POSSIBLE_STATUSES).map((s) => s.toLowerCase().trim())
  );

  const weekDemands = parseJiraIssues(weekIssues, host, industryField, layoutField, flaggedField, allowedStatuses, false);
  const overdueDemands = parseJiraIssues(overdueIssues, host, industryField, layoutField, flaggedField, allowedStatuses, true);
  const futureDemands = parseJiraIssues(futureIssues, host, industryField, layoutField, flaggedField, allowedStatuses, true);

  // Agrupar demandas da semana por dia (Segunda a Sexta)
  const days: JiraDayGroup[] = workDaysDates.map((item, idx) => {
    const dayDemands = weekDemands.filter((d) => d.duedate === item.dateStr);
    return {
      date: item.dateStr,
      dayOfWeek: item.dayOfWeek,
      dayName: dayNames[idx],
      dayNumber: item.date.getDate(),
      monthName: monthNames[item.date.getMonth()],
      isToday: item.dateStr === todayStr,
      demands: dayDemands,
    };
  });

  return {
    startDate: mondayStr,
    endDate: fridayStr,
    days,
    totalDemands: weekDemands.length,
    lastUpdated: new Date().toISOString(),
    overdue: {
      demands: overdueDemands,
      total: overdueDemands.length,
    },
    future: {
      demands: futureDemands,
      total: futureDemands.length,
    },
  };
}
