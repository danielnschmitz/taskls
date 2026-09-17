import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { pool } from './db';

export const cardRouter = Router();

/**
 * GET /api/cards/templates
 * Lista todos os templates de card do sistema e os criados pelo usuário logado
 */
cardRouter.get('/templates', async (req: Request, res: Response): Promise<void> => {
  try {
    const authUser = (req as any).user;

    const query = await pool.query(
      `SELECT 
         id, 
         user_id AS "userId", 
         title, 
         description, 
         category, 
         content, 
         is_system AS "isSystem", 
         created_at AS "createdAt", 
         updated_at AS "updatedAt"
       FROM card_templates
       WHERE is_system = TRUE OR user_id = $1
       ORDER BY is_system DESC, category ASC, title ASC`,
      [authUser.id]
    );

    res.json(query.rows);
  } catch (err: any) {
    console.error('[Cards] Erro ao listar templates:', err);
    res.status(500).json({ error: 'Erro ao listar templates de card' });
  }
});

/**
 * POST /api/cards/templates
 * Cria um novo template de card para o usuário logado
 */
cardRouter.post('/templates', async (req: Request, res: Response): Promise<void> => {
  try {
    const authUser = (req as any).user;
    const { title, description, category, content } = req.body;

    if (!title || !title.trim()) {
      res.status(400).json({ error: 'O título do template é obrigatório.' });
      return;
    }

    if (!content || !content.trim()) {
      res.status(400).json({ error: 'O conteúdo Markdown do template é obrigatório.' });
      return;
    }

    const templateId = crypto.randomUUID();
    const cleanCategory = (category && category.trim()) || 'Geral';

    const insertRes = await pool.query(
      `INSERT INTO card_templates (id, user_id, title, description, category, content, is_system)
       VALUES ($1, $2, $3, $4, $5, $6, FALSE)
       RETURNING 
         id, 
         user_id AS "userId", 
         title, 
         description, 
         category, 
         content, 
         is_system AS "isSystem", 
         created_at AS "createdAt", 
         updated_at AS "updatedAt"`,
      [templateId, authUser.id, title.trim(), description ? description.trim() : null, cleanCategory, content]
    );

    res.status(201).json(insertRes.rows[0]);
  } catch (err: any) {
    console.error('[Cards] Erro ao criar template:', err);
    res.status(500).json({ error: 'Erro ao criar template de card' });
  }
});

/**
 * PUT /api/cards/templates/:id
 * Atualiza um template de card existente
 */
cardRouter.put('/templates/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const authUser = (req as any).user;
    const { id } = req.params;
    const { title, description, category, content } = req.body;

    const check = await pool.query(`SELECT id, user_id, is_system FROM card_templates WHERE id = $1`, [id]);
    if (check.rows.length === 0) {
      res.status(404).json({ error: 'Template não encontrado.' });
      return;
    }

    const t = check.rows[0];
    if (t.is_system && !authUser.isAdmin) {
      res.status(403).json({ error: 'Apenas administradores podem modificar templates padrão do sistema.' });
      return;
    }

    if (!t.is_system && t.user_id !== authUser.id && !authUser.isAdmin) {
      res.status(403).json({ error: 'Você não tem permissão para editar este template.' });
      return;
    }

    const updateRes = await pool.query(
      `UPDATE card_templates
       SET 
         title = COALESCE($1, title),
         description = COALESCE($2, description),
         category = COALESCE($3, category),
         content = COALESCE($4, content),
         updated_at = NOW()
       WHERE id = $5
       RETURNING 
         id, 
         user_id AS "userId", 
         title, 
         description, 
         category, 
         content, 
         is_system AS "isSystem", 
         created_at AS "createdAt", 
         updated_at AS "updatedAt"`,
      [
        title !== undefined ? title.trim() : null,
        description !== undefined ? description.trim() : null,
        category !== undefined ? category.trim() : null,
        content !== undefined ? content : null,
        id,
      ]
    );

    res.json(updateRes.rows[0]);
  } catch (err: any) {
    console.error('[Cards] Erro ao atualizar template:', err);
    res.status(500).json({ error: 'Erro ao atualizar template de card' });
  }
});

/**
 * DELETE /api/cards/templates/:id
 * Exclui um template de card
 */
