import { Router, Request, Response } from 'express';
import { pool } from './db';
import { getJiraConfig, getAuthHeader, parseSingleJiraIssue, extractFieldValue } from './jira';
import {
  ProjectSettings,
  ProjectHoliday,
  ProjectRecord,
  DEFAULT_PROJECT_SETTINGS,
  DEFAULT_BRAZILIAN_HOLIDAYS,
  PlanItemInput,
  ScheduledPlanItem,
  calculatePlanSchedule,
} from './projectScheduling';

export const projectRoutes = Router();

/**
 * Obtém os feriados globais (compartilhados entre todos os projetos)
 */
async function getGlobalHolidays(): Promise<ProjectHoliday[]> {
  const res = await pool.query(`SELECT value FROM app_settings WHERE key = 'project_global_holidays'`);
  if (res.rows.length > 0 && Array.isArray(res.rows[0].value)) {
    return res.rows[0].value;
  }
  // Fallback: verificar em project_management_settings legado
  const legacyRes = await pool.query(`SELECT value FROM app_settings WHERE key = 'project_management_settings'`);
  if (legacyRes.rows.length > 0 && Array.isArray(legacyRes.rows[0].value?.holidays)) {
    const h = legacyRes.rows[0].value.holidays;
    await pool.query(
      `INSERT INTO app_settings (key, value) VALUES ('project_global_holidays', $1)
       ON CONFLICT (key) DO UPDATE SET value = $1`,
      [JSON.stringify(h)]
    );
    return h;
  }
  return DEFAULT_BRAZILIAN_HOLIDAYS;
}

/**
 * Salva os feriados globais (compartilhados entre todos os projetos)
 */
async function saveGlobalHolidays(holidays: any[]): Promise<ProjectHoliday[]> {
  const sanitized = holidays
    .filter((h: any) => h && h.date && h.name)
    .map((h: any) => ({ date: String(h.date).trim(), name: String(h.name).trim() }));

  await pool.query(
    `INSERT INTO app_settings (key, value) VALUES ('project_global_holidays', $1)
     ON CONFLICT (key) DO UPDATE SET value = $1`,
    [JSON.stringify(sanitized)]
  );
  return sanitized;
}

/**
 * Obtém as configurações de um projeto específico mescladas com os feriados globais
 */
async function getProjectSettings(projectKey: string): Promise<ProjectSettings> {
  const normKey = projectKey.trim().toUpperCase();
  const globalHolidays = await getGlobalHolidays();

  const projRes = await pool.query(
    `SELECT settings FROM projects WHERE UPPER(key) = $1`,
    [normKey]
  );

  let val: any = {};
  if (projRes.rows.length > 0 && projRes.rows[0].settings) {
    val = projRes.rows[0].settings;
  } else if (normKey === 'NEO') {
    const legacyRes = await pool.query(`SELECT value FROM app_settings WHERE key = 'project_management_settings'`);
    if (legacyRes.rows.length > 0) {
      val = legacyRes.rows[0].value;
    }
  }

  return {
    delivered_users: Array.isArray(val.delivered_users) ? val.delivered_users : DEFAULT_PROJECT_SETTINGS.delivered_users,
    work_hours_per_day: Number(val.work_hours_per_day) || DEFAULT_PROJECT_SETTINGS.work_hours_per_day,
    plan_start_date: val.plan_start_date || DEFAULT_PROJECT_SETTINGS.plan_start_date,
    holidays: globalHolidays,
    client_hours_markup_percent: Number(val.client_hours_markup_percent) >= 0 ? Number(val.client_hours_markup_percent) : 0,
    client_delivery_buffer_days: val.client_delivery_buffer_days !== undefined
      ? Math.max(0, Math.min(60, Number(val.client_delivery_buffer_days) || 0))
      : (DEFAULT_PROJECT_SETTINGS.client_delivery_buffer_days ?? 1),
    issue_types: Array.isArray(val.issue_types) ? val.issue_types : ['Ativação', 'Tarefa'],
  };
}

// ==========================================
// 1. ROTAS DE GESTÃO DE PROJETOS (CRUD)
// ==========================================

/**
 * GET /api/projects - Lista todos os projetos cadastrados
 */
