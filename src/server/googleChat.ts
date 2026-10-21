import crypto from 'crypto';
import { pool } from './db';

export interface GoogleChatSpaceConfig {
  id: string; // Ex: 'spaces/AAAA12345'
  name: string; // Ex: 'Erros de Integração Neogrid'
}

export interface GoogleChatConfig {
  service_account_key?: string; // JSON string das credenciais de Service Account
  spaces: GoogleChatSpaceConfig[];
  poll_interval_minutes: number;
  auto_sync_enabled: boolean;
  filter_mode: 'all' | 'errors_only';
  filter_keywords: string[];
  ignored_keywords: string[];
  ignored_senders: string[];
}

export const DEFAULT_FILTER_KEYWORDS = [
  'erro',
  'alerta',
  'alert',
  'falha',
  'fail',
  'não foi processad',
  'não foram processad',
  'não cadastrad',
  '404',
  '500',
  'exception',
  'timeout',
  'impedimento',
  'bloqueio',
  'interrompido',
];

export const DEFAULT_IGNORED_KEYWORDS = [
  'execução iniciada',
  'serviço iniciado',
  'iniciada a execução',
  'concluída com sucesso',
  'executado com sucesso',
  'finalizado com sucesso',
];

export const DEFAULT_GOOGLE_CHAT_CONFIG: GoogleChatConfig = {
  service_account_key: '',
  spaces: [],
  poll_interval_minutes: 5,
  auto_sync_enabled: true,
  filter_mode: 'errors_only',
  filter_keywords: DEFAULT_FILTER_KEYWORDS,
  ignored_keywords: DEFAULT_IGNORED_KEYWORDS,
  ignored_senders: [],
};

// Cache de token em memória
interface CachedToken {
  accessToken: string;
  expiresAt: number;
}
let cachedToken: CachedToken | null = null;

function base64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

/**
 * Normaliza o ID do space (ex: 'spaces/AAAA12345' ou 'AAAA12345')
 */
export function normalizeSpaceId(spaceId: string): string {
  const trimmed = spaceId.trim();
  if (trimmed.startsWith('spaces/')) {
    return trimmed;
  }
  return `spaces/${trimmed}`;
}

/**
 * Obtém as configurações do Google Chat salvas no PostgreSQL
 */
export async function getGoogleChatConfig(): Promise<GoogleChatConfig> {
  try {
    const res = await pool.query(`SELECT value FROM app_settings WHERE key = 'google_chat_config'`);
    if (res.rows.length === 0) {
      await pool.query(
        `INSERT INTO app_settings (key, value) VALUES ('google_chat_config', $1) ON CONFLICT (key) DO NOTHING`,
        [JSON.stringify(DEFAULT_GOOGLE_CHAT_CONFIG)]
      );
      return DEFAULT_GOOGLE_CHAT_CONFIG;
    }

    const saved = res.rows[0].value || {};
    return {
      service_account_key: saved.service_account_key || '',
      spaces: Array.isArray(saved.spaces) ? saved.spaces : [],
      poll_interval_minutes: Number(saved.poll_interval_minutes) || 5,
      auto_sync_enabled: saved.auto_sync_enabled !== false,
      filter_mode: saved.filter_mode === 'all' ? 'all' : 'errors_only',
      filter_keywords: Array.isArray(saved.filter_keywords) && saved.filter_keywords.length > 0
        ? saved.filter_keywords
        : DEFAULT_FILTER_KEYWORDS,
      ignored_keywords: Array.isArray(saved.ignored_keywords)
        ? saved.ignored_keywords
        : DEFAULT_IGNORED_KEYWORDS,
      ignored_senders: Array.isArray(saved.ignored_senders) ? saved.ignored_senders : [],
    };
  } catch (err) {
    console.error('[GoogleChat] Erro ao carregar configurações:', err);
    return DEFAULT_GOOGLE_CHAT_CONFIG;
  }
}

/**
 * Salva as configurações do Google Chat no PostgreSQL
 */
