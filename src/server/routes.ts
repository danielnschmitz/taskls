import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import {
  startOfWeek,
  addDays,
  format,
  parseISO,
  isSameDay,
  isBefore,
  startOfDay,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { pool } from './db';
import {
  TaskRecord,
  isTaskOccurringOnDate,
  getNextOccurrence,
} from './recurrence';
import { sendWindowsNotification } from './notifier';
import { isAutostartEnabled, setAutostart } from './autostart';
import {
  getJiraConfig,
  saveJiraConfig,
  testJiraConnection,
  getJiraDemandsForWeek,
  ALL_POSSIBLE_STATUSES,
} from './jira';
import {
  listJiraEvents,
  markEventAsReviewed,
  unmarkEventAsReviewed,
  markAllEventsAsReviewed,
  syncJiraEventsFromRest,
  getPendingEventsCount,
} from './jiraEvents';
import { requireModule } from './auth';

export const router = Router();

// Garantir que as rotas de tarefas exijam o módulo 'tasks'
router.use('/tasks', requireModule('tasks'));

/**
 * GET /api/tasks/dashboard
 * Aggregates data for all 3 panels:
 * 1. Current Week with days and task occurrences (weekly + date matches).
 * 2. Upcoming single and monthly tasks, sorted chronologically.
 * 3. Backlog tasks (no specific date).
 */
router.get('/tasks/dashboard', async (req: Request, res: Response) => {
  try {
    const { weekStart: weekStartParam } = req.query;

    const baseDate = weekStartParam
      ? parseISO(weekStartParam as string)
      : new Date();

    // Monday as start of week (weekStartsOn: 1)
    const weekStartDate = startOfWeek(baseDate, { weekStartsOn: 1 });
    const weekEndDate = addDays(weekStartDate, 4); // Monday to Friday (5 days)

    const weekStartStr = format(weekStartDate, 'yyyy-MM-dd');
    const weekEndStr = format(weekEndDate, 'yyyy-MM-dd');

    const userId = (req as any).user.id;

    // 1. Fetch user's tasks
    const tasksQuery = await pool.query<TaskRecord>(
      'SELECT * FROM tasks WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    const allTasks = tasksQuery.rows;

    // 2. Fetch completions for user's tasks in the week range
    const completionsQuery = await pool.query<{
      task_id: string;
      completion_date: string;
    }>(
      `SELECT c.task_id, to_char(c.completion_date, 'YYYY-MM-DD') as completion_date
       FROM task_completions c
       JOIN tasks t ON t.id = c.task_id
       WHERE t.user_id = $1 AND c.completion_date >= $2 AND c.completion_date <= $3`,
      [userId, weekStartStr, weekEndStr]
    );

    // Set of completed keys: "taskId:YYYY-MM-DD"
    const completedSet = new Set(
      completionsQuery.rows.map(
        (c) => `${c.task_id}:${c.completion_date}`
      )
    );

    // 3. Build Panel 1: 5 Days of the Week (Segunda a Sexta)
    const today = new Date();
    const days = [];

    for (let i = 0; i < 5; i++) {
      const currentDay = addDays(weekStartDate, i);
      const dateStr = format(currentDay, 'yyyy-MM-dd');
      const dayOfWeek = currentDay.getDay(); // 0=Dom ... 6=Sab
      const isToday = isSameDay(currentDay, today);

      // Portuguese label: "Segunda-feira", "Terça-feira", etc.
      const dayName = format(currentDay, 'EEEE', { locale: ptBR });
      const dayNameCapitalized =
        dayName.charAt(0).toUpperCase() + dayName.slice(1);
      const dayNumber = currentDay.getDate();
      const monthName = format(currentDay, 'MMM', { locale: ptBR });

      // Find tasks occurring on this specific day
      const dayTasks = allTasks
        .filter((task) => isTaskOccurringOnDate(task, currentDay))
        .map((task) => {
          let isCompleted = false;
          if (task.type === 'once') {
            isCompleted = task.is_completed;
          } else {
            isCompleted = completedSet.has(`${task.id}:${dateStr}`);
          }
          return {
            ...task,
            occurrence_date: dateStr,
            is_completed_for_date: isCompleted,
          };
        });

      days.push({
        date: dateStr,
        dayOfWeek,
        dayName: dayNameCapitalized,
        dayNumber,
        monthName,
        isToday,
        tasks: dayTasks,
      });
    }

    // 4. Build Panel 2: Single & Monthly tasks sorted chronologically
    const scheduledTasks = allTasks.filter(
      (t) => t.type === 'once' || t.type === 'monthly'
    );

    const todayStart = startOfDay(new Date());

    const upcomingTasks = scheduledTasks
      .map((task) => {
        const nextDate = getNextOccurrence(task, todayStart);
        let isCompleted = task.is_completed;

        if (task.type === 'monthly' && nextDate) {
          const nextDateStr = format(nextDate, 'yyyy-MM-dd');
          isCompleted = completedSet.has(`${task.id}:${nextDateStr}`);
        }

        return {
          ...task,
          next_occurrence: nextDate ? format(nextDate, 'yyyy-MM-dd') : null,
          next_occurrence_date: nextDate,
          is_completed_for_date: isCompleted,
        };
      })
      .filter((task) => {
        // Keep uncompleted single tasks OR upcoming occurrences
        if (task.type === 'once') {
          return true; // Show all single tasks (can filter in UI)
        }
        return task.next_occurrence !== null;
      })
      .sort((a, b) => {
        if (!a.next_occurrence_date) return 1;
        if (!b.next_occurrence_date) return -1;
        return a.next_occurrence_date.getTime() - b.next_occurrence_date.getTime();
      });

    // 5. Build Panel 3: Backlog (no date)
    const backlogTasks = allTasks.filter((t) => t.type === 'none');

    // 6. Fetch Categories and DND Settings
    const categoriesRes = await pool.query('SELECT * FROM categories ORDER BY name ASC');
    const dndRes = await pool.query<{ value: { enabled: boolean; until: string | null } }>(
      `SELECT value FROM app_settings WHERE key = 'dnd' LIMIT 1`
    );
    const dndStatus = dndRes.rows[0]?.value || { enabled: false, until: null };

    res.json({
      week: {
        startDate: weekStartStr,
        endDate: weekEndStr,
        days,
      },
      upcoming: upcomingTasks,
      backlog: backlogTasks,
      categories: categoriesRes.rows,
      dnd: dndStatus,
    });
  } catch (err) {
    console.error('[API] Erro ao buscar dashboard:', err);
    res.status(500).json({ error: 'Erro ao carregar dados do dashboard' });
  }
});

/**
 * GET /api/tasks
 * List all tasks with optional filters
 */
router.get('/tasks', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { type, priority, category } = req.query;
    let query = 'SELECT * FROM tasks WHERE user_id = $1';
    const params: any[] = [userId];

    if (type) {
      params.push(type);
      query += ` AND type = $${params.length}`;
    }
    if (priority) {
      params.push(priority);
      query += ` AND priority = $${params.length}`;
    }
    if (category) {
      params.push(category);
      query += ` AND category = $${params.length}`;
    }

    query += ' ORDER BY created_at DESC';

    const result = await pool.query<TaskRecord>(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('[API] Erro ao listar tarefas:', err);
    res.status(500).json({ error: 'Erro ao listar tarefas' });
  }
});

/**
 * POST /api/tasks
 * Create a new task
 */
router.post('/tasks', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const {
      title,
      description,
      type,
      priority = 'medium',
      category = 'Geral',
      due_date,
      weekly_days,
      monthly_type,
      monthly_day,
      monthly_pattern,
      monthly_weekday,
      notification_times = [],
      subtasks = [],
      snoozed_until,
    } = req.body;

    if (!title || !title.trim()) {
      res.status(400).json({ error: 'O título da tarefa é obrigatório' });
      return;
    }

    if (!['weekly', 'once', 'monthly', 'none'].includes(type)) {
      res.status(400).json({ error: 'Tipo de tarefa inválido' });
      return;
    }

    const id = randomUUID();

    const insertQuery = `
      INSERT INTO tasks (
        id, title, description, type, priority, category,
        due_date, weekly_days, monthly_type, monthly_day,
        monthly_pattern, monthly_weekday, notification_times,
        is_completed, subtasks, snoozed_until, user_id, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10,
        $11, $12, $13,
        false, $14, $15, $16, NOW(), NOW()
      )
      RETURNING *;
    `;

    const values = [
      id,
      title.trim(),
      description ? description.trim() : null,
      type,
      priority,
      category ? category.trim() : 'Geral',
      due_date || null,
      Array.isArray(weekly_days) ? weekly_days : null,
      monthly_type || null,
      monthly_day ? parseInt(monthly_day, 10) : null,
      monthly_pattern || null,
      monthly_weekday !== undefined && monthly_weekday !== null ? parseInt(monthly_weekday, 10) : null,
      Array.isArray(notification_times) ? notification_times : [],
      JSON.stringify(subtasks || []),
      snoozed_until || null,
      userId,
    ];

    const result = await pool.query<TaskRecord>(insertQuery, values);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[API] Erro ao criar tarefa:', err);
    res.status(500).json({ error: 'Erro ao criar tarefa' });
  }
});

