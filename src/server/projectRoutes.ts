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
 * Obtém os executores globais de tarefas (compartilhados entre todos os projetos)
 */
async function getGlobalAssignees(): Promise<string[]> {
  const res = await pool.query(`SELECT value FROM app_settings WHERE key = 'project_global_assignees'`);
  if (res.rows.length > 0 && Array.isArray(res.rows[0].value) && res.rows[0].value.length > 0) {
    return res.rows[0].value;
  }
  // Se ainda não existir configuração global salva ou estiver vazia, busca executores distintos já presentes nos planos
  const planItemsRes = await pool.query(
    `SELECT DISTINCT assignee_name 
     FROM project_plan_items 
     WHERE assignee_name IS NOT NULL AND TRIM(assignee_name) != '' 
     ORDER BY assignee_name ASC`
  );
  const foundAssignees = planItemsRes.rows
    .map((r) => String(r.assignee_name).trim())
    .filter(Boolean);

  if (foundAssignees.length > 0) {
    const uniqueFound = Array.from(new Set(foundAssignees)).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    await pool.query(
      `INSERT INTO app_settings (key, value) VALUES ('project_global_assignees', $1)
       ON CONFLICT (key) DO UPDATE SET value = $1`,
      [JSON.stringify(uniqueFound)]
    );
    return uniqueFound;
  }

  return [];
}

/**
 * Salva os executores globais de tarefas (compartilhados entre todos os projetos)
 */
async function saveGlobalAssignees(assignees: any[]): Promise<string[]> {
  const sanitized = Array.from(
    new Set(
      assignees
        .filter((a) => typeof a === 'string' && a.trim().length > 0)
        .map((a) => a.trim())
    )
  ).sort((a, b) => a.localeCompare(b, 'pt-BR'));

  await pool.query(
    `INSERT INTO app_settings (key, value) VALUES ('project_global_assignees', $1)
     ON CONFLICT (key) DO UPDATE SET value = $1`,
    [JSON.stringify(sanitized)]
  );
  return sanitized;
}

/**
 * Obtém as configurações de um projeto específico mescladas com os feriados e executores globais
 */
