import { format, subMinutes } from 'date-fns';
import { pool } from './db';
import { isTaskOccurringOnDate, TaskRecord } from './recurrence';
import { sendWindowsNotification } from './notifier';

let schedulerInterval: NodeJS.Timeout | null = null;
let isChecking = false;

export async function checkAndSendNotifications(): Promise<void> {
  if (isChecking) return;
  isChecking = true;

  try {
    const now = new Date();
    const currentDateStr = format(now, 'yyyy-MM-dd');
    const currentTimeStr = format(now, 'HH:mm');
    const prevMinuteStr = format(subMinutes(now, 1), 'HH:mm');

    // Check global Do Not Disturb (DND) mode
    const dndRes = await pool.query<{ value: { enabled: boolean; until: string | null } }>(
      `SELECT value FROM app_settings WHERE key = 'dnd' LIMIT 1`
    );
    if (dndRes.rows.length > 0) {
      const dnd = dndRes.rows[0].value;
      if (dnd.enabled) {
        if (!dnd.until || new Date(dnd.until) > now) {
          // DND is active, suppress notifications
          return;
        } else {
          // Expired DND, reset
          await pool.query(
            `UPDATE app_settings SET value = '{"enabled": false, "until": null}'::jsonb WHERE key = 'dnd'`
          );
        }
      }
    }

    // Find all tasks that have at least one notification time configured OR a pending snooze
    const tasksRes = await pool.query<TaskRecord>(`
      SELECT * FROM tasks
      WHERE (notification_times IS NOT NULL AND array_length(notification_times, 1) > 0)
         OR snoozed_until IS NOT NULL
    `);

    for (const task of tasksRes.rows) {
      let isSnoozeTrigger = false;

      // Handle Snooze
      if (task.snoozed_until) {
        const snoozeDate = new Date(task.snoozed_until);
        if (snoozeDate > now) {
          // Currently snoozed into future, do not trigger normal notification
          continue;
        } else {
          // Snooze expired just now -> trigger alert and clear snooze
          isSnoozeTrigger = true;
          await pool.query(`UPDATE tasks SET snoozed_until = NULL WHERE id = $1`, [task.id]);
        }
      }

      // 1. Check if the task applies to today
      const occursToday = isTaskOccurringOnDate(task, now) || task.type === 'none';
      if (!occursToday) {
        continue;
      }

      // 2. Check if the task is marked as completed
      if (task.type === 'once' || task.type === 'none') {
        if (task.is_completed) {
          continue; // Task already marked complete
        }
      } else {
        // For weekly or monthly tasks, check task_completions for today's date
        const completionRes = await pool.query(
          `SELECT 1 FROM task_completions WHERE task_id = $1 AND completion_date = $2 LIMIT 1`,
          [task.id, currentDateStr]
        );
        if (completionRes.rowCount && completionRes.rowCount > 0) {
          continue; // Already completed for today's occurrence!
        }
      }

      // 3. Find target times to check (current minute or 1-minute grace period to prevent missing by seconds)
      const timesToCheck: string[] = isSnoozeTrigger
        ? [currentTimeStr]
        : (task.notification_times || []).filter((t) => t === currentTimeStr || t === prevMinuteStr);

      if (timesToCheck.length === 0) {
        continue;
      }

      for (const targetTime of timesToCheck) {
        // Check if already notified for this exact time and date
        const alreadySentRes = await pool.query(
          `SELECT 1 FROM task_notifications_sent
           WHERE task_id = $1 AND target_date = $2 AND notification_time = $3
           LIMIT 1`,
          [task.id, currentDateStr, targetTime]
        );

        if (alreadySentRes.rowCount && alreadySentRes.rowCount > 0) {
          continue; // Already notified
        }

        // Send Windows native toast notification
        const priorityLabel = task.priority === 'urgent' ? '🚨 [URGENTE] ' : task.priority === 'high' ? '⚠️ [ALTA] ' : '';
        const categoryLabel = task.category ? `[${task.category}] ` : '';
        const notifTitle = `${priorityLabel}${categoryLabel}${task.title}`;
        const notifBody = task.description?.trim()
          ? task.description
          : `Horário agendado: ${targetTime}. Não se esqueça de concluir!`;

        await sendWindowsNotification(notifTitle, notifBody, task.id, task.user_id);

        // Record sent notification
        await pool.query(
          `INSERT INTO task_notifications_sent (task_id, target_date, notification_time)
           VALUES ($1, $2, $3)
           ON CONFLICT (task_id, target_date, notification_time) DO NOTHING`,
          [task.id, currentDateStr, targetTime]
        );
      }
    }
  } catch (err) {
    console.error('[Scheduler] Erro durante verificação de notificações:', err);
  } finally {
    isChecking = false;
  }
}

export function startScheduler(intervalMs: number = 30000): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
  }

  console.log(`[Scheduler] Motor de notificações iniciado (intervalo: ${intervalMs / 1000}s).`);
  // Run an immediate check on startup
  checkAndSendNotifications().catch(() => {});

  schedulerInterval = setInterval(() => {
    checkAndSendNotifications().catch(() => {});
  }, intervalMs);
}

export function stopScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('[Scheduler] Motor de notificações parado.');
  }
}
