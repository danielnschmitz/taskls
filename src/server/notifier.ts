import { pool } from './db';

/**
 * Enfileira uma notificação para ser disparada pelo navegador do usuário.
 * Não utiliza mais PowerShell ou processos do sistema operacional do servidor,
 * permitindo que a aplicação seja hospedada na nuvem/Linux e notifique qualquer navegador.
 */
export async function queueNotification(
  title: string,
  message: string,
  taskId?: string
): Promise<boolean> {
  try {
    const cleanTitle = title || 'TaskLS - Lembrete';
    const cleanMessage = message || 'Você tem uma tarefa agendada!';

    await pool.query(
      `INSERT INTO notification_queue (title, message, task_id)
       VALUES ($1, $2, $3)`,
      [cleanTitle, cleanMessage, taskId || null]
    );

    console.log(`[Notifier] Notificação enfileirada para o navegador: "${cleanTitle}"`);
    return true;
  } catch (err) {
    console.error('[Notifier] Falha ao enfileirar notificação para o navegador:', err);
    return false;
  }
}

/**
 * Alias para manter compatibilidade com códigos legados
 */
export const sendWindowsNotification = queueNotification;