async function getProjectSettings(projectKey: string): Promise<ProjectSettings> {
  const normKey = projectKey.trim().toUpperCase();
  const globalHolidays = await getGlobalHolidays();
  const globalAssignees = await getGlobalAssignees();

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
    global_assignees: globalAssignees,
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
/**
 * GET /api/projects/jira-projects - Lista as siglas/chaves de projetos Jira disponíveis para associar aos planos
 */
projectRoutes.get('/jira-projects', async (req: Request, res: Response): Promise<void> => {
  try {
    const config = await getJiraConfig();
    const set = new Set<string>();
    if (Array.isArray(config.projects)) {
      config.projects.forEach((p) => p && set.add(p.trim().toUpperCase()));
    }
    const dbRes = await pool.query('SELECT DISTINCT jira_project_key, key FROM projects');
    for (const r of dbRes.rows) {
      if (r.jira_project_key) set.add(r.jira_project_key.trim().toUpperCase());
      else if (r.key) set.add(r.key.trim().toUpperCase());
    }
    res.json(Array.from(set).sort());
  } catch (err: any) {
    console.error('[Projects API] Erro ao listar projetos do Jira:', err);
    res.status(500).json({ error: 'Erro ao listar projetos do Jira.' });
  }
});

/**
 * GET /api/projects - Lista todos os projetos/planos cadastrados
 */
projectRoutes.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      `SELECT id, key, name, description, jira_project_key, settings, created_at, updated_at
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
        `INSERT INTO projects (id, key, name, description, jira_project_key, settings)
         VALUES ('proj_neo', 'NEO', 'Neogrid', 'Projeto de Ativações e Tarefas Neogrid', 'NEO', $1)
         RETURNING id, key, name, description, jira_project_key, settings, created_at, updated_at`,
        [JSON.stringify(neoSettings)]
      );
      res.json(insert.rows.map((r) => ({ ...r, jira_project_key: r.jira_project_key || r.key })));
      return;
    }

    res.json(result.rows.map((r) => ({ ...r, jira_project_key: r.jira_project_key || r.key })));
  } catch (err: any) {
    console.error('[Projects API] Erro ao listar projetos:', err);
    res.status(500).json({ error: 'Erro ao listar projetos.' });
  }
});

/**
 * POST /api/projects - Cadastra um novo plano de projeto (permite múltiplos planos para o mesmo projeto Jira)
 */
projectRoutes.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { key, name, description, settings, jira_project_key } = req.body;

    if (!name || !String(name).trim()) {
      res.status(400).json({ error: 'O nome do plano/projeto é obrigatório.' });
      return;
    }

    const cleanName = String(name).trim();
    const rawJiraKey = String(jira_project_key || key || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    if (!rawJiraKey) {
      res.status(400).json({ error: 'A sigla/chave do projeto no Jira é obrigatória.' });
      return;
    }

    // Determinar a chave única do plano
    let planKey = key ? String(key).trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '') : '';
    if (!planKey) {
      // Se não informou a chave do plano, gerar automaticamente com base no Jira e nome
      const existingRes = await pool.query(`SELECT UPPER(key) as key FROM projects`);
      const existingKeys = new Set(existingRes.rows.map((r) => r.key));

      if (!existingKeys.has(rawJiraKey)) {
        planKey = rawJiraKey;
      } else {
        let counter = 2;
        while (existingKeys.has(`${rawJiraKey}-${counter}`)) {
          counter++;
        }
        planKey = `${rawJiraKey}-${counter}`;
      }
    } else {
      // Se informou a chave do plano, verificar se já existe
      const check = await pool.query(`SELECT id FROM projects WHERE UPPER(key) = $1`, [planKey]);
      if (check.rows.length > 0) {
        res.status(400).json({
          error: `Já existe um plano cadastrado com a chave "${planKey}". Escolha outro identificador ou deixe em branco para gerar automaticamente.`,
        });
        return;
      }
    }

    const id = `proj_${planKey.toLowerCase()}_${Date.now()}`;
    const initialSettings: Partial<ProjectSettings> = {
      delivered_users: [cleanName],
      work_hours_per_day: 8,
      plan_start_date: new Date().toISOString().split('T')[0],
      client_hours_markup_percent: 0,
      client_delivery_buffer_days: 1,
      issue_types: ['Ativação', 'Tarefa'],
      ...(settings || {}),
    };

    const insertRes = await pool.query(
      `INSERT INTO projects (id, key, name, description, jira_project_key, settings)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, key, name, description, jira_project_key, settings, created_at, updated_at`,
      [
        id,
        planKey,
        cleanName,
        description ? String(description).trim() : null,
        rawJiraKey,
        JSON.stringify(initialSettings),
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Plano cadastrado com sucesso!',
      project: {
        ...insertRes.rows[0],
        jira_project_key: insertRes.rows[0].jira_project_key || rawJiraKey,
      },
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
 * GET /api/projects/settings/global-assignees - Lista todos os executores globais cadastrados
 */
projectRoutes.get('/settings/global-assignees', async (req: Request, res: Response): Promise<void> => {
  try {
    const assignees = await getGlobalAssignees();
    res.json(assignees);
  } catch (err: any) {
    console.error('[Projects API] Erro ao listar executores globais:', err);
    res.status(500).json({ error: 'Erro ao listar executores globais.' });
  }
});

/**
 * PUT /api/projects/settings/global-assignees - Atualiza a lista de executores globais
 */
projectRoutes.put('/settings/global-assignees', async (req: Request, res: Response): Promise<void> => {
  try {
    const { assignees } = req.body;
    if (!Array.isArray(assignees)) {
      res.status(400).json({ error: 'Lista de executores inválida.' });
      return;
    }
    const saved = await saveGlobalAssignees(assignees);
    res.json({ success: true, assignees: saved });
  } catch (err: any) {
    console.error('[Projects API] Erro ao salvar executores globais:', err);
    res.status(500).json({ error: 'Erro ao salvar executores globais.' });
  }
});

/**
 * PUT /api/projects/settings - Compatibilidade legada
 */
projectRoutes.put('/settings', async (req: Request, res: Response): Promise<void> => {
  try {
    const current = await getProjectSettings('NEO');
    const {
      delivered_users,
      work_hours_per_day,
      plan_start_date,
      holidays,
      global_assignees,
      client_hours_markup_percent,
      client_delivery_buffer_days,
      issue_types,
    } = req.body;

    let savedHolidays = current.holidays;
    if (Array.isArray(holidays)) {
      savedHolidays = await saveGlobalHolidays(holidays);
    }

    let savedAssignees = current.global_assignees || [];
    if (Array.isArray(global_assignees)) {
      savedAssignees = await saveGlobalAssignees(global_assignees);
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

    res.json({ ...merged, holidays: savedHolidays, global_assignees: savedAssignees });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao salvar configurações.' });
  }
});

/**
 * GET /api/projects/:projectKey/settings - Configurações do projeto com feriados e executores globais
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
 * PUT /api/projects/:projectKey/settings - Salva configurações do projeto e/ou feriados e executores globais
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
      global_assignees,
      client_hours_markup_percent,
      client_delivery_buffer_days,
      issue_types,
    } = req.body;

    // 1. Atualiza Feriados Globais (se enviados no payload)
    let savedHolidays = current.holidays;
    if (Array.isArray(holidays)) {
      savedHolidays = await saveGlobalHolidays(holidays);
    }

    // 2. Atualiza Executores Globais (se enviados no payload)
    let savedAssignees = current.global_assignees || [];
    if (Array.isArray(global_assignees)) {
      savedAssignees = await saveGlobalAssignees(global_assignees);
    }

    // 3. Configurações por Projeto
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
      global_assignees: savedAssignees,
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
        fixed_start_date: r.metadata?.fixed_start_date || null,
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
 * PUT /api/projects/:projectKey - Atualiza nome, descrição e projeto Jira associado
 */
projectRoutes.put('/:projectKey', async (req: Request, res: Response): Promise<void> => {
  try {
    const projectKey = String(req.params.projectKey);
    const { name, description, jira_project_key } = req.body;

    if (!name || !String(name).trim()) {
      res.status(400).json({ error: 'O nome do projeto é obrigatório.' });
      return;
    }

    const normKey = projectKey.trim().toUpperCase();
    const cleanJiraKey = jira_project_key
      ? String(jira_project_key).trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '')
      : null;

    const updateRes = await pool.query(
      `UPDATE projects
       SET name = $1,
           description = $2,
           jira_project_key = COALESCE($3, jira_project_key, key),
           updated_at = NOW()
       WHERE UPPER(key) = $4
       RETURNING id, key, name, description, jira_project_key, settings, created_at, updated_at`,
      [
        String(name).trim(),
        description !== undefined ? String(description).trim() : null,
        cleanJiraKey,
        normKey,
      ]
    );

    if (updateRes.rows.length === 0) {
      res.status(404).json({ error: 'Projeto não encontrado.' });
      return;
    }

    res.json({
      success: true,
      message: 'Projeto atualizado com sucesso!',
      project: {
        ...updateRes.rows[0],
        jira_project_key: updateRes.rows[0].jira_project_key || updateRes.rows[0].key,
      },
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
    await client.query(`DELETE FROM project_change_logs WHERE UPPER(project_key) = $1`, [normKey]);
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

    // Identificar a chave do projeto no Jira correspondente a este plano
    const projRes = await pool.query(
      `SELECT jira_project_key, key FROM projects WHERE UPPER(key) = $1`,
      [normKey]
    );
    const jiraKey = (projRes.rows[0]?.jira_project_key || normKey).trim().toUpperCase();

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
      jql = `project = "${jiraKey}" AND issuetype in (${typesClause}) AND issuetype not in ("Epic", "Épico") ORDER BY status ASC, created DESC`;
    } else {
      jql = `project = "${jiraKey}" AND issuetype not in ("Epic", "Épico", "Sub-task", "Subtarefa") ORDER BY status ASC, created DESC`;
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
        jql = `project = "${jiraKey}" AND issuetype not in ("Epic", "Épico", "Sub-task", "Subtarefa") ORDER BY status ASC, created DESC`;
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
 * GET /api/projects/:projectKey/jira-issue/:issueKey - Busca os detalhes de uma issue específica no Jira
 */
projectRoutes.get('/:projectKey/jira-issue/:issueKey', async (req: Request, res: Response): Promise<void> => {
  try {
    const projectKey = String(req.params.projectKey).trim().toUpperCase();
    let issueKey = String(req.params.issueKey).trim().toUpperCase();

    // Se for apenas numérico, prefixa com a chave do projeto Jira
    if (/^\d+$/.test(issueKey)) {
      const projRes = await pool.query(
        `SELECT jira_project_key, key FROM projects WHERE UPPER(key) = $1`,
        [projectKey]
      );
      const jiraKey = (projRes.rows[0]?.jira_project_key || projectKey).trim().toUpperCase();
      issueKey = `${jiraKey}-${issueKey}`;
    }

    const config = await getJiraConfig();
    if (!config.api_token || !config.domain || !config.email) {
      res.status(400).json({ error: 'Configuração do Jira não encontrada ou incompleta.' });
      return;
    }

    const host = config.domain.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    const industryField = config.custom_fields?.industry || 'customfield_10780';
    const layoutField = config.custom_fields?.layout || 'customfield_10714';
    const flaggedField = (config as any).custom_fields?.flagged || 'customfield_10021';
    const canalField = 'customfield_10273';

    const jql = `key = "${issueKey}"`;
    const payload = {
      jql,
      fields: [
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
        'timeoriginalestimate',
        'aggregatetimeoriginalestimate',
        flaggedField,
        industryField,
        layoutField,
        canalField,
      ],
      maxResults: 1,
    };

    const searchRes = await fetch(`https://${host}/rest/api/3/search/jql`, {
      method: 'POST',
      headers: {
        Authorization: getAuthHeader(config),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!searchRes.ok) {
      const errText = await searchRes.text();
      res.status(searchRes.status).json({ error: `Erro na API do Jira: ${errText.substring(0, 100)}` });
      return;
    }

    const data: any = await searchRes.json();
    const issue = data.issues?.[0];

    if (!issue) {
      res.status(404).json({ error: `Demanda ${issueKey} não encontrada no Jira.` });
      return;
    }

    const demand = parseSingleJiraIssue(issue, host, industryField, layoutField, flaggedField, canalField);
    const f = issue.fields || {};

    let estimateHours = 8;
    const estSec = f.timeoriginalestimate || f.aggregatetimeoriginalestimate;
    if (typeof estSec === 'number' && estSec > 0) {
      estimateHours = Math.round((estSec / 3600) * 10) / 10;
    }

    res.json({
      key: demand.key,
      summary: demand.summary,
      status: demand.displayStatus || demand.rawStatus,
      rawStatus: demand.rawStatus,
      displayStatus: demand.displayStatus,
      assignee: demand.assignee?.displayName || (f.assignee?.displayName || f.assignee?.name || ''),
      industry: demand.industry || null,
      layout: demand.layout || null,
      canal: demand.canal || null,
      epic: demand.epic || null,
      duedate: demand.duedate || null,
      isBlocked: demand.isBlocked || false,
      blockedReason: demand.blockedReason || null,
      url: demand.url,
      estimate_hours: estimateHours,
      issuetype: f.issuetype?.name || 'Demanda',
      priority: f.priority?.name || 'Média',
      created: f.created,
    });
  } catch (err: any) {
    console.error('[Projects API] Erro ao buscar issue no Jira:', err);
    res.status(500).json({ error: err.message || 'Erro ao buscar tarefa no Jira.' });
  }
});

