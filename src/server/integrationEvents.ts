import { pool } from './db';
import {
  getGoogleChatConfig,
  fetchGoogleChatMessages,
  GoogleChatConfig,
  GoogleChatSpaceConfig,
} from './googleChat';
import { parseGoogleChatMessage, ParsedIntegrationMessage } from './integrationParser';

export interface IntegrationReviewEventRow {
  id: number;
  message_id: string;
  space_id: string;
  space_name: string | null;
  sender_name: string | null;
  sender_avatar: string | null;
  header_title: string | null;
  header_subtitle: string | null;
  summary: string;
  raw_message: any;
  parsed_data: any;
  event_time: string;
  is_reviewed: boolean;
  reviewed_at: string | null;
  reviewed_by: string | null;
  created_at: string;
}

/**
 * Salva um evento de integração no banco com desduplicação por message_id
 */
export async function saveIntegrationEvent(
  parsed: ParsedIntegrationMessage,
  spaceName?: string
): Promise<{ isNew: boolean; id?: number }> {
  const query = `
    INSERT INTO integration_review_events (
      message_id, space_id, space_name, sender_name, sender_avatar,
      header_title, header_subtitle, summary, raw_message, parsed_data,
      event_time, is_reviewed, created_at
    ) VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8, $9, $10,
      $11, FALSE, NOW()
    )
    ON CONFLICT (message_id) DO UPDATE SET
      space_name = COALESCE(EXCLUDED.space_name, integration_review_events.space_name),
      summary = EXCLUDED.summary,
      parsed_data = EXCLUDED.parsed_data
    WHERE integration_review_events.is_reviewed = FALSE
    RETURNING id, (xmax = 0) AS is_new_insert
  `;

  const values = [
    parsed.messageId,
    parsed.spaceId,
    spaceName || parsed.spaceId,
    parsed.senderName,
    parsed.senderAvatar || null,
    parsed.headerTitle,
    parsed.headerSubtitle,
    parsed.summary,
    JSON.stringify({ rawText: parsed.rawText }),
    JSON.stringify({
      items: parsed.items,
      details: parsed.details,
      sections: parsed.sections,
      severity: parsed.severity,
      category: parsed.category,
      httpCode: parsed.httpCode,
      operation: parsed.operation,
      campaign: parsed.campaign,
      rawText: parsed.rawText,
    }),
    parsed.eventTime,
  ];

  const res = await pool.query(query, values);
  if (res.rows.length === 0) {
    return { isNew: false };
  }

  return {
    isNew: res.rows[0].is_new_insert === true,
    id: res.rows[0].id,
  };
}

/**
 * Processa payload recebido via Webhook público do Google Chat ou serviço externo
 */
export async function processIntegrationWebhook(
  payload: any
): Promise<{ processed: number; isNew: boolean; eventId?: number }> {
  if (!payload || typeof payload !== 'object') {
    return { processed: 0, isNew: false };
  }

  const config = await getGoogleChatConfig();

  // Pode vir em formato Google Chat bot event { type: "MESSAGE", message: { ... }, space: { ... } }
  // Ou diretamente como mensagem { cardsV2: [...], text: "..." }
  const rawMsg = payload.message || payload;
  const spaceInfo = payload.space || {};
  const spaceId = spaceInfo.name || rawMsg.space?.name || 'spaces/webhook';
  const spaceName = spaceInfo.displayName || 'Webhook Externo';

  const parsed = parseGoogleChatMessage(rawMsg, spaceId, config);
  if (!parsed || !parsed.shouldInclude) {
    return { processed: 0, isNew: false };
  }

  const result = await saveIntegrationEvent(parsed, spaceName);
  return {
    processed: 1,
    isNew: result.isNew,
    eventId: result.id,
  };
}

/**
 * Sincroniza mensagens dos grupos configurados do Google Chat via API REST
 */
