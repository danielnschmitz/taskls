import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

// Load .env from project root
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT || '5432', 10),
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || 'admin',
  database: process.env.PGDATABASE || 'taskls',
});

export async function initDatabase(): Promise<void> {
  const client = await pool.connect();
  try {
    console.log('[DB] Inicializando tabelas e migrações no PostgreSQL...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id VARCHAR(36) PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        type VARCHAR(20) NOT NULL,
        priority VARCHAR(20) NOT NULL DEFAULT 'medium',
        category VARCHAR(50) DEFAULT 'Geral',
        due_date DATE,
        weekly_days INTEGER[],
        monthly_type VARCHAR(20),
        monthly_day INTEGER,
        monthly_pattern VARCHAR(20),
        monthly_weekday INTEGER,
        notification_times TEXT[] DEFAULT ARRAY[]::TEXT[],
        is_completed BOOLEAN DEFAULT FALSE,
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS task_completions (
        id SERIAL PRIMARY KEY,
        task_id VARCHAR(36) REFERENCES tasks(id) ON DELETE CASCADE,
        completion_date DATE NOT NULL,
        completed_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(task_id, completion_date)
      );

      CREATE TABLE IF NOT EXISTS task_notifications_sent (
        id SERIAL PRIMARY KEY,
        task_id VARCHAR(36) REFERENCES tasks(id) ON DELETE CASCADE,
        target_date DATE NOT NULL,
        notification_time VARCHAR(10) NOT NULL,
        sent_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(task_id, target_date, notification_time)
      );

      CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks(type);
      CREATE INDEX IF NOT EXISTS idx_completions_task_date ON task_completions(task_id, completion_date);
      CREATE INDEX IF NOT EXISTS idx_notifications_sent ON task_notifications_sent(task_id, target_date, notification_time);

      -- Novas colunas para subtarefas e snooze
      ALTER TABLE tasks ADD COLUMN IF NOT EXISTS subtasks JSONB DEFAULT '[]'::jsonb;
      ALTER TABLE tasks ADD COLUMN IF NOT EXISTS snoozed_until TIMESTAMPTZ DEFAULT NULL;

      -- Tabela de Categorias com cores e ícones
      CREATE TABLE IF NOT EXISTS categories (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        color VARCHAR(20) NOT NULL,
        icon VARCHAR(50) NOT NULL
      );

      -- Tabela de Configurações Globais (DND, etc)
      CREATE TABLE IF NOT EXISTS app_settings (
        key VARCHAR(50) PRIMARY KEY,
        value JSONB NOT NULL
      );

      -- Seed de Categorias Padrão
      INSERT INTO categories (id, name, color, icon) VALUES
        ('trabalho', 'Trabalho', '#6366f1', 'Briefcase'),
        ('estudos', 'Estudos', '#a855f7', 'GraduationCap'),
        ('financas', 'Finanças', '#10b981', 'DollarSign'),
        ('saude', 'Saúde', '#f43f5e', 'HeartPulse'),
        ('casa', 'Casa', '#f59e0b', 'Home'),
        ('estrategia', 'Estratégia', '#06b6d4', 'Target'),
        ('geral', 'Geral', '#64748b', 'CheckSquare')
      ON CONFLICT (id) DO NOTHING;

      -- Seed de Configuração Inicial de DND
      INSERT INTO app_settings (key, value) VALUES
        ('dnd', '{"enabled": false, "until": null}'::jsonb)
      ON CONFLICT (key) DO NOTHING;
    `);

    console.log('[DB] Banco de dados inicializado com sucesso.');
  } catch (error) {
    console.error('[DB] Erro ao inicializar banco de dados:', error);
    throw error;
  } finally {
    client.release();
  }
}
