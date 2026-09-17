import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { pool } from './db';
import {
  generateToken,
  hashPassword,
  verifyPassword,
  authenticateToken,
} from './auth';

export const authRouter = Router();

/**
 * POST /api/auth/login
 * Realiza o login do usuário e retorna o token JWT
 */
authRouter.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({ error: 'Usuário e senha são obrigatórios.' });
      return;
    }

    const query = await pool.query(
      `SELECT * FROM users WHERE LOWER(username) = LOWER($1)`,
      [username.trim()]
    );

    if (query.rows.length === 0) {
      res.status(401).json({ error: 'Usuário ou senha incorretos.' });
      return;
    }

    const user = query.rows[0];
    const isValid = verifyPassword(password, user.salt, user.password_hash);

    if (!isValid) {
      res.status(401).json({ error: 'Usuário ou senha incorretos.' });
      return;
    }

    const token = await generateToken({
      id: user.id,
      username: user.username,
      is_admin: user.is_admin,
      can_access_jira: user.can_access_jira,
      is_default_password: user.is_default_password,
    });

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        isAdmin: Boolean(user.is_admin),
        canAccessJira: Boolean(user.can_access_jira),
        isDefaultPassword: Boolean(user.is_default_password),
      },
    });
  } catch (err: any) {
    console.error('[Auth] Erro ao realizar login:', err);
    res.status(500).json({ error: 'Erro interno ao processar login.' });
  }
});

/**
 * GET /api/auth/me
 * Retorna dados do usuário atualmente autenticado
 */
authRouter.get('/me', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const authUser = (req as any).user;

    const query = await pool.query(
      `SELECT id, username, is_admin, can_access_jira, is_default_password, created_at FROM users WHERE id = $1`,
      [authUser.id]
    );

    if (query.rows.length === 0) {
      res.status(404).json({ error: 'Usuário não encontrado.' });
      return;
    }

    const user = query.rows[0];
    res.json({
      user: {
        id: user.id,
        username: user.username,
        isAdmin: Boolean(user.is_admin),
        canAccessJira: Boolean(user.can_access_jira),
        isDefaultPassword: Boolean(user.is_default_password),
        createdAt: user.created_at,
      },
    });
  } catch (err: any) {
    console.error('[Auth] Erro ao buscar perfil:', err);
    res.status(500).json({ error: 'Erro ao buscar perfil do usuário.' });
  }
});

/**
 * POST /api/auth/change-password
 * Permite que o usuário autenticado altere sua senha
 */
authRouter.post('/change-password', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const authUser = (req as any).user;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: 'Senha atual e nova senha são obrigatórias.' });
      return;
    }

    if (newPassword.length < 4) {
      res.status(400).json({ error: 'A nova senha deve possuir no mínimo 4 caracteres.' });
      return;
    }

    const query = await pool.query(`SELECT * FROM users WHERE id = $1`, [authUser.id]);
    if (query.rows.length === 0) {
      res.status(404).json({ error: 'Usuário não encontrado.' });
      return;
    }

    const user = query.rows[0];
    const isCurrentValid = verifyPassword(currentPassword, user.salt, user.password_hash);

    if (!isCurrentValid) {
      res.status(400).json({ error: 'A senha atual informada está incorreta.' });
      return;
    }

    // Gerar novo salt e novo hash
    const newSalt = crypto.randomBytes(16).toString('hex');
    const newHash = hashPassword(newPassword, newSalt);

    await pool.query(
      `UPDATE users
       SET password_hash = $1, salt = $2, is_default_password = FALSE, updated_at = NOW()
       WHERE id = $3`,
      [newHash, newSalt, user.id]
    );

    // Gerar novo token com isDefaultPassword = false
    const newToken = await generateToken({
      id: user.id,
      username: user.username,
      is_admin: user.is_admin,
      can_access_jira: user.can_access_jira,
      is_default_password: false,
    });

    res.json({
      success: true,
      message: 'Senha alterada com sucesso!',
      token: newToken,
      user: {
        id: user.id,
        username: user.username,
        isAdmin: Boolean(user.is_admin),
        canAccessJira: Boolean(user.can_access_jira),
        isDefaultPassword: false,
      },
    });
  } catch (err: any) {
    console.error('[Auth] Erro ao alterar senha:', err);
    res.status(500).json({ error: 'Erro interno ao alterar senha.' });
  }
});
