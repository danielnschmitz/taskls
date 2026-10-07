import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  CheckCircle2,
  Layers,
  Factory,
  Calendar,
  CalendarDays,
  TrendingUp,
  BarChart3,
  Filter,
  Search,
  Download,
  RefreshCw,
  ExternalLink,
  AlertCircle,
  ArrowUp,
  ArrowDown,
  Building2,
  Cpu,
  Sparkles,
  Clock,
  Briefcase,
  SlidersHorizontal,
  Zap,
  Check,
  CheckSquare,
  Square,
  Info,
  X,
  Save,
  RotateCcw,
} from 'lucide-react';
import {
  JiraNeoActivationIssue,
  JiraNeoActivationsResponse,
  NeoActivationConfig,
  StatusWorkflowStage,
} from '../../types';
import { ExportChartButton } from '../ExportChartButton';

interface JiraNeoActivationsDashboardProps {
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

type DatePreset = 'all' | '30d' | '90d' | 'ytd' | '12m' | 'custom';
type DateFieldFilter = 'created' | 'producao';

type SortField =
  | 'key'
  | 'summary'
  | 'status'
  | 'quantidade_ativacoes'
  | 'erp'
  | 'industria'
  | 'canal'
  | 'tipo_integracao'
  | 'dt_producao'
  | 'dt_ativacao'
  | 'created';

export const DEFAULT_WORKFLOW_STAGES: StatusWorkflowStage[] = [
  { id: 'aberto', name: 'Aberto', mappedStage: 'Aberto', rank: 1, color: '#64748b' },
  { id: 'pronto_p_fazer', name: 'Pronto p/ fazer', mappedStage: 'Pronto p/ fazer', rank: 2, color: '#3b82f6' },
  { id: 'desenvolvimento', name: 'Desenvolvimento', mappedStage: 'Desenvolvimento', rank: 3, color: '#6366f1' },
  { id: 'teste_de_aceitacao', name: 'Teste de Aceitação', mappedStage: 'Em homologação', rank: 4, color: '#f59e0b' },
  { id: 'deploy_hml', name: 'Deploy HML', mappedStage: 'Em homologação', rank: 5, color: '#f97316' },
  { id: 'deploy', name: 'Deploy', mappedStage: 'Homologação aprovada', rank: 6, color: '#06b6d4' },
  { id: 'documentar', name: 'Documentar', mappedStage: 'Produção assistida', rank: 7, color: '#a855f7' },
  { id: 'concluido', name: 'Concluído', mappedStage: 'Em produção', rank: 8, color: '#10b981' },
  { id: 'em_producao', name: 'Em produção', mappedStage: 'Em produção', rank: 9, color: '#059669' },
];

export const DEFAULT_ACTIVATION_CONFIG: NeoActivationConfig = {
  mode: 'threshold',
  thresholdStatus: 'Em produção',
  customStatuses: ['Em produção', 'Concluído'],
};

export const normalizeNeoStatus = (rawStatus: string): string => {
  if (!rawStatus) return '';
  return rawStatus
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
};

export const getStatusRank = (rawStatus: string): number => {
  const s = normalizeNeoStatus(rawStatus);
  if (!s || s === 'cancelado' || s === 'desativado') return 0;
  if (s === 'em producao' || s.includes('producao')) return 9;
  if (s === 'concluido' || s === 'finalizado' || s === 'resolvido') return 8;
  if (s === 'documentar' || s === 'documentacao') return 7;
  if (s === 'deploy' || s === 'deploy prd') return 6;
  if (s === 'deploy hml') return 5;
  if (s === 'teste de aceitacao' || s.includes('aceitacao') || s.includes('homologacao') || s.includes('teste')) return 4;
  if (s === 'desenvolvimento' || s.includes('desenvolv')) return 3;
  if (s.startsWith('pronto p') || s.startsWith('pronto para') || s.includes('pronto')) return 2;
  if (s === 'aberto' || s.includes('aberto') || s.includes('backlog')) return 1;
  return 1;
};

export const isCardActivated = (issue: JiraNeoActivationIssue, cfg: NeoActivationConfig): boolean => {
  const normStatus = normalizeNeoStatus(issue.status);
  if (!normStatus || normStatus === 'cancelado' || normStatus === 'desativado') return false;

  if (cfg.mode === 'custom' && Array.isArray(cfg.customStatuses) && cfg.customStatuses.length > 0) {
    return cfg.customStatuses.some((st) => normalizeNeoStatus(st) === normStatus);
  }

  const thresholdRank = getStatusRank(cfg.thresholdStatus || 'Em produção');
  const issueRank = issue.statusRank !== undefined ? issue.statusRank : getStatusRank(issue.status);
  return issueRank >= thresholdRank && issueRank > 0;
};

export const JiraNeoActivationsDashboard: React.FC<JiraNeoActivationsDashboardProps> = ({ onShowToast }) => {
  // Estado dos Dados
  const [data, setData] = useState<JiraNeoActivationsResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Configuração do Critério de Ativação
  const [activationConfig, setActivationConfig] = useState<NeoActivationConfig>(() => {
    try {
      const saved = localStorage.getItem('taskls_neo_activation_config');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return DEFAULT_ACTIVATION_CONFIG;
  });
  const [isConfigModalOpen, setIsConfigModalOpen] = useState<boolean>(false);
  const [isSavingGlobalConfig, setIsSavingGlobalConfig] = useState<boolean>(false);

  // Filtros Locais
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [dateField, setDateField] = useState<DateFieldFilter>('created');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [erpFilter, setErpFilter] = useState<string>('all');
  const [industriaFilter, setIndustriaFilter] = useState<string>('all');
  const [canalFilter, setCanalFilter] = useState<string>('all');
  const [tipoIntegracaoFilter, setTipoIntegracaoFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Controles do Gráfico de Linhas (Ativações por Mês)
  const [lineChartMetric, setLineChartMetric] = useState<'ativacoes' | 'cards'>('ativacoes');
  const [hoveredMonthIndex, setHoveredMonthIndex] = useState<number | null>(null);

  // Ordenação da Tabela
  const [sortField, setSortField] = useState<SortField>('quantidade_ativacoes');
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  // Controles da Listagem: Layouts e ERPs Desenvolvidos (Chave única: ERP + Layout)
  const [developedSearchQuery, setDevelopedSearchQuery] = useState<string>('');
  const [developedStatusFilter, setDevelopedStatusFilter] = useState<string>('all');
  const [developedSortField, setDevelopedSortField] = useState<'erp' | 'layout' | 'status'>('erp');
  const [developedSortAsc, setDevelopedSortAsc] = useState<boolean>(true);

  // Busca dados da API
  const fetchActivationsData = useCallback(
    async (isForceRefresh: boolean = false, overrideConfig?: NeoActivationConfig) => {
      if (isForceRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setFetchError(null);

      try {
        const params = new URLSearchParams();
        if (isForceRefresh) {
          params.set('refresh', 'true');
        }

        const cfgToUse = overrideConfig || activationConfig;
        if (cfgToUse.mode === 'threshold' && cfgToUse.thresholdStatus) {
          params.set('thresholdStatus', cfgToUse.thresholdStatus);
        } else if (cfgToUse.mode === 'custom' && cfgToUse.customStatuses?.length) {
          params.set('mode', 'custom');
          params.set('customStatuses', cfgToUse.customStatuses.join(','));
        }

        const res = await fetch(`/api/dashboards/jira-neo-ativacoes?${params.toString()}`);
        const json = await res.json();

        if (!res.ok) {
          throw new Error(json.error || 'Erro ao carregar ativações da Neogrid');
        }

        setData(json);

        if (isForceRefresh) {
          onShowToast('Dados de ativações atualizados diretamente do Jira!', 'success');
        }
      } catch (err: any) {
        console.error(err);
        setFetchError(err.message || 'Erro ao comunicar com a API do Jira');
        onShowToast(err.message || 'Erro ao carregar ativações', 'error');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [activationConfig, onShowToast]
  );

  useEffect(() => {
    fetchActivationsData(false);
  }, [fetchActivationsData]);

  // Se a API retornar configuração padrão salva no sistema e o usuário ainda não tiver customizado localmente
  useEffect(() => {
    if (data?.activationConfig) {
      const saved = localStorage.getItem('taskls_neo_activation_config');
      if (!saved) {
        setActivationConfig(data.activationConfig);
      }
    }
  }, [data?.activationConfig]);

  // Salvar configuração como padrão global no servidor
  const handleSaveGlobalConfig = async (newCfg: NeoActivationConfig) => {
    setIsSavingGlobalConfig(true);
    try {
      const res = await fetch('/api/dashboards/neo-ativacoes/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCfg),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Erro ao salvar configuração padrão');
      }
      setActivationConfig(newCfg);
      try {
        localStorage.setItem('taskls_neo_activation_config', JSON.stringify(newCfg));
      } catch (e) {}
      setIsConfigModalOpen(false);
      onShowToast(
        newCfg.mode === 'threshold'
          ? `Configuração salva no sistema! Ativações consideradas a partir de "${newCfg.thresholdStatus}".`
          : 'Configuração salva no sistema com status personalizados!',
        'success'
      );
      fetchActivationsData(true, newCfg);
    } catch (err: any) {
      console.error(err);
      onShowToast(err.message || 'Falha ao salvar padrão global', 'error');
    } finally {
      setIsSavingGlobalConfig(false);
    }
  };

  // Aplicar configuração na sessão local
  const handleApplyConfigLocally = (newCfg: NeoActivationConfig) => {
    setActivationConfig(newCfg);
    try {
      localStorage.setItem('taskls_neo_activation_config', JSON.stringify(newCfg));
    } catch (e) {}
    setIsConfigModalOpen(false);
    onShowToast(
      newCfg.mode === 'threshold'
        ? `Critério alterado para: a partir de "${newCfg.thresholdStatus}".`
        : 'Critério de status personalizados aplicado!',
      'info'
    );
  };

  // Alteração rápida pelo seletor da toolbar
  const handleQuickThresholdSelect = (threshold: string) => {
    const updated: NeoActivationConfig = {
      mode: 'threshold',
      thresholdStatus: threshold,
      customStatuses: [threshold],
    };
    handleApplyConfigLocally(updated);
  };

  // Filtragem dos cards
  const filteredIssues = useMemo(() => {
    if (!data?.issues) return [];

    const now = new Date();
    let filterStart: Date | null = null;
    let filterEnd: Date | null = null;

    if (datePreset === '30d') {
      filterStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      filterEnd = now;
    } else if (datePreset === '90d') {
      filterStart = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      filterEnd = now;
    } else if (datePreset === 'ytd') {
      filterStart = new Date(now.getFullYear(), 0, 1);
      filterEnd = now;
    } else if (datePreset === '12m') {
      filterStart = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
      filterEnd = now;
    } else if (datePreset === 'custom') {
      if (customStartDate) filterStart = new Date(`${customStartDate}T00:00:00`);
      if (customEndDate) filterEnd = new Date(`${customEndDate}T23:59:59`);
    }

    return data.issues.filter((issue) => {
      const normStatus = issue.status.toLowerCase().trim();

      // Regra obrigatória: Todos os gráficos consideram todos os status, EXCETO Cancelado
      if (normStatus === 'cancelado') {
        return false;
      }

      // 1. Filtro de Status
      if (statusFilter !== 'all') {
        if (statusFilter === 'ativados_only') {
          if (!isCardActivated(issue, activationConfig)) return false;
        } else if (statusFilter === 'em_producao_only') {
          if (!issue.isEmProducao) return false;
        } else if (issue.status !== statusFilter) {
          return false;
        }
      }

      // 2. Filtro de ERP
      if (erpFilter !== 'all' && issue.erp !== erpFilter) {
        return false;
      }

      // 3. Filtro de Indústria
      if (industriaFilter !== 'all' && issue.industria !== industriaFilter) {
        return false;
      }

      // 4. Filtro de Canal
      if (canalFilter !== 'all' && issue.canal !== canalFilter) {
        return false;
      }

      // 5. Filtro de Tipo de Integração
      if (tipoIntegracaoFilter !== 'all' && issue.tipo_integracao !== tipoIntegracaoFilter) {
        return false;
      }

      // 6. Filtro de Período
      if (filterStart || filterEnd) {
        const targetDateStr =
          dateField === 'producao'
            ? issue.dt_ativacao || issue.dt_producao || issue.created
            : issue.created;
        if (!targetDateStr) return false;
        const d = new Date(targetDateStr);
        if (isNaN(d.getTime())) return false;
        if (filterStart && d < filterStart) return false;
        if (filterEnd && d > filterEnd) return false;
      }

      // 7. Busca Textual
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesKey = issue.key.toLowerCase().includes(q);
        const matchesSummary = issue.summary.toLowerCase().includes(q);
        const matchesErp = issue.erp.toLowerCase().includes(q);
        const matchesInd = issue.industria.toLowerCase().includes(q);
        const matchesCanal = Boolean(issue.canal && issue.canal.toLowerCase().includes(q));
        const matchesIntegracao = Boolean(issue.tipo_integracao && issue.tipo_integracao.toLowerCase().includes(q));
        if (!matchesKey && !matchesSummary && !matchesErp && !matchesInd && !matchesCanal && !matchesIntegracao) {
          return false;
        }
      }

      return true;
    });
  }, [
    data,
    datePreset,
    dateField,
    customStartDate,
    customEndDate,
    statusFilter,
    erpFilter,
    industriaFilter,
    canalFilter,
    tipoIntegracaoFilter,
    searchQuery,
    activationConfig,
  ]);

  // Cálculo das 4 análises principais e KPIs
  const analytics = useMemo(() => {
    const list = filteredIssues;

    let totalCards = list.length;
    let totalAtivacoes = 0;
    let emProducaoCards = 0;
    let emProducaoAtivacoes = 0;
    let ativadosCards = 0;
    let ativadosAtivacoes = 0;
    let emAndamentoCards = 0;
    let emAndamentoAtivacoes = 0;
    let backlogCards = 0;
    let backlogAtivacoes = 0;

    // 1. Quantidade de Ativações por Status (todos os status ativos)
    const statusMap = new Map<string, { status: string; ativacoes: number; cards: number }>();

    // 2. Quantidade de Ativações por ERP (todos os status ativos)
    const erpMap = new Map<string, { erp: string; ativacoes: number; cards: number }>();

    // 3. Quantidade de Ativações por Indústria (todos os status ativos)
    const industriaMap = new Map<string, { industria: string; ativacoes: number; cards: number }>();

    // 4. Quantidade de Ativações por Mês (Considera cards que atendem ao critério de Ativado)
    const monthlyMap = new Map<
      string,
      {
        monthKey: string;
        label: string;
        ativacoes: number;
        cards: number;
      }
    >();

    // Conjuntos para contagem única
    const distinctErps = new Set<string>();
    const distinctInd = new Set<string>();
    const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

    for (const item of list) {
      const qtd = item.quantidade_ativacoes;
      totalAtivacoes += qtd;

      const activated = isCardActivated(item, activationConfig);
      if (activated) {
        ativadosCards++;
        ativadosAtivacoes += qtd;
      }

      if (item.isEmProducao) {
        emProducaoCards++;
        emProducaoAtivacoes += qtd;
      }

      const normSt = item.status.toLowerCase().trim();

      // Categorização Macro
      if (!activated) {
        if (
          normSt.includes('desenvolvimento') ||
          normSt.includes('deploy hml') ||
          normSt.includes('aceitação') ||
          normSt.includes('aceitacao') ||
          normSt === 'deploy'
        ) {
          emAndamentoCards++;
          emAndamentoAtivacoes += qtd;
        } else if (normSt.includes('aberto') || normSt.includes('pronto')) {
          backlogCards++;
          backlogAtivacoes += qtd;
        }
      }

      // Agrupamento 1: Por Status
      const stCurr = statusMap.get(item.status) || { status: item.status, ativacoes: 0, cards: 0 };
      stCurr.ativacoes += qtd;
      stCurr.cards++;
      statusMap.set(item.status, stCurr);

      // Agrupamento 2: Por ERP (todos os status ativos)
      const erpName = item.erp || 'Sem ERP';
      if (erpName !== 'Sem ERP') distinctErps.add(erpName);
      const erpCurr = erpMap.get(erpName) || { erp: erpName, ativacoes: 0, cards: 0 };
      erpCurr.ativacoes += qtd;
      erpCurr.cards++;
      erpMap.set(erpName, erpCurr);

      // Agrupamento 3: Por Indústria (todos os status ativos)
      const indName = item.industria || 'Sem Indústria';
      if (indName !== 'Sem Indústria') distinctInd.add(indName);
      const indCurr = industriaMap.get(indName) || { industria: indName, ativacoes: 0, cards: 0 };
      indCurr.ativacoes += qtd;
      indCurr.cards++;
      industriaMap.set(indName, indCurr);

      // Agrupamento 4: Por Mês (Apenas cards que atendem ao critério de Ativado)
      if (activated) {
        const actDate = item.dt_ativacao || item.dt_producao || item.dt_deploy_prd || item.dt_finalizado || item.created;
        const mKey =
          item.mes_ano_ativacao ||
          item.mes_ano_producao ||
          (actDate ? actDate.substring(0, 7) : null);

        if (mKey) {
          if (!monthlyMap.has(mKey)) {
            const [yr, mo] = mKey.split('-');
            const label = `${monthNames[parseInt(mo, 10) - 1] || mo}/${yr.substring(2)}`;
            monthlyMap.set(mKey, {
              monthKey: mKey,
              label,
              ativacoes: 0,
              cards: 0,
            });
          }
          const mCurr = monthlyMap.get(mKey)!;
          mCurr.ativacoes += qtd;
          mCurr.cards++;
        }
      }
    }

    // Cores padronizadas para os status do fluxo
    const getStatusColor = (st: string) => {
      const s = st.toLowerCase().trim();
      if (s.includes('aberto')) return '#38bdf8'; // Céu
      if (s.includes('pronto')) return '#818cf8'; // Índigo
      if (s.includes('desenvolvimento')) return '#a855f7'; // Roxo
      if (s.includes('hml')) return '#d946ef'; // Fúcsia
      if (s.includes('aceitação') || s.includes('aceitacao')) return '#f59e0b'; // Âmbar
      if (s === 'deploy') return '#6366f1'; // Violeta
      if (s.includes('produção') || s.includes('producao')) return '#10b981'; // Esmeralda
      if (s.includes('concluído') || s.includes('concluido') || s.includes('resolvido')) return '#059669'; // Verde
      if (s.includes('cancelado')) return '#f43f5e'; // Rose
      return '#94a3b8'; // Slate
    };

    // 1. Array de Status ordenado por volume de ativações
    const byStatus = Array.from(statusMap.values())
      .map((item) => ({
        ...item,
        color: getStatusColor(item.status),
        percentage: totalAtivacoes > 0 ? parseFloat(((item.ativacoes / totalAtivacoes) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.ativacoes - a.ativacoes);

    // 2. Array de ERP ordenado por volume de ativações (todos os status)
    const byErp = Array.from(erpMap.values())
      .map((item) => ({
        ...item,
        percentage: totalAtivacoes > 0 ? parseFloat(((item.ativacoes / totalAtivacoes) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.ativacoes - a.ativacoes);

    // 3. Array de Indústria ordenado por volume de ativações (todos os status)
    const byIndustria = Array.from(industriaMap.values())
      .map((item) => ({
        ...item,
        percentage: totalAtivacoes > 0 ? parseFloat(((item.ativacoes / totalAtivacoes) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.ativacoes - a.ativacoes);

    // 4. Array de Histórico Mensal ordenado cronologicamente
    const byMonth = Array.from(monthlyMap.values())
      .sort((a, b) => a.monthKey.localeCompare(b.monthKey));

    return {
      totalCards,
      totalAtivacoes,
      emProducaoCards,
      emProducaoAtivacoes,
      ativadosCards,
      ativadosAtivacoes,
      emAndamentoCards,
      emAndamentoAtivacoes,
      backlogCards,
      backlogAtivacoes,
      distinctErpsCount: distinctErps.size,
      distinctIndCount: distinctInd.size,
      byStatus,
      byErp,
      byIndustria,
      byMonth,
    };
  }, [filteredIssues, activationConfig]);

  // Ordenação da tabela detalhada
  const sortedIssues = useMemo(() => {
    const list = [...filteredIssues];
    return list.sort((a, b) => {
      let valA: any = null;
      let valB: any = null;

      switch (sortField) {
        case 'key':
          valA = a.key;
          valB = b.key;
          break;
        case 'summary':
          valA = a.summary;
          valB = b.summary;
          break;
        case 'status':
          valA = a.status;
          valB = b.status;
          break;
        case 'quantidade_ativacoes':
          valA = a.quantidade_ativacoes;
          valB = b.quantidade_ativacoes;
          break;
        case 'erp':
          valA = a.erp;
          valB = b.erp;
          break;
        case 'industria':
          valA = a.industria;
          valB = b.industria;
          break;
        case 'canal':
          valA = a.canal || '';
          valB = b.canal || '';
          break;
        case 'tipo_integracao':
          valA = a.tipo_integracao || '';
          valB = b.tipo_integracao || '';
          break;
        case 'dt_producao':
        case 'dt_ativacao':
          valA = a.dt_ativacao || a.dt_producao || '';
          valB = b.dt_ativacao || b.dt_producao || '';
          break;
        case 'created':
        default:
          valA = a.created || '';
          valB = b.created || '';
          break;
      }

      if (typeof valA === 'string' && typeof valB === 'string') {
        return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }

      if (valA === valB) return 0;
      return sortAsc ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
    });
  }, [filteredIssues, sortField, sortAsc]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false); // Maior primeiro por padrão
    }
  };

  // Exportação CSV
  const handleExportCsv = () => {
    if (sortedIssues.length === 0) {
      onShowToast('Nenhum card para exportar com os filtros atuais.', 'info');
      return;
    }

    const headers = [
      'Key',
      'Resumo',
      'Status',
      'Ativado',
      'Critério Ativação',
      'Em Produção',
      'Quantidade de Ativações',
      'ERP (Epic Name)',
      'Indústria',
      'Canal de Distribuição',
      'Tipo de Integração',
      'Tipo de Ativação',
      'Layout',
      'Setor',
      'Analista Responsável',
      'Data Deploy PRD',
      'Data Finalizado',
      'Data Ativação',
      'Mês Ativação',
      'Data Criação',
      'Link Jira',
    ];

    const escapeCsv = (val: any) => {
      if (val === null || val === undefined) return '';
      const s = String(val).replace(/"/g, '""');
      return `"${s}"`;
    };

    const rows = sortedIssues.map((iss) => [
      escapeCsv(iss.key),
      escapeCsv(iss.summary),
      escapeCsv(iss.status),
      escapeCsv(isCardActivated(iss, activationConfig) ? 'Sim' : 'Não'),
      escapeCsv(activationConfig.mode === 'threshold' ? `≥ ${activationConfig.thresholdStatus}` : 'Personalizado'),
      escapeCsv(iss.isEmProducao ? 'Sim' : 'Não'),
      escapeCsv(iss.quantidade_ativacoes),
      escapeCsv(iss.erp),
      escapeCsv(iss.industria),
      escapeCsv(iss.canal || ''),
      escapeCsv(iss.tipo_integracao || ''),
      escapeCsv(iss.tipo_ativacao || ''),
      escapeCsv(iss.layout || ''),
      escapeCsv(iss.setor || ''),
      escapeCsv(iss.analista_responsavel || ''),
      escapeCsv(iss.dt_deploy_prd ? iss.dt_deploy_prd.substring(0, 10) : ''),
      escapeCsv(iss.dt_finalizado ? iss.dt_finalizado.substring(0, 10) : ''),
      escapeCsv(iss.dt_ativacao ? iss.dt_ativacao.substring(0, 10) : (iss.dt_producao ? iss.dt_producao.substring(0, 10) : '')),
      escapeCsv(iss.mes_ano_ativacao || iss.mes_ano_producao || ''),
      escapeCsv(iss.created ? iss.created.substring(0, 10) : ''),
      escapeCsv(iss.url),
    ]);

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `ativacoes_neogrid_${new Date().toISOString().substring(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    onShowToast('Planilha CSV de Ativações exportada com sucesso!', 'success');
  };

  // Valores máximos para barras proporcionais
  const maxStatusQtd = useMemo(() => Math.max(...analytics.byStatus.map((s) => s.ativacoes), 1), [analytics.byStatus]);
  const maxErpQtd = useMemo(() => Math.max(...analytics.byErp.map((e) => e.ativacoes), 1), [analytics.byErp]);
  const maxIndQtd = useMemo(() => Math.max(...analytics.byIndustria.map((i) => i.ativacoes), 1), [analytics.byIndustria]);

  // Estatísticas calculadas para o Gráfico de Linhas (Ativações por Mês - Em Produção)
  const lineChartStats = useMemo(() => {
    const list = analytics.byMonth;
    if (list.length === 0) {
      return {
        peakMonthLabel: '-',
        peakMonthValue: 0,
        totalAtivacoes: 0,
        totalCards: 0,
        avgMonthly: 0,
      };
    }

    let totalAtivacoes = 0;
    let totalCards = 0;
    let peakVal = -1;
    let peakLabel = '-';

    for (const m of list) {
      totalAtivacoes += m.ativacoes;
      totalCards += m.cards;
      const compareVal = lineChartMetric === 'cards' ? m.cards : m.ativacoes;
      if (compareVal > peakVal) {
        peakVal = compareVal;
        peakLabel = `${m.label} (${compareVal} ${lineChartMetric === 'cards' ? 'cards' : 'ativ.'})`;
      }
    }

    const activeTotal = lineChartMetric === 'cards' ? totalCards : totalAtivacoes;
    const avgMonthly = list.length > 0 ? Math.round(activeTotal / list.length) : 0;

    return {
      peakMonthLabel: peakLabel,
      peakMonthValue: peakVal,
      totalAtivacoes,
      totalCards,
      avgMonthly,
    };
  }, [analytics.byMonth, lineChartMetric]);

  // --- SEÇÃO: Layouts e ERPs Desenvolvidos ---
  // Avaliação e mapeamento de status com ranking de conclusão (1 a 9):
  // 1. Aberto = Aberto
  // 2. Pronto p/ fazer = Pronto p/ fazer
  // 3. Desenvolvimento = Desenvolvimento
  // 4. Teste de Aceitação = Em homologação
  // 5. Deploy HML = Em homologação
  // 6. Deploy = Homologação aprovada
  // 7. Documentar = Produção assistida
  // 8. Concluído = Em produção
  // 9. Em produção = Em produção
  const evaluateNeoStatus = useCallback((rawStatus: string): { mappedStatus: string; rank: number } | null => {
    if (!rawStatus) return null;
    const s = rawStatus
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

    // Exclusão explícita: Cancelado e Desativado
    if (s === 'cancelado' || s === 'desativado') {
      return null;
    }

    // 9. Em produção = Em produção
    if (s === 'em producao') {
      return { mappedStatus: 'Em produção', rank: 9 };
    }

    // 8. Concluído = Em produção
    if (s === 'concluido') {
      return { mappedStatus: 'Em produção', rank: 8 };
    }

    // 7. Documentar = Produção assistida (incluindo documentação)
    if (s === 'documentar' || s === 'documentacao') {
      return { mappedStatus: 'Produção assistida', rank: 7 };
    }

    // 6. Deploy = Homologação aprovada (incluindo deploy prd)
    if (s === 'deploy' || s === 'deploy prd') {
      return { mappedStatus: 'Homologação aprovada', rank: 6 };
    }

    // 5. Deploy HML = Em homologação
    if (s === 'deploy hml') {
      return { mappedStatus: 'Em homologação', rank: 5 };
    }

    // 4. Teste de Aceitação = Em homologação
    if (s === 'teste de aceitacao') {
      return { mappedStatus: 'Em homologação', rank: 4 };
    }

    // 3. Desenvolvimento = Desenvolvimento
    if (s === 'desenvolvimento') {
      return { mappedStatus: 'Desenvolvimento', rank: 3 };
    }

    // 2. Pronto p/ fazer = Pronto p/ fazer
    if (s.startsWith('pronto p') || s.startsWith('pronto para')) {
      return { mappedStatus: 'Pronto p/ fazer', rank: 2 };
    }

    // 1. Aberto = Aberto
    if (s === 'aberto') {
      return { mappedStatus: 'Aberto', rank: 1 };
    }

    return null;
  }, []);

  // Extração e desduplicação por chave única (ERP + Layout)
  // Caso tenha mais de um registro com a mesma chave, exibe o que estiver mais perto de ser concluído
  const developedErpLayoutItems = useMemo(() => {
    if (!data?.issues) return [];

    type UniqueItem = {
      erp: string;
      layout: string;
      status: string;
      rank: number;
      cardsCount: number;
      keys: string[];
      urls: string[];
      rawStatus: string;
    };

    const map = new Map<string, UniqueItem>();

    for (const issue of data.issues) {
      const evaluation = evaluateNeoStatus(issue.status);
      if (!evaluation) continue;

      const erp = (issue.erp || 'Sem ERP').trim();
      let rawLayout = (issue.layout || '').trim();

      // Regra: Nos casos que o layout estiver vazio, mas o Canal de distribuição for Varejo, exibir "Varejo" no lugar de layout
      const normCanal = (issue.canal || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

      if (!rawLayout || rawLayout === '-') {
        if (normCanal.includes('varejo')) {
          rawLayout = 'Varejo';
        }
      }

      const layout = rawLayout || '-';
      const groupKey = `${erp.toLowerCase()}___${layout.toLowerCase()}`;

      const existing = map.get(groupKey);
      if (!existing) {
        map.set(groupKey, {
          erp: erp || 'Sem ERP',
          layout: layout || '-',
          status: evaluation.mappedStatus,
          rank: evaluation.rank,
          cardsCount: 1,
          keys: [issue.key],
          urls: [issue.url],
          rawStatus: issue.status,
        });
      } else {
        existing.cardsCount++;
        existing.keys.push(issue.key);
        existing.urls.push(issue.url);

        // Se este card estiver mais próximo da conclusão (maior ranking), adota seu status
        if (evaluation.rank > existing.rank) {
          existing.status = evaluation.mappedStatus;
          existing.rank = evaluation.rank;
          existing.rawStatus = issue.status;
        }
      }
    }

    return Array.from(map.values());
  }, [data, evaluateNeoStatus]);

  // Contadores por status para os botões de filtro rápido
  const developedStatusCounts = useMemo(() => {
    let ativados = 0;
    let emProducao = 0;
    let producaoAssistida = 0;
    let homologacaoAprovada = 0;
    let emHomologacao = 0;
    let desenvolvimento = 0;
    let prontoPFazer = 0;
    let aberto = 0;

    const thresholdRank = getStatusRank(activationConfig.thresholdStatus || 'Em produção');

    for (const item of developedErpLayoutItems) {
      if (item.rank >= thresholdRank) ativados++;
      if (item.status === 'Em produção') emProducao++;
      else if (item.status === 'Produção assistida') producaoAssistida++;
      else if (item.status === 'Homologação aprovada') homologacaoAprovada++;
      else if (item.status === 'Em homologação') emHomologacao++;
      else if (item.status === 'Desenvolvimento') desenvolvimento++;
      else if (item.status === 'Pronto p/ fazer') prontoPFazer++;
      else if (item.status === 'Aberto') aberto++;
    }

    return {
      total: developedErpLayoutItems.length,
      ativados,
      emProducao,
      producaoAssistida,
      homologacaoAprovada,
      emHomologacao,
      desenvolvimento,
      prontoPFazer,
      aberto,
    };
  }, [developedErpLayoutItems, activationConfig]);

  // Filtragem e ordenação da listagem única de ERP e Layout
  const filteredAndSortedDevelopedItems = useMemo(() => {
    const thresholdRank = getStatusRank(activationConfig.thresholdStatus || 'Em produção');
    const filtered = developedErpLayoutItems.filter((item) => {
      if (developedStatusFilter === 'ativados_only') {
        if (item.rank < thresholdRank) return false;
      } else if (developedStatusFilter !== 'all' && item.status !== developedStatusFilter) {
        return false;
      }

      if (developedSearchQuery.trim()) {
        const q = developedSearchQuery.toLowerCase().trim();
        const matchErp = item.erp.toLowerCase().includes(q);
        const matchLayout = item.layout.toLowerCase().includes(q);
        const matchStatus = item.status.toLowerCase().includes(q);
        if (!matchErp && !matchLayout && !matchStatus) {
          return false;
        }
      }

      return true;
    });

    return filtered.sort((a, b) => {
      if (developedSortField === 'erp') {
        const comp = a.erp.toLowerCase().localeCompare(b.erp.toLowerCase(), 'pt-BR');
        return developedSortAsc ? comp : -comp;
      } else if (developedSortField === 'layout') {
        const comp = a.layout.toLowerCase().localeCompare(b.layout.toLowerCase(), 'pt-BR');
        return developedSortAsc ? comp : -comp;
      } else if (developedSortField === 'status') {
        // Ordena por ranking de conclusão (1 a 9)
        const rankDiff = a.rank - b.rank;
        if (rankDiff !== 0) {
          return developedSortAsc ? rankDiff : -rankDiff;
        }
        return a.erp.localeCompare(b.erp, 'pt-BR');
      }

      return 0;
    });
  }, [
    developedErpLayoutItems,
    developedStatusFilter,
    developedSearchQuery,
    developedSortField,
    developedSortAsc,
    activationConfig,
  ]);

  const handleDevelopedSort = (field: 'erp' | 'layout' | 'status') => {
    if (developedSortField === field) {
      setDevelopedSortAsc(!developedSortAsc);
    } else {
      setDevelopedSortField(field);
      setDevelopedSortAsc(true);
    }
  };

  const handleExportDevelopedCsv = () => {
    if (filteredAndSortedDevelopedItems.length === 0) {
      onShowToast('Nenhum dado para exportar na listagem de layouts e ERPs', 'info');
      return;
    }

    const headers = ['ERP', 'Layout', 'Status'];
    const rows = filteredAndSortedDevelopedItems.map((item) => [
      `"${(item.erp || '').replace(/"/g, '""')}"`,
      `"${(item.layout || '-').replace(/"/g, '""')}"`,
      `"${(item.status || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `layouts_e_erps_neogrid_${new Date().toISOString().substring(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    onShowToast('CSV de Layouts e ERPs exportado com sucesso!', 'success');
  };

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'Em produção':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Em produção
          </span>
        );
      case 'Produção assistida':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-500" />
            Produção assistida
          </span>
        );
      case 'Homologação aprovada':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
            Homologação aprovada
          </span>
        );
      case 'Em homologação':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            Em homologação
          </span>
        );
      case 'Desenvolvimento':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
            Desenvolvimento
          </span>
        );
      case 'Pronto p/ fazer':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
            Pronto p/ fazer
          </span>
        );
      case 'Aberto':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
            Aberto
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Barra de Filtros e Controles Superiores */}
      <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#0e1628]/90 border border-slate-200 dark:border-slate-800 shadow-xl backdrop-blur-sm space-y-4">
        {/* Linha 1: Período, Campo de Data e Botão de Refresh */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800/80 pb-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Badge Projeto Neogrid */}
            <div className="flex items-center gap-2 bg-indigo-500/10 dark:bg-indigo-950/40 border border-indigo-500/30 px-3 py-1.5 rounded-xl text-xs font-bold text-indigo-700 dark:text-indigo-300">
              <Sparkles className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
              <span>Projeto NEO &bull; Neogrid</span>
            </div>

            {/* Seletor de Período Preset */}
            <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs">
              <button
                type="button"
                onClick={() => setDatePreset('all')}
                className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                  datePreset === 'all'
                    ? 'bg-indigo-600 text-white font-bold shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                Histórico Todo
              </button>
              <button
                type="button"
                onClick={() => setDatePreset('30d')}
                className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                  datePreset === '30d'
                    ? 'bg-indigo-600 text-white font-bold shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                30 Dias
              </button>
              <button
                type="button"
                onClick={() => setDatePreset('90d')}
                className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                  datePreset === '90d'
                    ? 'bg-indigo-600 text-white font-bold shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                90 Dias
              </button>
              <button
                type="button"
                onClick={() => setDatePreset('ytd')}
                className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                  datePreset === 'ytd'
                    ? 'bg-indigo-600 text-white font-bold shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                Ano Atual (YTD)
              </button>
              <button
                type="button"
                onClick={() => setDatePreset('12m')}
                className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                  datePreset === '12m'
                    ? 'bg-indigo-600 text-white font-bold shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                12 Meses
              </button>
              <button
                type="button"
                onClick={() => setDatePreset('custom')}
                className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                  datePreset === 'custom'
                    ? 'bg-indigo-600 text-white font-bold shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                Personalizado
              </button>
            </div>

            {/* Inputs de Data Personalizada */}
            {datePreset === 'custom' && (
              <div className="flex items-center gap-2 animate-in fade-in">
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="px-2.5 py-1 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
                />
                <span className="text-slate-500 text-xs">até</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="px-2.5 py-1 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>
            )}

            {/* Seletor de Base de Data do Filtro */}
            <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-950 px-2.5 py-1 rounded-xl border border-slate-200 dark:border-slate-800">
              <span className="text-[11px] font-semibold">Base de Data:</span>
              <button
                type="button"
                onClick={() => setDateField('producao')}
                className={`px-2 py-0.5 rounded-lg font-semibold transition-all ${
                  dateField === 'producao'
                    ? 'bg-emerald-500/15 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-bold'
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
                title="Filtra com base na data em que a demanda foi ativada / entrou em produção"
              >
                Data Ativação
              </button>
              <button
                type="button"
                onClick={() => setDateField('created')}
                className={`px-2 py-0.5 rounded-lg font-semibold transition-all ${
                  dateField === 'created'
                    ? 'bg-indigo-500/15 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 font-bold'
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
                title="Filtra com base na data em que a demanda foi criada no Jira"
              >
                Criação
              </button>
            </div>

            {/* Seletor de Critério de Ativação */}
            <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-950 px-2.5 py-1 rounded-xl border border-slate-200 dark:border-slate-800">
              <Zap className="w-3.5 h-3.5 text-emerald-500 fill-emerald-500/20" />
              <span className="text-[11px] font-semibold whitespace-nowrap">Ativado a partir de:</span>
              <select
                value={activationConfig.mode === 'threshold' ? activationConfig.thresholdStatus : 'custom'}
                onChange={(e) => {
                  if (e.target.value === 'custom_modal') {
                    setIsConfigModalOpen(true);
                  } else {
                    handleQuickThresholdSelect(e.target.value);
                  }
                }}
                className="px-2 py-0.5 text-xs font-bold bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-emerald-700 dark:text-emerald-300 focus:outline-none focus:border-emerald-500 cursor-pointer shadow-xs"
                title="Define a partir de qual status um card é considerado como ativado"
              >
                {DEFAULT_WORKFLOW_STAGES.map((st) => (
                  <option key={st.id} value={st.name}>
                    {st.name} (Etapa #{st.rank})
                  </option>
                ))}
                {activationConfig.mode === 'custom' && (
                  <option value="custom">
                    Personalizado ({activationConfig.customStatuses?.length || 0} status)
                  </option>
                )}
                <option value="custom_modal">⚙️ Mais opções...</option>
              </select>
              <button
                type="button"
                onClick={() => setIsConfigModalOpen(true)}
                className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 rounded-lg transition-colors"
                title="Configurar critérios de ativação e salvar como padrão do sistema"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Botão de Atualização em Tempo Real */}
          <div className="flex items-center gap-3">
            {data?.lastUpdated && (
              <span className="hidden md:inline text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                Última sincronização: {new Date(data.lastUpdated).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <button
              type="button"
              disabled={isLoading || isRefreshing}
              onClick={() => fetchActivationsData(true)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 text-indigo-600 dark:text-indigo-300 hover:text-indigo-700 dark:hover:text-white border border-slate-300 dark:border-slate-700 text-xs font-bold transition-all shadow-sm active:scale-95"
              title="Recarregar ativações atualizadas do Jira"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-indigo-500 dark:text-indigo-400' : ''}`} />
              <span>{isRefreshing ? 'Sincronizando...' : 'Atualizar Agora'}</span>
            </button>
          </div>
        </div>

        {/* Linha 2: Dropdowns de Filtro (Status, ERP, Indústria, Canal, Tipo Integração) */}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          {/* Filtro de Status */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs font-medium bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer shadow-sm"
            >
              <option value="all">Todos os Status (exceto Cancelado)</option>
              <option value="ativados_only">
                Apenas Ativados (≥ {activationConfig.mode === 'threshold' ? activationConfig.thresholdStatus : 'Personalizado'})
              </option>
              <option value="em_producao_only">Apenas Em Produção</option>
              {data?.availableStatuses
                ?.filter((st) => st.toLowerCase().trim() !== 'cancelado')
                .map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
            </select>
          </div>

          {/* Filtro de ERP */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">ERP:</span>
            <select
              value={erpFilter}
              onChange={(e) => setErpFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs font-medium bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer shadow-sm max-w-[160px]"
            >
              <option value="all">Todos os ERPs ({data?.availableErps?.length || 0})</option>
              {data?.availableErps?.map((erp) => (
                <option key={erp} value={erp}>
                  {erp}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro de Indústria */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Indústria:</span>
            <select
              value={industriaFilter}
              onChange={(e) => setIndustriaFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs font-medium bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer shadow-sm max-w-[170px]"
            >
              <option value="all">Todas ({data?.availableIndustrias?.length || 0})</option>
              {data?.availableIndustrias?.map((ind) => (
                <option key={ind} value={ind}>
                  {ind}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro de Canal de Distribuição */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Canal:</span>
            <select
              value={canalFilter}
              onChange={(e) => setCanalFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs font-medium bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer shadow-sm"
            >
              <option value="all">Todos os Canais</option>
              {data?.availableCanais?.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro de Tipo de Integração */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Integração:</span>
            <select
              value={tipoIntegracaoFilter}
              onChange={(e) => setTipoIntegracaoFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs font-medium bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer shadow-sm"
            >
              <option value="all">Todos os Tipos</option>
              {data?.availableTiposIntegracao?.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          {/* Limpar Filtros se algum estiver selecionado */}
          {(statusFilter !== 'all' ||
            erpFilter !== 'all' ||
            industriaFilter !== 'all' ||
            canalFilter !== 'all' ||
            tipoIntegracaoFilter !== 'all' ||
            datePreset !== 'all' ||
            searchQuery !== '') && (
            <button
              type="button"
              onClick={() => {
                setStatusFilter('all');
                setErpFilter('all');
                setIndustriaFilter('all');
                setCanalFilter('all');
                setTipoIntegracaoFilter('all');
                setDatePreset('all');
                setSearchQuery('');
              }}
              className="px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-all border border-slate-300 dark:border-slate-700"
            >
              Limpar Filtros
            </button>
          )}
        </div>
      </div>

      {/* Erro de Comunicação ou Configuração */}
      {fetchError && (
        <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-500/40 text-rose-800 dark:text-rose-200 text-xs flex items-center justify-between gap-3 shadow-lg">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-5 h-5 text-rose-500 dark:text-rose-400 flex-shrink-0" />
            <span>{fetchError}</span>
          </div>
          <button
            type="button"
            onClick={() => fetchActivationsData(true)}
            className="px-3 py-1.5 rounded-xl bg-rose-500/10 dark:bg-rose-500/20 hover:bg-rose-500/20 dark:hover:bg-rose-500/30 text-rose-700 dark:text-rose-200 font-bold border border-rose-500/30 text-xs transition-all flex-shrink-0"
          >
            Tentar Novamente
          </button>
        </div>
      )}

      {/* Cards de Métricas e KPIs Principais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* KPI 1: Total de Ativações */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#0e1628]/90 border border-slate-200 dark:border-slate-800 shadow-xl relative overflow-hidden group hover:border-indigo-500/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
              Total de Ativações
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-500/15 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30">
              Campo Jira
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">
              {analytics.totalAtivacoes}
            </span>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">ativações</span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
            Em {analytics.totalCards} cards do projeto Neogrid
          </p>
        </div>

        {/* KPI 2: Ativações Entregues / Ativadas */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#0e1628]/90 border border-slate-200 dark:border-slate-800 shadow-xl relative overflow-hidden group hover:border-emerald-500/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
              Ativações Ativadas
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/15 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              ≥ {activationConfig.mode === 'threshold' ? activationConfig.thresholdStatus : 'Personalizado'}
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight">
              {analytics.ativadosAtivacoes}
            </span>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              ({analytics.totalAtivacoes > 0 ? Math.round((analytics.ativadosAtivacoes / analytics.totalAtivacoes) * 100) : 0}%)
            </span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
            {analytics.ativadosCards} cards ativados (a partir de "{activationConfig.thresholdStatus}")
          </p>
        </div>

        {/* KPI 3: Ativações Em Andamento (Dev, HML, Teste, Deploy) */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#0e1628]/90 border border-slate-200 dark:border-slate-800 shadow-xl relative overflow-hidden group hover:border-amber-500/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-amber-500 dark:text-amber-400" />
              Em Andamento
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500/15 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30">
              Pipeline
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-amber-600 dark:text-amber-400 tracking-tight">
              {analytics.emAndamentoAtivacoes}
            </span>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">ativações</span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
            {analytics.emAndamentoCards} cards em Dev, HML, Teste ou Deploy
          </p>
        </div>

        {/* KPI 4: Backlog / Triagem */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#0e1628]/90 border border-slate-200 dark:border-slate-800 shadow-xl relative overflow-hidden group hover:border-sky-500/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-sky-500 dark:text-sky-400" />
              Backlog & Triagem
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-sky-500/15 dark:bg-sky-500/20 text-sky-700 dark:text-sky-300 border border-sky-500/30">
              Aberto / Pronto
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-sky-600 dark:text-sky-400 tracking-tight">
              {analytics.backlogAtivacoes}
            </span>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">ativações</span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
            {analytics.backlogCards} cards aguardando início técnico
          </p>
        </div>

        {/* KPI 5: ERPs & Indústrias Atendidas */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#0e1628]/90 border border-slate-200 dark:border-slate-800 shadow-xl relative overflow-hidden group hover:border-purple-500/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-purple-500 dark:text-purple-400" />
              ERPs & Indústrias
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-500/15 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 border border-purple-500/30">
              Ativos
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              {analytics.distinctErpsCount} <span className="text-xs font-normal text-slate-500 dark:text-slate-400">ERPs</span>
            </span>
            <span className="text-slate-400 dark:text-slate-500 text-xs font-bold">&bull;</span>
            <span className="text-2xl font-black text-purple-600 dark:text-purple-300 tracking-tight">
              {analytics.distinctIndCount} <span className="text-xs font-normal text-slate-500 dark:text-slate-400">Ind.</span>
            </span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
            Sistemas ERP e indústrias no escopo filtrado
          </p>
        </div>
      </div>

      {/* Grid com as 4 Seções Analíticas Principais */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* SEÇÃO 1: Quantidade de Ativações por Status */}
        <div id="chart-neo-status" className="p-5 rounded-2xl bg-white dark:bg-[#0e1628]/90 border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
                1. Quantidade de Ativações por Status
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Distribuição das ativações por status no fluxo operacional (exceto Cancelado)
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800">
                {analytics.totalAtivacoes} ativações totais
              </span>
              <ExportChartButton
                targetId="chart-neo-status"
                fileName="ativacoes-neogrid-por-status"
                onShowToast={onShowToast}
              />
            </div>
          </div>

          <div className="space-y-3.5 pt-1">
            {analytics.byStatus.length === 0 ? (
              <p className="text-xs text-slate-500 italic py-8 text-center">Nenhum dado para os filtros selecionados.</p>
            ) : (
              analytics.byStatus.map((item) => {
                const barWidth = maxStatusQtd > 0 ? (item.ativacoes / maxStatusQtd) * 100 : 0;
                return (
                  <div key={item.status} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: item.color }}
                        />
                        {item.status}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-slate-900 dark:text-white text-sm">
                          {item.ativacoes} <span className="text-slate-500 dark:text-slate-400 font-normal text-xs">ativ.</span>
                        </span>
                        <span className="text-slate-400 dark:text-slate-500 text-[11px]">({item.cards} cards &bull; {item.percentage}%)</span>
                      </div>
                    </div>

                    <div className="h-2.5 w-full bg-slate-100 dark:bg-slate-950 rounded-full overflow-hidden p-0.5 border border-slate-200 dark:border-slate-800/80">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${Math.max(barWidth, 2)}%`,
                          backgroundColor: item.color,
                        }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* SEÇÃO 4: Evolução Mensal de Ativações (Gráfico de Linhas) */}
        <div id="chart-neo-monthly" className="p-5 rounded-2xl bg-white dark:bg-[#0e1628]/90 border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
                4. Ativações por Mês
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Evolução temporal &bull; Considera status a partir de "{activationConfig.mode === 'threshold' ? activationConfig.thresholdStatus : 'Personalizado'}" &bull; Gráfico de linhas
              </p>
            </div>

            <div className="flex items-center gap-2">
              {/* Alternador de Métrica do Gráfico de Linhas */}
              <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs">
                <button
                  type="button"
                  onClick={() => setLineChartMetric('ativacoes')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                    lineChartMetric === 'ativacoes'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                  title="Exibir volume total de ativações entregues por mês"
                >
                  Volume Ativações
                </button>
                <button
                  type="button"
                  onClick={() => setLineChartMetric('cards')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                    lineChartMetric === 'cards'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                  title="Exibir quantidade de cards/demandas ativadas por mês"
                >
                  Qtd. Cards
                </button>
              </div>

              <ExportChartButton
                targetId="chart-neo-monthly"
                fileName="ativacoes-neogrid-por-mes"
                onShowToast={onShowToast}
              />
            </div>
          </div>

          {/* Badges de Resumo e Legenda do Gráfico de Linhas */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300 font-medium">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" />
                <span>Total Ativações: <strong>{lineChartStats.totalAtivacoes}</strong></span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 font-medium">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-400 dark:bg-slate-500" />
                <span>Total Cards: <strong>{lineChartStats.totalCards}</strong></span>
              </div>
            </div>

            <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400 text-[11px]">
              <span>Média: <strong className="text-slate-700 dark:text-slate-200">{lineChartStats.avgMonthly} {lineChartMetric === 'cards' ? 'cards/mês' : 'ativ/mês'}</strong></span>
              <span>&bull;</span>
              <span>Pico: <strong className="text-emerald-600 dark:text-emerald-400">{lineChartStats.peakMonthLabel}</strong></span>
            </div>
          </div>

          {/* SVG Line Chart Container */}
          <div className="relative pt-2">
            {analytics.byMonth.length === 0 ? (
              <p className="text-xs text-slate-500 italic py-14 text-center">
                Nenhuma ativação encontrada para o critério selecionado nos filtros aplicados.
              </p>
            ) : (
              (() => {
                const dataPoints = analytics.byMonth;
                const svgW = 680;
                const svgH = 240;
                const padLeft = 45;
                const padRight = 30;
                const padTop = 25;
                const padBottom = 35;
                const plotW = svgW - padLeft - padRight;
                const plotH = svgH - padTop - padBottom;

                // Valor máximo para a escala Y
                const rawMax = Math.max(
                  ...dataPoints.map((d) => (lineChartMetric === 'cards' ? d.cards : d.ativacoes)),
                  1
                );
                const scaleMax =
                  rawMax <= 5 ? 5 : rawMax <= 10 ? 10 : rawMax <= 20 ? 20 : rawMax <= 30 ? 30 : Math.ceil(rawMax / 10) * 10;

                // Ticks horizontais (grid)
                const yTicks = [0, Math.round(scaleMax * 0.25), Math.round(scaleMax * 0.5), Math.round(scaleMax * 0.75), scaleMax];

                // Coordenadas dos pontos
                const points = dataPoints.map((d, i) => {
                  const x =
                    dataPoints.length > 1
                      ? padLeft + (i / (dataPoints.length - 1)) * plotW
                      : padLeft + plotW / 2;
                  const val = lineChartMetric === 'cards' ? d.cards : d.ativacoes;
                  const y = padTop + plotH - (val / scaleMax) * plotH;
                  return { ...d, index: i, x, y, val };
                });

                // Função para curva suave
                const createSmoothPath = (pts: { x: number; y: number }[]) => {
                  if (pts.length === 0) return '';
                  if (pts.length === 1) return `M ${pts[0].x},${pts[0].y}`;
                  let d = `M ${pts[0].x},${pts[0].y}`;
                  for (let i = 0; i < pts.length - 1; i++) {
                    const p0 = pts[i];
                    const p1 = pts[i + 1];
                    const cpX = (p0.x + p1.x) / 2;
                    d += ` C ${cpX},${p0.y} ${cpX},${p1.y} ${p1.x},${p1.y}`;
                  }
                  return d;
                };

                const prodSmooth = createSmoothPath(points.map((p) => ({ x: p.x, y: p.y })));
                const prodArea =
                  points.length > 0
                    ? `${prodSmooth} L ${points[points.length - 1].x},${padTop + plotH} L ${points[0].x},${padTop + plotH} Z`
                    : '';

                const hoveredPoint = hoveredMonthIndex !== null ? points[hoveredMonthIndex] : null;

                return (
                  <div className="relative">
                    <svg
                      viewBox={`0 0 ${svgW} ${svgH}`}
                      className="w-full h-auto overflow-visible select-none"
                    >
                      <defs>
                        {/* Gradiente de Área Produção (Esmeralda) */}
                        <linearGradient id="areaProdGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#10b981" stopOpacity="0.35" />
                          <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                        </linearGradient>

                        {/* Gradiente de Linha Produção */}
                        <linearGradient id="lineProdGrad" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="#34d399" />
                          <stop offset="100%" stopColor="#059669" />
                        </linearGradient>
                      </defs>

                      {/* Linhas de Grade e Eixo Y */}
                      {yTicks.map((val) => {
                        const y = padTop + plotH - (val / scaleMax) * plotH;
                        return (
                          <g key={val}>
                            <line
                              x1={padLeft}
                              y1={y}
                              x2={padLeft + plotW}
                              y2={y}
                              className="stroke-slate-200 dark:stroke-slate-700"
                              strokeDasharray="4 4"
                              strokeWidth="1"
                              opacity="0.8"
                            />
                            <text
                              x={padLeft - 8}
                              y={y + 3.5}
                              textAnchor="end"
                              className="fill-slate-400 dark:fill-slate-500"
                              fontSize="10"
                              fontFamily="monospace"
                            >
                              {val}
                            </text>
                          </g>
                        );
                      })}

                      {/* Linha Vertical no Eixo X (Baseline) */}
                      <line
                        x1={padLeft}
                        y1={padTop + plotH}
                        x2={padLeft + plotW}
                        y2={padTop + plotH}
                        className="stroke-slate-300 dark:stroke-slate-600"
                        strokeWidth="1"
                      />

                      {/* Área Preenchida Produção */}
                      {prodArea && (
                        <path d={prodArea} fill="url(#areaProdGrad)" />
                      )}

                      {/* Linha Curva Produção */}
                      {prodSmooth && (
                        <path
                          d={prodSmooth}
                          fill="none"
                          stroke="url(#lineProdGrad)"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      )}

                      {/* Linha Guia Vertical Hover */}
                      {hoveredPoint && (
                        <line
                          x1={hoveredPoint.x}
                          y1={padTop}
                          x2={hoveredPoint.x}
                          y2={padTop + plotH}
                          stroke="#10b981"
                          strokeDasharray="3 3"
                          strokeWidth="1.5"
                          opacity="0.8"
                        />
                      )}

                      {/* Pontos de Produção */}
                      {points.map((p) => {
                        const isHovered = hoveredMonthIndex === p.index;
                        return (
                          <g key={`prod-pt-${p.monthKey}`}>
                            {isHovered && (
                              <circle
                                cx={p.x}
                                cy={p.y}
                                r="8"
                                fill="#10b981"
                                opacity="0.3"
                              />
                            )}
                            <circle
                              cx={p.x}
                              cy={p.y}
                              r={isHovered ? 5.5 : 4}
                              fill="#064e3b"
                              stroke="#34d399"
                              strokeWidth="2"
                              className="transition-all"
                            />
                            {/* Valor numérico acima do ponto se > 0 */}
                            {p.val > 0 && (
                              <text
                                x={p.x}
                                y={p.y - 8}
                                textAnchor="middle"
                                className="fill-emerald-700 dark:fill-emerald-300 font-bold"
                                fontSize="10"
                                fontFamily="monospace"
                              >
                                {p.val}
                              </text>
                            )}
                          </g>
                        );
                      })}

                      {/* Labels do Eixo X (Meses) */}
                      {points.map((p) => {
                        const isHovered = hoveredMonthIndex === p.index;
                        return (
                          <text
                            key={`lbl-${p.monthKey}`}
                            x={p.x}
                            y={padTop + plotH + 20}
                            textAnchor="middle"
                            className={`transition-colors cursor-pointer text-[10px] ${
                              isHovered
                                ? 'fill-slate-900 dark:fill-white font-bold'
                                : 'fill-slate-500 dark:fill-slate-400 font-normal'
                            }`}
                          >
                            {p.label}
                          </text>
                        );
                      })}

                      {/* Áreas Invisíveis de Hover por Fatia do Mês */}
                      {points.map((p, i) => {
                        const sliceWidth = plotW / (points.length || 1);
                        const sliceX = p.x - sliceWidth / 2;
                        return (
                          <rect
                            key={`slice-${p.monthKey}`}
                            x={Math.max(sliceX, padLeft)}
                            y={padTop}
                            width={sliceWidth}
                            height={plotH + padBottom}
                            fill="transparent"
                            className="cursor-pointer"
                            onMouseEnter={() => setHoveredMonthIndex(i)}
                            onMouseLeave={() => setHoveredMonthIndex(null)}
                          />
                        );
                      })}
                    </svg>

                    {/* Tooltip Card Flutuante quando hovering */}
                    {hoveredPoint && (
                      <div
                        className="absolute pointer-events-none z-20 px-3 py-2 rounded-xl bg-white/95 dark:bg-slate-900/95 border border-emerald-500/40 shadow-2xl backdrop-blur-md text-xs space-y-1 transition-all"
                        style={{
                          left: `${Math.min(Math.max((hoveredPoint.x / svgW) * 100, 15), 85)}%`,
                          top: '10px',
                          transform: 'translateX(-50%)',
                        }}
                      >
                        <div className="font-bold text-slate-900 dark:text-white flex items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-1">
                          <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                            <Calendar className="w-3.5 h-3.5" />
                            {hoveredPoint.label}
                          </span>
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                            {hoveredPoint.monthKey}
                          </span>
                        </div>

                        <div className="pt-0.5 space-y-1 text-[11px]">
                          <div className="flex items-center justify-between gap-3 text-emerald-700 dark:text-emerald-300">
                            <span className="flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-emerald-500" />
                              Ativações Ativadas:
                            </span>
                            <span className="font-bold font-mono text-slate-900 dark:text-white">
                              {hoveredPoint.ativacoes} ativ.
                            </span>
                          </div>

                          <div className="flex items-center justify-between gap-3 text-slate-600 dark:text-slate-300">
                            <span className="flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-slate-400 dark:bg-slate-500" />
                              Cards Ativados:
                            </span>
                            <span className="font-bold font-mono text-slate-900 dark:text-white">
                              {hoveredPoint.cards} {hoveredPoint.cards === 1 ? 'card' : 'cards'}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()
            )}
          </div>
        </div>

        {/* SEÇÃO 2: Quantidade de Ativações por ERP (Todos os Status Ativos) */}
        <div id="chart-neo-erp" className="p-5 rounded-2xl bg-white dark:bg-[#0e1628]/90 border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Cpu className="w-4 h-4 text-purple-500 dark:text-purple-400" />
                2. Quantidade de Ativações por ERP
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                ERP extraído do <strong>Epic Name</strong> &bull; Considera todos os status ativos
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-purple-700 dark:text-purple-300 bg-purple-500/10 dark:bg-purple-950/40 px-2.5 py-1 rounded-lg border border-purple-500/30">
                {analytics.byErp.length} ERPs
              </span>
              <ExportChartButton
                targetId="chart-neo-erp"
                fileName="ativacoes-neogrid-por-erp"
                onShowToast={onShowToast}
              />
            </div>
          </div>

          <div className="space-y-3 pt-1 max-h-[360px] overflow-y-auto pr-1">
            {analytics.byErp.length === 0 ? (
              <p className="text-xs text-slate-500 italic py-8 text-center">Nenhum card encontrado para os filtros selecionados.</p>
            ) : (
              analytics.byErp.map((item, idx) => {
                const barWidth = maxErpQtd > 0 ? (item.ativacoes / maxErpQtd) * 100 : 0;
                return (
                  <div key={item.erp} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                        <span className="w-5 h-5 rounded-lg bg-purple-500/10 dark:bg-purple-950/80 border border-purple-500/30 text-purple-700 dark:text-purple-300 text-[10px] font-black flex items-center justify-center flex-shrink-0">
                          {idx + 1}
                        </span>
                        {item.erp}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-purple-600 dark:text-purple-300 text-sm">
                          {item.ativacoes} <span className="text-slate-500 dark:text-slate-400 font-normal text-xs">ativ.</span>
                        </span>
                        <span className="text-slate-400 dark:text-slate-500 text-[11px]">({item.cards} cards &bull; {item.percentage}%)</span>
                      </div>
                    </div>

                    <div className="h-2 w-full bg-slate-200 dark:bg-slate-900 rounded-full overflow-hidden p-0.5 border border-slate-300 dark:border-slate-800">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-purple-500 to-indigo-500 transition-all duration-700"
                        style={{ width: `${Math.max(barWidth, 3)}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* SEÇÃO 3: Quantidade de Ativações por Indústria (Todos os Status Ativos) */}
        <div id="chart-neo-industria" className="p-5 rounded-2xl bg-white dark:bg-[#0e1628]/90 border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Factory className="w-4 h-4 text-cyan-500 dark:text-cyan-400" />
                3. Quantidade de Ativações por Indústria
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Campo "Indústria " do Jira &bull; Considera todos os status ativos
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-cyan-700 dark:text-cyan-300 bg-cyan-500/10 dark:bg-cyan-950/40 px-2.5 py-1 rounded-lg border border-cyan-500/30">
                {analytics.byIndustria.length} Indústrias
              </span>
              <ExportChartButton
                targetId="chart-neo-industria"
                fileName="ativacoes-neogrid-por-industria"
                onShowToast={onShowToast}
              />
            </div>
          </div>

          <div className="space-y-3 pt-1 max-h-[360px] overflow-y-auto pr-1">
            {analytics.byIndustria.length === 0 ? (
              <p className="text-xs text-slate-500 italic py-8 text-center">Nenhuma indústria encontrada para os filtros selecionados.</p>
            ) : (
              analytics.byIndustria.map((item, idx) => {
                const barWidth = maxIndQtd > 0 ? (item.ativacoes / maxIndQtd) * 100 : 0;
                return (
                  <div key={item.industria} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                        <span className="w-5 h-5 rounded-lg bg-cyan-500/10 dark:bg-cyan-950/80 border border-cyan-500/30 text-cyan-700 dark:text-cyan-300 text-[10px] font-black flex items-center justify-center flex-shrink-0">
                          {idx + 1}
                        </span>
                        {item.industria}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-cyan-600 dark:text-cyan-300 text-sm">
                          {item.ativacoes} <span className="text-slate-500 dark:text-slate-400 font-normal text-xs">ativ.</span>
                        </span>
                        <span className="text-slate-400 dark:text-slate-500 text-[11px]">({item.cards} cards &bull; {item.percentage}%)</span>
                      </div>
                    </div>

                    <div className="h-2 w-full bg-slate-200 dark:bg-slate-900 rounded-full overflow-hidden p-0.5 border border-slate-300 dark:border-slate-800">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-700"
                        style={{ width: `${Math.max(barWidth, 3)}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* SEÇÃO: Layouts e ERPs Desenvolvidos */}
      <div id="section-developed-erp-layout" className="p-5 rounded-2xl bg-white dark:bg-[#0e1628]/90 border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                <Layers className="w-4 h-4" />
              </span>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Layouts e ERPs Desenvolvidos
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                {filteredAndSortedDevelopedItems.length} registros únicos
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Projeto NEO &bull; Chave única (ERP + Layout) &bull; Exibindo status mais próximo da conclusão
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Campo de Busca Rápida */}
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              <input
                type="text"
                placeholder="Filtrar ERP, layout ou status..."
                value={developedSearchQuery}
                onChange={(e) => setDevelopedSearchQuery(e.target.value)}
                className="w-full pl-8 pr-7 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
              {developedSearchQuery && (
                <button
                  type="button"
                  onClick={() => setDevelopedSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Botão Exportar CSV */}
            <button
              type="button"
              onClick={handleExportDevelopedCsv}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-md shadow-emerald-600/20 active:scale-95"
              title="Exportar listagem com as colunas ERP, Layout e Status em CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exportar CSV</span>
            </button>
          </div>
        </div>

        {/* Filtros Rápidos por Status Mapeado */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mr-1 flex items-center gap-1">
            <Filter className="w-3 h-3" />
            Status:
          </span>
          <button
            type="button"
            onClick={() => setDevelopedStatusFilter('all')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
              developedStatusFilter === 'all'
                ? 'bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 shadow-sm'
                : 'bg-slate-100 dark:bg-slate-950 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            Todos ({developedStatusCounts.total})
          </button>
          <button
            type="button"
            onClick={() => setDevelopedStatusFilter('ativados_only')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              developedStatusFilter === 'ativados_only'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 border border-emerald-500/20'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Ativados ≥ {activationConfig.thresholdStatus} ({developedStatusCounts.ativados})
          </button>
          <button
            type="button"
            onClick={() => setDevelopedStatusFilter('Em produção')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              developedStatusFilter === 'Em produção'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 border border-emerald-500/20'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Em produção ({developedStatusCounts.emProducao})
          </button>
          <button
            type="button"
            onClick={() => setDevelopedStatusFilter('Produção assistida')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              developedStatusFilter === 'Produção assistida'
                ? 'bg-cyan-600 text-white shadow-sm'
                : 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-500/20 border border-cyan-500/20'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-500" />
            Produção assistida ({developedStatusCounts.producaoAssistida})
          </button>
          <button
            type="button"
            onClick={() => setDevelopedStatusFilter('Homologação aprovada')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              developedStatusFilter === 'Homologação aprovada'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/20 border border-indigo-500/20'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
            Homologação aprovada ({developedStatusCounts.homologacaoAprovada})
          </button>
          <button
            type="button"
            onClick={() => setDevelopedStatusFilter('Em homologação')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              developedStatusFilter === 'Em homologação'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 border border-amber-500/20'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            Em homologação ({developedStatusCounts.emHomologacao})
          </button>
          <button
            type="button"
            onClick={() => setDevelopedStatusFilter('Desenvolvimento')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              developedStatusFilter === 'Desenvolvimento'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'bg-purple-500/10 text-purple-700 dark:text-purple-300 hover:bg-purple-500/20 border border-purple-500/20'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
            Desenvolvimento ({developedStatusCounts.desenvolvimento})
          </button>
          <button
            type="button"
            onClick={() => setDevelopedStatusFilter('Pronto p/ fazer')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              developedStatusFilter === 'Pronto p/ fazer'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'bg-sky-500/10 text-sky-700 dark:text-sky-300 hover:bg-sky-500/20 border border-sky-500/20'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
            Pronto p/ fazer ({developedStatusCounts.prontoPFazer})
          </button>
          <button
            type="button"
            onClick={() => setDevelopedStatusFilter('Aberto')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              developedStatusFilter === 'Aberto'
                ? 'bg-slate-700 text-white shadow-sm'
                : 'bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
            Aberto ({developedStatusCounts.aberto})
          </button>
        </div>

        {/* Tabela com Colunas Obrigatórias: "ERP", "Layout" e "Status" */}
        <div className="overflow-x-auto max-h-[480px] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/60">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 select-none shadow-sm">
                {/* Coluna 1: ERP */}
                <th
                  onClick={() => handleDevelopedSort('erp')}
                  className="p-3 font-bold cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span>ERP</span>
                    {developedSortField === 'erp' && (
                      developedSortAsc ? (
                        <ArrowUp className="w-3 h-3 text-emerald-500" />
                      ) : (
                        <ArrowDown className="w-3 h-3 text-emerald-500" />
                      )
                    )}
                  </div>
                </th>

                {/* Coluna 2: Layout */}
                <th
                  onClick={() => handleDevelopedSort('layout')}
                  className="p-3 font-bold cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Layout</span>
                    {developedSortField === 'layout' && (
                      developedSortAsc ? (
                        <ArrowUp className="w-3 h-3 text-emerald-500" />
                      ) : (
                        <ArrowDown className="w-3 h-3 text-emerald-500" />
                      )
                    )}
                  </div>
                </th>

                {/* Coluna 3: Status */}
                <th
                  onClick={() => handleDevelopedSort('status')}
                  className="p-3 font-bold cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Status</span>
                    {developedSortField === 'status' && (
                      developedSortAsc ? (
                        <ArrowUp className="w-3 h-3 text-emerald-500" />
                      ) : (
                        <ArrowDown className="w-3 h-3 text-emerald-500" />
                      )
                    )}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 font-sans">
              {filteredAndSortedDevelopedItems.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-8 text-center text-slate-500 italic">
                    Nenhum ERP ou Layout encontrado para os critérios selecionados.
                  </td>
                </tr>
              ) : (
                filteredAndSortedDevelopedItems.map((row) => (
                  <tr
                    key={`${row.erp}-${row.layout}`}
                    className="hover:bg-slate-100/70 dark:hover:bg-slate-900/60 transition-colors"
                  >
                    {/* Coluna 1: ERP */}
                    <td className="p-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 dark:text-white text-xs">
                          {row.erp}
                        </span>
                        {row.cardsCount > 1 ? (
                          <span
                            className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                            title={`${row.cardsCount} cards no Jira: ${row.keys.join(', ')}`}
                          >
                            {row.cardsCount} cards
                          </span>
                        ) : row.keys.length > 0 && row.urls.length > 0 ? (
                          <a
                            href={row.urls[0]}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] font-mono text-slate-400 hover:text-indigo-500 transition-colors flex items-center gap-0.5 ml-1"
                            title={`Abrir ${row.keys[0]} no Jira (${row.rawStatus})`}
                          >
                            <span>{row.keys[0]}</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        ) : null}
                      </div>
                    </td>

                    {/* Coluna 2: Layout */}
                    <td className="p-3 whitespace-nowrap">
                      {row.layout && row.layout !== '-' ? (
                        <span className="px-2 py-0.5 rounded-md font-mono text-xs font-semibold bg-purple-500/10 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-500/20">
                          {row.layout}
                        </span>
                      ) : (
                        <span className="text-slate-400 dark:text-slate-600 italic">-</span>
                      )}
                    </td>

                    {/* Coluna 3: Status */}
                    <td className="p-3 whitespace-nowrap">
                      {renderStatusBadge(row.status)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tabela Analítica Detalhada com Busca e Exportação */}
      <div className="p-5 rounded-2xl bg-white dark:bg-[#0e1628]/90 border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
              Detalhamento Analítico dos Cards de Ativação
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Exibindo {sortedIssues.length} cards &bull; Clique nas colunas para ordenar
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {/* Campo de Busca Rápida */}
            <div className="relative flex-1 sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              <input
                type="text"
                placeholder="Buscar por key, resumo, ERP..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-7 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Botão de Exportação CSV */}
            <button
              type="button"
              onClick={handleExportCsv}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-md shadow-indigo-600/20 active:scale-95 flex-shrink-0"
              title="Baixar planilha CSV com todas as ativações detalhadas"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exportar CSV</span>
            </button>
          </div>
        </div>

        {/* Tabela Responsiva */}
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/60">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-900/90 text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 select-none">
                <th
                  onClick={() => handleSort('key')}
                  className="p-3 font-bold cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span>Key</span>
                    {sortField === 'key' && (sortAsc ? <ArrowUp className="w-3 h-3 text-indigo-500 dark:text-indigo-400" /> : <ArrowDown className="w-3 h-3 text-indigo-500 dark:text-indigo-400" />)}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('summary')}
                  className="p-3 font-bold cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors min-w-[220px]"
                >
                  <div className="flex items-center gap-1">
                    <span>Resumo</span>
                    {sortField === 'summary' && (sortAsc ? <ArrowUp className="w-3 h-3 text-indigo-500 dark:text-indigo-400" /> : <ArrowDown className="w-3 h-3 text-indigo-500 dark:text-indigo-400" />)}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('status')}
                  className="p-3 font-bold cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span>Status</span>
                    {sortField === 'status' && (sortAsc ? <ArrowUp className="w-3 h-3 text-indigo-500 dark:text-indigo-400" /> : <ArrowDown className="w-3 h-3 text-indigo-500 dark:text-indigo-400" />)}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('quantidade_ativacoes')}
                  className="p-3 font-bold text-center cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors bg-indigo-50 dark:bg-indigo-950/20"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span className="text-indigo-600 dark:text-indigo-300 font-black">Qtd Ativações</span>
                    {sortField === 'quantidade_ativacoes' && (sortAsc ? <ArrowUp className="w-3 h-3 text-indigo-500 dark:text-indigo-400" /> : <ArrowDown className="w-3 h-3 text-indigo-500 dark:text-indigo-400" />)}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('erp')}
                  className="p-3 font-bold cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span>ERP (Epic Name)</span>
                    {sortField === 'erp' && (sortAsc ? <ArrowUp className="w-3 h-3 text-indigo-500 dark:text-indigo-400" /> : <ArrowDown className="w-3 h-3 text-indigo-500 dark:text-indigo-400" />)}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('industria')}
                  className="p-3 font-bold cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span>Indústria</span>
                    {sortField === 'industria' && (sortAsc ? <ArrowUp className="w-3 h-3 text-indigo-500 dark:text-indigo-400" /> : <ArrowDown className="w-3 h-3 text-indigo-500 dark:text-indigo-400" />)}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('canal')}
                  className="p-3 font-bold cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span>Canal</span>
                    {sortField === 'canal' && (sortAsc ? <ArrowUp className="w-3 h-3 text-indigo-500 dark:text-indigo-400" /> : <ArrowDown className="w-3 h-3 text-indigo-500 dark:text-indigo-400" />)}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('tipo_integracao')}
                  className="p-3 font-bold cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span>Integração</span>
                    {sortField === 'tipo_integracao' && (sortAsc ? <ArrowUp className="w-3 h-3 text-indigo-500 dark:text-indigo-400" /> : <ArrowDown className="w-3 h-3 text-indigo-500 dark:text-indigo-400" />)}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('dt_ativacao')}
                  className="p-3 font-bold cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors text-right"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Data Ativação</span>
                    {(sortField === 'dt_ativacao' || sortField === 'dt_producao') && (sortAsc ? <ArrowUp className="w-3 h-3 text-indigo-500 dark:text-indigo-400" /> : <ArrowDown className="w-3 h-3 text-indigo-500 dark:text-indigo-400" />)}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 font-sans">
              {sortedIssues.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-500 italic">
                    Nenhum card encontrado com os filtros selecionados.
                  </td>
                </tr>
              ) : (
                sortedIssues.map((iss) => (
                  <tr key={iss.key} className="hover:bg-slate-100/70 dark:hover:bg-slate-900/60 transition-colors">
                    {/* Key */}
                    <td className="p-3 font-mono font-bold whitespace-nowrap">
                      <a
                        href={iss.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 flex items-center gap-1 group"
                        title="Abrir no Jira"
                      >
                        <span>{iss.key}</span>
                        <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </a>
                    </td>

                    {/* Resumo */}
                    <td className="p-3 max-w-[280px]">
                      <span className="block truncate text-slate-800 dark:text-slate-200 font-medium" title={iss.summary}>
                        {iss.summary}
                      </span>
                    </td>

                    {/* Status e Badge Ativado */}
                    <td className="p-3 whitespace-nowrap">
                      <div className="flex flex-col gap-1 items-start">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            isCardActivated(iss, activationConfig)
                              ? 'bg-emerald-500/15 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                              : 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800'
                          }`}
                        >
                          {iss.status}
                        </span>
                        {isCardActivated(iss, activationConfig) && (
                          <span className="inline-flex items-center gap-1 text-[9px] font-bold text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="w-2.5 h-2.5" />
                            Ativado
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Quantidade de Ativações */}
                    <td className="p-3 text-center font-mono font-black text-indigo-700 dark:text-indigo-300 bg-indigo-50/60 dark:bg-indigo-950/10 text-sm">
                      {iss.quantidade_ativacoes}
                    </td>

                    {/* ERP (Epic Name) */}
                    <td className="p-3 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-purple-500/10 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-500/30">
                        {iss.erp}
                      </span>
                    </td>

                    {/* Indústria */}
                    <td className="p-3 whitespace-nowrap text-slate-700 dark:text-slate-300 font-medium">
                      {iss.industria}
                    </td>

                    {/* Canal */}
                    <td className="p-3 whitespace-nowrap">
                      {iss.canal ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800">
                          {iss.canal}
                        </span>
                      ) : (
                        <span className="text-slate-400 dark:text-slate-600">-</span>
                      )}
                    </td>

                    {/* Integração */}
                    <td className="p-3 whitespace-nowrap">
                      {iss.tipo_integracao ? (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800">
                          {iss.tipo_integracao}
                        </span>
                      ) : (
                        <span className="text-slate-400 dark:text-slate-600">-</span>
                      )}
                    </td>

                    {/* Data Ativação */}
                    <td className="p-3 text-right font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {iss.dt_ativacao || iss.dt_producao ? (
                        <span className="text-emerald-600 dark:text-emerald-400/90 font-semibold">
                          {new Date(iss.dt_ativacao || iss.dt_producao!).toLocaleDateString('pt-BR')}
                        </span>
                      ) : (
                        <span className="text-slate-400 dark:text-slate-600">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Configuração de Critério de Ativação */}
      <ActivationConfigModal
        isOpen={isConfigModalOpen}
        onClose={() => setIsConfigModalOpen(false)}
        currentConfig={activationConfig}
        workflowStages={data?.workflowStages || DEFAULT_WORKFLOW_STAGES}
        availableStatuses={data?.availableStatuses || []}
        issues={data?.issues || []}
        onApplyLocally={handleApplyConfigLocally}
        onSaveAsDefault={handleSaveGlobalConfig}
        isSaving={isSavingGlobalConfig}
      />
    </div>
  );
};

interface ActivationConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentConfig: NeoActivationConfig;
  workflowStages: StatusWorkflowStage[];
  availableStatuses: string[];
  issues: JiraNeoActivationIssue[];
  onApplyLocally: (config: NeoActivationConfig) => void;
  onSaveAsDefault: (config: NeoActivationConfig) => Promise<void>;
  isSaving: boolean;
}

const ActivationConfigModal: React.FC<ActivationConfigModalProps> = ({
  isOpen,
  onClose,
  currentConfig,
  workflowStages,
  availableStatuses,
  issues,
  onApplyLocally,
  onSaveAsDefault,
  isSaving,
}) => {
  const [mode, setMode] = useState<'threshold' | 'custom'>(currentConfig.mode || 'threshold');
  const [thresholdStatus, setThresholdStatus] = useState<string>(currentConfig.thresholdStatus || 'Em produção');
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(
    currentConfig.customStatuses && currentConfig.customStatuses.length > 0
      ? currentConfig.customStatuses
      : ['Em produção', 'Concluído']
  );

  // Sincroniza se modal reabrir com config alterada
  useEffect(() => {
    if (isOpen) {
      setMode(currentConfig.mode || 'threshold');
      setThresholdStatus(currentConfig.thresholdStatus || 'Em produção');
      setSelectedStatuses(
        currentConfig.customStatuses && currentConfig.customStatuses.length > 0
          ? currentConfig.customStatuses
          : ['Em produção', 'Concluído']
      );
    }
  }, [isOpen, currentConfig]);

  if (!isOpen) return null;

  const pendingConfig: NeoActivationConfig = {
    mode,
    thresholdStatus,
    customStatuses: selectedStatuses,
  };

  const thresholdRank = getStatusRank(thresholdStatus);

  // Simulação em tempo real sobre os issues carregados
  const totalCards = issues.length;
  const totalAtivacoes = issues.reduce((acc, i) => acc + (i.quantidade_ativacoes || 1), 0);

  let simAtivadosCards = 0;
  let simAtivadosQtd = 0;
  for (const iss of issues) {
    if (isCardActivated(iss, pendingConfig)) {
      simAtivadosCards++;
      simAtivadosQtd += iss.quantidade_ativacoes || 1;
    }
  }

  const simPctCards = totalCards > 0 ? Math.round((simAtivadosCards / totalCards) * 100) : 0;
  const simPctAtiv = totalAtivacoes > 0 ? Math.round((simAtivadosQtd / totalAtivacoes) * 100) : 0;

  const toggleCustomStatus = (st: string) => {
    if (selectedStatuses.includes(st)) {
      setSelectedStatuses(selectedStatuses.filter((s) => s !== st));
    } else {
      setSelectedStatuses([...selectedStatuses, st]);
    }
  };

  const handleResetToDefault = () => {
    setMode('threshold');
    setThresholdStatus('Em produção');
    setSelectedStatuses(['Em produção', 'Concluído']);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="w-full max-w-3xl bg-white dark:bg-[#0e1628] border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between bg-slate-50/50 dark:bg-slate-900/40">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                Critério de Ativação de Cards
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Defina a partir de qual status do Jira uma demanda é contabilizada como ativada/entregue
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content Scrollable */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-sm">
          {/* Seletor de Modo */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
              Modo de Seleção
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setMode('threshold')}
                className={`p-3.5 rounded-2xl border text-left transition-all ${
                  mode === 'threshold'
                    ? 'border-emerald-500 bg-emerald-500/10 dark:bg-emerald-500/15 text-emerald-900 dark:text-emerald-200 font-semibold shadow-xs'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-bold flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4 text-emerald-500" />
                    Etapa Mínima no Fluxo
                  </span>
                  {mode === 'threshold' && <Check className="w-4 h-4 text-emerald-500" />}
                </div>
                <p className="text-xs opacity-80 font-normal">
                  Define o status de corte. O card é considerado ativado a partir deste status e em todas as etapas seguintes. (Recomendado)
                </p>
              </button>

              <button
                type="button"
                onClick={() => setMode('custom')}
                className={`p-3.5 rounded-2xl border text-left transition-all ${
                  mode === 'custom'
                    ? 'border-indigo-500 bg-indigo-500/10 dark:bg-indigo-500/15 text-indigo-900 dark:text-indigo-200 font-semibold shadow-xs'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-bold flex items-center gap-1.5">
                    <SlidersHorizontal className="w-4 h-4 text-indigo-500" />
                    Seleção Manual
                  </span>
                  {mode === 'custom' && <Check className="w-4 h-4 text-indigo-500" />}
                </div>
                <p className="text-xs opacity-80 font-normal">
                  Escolha manualmente e individualmente os status específicos que devem ser considerados ativados.
                </p>
              </button>
            </div>
          </div>

          {/* Configuração do Modo Threshold */}
          {mode === 'threshold' && (
            <div className="space-y-4 animate-in fade-in">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
                    Status Inicial (Etapa de Corte)
                  </label>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Cards neste status ou em estágios posteriores serão contabilizados como <strong>Ativados</strong>.
                  </p>
                </div>
                <select
                  value={thresholdStatus}
                  onChange={(e) => setThresholdStatus(e.target.value)}
                  className="px-3.5 py-2 text-xs font-bold bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-emerald-700 dark:text-emerald-300 focus:outline-none focus:border-emerald-500 cursor-pointer shadow-sm"
                >
                  {workflowStages.map((st) => (
                    <option key={st.id} value={st.name}>
                      {st.name} (Etapa #{st.rank} - {st.mappedStage})
                    </option>
                  ))}
                </select>
              </div>

              {/* Pipeline Visual do Fluxo */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-semibold flex items-center gap-1">
                    <Info className="w-3.5 h-3.5 text-indigo-500" />
                    Fluxo Sequencial Jira Neogrid (clique em qualquer etapa para defini-la como corte):
                  </span>
                  <span className="text-[11px] font-mono">Corte ativo: ≥ {thresholdStatus}</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 pt-1">
                  {workflowStages.map((stage) => {
                    const isActivatedStage = stage.rank >= thresholdRank;
                    const isCurrentThreshold = stage.name === thresholdStatus;
                    const cardsInThisStage = issues.filter((i) => i.status === stage.name).length;

                    return (
                      <button
                        key={stage.id}
                        type="button"
                        onClick={() => setThresholdStatus(stage.name)}
                        className={`p-2.5 rounded-xl border text-left transition-all relative flex flex-col justify-between ${
                          isCurrentThreshold
                            ? 'ring-2 ring-emerald-500 border-emerald-500 bg-emerald-500/20 dark:bg-emerald-500/25 shadow-sm'
                            : isActivatedStage
                            ? 'border-emerald-500/40 bg-emerald-500/10 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-300'
                            : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 opacity-60 hover:opacity-100'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            #{stage.rank}
                          </span>
                          {isActivatedStage ? (
                            <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded bg-emerald-500 text-white flex items-center gap-0.5">
                              <Check className="w-2.5 h-2.5" /> Ativado
                            </span>
                          ) : (
                            <span className="text-[9px] font-semibold text-slate-400">Em curso</span>
                          )}
                        </div>
                        <div className="font-bold text-xs truncate" title={stage.name}>
                          {stage.name}
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 flex items-center justify-between">
                          <span>{stage.mappedStage}</span>
                          <span className="font-mono font-bold">({cardsInThisStage})</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Configuração do Modo Custom */}
          {mode === 'custom' && (
            <div className="space-y-3 animate-in fade-in">
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
                  Selecione os Status Considerados Ativados
                </label>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Marque cada status que deve pontuar como ativado no dashboard.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 p-3 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800">
                {availableStatuses
                  .filter((st) => st.toLowerCase().trim() !== 'cancelado')
                  .map((st) => {
                    const isChecked = selectedStatuses.includes(st);
                    const count = issues.filter((i) => i.status === st).length;

                    return (
                      <button
                        key={st}
                        type="button"
                        onClick={() => toggleCustomStatus(st)}
                        className={`p-2.5 rounded-xl border text-left flex items-center justify-between transition-all ${
                          isChecked
                            ? 'border-indigo-500 bg-indigo-500/10 dark:bg-indigo-500/15 text-indigo-900 dark:text-indigo-200 font-bold'
                            : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {isChecked ? (
                            <CheckSquare className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-400" />
                          )}
                          <span className="text-xs truncate">{st}</span>
                        </div>
                        <span className="text-[11px] font-mono text-slate-400 font-normal">
                          {count} card(s)
                        </span>
                      </button>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Simulação em Tempo Real do Impacto */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent border border-emerald-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-emerald-500 text-white shadow-sm">
                <BarChart3 className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-bold text-emerald-900 dark:text-emerald-200 uppercase tracking-wider block">
                  Impacto Imediato nos Dados Atuais
                </span>
                <span className="text-xs text-slate-600 dark:text-slate-300">
                  {mode === 'threshold'
                    ? `Status de corte: a partir de "${thresholdStatus}" (etapa #${thresholdRank})`
                    : `${selectedStatuses.length} status selecionado(s) manualmente`}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-4 text-right">
              <div>
                <div className="text-lg font-black text-emerald-600 dark:text-emerald-400">
                  {simAtivadosCards}{' '}
                  <span className="text-xs font-normal text-slate-500">/ {totalCards} cards</span>
                </div>
                <div className="text-[10px] text-slate-500">{simPctCards}% dos cards do projeto</div>
              </div>
              <div className="w-px h-8 bg-slate-300 dark:bg-slate-700" />
              <div>
                <div className="text-lg font-black text-emerald-600 dark:text-emerald-400">
                  {simAtivadosQtd}{' '}
                  <span className="text-xs font-normal text-slate-500">/ {totalAtivacoes} ativ.</span>
                </div>
                <div className="text-[10px] text-slate-500">{simPctAtiv}% do volume total</div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="p-4 px-6 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleResetToDefault}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Restaurar Padrão ("Em produção")
          </button>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => onApplyLocally(pendingConfig)}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 transition-all shadow-xs"
              title="Aplica para esta visualização e salva no seu navegador"
            >
              Aplicar na Sessão
            </button>
            <button
              type="button"
              disabled={isSaving}
              onClick={() => onSaveAsDefault(pendingConfig)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-all shadow-sm active:scale-95 disabled:opacity-50"
              title="Salva no banco de dados para todos os usuários do sistema"
            >
              {isSaving ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  Salvar como Padrão do Sistema
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