cardRouter.delete('/templates/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const authUser = (req as any).user;
    const { id } = req.params;

    const check = await pool.query(`SELECT id, user_id, is_system FROM card_templates WHERE id = $1`, [id]);
    if (check.rows.length === 0) {
      res.status(404).json({ error: 'Template não encontrado.' });
      return;
    }

    const t = check.rows[0];
    if (t.is_system && !authUser.isAdmin) {
      res.status(403).json({ error: 'Apenas administradores podem excluir templates do sistema.' });
      return;
    }

    if (!t.is_system && t.user_id !== authUser.id && !authUser.isAdmin) {
      res.status(403).json({ error: 'Você não tem permissão para excluir este template.' });
      return;
    }

    await pool.query(`DELETE FROM card_templates WHERE id = $1`, [id]);
    res.json({ success: true, message: 'Template excluído com sucesso.' });
  } catch (err: any) {
    console.error('[Cards] Erro ao excluir template:', err);
    res.status(500).json({ error: 'Erro ao excluir template' });
  }
});

/**
 * GET /api/cards/saved
 * Lista o histórico de cards gerados e salvos pelo usuário
 */
cardRouter.get('/saved', async (req: Request, res: Response): Promise<void> => {
  try {
    const authUser = (req as any).user;

    const query = await pool.query(
      `SELECT 
         id, 
         user_id AS "userId", 
         template_id AS "templateId", 
         template_title AS "templateTitle", 
         title, 
         macro_values AS "macroValues", 
         content_markdown AS "contentMarkdown", 
         created_at AS "createdAt", 
         updated_at AS "updatedAt"
       FROM saved_cards
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [authUser.id]
    );

    res.json(query.rows);
  } catch (err: any) {
    console.error('[Cards] Erro ao listar cards salvos:', err);
    res.status(500).json({ error: 'Erro ao listar histórico de cards' });
  }
});

/**
 * POST /api/cards/saved
 * Salva um novo card gerado no histórico do usuário
 */
cardRouter.post('/saved', async (req: Request, res: Response): Promise<void> => {
  try {
    const authUser = (req as any).user;
    const { templateId, templateTitle, title, macroValues, contentMarkdown } = req.body;

    if (!title || !title.trim()) {
      res.status(400).json({ error: 'O título do card é obrigatório.' });
      return;
    }

    if (!contentMarkdown || !contentMarkdown.trim()) {
      res.status(400).json({ error: 'O conteúdo Markdown é obrigatório.' });
      return;
    }

    const cardId = crypto.randomUUID();

    const insertRes = await pool.query(
      `INSERT INTO saved_cards (id, user_id, template_id, template_title, title, macro_values, content_markdown)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING 
         id, 
         user_id AS "userId", 
         template_id AS "templateId", 
         template_title AS "templateTitle", 
         title, 
         macro_values AS "macroValues", 
         content_markdown AS "contentMarkdown", 
         created_at AS "createdAt", 
         updated_at AS "updatedAt"`,
      [
        cardId,
        authUser.id,
        templateId || null,
        templateTitle || 'Template Personalizado',
        title.trim(),
        JSON.stringify(macroValues || {}),
        contentMarkdown,
      ]
    );

    res.status(201).json(insertRes.rows[0]);
  } catch (err: any) {
    console.error('[Cards] Erro ao salvar card:', err);
    res.status(500).json({ error: 'Erro ao salvar card no histórico' });
  }
});

/**
 * DELETE /api/cards/saved/:id
 * Remove um card salvo do histórico
 */
cardRouter.delete('/saved/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const authUser = (req as any).user;
    const { id } = req.params;

    const check = await pool.query(`SELECT id, user_id FROM saved_cards WHERE id = $1`, [id]);
    if (check.rows.length === 0) {
      res.status(404).json({ error: 'Card salvo não encontrado.' });
      return;
    }

    if (check.rows[0].user_id !== authUser.id && !authUser.isAdmin) {
      res.status(403).json({ error: 'Você não tem permissão para excluir este card.' });
      return;
    }

    await pool.query(`DELETE FROM saved_cards WHERE id = $1`, [id]);
    res.json({ success: true, message: 'Card removido do histórico.' });
  } catch (err: any) {
    console.error('[Cards] Erro ao excluir card salvo:', err);
    res.status(500).json({ error: 'Erro ao excluir card salvo' });
  }
});
