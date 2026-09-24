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
} from 'lucide-react';
import { JiraNeoActivationIssue, JiraNeoActivationsResponse } from '../../types';

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
  | 'created';

export const JiraNeoActivationsDashboard: React.FC<JiraNeoActivationsDashboardProps> = ({ onShowToast }) => {
  // Estado dos Dados
  const [data, setData] = useState<JiraNeoActivationsResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

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
  const [lineChartMetric, setLineChartMetric] = useState<'total' | 'producao' | 'both'>('both');
  const [hoveredMonthIndex, setHoveredMonthIndex] = useState<number | null>(null);

  // Ordenação da Tabela
  const [sortField, setSortField] = useState<SortField>('quantidade_ativacoes');
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  // Busca dados da API
  const fetchActivationsData = useCallback(
    async (isForceRefresh: boolean = false) => {
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
    [onShowToast]
  );

  useEffect(() => {
    fetchActivationsData(false);
  }, [fetchActivationsData]);

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
        if (statusFilter === 'em_producao_only') {
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
        const targetDateStr = dateField === 'producao' ? issue.dt_producao : issue.created;
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
  ]);

  // Cálculo das 4 análises principais e KPIs
  const analytics = useMemo(() => {
    const list = filteredIssues;

    let totalCards = list.length;
    let totalAtivacoes = 0;
    let emProducaoCards = 0;
    let emProducaoAtivacoes = 0;
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

    // 4. Quantidade de Ativações por Mês (linha do tempo)
    const monthlyMap = new Map<
      string,
      {
        monthKey: string;
        label: string;
        totalAtivacoes: number;
        totalCards: number;
        prodAtivacoes: number;
        prodCards: number;
      }
    >();

    // Conjuntos para contagem única
    const distinctErps = new Set<string>();
    const distinctInd = new Set<string>();
    const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

    for (const item of list) {
      const qtd = item.quantidade_ativacoes;
      totalAtivacoes += qtd;

      const normSt = item.status.toLowerCase().trim();

      // Categorização Macro
      if (item.isEmProducao) {
        emProducaoCards++;
        emProducaoAtivacoes += qtd;
      } else if (
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

      // Agrupamento 4: Por Mês
      // 4a. Total de Ativações criadas no mês (demanda no fluxo)
      if (item.created) {
        const mKey = item.created.substring(0, 7);
        if (!monthlyMap.has(mKey)) {
          const [yr, mo] = mKey.split('-');
          const label = `${monthNames[parseInt(mo, 10) - 1] || mo}/${yr.substring(2)}`;
          monthlyMap.set(mKey, {
            monthKey: mKey,
            label,
            totalAtivacoes: 0,
            totalCards: 0,
            prodAtivacoes: 0,
            prodCards: 0,
          });
        }
        const mCurr = monthlyMap.get(mKey)!;
        mCurr.totalAtivacoes += qtd;
        mCurr.totalCards++;
      }

      // 4b. Ativações que entraram em produção no mês (entregas)
      if (item.dt_producao) {
        const mKey = item.dt_producao.substring(0, 7);
        if (!monthlyMap.has(mKey)) {
          const [yr, mo] = mKey.split('-');
          const label = `${monthNames[parseInt(mo, 10) - 1] || mo}/${yr.substring(2)}`;
          monthlyMap.set(mKey, {
            monthKey: mKey,
            label,
            totalAtivacoes: 0,
            totalCards: 0,
            prodAtivacoes: 0,
            prodCards: 0,
          });
        }
        const mCurr = monthlyMap.get(mKey)!;
        mCurr.prodAtivacoes += qtd;
        mCurr.prodCards++;
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
  }, [filteredIssues]);

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
          valA = a.dt_producao || '';
          valB = b.dt_producao || '';
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
      'Data Entrada Produção',
      'Mês Entrada Produção',
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
      escapeCsv(iss.dt_producao ? iss.dt_producao.substring(0, 10) : ''),
      escapeCsv(iss.mes_ano_producao || ''),
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

  // Estatísticas calculadas para o Gráfico de Linhas (Ativações por Mês)
  const lineChartStats = useMemo(() => {
    const list = analytics.byMonth;
    if (list.length === 0) {
      return {
        peakMonthLabel: '-',
        peakMonthValue: 0,
        totalCreated: 0,
        totalProd: 0,
        avgMonthly: 0,
      };
    }

    let totalCreated = 0;
    let totalProd = 0;
    let peakVal = -1;
    let peakLabel = '-';

    for (const m of list) {
      totalCreated += m.totalAtivacoes;
      totalProd += m.prodAtivacoes;
      const compareVal = lineChartMetric === 'producao' ? m.prodAtivacoes : m.totalAtivacoes;
      if (compareVal > peakVal) {
        peakVal = compareVal;
        peakLabel = `${m.label} (${compareVal} ativ.)`;
      }
    }

    const activeTotal = lineChartMetric === 'producao' ? totalProd : totalCreated;
    const avgMonthly = list.length > 0 ? Math.round(activeTotal / list.length) : 0;

    return {
      peakMonthLabel: peakLabel,
      peakMonthValue: peakVal,
      totalCreated,
      totalProd,
      avgMonthly,
    };
  }, [analytics.byMonth, lineChartMetric]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Barra de Filtros e Controles Superiores */}
      <div className="p-4 sm:p-5 rounded-2xl bg-[#0e1628]/90 border border-slate-800 shadow-xl backdrop-blur-sm space-y-4">
        {/* Linha 1: Período, Campo de Data e Botão de Refresh */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Badge Projeto Neogrid */}
            <div className="flex items-center gap-2 bg-indigo-950/40 border border-indigo-500/30 px-3 py-1.5 rounded-xl text-xs font-bold text-indigo-300">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>Projeto NEO &bull; Neogrid</span>
            </div>

            {/* Seletor de Período Preset */}
            <div className="flex items-center gap-1.5 p-1 bg-slate-950 border border-slate-800 rounded-xl text-xs">
              <button
                type="button"
                onClick={() => setDatePreset('all')}
                className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                  datePreset === 'all'
                    ? 'bg-indigo-600 text-white font-bold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
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
                    : 'text-slate-400 hover:text-slate-200'
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
                    : 'text-slate-400 hover:text-slate-200'
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
                    : 'text-slate-400 hover:text-slate-200'
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
                    : 'text-slate-400 hover:text-slate-200'
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
                    : 'text-slate-400 hover:text-slate-200'
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
                  className="px-2.5 py-1 text-xs bg-slate-950 border border-slate-700 rounded-xl text-slate-200 focus:outline-none focus:border-indigo-500"
                />
                <span className="text-slate-500 text-xs">até</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="px-2.5 py-1 text-xs bg-slate-950 border border-slate-700 rounded-xl text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>
            )}

            {/* Seletor de Base de Data do Filtro */}
            <div className="flex items-center gap-1.5 text-xs text-slate-400 bg-slate-950 px-2.5 py-1 rounded-xl border border-slate-800">
              <span className="text-[11px] font-semibold">Base de Data:</span>
              <button
                type="button"
                onClick={() => setDateField('producao')}
                className={`px-2 py-0.5 rounded-lg font-semibold transition-all ${
                  dateField === 'producao'
                    ? 'bg-emerald-500/20 text-emerald-300 font-bold'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
                title="Filtra com base na data em que a demanda entrou em produção"
              >
                Entrada Produção
              </button>
              <button
                type="button"
                onClick={() => setDateField('created')}
                className={`px-2 py-0.5 rounded-lg font-semibold transition-all ${
                  dateField === 'created'
                    ? 'bg-indigo-500/20 text-indigo-300 font-bold'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
                title="Filtra com base na data em que a demanda foi criada no Jira"
              >
                Criação
              </button>
            </div>
          </div>

          {/* Botão de Atualização em Tempo Real */}
          <div className="flex items-center gap-3">
            {data?.lastUpdated && (
              <span className="hidden md:inline text-[11px] text-slate-400 font-medium">
                Última sincronização: {new Date(data.lastUpdated).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <button
              type="button"
              disabled={isLoading || isRefreshing}
              onClick={() => fetchActivationsData(true)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-indigo-300 hover:text-white border border-slate-700 hover:border-slate-600 text-xs font-bold transition-all shadow-sm active:scale-95"
              title="Recarregar ativações atualizadas do Jira"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-indigo-400' : ''}`} />
              <span>{isRefreshing ? 'Sincronizando...' : 'Atualizar Agora'}</span>
            </button>
          </div>
        </div>

        {/* Linha 2: Dropdowns de Filtro (Status, ERP, Indústria, Canal, Tipo Integração) */}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          {/* Filtro de Status */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-slate-400">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs font-medium bg-slate-950 border border-slate-700 rounded-xl text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer shadow-sm"
            >
              <option value="all">Todos os Status (exceto Cancelado)</option>
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
            <span className="text-xs font-semibold text-slate-400">ERP:</span>
            <select
              value={erpFilter}
              onChange={(e) => setErpFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs font-medium bg-slate-950 border border-slate-700 rounded-xl text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer shadow-sm max-w-[160px]"
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
            <span className="text-xs font-semibold text-slate-400">Indústria:</span>
            <select
              value={industriaFilter}
              onChange={(e) => setIndustriaFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs font-medium bg-slate-950 border border-slate-700 rounded-xl text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer shadow-sm max-w-[170px]"
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
            <span className="text-xs font-semibold text-slate-400">Canal:</span>
            <select
              value={canalFilter}
              onChange={(e) => setCanalFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs font-medium bg-slate-950 border border-slate-700 rounded-xl text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer shadow-sm"
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
            <span className="text-xs font-semibold text-slate-400">Integração:</span>
            <select
              value={tipoIntegracaoFilter}
              onChange={(e) => setTipoIntegracaoFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs font-medium bg-slate-950 border border-slate-700 rounded-xl text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer shadow-sm"
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
              className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all border border-slate-700"
            >
              Limpar Filtros
            </button>
          )}
        </div>
      </div>

      {/* Erro de Comunicação ou Configuração */}
      {fetchError && (
        <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-500/40 text-rose-200 text-xs flex items-center justify-between gap-3 shadow-lg">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-5 h-5 text-rose-400 flex-shrink-0" />
            <span>{fetchError}</span>
          </div>
          <button
            type="button"
            onClick={() => fetchActivationsData(true)}
            className="px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 font-bold border border-rose-500/40 text-xs transition-all flex-shrink-0"
          >
            Tentar Novamente
          </button>
        </div>
      )}

      {/* Cards de Métricas e KPIs Principais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* KPI 1: Total de Ativações */}
        <div className="p-5 rounded-2xl bg-[#0e1628]/90 border border-slate-800 shadow-xl relative overflow-hidden group hover:border-indigo-500/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-indigo-400" />
              Total de Ativações
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              Campo Jira
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-white tracking-tight">
              {analytics.totalAtivacoes}
            </span>
            <span className="text-xs font-semibold text-slate-400">ativações</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            Em {analytics.totalCards} cards do projeto Neogrid
          </p>
        </div>

        {/* KPI 2: Ativações Em Produção */}
        <div className="p-5 rounded-2xl bg-[#0e1628]/90 border border-slate-800 shadow-xl relative overflow-hidden group hover:border-emerald-500/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              Em Produção
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              Entregues
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-emerald-400 tracking-tight">
              {analytics.emProducaoAtivacoes}
            </span>
            <span className="text-xs font-semibold text-slate-400">
              ({analytics.totalAtivacoes > 0 ? Math.round((analytics.emProducaoAtivacoes / analytics.totalAtivacoes) * 100) : 0}%)
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            {analytics.emProducaoCards} cards finalizados em produção
          </p>
        </div>

        {/* KPI 3: Ativações Em Andamento (Dev, HML, Teste, Deploy) */}
        <div className="p-5 rounded-2xl bg-[#0e1628]/90 border border-slate-800 shadow-xl relative overflow-hidden group hover:border-amber-500/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-amber-400" />
              Em Andamento
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/30">
              Pipeline
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-amber-400 tracking-tight">
              {analytics.emAndamentoAtivacoes}
            </span>
            <span className="text-xs font-semibold text-slate-400">ativações</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            {analytics.emAndamentoCards} cards em Dev, HML, Teste ou Deploy
          </p>
        </div>

        {/* KPI 4: Backlog / Triagem */}
        <div className="p-5 rounded-2xl bg-[#0e1628]/90 border border-slate-800 shadow-xl relative overflow-hidden group hover:border-sky-500/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-sky-400" />
              Backlog & Triagem
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-sky-500/20 text-sky-300 border border-sky-500/30">
              Aberto / Pronto
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-sky-400 tracking-tight">
              {analytics.backlogAtivacoes}
            </span>
            <span className="text-xs font-semibold text-slate-400">ativações</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            {analytics.backlogCards} cards aguardando início técnico
          </p>
        </div>

        {/* KPI 5: ERPs & Indústrias Atendidas */}
        <div className="p-5 rounded-2xl bg-[#0e1628]/90 border border-slate-800 shadow-xl relative overflow-hidden group hover:border-purple-500/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-purple-400" />
              ERPs & Indústrias
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-500/20 text-purple-300 border border-purple-500/30">
              Ativos
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black text-white tracking-tight">
              {analytics.distinctErpsCount} <span className="text-xs font-normal text-slate-400">ERPs</span>
            </span>
            <span className="text-slate-500 text-xs font-bold">&bull;</span>
            <span className="text-2xl font-black text-purple-300 tracking-tight">
              {analytics.distinctIndCount} <span className="text-xs font-normal text-slate-400">Ind.</span>
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            Sistemas ERP e indústrias no escopo filtrado
          </p>
        </div>
      </div>

      {/* Grid com as 4 Seções Analíticas Principais */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* SEÇÃO 1: Quantidade de Ativações por Status */}
        <div className="p-5 rounded-2xl bg-[#0e1628]/90 border border-slate-800 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-indigo-400" />
                1. Quantidade de Ativações por Status
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Distribuição das ativações por status no fluxo operacional (exceto Cancelado)
              </p>
            </div>
            <span className="text-xs font-medium text-slate-400 bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-800">
              {analytics.totalAtivacoes} ativações totais
            </span>
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
                      <span className="font-semibold text-slate-200 flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: item.color }}
                        />
                        {item.status}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-white text-sm">
                          {item.ativacoes} <span className="text-slate-400 font-normal text-xs">ativ.</span>
                        </span>
                        <span className="text-slate-500 text-[11px]">({item.cards} cards &bull; {item.percentage}%)</span>
                      </div>
                    </div>

                    <div className="h-2.5 w-full bg-slate-950 rounded-full overflow-hidden p-0.5 border border-slate-800/80">
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
        <div className="p-5 rounded-2xl bg-[#0e1628]/90 border border-slate-800 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-indigo-400" />
                4. Ativações por Mês
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Evolução temporal &bull; Todos os status &bull; Gráfico de linhas
              </p>
            </div>

            {/* Alternador de Métrica do Gráfico de Linhas */}
            <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-xl text-xs">
              <button
                type="button"
                onClick={() => setLineChartMetric('both')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                  lineChartMetric === 'both'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Exibir ambas as linhas (Total Demandado vs Entradas em Produção)"
              >
                Comparativo
              </button>
              <button
                type="button"
                onClick={() => setLineChartMetric('total')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                  lineChartMetric === 'total'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Exibir apenas total de ativações no mês"
              >
                Total Criado
              </button>
              <button
                type="button"
                onClick={() => setLineChartMetric('producao')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                  lineChartMetric === 'producao'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Exibir apenas ativações que entraram em produção no mês"
              >
                Em Produção
              </button>
            </div>
          </div>

          {/* Badges de Resumo e Legenda do Gráfico de Linhas */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              {(lineChartMetric === 'total' || lineChartMetric === 'both') && (
                <div className="flex items-center gap-1.5 text-indigo-300 font-medium">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 shadow-sm shadow-indigo-500/50" />
                  <span>Total Criado: <strong>{lineChartStats.totalCreated}</strong></span>
                </div>
              )}
              {(lineChartMetric === 'producao' || lineChartMetric === 'both') && (
                <div className="flex items-center gap-1.5 text-emerald-300 font-medium">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50" />
                  <span>Em Produção: <strong>{lineChartStats.totalProd}</strong></span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 text-slate-400 text-[11px]">
              <span>Média: <strong className="text-slate-200">{lineChartStats.avgMonthly} ativ/mês</strong></span>
              <span>&bull;</span>
              <span>Pico: <strong className="text-indigo-300">{lineChartStats.peakMonthLabel}</strong></span>
            </div>
          </div>

          {/* SVG Line Chart Container */}
          <div className="relative pt-2">
            {analytics.byMonth.length === 0 ? (
              <p className="text-xs text-slate-500 italic py-14 text-center">
                Nenhum dado mensal encontrado para os filtros selecionados.
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
                const maxTotal = Math.max(...dataPoints.map((d) => d.totalAtivacoes), 0);
                const maxProd = Math.max(...dataPoints.map((d) => d.prodAtivacoes), 0);
                const rawMax = lineChartMetric === 'producao' ? maxProd : Math.max(maxTotal, maxProd, 1);
                const scaleMax = rawMax <= 5 ? 5 : rawMax <= 10 ? 10 : rawMax <= 20 ? 20 : rawMax <= 30 ? 30 : Math.ceil(rawMax / 10) * 10;

                // Ticks horizontais (grid)
                const yTicks = [0, Math.round(scaleMax * 0.25), Math.round(scaleMax * 0.5), Math.round(scaleMax * 0.75), scaleMax];

                // Coordenadas dos pontos
                const points = dataPoints.map((d, i) => {
                  const x = dataPoints.length > 1
                    ? padLeft + (i / (dataPoints.length - 1)) * plotW
                    : padLeft + plotW / 2;
                  const yTotal = padTop + plotH - (d.totalAtivacoes / scaleMax) * plotH;
                  const yProd = padTop + plotH - (d.prodAtivacoes / scaleMax) * plotH;
                  return { ...d, index: i, x, yTotal, yProd };
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

                const totalSmooth = createSmoothPath(points.map((p) => ({ x: p.x, y: p.yTotal })));
                const prodSmooth = createSmoothPath(points.map((p) => ({ x: p.x, y: p.yProd })));

                const totalArea = points.length > 0
                  ? `${totalSmooth} L ${points[points.length - 1].x},${padTop + plotH} L ${points[0].x},${padTop + plotH} Z`
                  : '';
                const prodArea = points.length > 0
                  ? `${prodSmooth} L ${points[points.length - 1].x},${padTop + plotH} L ${points[0].x},${padTop + plotH} Z`
                  : '';

                const showTotal = lineChartMetric === 'total' || lineChartMetric === 'both';
                const showProd = lineChartMetric === 'producao' || lineChartMetric === 'both';
                const hoveredPoint = hoveredMonthIndex !== null ? points[hoveredMonthIndex] : null;

                return (
                  <div className="relative">
                    <svg
                      viewBox={`0 0 ${svgW} ${svgH}`}
                      className="w-full h-auto overflow-visible select-none"
                    >
                      <defs>
                        {/* Gradiente de Área Total (Índigo) */}
                        <linearGradient id="areaTotalGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#6366f1" stopOpacity="0.4" />
                          <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0" />
                        </linearGradient>

                        {/* Gradiente de Linha Total */}
                        <linearGradient id="lineTotalGrad" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="#818cf8" />
                          <stop offset="50%" stopColor="#6366f1" />
                          <stop offset="100%" stopColor="#38bdf8" />
                        </linearGradient>

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
                              stroke="#334155"
                              strokeDasharray="4 4"
                              strokeWidth="1"
                              opacity="0.6"
                            />
                            <text
                              x={padLeft - 8}
                              y={y + 3.5}
                              textAnchor="end"
                              fill="#64748b"
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
                        stroke="#475569"
                        strokeWidth="1"
                      />

                      {/* Área Preenchida Total */}
                      {showTotal && totalArea && (
                        <path d={totalArea} fill="url(#areaTotalGrad)" />
                      )}

                      {/* Área Preenchida Produção */}
                      {showProd && prodArea && (
                        <path d={prodArea} fill="url(#areaProdGrad)" />
                      )}

                      {/* Linha Curva Produção */}
                      {showProd && prodSmooth && (
                        <path
                          d={prodSmooth}
                          fill="none"
                          stroke="url(#lineProdGrad)"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      )}

                      {/* Linha Curva Total */}
                      {showTotal && totalSmooth && (
                        <path
                          d={totalSmooth}
                          fill="none"
                          stroke="url(#lineTotalGrad)"
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
                          stroke="#818cf8"
                          strokeDasharray="3 3"
                          strokeWidth="1.5"
                          opacity="0.8"
                        />
                      )}

                      {/* Pontos de Produção */}
                      {showProd &&
                        points.map((p) => {
                          const isHovered = hoveredMonthIndex === p.index;
                          return (
                            <g key={`prod-pt-${p.monthKey}`}>
                              {isHovered && (
                                <circle
                                  cx={p.x}
                                  cy={p.yProd}
                                  r="8"
                                  fill="#10b981"
                                  opacity="0.3"
                                />
                              )}
                              <circle
                                cx={p.x}
                                cy={p.yProd}
                                r={isHovered ? 5.5 : 4}
                                fill="#064e3b"
                                stroke="#34d399"
                                strokeWidth="2"
                                className="transition-all"
                              />
                            </g>
                          );
                        })}

                      {/* Pontos de Total */}
                      {showTotal &&
                        points.map((p) => {
                          const isHovered = hoveredMonthIndex === p.index;
                          return (
                            <g key={`total-pt-${p.monthKey}`}>
                              {isHovered && (
                                <circle
                                  cx={p.x}
                                  cy={p.yTotal}
                                  r="9"
                                  fill="#6366f1"
                                  opacity="0.35"
                                />
                              )}
                              <circle
                                cx={p.x}
                                cy={p.yTotal}
                                r={isHovered ? 6 : 4.5}
                                fill="#1e1b4b"
                                stroke="#818cf8"
                                strokeWidth="2"
                                className="transition-all"
                              />
                              {/* Valor numérico acima do ponto se total > 0 */}
                              {p.totalAtivacoes > 0 && (
                                <text
                                  x={p.x}
                                  y={p.yTotal - 8}
                                  textAnchor="middle"
                                  fill="#c7d2fe"
                                  fontSize="10"
                                  fontWeight="bold"
                                  fontFamily="monospace"
                                >
                                  {p.totalAtivacoes}
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
                            fill={isHovered ? '#ffffff' : '#94a3b8'}
                            fontSize="10"
                            fontWeight={isHovered ? 'bold' : 'normal'}
                            className="transition-colors cursor-pointer"
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
                        className="absolute pointer-events-none z-20 px-3 py-2 rounded-xl bg-slate-900/95 border border-indigo-500/40 shadow-2xl backdrop-blur-md text-xs space-y-1 transition-all"
                        style={{
                          left: `${Math.min(Math.max((hoveredPoint.x / svgW) * 100, 15), 85)}%`,
                          top: '10px',
                          transform: 'translateX(-50%)',
                        }}
                      >
                        <div className="font-bold text-white flex items-center justify-between gap-4 border-b border-slate-800 pb-1">
                          <span className="flex items-center gap-1.5 text-indigo-300">
                            <Calendar className="w-3.5 h-3.5" />
                            {hoveredPoint.label}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {hoveredPoint.monthKey}
                          </span>
                        </div>

                        <div className="pt-0.5 space-y-1 text-[11px]">
                          <div className="flex items-center justify-between gap-3 text-indigo-200">
                            <span className="flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-indigo-400" />
                              Total Demandado:
                            </span>
                            <span className="font-bold font-mono text-white">
                              {hoveredPoint.totalAtivacoes} ativ. ({hoveredPoint.totalCards} cards)
                            </span>
                          </div>

                          <div className="flex items-center justify-between gap-3 text-emerald-300">
                            <span className="flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-emerald-400" />
                              Em Produção:
                            </span>
                            <span className="font-bold font-mono text-white">
                              {hoveredPoint.prodAtivacoes} ativ. ({hoveredPoint.prodCards} cards)
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
        <div className="p-5 rounded-2xl bg-[#0e1628]/90 border border-slate-800 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Cpu className="w-4 h-4 text-purple-400" />
                2. Quantidade de Ativações por ERP
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                ERP extraído do <strong>Epic Name</strong> &bull; Considera todos os status ativos
              </p>
            </div>
            <span className="text-xs font-semibold text-purple-300 bg-purple-950/40 px-2.5 py-1 rounded-lg border border-purple-500/30">
              {analytics.byErp.length} ERPs
            </span>
          </div>

          <div className="space-y-3 pt-1 max-h-[360px] overflow-y-auto pr-1">
            {analytics.byErp.length === 0 ? (
              <p className="text-xs text-slate-500 italic py-8 text-center">Nenhum card encontrado para os filtros selecionados.</p>
            ) : (
              analytics.byErp.map((item, idx) => {
                const barWidth = maxErpQtd > 0 ? (item.ativacoes / maxErpQtd) * 100 : 0;
                return (
                  <div key={item.erp} className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-200 flex items-center gap-2">
                        <span className="w-5 h-5 rounded-lg bg-purple-950/80 border border-purple-500/30 text-purple-300 text-[10px] font-black flex items-center justify-center flex-shrink-0">
                          {idx + 1}
                        </span>
                        {item.erp}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-purple-300 text-sm">
                          {item.ativacoes} <span className="text-slate-400 font-normal text-xs">ativ.</span>
                        </span>
                        <span className="text-slate-500 text-[11px]">({item.cards} cards &bull; {item.percentage}%)</span>
                      </div>
                    </div>

                    <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden p-0.5 border border-slate-800">
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
        <div className="p-5 rounded-2xl bg-[#0e1628]/90 border border-slate-800 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Factory className="w-4 h-4 text-cyan-400" />
                3. Quantidade de Ativações por Indústria
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Campo "Indústria " do Jira &bull; Considera todos os status ativos
              </p>
            </div>
            <span className="text-xs font-semibold text-cyan-300 bg-cyan-950/40 px-2.5 py-1 rounded-lg border border-cyan-500/30">
              {analytics.byIndustria.length} Indústrias
            </span>
          </div>

          <div className="space-y-3 pt-1 max-h-[360px] overflow-y-auto pr-1">
            {analytics.byIndustria.length === 0 ? (
              <p className="text-xs text-slate-500 italic py-8 text-center">Nenhuma indústria encontrada para os filtros selecionados.</p>
            ) : (
              analytics.byIndustria.map((item, idx) => {
                const barWidth = maxIndQtd > 0 ? (item.ativacoes / maxIndQtd) * 100 : 0;
                return (
                  <div key={item.industria} className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-200 flex items-center gap-2">
                        <span className="w-5 h-5 rounded-lg bg-cyan-950/80 border border-cyan-500/30 text-cyan-300 text-[10px] font-black flex items-center justify-center flex-shrink-0">
                          {idx + 1}
                        </span>
                        {item.industria}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-cyan-300 text-sm">
                          {item.ativacoes} <span className="text-slate-400 font-normal text-xs">ativ.</span>
                        </span>
                        <span className="text-slate-500 text-[11px]">({item.cards} cards &bull; {item.percentage}%)</span>
                      </div>
                    </div>

                    <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden p-0.5 border border-slate-800">
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

      {/* Tabela Analítica Detalhada com Busca e Exportação */}
      <div className="p-5 rounded-2xl bg-[#0e1628]/90 border border-slate-800 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-indigo-400" />
              Detalhamento Analítico dos Cards de Ativação
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Exibindo {sortedIssues.length} cards &bull; Clique nas colunas para ordenar
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {/* Campo de Busca Rápida */}
            <div className="relative flex-1 sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Buscar por key, resumo, ERP..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-7 py-1.5 text-xs bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs"
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
        <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/60">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-900/90 text-slate-400 border-b border-slate-800 select-none">
                <th
                  onClick={() => handleSort('key')}
                  className="p-3 font-bold cursor-pointer hover:text-white transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span>Key</span>
                    {sortField === 'key' && (sortAsc ? <ArrowUp className="w-3 h-3 text-indigo-400" /> : <ArrowDown className="w-3 h-3 text-indigo-400" />)}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('summary')}
                  className="p-3 font-bold cursor-pointer hover:text-white transition-colors min-w-[220px]"
                >
                  <div className="flex items-center gap-1">
                    <span>Resumo</span>
                    {sortField === 'summary' && (sortAsc ? <ArrowUp className="w-3 h-3 text-indigo-400" /> : <ArrowDown className="w-3 h-3 text-indigo-400" />)}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('status')}
                  className="p-3 font-bold cursor-pointer hover:text-white transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span>Status</span>
                    {sortField === 'status' && (sortAsc ? <ArrowUp className="w-3 h-3 text-indigo-400" /> : <ArrowDown className="w-3 h-3 text-indigo-400" />)}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('quantidade_ativacoes')}
                  className="p-3 font-bold text-center cursor-pointer hover:text-white transition-colors bg-indigo-950/20"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span className="text-indigo-300 font-black">Qtd Ativações</span>
                    {sortField === 'quantidade_ativacoes' && (sortAsc ? <ArrowUp className="w-3 h-3 text-indigo-400" /> : <ArrowDown className="w-3 h-3 text-indigo-400" />)}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('erp')}
                  className="p-3 font-bold cursor-pointer hover:text-white transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span>ERP (Epic Name)</span>
                    {sortField === 'erp' && (sortAsc ? <ArrowUp className="w-3 h-3 text-indigo-400" /> : <ArrowDown className="w-3 h-3 text-indigo-400" />)}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('industria')}
                  className="p-3 font-bold cursor-pointer hover:text-white transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span>Indústria</span>
                    {sortField === 'industria' && (sortAsc ? <ArrowUp className="w-3 h-3 text-indigo-400" /> : <ArrowDown className="w-3 h-3 text-indigo-400" />)}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('canal')}
                  className="p-3 font-bold cursor-pointer hover:text-white transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span>Canal</span>
                    {sortField === 'canal' && (sortAsc ? <ArrowUp className="w-3 h-3 text-indigo-400" /> : <ArrowDown className="w-3 h-3 text-indigo-400" />)}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('tipo_integracao')}
                  className="p-3 font-bold cursor-pointer hover:text-white transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span>Integração</span>
                    {sortField === 'tipo_integracao' && (sortAsc ? <ArrowUp className="w-3 h-3 text-indigo-400" /> : <ArrowDown className="w-3 h-3 text-indigo-400" />)}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('dt_producao')}
                  className="p-3 font-bold cursor-pointer hover:text-white transition-colors text-right"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Em Produção Em</span>
                    {sortField === 'dt_producao' && (sortAsc ? <ArrowUp className="w-3 h-3 text-indigo-400" /> : <ArrowDown className="w-3 h-3 text-indigo-400" />)}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans">
              {sortedIssues.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-500 italic">
                    Nenhum card encontrado com os filtros selecionados.
                  </td>
                </tr>
              ) : (
                sortedIssues.map((iss) => (
                  <tr key={iss.key} className="hover:bg-slate-900/60 transition-colors">
                    {/* Key */}
                    <td className="p-3 font-mono font-bold whitespace-nowrap">
                      <a
                        href={iss.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 group"
                        title="Abrir no Jira"
                      >
                        <span>{iss.key}</span>
                        <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </a>
                    </td>

                    {/* Resumo */}
                    <td className="p-3 max-w-[280px]">
                      <span className="block truncate text-slate-200 font-medium" title={iss.summary}>
                        {iss.summary}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="p-3 whitespace-nowrap">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          iss.isEmProducao
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : 'bg-slate-900 text-slate-300 border border-slate-800'
                        }`}
                      >
                        {iss.status}
                      </span>
                    </td>

                    {/* Quantidade de Ativações */}
                    <td className="p-3 text-center font-mono font-black text-indigo-300 bg-indigo-950/10 text-sm">
                      {iss.quantidade_ativacoes}
                    </td>

                    {/* ERP (Epic Name) */}
                    <td className="p-3 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-purple-950/40 text-purple-300 border border-purple-500/30">
                        {iss.erp}
                      </span>
                    </td>

                    {/* Indústria */}
                    <td className="p-3 whitespace-nowrap text-slate-300 font-medium">
                      {iss.industria}
                    </td>

                    {/* Canal */}
                    <td className="p-3 whitespace-nowrap">
                      {iss.canal ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-900 text-slate-300 border border-slate-800">
                          {iss.canal}
                        </span>
                      ) : (
                        <span className="text-slate-600">-</span>
                      )}
                    </td>

                    {/* Integração */}
                    <td className="p-3 whitespace-nowrap">
                      {iss.tipo_integracao ? (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-900 text-slate-400 border border-slate-800">
                          {iss.tipo_integracao}
                        </span>
                      ) : (
                        <span className="text-slate-600">-</span>
                      )}
                    </td>

                    {/* Data Em Produção */}
                    <td className="p-3 text-right font-mono text-slate-400 whitespace-nowrap">
                      {iss.dt_producao ? (
                        <span className="text-emerald-400/90 font-semibold">
                          {new Date(iss.dt_producao).toLocaleDateString('pt-BR')}
                        </span>
                      ) : (
                        <span className="text-slate-600">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