/**
 * PUT /api/tasks/:id
 * Update an existing task
 */
router.put('/tasks/:id', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;
    const {
      title,
      description,
      type,
      priority,
      category,
      due_date,
      weekly_days,
      monthly_type,
      monthly_day,
      monthly_pattern,
      monthly_weekday,
      notification_times,
      is_completed,
      subtasks,
      snoozed_until,
    } = req.body;

    const checkRes = await pool.query('SELECT * FROM tasks WHERE id = $1 AND user_id = $2', [id, userId]);
    if (checkRes.rowCount === 0) {
      res.status(404).json({ error: 'Tarefa não encontrada' });
      return;
    }

    const current = checkRes.rows[0];

    const updateQuery = `
      UPDATE tasks SET
        title = $1,
        description = $2,
        type = $3,
        priority = $4,
        category = $5,
        due_date = $6,
        weekly_days = $7,
        monthly_type = $8,
        monthly_day = $9,
        monthly_pattern = $10,
        monthly_weekday = $11,
        notification_times = $12,
        is_completed = $13,
        subtasks = $14,
        snoozed_until = $15,
        updated_at = NOW()
      WHERE id = $16 AND user_id = $17
      RETURNING *;
    `;

    const values = [
      title !== undefined ? title.trim() : current.title,
      description !== undefined ? (description ? description.trim() : null) : current.description,
      type !== undefined ? type : current.type,
      priority !== undefined ? priority : current.priority,
      category !== undefined ? (category ? category.trim() : 'Geral') : current.category,
      due_date !== undefined ? due_date : current.due_date,
      weekly_days !== undefined ? weekly_days : current.weekly_days,
      monthly_type !== undefined ? monthly_type : current.monthly_type,
      monthly_day !== undefined ? (monthly_day ? parseInt(monthly_day, 10) : null) : current.monthly_day,
      monthly_pattern !== undefined ? monthly_pattern : current.monthly_pattern,
      monthly_weekday !== undefined ? (monthly_weekday !== null ? parseInt(monthly_weekday, 10) : null) : current.monthly_weekday,
      notification_times !== undefined ? notification_times : current.notification_times,
      is_completed !== undefined ? is_completed : current.is_completed,
      subtasks !== undefined ? JSON.stringify(subtasks) : JSON.stringify(current.subtasks || []),
      snoozed_until !== undefined ? snoozed_until : current.snoozed_until,
      id,
      userId,
    ];

    const result = await pool.query<TaskRecord>(updateQuery, values);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[API] Erro ao atualizar tarefa:', err);
    res.status(500).json({ error: 'Erro ao atualizar tarefa' });
  }
});

