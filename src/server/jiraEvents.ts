import { pool } from './db';
import { getJiraConfig, formatDisplayStatus, getAuthHeader, executeJqlSearch, JiraDemand, JiraConfig, DEFAULT_IGNORED_FIELDS, isFieldIgnored } from './jira';

export type JiraEventType =
  | 'status_changed'
  | 'flagged_changed'
  | 'comment_added'
  | 'issue_created'
  | 'assignee_changed'
  | 'field_updated';

export interface JiraEventDiff {
  field: string;
  label: string;
  from?: string | null;
  to?: string | null;
  text?: string;
  isBlocked?: boolean;
  [key: string]: any;
}

export interface JiraReviewEvent {
  id: number;
  eventId: string;
  issueKey: string;
  issueId?: string;
  projectKey: string;
  summary: string;
  eventType: JiraEventType;
  authorName: string;
  authorAvatar?: string | null;
  eventTime: string;
  diff: JiraEventDiff;
  cardData: JiraDemand;
  isReviewed: boolean;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  createdAt: string;
}

/**
 * Extrai texto legível de um documento ADF (Atlassian Document Format) ou string JSON
 */
export function extractAdfText(node: any): string {
  if (!node) return '';

  if (typeof node === 'string') {
    const trimmed = node.trim();
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && (parsed.type === 'doc' || parsed.content || Array.isArray(parsed))) {
          return extractAdfText(parsed);
        }
      } catch {}
    }
    return node;
  }

  if (Array.isArray(node)) {
    return node.map(extractAdfText).join('');
  }

  if (typeof node !== 'object') {
    return String(node);
  }

  switch (node.type) {
    case 'text': {
      const text = node.text || '';
      const linkMark = node.marks?.find((m: any) => m.type === 'link');
      if (linkMark && linkMark.attrs?.href && linkMark.attrs.href !== text) {
        return `${text} (${linkMark.attrs.href})`;
      }
      return text;
    }

    case 'mention':
      return node.attrs?.text || (node.attrs?.displayName ? `@${node.attrs.displayName}` : '@usuário');

    case 'emoji':
      return node.attrs?.text || node.attrs?.shortName || '';

    case 'hardBreak':
      return '\n';

    case 'paragraph': {
      const inner = node.content ? node.content.map(extractAdfText).join('') : '';
      return inner ? `${inner}\n` : '\n';
    }

    case 'heading': {
      const inner = node.content ? node.content.map(extractAdfText).join('') : '';
      return inner ? `${inner}\n` : '\n';
    }

    case 'bulletList':
    case 'orderedList': {
      const items = node.content ? node.content.map(extractAdfText).join('') : '';
      return items ? `\n${items}` : '';
    }

    case 'listItem': {
      const inner = node.content ? node.content.map(extractAdfText).join('').trim() : '';
      return inner ? `• ${inner}\n` : '';
    }

    case 'blockquote': {
      const inner = node.content ? node.content.map(extractAdfText).join('').trim() : '';
      return inner ? `> ${inner}\n` : '';
    }

    case 'codeBlock': {
      const inner = node.content ? node.content.map(extractAdfText).join('') : '';
      return `\n\`\`\`\n${inner}\n\`\`\`\n`;
    }

    case 'panel': {
      const inner = node.content ? node.content.map(extractAdfText).join('').trim() : '';
      return inner ? `[${inner}]\n` : '';
    }

    case 'inlineCard':
    case 'blockCard':
      return node.attrs?.url ? `${node.attrs.url} ` : '';

    case 'media':
    case 'mediaSingle':
    case 'mediaGroup':
      return '[Anexo/Imagem]';

    case 'table': {
      const inner = node.content ? node.content.map(extractAdfText).join('') : '';
      return `\n${inner}\n`;
    }

    case 'tableRow': {
      const cells = node.content ? node.content.map((c: any) => extractAdfText(c).trim()).filter(Boolean) : [];
      return cells.length > 0 ? `${cells.join(' | ')}\n` : '';
    }

    case 'tableHeader':
    case 'tableCell': {
      return node.content ? node.content.map(extractAdfText).join('').trim() : '';
    }

    case 'rule':
      return '\n---\n';

    case 'doc':
    default: {
      if (node.content && Array.isArray(node.content)) {
        return node.content.map(extractAdfText).join('');
      }
      return '';
    }
  }
}

/**
 * Limpa marcações brutas do Jira e converte ADF em texto limpo e legível
 */
