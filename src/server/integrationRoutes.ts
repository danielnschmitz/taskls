import { Router, Request, Response } from 'express';
import {
  getGoogleChatConfig,
  saveGoogleChatConfig,
  testGoogleChatConnection,
} from './googleChat';
import {
  listIntegrationEvents,
  getPendingIntegrationCount,
  markIntegrationEventAsReviewed,
  unmarkIntegrationEventAsReviewed,
  markBatchIntegrationEventsAsReviewed,
  unmarkBatchIntegrationEventsAsReviewed,
  markAllIntegrationEventsAsReviewed,
  syncGoogleChatMessages,
  processIntegrationWebhook,
} from './integrationEvents';
import { requireAdmin } from './auth';

export const integrationRoutes = Router();

/**
 * GET /api/integrations/events
 * Retorna lista de eventos com paginação e filtros
 */
integrationRoutes.get('/events', async (req: Request, res: Response) => {
  try {
    const { status, sender, spaceId, search, limit, offset } = req.query;

    const result = await listIntegrationEvents({
      status: (status as 'pending' | 'reviewed') || 'pending',
      sender: sender ? String(sender) : undefined,
      spaceId: spaceId ? String(spaceId) : undefined,
      search: search ? String(search) : undefined,
      limit: limit ? parseInt(String(limit), 10) : 100,
      offset: offset ? parseInt(String(offset), 10) : 0,
    });

    res.json(result);
  } catch (err: any) {
    console.error('[API] Erro ao listar eventos de integração:', err);
    res.status(500).json({ error: 'Erro ao listar eventos de integração' });
  }
});

/**
 * GET /api/integrations/pending-count
 * Retorna apenas o contador de pendências
 */
integrationRoutes.get('/pending-count', async (req: Request, res: Response) => {
  try {
    const count = await getPendingIntegrationCount();
    res.json({ pendingCount: count });
  } catch (err: any) {
    console.error('[API] Erro ao obter contagem de pendências de integração:', err);
    res.status(500).json({ error: 'Erro ao obter contagem de pendências' });
  }
});

/**
 * PUT /api/integrations/events/:id/review
 * Marca um evento como revisado
 */
integrationRoutes.put('/events/:id/review', async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const authUser = (req as any).user;

    const ok = await markIntegrationEventAsReviewed(id, authUser?.id);
    if (!ok) {
      res.status(404).json({ error: 'Evento não encontrado ou já revisado' });
      return;
    }

    res.json({ success: true, message: 'Evento marcado como revisado' });
  } catch (err: any) {
    console.error('[API] Erro ao revisar evento:', err);
    res.status(500).json({ error: 'Erro ao revisar evento' });
  }
});

/**
 * PUT /api/integrations/events/:id/unreview
 * Desmarca revisão de um evento (retorna para pendente)
 */
integrationRoutes.put('/events/:id/unreview', async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);

    const ok = await unmarkIntegrationEventAsReviewed(id);
    if (!ok) {
      res.status(404).json({ error: 'Evento não encontrado ou já pendente' });
      return;
    }

    res.json({ success: true, message: 'Evento retornado para pendentes' });
  } catch (err: any) {
    console.error('[API] Erro ao desmarcar revisão do evento:', err);
    res.status(500).json({ error: 'Erro ao desmarcar revisão' });
  }
});

/**
 * PUT /api/integrations/events/review-batch
 * Marca um lote de IDs como revisados
 */
integrationRoutes.put('/events/review-batch', async (req: Request, res: Response) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: 'Lista de IDs inválida' });
      return;
    }

    const authUser = (req as any).user;
    const count = await markBatchIntegrationEventsAsReviewed(ids, authUser?.id);
    res.json({ success: true, count });
  } catch (err: any) {
    console.error('[API] Erro ao revisar lote:', err);
    res.status(500).json({ error: 'Erro ao revisar lote' });
  }
});

/**
 * PUT /api/integrations/events/unreview-batch
 * Retorna um lote de IDs para pendentes
 */
integrationRoutes.put('/events/unreview-batch', async (req: Request, res: Response) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: 'Lista de IDs inválida' });
      return;
    }

    const count = await unmarkBatchIntegrationEventsAsReviewed(ids);
    res.json({ success: true, count });
  } catch (err: any) {
    console.error('[API] Erro ao reverter lote:', err);
    res.status(500).json({ error: 'Erro ao reverter lote' });
  }
});

/**
 * PUT /api/integrations/events/review-all
 * Marca todos os eventos pendentes como revisados
 */
