import { Router, Request, Response } from 'express';
import { getJiraConfig, getAuthHeader, executeJqlSearch } from './jira';

export const dashboardRoutes = Router();

// Cache em memória para os dados do dashboard (TTL: 5 minutos)
interface CachedData {
  timestamp: number;
  data: any;
}

const leadTimeCache = new Map<string, CachedData>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

// Mapeamento padrão dos custom fields do Jira descobertos na instância
const DEFAULT_BI_FIELDS = {
  canal: 'customfield_10273',       // Canal de distribuição - NEO
  priorizado: 'customfield_10167',  // [BI] Priorizado
  dev: 'customfield_10168',         // [BI] Desenvolvimento
  deploy_hml: 'customfield_10681',  // [BI] Deploy HML
  validacao: 'customfield_10169',   // [BI] Validação
  uat: 'customfield_10170',         // [BI] UAT
  deploy_prd: 'customfield_10171',  // [BI] Deploy
  finalizado: 'customfield_10173',  // [BI] Finalizado
  dias_bloqueado: 'customfield_10581', // [BI] Dias Bloqueado
};

// Cache de mapeamento de campos do Jira descobertos dinamicamente
let dynamicFieldMap: typeof DEFAULT_BI_FIELDS | null = null;
let dynamicFieldMapTime = 0;

/**
 * Descobre dinamicamente os IDs dos campos [BI] na instância do Jira
 */
async function getOrDiscoverBiFields(config: any): Promise<typeof DEFAULT_BI_FIELDS> {
  const now = Date.now();
  if (dynamicFieldMap && now - dynamicFieldMapTime < 60 * 60 * 1000) {
    return dynamicFieldMap;
  }

  try {
    const host = config.domain.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    const res = await fetch(`https://${host}/rest/api/3/field`, {
      headers: {
        Authorization: getAuthHeader(config),
        Accept: 'application/json',
      },
    });

    if (res.ok) {
      const allFields: any[] = await res.json();
      const discovered = { ...DEFAULT_BI_FIELDS };

      for (const f of allFields) {
        const name = (f.name || '').toLowerCase().trim();
        if (name === '[bi] priorizado' || name === 'data priorizado') {
          discovered.priorizado = f.id;
        } else if (name === '[bi] desenvolvimento' || name === 'data desenvolvimento') {
          discovered.dev = f.id;
        } else if (name === '[bi] deploy hml') {
          discovered.deploy_hml = f.id;
        } else if (name === '[bi] validação' || name === '[bi] validacao') {
          discovered.validacao = f.id;
        } else if (name === '[bi] uat') {
          discovered.uat = f.id;
        } else if (name === '[bi] deploy' || name === '[bi] deploy prd') {
          discovered.deploy_prd = f.id;
        } else if (name === '[bi] finalizado' || name === 'data finalizado') {
          discovered.finalizado = f.id;
        } else if (name === '[bi] dias bloqueado' || name === 'dias bloqueado') {
          discovered.dias_bloqueado = f.id;
        } else if (name.includes('canal de distribuição') || name === 'canal') {
          discovered.canal = f.id;
        }
      }

      dynamicFieldMap = discovered;
      dynamicFieldMapTime = now;
      return dynamicFieldMap;
    }
  } catch (err) {
    console.warn('[Dashboards] Não foi possível descobrir campos dinamicamente, usando padrões:', err);
  }

  return DEFAULT_BI_FIELDS;
}

/**
 * GET /api/dashboards/meta
 * Retorna metadados gerais dos dashboards disponíveis e projetos configurados
 */
dashboardRoutes.get('/meta', async (req: Request, res: Response): Promise<void> => {
  try {
    const config = await getJiraConfig();
    const dashboards = [
      {
        id: 'lead-time-jira',
        title: 'LeadTime Jira',
        description: 'Métricas de Ciclo e Lead Time por etapa do fluxo de ativações e demandas',
        category: 'Jira & Operações',
        icon: 'Timer',
      },
      {
        id: 'ativacoes-neo',
        title: 'Ativações Neogrid',
        description: 'Volume e distribuição de ativações por status, ERP, indústria e histórico mensal em produção',
        category: 'Neogrid',
        icon: 'CheckCircle2',
      },
    ];

    res.json({
      dashboards,
      projects: config.projects || ['NEO', 'ESM', 'ANT'],
      defaultProject: (config.projects && config.projects.includes('NEO')) ? 'NEO' : (config.projects?.[0] || 'NEO'),
    });
  } catch (err: any) {
    console.error('[Dashboards] Erro ao buscar meta:', err);
    res.status(500).json({ error: 'Erro ao buscar metadados de dashboards' });
  }
});