export async function syncGoogleChatMessages(): Promise<{
  totalFetched: number;
  newEventsSaved: number;
  spacesChecked: number;
  errors: string[];
}> {
  const config = await getGoogleChatConfig();
  if (!config.service_account_key || !config.spaces || config.spaces.length === 0) {
    return {
      totalFetched: 0,
      newEventsSaved: 0,
      spacesChecked: 0,
      errors: ['Nenhuma chave de Service Account ou grupo configurado no Google Chat.'],
    };
  }

  let totalFetched = 0;
  let newEventsSaved = 0;
  let spacesChecked = 0;
  const errors: string[] = [];

  for (const space of config.spaces) {
    if (!space.id || !space.id.trim()) continue;

    try {
      spacesChecked++;
      const messages = await fetchGoogleChatMessages(space.id, 50);
      totalFetched += messages.length;

      for (const msg of messages) {
        try {
          const parsed = parseGoogleChatMessage(msg, space.id, config);
          if (!parsed) continue;

          // Se passar no filtro de alertas/erros
          if (parsed.shouldInclude) {
            const saved = await saveIntegrationEvent(parsed, space.name || space.id);
            if (saved.isNew) {
              newEventsSaved++;
            }
          }
        } catch (msgErr: any) {
          console.error(`[GoogleChat Sync] Erro ao processar mensagem individual em ${space.id}:`, msgErr);
        }
      }
    } catch (spaceErr: any) {
      const errMsg = `Falha ao sincronizar espaço ${space.name || space.id}: ${spaceErr.message}`;
      console.error(`[GoogleChat Sync] ${errMsg}`);
      errors.push(errMsg);
    }
  }

  return {
    totalFetched,
    newEventsSaved,
    spacesChecked,
    errors,
  };
}

/**
 * Retorna lista paginada e filtrada de eventos de integração
 */