export function cleanAndFormatJiraText(input: any): string {
  if (!input) return '';
  const rawText = typeof input === 'object' ? extractAdfText(input) : extractAdfText(String(input));
  return rawText
    .replace(/\{panel:[^}]*\}/gi, '')
    .replace(/\{panel\}/gi, '')
    .replace(/\{color:[^}]*\}/gi, '')
    .replace(/\{color\}/gi, '')
    .replace(/\{noformat\}/gi, '')
    .replace(/\{code:[^}]*\}/gi, '')
    .replace(/\{code\}/gi, '')
    .replace(/\{quote\}/gi, '')
    .replace(/!https?:\/\/[^!\n]+!/gi, '[Imagem Anexada]')
    .replace(/!\[\^[^\]]+\]!/gi, '[Anexo]')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Cria snapshot de JiraDemand a partir do payload de uma issue
 */
export function buildCardSnapshot(issue: any, host: string, config: JiraConfig): JiraDemand {
  const projKey = issue.fields?.project?.key || '';
  const projName = issue.fields?.project?.name || projKey;
  const rawStatus = issue.fields?.status?.name || 'Desconhecido';
  const displayStatus = formatDisplayStatus(projKey, rawStatus);

  let epicInfo: { key: string; summary?: string } | null = null;
  if (issue.fields?.parent) {
    epicInfo = {
      key: issue.fields.parent.key,
      summary: issue.fields.parent.fields?.summary || issue.fields.parent.key,
    };
  }

  let assigneeInfo: { displayName: string; avatarUrl?: string } | null = null;
  if (issue.fields?.assignee) {
    assigneeInfo = {
      displayName: issue.fields.assignee.displayName || issue.fields.assignee.name || 'Sem nome',
      avatarUrl:
        issue.fields.assignee.avatarUrls?.['32x32'] ||
        issue.fields.assignee.avatarUrls?.['24x24'],
    };
  }

  const industryField = config.custom_fields?.industry || 'customfield_10780';
  const layoutField = config.custom_fields?.layout || 'customfield_10714';
  const flaggedField = (config.custom_fields as any)?.flagged || 'customfield_10021';

  const industryVal = issue.fields?.[industryField]?.value || issue.fields?.[industryField] || null;
  const layoutVal = issue.fields?.[layoutField]?.value || issue.fields?.[layoutField] || null;

  const flaggedVal =
    issue.fields?.[flaggedField] ??
    issue.fields?.customfield_10021 ??
    issue.fields?.['Flagged[Checkboxes]'] ??
    issue.fields?.flagged;

  let isBlocked = false;
  let blockedReason: string | null = null;

  if (Array.isArray(flaggedVal)) {
    for (const item of flaggedVal) {
      const valStr = (typeof item === 'string' ? item : item?.value || '').trim();
      if (valStr.toLowerCase().includes('impediment') || valStr.toLowerCase().includes('impedimento')) {
        isBlocked = true;
        blockedReason = valStr;
        break;
      }
    }
  } else if (typeof flaggedVal === 'string') {
    const valStr = flaggedVal.trim();
    if (valStr.toLowerCase().includes('impediment') || valStr.toLowerCase().includes('impedimento')) {
      isBlocked = true;
      blockedReason = valStr;
    }
  } else if (flaggedVal && typeof flaggedVal === 'object') {
    const valStr = (flaggedVal.value || '').trim();
    if (valStr.toLowerCase().includes('impediment') || valStr.toLowerCase().includes('impedimento')) {
      isBlocked = true;
      blockedReason = valStr;
    }
  }

  return {
    id: issue.id,
    key: issue.key,
    summary: issue.fields?.summary || 'Sem resumo',
    duedate: issue.fields?.duedate,
    project: {
      key: projKey,
      name: projName,
    },
    rawStatus,
    displayStatus,
    assignee: assigneeInfo,
    epic: epicInfo,
    industry: typeof industryVal === 'string' ? industryVal : null,
    layout: typeof layoutVal === 'string' ? layoutVal : null,
    isBlocked,
    blockedReason,
    url: `https://${host}/browse/${issue.key}`,
  };
}

/**
 * Salva um evento de revisão no banco com desduplicação por event_id
 */
