import { Router, Request, Response } from 'express';
import { pool } from './db';
import { getJiraConfig, getAuthHeader, parseSingleJiraIssue, extractFieldValue } from './jira';
import {
  ProjectSettings,
  DEFAULT_PROJECT_SETTINGS,
  DEFAULT_BRAZILIAN_HOLIDAYS,
  PlanItemInput,
  ScheduledPlanItem,
  calculatePlanSchedule,
} from './projectScheduling';

export const projectRoutes = Router();

/**
 * Obtém as configurações de Gestão de Projetos do banco
 */
async function getProjectSettings(): Promise<ProjectSettings> {
  const res = await pool.query(`SELECT value FROM app_settings WHERE key = 'project_management_settings'`);
  if (res.rows.length === 0) {
    return DEFAULT_PROJECT_SETTINGS;
  }
  const val = res.rows[0].value;
  return {
    delivered_users: Array.isArray(val.delivered_users) ? val.delivered_users : DEFAULT_PROJECT_SETTINGS.delivered_users,
    work_hours_per_day: Number(val.work_hours_per_day) || DEFAULT_PROJECT_SETTINGS.work_hours_per_day,
    plan_start_date: val.plan_start_date || DEFAULT_PROJECT_SETTINGS.plan_start_date,
    holidays: Array.isArray(val.holidays) ? val.holidays : DEFAULT_PROJECT_SETTINGS.holidays,
    client_hours_markup_percent: Number(val.client_hours_markup_percent) >= 0 ? Number(val.client_hours_markup_percent) : 0,
    client_delivery_buffer_days: val.client_delivery_buffer_days !== undefined
      ? Math.max(0, Math.min(60, Number(val.client_delivery_buffer_days) || 0))
      : (DEFAULT_PROJECT_SETTINGS.client_delivery_buffer_days ?? 1),
  };
}

/**
 * GET /api/projects/settings
 */
projectRoutes.get('/settings', async (req: Request, res: Response): Promise<void> => {
  try {
    const settings = await getProjectSettings();
    res.json(settings);
  } catch (err: any) {
    console.error('[Projects API] Erro ao buscar configurações:', err);
    res.status(500).json({ error: 'Erro ao carregar configurações do projeto.' });
  }
});

/**
 * PUT /api/projects/settings
 */
