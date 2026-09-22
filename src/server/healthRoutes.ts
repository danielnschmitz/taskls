import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { pool } from './db';
import {
  getTelegramBotToken,
  saveTelegramBotToken,
  testTelegramBotToken,
  restartTelegramBotService,
} from './telegramBot';

export const healthRouter = Router();

/**
 * GET /api/health/weights
 * Retorna as pesagens cadastradas do usuário logado
 */
healthRouter.get('/weights', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    const period = (req.query.period as string) || 'all';

    let dateFilter = '';
    const params: any[] = [userId];

    if (period === '7d') {
      dateFilter = `AND logged_at >= NOW() - INTERVAL '7 days'`;
    } else if (period === '30d') {
      dateFilter = `AND logged_at >= NOW() - INTERVAL '30 days'`;
    } else if (period === '90d') {
      dateFilter = `AND logged_at >= NOW() - INTERVAL '90 days'`;
    } else if (period === '6m') {
      dateFilter = `AND logged_at >= NOW() - INTERVAL '6 months'`;
    } else if (period === '1y') {
      dateFilter = `AND logged_at >= NOW() - INTERVAL '1 year'`;
    }

    const query = `
      SELECT 
        id, 
        weight::float AS weight, 
        logged_at AS "loggedAt", 
        notes, 
        source, 
        created_at AS "createdAt", 
        updated_at AS "updatedAt"
      FROM health_weight_logs
      WHERE user_id = $1 ${dateFilter}
      ORDER BY logged_at DESC
    `;

    const result = await pool.query(query, params);
    const rows = result.rows;

    // Calcula a diferença em relação à pesagem cronologicamente anterior
    // Como os dados estão em ordem decrescente (mais recente primeiro),
    // a medição anterior no tempo é o item rows[i + 1]
    const enriched = rows.map((row, index) => {
      const prev = rows[index + 1];
      const diffFromPrevious = prev ? Number((row.weight - prev.weight).toFixed(2)) : 0;
      return {
        ...row,
        diffFromPrevious,
      };
    });

    res.json(enriched);
  } catch (err: any) {
    console.error('[Health] Erro ao listar pesagens:', err);
    res.status(500).json({ error: 'Erro ao listar pesagens' });
  }
});

/**
 * POST /api/health/weights
 * Cadastra uma nova pesagem
 */
healthRouter.post('/weights', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    const { weight, loggedAt, notes } = req.body;

    if (weight === undefined || weight === null || weight === '') {
      res.status(400).json({ error: 'O peso é obrigatório.' });
      return;
    }

    const weightNum = typeof weight === 'number' ? weight : parseFloat(String(weight).replace(',', '.'));
    if (isNaN(weightNum) || weightNum <= 0 || weightNum > 450) {
      res.status(400).json({ error: 'Valor de peso inválido. Deve ser entre 1kg e 450kg.' });
      return;
    }

    const logDate = loggedAt ? new Date(loggedAt) : new Date();
    if (isNaN(logDate.getTime())) {
      res.status(400).json({ error: 'Data e hora da pesagem inválidas.' });
      return;
    }

    const id = crypto.randomUUID();

    const insertResult = await pool.query(
      `INSERT INTO health_weight_logs (id, user_id, weight, logged_at, notes, source)
       VALUES ($1, $2, $3, $4, $5, 'web')
       RETURNING id, weight::float AS weight, logged_at AS "loggedAt", notes, source, created_at AS "createdAt"`,
      [id, userId, weightNum, logDate, notes ? String(notes).trim() : null]
    );

    res.status(201).json(insertResult.rows[0]);
  } catch (err: any) {
    console.error('[Health] Erro ao cadastrar pesagem:', err);
    res.status(500).json({ error: 'Erro ao cadastrar pesagem' });
  }
});

/**
 * PUT /api/health/weights/:id
 * Edita uma pesagem existente
 */
