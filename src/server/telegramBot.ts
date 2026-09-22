import crypto from 'crypto';
import { pool } from './db';

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: {
      id: number;
      first_name?: string;
      username?: string;
    };
    chat: {
      id: number;
      type: string;
      first_name?: string;
      username?: string;
    };
    date: number;
    text?: string;
  };
}

let isTelegramBotRunning = false;
let botAbortController: AbortController | null = null;
let activePollingPromise: Promise<void> | null = null;

/**
 * Obtém o token configurado do bot do Telegram
 */
export async function getTelegramBotToken(): Promise<string | null> {
  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_TOKEN.trim()) {
    return process.env.TELEGRAM_BOT_TOKEN.trim();
  }

  try {
    const res = await pool.query(`SELECT value FROM app_settings WHERE key = 'telegram_config'`);
    if (res.rows.length > 0) {
      const val = res.rows[0].value;
      if (typeof val === 'string') return val;
      if (val && typeof val.token === 'string') return val.token.trim();
    }
  } catch (err) {
    console.warn('[TelegramBot] Erro ao buscar token nas configurações:', err);
  }

  return null;
}

/**
 * Salva o token do Telegram nas configurações e reinicia o serviço
 */
export async function saveTelegramBotToken(token: string): Promise<{ success: boolean; botUsername?: string; error?: string }> {
  const cleanToken = token.trim();
  if (!cleanToken) {
    await pool.query(
      `INSERT INTO app_settings (key, value) VALUES ('telegram_config', '{"token": ""}'::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = '{"token": ""}'::jsonb`
    );
    stopTelegramBotService();
    return { success: true };
  }

  // Testa conexão com a API do Telegram antes de salvar
  const testRes = await testTelegramBotToken(cleanToken);
  if (!testRes.success) {
    return { success: false, error: testRes.error || 'Token inválido na API do Telegram.' };
  }

  await pool.query(
    `INSERT INTO app_settings (key, value) VALUES ('telegram_config', $1)
     ON CONFLICT (key) DO UPDATE SET value = $1`,
    [JSON.stringify({ token: cleanToken, botUsername: testRes.botUsername, updatedAt: new Date().toISOString() })]
  );

  restartTelegramBotService();
  return { success: true, botUsername: testRes.botUsername };
}

/**
 * Testa um token na API do Telegram chamando /getMe
 */