projectRoutes.put('/settings', async (req: Request, res: Response): Promise<void> => {
  try {
    const current = await getProjectSettings();
    const { delivered_users, work_hours_per_day, plan_start_date, holidays, client_hours_markup_percent, client_delivery_buffer_days } = req.body;

    const merged: ProjectSettings = {
      delivered_users: Array.isArray(delivered_users)
        ? delivered_users.map((u: string) => u.trim()).filter(Boolean)
        : current.delivered_users,
      work_hours_per_day: Math.max(1, Math.min(24, Number(work_hours_per_day) || current.work_hours_per_day)),
      plan_start_date: plan_start_date ? String(plan_start_date).trim() : current.plan_start_date,
      holidays: Array.isArray(holidays)
        ? holidays
            .filter((h: any) => h && h.date && h.name)
            .map((h: any) => ({ date: String(h.date).trim(), name: String(h.name).trim() }))
        : current.holidays,
      client_hours_markup_percent: Math.max(0, Math.min(500, Number(client_hours_markup_percent) || 0)),
      client_delivery_buffer_days: client_delivery_buffer_days !== undefined
        ? Math.max(0, Math.min(60, Number(client_delivery_buffer_days) || 0))
        : (current.client_delivery_buffer_days !== undefined ? current.client_delivery_buffer_days : 1),
    };

    await pool.query(
      `INSERT INTO app_settings (key, value)
       VALUES ('project_management_settings', $1)
       ON CONFLICT (key) DO UPDATE SET value = $1`,
      [JSON.stringify(merged)]
    );

    // Recalcular datas dos itens já existentes no plano
    const planRes = await pool.query(
      `SELECT * FROM project_plan_items WHERE project_key = 'NEO' ORDER BY sort_order ASC`
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

      const recalculated = calculatePlanSchedule(existingItems, merged);

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
           WHERE id = $4`,
          [item.start_date, item.end_date, JSON.stringify(meta), item.id]
        );
      }
    }

    res.json(merged);
  } catch (err: any) {
    console.error('[Projects API] Erro ao salvar configurações:', err);
    res.status(500).json({ error: 'Erro ao salvar configurações do projeto.' });
  }
});

/**
 * POST /api/projects/settings/reset-holidays
 */
projectRoutes.post('/settings/reset-holidays', async (req: Request, res: Response): Promise<void> => {
  try {
    const current = await getProjectSettings();
    const updated: ProjectSettings = {
      ...current,
      holidays: [...DEFAULT_BRAZILIAN_HOLIDAYS],
    };

    await pool.query(
      `INSERT INTO app_settings (key, value)
       VALUES ('project_management_settings', $1)
       ON CONFLICT (key) DO UPDATE SET value = $1`,
      [JSON.stringify(updated)]
    );

    res.json(updated);
  } catch (err: any) {
    console.error('[Projects API] Erro ao restaurar feriados:', err);
    res.status(500).json({ error: 'Erro ao restaurar feriados padrões.' });
  }
});

/**
 * GET /api/projects/neo/backlog
 * Retorna as demandas do Jira do projeto NEO que:
 * 1. Não estejam atribuídas aos usuários configurados como "entregue" (ex: "Neogrid")
 * 2. Não estejam atualmente incluídas no Plano de Projeto
 * Agrupadas por Status do Jira (modo sanfona)
 */
projectRoutes.get('/neo/backlog', async (req: Request, res: Response): Promise<void> => {
  try {
    const config = await getJiraConfig();
    const settings = await getProjectSettings();

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

    // Buscar chaves que já estão no plano
    const planKeysRes = await pool.query(
      `SELECT issue_key FROM project_plan_items WHERE project_key = 'NEO'`
    );
    const plannedKeys = new Set(planKeysRes.rows.map((r) => r.issue_key));

    const industryField = config.custom_fields?.industry || 'customfield_10780';
    const layoutField = config.custom_fields?.layout || 'customfield_10714';
    const flaggedField = (config as any).custom_fields?.flagged || 'customfield_10021';
    const canalField = 'customfield_10273';

    // Busca paginada no Jira: apenas tipos "Ativação" e "Tarefa" (não considera Épicos)
    const jql = 'project = "NEO" AND issuetype in ("Ativação", "Tarefa") ORDER BY status ASC, created DESC';
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
        console.error('[Projects API] Erro ao buscar issues no Jira:', searchRes.status, errText);
        throw new Error(`Erro na API do Jira (${searchRes.status})`);
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

    // Filtrar: desconsiderar usuários entregues (ex: "Neogrid") e itens já no plano
    const backlogItems: any[] = [];
    const assigneesSet = new Set<string>();

    for (const issue of allIssues) {
      const f = issue.fields || {};
      const typeName = (f.issuetype?.name || '').toLowerCase().trim();

      // Regra: Desconsiderar épicos
      if (typeName === 'épico' || typeName === 'epico' || typeName === 'epic') {
        continue;
      }

      // Regra: Considerar apenas cards dos tipos "Ativação" e "Tarefa"
      if (typeName !== 'ativação' && typeName !== 'ativacao' && typeName !== 'tarefa' && typeName !== 'task') {
        continue;
      }

      const assigneeName = f.assignee?.displayName || f.assignee?.name || 'Não atribuído';
      const normAssignee = assigneeName.trim().toLowerCase();

      // Regra de Negócio: se o usuário for "Neogrid" (ou outro na lista de entregues), considera-se entregue!
      if (deliveredUsersSet.has(normAssignee)) {
        continue;
      }

      // Se já está no plano, não entra no backlog
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
      project: 'NEO',
      totalBacklog: backlogItems.length,
      totalPlanned: plannedKeys.size,
      availableAssignees: Array.from(assigneesSet).sort(),
      groups: groupedBacklog,
      lastUpdated: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[Projects API] Erro ao carregar backlog do Jira:', err);
    res.status(500).json({ error: err.message || 'Erro ao carregar backlog do projeto Neogrid.' });
  }
});

/**
 * GET /api/projects/neo/plan
 * Retorna os itens do plano salvos e agendados
 */
projectRoutes.get('/neo/plan', async (req: Request, res: Response): Promise<void> => {
  try {
    const settings = await getProjectSettings();
    const config = await getJiraConfig();
    const host = config.domain.replace(/^https?:\/\//, '').replace(/\/+$/, '');

    const resPlan = await pool.query(
      `SELECT * FROM project_plan_items WHERE project_key = 'NEO' ORDER BY sort_order ASC`
    );

    // Se algum item não tiver canal no metadata, buscar do Jira e atualizar
    const missingCanalKeys = resPlan.rows
      .filter((r) => !r.metadata?.canal)
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
          url: `https://${host}/browse/${r.issue_key}`,
        },
      };
    });

    if (canalMap.size > 0) {
      for (const item of rawItems) {
        if (canalMap.has(item.issue_key)) {
          pool.query(
            `UPDATE project_plan_items SET metadata = $1 WHERE id = $2`,
            [JSON.stringify(item.metadata), item.id]
          ).catch(() => {});
        }
      }
    }

    // Recalcular para garantir consistência perfeita com as configurações atuais
    const scheduled = calculatePlanSchedule(rawItems, settings);

    res.json({
      project: 'NEO',
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
 * PUT /api/projects/neo/plan
 * Persiste o plano completo após confirmação do usuário (clique no botão Salvar)
 */
projectRoutes.put('/neo/plan', async (req: Request, res: Response): Promise<void> => {
  const client = await pool.connect();
  try {
    const { items } = req.body;
    if (!Array.isArray(items)) {
      res.status(400).json({ error: 'A lista de itens do plano é inválida.' });
      return;
    }

    const settings = await getProjectSettings();

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

    // Remove os itens antigos do projeto NEO
    await client.query(`DELETE FROM project_plan_items WHERE project_key = 'NEO'`);

    // Insere os novos itens
    for (const item of scheduled) {
      await client.query(
        `INSERT INTO project_plan_items (
          id, project_key, issue_key, summary, status, assignee_name,
          estimate_hours, sort_order, start_date, end_date, metadata
        ) VALUES ($1, 'NEO', $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          item.id,
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