export async function saveJiraEvent(event: {
  eventId: string;
  issueKey: string;
  issueId?: string;
  projectKey: string;
  summary: string;
  eventType: JiraEventType;
  authorName: string;
  authorAvatar?: string | null;
  eventTime: string;
  diff: JiraEventDiff;
  cardData: JiraDemand;
}): Promise<{ isNew: boolean }> {
  const query = `
    INSERT INTO jira_review_events (
      event_id, issue_key, issue_id, project_key, summary,
      event_type, author_name, author_avatar, event_time,
      diff_data, card_data, is_reviewed, created_at
    ) VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8, $9,
      $10, $11, FALSE, NOW()
    )
    ON CONFLICT (event_id) DO UPDATE SET
      summary = EXCLUDED.summary,
      card_data = EXCLUDED.card_data
    WHERE jira_review_events.is_reviewed = FALSE
    RETURNING (xmax = 0) AS is_new_insert
  `;

  const values = [
    event.eventId,
    event.issueKey,
    event.issueId || null,
    event.projectKey,
    event.summary,
    event.eventType,
    event.authorName || 'Jira',
    event.authorAvatar || null,
    event.eventTime,
    JSON.stringify(event.diff),
    JSON.stringify(event.cardData),
  ];

  const res = await pool.query(query, values);
  const isNew = res.rows.length > 0 && res.rows[0].is_new_insert === true;
  return { isNew };
}

/**
 * Processa payload recebido via Webhook do Jira
 */
export async function processWebhookPayload(payload: any): Promise<{ processed: number; events: string[] }> {
  if (!payload || typeof payload !== 'object') {
    return { processed: 0, events: [] };
  }

  const config = await getJiraConfig();
  const host = config.domain.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const webhookEvent = payload.webhookEvent || '';
  const issue = payload.issue;

  if (!issue || !issue.key) {
    return { processed: 0, events: [] };
  }

  const projKey = issue.fields?.project?.key || '';
  // Se houver restrição de projetos configurada, ignora outros projetos
  if (config.projects && config.projects.length > 0) {
    const isAllowed = config.projects.some((p) => p.toUpperCase() === projKey.toUpperCase());
    if (!isAllowed) {
      return { processed: 0, events: [] };
    }
  }

  const cardSnapshot = buildCardSnapshot(issue, host, config);
  const user = payload.user || {};
  const authorName = user.displayName || user.name || 'Jira';
  const authorAvatar = user.avatarUrls?.['32x32'] || user.avatarUrls?.['24x24'] || null;
  const eventTime = payload.timestamp
    ? new Date(payload.timestamp).toISOString()
    : new Date().toISOString();

  let processedCount = 0;
  const eventsSaved: string[] = [];

  // 1. Criação de Issue
  if (webhookEvent === 'jira:issue_created') {
    const eventId = `iss-${issue.key}-created`;
    const saveRes = await saveJiraEvent({
      eventId,
      issueKey: issue.key,
      issueId: issue.id,
      projectKey: projKey,
      summary: issue.fields?.summary || cardSnapshot.summary,
      eventType: 'issue_created',
      authorName,
      authorAvatar,
      eventTime,
      diff: {
        field: 'created',
        label: 'Card Criado',
        issueType: issue.fields?.issuetype?.name || 'Demanda',
        priority: issue.fields?.priority?.name || 'Média',
      },
      cardData: cardSnapshot,
    });
    if (saveRes.isNew) {
      processedCount++;
      eventsSaved.push(eventId);
    }
  }

  // 2. Novo Comentário
  if (webhookEvent === 'comment_created' || (webhookEvent === 'jira:issue_updated' && payload.comment)) {
    const comment = payload.comment;
    if (comment && comment.id) {
      const commentAuthor = comment.author?.displayName || authorName;
      const commentAvatar = comment.author?.avatarUrls?.['32x32'] || authorAvatar;
      const commentTime = comment.created ? new Date(comment.created).toISOString() : eventTime;
      const eventId = `cmt-${issue.key}-${comment.id}`;

      const saveRes = await saveJiraEvent({
        eventId,
        issueKey: issue.key,
        issueId: issue.id,
        projectKey: projKey,
        summary: issue.fields?.summary || cardSnapshot.summary,
        eventType: 'comment_added',
        authorName: commentAuthor,
        authorAvatar: commentAvatar,
        eventTime: commentTime,
        diff: {
          field: 'comment',
          label: 'Novo Comentário',
          text: cleanAndFormatJiraText(comment.body),
          commentId: comment.id,
        },
        cardData: cardSnapshot,
      });
      if (saveRes.isNew) {
        processedCount++;
        eventsSaved.push(eventId);
      }
    }
  }

  // 3. Atualizações de Campos (Changelog)
  const changelog = payload.changelog;
  if (changelog && Array.isArray(changelog.items)) {
    const ignoredList = config.ignored_fields || DEFAULT_IGNORED_FIELDS;
    for (const item of changelog.items) {
      if (isFieldIgnored(item.field, ignoredList)) {
        continue;
      }

      const field = (item.field || '').toLowerCase();
      let eventType: JiraEventType = 'field_updated';
      let label = `Campo ${item.field}`;
      let diffData: JiraEventDiff = {
        field: item.field,
        label,
        from: cleanAndFormatJiraText(item.fromString),
        to: cleanAndFormatJiraText(item.toString),
      };

      if (field === 'status') {
        eventType = 'status_changed';
        label = 'Mudança de Status';
        diffData = {
          field: 'status',
          label,
          from: formatDisplayStatus(projKey, item.fromString || ''),
          to: formatDisplayStatus(projKey, item.toString || ''),
        };
      } else if (field.includes('flagged') || field.includes('impediment')) {
        eventType = 'flagged_changed';
        const isBlocked = (item.toString || '').toLowerCase().includes('impediment');
        label = isBlocked ? 'Impedimento Adicionado (Bloqueado)' : 'Impedimento Removido';
        diffData = {
          field: 'flagged',
          label,
          from: item.fromString,
          to: item.toString,
          isBlocked,
        };
      } else if (field === 'assignee') {
        eventType = 'assignee_changed';
        label = 'Troca de Responsável';
        diffData = {
          field: 'assignee',
          label,
          from: item.fromString || 'Não atribuído',
          to: item.toString || 'Não atribuído',
        };
      } else if (field === 'duedate') {
        eventType = 'field_updated';
        label = 'Data de Entrega Alterada';
        diffData = {
          field: 'duedate',
          label,
          from: item.fromString || 'Sem prazo',
          to: item.toString || 'Sem prazo',
        };
      }

      const eventId = `chg-${issue.key}-${changelog.id}-${item.field}`;
      const saveRes = await saveJiraEvent({
        eventId,
        issueKey: issue.key,
        issueId: issue.id,
        projectKey: projKey,
        summary: issue.fields?.summary || cardSnapshot.summary,
        eventType,
        authorName,
        authorAvatar,
        eventTime,
        diff: diffData,
        cardData: cardSnapshot,
      });
      if (saveRes.isNew) {
        processedCount++;
        eventsSaved.push(eventId);
      }
    }
  }

  // Se novos eventos foram inseridos, notifica os usuários com o total pendente
  if (processedCount > 0) {
    try {
      const pendingCount = await getPendingEventsCount();
      if (pendingCount > 0) {
        const usersRes = await pool.query<{ id: string }>(
          `SELECT id FROM users WHERE can_access_jira = TRUE OR is_admin = TRUE`
        );
        const notifMessage = pendingCount === 1
          ? `Existe 1 evolução pendente para revisão no Jira.`
          : `Existem ${pendingCount} evoluções pendentes para revisão no Jira.`;

        for (const u of usersRes.rows) {
          await pool.query(
            `INSERT INTO notification_queue (title, message, user_id) VALUES ($1, $2, $3)`,
            [
              'Revisões Jira',
              notifMessage,
              u.id,
            ]
          );
        }
      }
    } catch (notifErr) {
      console.warn('[Jira Webhook] Falha ao enfileirar notificação:', notifErr);
    }
  }

  return { processed: processedCount, events: eventsSaved };
}

