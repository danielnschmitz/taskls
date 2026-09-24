import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { pool } from './db';
import { hashPassword } from './auth';

export const userRoutes = Router();

/**
 * GET /api/users
 * Lista todos os usuários cadastrados no sistema (apenas admin)
 */
userRoutes.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query(`
      SELECT 
        id, 
        username, 
        is_admin AS "isAdmin", 
        can_access_jira AS "canAccessJira", 
        allowed_modules AS "allowedModules",
        is_default_password AS "isDefaultPassword", 
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM users
      ORDER BY created_at ASC
    `);

    res.json(result.rows);
  } catch (err: any) {
    console.error('[Users] Erro ao listar usuários:', err);
    res.status(500).json({ error: 'Erro ao listar usuários' });
  }
});

/**
 * POST /api/users
 * Cria um novo usuário no sistema (apenas admin)
 */
userRoutes.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, password, canAccessJira, allowedModules } = req.body;

    if (!username || !username.trim()) {
      res.status(400).json({ error: 'O nome de usuário é obrigatório.' });
      return;
    }

    const cleanUsername = username.trim().toLowerCase();

    if (cleanUsername.length < 3) {
      res.status(400).json({ error: 'O nome de usuário deve ter no mínimo 3 caracteres.' });
      return;
    }

    if (!password || password.trim().length < 4) {
      res.status(400).json({ error: 'A senha inicial deve ter no mínimo 4 caracteres.' });
      return;
    }

    // Verificar se já existe um usuário com esse username
    const existing = await pool.query(
      `SELECT id FROM users WHERE LOWER(username) = LOWER($1)`,
      [cleanUsername]
    );

    if (existing.rows.length > 0) {
      res.status(400).json({ error: 'Já existe um usuário com este nome.' });
      return;
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const hash = hashPassword(password.trim(), salt);
    const userId = crypto.randomUUID();

    const modules = Array.isArray(allowedModules) && allowedModules.length > 0
      ? allowedModules
      : ['tasks', 'cards', 'health', 'dashboards'];

    const insertResult = await pool.query(
      `INSERT INTO users (id, username, password_hash, salt, is_default_password, is_admin, can_access_jira, allowed_modules)
       VALUES ($1, $2, $3, $4, TRUE, FALSE, $5, $6)
       RETURNING id, username, is_admin AS "isAdmin", can_access_jira AS "canAccessJira", allowed_modules AS "allowedModules", is_default_password AS "isDefaultPassword", created_at AS "createdAt"`,
      [userId, cleanUsername, hash, salt, Boolean(canAccessJira), modules]
    );

    res.status(201).json(insertResult.rows[0]);
  } catch (err: any) {
    console.error('[Users] Erro ao criar usuário:', err);
    res.status(500).json({ error: 'Erro ao criar usuário' });
  }
});

/**
 * PUT /api/users/:id
 * Atualiza permissões do usuário (apenas admin)
 */
userRoutes.put('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { canAccessJira, allowedModules } = req.body;

    const userCheck = await pool.query(`SELECT id, username, is_admin, allowed_modules FROM users WHERE id = $1`, [id]);
    if (userCheck.rows.length === 0) {
      res.status(404).json({ error: 'Usuário não encontrado.' });
      return;
    }

    const targetUser = userCheck.rows[0];

    // O admin principal sempre mantém acesso total
    let finalCanAccessJira = Boolean(canAccessJira);
    let finalAllowedModules = Array.isArray(allowedModules)
      ? allowedModules
      : (targetUser.allowed_modules || ['tasks', 'cards', 'health', 'dashboards']);

    if (targetUser.username.toLowerCase() === 'admin') {
      finalCanAccessJira = true;
      finalAllowedModules = ['tasks', 'cards', 'health', 'dashboards'];
    }

    const updateResult = await pool.query(
      `UPDATE users
       SET can_access_jira = $1, allowed_modules = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING id, username, is_admin AS "isAdmin", can_access_jira AS "canAccessJira", allowed_modules AS "allowedModules", is_default_password AS "isDefaultPassword", created_at AS "createdAt"`,
      [finalCanAccessJira, finalAllowedModules, id]
    );

    res.json(updateResult.rows[0]);
  } catch (err: any) {
    console.error('[Users] Erro ao atualizar usuário:', err);
    res.status(500).json({ error: 'Erro ao atualizar usuário' });
  }
});

/**
 * POST /api/users/:id/reset-password
 * Redefine a senha de um usuário para uma senha temporária (apenas admin)
 * Marca is_default_password = TRUE para forçar troca no próximo login
 */
userRoutes.post('/:id/reset-password', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.trim().length < 4) {
      res.status(400).json({ error: 'A nova senha deve possuir no mínimo 4 caracteres.' });
      return;
    }

    const userCheck = await pool.query(`SELECT id, username FROM users WHERE id = $1`, [id]);
    if (userCheck.rows.length === 0) {
      res.status(404).json({ error: 'Usuário não encontrado.' });
      return;
    }

    const newSalt = crypto.randomBytes(16).toString('hex');
    const newHash = hashPassword(newPassword.trim(), newSalt);

    await pool.query(
      `UPDATE users
       SET password_hash = $1, salt = $2, is_default_password = TRUE, updated_at = NOW()
       WHERE id = $3`,
      [newHash, newSalt, id]
    );

    res.json({
      success: true,
      message: `Senha do usuário ${userCheck.rows[0].username} redefinida com sucesso. O usuário precisará alterá-la no próximo acesso.`,
    });
  } catch (err: any) {
    console.error('[Users] Erro ao redefinir senha do usuário:', err);
    res.status(500).json({ error: 'Erro ao redefinir senha do usuário' });
  }
});

/**
 * DELETE /api/users/:id
 * Remove um usuário do sistema (apenas admin)
 */
userRoutes.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const authUser = (req as any).user;

    if (authUser.id === id) {
      res.status(400).json({ error: 'Você não pode excluir a sua própria conta de usuário.' });
      return;
    }

    const userCheck = await pool.query(`SELECT id, username FROM users WHERE id = $1`, [id]);
    if (userCheck.rows.length === 0) {
      res.status(404).json({ error: 'Usuário não encontrado.' });
      return;
    }

    if (userCheck.rows[0].username.toLowerCase() === 'admin') {
      res.status(400).json({ error: 'O usuário administrador principal não pode ser excluído.' });
      return;
    }

    await pool.query(`DELETE FROM users WHERE id = $1`, [id]);
    res.json({ success: true, message: 'Usuário excluído com sucesso.' });
  } catch (err: any) {
    console.error('[Users] Erro ao excluir usuário:', err);
    res.status(500).json({ error: 'Erro ao excluir usuário' });
  }
});
