import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';

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

      -- Tabela de Usuários para Autenticação
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(36) PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        salt VARCHAR(64) NOT NULL,
        is_default_password BOOLEAN DEFAULT TRUE,
        is_admin BOOLEAN DEFAULT FALSE,
        can_access_jira BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- Migrações incrementais para tabela de usuários
      ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS can_access_jira BOOLEAN DEFAULT FALSE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS allowed_modules TEXT[] DEFAULT ARRAY['tasks', 'cards']::TEXT[];
      UPDATE users SET allowed_modules = ARRAY['tasks', 'cards'] WHERE allowed_modules IS NULL;

      -- Vincular tarefas ao usuário
      ALTER TABLE tasks ADD COLUMN IF NOT EXISTS user_id VARCHAR(36) REFERENCES users(id) ON DELETE CASCADE;
      CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);

      -- Fila de Notificações para o Navegador
      CREATE TABLE IF NOT EXISTS notification_queue (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        task_id VARCHAR(36),
        user_id VARCHAR(36) REFERENCES users(id) ON DELETE CASCADE,
        delivered BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_notification_queue_delivered ON notification_queue(delivered);
      ALTER TABLE notification_queue ADD COLUMN IF NOT EXISTS user_id VARCHAR(36) REFERENCES users(id) ON DELETE CASCADE;
      CREATE INDEX IF NOT EXISTS idx_notification_queue_user_id ON notification_queue(user_id);

      -- Módulo de Escrita de Cards: Templates de Card
      CREATE TABLE IF NOT EXISTS card_templates (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        category VARCHAR(50) DEFAULT 'Geral',
        content TEXT NOT NULL,
        is_system BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_card_templates_user_id ON card_templates(user_id);

      -- Módulo de Escrita de Cards: Histórico de Cards Salvos
      CREATE TABLE IF NOT EXISTS saved_cards (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) REFERENCES users(id) ON DELETE CASCADE,
        template_id VARCHAR(36) REFERENCES card_templates(id) ON DELETE SET NULL,
        template_title VARCHAR(255),
        title VARCHAR(255) NOT NULL,
        macro_values JSONB DEFAULT '{}'::jsonb,
        content_markdown TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_saved_cards_user_id ON saved_cards(user_id);

      -- Módulo Jira: Tabela de Eventos e Evoluções para Revisão
      CREATE TABLE IF NOT EXISTS jira_review_events (
        id SERIAL PRIMARY KEY,
        event_id VARCHAR(120) UNIQUE NOT NULL,
        issue_key VARCHAR(50) NOT NULL,
        issue_id VARCHAR(50),
        project_key VARCHAR(50) NOT NULL,
        summary TEXT NOT NULL,
        event_type VARCHAR(50) NOT NULL,
        author_name VARCHAR(100),
        author_avatar TEXT,
        event_time TIMESTAMPTZ NOT NULL,
        diff_data JSONB NOT NULL DEFAULT '{}'::jsonb,
        card_data JSONB NOT NULL DEFAULT '{}'::jsonb,
        is_reviewed BOOLEAN DEFAULT FALSE,
        reviewed_at TIMESTAMPTZ,
        reviewed_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_jira_events_reviewed ON jira_review_events(is_reviewed);
      CREATE INDEX IF NOT EXISTS idx_jira_events_event_time ON jira_review_events(event_time DESC);
      CREATE INDEX IF NOT EXISTS idx_jira_events_proj ON jira_review_events(project_key);
      CREATE INDEX IF NOT EXISTS idx_jira_events_issue_key ON jira_review_events(issue_key);
    `);

    // Seed de Usuário Administrador Inicial (se não houver nenhum)
    const userCountRes = await client.query('SELECT COUNT(*) FROM users');
    if (parseInt(userCountRes.rows[0].count, 10) === 0) {
      const initialUser = process.env.INITIAL_ADMIN_USER || 'admin';
      const initialPassword = process.env.INITIAL_ADMIN_PASSWORD || 'admin';
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = crypto.pbkdf2Sync(initialPassword, salt, 100000, 64, 'sha512').toString('hex');
      const userId = crypto.randomUUID();

      await client.query(
        `INSERT INTO users (id, username, password_hash, salt, is_default_password, is_admin, can_access_jira)
         VALUES ($1, $2, $3, $4, TRUE, TRUE, TRUE)`,
        [userId, initialUser, hash, salt]
      );
      console.log(`[DB] Usuário administrador inicial criado: ${initialUser}`);
    }

    // Garantir que o usuário 'admin' tenha permissões de administrador e Jira ativas
    await client.query(
      `UPDATE users SET is_admin = TRUE, can_access_jira = TRUE WHERE LOWER(username) = 'admin'`
    );

    // Migrar tarefas e notificações antigas sem user_id para o usuário admin
    const adminQuery = await client.query(`SELECT id FROM users WHERE LOWER(username) = 'admin' LIMIT 1`);
    if (adminQuery.rows.length > 0) {
      const adminId = adminQuery.rows[0].id;
      const updatedTasks = await client.query(
        `UPDATE tasks SET user_id = $1 WHERE user_id IS NULL`,
        [adminId]
      );
      if (updatedTasks.rowCount && updatedTasks.rowCount > 0) {
        console.log(`[DB] ${updatedTasks.rowCount} tarefas antigas migradas para o usuário admin (${adminId}).`);
      }

      await client.query(
        `UPDATE notification_queue SET user_id = $1 WHERE user_id IS NULL`,
        [adminId]
      );
    }

    // Seed de Templates Padrão de Card (se a tabela estiver vazia)
    const templateCountRes = await client.query('SELECT COUNT(*) FROM card_templates');
    if (parseInt(templateCountRes.rows[0].count, 10) === 0) {
      console.log('[DB] Criando templates padrão de card...');
      const defaultTemplates = [
        {
          id: 'template-user-story',
          title: 'História de Usuário (User Story)',
          description: 'Estrutura padrão ágil com Como, Quero, Para que, Critérios de Aceite e Regras de Negócio.',
          category: 'Ágil',
          content: `# [{{ID_OU_CHAVE}}] {{Título da História}}

### 👤 Como:
{{Como (Papel do Usuário)}}

### 🎯 Quero:
{{Quero (Necessidade / Ação)}}

### 💡 Para que:
{{Para que (Benefício / Valor de Negócio)}}

---

### 📋 Critérios de Aceitação:
{{Critérios de Aceitação}}

### ⚙️ Regras de Negócio & Validações:
{{Regras de Negócio}}

### 📌 Observações Técnicas:
{{Observações Técnicas}}`,
          is_system: true,
        },
        {
          id: 'template-bug-report',
          title: 'Reporte de Bug / Defeito',
          description: 'Modelo completo para descrição de falhas, passos de reprodução, logs e comportamentos.',
          category: 'Qualidade',
          content: `# 🐛 [BUG] {{Título do Defeito}}

### 📍 Cenário / Ambiente:
{{Ambiente (Ex: Produção, HML, Navegador)}}

### 📝 Descrição do Problema:
{{Descrição do Problema}}

### 🔁 Passos para Reprodução:
{{Passos para Reprodução}}

### ❌ Comportamento Atual:
{{Comportamento Atual}}

### ✅ Comportamento Esperado:
{{Comportamento Esperado}}

### 📎 Evidências / Logs:
{{Evidências e Logs}}`,
          is_system: true,
        },
        {
          id: 'template-tech-task',
          title: 'Demanda Técnica / Task',
          description: 'Estrutura para refatorações, infraestrutura, modelagens de banco de dados e integrações.',
          category: 'Técnico',
          content: `# 🛠️ [TASK] {{Título da Tarefa}}

### 🎯 Objetivo:
{{Objetivo da Tarefa}}

### 📋 Escopo Técnico:
{{Escopo da Solução Técnica}}

### 🔍 Pré-requisitos & Dependências:
{{Dependências}}

### 🧪 Plano de Testes & Validação:
{{Plano de Testes}}`,
          is_system: true,
        },
      ];

      for (const t of defaultTemplates) {
        await client.query(
          `INSERT INTO card_templates (id, title, description, category, content, is_system)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (id) DO NOTHING`,
          [t.id, t.title, t.description, t.category, t.content, t.is_system]
        );
      }
    }

    console.log('[DB] Banco de dados inicializado com sucesso.');
  } catch (error) {
    console.error('[DB] Erro ao inicializar banco de dados:', error);
    throw error;
  } finally {
    client.release();
  }
}