/**
 * POST /api/projects/:projectKey/jira-issue/:issueKey/sync-dates
 * Atualiza as datas de início e fim no Jira e adiciona comentário opcional
 */
projectRoutes.post('/:projectKey/jira-issue/:issueKey/sync-dates', async (req: Request, res: Response): Promise<void> => {
  try {
    const projectKey = String(req.params.projectKey);
    const issueKey = String(req.params.issueKey);
    const { startDate, endDate, comment } = req.body;

    if (!startDate || !endDate) {
      res.status(400).json({ error: 'As datas de início e fim são obrigatórias.' });
      return;
    }

    const config = await getJiraConfig();
    if (!config.api_token || !config.domain || !config.email) {
      res.status(400).json({ error: 'A integração com o Jira não está configurada.' });
      return;
    }

    const host = config.domain.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    const prefix = projectKey.trim().toUpperCase();

    // Identificar a chave do projeto Jira associado a este plano
    const projRes = await pool.query(
      `SELECT jira_project_key, key FROM projects WHERE UPPER(key) = $1`,
      [prefix]
    );
    const jiraKey = (projRes.rows[0]?.jira_project_key || prefix).trim().toUpperCase();

    let fullKey = issueKey.trim().toUpperCase();
    if (/^\d+$/.test(fullKey)) {
      fullKey = `${jiraKey}-${fullKey}`;
    }

    // 1. Atualizar campos de data no Jira (customfield_10015 = Data de início, duedate = Data limite)
    const startDateField = (config as any).custom_fields?.start_date || 'customfield_10015';

    const fieldsToUpdate: Record<string, string> = {
      [startDateField]: startDate,
      duedate: endDate,
    };

    let updateRes = await fetch(`https://${host}/rest/api/3/issue/${fullKey}`, {
      method: 'PUT',
      headers: {
        Authorization: getAuthHeader(config),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ fields: fieldsToUpdate }),
    });

    // Se falhar com erro no campo de data de início, tentar atualizar apenas o duedate
    if (!updateRes.ok) {
      const errText = await updateRes.text();
      console.warn(`[Jira Sync] Falha ao atualizar datas com ${startDateField}:`, errText);

      if (errText.includes(startDateField)) {
        updateRes = await fetch(`https://${host}/rest/api/3/issue/${fullKey}`, {
          method: 'PUT',
          headers: {
            Authorization: getAuthHeader(config),
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({ fields: { duedate: endDate } }),
        });
      }

      if (!updateRes.ok) {
        const finalErr = await updateRes.text();
        res.status(updateRes.status).json({
          error: `Erro ao atualizar datas no Jira (${updateRes.status}): ${finalErr.substring(0, 200)}`,
        });
        return;
      }
    }

    let commentAdded = false;
    // 2. Se houver comentário informado, publicar na issue no Jira (formato ADF)
    if (comment && String(comment).trim()) {
      const commentText = String(comment).trim();
      const paragraphs = commentText.split(/\r?\n/).map((line) => ({
        type: 'paragraph',
        content: line.trim() ? [{ type: 'text', text: line }] : [],
      }));

      const adfBody = {
        type: 'doc',
        version: 1,
        content: paragraphs.length > 0 ? paragraphs : [{ type: 'paragraph', content: [{ type: 'text', text: commentText }] }],
      };

      const commentRes = await fetch(`https://${host}/rest/api/3/issue/${fullKey}/comment`, {
        method: 'POST',
        headers: {
          Authorization: getAuthHeader(config),
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ body: adfBody }),
      });

      if (commentRes.ok) {
        commentAdded = true;
      } else {
        const commentErr = await commentRes.text();
        console.warn(`[Jira Sync] Falha ao adicionar comentário na issue ${fullKey}:`, commentErr);
      }
    }

    // 3. Atualiza também o duedate no metadata do item salvo no banco de dados local, se existir
    await pool.query(
      `UPDATE project_plan_items
       SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{duedate}', to_jsonb($1::text), true),
           updated_at = NOW()
       WHERE UPPER(project_key) = $2 AND UPPER(issue_key) = $3`,
      [endDate, prefix, fullKey]
    );

    res.json({
      success: true,
      message: `Datas da demanda ${fullKey} sincronizadas no Jira com sucesso!`,
      issueKey: fullKey,
      startDate,
      endDate,
      commentAdded,
    });
  } catch (err: any) {
    console.error('[Projects API] Erro ao sincronizar datas com Jira:', err);
    res.status(500).json({ error: err.message || 'Erro ao sincronizar datas no Jira.' });
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

    // Buscar dados atualizados do Jira (canal, indústria, assignee, status)
    const jiraKeys = resPlan.rows
      .filter((r) => !r.metadata?.isManual && !r.metadata?.isExternal)
      .map((r) => r.issue_key);

    const jiraInfoMap = new Map<string, { canal: string | null; industry: string | null; assignee: string | null; status: string | null }>();

    if (jiraKeys.length > 0 && config.api_token && config.domain && config.email) {
      try {
        const jql = `key in (${jiraKeys.map((k) => `"${k}"`).join(',')})`;
        const searchRes = await fetch(`https://${host}/rest/api/3/search/jql`, {
          method: 'POST',
          headers: {
            Authorization: getAuthHeader(config),
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            jql,
            fields: ['key', 'customfield_10780', 'customfield_10273', 'assignee', 'status'],
            maxResults: 100,
          }),
        });
        if (searchRes.ok) {
          const data: any = await searchRes.json();
          for (const iss of data.issues || []) {
            const ind = extractFieldValue(iss.fields?.customfield_10780);
            const can = extractFieldValue(iss.fields?.customfield_10273);
            const ass = iss.fields?.assignee?.displayName || iss.fields?.assignee?.name || null;
            const st = iss.fields?.status?.name || null;
            jiraInfoMap.set(iss.key, { canal: can, industry: ind, assignee: ass, status: st });
          }
        }
      } catch (err) {
        console.warn('[Projects API] Falha ao enriquecer canal/indústria/usuário/status:', err);
      }
    }

    const rawItems: PlanItemInput[] = resPlan.rows.map((r) => {
      const enriched = jiraInfoMap.get(r.issue_key);
      const meta = { ...(r.metadata || {}) };
      if (enriched) {
        if (!meta.canal && enriched.canal) meta.canal = enriched.canal;
        if (!meta.industry && enriched.industry) meta.industry = enriched.industry;
        if (enriched.assignee) meta.jira_assignee = enriched.assignee;
        if (enriched.status) meta.rawStatus = enriched.status;
      }
      if (!meta.jira_assignee && r.assignee_name) {
        meta.jira_assignee = r.assignee_name;
      }
      return {
        id: r.id,
        issue_key: r.issue_key,
        summary: r.summary,
        status: r.status,
        assignee_name: r.assignee_name,
        estimate_hours: Number(r.estimate_hours),
        sort_order: r.sort_order,
        fixed_start_date: meta.fixed_start_date || null,
        metadata: {
          ...meta,
          fixed_start_date: meta.fixed_start_date || null,
          url: meta.isManual || meta.isExternal ? null : (meta.url || `https://${host}/browse/${r.issue_key}`),
        },
      };
    });

    if (jiraInfoMap.size > 0) {
      for (const item of rawItems) {
        if (jiraInfoMap.has(item.issue_key)) {
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

    // Normaliza os itens de entrada com sort_order e fixed_start_date
    const normalizedInputs: PlanItemInput[] = items.map((item: any, idx: number) => {
      const fixedStartDate = item.fixed_start_date || item.metadata?.fixed_start_date || null;
      return {
        id: item.id || `item_${item.issue_key}_${Date.now()}_${idx}`,
        issue_key: String(item.issue_key).trim().toUpperCase(),
        summary: String(item.summary || 'Sem resumo').trim(),
        status: item.status || 'Planejado',
        assignee_name: String(item.assignee_name || 'Não atribuído').trim(),
        estimate_hours: Math.max(0.5, Number(item.estimate_hours) || 1),
        sort_order: idx + 1,
        fixed_start_date: fixedStartDate,
        metadata: {
          ...(item.metadata || {}),
          fixed_start_date: fixedStartDate,
        },
      };
    });

    // Calcula as datas com o motor
    const scheduled = calculatePlanSchedule(normalizedInputs, settings);

    await client.query('BEGIN');

    // Buscar itens existentes para detectar alterações de ordem e de data
    const existingRes = await client.query(
      `SELECT * FROM project_plan_items WHERE UPPER(project_key) = $1`,
      [normKey]
    );
    const existingMap = new Map<string, any>();
    for (const r of existingRes.rows) {
      existingMap.set(r.issue_key, r);
    }

    // Registrar alterações de ordem e data no log de auditoria
    if (existingMap.size > 0) {
      for (const item of scheduled) {
        if (existingMap.has(item.issue_key)) {
          const oldItem = existingMap.get(item.issue_key);

          // 1. Alteração de Ordem
          if (oldItem.sort_order !== item.sort_order) {
            await client.query(
              `INSERT INTO project_change_logs (project_key, event_type, issue_key, summary, assignee_name, old_value, new_value, description)
               VALUES ($1, 'order_changed', $2, $3, $4, $5, $6, $7)`,
              [
                normKey,
                item.issue_key,
                item.summary,
                item.assignee_name,
                JSON.stringify({ sort_order: oldItem.sort_order }),
                JSON.stringify({ sort_order: item.sort_order }),
                `Alteração de ordem na fila: Posição ${oldItem.sort_order} ➔ Posição ${item.sort_order}`,
              ]
            );
          }

          // 2. Alteração de Data
          if (oldItem.start_date !== item.start_date || oldItem.end_date !== item.end_date) {
            await client.query(
              `INSERT INTO project_change_logs (project_key, event_type, issue_key, summary, assignee_name, old_value, new_value, description)
               VALUES ($1, 'date_changed', $2, $3, $4, $5, $6, $7)`,
              [
                normKey,
                item.issue_key,
                item.summary,
                item.assignee_name,
                JSON.stringify({ start_date: oldItem.start_date, end_date: oldItem.end_date }),
                JSON.stringify({ start_date: item.start_date, end_date: item.end_date }),
                `Alteração de datas: Início ${oldItem.start_date} ➔ ${item.start_date} | Fim ${oldItem.end_date} ➔ ${item.end_date}`,
              ]
            );
          }
        }
      }
    }

    // Registrar logs explícitos enviados pelo cliente (ex: inversão de tarefas)
    if (Array.isArray(req.body.logs) && req.body.logs.length > 0) {
      for (const l of req.body.logs) {
        if (!l.issue_key || !l.description) continue;
        await client.query(
          `INSERT INTO project_change_logs (project_key, event_type, issue_key, summary, assignee_name, old_value, new_value, description)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            normKey,
            l.event_type || 'order_changed',
            l.issue_key,
            l.summary || '',
            l.assignee_name || null,
            JSON.stringify(l.old_value || {}),
            JSON.stringify(l.new_value || {}),
            l.description,
          ]
        );
      }
    }

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

/**
 * GET /api/projects/:projectKey/logs - Retorna os logs de auditoria e alteração do projeto
 */
projectRoutes.get('/:projectKey/logs', async (req: Request, res: Response): Promise<void> => {
  try {
    const projectKey = String(req.params.projectKey).trim().toUpperCase();
    const result = await pool.query(
      `SELECT id, project_key, event_type, issue_key, summary, assignee_name, old_value, new_value, description, created_at
       FROM project_change_logs
       WHERE UPPER(project_key) = $1
       ORDER BY created_at DESC
       LIMIT 500`,
      [projectKey]
    );
    res.json(result.rows);
  } catch (err: any) {
    console.error('[Projects API] Erro ao listar logs:', err);
    res.status(500).json({ error: 'Erro ao carregar log de alterações.' });
  }
});

/**
 * POST /api/projects/:projectKey/logs - Registra novo(s) evento(s) de log no projeto
 */
projectRoutes.post('/:projectKey/logs', async (req: Request, res: Response): Promise<void> => {
  try {
    const projectKey = String(req.params.projectKey).trim().toUpperCase();
    const { logs } = req.body;
    const logsArray = Array.isArray(logs) ? logs : [req.body];

    for (const l of logsArray) {
      if (!l.issue_key || !l.description) continue;
      await pool.query(
        `INSERT INTO project_change_logs (project_key, event_type, issue_key, summary, assignee_name, old_value, new_value, description)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          projectKey,
          l.event_type || 'order_changed',
          l.issue_key,
          l.summary || '',
          l.assignee_name || null,
          JSON.stringify(l.old_value || {}),
          JSON.stringify(l.new_value || {}),
          l.description,
        ]
      );
    }
    res.json({ success: true });
  } catch (err: any) {
    console.error('[Projects API] Erro ao gravar logs:', err);
    res.status(500).json({ error: 'Erro ao gravar log de alterações.' });
  }
});
