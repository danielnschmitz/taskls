import dotenv from 'dotenv';
import path from 'path';

// Carregar variáveis de ambiente do arquivo .env
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Definir fuso horário padrão para sincronização de agendamentos (America/Sao_Paulo)
process.env.TZ = process.env.TZ || 'America/Sao_Paulo';

import express from 'express';
import cors from 'cors';
import fs from 'fs';
import { pool, initDatabase } from './db';
import { router } from './routes';
import { authRouter } from './authRoutes';
import { userRoutes } from './userRoutes';
import { cardRouter } from './cardRoutes';
import { healthRouter } from './healthRoutes';
import { dashboardRoutes } from './dashboardRoutes';
import { authenticateToken, requireAdmin, requireModule } from './auth';
import { startScheduler, stopScheduler } from './scheduler';
import { processWebhookPayload, migrateAdfEventsInDb, startJiraSyncScheduler, stopJiraSyncScheduler } from './jiraEvents';
import { startTelegramBotService, stopTelegramBotService } from './telegramBot';

const app = express();
const PORT = process.env.PORT || 3333;

app.use(cors());
app.use(express.json());

// API Routes
// 1. Rotas de autenticação (login público)
app.use('/api/auth', authRouter);

// 2. Webhook público do Jira (recebe POST direto da nuvem Atlassian)
app.get('/api/jira/webhook', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'TaskLS Jira Webhook endpoint is active and listening.' });
});

app.post('/api/jira/webhook', async (req, res) => {
  try {
    const result = await processWebhookPayload(req.body);
    res.status(200).json({ success: true, ...result });
  } catch (err: any) {
    console.error('[Jira Webhook] Erro ao processar payload:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Rotas de gestão de usuários (exclusivo admin)
app.use('/api/users', authenticateToken, requireAdmin, userRoutes);

// 4. Rotas do módulo de Escrita de Cards
app.use('/api/cards', authenticateToken, requireModule('cards'), cardRouter);

// 5. Rotas do módulo de Saúde & Peso
app.use('/api/health', authenticateToken, requireModule('health'), healthRouter);

// 6. Rotas do módulo de Dashboards Analíticos
app.use('/api/dashboards', authenticateToken, requireModule('dashboards'), dashboardRoutes);

// 7. Todas as demais rotas da API são protegidas por autenticação
app.use('/api', authenticateToken, router);

// Serve static frontend files if built
const clientDistPath = path.resolve(process.cwd(), 'dist/client');
if (fs.existsSync(clientDistPath)) {
  console.log(`[Server] Servindo frontend a partir de: ${clientDistPath}`);

  // Header específico para Service Worker
  app.get('/sw.js', (req, res) => {
    res.setHeader('Service-Worker-Allowed', '/');
    res.setHeader('Content-Type', 'application/javascript');
    res.sendFile(path.join(clientDistPath, 'sw.js'));
  });

  app.use(express.static(clientDistPath));

  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      return res.sendFile(path.join(clientDistPath, 'index.html'));
    }
    next();
  });
} else {
  console.log('[Server] Frontend ainda não compilado em dist/client (modo de desenvolvimento).');
  app.get('/', (req, res) => {
    res.send('Servidor TaskLS API em execução. Execute `npm run dev` para iniciar o frontend em Vite.');
  });
}

// Start application
async function bootstrap() {
  try {
    await initDatabase();
    await migrateAdfEventsInDb();
    startScheduler(30000); // Check notifications every 30 seconds
    startJiraSyncScheduler(5 * 60 * 1000); // Sync Jira evolutions automatically every 5 minutes
    startTelegramBotService(); // Inicia serviço do Telegram Bot

    app.listen(PORT, () => {
      console.log(`\n==================================================`);
      console.log(`  🚀 TaskLS Servidor Web rodando em:`);
      console.log(`  👉 http://localhost:${PORT}`);
      console.log(`==================================================\n`);
    });
  } catch (err) {
    console.error('[Server] Falha fatal ao inicializar servidor:', err);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n[Server] Encerrando TaskLS...');
  stopScheduler();
  stopJiraSyncScheduler();
  stopTelegramBotService();
  await pool.end();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n[Server] Encerrando TaskLS...');
  stopScheduler();
  stopJiraSyncScheduler();
  stopTelegramBotService();
  await pool.end();
  process.exit(0);
});

bootstrap();