projectRoutes.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      `SELECT id, key, name, description, settings, created_at, updated_at
       FROM projects
       ORDER BY (CASE WHEN UPPER(key) = 'NEO' THEN 0 ELSE 1 END), name ASC`
    );

    if (result.rows.length === 0) {
      // Cria o projeto padrão NEO se a tabela estiver vazia
      const neoSettings = {
        delivered_users: ['Neogrid'],
        work_hours_per_day: 8,
        plan_start_date: new Date().toISOString().split('T')[0],
        client_hours_markup_percent: 0,
        client_delivery_buffer_days: 1,
        issue_types: ['Ativação', 'Tarefa'],
      };
      const insert = await pool.query(
        `INSERT INTO projects (id, key, name, description, settings)
         VALUES ('proj_neo', 'NEO', 'Neogrid', 'Projeto de Ativações e Tarefas Neogrid', $1)
         RETURNING id, key, name, description, settings, created_at, updated_at`,
        [JSON.stringify(neoSettings)]
      );
      res.json(insert.rows);
      return;
    }

    res.json(result.rows);
  } catch (err: any) {
    console.error('[Projects API] Erro ao listar projetos:', err);
    res.status(500).json({ error: 'Erro ao listar projetos.' });
  }
});

/**
 * POST /api/projects - Cadastra um novo projeto
 */
projectRoutes.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { key, name, description, settings } = req.body;

    if (!key || !String(key).trim()) {
      res.status(400).json({ error: 'A chave do projeto (sigla) é obrigatória.' });
      return;
    }
    if (!name || !String(name).trim()) {
      res.status(400).json({ error: 'O nome do projeto é obrigatório.' });
      return;
    }

    const normKey = String(key).trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    if (normKey.length < 2 || normKey.length > 20) {
      res.status(400).json({ error: 'A chave do projeto deve ter entre 2 e 20 caracteres alfanuméricos.' });
      return;
    }

    // Verificar unicidade da chave
    const check = await pool.query(`SELECT id FROM projects WHERE UPPER(key) = $1`, [normKey]);
    if (check.rows.length > 0) {
      res.status(400).json({ error: `Já existe um projeto cadastrado com a chave "${normKey}".` });
      return;
    }

    const id = `proj_${normKey.toLowerCase()}_${Date.now()}`;
    const initialSettings: Partial<ProjectSettings> = {
      delivered_users: [name.trim()],
      work_hours_per_day: 8,
      plan_start_date: new Date().toISOString().split('T')[0],
      client_hours_markup_percent: 0,
      client_delivery_buffer_days: 1,
      issue_types: ['Ativação', 'Tarefa'],
      ...(settings || {}),
    };

    const insertRes = await pool.query(
      `INSERT INTO projects (id, key, name, description, settings)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, key, name, description, settings, created_at, updated_at`,
      [id, normKey, String(name).trim(), description ? String(description).trim() : null, JSON.stringify(initialSettings)]
    );

    res.status(201).json({
      success: true,
      message: 'Projeto cadastrado com sucesso!',
      project: insertRes.rows[0],
    });
  } catch (err: any) {
    console.error('[Projects API] Erro ao cadastrar projeto:', err);
    res.status(500).json({ error: err.message || 'Erro ao cadastrar projeto.' });
  }
});

/**
 * POST /api/projects/settings/reset-holidays - Restaura feriados padrões globais
 */
projectRoutes.post('/settings/reset-holidays', async (req: Request, res: Response): Promise<void> => {
  try {
    const updated = await saveGlobalHolidays(DEFAULT_BRAZILIAN_HOLIDAYS);
    res.json({ success: true, holidays: updated });
  } catch (err: any) {
    console.error('[Projects API] Erro ao restaurar feriados:', err);
    res.status(500).json({ error: 'Erro ao restaurar feriados padrões.' });
  }
});

/**
 * GET /api/projects/settings - Compatibilidade legada
 */
projectRoutes.get('/settings', async (req: Request, res: Response): Promise<void> => {
  try {
    const settings = await getProjectSettings('NEO');
    res.json(settings);
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao carregar configurações.' });
  }
});