/**
 * Sincroniza eventos retroativos diretamente pela REST API do Jira
 */
export async function syncJiraEventsFromRest(daysBack: number = 1): Promise<{
  newCount: number;
  addedCount: number;
  pendingCount: number;
  totalPending: number;
  checkedIssues: number;
}> {
  const config = await getJiraConfig();
  if (!config.projects || config.projects.length === 0 || !config.api_token) {
    const currentPending = await getPendingEventsCount();
    return {
      newCount: 0,
      addedCount: 0,
      pendingCount: currentPending,
      totalPending: currentPending,
      checkedIssues: 0,
    };
  }

  const host = config.domain.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const searchUrl = `https://${host}/rest/api/3/search/jql`;
  const projectsJql = config.projects.map((p) => `"${p}"`).join(', ');

  const industryField = config.custom_fields?.industry || 'customfield_10780';
  const layoutField = config.custom_fields?.layout || 'customfield_10714';
  const flaggedField = config.custom_fields?.flagged || 'customfield_10021';

  const fields = [
    'summary',
    'duedate',
    'project',
    'parent',
    'status',
    'priority',
    'assignee',
    'created',
    'updated',
    'comment',
    flaggedField,
    industryField,
    layoutField,
  ];

  const jql = `project in (${projectsJql}) AND updated >= "-${daysBack}d" ORDER BY updated DESC`;

  // Buscar issues recentes
  const issues = await executeJqlSearch(searchUrl, config, jql, fields, 50);
  let newCount = 0;

  const cutoffTime = new Date();
  cutoffTime.setDate(cutoffTime.getDate() - daysBack);

  for (const issue of issues) {
    const projKey = issue.fields?.project?.key || '';
    const cardSnapshot = buildCardSnapshot(issue, host, config);

    // 1. Verificar se o card foi criado dentro da janela de dias
    if (issue.fields?.created) {
      const createdDate = new Date(issue.fields.created);
      if (createdDate >= cutoffTime) {
        const eventId = `iss-${issue.key}-created`;
        const saveRes = await saveJiraEvent({
          eventId,
          issueKey: issue.key,
          issueId: issue.id,
          projectKey: projKey,
          summary: issue.fields?.summary || cardSnapshot.summary,
          eventType: 'issue_created',
          authorName: issue.fields?.creator?.displayName || 'Jira',
          authorAvatar: issue.fields?.creator?.avatarUrls?.['32x32'] || null,
          eventTime: createdDate.toISOString(),
          diff: {
            field: 'created',
            label: 'Card Criado',
            issueType: issue.fields?.issuetype?.name || 'Demanda',
            priority: issue.fields?.priority?.name || 'Média',
          },
          cardData: cardSnapshot,
        });
        if (saveRes.isNew) {
          newCount++;
        }
      }
    }

    // 2. Processar histórico de alterações (changelog)
    let histories: any[] = [];
    try {
      const clResponse = await fetch(`https://${host}/rest/api/3/issue/${issue.key}/changelog?maxResults=30`, {
        headers: {
          Authorization: getAuthHeader(config),
          Accept: 'application/json',
        },
      });
      if (clResponse.ok) {
        const clData = await clResponse.json();
        histories = clData.values || [];
      }
    } catch (err) {
      console.warn(`[JiraEvents] Falha ao buscar changelog para ${issue.key}:`, err);
    }
    for (const history of histories) {
      const historyTime = history.created ? new Date(history.created) : null;
      if (!historyTime || historyTime < cutoffTime) continue;

      const authorName = history.author?.displayName || 'Jira';
      const authorAvatar = history.author?.avatarUrls?.['32x32'] || null;
      const ignoredList = config.ignored_fields || DEFAULT_IGNORED_FIELDS;

      for (const item of history.items || []) {
        if (isFieldIgnored(item.field, ignoredList)) {
          continue;
        }

        const field = (item.field || '').toLowerCase();
        let eventType: JiraEventType = 'field_updated';
        let label = `Campo ${item.field}`;
        let diffData: JiraEventDiff = {
          field: item.field,
          label,
          from: cleanAndFormatJiraText(item.fromString),
          to: cleanAndFormatJiraText(item.toString),
        };

        if (field === 'status') {
          eventType = 'status_changed';
          label = 'Mudança de Status';
          diffData = {
            field: 'status',
            label,
            from: formatDisplayStatus(projKey, item.fromString || ''),
            to: formatDisplayStatus(projKey, item.toString || ''),
          };
        } else if (field.includes('flagged') || field.includes('impediment')) {
          eventType = 'flagged_changed';
          const isBlocked = (item.toString || '').toLowerCase().includes('impediment');
          label = isBlocked ? 'Impedimento Adicionado (Bloqueado)' : 'Impedimento Removido';
          diffData = {
            field: 'flagged',
            label,
            from: item.fromString,
            to: item.toString,
            isBlocked,
          };
        } else if (field === 'assignee') {
          eventType = 'assignee_changed';
          label = 'Troca de Responsável';
          diffData = {
            field: 'assignee',
            label,
            from: item.fromString || 'Não atribuído',
            to: item.toString || 'Não atribuído',
          };
        } else if (field === 'duedate') {
          eventType = 'field_updated';
          label = 'Data de Entrega Alterada';
          diffData = {
            field: 'duedate',
            label,
            from: item.fromString || 'Sem prazo',
            to: item.toString || 'Sem prazo',
          };
        }

        const eventId = `chg-${issue.key}-${history.id}-${item.field}`;
        const saveRes = await saveJiraEvent({
          eventId,
          issueKey: issue.key,
          issueId: issue.id,
          projectKey: projKey,
          summary: issue.fields?.summary || cardSnapshot.summary,
          eventType,
          authorName,
          authorAvatar,
          eventTime: historyTime.toISOString(),
          diff: diffData,
          cardData: cardSnapshot,
        });
        if (saveRes.isNew) {
          newCount++;
        }
      }
    }

    // 3. Processar comentários da issue
    const comments = issue.fields?.comment?.comments || [];
    for (const comment of comments) {
      const commentTime = comment.created ? new Date(comment.created) : null;
      if (!commentTime || commentTime < cutoffTime) continue;

      const eventId = `cmt-${issue.key}-${comment.id}`;
      const saveRes = await saveJiraEvent({
        eventId,
        issueKey: issue.key,
        issueId: issue.id,
        projectKey: projKey,
        summary: issue.fields?.summary || cardSnapshot.summary,
        eventType: 'comment_added',
        authorName: comment.author?.displayName || 'Jira',
        authorAvatar: comment.author?.avatarUrls?.['32x32'] || null,
        eventTime: commentTime.toISOString(),
        diff: {
          field: 'comment',
          label: 'Novo Comentário',
          text: cleanAndFormatJiraText(comment.body),
          commentId: comment.id,
        },
        cardData: cardSnapshot,
      });
      if (saveRes.isNew) {
        newCount++;
      }
    }
  }

  const pendingCount = await getPendingEventsCount();

  return {
    newCount,
    addedCount: newCount,
    pendingCount,
    totalPending: pendingCount,
    checkedIssues: issues.length,
  };
}