export async function testTelegramBotToken(token: string): Promise<{ success: boolean; botUsername?: string; error?: string }> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token.trim()}/getMe`);
    const data = await res.json();
    if (data.ok && data.result) {
      return { success: true, botUsername: data.result.username };
    }
    return { success: false, error: data.description || 'Token rejeitado pelo Telegram.' };
  } catch (err: any) {
    return { success: false, error: `Falha na conexão: ${err.message}` };
  }
}

/**
 * Envia uma mensagem de texto via Telegram API
 */
export async function sendTelegramMessage(chatId: string | number, text: string, parseMode: 'Markdown' | 'HTML' = 'Markdown'): Promise<boolean> {
  const token = await getTelegramBotToken();
  if (!token) return false;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: parseMode,
      }),
    });

    const data = await res.json();
    return Boolean(data.ok);
  } catch (err) {
    console.error(`[TelegramBot] Falha ao enviar mensagem para chat ${chatId}:`, err);
    return false;
  }
}

/**
 * Trata uma mensagem recebida de um usuário
 */
async function handleTelegramMessage(message: NonNullable<TelegramUpdate['message']>, token: string): Promise<void> {
  const chatId = String(message.chat.id);
  const rawText = message.text?.trim() || '';
  if (!rawText) return;

  // Busca se já existe um usuário do TaskLS vinculado a este chat do Telegram
  const userQuery = await pool.query<{ id: string; username: string }>(
    `SELECT id, username FROM users WHERE telegram_chat_id = $1 LIMIT 1`,
    [chatId]
  );
  const linkedUser = userQuery.rows[0] || null;

  // 1. Comando /start ou /ajuda
  if (rawText.startsWith('/start') || rawText.startsWith('/ajuda') || rawText.startsWith('/help')) {
    if (linkedUser) {
      const welcomeMsg = [
        `👋 Olá, *${linkedUser.username}*!`,
        ``,
        `Sua conta do TaskLS está vinculada e pronta para registrar suas pesagens.`,
        ``,
        `⚖️ *Como registrar pesagem:*`,
        `Basta me enviar uma mensagem como:`,
        `\`Peso: 93,5\``,
        ``,
        `📋 *Outros comandos:*`,
        `• \`/peso\` - Exibe sua última pesagem`,
        `• \`/meta\` - Consulta ou ajusta sua meta (ex: \`/meta 85\`)`,
        `• \`/desvincular\` - Desconecta este chat da sua conta`,
      ].join('\n');
      await sendTelegramMessage(chatId, welcomeMsg);
    } else {
      const introMsg = [
        `👋 Olá! Bem-vindo ao *TaskLS Saúde & Peso Bot*.`,
        ``,
        `Para vincular este chat à sua conta no TaskLS:`,
        `1. Acesse o TaskLS no navegador`,
        `2. Entre no módulo *Saúde & Peso*`,
        `3. Clique em *Bot Telegram* e gere seu código de 6 dígitos`,
        `4. Envie aqui o comando: \`/vincular SEU_CODIGO\``,
        ``,
        `🆔 *Seu Telegram Chat ID:* \`${chatId}\``,
      ].join('\n');
      await sendTelegramMessage(chatId, introMsg);
    }
    return;
  }

  // 2. Comando /vincular <code>
  if (rawText.startsWith('/vincular')) {
    const parts = rawText.split(/\s+/);
    const code = (parts[1] || '').trim().toUpperCase();

    if (!code) {
      await sendTelegramMessage(chatId, `⚠️ Formato incorreto. Use: \`/vincular CÓDIGO\` (ex: \`/vincular 482910\`). Gere o código no painel Saúde do TaskLS.`);
      return;
    }

    const codeQuery = await pool.query<{ user_id: string }>(
      `SELECT user_id FROM health_telegram_codes WHERE code = $1 AND expires_at > NOW()`,
      [code]
    );

    if (codeQuery.rows.length === 0) {
      await sendTelegramMessage(chatId, `❌ Código de vinculação inválido ou expirado. Gere um novo código no módulo Saúde do TaskLS e tente novamente.`);
      return;
    }

    const targetUserId = codeQuery.rows[0].user_id;

    // Vincula o telegram_chat_id ao usuário
    await pool.query(
      `UPDATE users SET telegram_chat_id = $1 WHERE id = $2`,
      [chatId, targetUserId]
    );

    // Remove o código utilizado
    await pool.query(`DELETE FROM health_telegram_codes WHERE code = $1`, [code]);

    const targetUserRes = await pool.query<{ username: string }>(
      `SELECT username FROM users WHERE id = $1`,
      [targetUserId]
    );
    const username = targetUserRes.rows[0]?.username || 'Usuário';

    const successMsg = [
      `✅ *Conta vinculada com sucesso!*`,
      ``,
      `Usuário conectado: *${username}*`,
      ``,
      `Agora você já pode registrar suas pesagens enviando:`,
      `\`Peso: 93,5\``,
    ].join('\n');
    await sendTelegramMessage(chatId, successMsg);
    return;
  }

  // 3. Comando /desvincular
  if (rawText.startsWith('/desvincular')) {
    if (linkedUser) {
      await pool.query(`UPDATE users SET telegram_chat_id = NULL WHERE id = $1`, [linkedUser.id]);
      await sendTelegramMessage(chatId, `Chat desvinculado com sucesso da conta *${linkedUser.username}*.`);
    } else {
      await sendTelegramMessage(chatId, `Este chat não está vinculado a nenhuma conta.`);
    }
    return;
  }

  // 4. Reconhecimento de registro de peso: formato "Peso: 93,5"
  // Aceita: "Peso: 93,5", "Peso: 93.5", "peso 93,5", "Peso: 93,5kg", "93,5", etc.
  const weightRegex = /^(?:peso\s*[:=\s]\s*|peso\s+)?(\d{2,3}(?:[.,]\d{1,2})?)(?:\s*kg)?$/i;
  const match = rawText.match(weightRegex);

  if (match) {
    if (!linkedUser) {
      await sendTelegramMessage(
        chatId,
        `⚠️ Este chat do Telegram ainda não está vinculado a um usuário do TaskLS.\n\nEnvie \`/start\` para ver as instruções de vinculação ou use: \`/vincular SEU_CODIGO\`.`
      );
      return;
    }

    const weightNum = parseFloat(match[1].replace(',', '.'));
    if (isNaN(weightNum) || weightNum < 20 || weightNum > 450) {
      await sendTelegramMessage(chatId, `❌ Peso inválido informado (${match[1]}). Por favor informe um peso válido entre 20kg e 450kg.`);
      return;
    }

    const logDate = message.date ? new Date(message.date * 1000) : new Date();

    // 1. Busca a pesagem anterior mais recente para calcular a diferença
    const prevWeightRes = await pool.query<{ weight: string; logged_at: Date }>(
      `SELECT weight, logged_at FROM health_weight_logs
       WHERE user_id = $1 AND logged_at <= $2
       ORDER BY logged_at DESC LIMIT 1`,
      [linkedUser.id, logDate]
    );

    // 2. Insere a nova pesagem
    const logId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO health_weight_logs (id, user_id, weight, logged_at, source, notes)
       VALUES ($1, $2, $3, $4, 'telegram', $5)`,
      [logId, linkedUser.id, weightNum, logDate, 'Registrado via Telegram Bot']
    );

    // 3. Formata a resposta exata conforme solicitado pelo usuário:
    // "Peso registrado com sucesso. Diferença da última pesagem: xx.xxkg"
    let diffStr: string;
    if (prevWeightRes.rows.length > 0) {
      const prevWeight = parseFloat(prevWeightRes.rows[0].weight);
      const diff = weightNum - prevWeight;
      const diffSign = diff > 0 ? '+' : (diff < 0 ? '-' : '');
      diffStr = `${diffSign}${Math.abs(diff).toFixed(2)}kg`;
    } else {
      diffStr = `0.00kg (Primeira pesagem registrada!)`;
    }

    const replyMsg = `Peso registrado com sucesso. Diferença da última pesagem: ${diffStr}`;
    await sendTelegramMessage(chatId, replyMsg, 'Markdown');
    return;
  }

  // 5. Comando /peso (consulta atual)
  if (rawText.startsWith('/peso')) {
    if (!linkedUser) {
      await sendTelegramMessage(chatId, `⚠️ Chat não vinculado. Envie /start para instruções.`);
      return;
    }

    const latestQuery = await pool.query<{ weight: string; logged_at: Date; source: string }>(
      `SELECT weight, logged_at, source FROM health_weight_logs
       WHERE user_id = $1
       ORDER BY logged_at DESC LIMIT 2`,
      [linkedUser.id]
    );

    if (latestQuery.rows.length === 0) {
      await sendTelegramMessage(chatId, `Você ainda não possui pesagens registradas.\nPara registrar, envie no formato: \`Peso: 93,5\``);
      return;
    }

    const current = latestQuery.rows[0];
    const prev = latestQuery.rows[1];
    let diffInfo = '';
    if (prev) {
      const diff = parseFloat(current.weight) - parseFloat(prev.weight);
      const diffSign = diff > 0 ? '+' : (diff < 0 ? '-' : '');
      diffInfo = `\nVariação da última: *${diffSign}${Math.abs(diff).toFixed(2)}kg*`;
    }

    const dateFormatted = new Date(current.logged_at).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const statusMsg = [
      `⚖️ *Última Pesagem Registrada:*`,
      ``,
      `Peso: *${parseFloat(current.weight).toFixed(2).replace('.', ',')} kg*`,
      `Data/Hora: ${dateFormatted}${diffInfo}`,
    ].join('\n');
    await sendTelegramMessage(chatId, statusMsg);
    return;
  }

  // 6. Comando /meta
  if (rawText.startsWith('/meta')) {
    if (!linkedUser) {
      await sendTelegramMessage(chatId, `⚠️ Chat não vinculado. Envie /start para instruções.`);
      return;
    }

    const parts = rawText.split(/\s+/);
    if (parts.length > 1) {
      const targetVal = parseFloat(parts[1].replace(',', '.'));
      if (isNaN(targetVal) || targetVal < 20 || targetVal > 400) {
        await sendTelegramMessage(chatId, `❌ Valor de meta inválido. Use por exemplo: \`/meta 85\``);
        return;
      }

      await pool.query(
        `INSERT INTO health_goals (user_id, target_weight, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (user_id) DO UPDATE SET target_weight = $2, updated_at = NOW()`,
        [linkedUser.id, targetVal]
      );

      await sendTelegramMessage(chatId, `🎯 Meta de peso atualizada com sucesso para *${targetVal.toFixed(2).replace('.', ',')} kg*!`);
      return;
    }

    const goalRes = await pool.query<{ target_weight: string }>(
      `SELECT target_weight FROM health_goals WHERE user_id = $1`,
      [linkedUser.id]
    );

    if (goalRes.rows.length === 0) {
      await sendTelegramMessage(chatId, `Você ainda não definiu uma meta de peso.\nPara definir, envie: \`/meta 85\` (substitua 85 pelo seu objetivo).`);
    } else {
      const g = parseFloat(goalRes.rows[0].target_weight);
      await sendTelegramMessage(chatId, `🎯 Sua meta atual de peso é *${g.toFixed(2).replace('.', ',')} kg*.\nPara alterar, envie: \`/meta <novo_peso>\``);
    }
    return;
  }

  // Mensagem não reconhecida
  if (linkedUser) {
    await sendTelegramMessage(
      chatId,
      `❓ Não entendi essa mensagem.\n\nPara registrar sua pesagem, envie no formato:\n\`Peso: 93,5\`\n\nOutros comandos: \`/peso\`, \`/meta\`, \`/ajuda\`.`
    );
  } else {
    await sendTelegramMessage(
      chatId,
      `👋 Olá! Envie \`/start\` para ver as instruções de como vincular sua conta ao TaskLS.`
    );
  }
}