/**
 * DELETE /api/tasks/:id
 * Delete a task
 */
router.delete('/tasks/:id', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;
    const result = await pool.query('DELETE FROM tasks WHERE id = $1 AND user_id = $2 RETURNING id', [id, userId]);
    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Tarefa não encontrada' });
      return;
    }
    res.json({ success: true, message: 'Tarefa excluída com sucesso' });
  } catch (err) {
    console.error('[API] Erro ao excluir tarefa:', err);
    res.status(500).json({ error: 'Erro ao excluir tarefa' });
  }
});

/**
 * POST /api/tasks/:id/toggle
 * Toggle completion of a task.
 * For weekly/monthly tasks: accepts `date` in body to toggle completion for that specific occurrence.
 * For once/none tasks: toggles `is_completed`.
 */
router.post('/tasks/:id/toggle', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;
    const { date: targetDateParam } = req.body;

    const taskRes = await pool.query<TaskRecord>('SELECT * FROM tasks WHERE id = $1 AND user_id = $2', [id, userId]);
    if (taskRes.rowCount === 0) {
      res.status(404).json({ error: 'Tarefa não encontrada' });
      return;
    }

    const task = taskRes.rows[0];
    const targetDateStr = targetDateParam || format(new Date(), 'yyyy-MM-dd');

    if (task.type === 'once' || task.type === 'none') {
      const newStatus = !task.is_completed;
      const updateRes = await pool.query<TaskRecord>(
        `UPDATE tasks
         SET is_completed = $1, completed_at = $2, updated_at = NOW()
         WHERE id = $3 AND user_id = $4
         RETURNING *`,
        [newStatus, newStatus ? new Date() : null, id, userId]
      );
      res.json({
        success: true,
        isCompleted: newStatus,
        task: updateRes.rows[0],
      });
      return;
    }

    // Weekly or monthly recurring task
    const checkCompletion = await pool.query(
      `SELECT id FROM task_completions WHERE task_id = $1 AND completion_date = $2`,
      [id, targetDateStr]
    );

    if (checkCompletion.rowCount && checkCompletion.rowCount > 0) {
      // Uncheck / Remove completion for this date
      await pool.query(
        `DELETE FROM task_completions WHERE task_id = $1 AND completion_date = $2`,
        [id, targetDateStr]
      );
      res.json({
        success: true,
        isCompleted: false,
        date: targetDateStr,
      });
    } else {
      // Mark completed for this date
      await pool.query(
        `INSERT INTO task_completions (task_id, completion_date)
         VALUES ($1, $2)
         ON CONFLICT (task_id, completion_date) DO NOTHING`,
        [id, targetDateStr]
      );
      res.json({
        success: true,
        isCompleted: true,
        date: targetDateStr,
      });
    }
  } catch (err) {
    console.error('[API] Erro ao alternar conclusão da tarefa:', err);
    res.status(500).json({ error: 'Erro ao alternar conclusão' });
  }
});