/**
 * GET /api/dashboards/jira-lead-time
 * Retorna os dados analíticos de Lead Time e Ciclo para o projeto e filtros solicitados
 */
dashboardRoutes.get('/jira-lead-time', async (req: Request, res: Response): Promise<void> => {
  try {
    const config = await getJiraConfig();

    if (!config.api_token || !config.domain || !config.email) {
      res.status(400).json({
        error: 'A integração com o Jira não está configurada. Configure o domínio, e-mail e token de API nas Configurações.',
      });
      return;
    }

    const host = config.domain.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    const project = (typeof req.query.project === 'string' && req.query.project.trim())
      ? req.query.project.trim().toUpperCase()
      : 'NEO';

    const issuetype = typeof req.query.issuetype === 'string' ? req.query.issuetype.trim() : '';
    const forceRefresh = req.query.refresh === 'true';

    const cacheKey = `${project}:${issuetype || 'ALL'}`;
    const now = Date.now();

    if (!forceRefresh && leadTimeCache.has(cacheKey)) {
      const cached = leadTimeCache.get(cacheKey)!;
      if (now - cached.timestamp < CACHE_TTL_MS) {
        res.json(cached.data);
        return;
      }
    }

    // Descobrir mapeamento de campos
    const fieldMap = await getOrDiscoverBiFields(config);

    // Buscar tipos de item disponíveis para o projeto no Jira
    let availableIssueTypes: string[] = ['Ativação', 'Tarefa', 'Epic', 'Incidente', 'Ticket'];
    try {
      const projRes = await fetch(`https://${host}/rest/api/3/project/${project}`, {
        headers: {
          Authorization: getAuthHeader(config),
          Accept: 'application/json',
        },
      });
      if (projRes.ok) {
        const projData = await projRes.json();
        if (Array.isArray(projData.issueTypes)) {
          availableIssueTypes = projData.issueTypes.map((t: any) => t.name);
        }
      }
    } catch (e) {
      console.warn('[Dashboards] Não foi possível buscar issueTypes do projeto:', e);
    }

    // Construir JQL
    let jql = `project = "${project}"`;
    if (issuetype && issuetype.toLowerCase() !== 'todos') {
      jql += ` AND issuetype = "${issuetype}"`;
    } else if (!issuetype && project === 'NEO' && availableIssueTypes.includes('Ativação')) {
      // Padrão inteligente para NEO: Ativação
      jql += ` AND issuetype = "Ativação"`;
    }
    jql += ` ORDER BY created ASC`;

    // Campos a requisitar
    const queryFields = [
      'key',
      'summary',
      'issuetype',
      'status',
      'created',
      'resolutiondate',
      'updated',
      fieldMap.canal,
      fieldMap.priorizado,
      fieldMap.dev,
      fieldMap.deploy_hml,
      fieldMap.validacao,
      fieldMap.uat,
      fieldMap.deploy_prd,
      fieldMap.finalizado,
      fieldMap.dias_bloqueado,
    ];

    // Busca paginada no Jira usando /rest/api/3/search/jql
    const allRawIssues: any[] = [];
    let nextPageToken: string | undefined = undefined;
    let pageCount = 0;
    const maxPages = 20; // Proteção contra loops infinitos (até 2000 cards)

    while (pageCount < maxPages) {
      pageCount++;
      const payload: any = {
        jql,
        fields: queryFields,
        maxResults: 100,
      };
      if (nextPageToken) {
        payload.nextPageToken = nextPageToken;
      }

      const searchRes = await fetch(`https://${host}/rest/api/3/search/jql`, {
        method: 'POST',
        headers: {
          Authorization: getAuthHeader(config),
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (searchRes.status === 401) {
        res.status(401).json({
          error: 'Falha de autenticação com o Jira (401). Verifique suas credenciais em Configurações.',
        });
        return;
      }

      if (!searchRes.ok) {
        const errorText = await searchRes.text();
        throw new Error(`Erro na API do Jira (${searchRes.status}): ${errorText.substring(0, 200)}`);
      }

      const data: any = await searchRes.json();
      const batch = Array.isArray(data.issues) ? data.issues : [];
      allRawIssues.push(...batch);

      if (data.isLast || !data.nextPageToken || batch.length === 0) {
        break;
      }
      nextPageToken = data.nextPageToken;
    }

    // Processamento e modelagem das métricas
    const nowIso = new Date().toISOString();
    const nowDate = new Date();

    const DONE_STATUSES = new Set([
      'concluído',
      'concluido',
      'resolvido',
      'em produção',
      'em producao',
      'finalizado',
      'done',
      'closed',
      'resolved',
    ]);

    const issues = allRawIssues.map((issue) => {
      const f = issue.fields || {};

      // Canal (opcional, presente em projetos como NEO)
      const canalObj = f[fieldMap.canal];
      let canal: string | null = null;
      if (canalObj) {
        if (typeof canalObj === 'string' && canalObj.trim()) {
          canal = canalObj.trim();
        } else if (canalObj.value && String(canalObj.value).trim()) {
          canal = String(canalObj.value).trim();
        } else if (canalObj.name && String(canalObj.name).trim()) {
          canal = String(canalObj.name).trim();
        }
      }

      const statusName = f.status?.name || 'Desconhecido';
      const isDone = DONE_STATUSES.has(statusName.toLowerCase().trim()) || Boolean(f[fieldMap.finalizado]) || Boolean(f.resolutiondate);

      const created = f.created ? new Date(f.created) : null;
      const dt_priorizado = f[fieldMap.priorizado] ? new Date(f[fieldMap.priorizado]) : null;
      const dt_dev = f[fieldMap.dev] ? new Date(f[fieldMap.dev]) : null;
      const dt_deploy_hml = f[fieldMap.deploy_hml] ? new Date(f[fieldMap.deploy_hml]) : null;
      const dt_validacao = (f[fieldMap.validacao] ? new Date(f[fieldMap.validacao]) : null) || (f[fieldMap.uat] ? new Date(f[fieldMap.uat]) : null);
      const dt_deploy_prd = f[fieldMap.deploy_prd] ? new Date(f[fieldMap.deploy_prd]) : null;
      
      // Data de finalização (marco [BI] Finalizado, resolutiondate ou updated como fallback)
      let dt_finalizado = f[fieldMap.finalizado] ? new Date(f[fieldMap.finalizado]) : null;
      if (!dt_finalizado && isDone) {
        if (f.resolutiondate) {
          dt_finalizado = new Date(f.resolutiondate);
        } else if (f.updated) {
          dt_finalizado = new Date(f.updated);
        }
      }

      const dias_bloqueado = parseFloat(f[fieldMap.dias_bloqueado] || '0') || 0.0;

      // Helper para calcular diferença em dias
      const diffInDays = (start: Date | null, end: Date | null): number | null => {
        if (!start || !end) return null;
        const diffMs = end.getTime() - start.getTime();
        const days = diffMs / (1000 * 60 * 60 * 24);
        return Math.max(0, parseFloat(days.toFixed(1)));
      };

      // 1. Triagem (Data Criação -> Data Priorizado / Dev / Now se ainda em aberto)
      let dias_triagem: number | null = null;
      if (created) {
        const fimTriagem = dt_priorizado || dt_dev || (isDone ? dt_finalizado : nowDate);
        dias_triagem = diffInDays(created, fimTriagem);
      }

      // 2. Pronto p/ Fazer (Priorizado -> Dev)
      let dias_pronto: number | null = null;
      if (dt_priorizado) {
        const fimPronto = dt_dev || (isDone ? dt_finalizado : nowDate);
        dias_pronto = diffInDays(dt_priorizado, fimPronto);
      }

      // 3. Dev & HML (Dev -> Deploy HML)
      let dias_dev: number | null = null;
      if (dt_dev) {
        const fimDev = dt_deploy_hml || (isDone ? dt_finalizado : nowDate);
        dias_dev = diffInDays(dt_dev, fimDev);
      }

      // 4. Validação & UAT (Deploy HML -> Deploy PRD)
      let dias_uat: number | null = null;
      if (dt_deploy_hml) {
        const fimUat = dt_deploy_prd || (isDone ? dt_finalizado : nowDate);
        dias_uat = diffInDays(dt_deploy_hml, fimUat);
      }

      // 5. Deploy PRD & Conclusão (Deploy PRD -> Finalizado)
      let dias_deploy: number | null = null;
      if (dt_deploy_prd) {
        const fimDeploy = dt_finalizado || (isDone ? dt_finalizado : nowDate);
        dias_deploy = diffInDays(dt_deploy_prd, fimDeploy);
      }

      // Lead Time Total
      let lead_time_bruto: number | null = null;
      let lead_time_liquido: number | null = null;
      if (created) {
        const fimLead = dt_finalizado || (isDone ? dt_finalizado : nowDate);
        lead_time_bruto = diffInDays(created, fimLead);
        if (lead_time_bruto !== null) {
          lead_time_liquido = Math.max(0, parseFloat((lead_time_bruto - dias_bloqueado).toFixed(1)));
        }
      }

      // Cycle Time Técnico (Início Dev -> Fim)
      let cycle_time_tecnico: number | null = null;
      let cycle_time_liquido: number | null = null;
      if (dt_dev) {
        const fimCycle = dt_finalizado || (isDone ? dt_finalizado : nowDate);
        cycle_time_tecnico = diffInDays(dt_dev, fimCycle);
        if (cycle_time_tecnico !== null) {
          cycle_time_liquido = Math.max(0, parseFloat((cycle_time_tecnico - dias_bloqueado).toFixed(1)));
        }
      }

      return {
        key: issue.key,
        summary: f.summary || 'Sem resumo',
        status: statusName,
        issuetype: f.issuetype?.name || 'Item',
        canal,
        isDone,
        created: f.created,
        dt_priorizado: f[fieldMap.priorizado] || null,
        dt_dev: f[fieldMap.dev] || null,
        dt_deploy_hml: f[fieldMap.deploy_hml] || null,
        dt_validacao: f[fieldMap.validacao] || f[fieldMap.uat] || null,
        dt_deploy_prd: f[fieldMap.deploy_prd] || null,
        dt_finalizado: dt_finalizado ? dt_finalizado.toISOString() : null,
        dias_bloqueado,
        dias_triagem,
        dias_pronto,
        dias_dev,
        dias_uat,
        dias_deploy,
        lead_time_bruto,
        lead_time_liquido,
        cycle_time_tecnico,
        cycle_time_liquido,
        url: `https://${host}/browse/${issue.key}`,
      };
    });

    const hasCanal = issues.some((i) => i.canal !== null && i.canal !== undefined && i.canal.trim() !== '');

    const responsePayload = {
      project,
      availableProjects: config.projects || ['NEO', 'ESM', 'ANT'],
      availableIssueTypes,
      selectedIssueType: issuetype || (project === 'NEO' && availableIssueTypes.includes('Ativação') ? 'Ativação' : 'Todos'),
      hasCanal,
      totalIssues: issues.length,
      lastUpdated: nowIso,
      issues,
    };

    leadTimeCache.set(cacheKey, { timestamp: now, data: responsePayload });
    res.json(responsePayload);
  } catch (err: any) {
    console.error('[Dashboards] Erro ao processar Lead Time Jira:', err);
    res.status(500).json({ error: err.message || 'Erro ao carregar dados do dashboard' });
  }
});

// Cache e constantes para o Dashboard de Ativações Neogrid
const neoActivationsCache = new Map<string, CachedData>();

const NEO_CUSTOM_FIELDS = {
  canal: 'customfield_10273',
  tipo_integracao: 'customfield_10912',
  tipo_ativacao: 'customfield_11121',
  layout: 'customfield_10714',
  industria: 'customfield_10780',
  setor: 'customfield_11050',
  analista: 'customfield_10846',
  quantidade_ativacoes: 'customfield_10615',
  deploy_prd: 'customfield_10171',
  finalizado: 'customfield_10173',
};

function extractOptionString(val: any): string | null {
  if (!val) return null;
  if (typeof val === 'string') return val.trim();
  if (val.value) return String(val.value).trim();
  if (val.name) return String(val.name).trim();
  return null;
}

/**
 * GET /api/dashboards/jira-neo-ativacoes
 * Retorna dados analíticos de quantidade de ativações do projeto Neogrid (NEO)
 */
dashboardRoutes.get('/jira-neo-ativacoes', async (req: Request, res: Response): Promise<void> => {
  try {
    const config = await getJiraConfig();

    if (!config.api_token || !config.domain || !config.email) {
      res.status(400).json({
        error: 'A integração com o Jira não está configurada. Configure o domínio, e-mail e token de API nas Configurações.',
      });
      return;
    }

    const host = config.domain.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    const forceRefresh = req.query.refresh === 'true';
    const cacheKey = 'NEO:ATIVACAO';
    const now = Date.now();

    if (!forceRefresh && neoActivationsCache.has(cacheKey)) {
      const cached = neoActivationsCache.get(cacheKey)!;
      if (now - cached.timestamp < CACHE_TTL_MS) {
        res.json(cached.data);
        return;
      }
    }

    const jql = 'project = "NEO" AND issuetype = "Ativação" ORDER BY created ASC';
    const queryFields = [
      'key',
      'summary',
      'status',
      'issuetype',
      'parent',
      'created',
      'resolutiondate',
      'updated',
      NEO_CUSTOM_FIELDS.quantidade_ativacoes,
      NEO_CUSTOM_FIELDS.industria,
      NEO_CUSTOM_FIELDS.canal,
      NEO_CUSTOM_FIELDS.tipo_integracao,
      NEO_CUSTOM_FIELDS.tipo_ativacao,
      NEO_CUSTOM_FIELDS.layout,
      NEO_CUSTOM_FIELDS.setor,
      NEO_CUSTOM_FIELDS.analista,
      NEO_CUSTOM_FIELDS.deploy_prd,
      NEO_CUSTOM_FIELDS.finalizado,
    ];

    // Busca paginada no Jira usando /rest/api/3/search/jql
    const allRawIssues: any[] = [];
    let nextPageToken: string | undefined = undefined;
    let pageCount = 0;
    const maxPages = 20;

    while (pageCount < maxPages) {
      pageCount++;
      const payload: any = {
        jql,
        fields: queryFields,
        maxResults: 100,
      };
      if (nextPageToken) {
        payload.nextPageToken = nextPageToken;
      }

      const searchRes = await fetch(`https://${host}/rest/api/3/search/jql`, {
        method: 'POST',
        headers: {
          Authorization: getAuthHeader(config),
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (searchRes.status === 401) {
        res.status(401).json({
          error: 'Falha de autenticação com o Jira (401). Verifique suas credenciais em Configurações.',
        });
        return;
      }

      if (!searchRes.ok) {
        const errorText = await searchRes.text();
        throw new Error(`Erro na API do Jira (${searchRes.status}): ${errorText.substring(0, 200)}`);
      }

      const data: any = await searchRes.json();
      const batch = Array.isArray(data.issues) ? data.issues : [];
      allRawIssues.push(...batch);

      if (data.isLast || !data.nextPageToken || batch.length === 0) {
        break;
      }
      nextPageToken = data.nextPageToken;
    }

    const erpsSet = new Set<string>();
    const industriasSet = new Set<string>();
    const statusesSet = new Set<string>();
    const canaisSet = new Set<string>();
    const tiposIntegracaoSet = new Set<string>();

    let totalAtivacoes = 0;
    let totalEmProducaoCards = 0;
    let totalEmProducaoAtivacoes = 0;

    const issues = allRawIssues.map((issue) => {
      const f = issue.fields || {};

      // Quantidade de ativações (customfield_10615)
      const rawQtd = f[NEO_CUSTOM_FIELDS.quantidade_ativacoes];
      const parsedQtd = parseInt(rawQtd, 10);
      const quantidade_ativacoes = (!isNaN(parsedQtd) && parsedQtd > 0) ? parsedQtd : 1;
      totalAtivacoes += quantidade_ativacoes;

      // ERP via Epic Name (parent summary)
      const erp = (f.parent?.fields?.summary || f.parent?.key || 'Sem ERP').trim();
      if (erp && erp !== 'Sem ERP') erpsSet.add(erp);

      // Indústria
      const rawInd = (f[NEO_CUSTOM_FIELDS.industria] || '').trim();
      const industria = rawInd || 'Sem Indústria';
      if (industria && industria !== 'Sem Indústria') industriasSet.add(industria);

      // Status
      const status = f.status?.name || 'Desconhecido';
      statusesSet.add(status);

      const normStatus = status.toLowerCase().trim();
      const isEmProducao = normStatus === 'em produção' || normStatus === 'em producao';

      // Canal de distribuição
      const canal = extractOptionString(f[NEO_CUSTOM_FIELDS.canal]);
      if (canal) canaisSet.add(canal);

      // Tipo de integração
      const tipo_integracao = extractOptionString(f[NEO_CUSTOM_FIELDS.tipo_integracao]);
      if (tipo_integracao) tiposIntegracaoSet.add(tipo_integracao);

      // Tipo de ativação
      const tipo_ativacao = extractOptionString(f[NEO_CUSTOM_FIELDS.tipo_ativacao]);

      // Layout, Setor, Analista
      const layout = f[NEO_CUSTOM_FIELDS.layout] ? String(f[NEO_CUSTOM_FIELDS.layout]).trim() : null;
      const setor = f[NEO_CUSTOM_FIELDS.setor] ? String(f[NEO_CUSTOM_FIELDS.setor]).trim() : null;
      const analista_responsavel = f[NEO_CUSTOM_FIELDS.analista] ? String(f[NEO_CUSTOM_FIELDS.analista]).trim() : null;

      // Datas
      const dt_deploy_prd = f[NEO_CUSTOM_FIELDS.deploy_prd] || null;
      const dt_finalizado = f[NEO_CUSTOM_FIELDS.finalizado] || null;

      // Data de entrada em produção (Deploy PRD -> Finalizado -> ResolutionDate -> Updated)
      let dt_producao: string | null = null;
      let mes_ano_producao: string | null = null;

      const effectiveDateStr = dt_deploy_prd || dt_finalizado || (isEmProducao ? (f.resolutiondate || f.updated) : null);
      if (effectiveDateStr) {
        dt_producao = effectiveDateStr;
        const d = new Date(effectiveDateStr);
        if (!isNaN(d.getTime())) {
          mes_ano_producao = d.toISOString().substring(0, 7); // 'YYYY-MM'
        }
      }

      if (isEmProducao) {
        totalEmProducaoCards++;
        totalEmProducaoAtivacoes += quantidade_ativacoes;
      }

      return {
        key: issue.key,
        summary: f.summary || 'Sem resumo',
        status,
        issuetype: f.issuetype?.name || 'Ativação',
        quantidade_ativacoes,
        erp,
        industria,
        canal,
        tipo_integracao,
        tipo_ativacao,
        layout,
        setor,
        analista_responsavel,
        isEmProducao,
        dt_deploy_prd,
        dt_finalizado,
        dt_producao,
        mes_ano_producao,
        created: f.created,
        url: `https://${host}/browse/${issue.key}`,
      };
    });

    const responsePayload = {
      project: 'NEO',
      totalCards: issues.length,
      totalAtivacoes,
      totalEmProducaoCards,
      totalEmProducaoAtivacoes,
      lastUpdated: new Date().toISOString(),
      issues,
      availableErps: Array.from(erpsSet).sort((a, b) => a.localeCompare(b)),
      availableIndustrias: Array.from(industriasSet).sort((a, b) => a.localeCompare(b)),
      availableStatuses: Array.from(statusesSet).sort((a, b) => a.localeCompare(b)),
      availableCanais: Array.from(canaisSet).sort((a, b) => a.localeCompare(b)),
      availableTiposIntegracao: Array.from(tiposIntegracaoSet).sort((a, b) => a.localeCompare(b)),
    };

    neoActivationsCache.set(cacheKey, { timestamp: now, data: responsePayload });
    res.json(responsePayload);
  } catch (err: any) {
    console.error('[Dashboards] Erro ao processar Ativações Neogrid:', err);
    res.status(500).json({ error: err.message || 'Erro ao carregar ativações da Neogrid' });
  }
});