/**
 * PUT /api/projects/settings - Compatibilidade legada
 */
projectRoutes.put('/settings', async (req: Request, res: Response): Promise<void> => {
  try {
    const current = await getProjectSettings('NEO');
    const { delivered_users, work_hours_per_day, plan_start_date, holidays, client_hours_markup_percent, client_delivery_buffer_days, issue_types } = req.body;

    let savedHolidays = current.holidays;
    if (Array.isArray(holidays)) {
      savedHolidays = await saveGlobalHolidays(holidays);
    }

    const merged = {
      delivered_users: Array.isArray(delivered_users) ? delivered_users : current.delivered_users,
      work_hours_per_day: Number(work_hours_per_day) || current.work_hours_per_day,
      plan_start_date: plan_start_date || current.plan_start_date,
      client_hours_markup_percent: Number(client_hours_markup_percent) >= 0 ? Number(client_hours_markup_percent) : 0,
      client_delivery_buffer_days: client_delivery_buffer_days !== undefined ? Number(client_delivery_buffer_days) : 1,
      issue_types: Array.isArray(issue_types) ? issue_types : current.issue_types,
    };

    await pool.query(
      `UPDATE projects SET settings = $1, updated_at = NOW() WHERE UPPER(key) = 'NEO'`,
      [JSON.stringify(merged)]
    );

    res.json({ ...merged, holidays: savedHolidays });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao salvar configurações.' });
  }
});

/**
 * GET /api/projects/:projectKey/settings - Configurações do projeto com feriados globais
 */
projectRoutes.get('/:projectKey/settings', async (req: Request, res: Response): Promise<void> => {
  try {
    const projectKey = String(req.params.projectKey);
    const settings = await getProjectSettings(projectKey);
    res.json(settings);
  } catch (err: any) {
    console.error('[Projects API] Erro ao buscar configurações:', err);
    res.status(500).json({ error: 'Erro ao carregar configurações do projeto.' });
  }
});

/**
 * PUT /api/projects/:projectKey/settings - Salva configurações do projeto e/ou feriados globais
 */
projectRoutes.put('/:projectKey/settings', async (req: Request, res: Response): Promise<void> => {
  try {
    const projectKey = String(req.params.projectKey);
    const normKey = projectKey.trim().toUpperCase();
    const current = await getProjectSettings(normKey);

    const {
      delivered_users,
      work_hours_per_day,
      plan_start_date,
      holidays,
      client_hours_markup_percent,
      client_delivery_buffer_days,
      issue_types,
    } = req.body;

    // 1. Atualiza Feriados Globais (se enviados no payload)
    let savedHolidays = current.holidays;
    if (Array.isArray(holidays)) {
      savedHolidays = await saveGlobalHolidays(holidays);
    }

    // 2. Configurações por Projeto
    const mergedProjectSettings = {
      delivered_users: Array.isArray(delivered_users)
        ? delivered_users.map((u: string) => u.trim()).filter(Boolean)
        : current.delivered_users,
      work_hours_per_day: Math.max(1, Math.min(24, Number(work_hours_per_day) || current.work_hours_per_day)),
      plan_start_date: plan_start_date ? String(plan_start_date).trim() : current.plan_start_date,
      client_hours_markup_percent: Math.max(0, Math.min(500, Number(client_hours_markup_percent) || 0)),
      client_delivery_buffer_days: client_delivery_buffer_days !== undefined
        ? Math.max(0, Math.min(60, Number(client_delivery_buffer_days) || 0))
        : (current.client_delivery_buffer_days !== undefined ? current.client_delivery_buffer_days : 1),
      issue_types: Array.isArray(issue_types)
        ? issue_types.map((t: string) => t.trim()).filter(Boolean)
        : (current.issue_types || ['Ativação', 'Tarefa']),
    };

    // Salva no registro do projeto
    await pool.query(
      `UPDATE projects SET settings = $1, updated_at = NOW() WHERE UPPER(key) = $2`,
      [JSON.stringify(mergedProjectSettings), normKey]
    );

    const fullSettings: ProjectSettings = {
      ...mergedProjectSettings,
      holidays: savedHolidays,
    };

    // Recalcular datas dos itens já existentes no plano deste projeto
    const planRes = await pool.query(
      `SELECT * FROM project_plan_items WHERE UPPER(project_key) = $1 ORDER BY sort_order ASC`,
      [normKey]
    );

    if (planRes.rows.length > 0) {
      const existingItems: PlanItemInput[] = planRes.rows.map((r) => ({
        id: r.id,
        issue_key: r.issue_key,
        summary: r.summary,
        status: r.status,
        assignee_name: r.assignee_name,
        estimate_hours: Number(r.estimate_hours),
        sort_order: r.sort_order,
        metadata: r.metadata,
      }));

      const recalculated = calculatePlanSchedule(existingItems, fullSettings);

      for (const item of recalculated) {
        const oldRow = planRes.rows.find((r) => r.id === item.id || r.issue_key === item.issue_key);
        const meta = { ...(item.metadata || {}) };
        if (oldRow && (oldRow.start_date !== item.start_date || oldRow.end_date !== item.end_date)) {
          meta.previous_start_date = oldRow.start_date;
          meta.previous_end_date = oldRow.end_date;
        }
        await pool.query(
          `UPDATE project_plan_items
           SET start_date = $1, end_date = $2, metadata = $3, updated_at = NOW()
           WHERE id = $4 AND UPPER(project_key) = $5`,
          [item.start_date, item.end_date, JSON.stringify(meta), item.id, normKey]
        );
      }
    }

    res.json(fullSettings);
  } catch (err: any) {
    console.error('[Projects API] Erro ao salvar configurações:', err);
    res.status(500).json({ error: 'Erro ao salvar configurações do projeto.' });
  }
});