/**
 * GET /api/notifications/pending
 * Retorna as notificações pendentes para o navegador e as marca como entregues
 */
router.get('/notifications/pending', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const result = await pool.query<{
      id: number;
      title: string;
      message: string;
      task_id: string | null;
      created_at: string;
    }>(
      `SELECT id, title, message, task_id, created_at
       FROM notification_queue
       WHERE delivered = FALSE AND user_id = $1 AND created_at >= NOW() - INTERVAL '5 minutes'
       ORDER BY created_at ASC`,
      [userId]
    );

    if (result.rows.length > 0) {
      const ids = result.rows.map((r) => r.id);
      await pool.query(
        `UPDATE notification_queue SET delivered = TRUE WHERE id = ANY($1::int[])`,
        [ids]
      );
    }

    res.json({ notifications: result.rows });
  } catch (err: any) {
    console.error('[API] Erro ao buscar notificações pendentes:', err);
    res.status(500).json({ error: 'Erro ao buscar notificações pendentes' });
  }
});

/**
 * POST /api/notifications/test
 * Enfileira uma notificação de teste para o navegador
 */
router.post('/notifications/test', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const {
      title = 'TaskLS - Notificação de Teste',
      message = 'Suas notificações do navegador estão configuradas e funcionando!',
    } = req.body;
    const result = await sendWindowsNotification(title, message, undefined, userId);
    res.json({
      success: result,
      message: result
        ? 'Notificação do navegador enfileirada com sucesso!'
        : 'Falha ao enfileirar notificação do navegador.',
    });
  } catch (err) {
    console.error('[API] Erro no teste de notificação:', err);
    res.status(500).json({ error: 'Erro ao enviar notificação de teste' });
  }
});

/**
 * GET /api/system/autostart
 * Returns current status of Windows startup integration
 */
router.get('/system/autostart', (req: Request, res: Response) => {
  try {
    const enabled = isAutostartEnabled();
    res.json({ enabled });
  } catch (err) {
    console.error('[API] Erro ao checar autostart:', err);
    res.status(500).json({ error: 'Erro ao checar status de inicialização' });
  }
});

/**
 * POST /api/system/autostart
 * Enables or disables Windows startup integration
 */
router.post('/system/autostart', (req: Request, res: Response) => {
  try {
    const { enabled } = req.body;
    const result = setAutostart(Boolean(enabled));
    res.json(result);
  } catch (err) {
    console.error('[API] Erro ao configurar autostart:', err);
    res.status(500).json({ error: 'Erro ao configurar inicialização' });
  }
});

/**
 * PATCH /api/tasks/:id/subtasks
 * Update task subtasks checklist
 */
router.patch('/tasks/:id/subtasks', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;
    const { subtasks } = req.body;
    const result = await pool.query(
      `UPDATE tasks SET subtasks = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3 RETURNING *`,
      [JSON.stringify(subtasks || []), id, userId]
    );
    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Tarefa não encontrada' });
      return;
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[API] Erro ao atualizar subtarefas:', err);
    res.status(500).json({ error: 'Erro ao atualizar subtarefas' });
  }
});

/**
 * POST /api/tasks/:id/snooze
 * Snooze a task for N minutes
 */
router.post('/tasks/:id/snooze', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;
    const { minutes = 15 } = req.body;
    const snoozedUntil = new Date(Date.now() + Number(minutes) * 60 * 1000);
    const result = await pool.query(
      `UPDATE tasks SET snoozed_until = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3 RETURNING *`,
      [snoozedUntil, id, userId]
    );
    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Tarefa não encontrada' });
      return;
    }
    res.json({ success: true, snoozed_until: snoozedUntil, task: result.rows[0] });
  } catch (err) {
    console.error('[API] Erro ao adiar tarefa:', err);
    res.status(500).json({ error: 'Erro ao adiar tarefa' });
  }
});

/**
 * DELETE /api/tasks/:id/snooze
 * Cancel snooze on a task
 */