integrationRoutes.put('/events/review-all', async (req: Request, res: Response) => {
  try {
    const authUser = (req as any).user;
    const count = await markAllIntegrationEventsAsReviewed(authUser?.id);
    res.json({ success: true, count });
  } catch (err: any) {
    console.error('[API] Erro ao revisar todos os eventos:', err);
    res.status(500).json({ error: 'Erro ao revisar todos os eventos' });
  }
});

/**
 * POST /api/integrations/sync
 * Força sincronização imediata com os grupos do Google Chat
 */
integrationRoutes.post('/sync', async (req: Request, res: Response) => {
  try {
    const result = await syncGoogleChatMessages();
    const pendingCount = await getPendingIntegrationCount();

    res.json({
      success: true,
      ...result,
      pendingCount,
    });
  } catch (err: any) {
    console.error('[API] Erro ao disparar sincronização do Google Chat:', err);
    res.status(500).json({ error: err.message || 'Erro ao sincronizar com Google Chat' });
  }
});

/**
 * GET /api/integrations/settings
 * Retorna as configurações do Google Chat (admin)
 */
integrationRoutes.get('/settings', requireAdmin, async (req: Request, res: Response) => {
  try {
    const config = await getGoogleChatConfig();
    let serviceAccountEmail: string | undefined;

    if (config.service_account_key) {
      try {
        const parsed = JSON.parse(config.service_account_key);
        serviceAccountEmail = parsed.client_email;
      } catch {}
    }

    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.get('host') || 'localhost:3333';
    const webhookUrl = `${proto}://${host}/api/integrations/webhook`;

    res.json({
      hasServiceAccount: Boolean(config.service_account_key && config.service_account_key.trim()),
      serviceAccountEmail,
      spaces: config.spaces,
      pollIntervalMinutes: config.poll_interval_minutes,
      autoSyncEnabled: config.auto_sync_enabled,
      filterMode: config.filter_mode,
      filterKeywords: config.filter_keywords,
      ignoredKeywords: config.ignored_keywords,
      ignoredSenders: config.ignored_senders,
      webhookUrl,
    });
  } catch (err: any) {
    console.error('[API] Erro ao buscar configurações de integração:', err);
    res.status(500).json({ error: 'Erro ao buscar configurações' });
  }
});

/**
 * PUT /api/integrations/settings
 * Atualiza configurações do Google Chat (admin)
 */
integrationRoutes.put('/settings', requireAdmin, async (req: Request, res: Response) => {
  try {
    const {
      service_account_key,
      spaces,
      poll_interval_minutes,
      auto_sync_enabled,
      filter_mode,
      filter_keywords,
      ignored_keywords,
      ignored_senders,
    } = req.body;

    const updated = await saveGoogleChatConfig({
      ...(service_account_key !== undefined && { service_account_key }),
      ...(spaces !== undefined && { spaces }),
      ...(poll_interval_minutes !== undefined && { poll_interval_minutes }),
      ...(auto_sync_enabled !== undefined && { auto_sync_enabled }),
      ...(filter_mode !== undefined && { filter_mode }),
      ...(filter_keywords !== undefined && { filter_keywords }),
      ...(ignored_keywords !== undefined && { ignored_keywords }),
      ...(ignored_senders !== undefined && { ignored_senders }),
    });

    res.json({
      success: true,
      message: 'Configurações de integração salvas com sucesso!',
      spaces: updated.spaces,
      hasServiceAccount: Boolean(updated.service_account_key),
    });
  } catch (err: any) {
    console.error('[API] Erro ao salvar configurações:', err);
    res.status(500).json({ error: err.message || 'Erro ao salvar configurações' });
  }
});

/**
 * POST /api/integrations/test-connection
 * Testa a conexão com a Service Account e grupo do Google Chat (admin)
 */
integrationRoutes.post('/test-connection', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { service_account_key, test_space_id } = req.body;
    const result = await testGoogleChatConnection(service_account_key, test_space_id);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/integrations/webhook-info
 * Informações e URL de webhook para integração
 */
integrationRoutes.get('/webhook-info', async (req: Request, res: Response) => {
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.get('host') || 'localhost:3333';
  const webhookUrl = `${proto}://${host}/api/integrations/webhook`;

  res.json({
    webhookUrl,
    instructions:
      'Envie requisições HTTP POST para esta URL contendo o payload do Google Chat (bot message) ou cards JSON.',
  });
});