/**
 * PUT /api/projects/:projectKey - Atualiza nome e descrição de um projeto
 */
projectRoutes.put('/:projectKey', async (req: Request, res: Response): Promise<void> => {
  try {
    const projectKey = String(req.params.projectKey);
    const { name, description } = req.body;

    if (!name || !String(name).trim()) {
      res.status(400).json({ error: 'O nome do projeto é obrigatório.' });
      return;
    }

    const normKey = projectKey.trim().toUpperCase();
    const updateRes = await pool.query(
      `UPDATE projects
       SET name = $1, description = $2, updated_at = NOW()
       WHERE UPPER(key) = $3
       RETURNING id, key, name, description, settings, created_at, updated_at`,
      [String(name).trim(), description !== undefined ? String(description).trim() : null, normKey]
    );

    if (updateRes.rows.length === 0) {
      res.status(404).json({ error: 'Projeto não encontrado.' });
      return;
    }

    res.json({
      success: true,
      message: 'Projeto atualizado com sucesso!',
      project: updateRes.rows[0],
    });
  } catch (err: any) {
    console.error('[Projects API] Erro ao atualizar projeto:', err);
    res.status(500).json({ error: 'Erro ao atualizar dados do projeto.' });
  }
});

/**
 * DELETE /api/projects/:projectKey - Exclui um projeto e suas demandas associadas
 */
projectRoutes.delete('/:projectKey', async (req: Request, res: Response): Promise<void> => {
  const client = await pool.connect();
  try {
    const projectKey = String(req.params.projectKey);
    const normKey = projectKey.trim().toUpperCase();

    // Validar se há mais de 1 projeto cadastrado
    const countRes = await client.query(`SELECT COUNT(*) FROM projects`);
    const totalProjects = parseInt(countRes.rows[0].count, 10);
    if (totalProjects <= 1) {
      res.status(400).json({ error: 'Não é possível excluir o único projeto do sistema.' });
      return;
    }

    await client.query('BEGIN');
    await client.query(`DELETE FROM project_plan_items WHERE UPPER(project_key) = $1`, [normKey]);
    const delRes = await client.query(`DELETE FROM projects WHERE UPPER(key) = $1 RETURNING id`, [normKey]);
    await client.query('COMMIT');

    if (delRes.rows.length === 0) {
      res.status(404).json({ error: 'Projeto não encontrado.' });
      return;
    }

    res.json({ success: true, message: `Projeto ${normKey} e plano excluídos com sucesso.` });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('[Projects API] Erro ao excluir projeto:', err);
    res.status(500).json({ error: 'Erro ao excluir projeto.' });
  } finally {
    client.release();
  }
});