router.delete('/tasks/:id/snooze', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;
    const result = await pool.query(
      `UPDATE tasks SET snoozed_until = NULL, updated_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING *`,
      [id, userId]
    );
    res.json({ success: true, task: result.rows[0] });
  } catch (err) {
    console.error('[API] Erro ao cancelar adiamento:', err);
    res.status(500).json({ error: 'Erro ao cancelar adiamento' });
  }
});

/**
 * GET /api/system/dnd
 * Get current Do Not Disturb status
 */
router.get('/system/dnd', async (req: Request, res: Response) => {
  try {
    const resQuery = await pool.query<{ value: { enabled: boolean; until: string | null } }>(
      `SELECT value FROM app_settings WHERE key = 'dnd' LIMIT 1`
    );
    const val = resQuery.rows[0]?.value || { enabled: false, until: null };
    res.json(val);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao obter status DND' });
  }
});

/**
 * POST /api/system/dnd
 * Set Do Not Disturb mode
 */
router.post('/system/dnd', async (req: Request, res: Response) => {
  try {
    const { enabled, minutes } = req.body;
    let until: string | null = null;
    if (enabled && minutes && Number(minutes) > 0) {
      until = new Date(Date.now() + Number(minutes) * 60 * 1000).toISOString();
    }
    const val = { enabled: Boolean(enabled), until };
    await pool.query(
      `INSERT INTO app_settings (key, value) VALUES ('dnd', $1)
       ON CONFLICT (key) DO UPDATE SET value = $1`,
      [JSON.stringify(val)]
    );
    res.json(val);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar DND' });
  }
});

/**
 * GET /api/categories
 * List all categories
 */
router.get('/categories', async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM categories ORDER BY name ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar categorias' });
  }
});

/**
 * POST /api/categories
 * Create or update a category
 */