export async function saveGoogleChatConfig(config: Partial<GoogleChatConfig>): Promise<GoogleChatConfig> {
  const current = await getGoogleChatConfig();
  const merged: GoogleChatConfig = {
    ...current,
    ...config,
    spaces: Array.isArray(config.spaces)
      ? config.spaces
          .filter((s) => s && s.id && s.id.trim())
          .map((s) => ({
            id: normalizeSpaceId(s.id),
            name: (s.name && s.name.trim()) || normalizeSpaceId(s.id),
          }))
      : current.spaces,
    filter_keywords: Array.isArray(config.filter_keywords)
      ? config.filter_keywords.map((k) => k.trim()).filter(Boolean)
      : current.filter_keywords,
    ignored_keywords: Array.isArray(config.ignored_keywords)
      ? config.ignored_keywords.map((k) => k.trim()).filter(Boolean)
      : current.ignored_keywords,
    ignored_senders: Array.isArray(config.ignored_senders)
      ? config.ignored_senders.map((k) => k.trim()).filter(Boolean)
      : current.ignored_senders,
  };

  // Se a chave mudou, invalida o cache do token
  if (config.service_account_key !== undefined) {
    cachedToken = null;
  }

  await pool.query(
    `INSERT INTO app_settings (key, value)
     VALUES ('google_chat_config', $1)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [JSON.stringify(merged)]
  );

  return merged;
}

/**
 * Extrai e valida credenciais da Service Account do Google
 */
function parseServiceAccountKey(keyString?: string): { client_email: string; private_key: string } {
  if (!keyString || !keyString.trim()) {
    throw new Error('Nenhuma chave de Service Account configurada. Por favor, forneça o JSON da Service Account.');
  }

  let parsed: any;
  try {
    parsed = typeof keyString === 'string' ? JSON.parse(keyString) : keyString;
  } catch {
    throw new Error('O conteúdo da chave de Service Account não é um JSON válido.');
  }

  if (!parsed.client_email || !parsed.private_key) {
    throw new Error('O JSON da Service Account deve conter "client_email" e "private_key".');
  }

  return {
    client_email: parsed.client_email,
    private_key: parsed.private_key,
  };
}

/**
 * Gera um access token OAuth 2.0 usando a Service Account do Google
 */
export async function getGoogleChatAccessToken(customKey?: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  // Se não foi passada chave customizada e temos token em cache válido por mais de 5 minutos
  if (!customKey && cachedToken && cachedToken.expiresAt > now + 300) {
    return cachedToken.accessToken;
  }

  let creds: { client_email: string; private_key: string };
  if (customKey) {
    creds = parseServiceAccountKey(customKey);
  } else {
    const config = await getGoogleChatConfig();
    creds = parseServiceAccountKey(config.service_account_key);
  }

  // Gera JWT assinado com RS256
  const header = { alg: 'RS256', typ: 'JWT' };
  const scopes = [
    'https://www.googleapis.com/auth/chat.messages.readonly',
    'https://www.googleapis.com/auth/chat.bot',
  ];

  const payload = {
    iss: creds.client_email,
    scope: scopes.join(' '),
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const unsignedToken = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsignedToken);
  const signature = signer.sign(creds.private_key);
  const jwt = `${unsignedToken}.${base64url(signature)}`;

  // Troca JWT por Access Token na API do Google OAuth 2.0
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }).toString(),
  });

  if (!tokenRes.ok) {
    const errorBody = await tokenRes.text();
    console.error('[GoogleChat] Erro na autenticação com Google OAuth2:', errorBody);
    throw new Error(`Falha na autenticação do Google OAuth2: ${tokenRes.status} ${errorBody}`);
  }

  const tokenData = (await tokenRes.json()) as { access_token: string; expires_in: number };
  const accessToken = tokenData.access_token;

  if (!customKey) {
    cachedToken = {
      accessToken,
      expiresAt: now + (tokenData.expires_in || 3600),
    };
  }

  return accessToken;
}

/**
 * Busca mensagens de um espaço específico do Google Chat
 */
export async function fetchGoogleChatMessages(spaceId: string, pageSize: number = 50): Promise<any[]> {
  const accessToken = await getGoogleChatAccessToken();
  const normalizedSpace = normalizeSpaceId(spaceId);

  const url = `https://chat.googleapis.com/v1/${normalizedSpace}/messages?pageSize=${pageSize}&orderBy=createTime%20desc`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const errorBody = await res.text();
    console.error(`[GoogleChat] Erro ao buscar mensagens de ${normalizedSpace}:`, errorBody);
    throw new Error(`Erro na API do Google Chat (${res.status}): ${errorBody}`);
  }

  const data = (await res.json()) as { messages?: any[] };
  return data.messages || [];
}

/**
 * Testa a conexão com a Service Account e verifica acesso ao Google Chat
 */
export async function testGoogleChatConnection(
  serviceAccountKey?: string,
  testSpaceId?: string
): Promise<{ success: boolean; message: string; email?: string; spaceChecked?: string }> {
  try {
    const creds = parseServiceAccountKey(serviceAccountKey || (await getGoogleChatConfig()).service_account_key);
    const token = await getGoogleChatAccessToken(serviceAccountKey);

    if (!token) {
      return { success: false, message: 'Não foi possível obter o token de acesso do Google.' };
    }

    if (testSpaceId && testSpaceId.trim()) {
      const normalized = normalizeSpaceId(testSpaceId);
      const url = `https://chat.googleapis.com/v1/${normalized}/messages?pageSize=1`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      if (!res.ok) {
        const errorText = await res.text();
        return {
          success: false,
          email: creds.client_email,
          message: `Autenticação com Google bem-sucedida, mas falhou ao acessar o grupo (${normalized}): Verifique se a Service Account/App foi adicionada ao grupo. Resposta: ${errorText}`,
        };
      }

      return {
        success: true,
        email: creds.client_email,
        spaceChecked: normalized,
        message: `Conexão bem-sucedida! Service Account autenticada e com acesso ao grupo "${normalized}".`,
      };
    }

    return {
      success: true,
      email: creds.client_email,
      message: `Credenciais da Service Account (${creds.client_email}) validadas com sucesso com a API do Google!`,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Falha ao testar conexão com o Google Chat.',
    };
  }
}