healthRouter.put('/weights/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    const { id } = req.params;
    const { weight, loggedAt, notes } = req.body;

    const existing = await pool.query(`SELECT id FROM health_weight_logs WHERE id = $1 AND user_id = $2`, [id, userId]);
    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Pesagem não encontrada.' });
      return;
    }

    const weightNum = typeof weight === 'number' ? weight : parseFloat(String(weight).replace(',', '.'));
    if (isNaN(weightNum) || weightNum <= 0 || weightNum > 450) {
      res.status(400).json({ error: 'Valor de peso inválido.' });
      return;
    }

    const logDate = loggedAt ? new Date(loggedAt) : new Date();

    const updateResult = await pool.query(
      `UPDATE health_weight_logs
       SET weight = $1, logged_at = $2, notes = $3, updated_at = NOW()
       WHERE id = $4 AND user_id = $5
       RETURNING id, weight::float AS weight, logged_at AS "loggedAt", notes, source, updated_at AS "updatedAt"`,
      [weightNum, logDate, notes ? String(notes).trim() : null, id, userId]
    );

    res.json(updateResult.rows[0]);
  } catch (err: any) {
    console.error('[Health] Erro ao atualizar pesagem:', err);
    res.status(500).json({ error: 'Erro ao atualizar pesagem' });
  }
});

/**
 * DELETE /api/health/weights/:id
 * Remove uma pesagem
 */
