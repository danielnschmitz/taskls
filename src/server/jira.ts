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
  };
}

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
  },
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

export interface JiraWeekResponse {
  startDate: string;
  endDate: string;
  days: JiraDayGroup[];
  totalDemands: number;
  lastUpdated: string;
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
 * Monta o cabeçalho Basic Auth para a API Atlassian
 */
function getAuthHeader(config: JiraConfig): string {
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

/**
 * Busca e formata as demandas da semana na API do Jira
 */
export async function getJiraDemandsForWeek(
  weekStartStr: string // 'YYYY-MM-DD' (Segunda-feira)
): Promise<JiraWeekResponse> {
  const config = await getJiraConfig();

  // Calcular dias úteis da semana (Segunda a Sexta)
  const baseDate = new Date(`${weekStartStr}T12:00:00Z`);
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
    };
  }

  const host = config.domain.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const url = `https://${host}/rest/api/3/search/jql`;

  // Construção do JQL:
  // Filtra por projetos configurados e duedate entre a Segunda e Sexta da semana
  const projectsJql = config.projects.map((p) => `"${p}"`).join(', ');
  const jql = `project in (${projectsJql}) AND duedate is not EMPTY AND duedate >= "${mondayStr}" AND duedate <= "${fridayStr}" ORDER BY duedate ASC`;

  const industryField = config.custom_fields.industry || 'customfield_10780';
  const layoutField = config.custom_fields.layout || 'customfield_10714';

  const bodyPayload = {
    jql,
    fields: [
      'summary',
      'duedate',
      'project',
      'parent',
      'status',
      'priority',
      'assignee',
      industryField,
      layoutField,
    ],
    maxResults: 100,
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: getAuthHeader(config),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(bodyPayload),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('[Jira] Erro ao buscar demandas via JQL:', response.status, errText);
    throw new Error(`Erro na API do Jira (${response.status}): ${errText.substring(0, 200)}`);
  }

  const searchData = await response.json();
  const issues: any[] = searchData.issues || [];

  // Conjunto de status permitidos (se configurado)
  const allowedStatuses = new Set(
    (config.statuses || ALL_POSSIBLE_STATUSES).map((s) => s.toLowerCase().trim())
  );

  const demands: JiraDemand[] = [];

  for (const issue of issues) {
    const rawStatus = issue.fields?.status?.name || 'Desconhecido';
    
    // Se o status da demanda não estiver habilitado na configuração, ignora
    if (allowedStatuses.size > 0 && !allowedStatuses.has(rawStatus.toLowerCase().trim())) {
      continue;
    }

    const projKey = issue.fields?.project?.key || '';
    const projName = issue.fields?.project?.name || projKey;
    const displayStatus = formatDisplayStatus(projKey, rawStatus);

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
      url: `https://${host}/browse/${issue.key}`,
    });
  }

  // Agrupar por dia (Segunda a Sexta)
  const days: JiraDayGroup[] = workDaysDates.map((item, idx) => {
    const dayDemands = demands.filter((d) => d.duedate === item.dateStr);
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
    totalDemands: demands.length,
    lastUpdated: new Date().toISOString(),
  };
}
