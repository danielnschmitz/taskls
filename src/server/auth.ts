import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { pool } from './db';

export interface TokenPayload {
  id: string;
  username: string;
  isAdmin: boolean;
  canAccessJira: boolean;
  allowedModules?: string[];
  isDefaultPassword?: boolean;
  exp: number;
}

// Cache local da chave secreta em memória
let cachedSecret: string | null = null;

/**
 * Obtém ou gera uma chave secreta segura para assinatura de tokens
 */
export async function getJwtSecret(): Promise<string> {
  if (process.env.JWT_SECRET) {
    return process.env.JWT_SECRET;
  }
  if (cachedSecret) {
    return cachedSecret;
  }

  const res = await pool.query(`SELECT value FROM app_settings WHERE key = 'jwt_secret'`);
  if (res.rows.length > 0) {
    const val = res.rows[0].value;
    cachedSecret = typeof val === 'string' ? val : val.secret;
    return cachedSecret!;
  }

  const generated = crypto.randomBytes(64).toString('hex');
  await pool.query(
    `INSERT INTO app_settings (key, value) VALUES ('jwt_secret', $1) ON CONFLICT (key) DO NOTHING`,
    [JSON.stringify({ secret: generated })]
  );

  cachedSecret = generated;
  return generated;
}

/**
 * Utilitários para Base64 URL Safe
 */
function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf8');
}

/**
 * Gera um token JWT assinado com validade padrão de 30 dias
 */
export async function generateToken(
  user: {
    id: string;
    username: string;
    is_admin?: boolean;
    can_access_jira?: boolean;
    allowed_modules?: string[];
    is_default_password?: boolean;
  },
  expiresInDays = 30
): Promise<string> {
  const secret = await getJwtSecret();
  const header = { alg: 'HS256', typ: 'JWT' };
  const exp = Math.floor(Date.now() / 1000) + expiresInDays * 24 * 60 * 60;

  const payload: TokenPayload = {
    id: user.id,
    username: user.username,
    isAdmin: Boolean(user.is_admin),
    canAccessJira: Boolean(user.can_access_jira),
    allowedModules: user.allowed_modules || ['tasks', 'cards'],
    isDefaultPassword: Boolean(user.is_default_password),
    exp,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const data = `${encodedHeader}.${encodedPayload}`;

  const signature = crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${data}.${signature}`;
}

/**
 * Valida o token JWT e retorna o payload caso seja válido
 */
export async function verifyToken(token: string): Promise<TokenPayload | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [encodedHeader, encodedPayload, signature] = parts;
    const data = `${encodedHeader}.${encodedPayload}`;
    const secret = await getJwtSecret();

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(data)
      .digest('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

    const sigBuffer = Buffer.from(signature);
    const expectedSigBuffer = Buffer.from(expectedSignature);

    if (
      sigBuffer.length !== expectedSigBuffer.length ||
      !crypto.timingSafeEqual(sigBuffer, expectedSigBuffer)
    ) {
      return null;
    }

    const payload: TokenPayload = JSON.parse(base64UrlDecode(encodedPayload));
    const now = Math.floor(Date.now() / 1000);

    if (payload.exp && payload.exp < now) {
      return null; // Expirado
    }

    return payload;
  } catch (err) {
    return null;
  }
}

/**
 * Hash seguro de senha usando PBKDF2 com SHA-512
 */
export function hashPassword(password: string, salt: string): string {
  return crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
}

/**
 * Compara uma senha em texto com o salt e hash salvo de forma segura contra timing attacks
 */
export function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  const hash = hashPassword(password, salt);
  const hashBuffer = Buffer.from(hash, 'hex');
  const expectedBuffer = Buffer.from(expectedHash, 'hex');

  if (hashBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(hashBuffer, expectedBuffer);
}

/**
 * Middleware Express para proteger rotas da API
 */
export async function authenticateToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers['authorization'];
  const headerToken = authHeader && authHeader.split(' ')[1];
  const queryToken = typeof req.query.token === 'string' ? req.query.token : null;
  const token = headerToken || queryToken;

  if (!token) {
    res.status(401).json({ error: 'Acesso não autorizado. Faça login para continuar.' });
    return;
  }

  const payload = await verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Sessão expirada ou inválida. Faça login novamente.' });
    return;
  }

  (req as any).user = payload;
  next();
}

/**
 * Middleware para garantir que apenas administradores acessem determinadas rotas
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const user = (req as any).user as TokenPayload | undefined;
  if (!user || !user.isAdmin) {
    res.status(403).json({ error: 'Acesso negado. Apenas administradores podem realizar esta operação.' });
    return;
  }
  next();
}

/**
 * Middleware para garantir que o usuário tenha permissão ao módulo solicitado
 */
export function requireModule(moduleName: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user as TokenPayload | undefined;
    if (!user) {
      res.status(401).json({ error: 'Acesso não autorizado. Faça login para continuar.' });
      return;
    }
    if (user.isAdmin) {
      return next();
    }
    const modules = user.allowedModules || ['tasks', 'cards'];
    if (!modules.includes(moduleName)) {
      res.status(403).json({ error: `Você não tem permissão para acessar o módulo '${moduleName}'. Solicite acesso ao administrador.` });
      return;
    }
    next();
  };
}

