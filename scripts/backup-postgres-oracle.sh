#!/usr/bin/env bash
# ==============================================================================
# Rotina Automática de Backup PostgreSQL -> Google Drive + Notificação Telegram
# Local no servidor Oracle: /home/ubuntu/scripts/backup-postgres.sh
# Credenciais no servidor:  /home/ubuntu/scripts/.backup.env (chmod 600)
# Cron no servidor:         0 6 * * * (03:00 Horário de Brasília)
# ==============================================================================
set -uo pipefail

export TZ="America/Sao_Paulo"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.backup.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "[ERRO] Arquivo de configuração não encontrado: $ENV_FILE" >&2
  exit 1
fi

set -a
source "$ENV_FILE"
set +a

START_TIME=$(date +%s)
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
DATE_HUMAN=$(date +"%d/%m/%Y às %H:%M:%S")
LOG_FILE="${LOCAL_BACKUP_DIR}/backup.log"

mkdir -p "$LOCAL_BACKUP_DIR"

send_telegram() {
  local message="$1"
  if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ]; then
    curl -sS -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      -d chat_id="${TELEGRAM_CHAT_ID}" \
      -d parse_mode="HTML" \
      --data-urlencode "text=${message}" >/dev/null 2>&1 || true
  fi
}

echo "============================================================" >> "$LOG_FILE"
echo "[$(date +'%Y-%m-%d %H:%M:%S')] Iniciando rotina de backup PostgreSQL..." >> "$LOG_FILE"

# 1. Descobrir todos os bancos de dados (exceto templates e banco administrativo padrão 'postgres')
DATABASES=$(psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d postgres -Atc \
  "SELECT datname FROM pg_database WHERE datistemplate = false AND datname <> 'postgres' ORDER BY datname;" 2>>"$LOG_FILE")

if [ -z "$DATABASES" ]; then
  ERR_MSG="❌ <b>Falha no Backup PostgreSQL (Oracle Cloud)</b>
📅 <b>Data:</b> ${DATE_HUMAN}
⚠️ Nenhum banco de dados encontrado ou erro ao conectar no PostgreSQL."
  echo "[ERRO] Nenhum banco encontrado ou falha na conexão." >> "$LOG_FILE"
  send_telegram "$ERR_MSG"
  exit 1
fi

SUMMARY_LINES=""
ERRORS=0
DB_COUNT=0

# 2. Realizar o dump de cada banco e enviar para o Google Drive
for DB in $DATABASES; do
  DB_COUNT=$((DB_COUNT + 1))
  DB_DIR="${LOCAL_BACKUP_DIR}/${DB}"
  mkdir -p "$DB_DIR"

  DUMP_FILE="${DB_DIR}/${DB}_${TIMESTAMP}.sql.gz"
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] Gerando dump do banco '${DB}'..." >> "$LOG_FILE"

  if pg_dump -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$DB" --no-owner --no-acl | gzip -9 > "$DUMP_FILE" 2>>"$LOG_FILE"; then
    FILE_SIZE=$(du -h "$DUMP_FILE" | cut -f1)
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] Dump concluído: ${DUMP_FILE} (${FILE_SIZE}). Enviando para Google Drive..." >> "$LOG_FILE"

    if rclone copy "$DUMP_FILE" "${GDRIVE_REMOTE}/${DB}/" --log-file="$LOG_FILE" --log-level INFO; then
      SUMMARY_LINES="${SUMMARY_LINES}• <code>${DB}</code> (${FILE_SIZE}) ✔️
"
      echo "[$(date +'%Y-%m-%d %H:%M:%S')] Upload concluído para ${GDRIVE_REMOTE}/${DB}/" >> "$LOG_FILE"
    else
      ERRORS=$((ERRORS + 1))
      SUMMARY_LINES="${SUMMARY_LINES}• <code>${DB}</code> (Falha no upload p/ Drive) ❌
"
      echo "[ERRO] Falha ao enviar ${DUMP_FILE} para o Google Drive." >> "$LOG_FILE"
    fi
  else
    ERRORS=$((ERRORS + 1))
    rm -f "$DUMP_FILE"
    SUMMARY_LINES="${SUMMARY_LINES}• <code>${DB}</code> (Falha no pg_dump) ❌
"
    echo "[ERRO] Falha ao executar pg_dump para o banco ${DB}." >> "$LOG_FILE"
  fi
done

# 3. Limpeza de retenção local (apaga arquivos locais com mais de X dias)
echo "[$(date +'%Y-%m-%d %H:%M:%S')] Limpando backups locais com mais de ${LOCAL_RETENTION_DAYS} dias..." >> "$LOG_FILE"
find "$LOCAL_BACKUP_DIR" -type f -name "*.sql.gz" -mtime +"$LOCAL_RETENTION_DAYS" -delete 2>>"$LOG_FILE" || true

# 4. Limpeza de retenção no Google Drive (apaga arquivos no Drive com mais de Y dias)
echo "[$(date +'%Y-%m-%d %H:%M:%S')] Limpando backups no Google Drive com mais de ${GDRIVE_RETENTION_DAYS} dias..." >> "$LOG_FILE"
rclone delete "${GDRIVE_REMOTE}" --min-age "${GDRIVE_RETENTION_DAYS}d" --include "*.sql.gz" --log-file="$LOG_FILE" --log-level INFO 2>>"$LOG_FILE" || true

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

# 5. Enviar notificação no Telegram
if [ "$ERRORS" -eq 0 ]; then
  MSG="✅ <b>Backup PostgreSQL Concluído com Sucesso!</b>

📅 <b>Data:</b> ${DATE_HUMAN}
🗄️ <b>Bancos processados (${DB_COUNT}):</b>
${SUMMARY_LINES}
☁️ <b>Google Drive:</b> <code>Backups/ViraTempo</code>
🧹 <b>Retenção:</b> ${GDRIVE_RETENTION_DAYS} dias (Drive) / ${LOCAL_RETENTION_DAYS} dias (Servidor)
⏱️ <b>Duração:</b> ${DURATION}s"
  send_telegram "$MSG"
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] Rotina finalizada com sucesso em ${DURATION}s." >> "$LOG_FILE"
  exit 0
else
  MSG="⚠️ <b>Backup PostgreSQL Finalizado com Erros (${ERRORS})</b>

📅 <b>Data:</b> ${DATE_HUMAN}
🗄️ <b>Resultado por banco:</b>
${SUMMARY_LINES}
📄 Verifique o log em <code>${LOG_FILE}</code> no servidor."
  send_telegram "$MSG"
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] Rotina finalizada com ${ERRORS} erro(s) em ${DURATION}s." >> "$LOG_FILE"
  exit 1
fi
