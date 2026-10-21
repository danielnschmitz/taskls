import { GoogleChatConfig } from './googleChat';

export interface ExtractedErrorItem {
  id?: string;
  type?: string; // 'Distribuidor' | 'Empresa' | 'Item'
  erp?: string;
  message: string;
}

export interface ExtractedWidget {
  type: 'text' | 'keyValue' | 'decoratedText';
  label?: string;
  value: string;
  bottomLabel?: string;
}

export interface ExtractedSection {
  header?: string;
  widgets: ExtractedWidget[];
}

export interface ParsedIntegrationMessage {
  messageId: string;
  spaceId: string;
  senderName: string;
  senderAvatar?: string | null;
  eventTime: string;
  headerTitle: string;
  headerSubtitle: string;
  summary: string;
  severity: 'error' | 'warning' | 'info';
  items: ExtractedErrorItem[];
  details: Record<string, string>;
  sections: ExtractedSection[];
  category?: string;
  httpCode?: string;
  operation?: string;
  campaign?: string;
  rawText: string;
  shouldInclude: boolean; // Baseado nos filtros de erro/alerta
}

/**
 * Remove tags HTML simples do Google Chat (<font>, <b>, <i>, <a>, etc)
 */
export function stripHtmlTags(str: string): string {
  if (!str) return '';
  return str
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

/**
 * Extrai texto limpo de widgets do Google Chat (textParagraph, decoratedText, keyValue)
 */
function extractWidgetsFromSection(
  section: any,
  sectionHeader?: string
): { widgets: ExtractedWidget[]; rawLines: string[] } {
  const widgets: ExtractedWidget[] = [];
  const rawLines: string[] = [];

  const rawWidgets = section.widgets || [];
  for (const w of rawWidgets) {
    if (w.textParagraph && w.textParagraph.text) {
      const clean = stripHtmlTags(w.textParagraph.text);
      if (clean) {
        widgets.push({
          type: 'text',
          value: clean,
        });

        // Se o widget for um texto direto e a seção tiver um header explicativo (ex: "Campanha", "Erro")
        // e o texto não contiver dois pontos, associamos o header como chave
        if (sectionHeader && !clean.includes(':') && !clean.includes('\n')) {
          rawLines.push(`${sectionHeader}: ${clean}`);
        } else {
          rawLines.push(clean);
        }
      }
    } else if (w.decoratedText) {
      const topLabel = stripHtmlTags(w.decoratedText.topLabel || '');
      const text = stripHtmlTags(w.decoratedText.text || '');
      const bottomLabel = stripHtmlTags(w.decoratedText.bottomLabel || '');

      widgets.push({
        type: 'decoratedText',
        label: topLabel || undefined,
        value: text,
        bottomLabel: bottomLabel || undefined,
      });

      const fullLine = [topLabel, text, bottomLabel].filter(Boolean).join(': ');
      if (fullLine) rawLines.push(fullLine);
    } else if (w.keyValue) {
      const topLabel = stripHtmlTags(w.keyValue.topLabel || '');
      const content = stripHtmlTags(w.keyValue.content || '');
      const bottomLabel = stripHtmlTags(w.keyValue.bottomLabel || '');

      widgets.push({
        type: 'keyValue',
        label: topLabel || undefined,
        value: content,
        bottomLabel: bottomLabel || undefined,
      });

      const fullLine = [topLabel, content, bottomLabel].filter(Boolean).join(': ');
      if (fullLine) rawLines.push(fullLine);
    }
  }

  return { widgets, rawLines };
}

/**
 * Analisa as linhas de texto bruto e extrai itens estruturados (como erros de distribuidor/empresa e pares chave-valor)
 */
function analyzeContent(
  rawLines: string[],
  headerTitle: string,
  headerSubtitle: string
): {
  items: ExtractedErrorItem[];
  details: Record<string, string>;
  category?: string;
  httpCode?: string;
  operation?: string;
  campaign?: string;
} {
  const items: ExtractedErrorItem[] = [];
  const details: Record<string, string> = {};

  let category: string | undefined;
  let httpCode: string | undefined;
  let operation: string | undefined;
  let campaign: string | undefined;

  // Detecta categoria a partir do cabeçalho
  const combinedHeader = `${headerTitle} ${headerSubtitle}`.toLowerCase();
  if (combinedHeader.includes('neogrid')) category = 'Neogrid';
  else if (combinedHeader.includes('antonelli')) category = 'Antonelli';
  else if (combinedHeader.includes('cardiomed')) category = 'Cardiomed';
  else if (combinedHeader.includes('smarket')) category = 'Smarket';

  // Expressão regular para padrão Neogrid / ERP:
  // "O Distribuidor com ID: 9 do ERP: Protheus_NovaIndy não foi processado"
  // "A empresa com ID: 8 do ERP: Consinco não foi processada"
  const erpItemRegex = /(?:O\s+Distribuidor|A\s+empresa|O\s+item)\s+com\s+ID:\s*([^\s,]+)\s+do\s+ERP:\s*([^\s,]+)\s+(?:não\s+foi\s+processad[oa]|falhou)/i;

  for (const rawLine of rawLines) {
    const lines = rawLine.split('\n').map((l) => l.trim()).filter(Boolean);

    for (const line of lines) {
      // 1. Verifica item de ERP / Distribuidor
      const erpMatch = line.match(erpItemRegex);
      if (erpMatch) {
        const isEmpresa = line.toLowerCase().startsWith('a empresa');
        items.push({
          id: erpMatch[1],
          erp: erpMatch[2],
          type: isEmpresa ? 'Empresa' : 'Distribuidor',
          message: line,
        });
        continue;
      }

      // 2. Verifica pares chave: valor (ex: "Aplicação: Integração Cardiomedh", "Status: Execução iniciada", "Etapa: Programação de Mídia")
      const kvMatch = line.match(/^([A-Za-zÀ-ÿ0-9\s|_-]+):\s*(.+)$/);
      if (kvMatch) {
        const key = kvMatch[1].trim();
        const value = kvMatch[2].trim();
        details[key] = value;

        const lowerKey = key.toLowerCase();
        if (lowerKey === 'campanha') campaign = value;
        if (lowerKey === 'operação' || lowerKey === 'operacao') operation = value;
        if (lowerKey === 'erro' && value.match(/\b\d{3}\b/)) {
          const codeMatch = value.match(/\b\d{3}\b/);
          if (codeMatch) httpCode = codeMatch[0];
        }
        continue;
      }

      // 3. Verifica código HTTP direto (ex: "Erro HTTP 404")
      const httpMatch = line.match(/HTTP\s*(\d{3})/i);
      if (httpMatch && !httpCode) {
        httpCode = httpMatch[1];
      }
    }
  }

  return { items, details, category, httpCode, operation, campaign };
}

/**
 * Avalia se a mensagem deve ser incluída com base na configuração e filtros
 */
function evaluateFilter(
  fullText: string,
  senderName: string,
  config: GoogleChatConfig
): { shouldInclude: boolean; severity: 'error' | 'warning' | 'info' } {
  const lowerText = fullText.toLowerCase();

  // Se o remetente estiver na lista de ignorados
  if (config.ignored_senders && config.ignored_senders.length > 0) {
    const isIgnoredSender = config.ignored_senders.some(
      (s) => s && s.toLowerCase().trim() === senderName.toLowerCase().trim()
    );
    if (isIgnoredSender) {
      return { shouldInclude: false, severity: 'info' };
    }
  }

  // Se estiver em modo "todas as mensagens", aceita qualquer mensagem
  if (config.filter_mode === 'all') {
    let severity: 'error' | 'warning' | 'info' = 'info';
    if (lowerText.includes('erro') || lowerText.includes('fail') || lowerText.includes('falha') || lowerText.includes('404') || lowerText.includes('500')) {
      severity = 'error';
    } else if (lowerText.includes('alerta') || lowerText.includes('não foi processad') || lowerText.includes('warning')) {
      severity = 'warning';
    }
    return { shouldInclude: true, severity };
  }

  // Modo "errors_only":
  // 1. Verifica se contém palavras de erro/alerta
  const hasErrorKeyword = config.filter_keywords.some((kw) => lowerText.includes(kw.toLowerCase()));

  // 2. Verifica se contém apenas termos de sucesso/início sem palavras de erro
  const hasIgnoredKeyword = config.ignored_keywords.some((kw) => lowerText.includes(kw.toLowerCase()));

  if (hasIgnoredKeyword && !hasErrorKeyword) {
    return { shouldInclude: false, severity: 'info' };
  }

  if (!hasErrorKeyword) {
    return { shouldInclude: false, severity: 'info' };
  }

  // Determinar severidade
  let severity: 'error' | 'warning' | 'info' = 'warning';
  if (
    lowerText.includes('erro') ||
    lowerText.includes('falha') ||
    lowerText.includes('404') ||
    lowerText.includes('500') ||
    lowerText.includes('exception') ||
    lowerText.includes('não cadastrada')
  ) {
    severity = 'error';
  } else if (lowerText.includes('alerta') || lowerText.includes('não foi processad')) {
    severity = 'warning';
  }

  return { shouldInclude: true, severity };
}

/**
 * Constrói um sumário inteligente e legível para a mensagem
 */
function buildSummary(
  headerTitle: string,
  headerSubtitle: string,
  items: ExtractedErrorItem[],
  details: Record<string, string>,
  campaign?: string,
  httpCode?: string
): string {
  const parts: string[] = [];

  if (headerTitle) parts.push(headerTitle);
  if (headerSubtitle && headerSubtitle !== headerTitle) parts.push(`(${headerSubtitle})`);

  if (items.length > 0) {
    const erps = Array.from(new Set(items.map((i) => i.erp).filter(Boolean)));
    const erpStr = erps.length > 0 ? ` [${erps.join(', ')}]` : '';
    parts.push(`: ${items.length} ${items.length === 1 ? 'item não processado' : 'itens não processados'}${erpStr}`);
  } else if (campaign) {
    parts.push(`: Campanha ${campaign}`);
    if (httpCode) parts.push(`(HTTP ${httpCode})`);
  } else if (details['Aplicação'] || details['Aplicacao']) {
    parts.push(`: ${details['Aplicação'] || details['Aplicacao']}`);
    if (details['Status']) parts.push(`- ${details['Status']}`);
  } else if (details['Erro'] || details['erro']) {
    parts.push(`: ${details['Erro'] || details['erro']}`);
  }

  return parts.join(' ').trim() || 'Erro de integração';
}

/**
 * Função principal: Processa uma mensagem do Google Chat (seja da API ou de Webhook)
 */
export function parseGoogleChatMessage(
  rawMsg: any,
  defaultSpaceId: string = '',
  config: GoogleChatConfig
): ParsedIntegrationMessage | null {
  if (!rawMsg || typeof rawMsg !== 'object') {
    return null;
  }

  // ID da mensagem
  const messageId =
    rawMsg.name ||
    rawMsg.id ||
    rawMsg.messageId ||
    `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  // Espaço
  const spaceId =
    rawMsg.space?.name ||
    (typeof rawMsg.space === 'string' ? rawMsg.space : null) ||
    defaultSpaceId ||
    'spaces/default';

  // Remetente
  const senderObj = rawMsg.sender || rawMsg.user || {};
  const senderName =
    senderObj.displayName ||
    senderObj.name ||
    rawMsg.senderName ||
    'Google Chat App';
  const senderAvatar = senderObj.avatarUrl || null;

  // Data/Hora
  const eventTime =
    rawMsg.createTime ||
    rawMsg.timestamp ||
    rawMsg.eventTime ||
    new Date().toISOString();

  // Cabeçalhos de Cards (CardsV2 ou Cards v1)
  let headerTitle = '';
  let headerSubtitle = '';
  const sections: ExtractedSection[] = [];
  const rawTextLines: string[] = [];

  // 1. Processar cardsV2
  if (Array.isArray(rawMsg.cardsV2) && rawMsg.cardsV2.length > 0) {
    for (const cardItem of rawMsg.cardsV2) {
      const card = cardItem.card || {};
      if (card.header) {
        if (!headerTitle && card.header.title) headerTitle = stripHtmlTags(card.header.title);
        if (!headerSubtitle && card.header.subtitle) headerSubtitle = stripHtmlTags(card.header.subtitle);
      }

      if (Array.isArray(card.sections)) {
        for (const sec of card.sections) {
          const secHeader = sec.header ? stripHtmlTags(sec.header) : undefined;
          const { widgets, rawLines } = extractWidgetsFromSection(sec, secHeader);
          if (widgets.length > 0) {
            sections.push({ header: secHeader, widgets });
            rawTextLines.push(...rawLines);
          }
        }
      }
    }
  }

  // 2. Processar cards legado (v1)
  if (Array.isArray(rawMsg.cards) && rawMsg.cards.length > 0) {
    for (const card of rawMsg.cards) {
      if (card.header) {
        if (!headerTitle && card.header.title) headerTitle = stripHtmlTags(card.header.title);
        if (!headerSubtitle && card.header.subtitle) headerSubtitle = stripHtmlTags(card.header.subtitle);
      }

      if (Array.isArray(card.sections)) {
        for (const sec of card.sections) {
          const secHeader = sec.header ? stripHtmlTags(sec.header) : undefined;
          const { widgets, rawLines } = extractWidgetsFromSection(sec, secHeader);
          if (widgets.length > 0) {
            sections.push({ header: secHeader, widgets });
            rawTextLines.push(...rawLines);
          }
        }
      }
    }
  }

  // 3. Processar texto puro
  if (rawMsg.text) {
    const cleanText = stripHtmlTags(rawMsg.text);
    if (cleanText) {
      rawTextLines.push(cleanText);
      if (!headerTitle) {
        headerTitle = cleanText.split('\n')[0];
      }
    }
  }

  // Analisa conteúdo acumulado
  const { items, details, category, httpCode, operation, campaign } = analyzeContent(
    rawTextLines,
    headerTitle,
    headerSubtitle
  );

  const fullText = [
    headerTitle,
    headerSubtitle,
    ...rawTextLines,
    JSON.stringify(details),
    ...items.map((i) => i.message),
  ].join(' ');

  const { shouldInclude, severity } = evaluateFilter(fullText, senderName, config);
  const summary = buildSummary(headerTitle, headerSubtitle, items, details, campaign, httpCode);

  return {
    messageId,
    spaceId,
    senderName,
    senderAvatar,
    eventTime: new Date(eventTime).toISOString(),
    headerTitle: headerTitle || 'Alerta de Integração',
    headerSubtitle: headerSubtitle || '',
    summary,
    severity,
    items,
    details,
    sections,
    category,
    httpCode,
    operation,
    campaign,
    rawText: rawTextLines.join('\n'),
    shouldInclude,
  };
}