/**
 * Lista eventos com filtros para o painel de revisões
 */
export async function listJiraEvents(params: {
  status?: 'pending' | 'reviewed' | 'all';
  project?: string;
  eventType?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{
  events: JiraReviewEvent[];
  totalPending: number;
  totalReviewed: number;
  total: number;
}> {
  const {
    status = 'pending',
    project = 'all',
    eventType = 'all',
    search = '',
    limit = 50,
    offset = 0,
  } = params;

  let baseWhere = '1=1';
  const queryParams: any[] = [];

  if (status === 'pending') {
    baseWhere += ' AND is_reviewed = FALSE';
  } else if (status === 'reviewed') {
    baseWhere += ' AND is_reviewed = TRUE';
  }

  if (project && project !== 'all') {
    queryParams.push(project.toUpperCase());
    baseWhere += ` AND UPPER(project_key) = $${queryParams.length}`;
  }

  if (eventType && eventType !== 'all') {
    queryParams.push(eventType);
    baseWhere += ` AND event_type = $${queryParams.length}`;
  }

  if (search && search.trim()) {
    queryParams.push(`%${search.trim().toLowerCase()}%`);
    const idx = queryParams.length;
    baseWhere += ` AND (
      LOWER(issue_key) LIKE $${idx} OR
      LOWER(summary) LIKE $${idx} OR
      LOWER(author_name) LIKE $${idx} OR
      LOWER(diff_data::text) LIKE $${idx}
    )`;
  }

  // Contadores globais (independentes do filtro de paginação/status)
  const pendingCountRes = await pool.query<{ count: string }>(
    `SELECT COUNT(*) FROM jira_review_events WHERE is_reviewed = FALSE`
  );
  const reviewedCountRes = await pool.query<{ count: string }>(
    `SELECT COUNT(*) FROM jira_review_events WHERE is_reviewed = TRUE`
  );

  const totalPending = parseInt(pendingCountRes.rows[0].count, 10) || 0;
  const totalReviewed = parseInt(reviewedCountRes.rows[0].count, 10) || 0;

  // Contagem filtrada
  const countRes = await pool.query<{ count: string }>(
    `SELECT COUNT(*) FROM jira_review_events WHERE ${baseWhere}`,
    queryParams
  );
  const total = parseInt(countRes.rows[0].count, 10) || 0;

  // Consulta paginada ordenada pelos mais recentes
  queryParams.push(limit);
  const limitIdx = queryParams.length;
  queryParams.push(offset);
  const offsetIdx = queryParams.length;

  const listQuery = `
    SELECT 
      id,
      event_id as "eventId",
      issue_key as "issueKey",
      issue_id as "issueId",
      project_key as "projectKey",
      summary,
      event_type as "eventType",
      author_name as "authorName",
      author_avatar as "authorAvatar",
      event_time as "eventTime",
      diff_data as "diff",
      card_data as "cardData",
      is_reviewed as "isReviewed",
      reviewed_at as "reviewedAt",
      reviewed_by as "reviewedBy",
      created_at as "createdAt"
    FROM jira_review_events
    WHERE ${baseWhere}
    ORDER BY event_time DESC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
  `;

  const result = await pool.query(listQuery, queryParams);

  return {
    events: result.rows,
    totalPending,
    totalReviewed,
    total,
  };
}

/**
 * Marca um evento como revisado
 */
export async function markEventAsReviewed(id: number, userId?: string): Promise<boolean> {
  const res = await pool.query(
    `UPDATE jira_review_events 
     SET is_reviewed = TRUE, reviewed_at = NOW(), reviewed_by = $2 
     WHERE id = $1`,
    [id, userId || null]
  );
  return (res.rowCount || 0) > 0;
}

/**
 * Reverte a revisão de um evento (move de volta para pendente)
 */
export async function unmarkEventAsReviewed(id: number): Promise<boolean> {
  const res = await pool.query(
    `UPDATE jira_review_events 
     SET is_reviewed = FALSE, reviewed_at = NULL, reviewed_by = NULL 
     WHERE id = $1`,
    [id]
  );
  return (res.rowCount || 0) > 0;
}

/**
 * Marca todos os eventos pendentes como revisados
 */
export async function markAllEventsAsReviewed(projectKey?: string, userId?: string): Promise<number> {
  let query = `UPDATE jira_review_events SET is_reviewed = TRUE, reviewed_at = NOW(), reviewed_by = $1 WHERE is_reviewed = FALSE`;
  const params: any[] = [userId || null];

  if (projectKey && projectKey !== 'all') {
    params.push(projectKey.toUpperCase());
    query += ` AND UPPER(project_key) = $${params.length}`;
  }

  const res = await pool.query(query, params);
  return res.rowCount || 0;
}

/**
 * Retorna contagem de eventos pendentes de revisão
 */
export async function getPendingEventsCount(): Promise<number> {
  const res = await pool.query<{ count: string }>(
    `SELECT COUNT(*) FROM jira_review_events WHERE is_reviewed = FALSE`
  );
  return parseInt(res.rows[0].count, 10) || 0;
}

/**
 * Marca múltiplos eventos como revisados
 */
export async function markBatchEventsAsReviewed(ids: number[], userId?: string): Promise<number> {
  if (!Array.isArray(ids) || ids.length === 0) return 0;
  const res = await pool.query(
    `UPDATE jira_review_events 
     SET is_reviewed = TRUE, reviewed_at = NOW(), reviewed_by = $2 
     WHERE id = ANY($1::int[]) AND is_reviewed = FALSE`,
    [ids, userId || null]
  );
  return res.rowCount || 0;
}

/**
 * Reverte a revisão de múltiplos eventos (move de volta para pendente)
 */
export async function unmarkBatchEventsAsReviewed(ids: number[]): Promise<number> {
  if (!Array.isArray(ids) || ids.length === 0) return 0;
  const res = await pool.query(
    `UPDATE jira_review_events 
     SET is_reviewed = FALSE, reviewed_at = NULL, reviewed_by = NULL 
     WHERE id = ANY($1::int[]) AND is_reviewed = TRUE`,
    [ids]
  );
  return res.rowCount || 0;
}

/**
 * Remove eventos pendentes de campos que foram configurados para serem desconsiderados
 */
export async function cleanupIgnoredJiraEvents(customIgnoredList?: string[]): Promise<number> {
  try {
    const config = await getJiraConfig();
    const ignored = customIgnoredList && customIgnoredList.length > 0
      ? customIgnoredList
      : config.ignored_fields || DEFAULT_IGNORED_FIELDS;

    if (!ignored || ignored.length === 0) return 0;

    const normalized = ignored.map((f) => f.trim().toLowerCase());
    const res = await pool.query(
      `DELETE FROM jira_review_events 
       WHERE is_reviewed = FALSE 
         AND LOWER(diff_data->>'field') = ANY($1::text[])`,
      [normalized]
    );

    const deletedCount = res.rowCount || 0;
    if (deletedCount > 0) {
      console.log(`[JiraEvents] Higienização concluída: ${deletedCount} evento(s) pendente(s) de campos desconsiderados foram removidos.`);
    }
    return deletedCount;
  } catch (err) {
    console.warn('[JiraEvents] Falha ao limpar eventos ignorados:', err);
    return 0;
  }
}

/**
 * Migra eventos ADF que foram salvos anteriormente no banco como JSON bruto
 */
export async function migrateAdfEventsInDb(): Promise<void> {
  // Limpa pendências antigas de campos desconsiderados
  await cleanupIgnoredJiraEvents().catch(() => {});

  try {
    const res = await pool.query(`
      SELECT id, diff_data
      FROM jira_review_events
      WHERE (diff_data->>'text' LIKE '%"type":"doc"%')
         OR (diff_data->>'from' LIKE '%"type":"doc"%')
         OR (diff_data->>'to' LIKE '%"type":"doc"%')
    `);

    if (res.rows.length === 0) return;

    console.log(`[JiraEvents] Higienizando ${res.rows.length} eventos ADF salvos no banco de dados...`);
    let updatedCount = 0;

    for (const row of res.rows) {
      const diff = row.diff_data;
      let modified = false;

      if (diff.text && typeof diff.text === 'string' && diff.text.includes('"type":"doc"')) {
        diff.text = cleanAndFormatJiraText(diff.text);
        modified = true;
      }
      if (diff.from && typeof diff.from === 'string' && diff.from.includes('"type":"doc"')) {
        diff.from = cleanAndFormatJiraText(diff.from);
        modified = true;
      }
      if (diff.to && typeof diff.to === 'string' && diff.to.includes('"type":"doc"')) {
        diff.to = cleanAndFormatJiraText(diff.to);
        modified = true;
      }

      if (modified) {
        await pool.query(
          'UPDATE jira_review_events SET diff_data = $1 WHERE id = $2',
          [JSON.stringify(diff), row.id]
        );
        updatedCount++;
      }
    }

    console.log(`[JiraEvents] ${updatedCount} eventos ADF atualizados com sucesso para texto limpo.`);
  } catch (err) {
    console.warn('[JiraEvents] Falha ao migrar eventos ADF:', err);
  }
}

let jiraSyncInterval: NodeJS.Timeout | null = null;
let isJiraSyncRunning = false;

/**
 * Executa a sincronização periódica de evoluções do Jira (API REST)
 */
export async function runPeriodicJiraSync(): Promise<void> {
  if (isJiraSyncRunning) return;
  isJiraSyncRunning = true;

  try {
    const config = await getJiraConfig();
    if (!config.api_token || !config.domain || !config.projects || config.projects.length === 0) {
      // Jira não configurado, ignora silenciosamente
      return;
    }

    console.log('[JiraSync] Executando sincronização automática periódica de evoluções (últimas 24h, a cada 5 min)...');
    const result = await syncJiraEventsFromRest(1);
    const pendingCount = result.pendingCount;

    if (result.newCount > 0 && pendingCount > 0) {
      console.log(`[JiraSync] Sincronização automática concluída! ${result.newCount} nova(s) evolução(ões) inserida(s). Total pendente para revisão: ${pendingCount}.`);

      // Notificar usuários que têm permissão de acesso ao Jira exibindo APENAS O QUE ESTÁ PENDENTE
      try {
        const usersRes = await pool.query<{ id: string }>(
          `SELECT id FROM users WHERE can_access_jira = TRUE OR is_admin = TRUE`
        );
        const notifMessage = pendingCount === 1
          ? `Existe 1 evolução pendente para revisão no Jira.`
          : `Existem ${pendingCount} evoluções pendentes para revisão no Jira.`;

        for (const u of usersRes.rows) {
          await pool.query(
            `INSERT INTO notification_queue (title, message, user_id) VALUES ($1, $2, $3)`,
            [
              'Revisões Jira',
              notifMessage,
              u.id,
            ]
          );
        }
      } catch (notifErr) {
        console.warn('[JiraSync] Falha ao enfileirar notificação de novas evoluções:', notifErr);
      }
    } else {
      console.log(`[JiraSync] Sincronização automática concluída. ${pendingCount} pendência(s) no momento (${result.checkedIssues} issues verificadas).`);
    }
  } catch (err: any) {
    console.error('[JiraSync] Erro na sincronização automática do Jira:', err?.message || err);
  } finally {
    isJiraSyncRunning = false;
  }
}

/**
 * Inicia o agendador de sincronização periódica do Jira (padrão: 5 minutos)
 */
export function startJiraSyncScheduler(intervalMs: number = 5 * 60 * 1000): void {
  if (jiraSyncInterval) {
    clearInterval(jiraSyncInterval);
  }

  console.log(`[JiraSync] Motor de sincronização automática do Jira iniciado (intervalo: ${intervalMs / 1000 / 60} minutos).`);

  // Executa uma sincronização inicial 5 segundos após a subida do servidor
  setTimeout(() => {
    runPeriodicJiraSync().catch(() => {});
  }, 5000);

  jiraSyncInterval = setInterval(() => {
    runPeriodicJiraSync().catch(() => {});
  }, intervalMs);
}

/**
 * Para o agendador de sincronização do Jira
 */
export function stopJiraSyncScheduler(): void {
  if (jiraSyncInterval) {
    clearInterval(jiraSyncInterval);
    jiraSyncInterval = null;
    console.log('[JiraSync] Motor de sincronização automática do Jira parado.');
  }
}