/**
 * Loop principal de long-polling do Telegram Bot
 */
async function runTelegramPolling(token: string, signal: AbortSignal): Promise<void> {
  let lastUpdateId = 0;
  console.log('[TelegramBot] Motor de Long Polling do Telegram iniciado.');

  while (isTelegramBotRunning && !signal.aborted) {
    try {
      const url = `https://api.telegram.org/bot${token}/getUpdates?offset=${lastUpdateId + 1}&timeout=25`;
      const res = await fetch(url, { signal });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        console.warn('[TelegramBot] Erro retornado pela API do Telegram:', errJson);
        // Aguarda 5 segundos antes de tentar novamente se houver erro da API (ex: 409 conflito, 401 token inválido)
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }

      const data = await res.json();
      if (data.ok && Array.isArray(data.result)) {
        for (const update of data.result) {
          lastUpdateId = Math.max(lastUpdateId, update.update_id);
          if (update.message) {
            handleTelegramMessage(update.message, token).catch((err) => {
              console.error('[TelegramBot] Erro ao processar mensagem do Telegram:', err);
            });
          }
        }
      }
    } catch (err: any) {
      if (signal.aborted) break;
      // Erros comuns de rede ou timeout
      if (err.name !== 'AbortError') {
        console.warn('[TelegramBot] Falha no polling do Telegram (reconectando em 5s):', err.message || err);
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  }

  console.log('[TelegramBot] Motor de Long Polling do Telegram finalizado.');
}

/**
 * Inicia o serviço do Telegram Bot
 */
export async function startTelegramBotService(): Promise<void> {
  if (isTelegramBotRunning) return;

  const token = await getTelegramBotToken();
  if (!token) {
    console.log('[TelegramBot] Nenhum Token do Telegram configurado. O bot iniciará automaticamente quando o token for salvo.');
    return;
  }

  // Valida o token
  const testRes = await testTelegramBotToken(token);
  if (!testRes.success) {
    console.warn(`[TelegramBot] Não foi possível iniciar o bot com o token fornecido: ${testRes.error}`);
    return;
  }

  console.log(`[TelegramBot] Conectado ao bot @${testRes.botUsername} com sucesso!`);
  isTelegramBotRunning = true;
  botAbortController = new AbortController();

  activePollingPromise = runTelegramPolling(token, botAbortController.signal).finally(() => {
    isTelegramBotRunning = false;
    botAbortController = null;
    activePollingPromise = null;
  });
}

/**
 * Para o serviço do Telegram Bot
 */
export function stopTelegramBotService(): void {
  if (botAbortController) {
    botAbortController.abort();
    botAbortController = null;
  }
  isTelegramBotRunning = false;
  console.log('[TelegramBot] Serviço do Telegram Bot parado.');
}

/**
 * Reinicia o serviço do Telegram Bot
 */
export async function restartTelegramBotService(): Promise<void> {
  stopTelegramBotService();
  // Aguarda 1 segundo para liberação do ciclo de polling anterior
  await new Promise((r) => setTimeout(r, 1000));
  await startTelegramBotService();
}