router.post('/categories', async (req: Request, res: Response) => {
  try {
    const { id, name, color, icon } = req.body;
    const catId = id || name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const result = await pool.query(
      `INSERT INTO categories (id, name, color, icon) VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET name = $2, color = $3, icon = $4
       RETURNING *`,
      [catId, name, color || '#6366f1', icon || 'Tag']
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao salvar categoria' });
  }
});

/**
 * GET /api/backup/export
 * 1-Click JSON export of complete database
 */
router.get('/backup/export', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const tasksRes = await pool.query('SELECT * FROM tasks WHERE user_id = $1 ORDER BY created_at ASC', [userId]);
    const completionsRes = await pool.query(
      `SELECT c.* FROM task_completions c
       JOIN tasks t ON t.id = c.task_id
       WHERE t.user_id = $1
       ORDER BY c.id ASC`,
      [userId]
    );
    const categoriesRes = await pool.query('SELECT * FROM categories ORDER BY name ASC');
    const settingsRes = await pool.query('SELECT * FROM app_settings');

    const backup = {
      app: 'TaskLS',
      version: '1.1.0',
      exported_at: new Date().toISOString(),
      tasks: tasksRes.rows,
      task_completions: completionsRes.rows,
      categories: categoriesRes.rows,
      settings: settingsRes.rows,
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="taskls-backup-${format(new Date(), 'yyyy-MM-dd-HHmm')}.json"`
    );
    res.send(JSON.stringify(backup, null, 2));
  } catch (err) {
    console.error('[API] Erro ao exportar backup:', err);
    res.status(500).json({ error: 'Erro ao exportar backup' });
  }
});

/**
 * POST /api/backup/import
 * 1-Click JSON import & restore of database
 */
router.post('/backup/import', async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const userId = (req as any).user.id;
    const { mode = 'merge', data } = req.body;
    if (!data || !Array.isArray(data.tasks)) {
      res.status(400).json({ error: 'Arquivo de backup inválido ou sem lista de tarefas.' });
      return;
    }

    await client.query('BEGIN');

    if (mode === 'replace') {
      await client.query(
        `DELETE FROM task_notifications_sent WHERE task_id IN (SELECT id FROM tasks WHERE user_id = $1)`,
        [userId]
      );
      await client.query(
        `DELETE FROM task_completions WHERE task_id IN (SELECT id FROM tasks WHERE user_id = $1)`,
        [userId]
      );
      await client.query(
        `DELETE FROM tasks WHERE user_id = $1`,
        [userId]
      );
    }

    // Restore categories
    if (Array.isArray(data.categories)) {
      for (const cat of data.categories) {
        await client.query(
          `INSERT INTO categories (id, name, color, icon) VALUES ($1, $2, $3, $4)
           ON CONFLICT (id) DO UPDATE SET name = $2, color = $3, icon = $4`,
          [cat.id, cat.name, cat.color, cat.icon]
        );
      }
    }

    // Restore tasks (vinculando ao usuário logado)
    let importedTasksCount = 0;
    for (const t of data.tasks) {
      await client.query(
        `INSERT INTO tasks (
          id, title, description, type, priority, category,
          due_date, weekly_days, monthly_type, monthly_day,
          monthly_pattern, monthly_weekday, notification_times,
          is_completed, completed_at, subtasks, snoozed_until, user_id, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10,
          $11, $12, $13,
          $14, $15, $16, $17, $18, $19, $20
        )
        ON CONFLICT (id) DO UPDATE SET
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          type = EXCLUDED.type,
          priority = EXCLUDED.priority,
          category = EXCLUDED.category,
          due_date = EXCLUDED.due_date,
          weekly_days = EXCLUDED.weekly_days,
          monthly_type = EXCLUDED.monthly_type,
          monthly_day = EXCLUDED.monthly_day,
          monthly_pattern = EXCLUDED.monthly_pattern,
          monthly_weekday = EXCLUDED.monthly_weekday,
          notification_times = EXCLUDED.notification_times,
          is_completed = EXCLUDED.is_completed,
          subtasks = EXCLUDED.subtasks,
          snoozed_until = EXCLUDED.snoozed_until,
          user_id = EXCLUDED.user_id,
          updated_at = NOW()`,
        [
          t.id, t.title, t.description, t.type, t.priority, t.category,
          t.due_date, t.weekly_days, t.monthly_type, t.monthly_day,
          t.monthly_pattern, t.monthly_weekday, t.notification_times,
          t.is_completed, t.completed_at, JSON.stringify(t.subtasks || []),
          t.snoozed_until || null, userId, t.created_at || new Date(), t.updated_at || new Date()
        ]
      );
      importedTasksCount++;
    }

    // Restore completions
    if (Array.isArray(data.task_completions)) {
      for (const comp of data.task_completions) {
        await client.query(
          `INSERT INTO task_completions (task_id, completion_date, completed_at)
           VALUES ($1, $2, $3)
           ON CONFLICT (task_id, completion_date) DO NOTHING`,
          [comp.task_id, comp.completion_date, comp.completed_at || new Date()]
        );
      }
    }

    await client.query('COMMIT');
    res.json({ success: true, count: importedTasksCount, mode });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[API] Erro ao importar backup:', err);
    res.status(500).json({ error: 'Erro ao importar backup' });
  } finally {
    client.release();
  }
});

/**
 * GET /api/backup/export/csv
 * Export tasks as CSV table
 */
router.get('/backup/export/csv', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const tasksRes = await pool.query<TaskRecord>(
      'SELECT * FROM tasks WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    
    const headers = ['ID', 'Título', 'Tipo', 'Prioridade', 'Categoria', 'Data/Dias', 'Concluída', 'Horários Notificação', 'Subtarefas'];
    const rows = tasksRes.rows.map(t => {
      let dateInfo = '';
      if (t.type === 'once') dateInfo = t.due_date ? String(t.due_date).substring(0, 10) : '';
      else if (t.type === 'weekly') dateInfo = (t.weekly_days || []).join(';');
      else if (t.type === 'monthly') dateInfo = t.monthly_type === 'day_of_month' ? `Dia ${t.monthly_day}` : `${t.monthly_pattern} dia ${t.monthly_weekday}`;
      
      const subtasksCount = Array.isArray(t.subtasks) ? `${t.subtasks.filter(s => s.completed).length}/${t.subtasks.length}` : '0/0';
      
      return [
        t.id,
        `"${(t.title || '').replace(/"/g, '""')}"`,
        t.type,
        t.priority,
        `"${(t.category || '').replace(/"/g, '""')}"`,
        `"${dateInfo}"`,
        t.is_completed ? 'Sim' : 'Não',
        `"${(t.notification_times || []).join(';')}"`,
        `"${subtasksCount}"`
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\r\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="taskls-tarefas-${format(new Date(), 'yyyy-MM-dd')}.csv"`);
    // Add UTF-8 BOM so Excel opens with proper accents
    res.send('\uFEFF' + csvContent);
  } catch (err) {
    console.error('[API] Erro ao exportar CSV:', err);
    res.status(500).json({ error: 'Erro ao exportar CSV' });
  }
});

// ==========================================
// ROTAS DE INTEGRAÇÃO COM JIRA CLOUD
// ==========================================

/**
 * GET /api/jira/settings
 * Retorna as configurações salvas do Jira e a lista de status disponíveis
 */
router.get('/jira/settings', async (req: Request, res: Response) => {
  try {
    const authUser = (req as any).user;
    if (!authUser?.isAdmin) {
      res.status(403).json({ error: 'Apenas administradores podem acessar as configurações do Jira.' });
      return;
    }

    const config = await getJiraConfig();
    res.json({
      domain: config.domain,
      email: config.email,
      projects: config.projects,
      statuses: config.statuses,
      custom_fields: config.custom_fields,
      hasApiToken: Boolean(config.api_token),
      allPossibleStatuses: ALL_POSSIBLE_STATUSES,
    });
  } catch (err: any) {
    console.error('[API] Erro ao buscar configurações do Jira:', err);
    res.status(500).json({ error: 'Erro ao buscar configurações do Jira' });
  }
});

/**
 * PUT /api/jira/settings
 * Atualiza as configurações do Jira no banco de dados
 */
router.put('/jira/settings', async (req: Request, res: Response) => {
  try {
    const authUser = (req as any).user;
    if (!authUser?.isAdmin) {
      res.status(403).json({ error: 'Apenas administradores podem alterar as configurações do Jira.' });
      return;
    }

    const { domain, email, api_token, projects, statuses, custom_fields } = req.body;

    const updated = await saveJiraConfig({
      ...(domain !== undefined && { domain }),
      ...(email !== undefined && { email }),
      ...(api_token && { api_token }),
      ...(projects !== undefined && { projects }),
      ...(statuses !== undefined && { statuses }),
      ...(custom_fields !== undefined && { custom_fields }),
    });

    res.json({
      success: true,
      message: 'Configurações do Jira salvas com sucesso!',
      config: {
        domain: updated.domain,
        email: updated.email,
        projects: updated.projects,
        statuses: updated.statuses,
        custom_fields: updated.custom_fields,
        hasApiToken: Boolean(updated.api_token),
      },
    });
  } catch (err: any) {
    console.error('[API] Erro ao salvar configurações do Jira:', err);
    res.status(500).json({ error: 'Erro ao salvar configurações do Jira' });
  }
});

/**
 * POST /api/jira/test
 * Testa a conexão com a API do Jira
 */
router.post('/jira/test', async (req: Request, res: Response) => {
  try {
    const authUser = (req as any).user;
    if (!authUser?.isAdmin) {
      res.status(403).json({ error: 'Apenas administradores podem testar a conexão do Jira.' });
      return;
    }

    const { domain, email, api_token } = req.body;
    const testResult = await testJiraConnection({
      ...(domain && { domain }),
      ...(email && { email }),
      ...(api_token && { api_token }),
    });

    res.json(testResult);
  } catch (err: any) {
    console.error('[API] Erro ao testar conexão com Jira:', err);
    res.status(500).json({ success: false, message: `Erro ao testar conexão: ${err.message}` });
  }
});

/**
 * GET /api/jira/demands
 * Busca demandas da semana especificada (Segunda a Sexta)
 */
router.get('/jira/demands', async (req: Request, res: Response) => {
  try {
    const authUser = (req as any).user;
    if (!authUser?.isAdmin && !authUser?.canAccessJira) {
      res.status(403).json({ error: 'Você não tem permissão para visualizar o painel do Jira.' });
      return;
    }

    const { weekStart } = req.query;
    const baseDateStr = typeof weekStart === 'string' && weekStart
      ? weekStart
      : format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');

    const result = await getJiraDemandsForWeek(baseDateStr);
    res.json(result);
  } catch (err: any) {
    console.error('[API] Erro ao buscar demandas do Jira:', err);
    res.status(500).json({ error: err.message || 'Erro ao buscar demandas do Jira' });
  }
});

/**
 * GET /api/jira/events
 * Lista eventos do Jira para revisão
 */
router.get('/jira/events', async (req: Request, res: Response) => {
  try {
    const authUser = (req as any).user;
    if (!authUser?.isAdmin && !authUser?.canAccessJira) {
      res.status(403).json({ error: 'Sem permissão para acessar o painel de eventos do Jira.' });
      return;
    }

    const { status, project, eventType, search, limit, offset } = req.query;
    const data = await listJiraEvents({
      status: (status as any) || 'pending',
      project: typeof project === 'string' ? project : 'all',
      eventType: typeof eventType === 'string' ? eventType : 'all',
      search: typeof search === 'string' ? search : '',
      limit: limit ? parseInt(String(limit), 10) : 50,
      offset: offset ? parseInt(String(offset), 10) : 0,
    });

    res.json(data);
  } catch (err: any) {
    console.error('[API] Erro ao listar eventos do Jira:', err);
    res.status(500).json({ error: err.message || 'Erro ao listar eventos do Jira' });
  }
});

/**
 * GET /api/jira/events/count
 * Retorna contagem de eventos pendentes de revisão
 */
router.get('/jira/events/count', async (req: Request, res: Response) => {
  try {
    const authUser = (req as any).user;
    if (!authUser?.isAdmin && !authUser?.canAccessJira) {
      res.status(403).json({ error: 'Sem permissão.' });
      return;
    }

    const pendingCount = await getPendingEventsCount();
    res.json({ pendingCount });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Erro ao contar pendências do Jira' });
  }
});

/**
 * PUT /api/jira/events/:id/review
 * Marca um evento como revisado
 */
router.put('/jira/events/:id/review', async (req: Request, res: Response) => {
  try {
    const authUser = (req as any).user;
    if (!authUser?.isAdmin && !authUser?.canAccessJira) {
      res.status(403).json({ error: 'Sem permissão.' });
      return;
    }

    const eventId = parseInt(String(req.params.id), 10);
    if (isNaN(eventId)) {
      res.status(400).json({ error: 'ID de evento inválido' });
      return;
    }

    const success = await markEventAsReviewed(eventId, authUser.id);
    if (!success) {
      res.status(404).json({ error: 'Evento não encontrado' });
      return;
    }

    res.json({ success: true, message: 'Evento marcado como revisado com sucesso.' });
  } catch (err: any) {
    console.error('[API] Erro ao revisar evento do Jira:', err);
    res.status(500).json({ error: err.message || 'Erro ao marcar evento como revisado' });
  }
});

/**
 * PUT /api/jira/events/:id/unreview
 * Reverte a revisão de um evento (move de volta para pendente)
 */
router.put('/jira/events/:id/unreview', async (req: Request, res: Response) => {
  try {
    const authUser = (req as any).user;
    if (!authUser?.isAdmin && !authUser?.canAccessJira) {
      res.status(403).json({ error: 'Sem permissão.' });
      return;
    }

    const eventId = parseInt(String(req.params.id), 10);
    if (isNaN(eventId)) {
      res.status(400).json({ error: 'ID de evento inválido' });
      return;
    }

    const success = await unmarkEventAsReviewed(eventId);
    if (!success) {
      res.status(404).json({ error: 'Evento não encontrado' });
      return;
    }

    res.json({ success: true, message: 'Evento retornado para a lista de pendências.' });
  } catch (err: any) {
    console.error('[API] Erro ao reverter revisão:', err);
    res.status(500).json({ error: err.message || 'Erro ao reverter revisão' });
  }
});

/**
 * PUT /api/jira/events/review-all
 * Marca todos os eventos pendentes como revisados
 */
router.put('/jira/events/review-all', async (req: Request, res: Response) => {
  try {
    const authUser = (req as any).user;
    if (!authUser?.isAdmin && !authUser?.canAccessJira) {
      res.status(403).json({ error: 'Sem permissão.' });
      return;
    }

    const { projectKey } = req.body || {};
    const affectedCount = await markAllEventsAsReviewed(projectKey, authUser.id);

    res.json({ success: true, count: affectedCount, message: `${affectedCount} eventos marcados como revisados.` });
  } catch (err: any) {
    console.error('[API] Erro ao marcar todos os eventos como revisados:', err);
    res.status(500).json({ error: err.message || 'Erro ao revisar todos os eventos' });
  }
});

/**
 * POST /api/jira/events/sync
 * Sincroniza eventos recentes via REST API do Jira
 */
router.post('/jira/events/sync', async (req: Request, res: Response) => {
  try {
    const authUser = (req as any).user;
    if (!authUser?.isAdmin && !authUser?.canAccessJira) {
      res.status(403).json({ error: 'Sem permissão.' });
      return;
    }

    const daysBack = parseInt(String(req.body?.daysBack || 1), 10);
    const syncResult = await syncJiraEventsFromRest(isNaN(daysBack) ? 1 : daysBack);

    res.json({ success: true, ...syncResult });
  } catch (err: any) {
    console.error('[API] Erro ao sincronizar eventos do Jira:', err);
    res.status(500).json({ error: err.message || 'Erro ao sincronizar eventos do Jira' });
  }
});

/**
 * GET /api/jira/webhook-info
 * Retorna dados para configuração do Webhook no Jira Cloud
 */
router.get('/jira/webhook-info', async (req: Request, res: Response) => {
  try {
    const authUser = (req as any).user;
    if (!authUser?.isAdmin && !authUser?.canAccessJira) {
      res.status(403).json({ error: 'Sem permissão.' });
      return;
    }

    const config = await getJiraConfig();
    const domain = config.domain.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    const webhookUrl = 'https://taskls.duckdns.org/api/jira/webhook';
    const settingsUrl = `https://${domain}/plugins/servlet/webhooks`;

    res.json({
      webhookUrl,
      settingsUrl,
      projects: config.projects || [],
      recommendedEvents: [
        'jira:issue_created',
        'jira:issue_updated',
        'comment_created',
        'comment_updated',
      ],
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Erro ao obter informações do webhook' });
  }
});



