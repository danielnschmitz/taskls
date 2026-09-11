# 🚀 TaskLS Pro - Guia de Instalação e Manual do Usuário

O **TaskLS** é um sistema web moderno, ágil e intuitivo para gestão de tarefas com tema **Dark Mode nativo**, armazenamento em **PostgreSQL**, suporte abrangente a recorrências, agendador de **notificações Toast no Windows**, **Timer Pomodoro**, **Drag & Drop**, **subtarefas/checklists** e inicialização automática em segundo plano.

---

## 📋 Índice
1. [Requisitos do Sistema](#-requisitos-do-sistema)
2. [Passo a Passo de Instalação](#-passo-a-passo-de-instalação)
   - [Passo 1: Clonar ou Baixar o Projeto](#passo-1-clonar-ou-baixar-o-projeto)
   - [Passo 2: Instalar as Dependências](#passo-2-instalar-as-dependências)
   - [Passo 3: Criar o Banco de Dados no PostgreSQL](#passo-3-criar-o-banco-de-dados-no-postgresql)
   - [Passo 4: Configurar as Variáveis de Ambiente (.env)](#passo-4-configurar-as-variáveis-de-ambiente-env)
   - [Passo 5: Compilar a Aplicação (Build)](#passo-5-compilar-a-aplicação-build)
3. [Como Executar a Aplicação](#-como-executar-a-aplicação)
   - [Execução com 1 Clique (Recomendado no Windows)](#1-execução-com-1-clique-recomendado-no-windows)
   - [Execução via Linha de Comando (Terminal)](#2-execução-via-linha-de-comando-terminal)
   - [Modo de Desenvolvimento](#3-modo-de-desenvolvimento)
4. [Inicialização Automática com o Windows](#-inicialização-automática-com-o-windows)
5. [Funcionalidades e Guia de Uso](#-funcionalidades-e-guia-de-uso)
6. [Resolução de Problemas Comuns (Troubleshooting)](#-resolução-de-problemas-comuns-troubleshooting)
7. [Scripts e Comandos Úteis](#-scripts-e-comandos-úteis)

---

## 💻 Requisitos do Sistema

Antes de começar, certifique-se de ter instalado em seu computador:

- **Sistema Operacional**: Windows 10 ou Windows 11 *(necessário para disparar as notificações nativas via WinRT e inicialização em segundo plano)*.
- **Node.js**: Versão `18.x`, `20.x` ou superior ([Baixar Node.js](https://nodejs.org/)).
- **NPM**: Geralmente incluído com o Node.js.
- **PostgreSQL**: Versão `14.x`, `15.x`, `16.x`, `17.x` ou `18.x` ([Baixar PostgreSQL](https://www.postgresql.org/download/windows/)).

---

## 🛠️ Passo a Passo de Instalação

### Passo 1: Clonar ou Baixar o Projeto
Abra o terminal (PowerShell ou CMD) e navegue até o diretório onde deseja instalar a aplicação:

```bash
git clone https://github.com/seu-usuario/taskls.git
cd taskls
```
*(Ou extraia o arquivo ZIP do projeto na pasta de sua preferência).*

---

### Passo 2: Instalar as Dependências
Execute o gerenciador de pacotes do Node para baixar todas as bibliotecas necessárias:

```bash
npm install
```

---

### Passo 3: Criar o Banco de Dados no PostgreSQL

1. Abra o utilitário de linha de comando do PostgreSQL (**psql**) ou o **pgAdmin**:
   ```sql
   CREATE DATABASE taskls;
   ```
2. **Nota**: Você **não precisa** executar scripts de criação de tabelas manualmente! Ao iniciar pela primeira vez, o servidor do TaskLS executa migrações automáticas criando todas as tabelas, índices e categorias padrão necessárias.

---

### Passo 4: Configurar as Variáveis de Ambiente (.env)

Na raiz do projeto, você encontrará o arquivo `.env.example`. Copie ou crie um arquivo chamado `.env` com as configurações do seu banco de dados:

```env
# Porta onde o servidor TaskLS irá rodar
PORT=3333

# Conexão com o Banco de Dados PostgreSQL
PGHOST=localhost
PGPORT=5432
PGUSER=postgres
PGPASSWORD=admin
PGDATABASE=taskls
```

> **Dica**: Altere `PGPASSWORD` para a senha do seu usuário `postgres` definida durante a instalação do PostgreSQL.

---

### Passo 5: Compilar a Aplicação (Build)

Para compilar o frontend (React + Tailwind CSS v4 com Vite) e o backend (TypeScript):

```bash
npm run build
```

Esse comando irá gerar as pastas compiladas prontas para execução:
- `dist/client/`: arquivos estáticos da interface web.
- `dist/server/`: código transpilado do servidor Node.js.

---

## 🚀 Como Executar a Aplicação

### 1. Execução com 1 Clique (Recomendado no Windows)
Na pasta do projeto, basta dar um **duplo clique** no arquivo:
👉 **`iniciar.bat`**

O script irá:
1. Iniciar o servidor TaskLS em segundo plano de forma silenciosa (sem deixar janelas pretas de terminal abertas).
2. Abrir automaticamente seu navegador padrão no endereço: **`http://localhost:3333`**.

---

### 2. Execução via Linha de Comando (Terminal)
Caso prefira rodar no terminal:
```bash
npm start
```
Após a mensagem de inicialização, acesse no navegador:
👉 **http://localhost:3333**

---

### 3. Modo de Desenvolvimento
Caso queira editar o código e ver alterações em tempo real (Hot Reloading):
```bash
npm run dev
```

---

## ⚙️ Inicialização Automática com o Windows

O TaskLS pode iniciar silenciosamente sempre que você ligar ou reiniciar o computador, garantindo que suas notificações de tarefas continuem ativas mesmo se você não estiver com o navegador aberto.

### Opção A: Pela Interface Web (Recomendado)
1. Abra o TaskLS no navegador (`http://localhost:3333`).
2. No cabeçalho superior direito, clique no botão **"Iniciar c/ Windows"** para alternar para **ATIVADO**.

### Opção B: Por Script Batch
- Para **ativar**: Dê duplo clique em `scripts\instalar-inicializacao.bat`.
- Para **desativar**: Dê duplo clique em `scripts\desinstalar-inicializacao.bat`.

---

## ✨ Funcionalidades e Guia de Uso

### 📅 1. Painel da Semana Atual (Tarefas Semanais & Calendário)
- Exibe as 7 colunas da semana atual (Segunda a Domingo).
- **Semana e Hoje**: Destaca o dia de hoje e permite navegar entre semanas anteriores e próximas.
- **Visual Clean**: Cada card exibe apenas o essencial: título, subtarefas, prioridade e categoria.
- **Ações Rápidas sem Estouro**: Ao passar o mouse sobre o card, uma barra flutuante no canto superior direito permite **Adiar (Snooze)**, **Editar** ou **Excluir**.
- **Modo Foco ("Apenas Hoje")**: Clique no botão *Modo Foco* para isolar e expandir a coluna do dia atual, eliminando distrações.

### 📌 2. Painel Agenda & Mensais
- Lista cronológica de tarefas de **ocorrência única** (com data definida) e tarefas **mensais**.
- Suporte a recorrência mensal flexível:
  - *Dia fixo*: ex. todo dia 15.
  - *Padrão relativo*: ex. última sexta-feira do mês, 1ª segunda-feira, etc.
- Badges dinâmicos indicando status temporal (*Hoje*, *Amanhã*, *Atrasada*).

### 📥 3. Painel Backlog (Sem Data)
- Armazene ideias, tarefas futuras e pendências sem data específica.
- **Agendar com 1 Clique**: Clique no botão "Agendar para Hoje" para transformar qualquer item do backlog em tarefa do dia.

### 🖐️ 4. Arrastar e Soltar (Drag & Drop)
- Arraste tarefas do Backlog ou entre dias da semana e solte na coluna desejada para reagendá-las instantaneamente.

### ☑️ 5. Checklists / Subtarefas Interativas
- Crie subtarefas dentro de qualquer tarefa.
- Marque ou desmarque subitens **diretamente no card** no painel sem precisar abrir o formulário de edição.
- Mini barra de progresso visual em cada card com subtarefas.

### ⏱️ 6. Timer Pomodoro Integrado
- Localizado no cabeçalho: blocos de **Foco (25m)**, **Pausa Curta (5m)** e **Pausa Longa (15m)**.
- Dispara um **som harmônico suave** e uma **notificação Toast no Windows** ao terminar cada ciclo.

### 📊 7. Barra de Progresso Semanal
- Exibe o percentual concluído da semana em tempo real, tarefas concluídas hoje e mensagens dinâmicas motivacionais.

### 🎨 8. Cores e Ícones por Categoria
- Categorias estilizadas com ícones temáticos (💼 *Trabalho*, 📚 *Estudos*, 💰 *Finanças*, 🏋️ *Saúde*, 🏠 *Casa*, 🎯 *Estratégia*, etc.).
- Filtro por categoria no cabeçalho.

### ⏰ 9. Função Adiar Alerta (Snooze)
- Clique no ícone de relógio no card para adiar o alerta da tarefa em **+15 min**, **+30 min** ou **+1 hora**.
- O agendador suspende alertas temporariamente e mostra um badge com o novo horário.

### 🔕 10. Modo "Não Perturbe" (DND)
- Botão no cabeçalho para silenciar todos os alertas sonoros e notificações por **1h**, **2h** ou **indefinidamente**.

### 💾 11. Backup, Exportação e Restauração em 1 Clique
- Clique no botão de **Backup** no cabeçalho:
  - **Exportar JSON**: Backup estruturado completo com tarefas, subtarefas e categorias.
  - **Exportar CSV**: Planilha compatível com Microsoft Excel e Google Sheets.
  - **Importar JSON**: Restaure ou migre tarefas selecionando um backup anterior, com opção de **Mesclar** ou **Substituir tudo**.

---

## ❓ Resolução de Problemas Comuns (Troubleshooting)

### 1. Erro de Conexão com o PostgreSQL (`ECONNREFUSED`)
- **Causa**: O serviço do PostgreSQL não está rodando ou as credenciais no `.env` estão incorretas.
- **Solução**:
  1. Abra os *Serviços do Windows* (`services.msc`), procure por `postgresql-x64-...` e certifique-se de que está com status **Em Execução**.
  2. Abra o arquivo `.env` e confirme se `PGUSER`, `PGPASSWORD`, `PGPORT` e `PGDATABASE` estão corretos.

### 2. Notificações do Windows não aparecem
- **Causa**: O recurso de "Assistente de Foco" ou as notificações do PowerShell/Windows podem estar silenciadas.
- **Solução**:
  1. Abra as **Configurações do Windows** > **Sistema** > **Notificações**.
  2. Verifique se as **Notificações** gerais estão ativadas.
  3. Desative o *Assistente de Foco* ou adicione prioridade para notificações de terminal/PowerShell.

### 3. Porta 3333 já em uso (`EADDRINUSE`)
- **Causa**: Outra instância do servidor TaskLS já está rodando ou outro programa ocupa a porta.
- **Solução**:
  1. No arquivo `.env`, altere `PORT=3333` para outra porta disponível (ex: `PORT=3334`).
  2. Execute `npm run build` e inicie novamente.

---

## 📜 Scripts e Comandos Úteis

| Comando | Descrição |
| :--- | :--- |
| `npm install` | Instala todas as dependências do projeto |
| `npm run build` | Compila o frontend (Vite) e backend (TypeScript) |
| `npm start` | Inicia o servidor em modo de produção |
| `npm run dev` | Inicia servidor e frontend em modo de desenvolvimento |
| `iniciar.bat` | Inicia o servidor em segundo plano e abre o navegador |
| `scripts\instalar-inicializacao.bat` | Registra o TaskLS para iniciar com o Windows |
| `scripts\desinstalar-inicializacao.bat` | Remove o TaskLS da inicialização do Windows |

---

## 📄 Licença
Distribuído sob a licença ISC. Desenvolvido para máxima produtividade diária!
