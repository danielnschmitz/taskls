import { pool } from './db';

export interface WahaConfig {
  baseUrl: string;
  apiKey: string;
  session: string;
  defaultGroupId: string;
  defaultGroupName?: string;
  jiraAuthorName: string;
}

export interface WahaTemplate {
  id: string;
  name: string;
  content: string;
  isDefault?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WahaGroup {
  id: string;
  name: string;
}

export const DEFAULT_WAHA_CONFIG: WahaConfig = {
  baseUrl: process.env.WAHA_BASE_URL || 'http://localhost:3000',
  apiKey: process.env.WAHA_API_KEY || '',
  session: process.env.WAHA_SESSION || 'default',
  defaultGroupId: process.env.WAHA_DEFAULT_GROUP_ID || '',
  defaultGroupName: '',
  jiraAuthorName: '',
};

export const DEFAULT_WAHA_TEMPLATES: WahaTemplate[] = [
  {
    id: 'tpl-neo-update',
    name: 'Atualização de Card NEO',
    isDefault: true,
    content: `*Atualização no Card {{issueKey}}*
📋 *Título:* {{summary}}
🏭 *Indústria:* {{industry}}
📐 *Layout:* {{layout}}
📌 *Status atual:* {{status}}

🔄 *Alterações realizadas:*
{{changes}}

🔗 {{url}}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'tpl-neo-compact',
    name: 'Resumo Rápido',
    isDefault: false,
    content: `✅ *{{issueKey}}* — {{summary}}
📌 Status: *{{status}}*
{{changes}}
🔗 {{url}}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const MASKED_KEY = '********';

function normalizeBaseUrl(url: string): string {
  return (url || '').trim().replace(/\/+$/, '');
}

function buildWahaHeaders(apiKey?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (apiKey && apiKey.trim()) {
    headers['X-Api-Key'] = apiKey.trim();
  }
  return headers;
}

/**
 * Obtém a configuração do WAHA salva no PostgreSQL
 */
export async function getWahaConfig(maskApiKey = false): Promise<WahaConfig & { hasApiKey?: boolean }> {
  try {
    const res = await pool.query(`SELECT value FROM app_settings WHERE key = 'waha_config'`);
    if (res.rows.length > 0 && res.rows[0].value) {
      const saved = res.rows[0].value as Partial<WahaConfig>;
      const merged: WahaConfig = {
        ...DEFAULT_WAHA_CONFIG,
        ...saved,
        baseUrl: normalizeBaseUrl(saved.baseUrl || DEFAULT_WAHA_CONFIG.baseUrl),
        session: (saved.session || DEFAULT_WAHA_CONFIG.session || 'default').trim(),
      };
      if (maskApiKey) {
        return {
          ...merged,
          hasApiKey: Boolean(merged.apiKey && merged.apiKey.trim()),
          apiKey: merged.apiKey ? MASKED_KEY : '',
        };
      }
      return merged;
    }
  } catch (err) {
    console.warn('[WAHA] Erro ao ler configuração do banco:', err);
  }

  if (maskApiKey) {
    return {
      ...DEFAULT_WAHA_CONFIG,
      hasApiKey: Boolean(DEFAULT_WAHA_CONFIG.apiKey),
      apiKey: DEFAULT_WAHA_CONFIG.apiKey ? MASKED_KEY : '',
    };
  }
  return { ...DEFAULT_WAHA_CONFIG };
}

/**
 * Salva a configuração do WAHA no PostgreSQL
 */
export async function saveWahaConfig(partial: Partial<WahaConfig>): Promise<WahaConfig & { hasApiKey: boolean }> {
  const current = await getWahaConfig(false);

  const nextApiKey =
    partial.apiKey === undefined || partial.apiKey === MASKED_KEY || partial.apiKey === ''
      ? partial.apiKey === '' && partial.hasOwnProperty('apiKey') && !current.apiKey
        ? ''
        : current.apiKey
      : partial.apiKey.trim();

  const updated: WahaConfig = {
    baseUrl: normalizeBaseUrl(partial.baseUrl ?? current.baseUrl),
    apiKey: nextApiKey,
    session: (partial.session ?? current.session ?? 'default').trim() || 'default',
    defaultGroupId: (partial.defaultGroupId ?? current.defaultGroupId ?? '').trim(),
    defaultGroupName: (partial.defaultGroupName ?? current.defaultGroupName ?? '').trim(),
    jiraAuthorName: (partial.jiraAuthorName ?? current.jiraAuthorName ?? '').trim(),
  };

  await pool.query(
    `INSERT INTO app_settings (key, value) VALUES ('waha_config', $1::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [JSON.stringify(updated)]
  );

  return {
    ...updated,
    hasApiKey: Boolean(updated.apiKey),
    apiKey: updated.apiKey ? MASKED_KEY : '',
  };
}

/**
 * Testa a conexão com o servidor WAHA e verifica o status da sessão
 */
export async function testWahaConnection(override?: Partial<WahaConfig>): Promise<{
  success: boolean;
  status?: string;
  message: string;
}> {
  const saved = await getWahaConfig(false);
  const baseUrl = normalizeBaseUrl(override?.baseUrl || saved.baseUrl);
  const session = (override?.session || saved.session || 'default').trim();
  const apiKey =
    override?.apiKey && override.apiKey !== MASKED_KEY ? override.apiKey.trim() : saved.apiKey;

  if (!baseUrl) {
    return { success: false, message: 'Informe a URL do servidor WAHA.' };
  }

  try {
    const res = await fetch(`${baseUrl}/api/sessions/${encodeURIComponent(session)}`, {
      method: 'GET',
      headers: buildWahaHeaders(apiKey),
    });

    if (res.status === 401 || res.status === 403) {
      return { success: false, message: 'API Key inválida ou não autorizada pelo WAHA.' };
    }

    if (res.ok) {
      const data: any = await res.json();
      const status = data?.status || 'DESCONHECIDO';
      const meName = data?.me?.pushName || data?.me?.id || '';
      const infoExtra = meName ? ` (${meName})` : '';
      return {
        success: status === 'WORKING' || status === 'CONNECTED',
        status,
        message:
          status === 'WORKING' || status === 'CONNECTED'
            ? `Conectado com sucesso! Sessão "${session}" ativa${infoExtra}.`
            : `Servidor WAHA acessível, mas sessão "${session}" está com status: ${status}.`,
      };
    }

    // Fallback: tentar listar sessões
    const listRes = await fetch(`${baseUrl}/api/sessions`, {
      method: 'GET',
      headers: buildWahaHeaders(apiKey),
    });
    if (listRes.ok) {
      return {
        success: false,
        message: `Servidor WAHA acessível, porém a sessão "${session}" não foi encontrada.`,
      };
    }

    const errText = await res.text().catch(() => '');
    return {
      success: false,
      message: `Erro HTTP ${res.status} ao conectar ao WAHA${errText ? `: ${errText.slice(0, 120)}` : ''}`,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Não foi possível conectar em ${baseUrl}: ${err.message || 'Erro de rede'}`,
    };
  }
}

/**
 * Lista grupos de WhatsApp disponíveis na sessão WAHA
 */
export async function listWahaGroups(): Promise<WahaGroup[]> {
  const config = await getWahaConfig(false);
  if (!config.baseUrl) {
    throw new Error('URL do WAHA não configurada.');
  }

  const headers = buildWahaHeaders(config.apiKey);
  const session = encodeURIComponent(config.session || 'default');

  // Tenta endpoint padrão de grupos do WAHA
  let res = await fetch(`${config.baseUrl}/api/${session}/groups`, {
    method: 'GET',
    headers,
  });

  if (res.ok) {
    const data: any = await res.json();
    const list = Array.isArray(data) ? data : Array.isArray(data?.groups) ? data.groups : [];
    return list
      .map((g: any) => ({
        id: g?.id?._serialized || g?.id || g?.jid || '',
        name: g?.subject || g?.name || g?.id?._serialized || g?.id || 'Grupo sem nome',
      }))
      .filter((g: WahaGroup) => Boolean(g.id));
  }

  // Fallback para /api/chats filtrando grupos (@g.us)
  res = await fetch(`${config.baseUrl}/api/${session}/chats`, {
    method: 'GET',
    headers,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Falha ao buscar grupos no WAHA (HTTP ${res.status}): ${errText.slice(0, 150)}`);
  }

  const chatsData: any = await res.json();
  const chats = Array.isArray(chatsData) ? chatsData : [];
  return chats
    .map((c: any) => ({
      id: c?.id?._serialized || c?.id || '',
      name: c?.name || c?.subject || c?.id?._serialized || c?.id || 'Grupo sem nome',
    }))
    .filter((g: WahaGroup) => g.id.endsWith('@g.us'));
}

/**
 * Envia uma mensagem de texto para um chat/grupo via WAHA
 */
export async function sendWahaTextMessage(params: {
  chatId?: string;
  text: string;
}): Promise<{ success: boolean; messageId?: string; chatId: string }> {
  const config = await getWahaConfig(false);
  if (!config.baseUrl) {
    throw new Error('WAHA não configurado. Acesse Configurações > WhatsApp (WAHA).');
  }

  const targetChatId = (params.chatId || config.defaultGroupId || '').trim();
  if (!targetChatId) {
    throw new Error('Nenhum grupo de WhatsApp informado ou configurado como padrão.');
  }

  const text = (params.text || '').trim();
  if (!text) {
    throw new Error('A mensagem não pode estar vazia.');
  }

  const res = await fetch(`${config.baseUrl}/api/sendText`, {
    method: 'POST',
    headers: buildWahaHeaders(config.apiKey),
    body: JSON.stringify({
      chatId: targetChatId,
      text,
      session: config.session || 'default',
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Erro ao enviar mensagem via WAHA (HTTP ${res.status}): ${errText.slice(0, 200)}`);
  }

  const data: any = await res.json().catch(() => ({}));
  return {
    success: true,
    messageId: data?.id?._serialized || data?.id || data?.key?.id,
    chatId: targetChatId,
  };
}

/**
 * Obtém os templates de mensagem WhatsApp configurados
 */
export async function getWahaTemplates(): Promise<WahaTemplate[]> {
  try {
    const res = await pool.query(`SELECT value FROM app_settings WHERE key = 'waha_templates'`);
    if (res.rows.length > 0 && Array.isArray(res.rows[0].value)) {
      return res.rows[0].value as WahaTemplate[];
    }
  } catch (err) {
    console.warn('[WAHA] Erro ao ler templates do banco:', err);
  }
  return DEFAULT_WAHA_TEMPLATES;
}

/**
 * Salva a lista de templates de mensagem WhatsApp
 */
export async function saveWahaTemplates(templates: WahaTemplate[]): Promise<WahaTemplate[]> {
  const sanitized = (Array.isArray(templates) ? templates : []).map((t) => ({
    id: String(t.id || `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`),
    name: String(t.name || 'Template sem nome').trim(),
    content: String(t.content || ''),
    isDefault: Boolean(t.isDefault),
    createdAt: t.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));

  await pool.query(
    `INSERT INTO app_settings (key, value) VALUES ('waha_templates', $1::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [JSON.stringify(sanitized)]
  );

  return sanitized;
}