/**
 * GET /api/projects/:projectKey/backlog - Retorna as demandas do Jira do projeto específico
 */
projectRoutes.get('/:projectKey/backlog', async (req: Request, res: Response): Promise<void> => {
  try {
    const projectKey = String(req.params.projectKey);
    const normKey = projectKey.trim().toUpperCase();

    const config = await getJiraConfig();
    const settings = await getProjectSettings(normKey);

    if (!config.api_token || !config.domain || !config.email) {
      res.status(400).json({
        error: 'A integração com o Jira não está configurada.',
      });
      return;
    }

    const host = config.domain.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    const deliveredUsersSet = new Set(
      settings.delivered_users.map((u) => u.trim().toLowerCase())
    );

    // Buscar chaves que já estão no plano deste projeto
    const planKeysRes = await pool.query(
      `SELECT issue_key FROM project_plan_items WHERE UPPER(project_key) = $1`,
      [normKey]
    );
    const plannedKeys = new Set(planKeysRes.rows.map((r) => r.issue_key));

    const industryField = config.custom_fields?.industry || 'customfield_10780';
    const layoutField = config.custom_fields?.layout || 'customfield_10714';
    const flaggedField = (config as any).custom_fields?.flagged || 'customfield_10021';
    const canalField = 'customfield_10273';

    // Tipos de demanda configurados para este projeto
    const configuredTypes = Array.isArray(settings.issue_types) ? settings.issue_types : ['Ativação', 'Tarefa'];
    let jql = '';
    if (configuredTypes.length > 0) {
      const typesClause = configuredTypes.map((t: string) => `"${t}"`).join(', ');
      jql = `project = "${normKey}" AND issuetype in (${typesClause}) AND issuetype not in ("Epic", "Épico") ORDER BY status ASC, created DESC`;
    } else {
      jql = `project = "${normKey}" AND issuetype not in ("Epic", "Épico", "Sub-task", "Subtarefa") ORDER BY status ASC, created DESC`;
    }

    const queryFields = [
      'key',
      'summary',
      'status',
      'issuetype',
      'priority',
      'assignee',
      'created',
      'duedate',
      'parent',
      'project',
      flaggedField,
      industryField,
      layoutField,
      canalField,
    ];

    const allIssues: any[] = [];
    let nextPageToken: string | undefined = undefined;
    let pageCount = 0;
    const maxPages = 15;

    while (pageCount < maxPages) {
      pageCount++;
      const payload: any = {
        jql,
        fields: queryFields,
        maxResults: 100,
      };
      if (nextPageToken) {
        payload.nextPageToken = nextPageToken;
      }

      let searchRes = await fetch(`https://${host}/rest/api/3/search/jql`, {
        method: 'POST',
        headers: {
          Authorization: getAuthHeader(config),
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      });

      // Se falhar por tipo de issue inexistente no projeto do Jira, tenta fallback mais amplo excluindo épicos e subtarefas
      if (!searchRes.ok && pageCount === 1) {
        const errText = await searchRes.text();
        console.warn(`[Projects API] Busca estrita falhou (${searchRes.status}): ${errText}. Tentando fallback sem filtro estrito de issuetype...`);
        jql = `project = "${normKey}" AND issuetype not in ("Epic", "Épico", "Sub-task", "Subtarefa") ORDER BY status ASC, created DESC`;
        payload.jql = jql;
        searchRes = await fetch(`https://${host}/rest/api/3/search/jql`, {
          method: 'POST',
          headers: {
            Authorization: getAuthHeader(config),
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(payload),
        });
      }

      if (!searchRes.ok) {
        const errText = await searchRes.text();
        console.error('[Projects API] Erro ao buscar issues no Jira:', searchRes.status, errText);
        throw new Error(`Erro na API do Jira (${searchRes.status}): ${errText.substring(0, 100)}`);
      }

      const data: any = await searchRes.json();
      const issues = data.issues || [];
      allIssues.push(...issues);

      if (data.nextPageToken && issues.length > 0) {
        nextPageToken = data.nextPageToken;
      } else {
        break;
      }
    }

    // Filtrar: desconsiderar usuários entregues e itens já no plano deste projeto
    const backlogItems: any[] = [];
    const assigneesSet = new Set<string>();

    for (const issue of allIssues) {
      const f = issue.fields || {};
      const typeName = (f.issuetype?.name || '').toLowerCase().trim();

      // Desconsiderar épicos
      if (typeName === 'épico' || typeName === 'epico' || typeName === 'epic') {
        continue;
      }

      const assigneeName = f.assignee?.displayName || f.assignee?.name || 'Não atribuído';
      const normAssignee = assigneeName.trim().toLowerCase();

      // Regra de Negócio: se o usuário estiver na lista de entregues, considera-se entregue!
      if (deliveredUsersSet.has(normAssignee)) {
        continue;
      }

      // Se já está no plano deste projeto, não entra no backlog
      if (plannedKeys.has(issue.key)) {
        continue;
      }

      if (assigneeName !== 'Não atribuído') {
        assigneesSet.add(assigneeName);
      }

      const demand = parseSingleJiraIssue(issue, host, industryField, layoutField, flaggedField, canalField);

      backlogItems.push({
        ...demand,
        status: demand.displayStatus || demand.rawStatus,
        issuetype: f.issuetype?.name || 'Demanda',
        priority: f.priority?.name || 'Média',
        created: f.created,
      });
    }

    // Agrupar por status para o modo sanfona
    const groupsMap = new Map<string, any[]>();
    for (const item of backlogItems) {
      const group = groupsMap.get(item.status) || [];
      group.push(item);
      groupsMap.set(item.status, group);
    }

    const groupedBacklog = Array.from(groupsMap.entries()).map(([status, issues]) => ({
      status,
      count: issues.length,
      issues,
    }));

    res.json({
      project: normKey,
      totalBacklog: backlogItems.length,
      totalPlanned: plannedKeys.size,
      availableAssignees: Array.from(assigneesSet).sort(),
      groups: groupedBacklog,
      lastUpdated: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[Projects API] Erro ao carregar backlog do Jira:', err);
    res.status(500).json({ error: err.message || 'Erro ao carregar backlog do projeto.' });
  }
});

/**
 * GET /api/projects/:projectKey/plan - Retorna os itens do plano salvos e agendados para o projeto
 */
projectRoutes.get('/:projectKey/plan', async (req: Request, res: Response): Promise<void> => {
  try {
    const projectKey = String(req.params.projectKey);
    const normKey = projectKey.trim().toUpperCase();

    const settings = await getProjectSettings(normKey);
    const config = await getJiraConfig();
    const host = config.domain.replace(/^https?:\/\//, '').replace(/\/+$/, '');

    const resPlan = await pool.query(
      `SELECT * FROM project_plan_items WHERE UPPER(project_key) = $1 ORDER BY sort_order ASC`,
      [normKey]
    );

    // Se algum item não tiver canal no metadata, buscar do Jira e atualizar (ignora tarefas manuais/externas)
    const missingCanalKeys = resPlan.rows
      .filter((r) => !r.metadata?.canal && !r.metadata?.isManual && !r.metadata?.isExternal)
      .map((r) => r.issue_key);

    const canalMap = new Map<string, { canal: string | null; industry: string | null }>();

    if (missingCanalKeys.length > 0 && config.api_token && config.domain && config.email) {
      try {
        const jql = `key in (${missingCanalKeys.map((k) => `"${k}"`).join(',')})`;
        const searchRes = await fetch(`https://${host}/rest/api/3/search/jql`, {
          method: 'POST',
          headers: {
            Authorization: getAuthHeader(config),
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            jql,
            fields: ['key', 'customfield_10780', 'customfield_10273'],
            maxResults: 100,
          }),
        });
        if (searchRes.ok) {
          const data: any = await searchRes.json();
          for (const iss of data.issues || []) {
            const ind = extractFieldValue(iss.fields?.customfield_10780);
            const can = extractFieldValue(iss.fields?.customfield_10273);
            canalMap.set(iss.key, { canal: can, industry: ind });
          }
        }
      } catch (err) {
        console.warn('[Projects API] Falha ao enriquecer canal/indústria:', err);
      }
    }

    const rawItems: PlanItemInput[] = resPlan.rows.map((r) => {
      const enriched = canalMap.get(r.issue_key);
      const meta = { ...(r.metadata || {}) };
      if (enriched) {
        if (!meta.canal && enriched.canal) meta.canal = enriched.canal;
        if (!meta.industry && enriched.industry) meta.industry = enriched.industry;
      }
      return {
        id: r.id,
        issue_key: r.issue_key,
        summary: r.summary,
        status: r.status,
        assignee_name: r.assignee_name,
        estimate_hours: Number(r.estimate_hours),
        sort_order: r.sort_order,
        metadata: {
          ...meta,
          url: meta.isManual || meta.isExternal ? null : (meta.url || `https://${host}/browse/${r.issue_key}`),
        },
      };
    });

    if (canalMap.size > 0) {
      for (const item of rawItems) {
        if (canalMap.has(item.issue_key)) {
          pool.query(
            `UPDATE project_plan_items SET metadata = $1 WHERE id = $2 AND UPPER(project_key) = $3`,
            [JSON.stringify(item.metadata), item.id, normKey]
          ).catch(() => {});
        }
      }
    }

    // Recalcular para garantir consistência perfeita com as configurações atuais do projeto
    const scheduled = calculatePlanSchedule(rawItems, settings);

    res.json({
      project: normKey,
      items: scheduled,
      settings,
      totalItems: scheduled.length,
      totalHours: scheduled.reduce((sum, item) => sum + item.estimate_hours, 0),
    });
  } catch (err: any) {
    console.error('[Projects API] Erro ao buscar plano:', err);
    res.status(500).json({ error: 'Erro ao carregar plano de projeto.' });
  }
});

/**
 * PUT /api/projects/:projectKey/plan - Persiste o plano completo do projeto
 */
projectRoutes.put('/:projectKey/plan', async (req: Request, res: Response): Promise<void> => {
  const client = await pool.connect();
  try {
    const projectKey = String(req.params.projectKey);
    const normKey = projectKey.trim().toUpperCase();

    const { items } = req.body;
    if (!Array.isArray(items)) {
      res.status(400).json({ error: 'A lista de itens do plano é inválida.' });
      return;
    }

    const settings = await getProjectSettings(normKey);

    // Normaliza os itens de entrada com sort_order
    const normalizedInputs: PlanItemInput[] = items.map((item: any, idx: number) => ({
      id: item.id || `item_${item.issue_key}_${Date.now()}_${idx}`,
      issue_key: String(item.issue_key).trim().toUpperCase(),
      summary: String(item.summary || 'Sem resumo').trim(),
      status: item.status || 'Planejado',
      assignee_name: String(item.assignee_name || 'Não atribuído').trim(),
      estimate_hours: Math.max(0.5, Number(item.estimate_hours) || 1),
      sort_order: idx + 1,
      metadata: item.metadata || {},
    }));

    // Calcula as datas com o motor
    const scheduled = calculatePlanSchedule(normalizedInputs, settings);

    await client.query('BEGIN');

    // Remove os itens antigos deste projeto específico
    await client.query(`DELETE FROM project_plan_items WHERE UPPER(project_key) = $1`, [normKey]);

    // Insere os novos itens vinculados a este projeto
    for (const item of scheduled) {
      await client.query(
        `INSERT INTO project_plan_items (
          id, project_key, issue_key, summary, status, assignee_name,
          estimate_hours, sort_order, start_date, end_date, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          item.id,
          normKey,
          item.issue_key,
          item.summary,
          item.status,
          item.assignee_name,
          item.estimate_hours,
          item.sort_order,
          item.start_date,
          item.end_date,
          JSON.stringify(item.metadata || {}),
        ]
      );
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Plano de projeto salvo com sucesso!',
      project: normKey,
      items: scheduled,
      totalHours: scheduled.reduce((sum, item) => sum + item.estimate_hours, 0),
    });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('[Projects API] Erro ao salvar plano:', err);
    res.status(500).json({ error: err.message || 'Erro ao salvar plano de projeto.' });
  } finally {
    client.release();
  }
});