export async function listIntegrationEvents(params: {
  status?: 'pending' | 'reviewed';
  sender?: string;
  spaceId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{
  events: any[];
  totalPending: number;
  totalReviewed: number;
  total: number;
  availableSenders: string[];
  availableSpaces: Array<{ id: string; name: string }>;
}> {
  const status = params.status || 'pending';
  const limit = Math.min(params.limit || 100, 200);
  const offset = params.offset || 0;

  // Contadores globais
  const countsRes = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE is_reviewed = FALSE) AS pending_count,
      COUNT(*) FILTER (WHERE is_reviewed = TRUE) AS reviewed_count,
      COUNT(*) AS total_count
    FROM integration_review_events
  `);
  const totalPending = parseInt(countsRes.rows[0]?.pending_count || '0', 10);
  const totalReviewed = parseInt(countsRes.rows[0]?.reviewed_count || '0', 10);
  const total = parseInt(countsRes.rows[0]?.total_count || '0', 10);

  // Remetentes distintos
  const sendersRes = await pool.query(`
    SELECT DISTINCT sender_name
    FROM integration_review_events
    WHERE sender_name IS NOT NULL AND sender_name != ''
    ORDER BY sender_name ASC
  `);
  const availableSenders = sendersRes.rows.map((r) => r.sender_name);

  // Espaços distintos
  const spacesRes = await pool.query(`
    SELECT DISTINCT space_id, COALESCE(space_name, space_id) as space_name
    FROM integration_review_events
    WHERE space_id IS NOT NULL AND space_id != ''
    ORDER BY space_name ASC
  `);
  const availableSpaces = spacesRes.rows.map((r) => ({ id: r.space_id, name: r.space_name }));

  // Cláusulas WHERE dinâmicas
  const whereClauses: string[] = [];
  const values: any[] = [];
  let paramIdx = 1;

  if (status === 'pending') {
    whereClauses.push(`is_reviewed = FALSE`);
  } else if (status === 'reviewed') {
    whereClauses.push(`is_reviewed = TRUE`);
  }

  if (params.sender && params.sender !== 'all') {
    whereClauses.push(`LOWER(sender_name) = LOWER($${paramIdx})`);
    values.push(params.sender);
    paramIdx++;
  }

  if (params.spaceId && params.spaceId !== 'all') {
    whereClauses.push(`space_id = $${paramIdx}`);
    values.push(params.spaceId);
    paramIdx++;
  }

  if (params.search && params.search.trim()) {
    const term = `%${params.search.trim().toLowerCase()}%`;
    whereClauses.push(`(
      LOWER(summary) LIKE $${paramIdx} OR
      LOWER(header_title) LIKE $${paramIdx} OR
      LOWER(header_subtitle) LIKE $${paramIdx} OR
      LOWER(parsed_data::text) LIKE $${paramIdx}
    )`);
    values.push(term);
    paramIdx++;
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
  const query = `
    SELECT
      id,
      message_id AS "messageId",
      space_id AS "spaceId",
      space_name AS "spaceName",
      sender_name AS "senderName",
      sender_avatar AS "senderAvatar",
      header_title AS "headerTitle",
      header_subtitle AS "headerSubtitle",
      summary,
      raw_message AS "rawMessage",
      parsed_data AS "parsedData",
      event_time AS "eventTime",
      is_reviewed AS "isReviewed",
      reviewed_at AS "reviewedAt",
      reviewed_by AS "reviewedBy",
      created_at AS "createdAt"
    FROM integration_review_events
    ${whereSql}
    ORDER BY event_time DESC
    LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
  `;
  values.push(limit, offset);

  const res = await pool.query(query, values);

  return {
    events: res.rows,
    totalPending,
    totalReviewed,
    total,
    availableSenders,
    availableSpaces,
  };
}

/**
 * Retorna contagem rápida de pendências
 */
export async function getPendingIntegrationCount(): Promise<number> {
  const res = await pool.query(`SELECT COUNT(*) FROM integration_review_events WHERE is_reviewed = FALSE`);
  return parseInt(res.rows[0]?.count || '0', 10);
}

/**
 * Marca um evento como revisado
 */
export async function markIntegrationEventAsReviewed(id: number, userId?: string): Promise<boolean> {
  const res = await pool.query(
    `UPDATE integration_review_events
     SET is_reviewed = TRUE, reviewed_at = NOW(), reviewed_by = $1
     WHERE id = $2 AND is_reviewed = FALSE`,
    [userId || null, id]
  );
  return (res.rowCount ?? 0) > 0;
}

/**
 * Desmarca revisão de um evento (retorna para pendente)
 */
export async function unmarkIntegrationEventAsReviewed(id: number): Promise<boolean> {
  const res = await pool.query(
    `UPDATE integration_review_events
     SET is_reviewed = FALSE, reviewed_at = NULL, reviewed_by = NULL
     WHERE id = $1 AND is_reviewed = TRUE`,
    [id]
  );
  return (res.rowCount ?? 0) > 0;
}

/**
 * Marca lote de eventos como revisados
 */
export async function markBatchIntegrationEventsAsReviewed(ids: number[], userId?: string): Promise<number> {
  if (!ids || ids.length === 0) return 0;
  const res = await pool.query(
    `UPDATE integration_review_events
     SET is_reviewed = TRUE, reviewed_at = NOW(), reviewed_by = $1
     WHERE id = ANY($2::int[]) AND is_reviewed = FALSE`,
    [userId || null, ids]
  );
  return res.rowCount || 0;
}

/**
 * Desmarca lote de eventos (retorna para pendentes)
 */
export async function unmarkBatchIntegrationEventsAsReviewed(ids: number[]): Promise<number> {
  if (!ids || ids.length === 0) return 0;
  const res = await pool.query(
    `UPDATE integration_review_events
     SET is_reviewed = FALSE, reviewed_at = NULL, reviewed_by = NULL
     WHERE id = ANY($1::int[]) AND is_reviewed = TRUE`,
    [ids]
  );
  return res.rowCount || 0;
}

/**
 * Marca todos os eventos pendentes como revisados
 */
export async function markAllIntegrationEventsAsReviewed(userId?: string): Promise<number> {
  const res = await pool.query(
    `UPDATE integration_review_events
     SET is_reviewed = TRUE, reviewed_at = NOW(), reviewed_by = $1
     WHERE is_reviewed = FALSE`,
    [userId || null]
  );
  return res.rowCount || 0;
}

// Scheduler de sincronização em segundo plano
let syncIntervalHandle: NodeJS.Timeout | null = null;

export function startIntegrationSyncScheduler(): void {
  if (syncIntervalHandle) return;

  const runSync = async () => {
    try {
      const config = await getGoogleChatConfig();
      if (!config.auto_sync_enabled || !config.service_account_key || config.spaces.length === 0) {
        return;
      }
      const res = await syncGoogleChatMessages();
      if (res.newEventsSaved > 0) {
        console.log(`[GoogleChat Scheduler] ${res.newEventsSaved} novos erros de integração sincronizados.`);
      }
    } catch (err: any) {
      console.error('[GoogleChat Scheduler] Erro no agendamento:', err.message);
    }
  };

  // Primeira execução após 30 segundos do início
  setTimeout(runSync, 30000);

  // Execuções periódicas a cada 5 minutos (300.000 ms)
  syncIntervalHandle = setInterval(runSync, 5 * 60 * 1000);
  console.log('[GoogleChat Scheduler] Agendador de sincronização em segundo plano iniciado (5 min).');
}

export function stopIntegrationSyncScheduler(): void {
  if (syncIntervalHandle) {
    clearInterval(syncIntervalHandle);
    syncIntervalHandle = null;
    console.log('[GoogleChat Scheduler] Agendador encerrado.');
  }
}
