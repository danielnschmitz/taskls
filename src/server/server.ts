import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { pool, initDatabase } from './db';
import { router } from './routes';
import { authRouter } from './authRoutes';
import { userRoutes } from './userRoutes';
import { authenticateToken, requireAdmin } from './auth';
import { startScheduler, stopScheduler } from './scheduler';

const app = express();
const PORT = process.env.PORT || 3333;

app.use(cors());
app.use(express.json());

// API Routes
// 1. Rotas de autenticação (login público)
app.use('/api/auth', authRouter);

// 2. Rotas de gestão de usuários (exclusivo admin)
app.use('/api/users', authenticateToken, requireAdmin, userRoutes);

// 3. Todas as demais rotas da API são protegidas por autenticação
app.use('/api', authenticateToken, router);

// Serve static frontend files if built
const clientDistPath = path.resolve(process.cwd(), 'dist/client');
if (fs.existsSync(clientDistPath)) {
  console.log(`[Server] Servindo frontend a partir de: ${clientDistPath}`);
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
    startScheduler(30000); // Check every 30 seconds

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
  await pool.end();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n[Server] Encerrando TaskLS...');
  stopScheduler();
  await pool.end();
  process.exit(0);
});

bootstrap();