healthRouter.delete('/weights/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    const { id } = req.params;

    const delResult = await pool.query(
      `DELETE FROM health_weight_logs WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );

    if (delResult.rowCount === 0) {
      res.status(404).json({ error: 'Pesagem não encontrada.' });
      return;
    }

    res.json({ success: true, message: 'Pesagem removida com sucesso.' });
  } catch (err: any) {
    console.error('[Health] Erro ao excluir pesagem:', err);
    res.status(500).json({ error: 'Erro ao excluir pesagem' });
  }
});

/**
 * GET /api/health/summary
 * Retorna as principais métricas e estatísticas consolidadas de saúde
 */
healthRouter.get('/summary', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;

    // Todas as pesagens ordenadas do mais antigo ao mais recente
    const allWeightsRes = await pool.query<{ weight: number; loggedAt: Date }>(
      `SELECT weight::float AS weight, logged_at AS "loggedAt"
       FROM health_weight_logs
       WHERE user_id = $1
       ORDER BY logged_at ASC`,
      [userId]
    );
    const weights = allWeightsRes.rows;

    // Meta cadastrada
    const goalRes = await pool.query<{ target_weight: number; initial_weight: number | null }>(
      `SELECT target_weight::float AS target_weight, initial_weight::float AS initial_weight
       FROM health_goals
       WHERE user_id = $1`,
      [userId]
    );
    const goal = goalRes.rows[0] || null;

    if (weights.length === 0) {
      res.json({
        totalEntries: 0,
        currentWeight: null,
        currentLoggedAt: null,
        previousWeight: null,
        recentDiff: 0,
        initialWeight: null,
        totalDiff: 0,
        minWeight: null,
        maxWeight: null,
        goal: goal
          ? {
              targetWeight: goal.target_weight,
              initialWeight: goal.initial_weight,
              progressPercentage: 0,
              remainingKg: 0,
            }
          : null,
      });
      return;
    }

    const first = weights[0];
    const latest = weights[weights.length - 1];
    const secondLatest = weights.length > 1 ? weights[weights.length - 2] : null;

    const currentWeight = latest.weight;
    const previousWeight = secondLatest ? secondLatest.weight : null;
    const recentDiff = previousWeight !== null ? Number((currentWeight - previousWeight).toFixed(2)) : 0;
    const initialWeight = goal?.initial_weight || first.weight;
    const totalDiff = Number((currentWeight - initialWeight).toFixed(2));

    let minWeight = currentWeight;
    let maxWeight = currentWeight;
    for (const w of weights) {
      if (w.weight < minWeight) minWeight = w.weight;
      if (w.weight > maxWeight) maxWeight = w.weight;
    }

    // Progresso em direção à meta
    let goalData = null;
    if (goal && goal.target_weight) {
      const target = goal.target_weight;
      const start = goal.initial_weight || first.weight;
      const remainingKg = Number((currentWeight - target).toFixed(2));

      let progressPercentage = 0;
      const totalToLose = start - target;
      if (totalToLose > 0) {
        const lostSoFar = start - currentWeight;
        progressPercentage = Math.min(Math.max(Math.round((lostSoFar / totalToLose) * 100), 0), 100);
      } else if (totalToLose < 0) {
        // Caso de ganho de peso / hipertrofia
        const gainedSoFar = currentWeight - start;
        const totalToGain = target - start;
        progressPercentage = Math.min(Math.max(Math.round((gainedSoFar / totalToGain) * 100), 0), 100);
      } else {
        progressPercentage = 100;
      }

      goalData = {
        targetWeight: target,
        initialWeight: start,
        progressPercentage,
        remainingKg,
      };
    }

    res.json({
      totalEntries: weights.length,
      currentWeight,
      currentLoggedAt: latest.loggedAt,
      previousWeight,
      recentDiff,
      initialWeight,
      totalDiff,
      minWeight,
      maxWeight,
      goal: goalData,
    });
  } catch (err: any) {
    console.error('[Health] Erro ao calcular resumo:', err);
    res.status(500).json({ error: 'Erro ao calcular resumo' });
  }
});

/**
 * GET /api/health/goal
 * Consulta a meta de peso do usuário
 */
healthRouter.get('/goal', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    const result = await pool.query(
      `SELECT target_weight::float AS "targetWeight", initial_weight::float AS "initialWeight"
       FROM health_goals WHERE user_id = $1`,
      [userId]
    );

    res.json(result.rows[0] || null);
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao obter meta' });
  }
});

/**
 * POST /api/health/goal
 * Salva ou atualiza a meta de peso
 */
healthRouter.post('/goal', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    const { targetWeight, initialWeight } = req.body;

    const targetNum = typeof targetWeight === 'number' ? targetWeight : parseFloat(String(targetWeight).replace(',', '.'));
    if (isNaN(targetNum) || targetNum <= 0) {
      res.status(400).json({ error: 'Peso meta inválido.' });
      return;
    }

    const initNum = initialWeight
      ? (typeof initialWeight === 'number' ? initialWeight : parseFloat(String(initialWeight).replace(',', '.')))
      : null;

    await pool.query(
      `INSERT INTO health_goals (user_id, target_weight, initial_weight, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id) DO UPDATE
       SET target_weight = $2, initial_weight = COALESCE($3, health_goals.initial_weight), updated_at = NOW()`,
      [userId, targetNum, initNum]
    );

    res.json({ success: true, targetWeight: targetNum, initialWeight: initNum });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao salvar meta' });
  }
});

/**
 * GET /api/health/telegram/config
 * Retorna o status de conexão com o Telegram
 */
healthRouter.get('/telegram/config', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    const token = await getTelegramBotToken();

    let botUsername: string | null = null;
    let isBotActive = false;

    if (token) {
      const test = await testTelegramBotToken(token);
      if (test.success) {
        isBotActive = true;
        botUsername = test.botUsername || null;
      }
    }

    const userRes = await pool.query<{ telegram_chat_id: string | null }>(
      `SELECT telegram_chat_id FROM users WHERE id = $1`,
      [userId]
    );
    const userChatId = userRes.rows[0]?.telegram_chat_id || null;

    res.json({
      hasToken: Boolean(token),
      isBotActive,
      botUsername,
      isLinked: Boolean(userChatId),
      chatId: userChatId,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao consultar status do Telegram' });
  }
});

/**
 * POST /api/health/telegram/token
 * Salva o token do Bot do Telegram (disponível para administradores ou usuários autorizados)
 */
healthRouter.post('/telegram/token', async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.body;
    if (typeof token !== 'string') {
      res.status(400).json({ error: 'Token inválido' });
      return;
    }

    const result = await saveTelegramBotToken(token);
    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json({ success: true, botUsername: result.botUsername });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao salvar token do Telegram' });
  }
});

/**
 * POST /api/health/telegram/generate-code
 * Gera um código temporário de 6 dígitos para o usuário vincular via /vincular <code>
 */
healthRouter.post('/telegram/generate-code', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;

    // Gera um código numérico de 6 dígitos
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutos de validade

    // Limpa códigos expirados antigos do usuário
    await pool.query(`DELETE FROM health_telegram_codes WHERE user_id = $1 OR expires_at < NOW()`, [userId]);

    // Salva o novo código
    await pool.query(
      `INSERT INTO health_telegram_codes (code, user_id, expires_at)
       VALUES ($1, $2, $3)`,
      [code, userId, expiresAt]
    );

    res.json({
      code,
      expiresAt: expiresAt.toISOString(),
      instruction: `/vincular ${code}`,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao gerar código de vinculação' });
  }
});

/**
 * POST /api/health/telegram/unlink
 * Desvincula a conta do Telegram do usuário
 */
healthRouter.post('/telegram/unlink', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    await pool.query(`UPDATE users SET telegram_chat_id = NULL WHERE id = $1`, [userId]);
    res.json({ success: true, message: 'Conta do Telegram desvinculada com sucesso.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao desvincular conta' });
  }
});

/**
 * GET /api/health/measures
 * Lista medições corporais com filtros opcionais por tipo e período
 */
healthRouter.get('/measures', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    const { type, period } = req.query;

    let typeFilter = '';
    const params: any[] = [userId];

    if (type === 'cintura' || type === 'abdomen') {
      params.push(type);
      typeFilter = `AND measure_type = $${params.length}`;
    }

    let dateFilter = '';
    if (period === '7d') {
      dateFilter = `AND logged_at >= NOW() - INTERVAL '7 days'`;
    } else if (period === '30d') {
      dateFilter = `AND logged_at >= NOW() - INTERVAL '30 days'`;
    } else if (period === '90d') {
      dateFilter = `AND logged_at >= NOW() - INTERVAL '90 days'`;
    } else if (period === '6m') {
      dateFilter = `AND logged_at >= NOW() - INTERVAL '6 months'`;
    } else if (period === '1y') {
      dateFilter = `AND logged_at >= NOW() - INTERVAL '1 year'`;
    }

    const query = `
      SELECT 
        id, 
        measure_type AS "measureType",
        value::float AS value, 
        logged_at AS "loggedAt", 
        notes, 
        source, 
        created_at AS "createdAt", 
        updated_at AS "updatedAt"
      FROM health_body_measures
      WHERE user_id = $1 ${typeFilter} ${dateFilter}
      ORDER BY logged_at DESC
    `;

    const result = await pool.query(query, params);
    const rows = result.rows;

    // Calcular diferença em relação à medição anterior do mesmo tipo
    const enriched = rows.map((row, index) => {
      const prev = rows.slice(index + 1).find((r) => r.measureType === row.measureType);
      const diffFromPrevious = prev ? Number((row.value - prev.value).toFixed(2)) : 0;
      return {
        ...row,
        diffFromPrevious,
      };
    });

    res.json(enriched);
  } catch (err: any) {
    console.error('[Health] Erro ao listar medições:', err);
    res.status(500).json({ error: 'Erro ao listar medições' });
  }
});

/**
 * GET /api/health/measures/summary
 * Retorna métricas consolidadas para cintura e abdômen
 */
healthRouter.get('/measures/summary', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;

    const allMeasuresRes = await pool.query<{
      measureType: string;
      value: number;
      loggedAt: Date;
    }>(
      `SELECT 
         measure_type AS "measureType",
         value::float AS value, 
         logged_at AS "loggedAt"
       FROM health_body_measures
       WHERE user_id = $1
       ORDER BY logged_at ASC`,
      [userId]
    );

    const rows = allMeasuresRes.rows;

    const computeSummaryForType = (mType: 'cintura' | 'abdomen') => {
      const items = rows.filter((r) => r.measureType === mType);
      if (items.length === 0) {
        return {
          totalEntries: 0,
          current: null,
          currentLoggedAt: null,
          previous: null,
          recentDiff: 0,
          initial: null,
          totalDiff: 0,
          min: null,
          max: null,
        };
      }

      const first = items[0];
      const latest = items[items.length - 1];
      const secondLatest = items.length > 1 ? items[items.length - 2] : null;

      const current = latest.value;
      const previous = secondLatest ? secondLatest.value : null;
      const recentDiff = previous !== null ? Number((current - previous).toFixed(2)) : 0;
      const initial = first.value;
      const totalDiff = Number((current - initial).toFixed(2));

      let min = current;
      let max = current;
      for (const it of items) {
        if (it.value < min) min = it.value;
        if (it.value > max) max = it.value;
      }

      return {
        totalEntries: items.length,
        current,
        currentLoggedAt: latest.loggedAt,
        previous,
        recentDiff,
        initial,
        totalDiff,
        min,
        max,
      };
    };

    res.json({
      cintura: computeSummaryForType('cintura'),
      abdomen: computeSummaryForType('abdomen'),
    });
  } catch (err: any) {
    console.error('[Health] Erro ao calcular resumo de medidas:', err);
    res.status(500).json({ error: 'Erro ao calcular resumo de medidas' });
  }
});

/**
 * POST /api/health/measures
 * Cadastra uma nova medição corporal
 */
healthRouter.post('/measures', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    const { measureType, value, loggedAt, notes } = req.body;

    if (!measureType || (measureType !== 'cintura' && measureType !== 'abdomen')) {
      res.status(400).json({ error: 'O tipo de medida deve ser cintura ou abdomen.' });
      return;
    }

    if (value === undefined || value === null || value === '') {
      res.status(400).json({ error: 'O valor da medida é obrigatório.' });
      return;
    }

    const valueNum = typeof value === 'number' ? value : parseFloat(String(value).replace(',', '.'));
    if (isNaN(valueNum) || valueNum < 20 || valueNum > 300) {
      res.status(400).json({ error: 'Valor de medida inválido. Deve ser entre 20cm e 300cm.' });
      return;
    }

    const logDate = loggedAt ? new Date(loggedAt) : new Date();
    if (isNaN(logDate.getTime())) {
      res.status(400).json({ error: 'Data e hora da medição inválidas.' });
      return;
    }

    const id = crypto.randomUUID();

    const insertResult = await pool.query(
      `INSERT INTO health_body_measures (id, user_id, measure_type, value, logged_at, notes, source)
       VALUES ($1, $2, $3, $4, $5, $6, 'web')
       RETURNING id, measure_type AS "measureType", value::float AS value, logged_at AS "loggedAt", notes, source, created_at AS "createdAt"`,
      [id, userId, measureType, valueNum, logDate, notes ? String(notes).trim() : null]
    );

    res.status(201).json(insertResult.rows[0]);
  } catch (err: any) {
    console.error('[Health] Erro ao cadastrar medição:', err);
    res.status(500).json({ error: 'Erro ao cadastrar medição' });
  }
});

/**
 * PUT /api/health/measures/:id
 * Edita uma medição existente
 */
healthRouter.put('/measures/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    const { id } = req.params;
    const { measureType, value, loggedAt, notes } = req.body;

    const existing = await pool.query(
      `SELECT id FROM health_body_measures WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Medição não encontrada.' });
      return;
    }

    if (measureType && measureType !== 'cintura' && measureType !== 'abdomen') {
      res.status(400).json({ error: 'Tipo de medida inválido.' });
      return;
    }

    const valueNum = typeof value === 'number' ? value : parseFloat(String(value).replace(',', '.'));
    if (isNaN(valueNum) || valueNum < 20 || valueNum > 300) {
      res.status(400).json({ error: 'Valor de medida inválido.' });
      return;
    }

    const logDate = loggedAt ? new Date(loggedAt) : new Date();

    const updateResult = await pool.query(
      `UPDATE health_body_measures
       SET measure_type = COALESCE($1, measure_type),
           value = $2,
           logged_at = $3,
           notes = $4,
           updated_at = NOW()
       WHERE id = $5 AND user_id = $6
       RETURNING id, measure_type AS "measureType", value::float AS value, logged_at AS "loggedAt", notes, source, updated_at AS "updatedAt"`,
      [measureType || null, valueNum, logDate, notes ? String(notes).trim() : null, id, userId]
    );

    res.json(updateResult.rows[0]);
  } catch (err: any) {
    console.error('[Health] Erro ao editar medição:', err);
    res.status(500).json({ error: 'Erro ao editar medição' });
  }
});

/**
 * DELETE /api/health/measures/:id
 * Exclui uma medição
 */
healthRouter.delete('/measures/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    const { id } = req.params;

    const deleteResult = await pool.query(
      `DELETE FROM health_body_measures WHERE id = $1 AND user_id = $2 RETURNING id`,
      [id, userId]
    );

    if (deleteResult.rows.length === 0) {
      res.status(404).json({ error: 'Medição não encontrada.' });
      return;
    }

    res.json({ success: true, message: 'Medição removida com sucesso.' });
  } catch (err: any) {
    console.error('[Health] Erro ao excluir medição:', err);
    res.status(500).json({ error: 'Erro ao excluir medição' });
  }
});
