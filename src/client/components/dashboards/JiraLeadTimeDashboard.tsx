import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Timer,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Flame,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Download,
  RefreshCw,
  ExternalLink,
  Search,
  Filter,
  BarChart3,
  Layers,
  Calendar,
  AlertCircle,
  HelpCircle,
  TrendingDown,
  ShieldAlert,
} from 'lucide-react';
import { JiraLeadTimeIssue, JiraLeadTimeResponse } from '../../types';
import { ExportChartButton } from '../ExportChartButton';

interface JiraLeadTimeDashboardProps {
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

type DatePreset = 'all' | '30d' | '90d' | 'ytd' | '12m' | 'custom';
type DateFieldFilter = 'created' | 'finished';
type SortField =
  | 'key'
  | 'summary'
  | 'canal'
  | 'issuetype'
  | 'status'
  | 'dias_triagem'
  | 'dias_pronto'
  | 'dias_dev'
  | 'dias_uat'
  | 'dias_deploy'
  | 'dias_bloqueado'
  | 'cycle_time'
  | 'lead_time';

export const JiraLeadTimeDashboard: React.FC<JiraLeadTimeDashboardProps> = ({ onShowToast }) => {
  // Estado dos Dados
  const [data, setData] = useState<JiraLeadTimeResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Filtros de Consulta ao Backend
  const [selectedProject, setSelectedProject] = useState<string>('NEO');
  const [selectedIssueType, setSelectedIssueType] = useState<string>('Ativação');

  // Ao trocar de projeto, resetamos canal, ajustamos tipo e busca
  const handleProjectChange = (newProject: string) => {
    setSelectedProject(newProject);
    setSelectedCanais(['all']);
    setSelectedIssueType(newProject === 'NEO' ? 'Ativação' : 'Todos');
    setSearchQuery('');
  };

  // Filtros Dinâmicos Locais
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [dateField, setDateField] = useState<DateFieldFilter>('created');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [selectedCanais, setSelectedCanais] = useState<string[]>(['all']);
  const [isLiquidoMode, setIsLiquidoMode] = useState<boolean>(true);
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed_only'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Ordenação da Tabela
  const [sortField, setSortField] = useState<SortField>('lead_time');
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  // Busca dados da API
  const fetchLeadTimeData = useCallback(
    async (isForceRefresh: boolean = false) => {
      if (isForceRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setFetchError(null);

      try {
        const params = new URLSearchParams();
        params.set('project', selectedProject);
        if (selectedIssueType && selectedIssueType.toLowerCase() !== 'todos') {
          params.set('issuetype', selectedIssueType);
        }
        if (isForceRefresh) {
          params.set('refresh', 'true');
        }

        const res = await fetch(`/api/dashboards/jira-lead-time?${params.toString()}`);
        const json = await res.json();

        if (!res.ok) {
          throw new Error(json.error || 'Erro ao carregar dados do Jira');
        }

        setData(json);

        // Se o tipo selecionado não estiver na lista de disponíveis, ajusta
        if (json.selectedIssueType && selectedIssueType !== json.selectedIssueType && selectedIssueType === 'Ativação') {
          setSelectedIssueType(json.selectedIssueType);
        }

        if (isForceRefresh) {
          onShowToast('Dados atualizados com sucesso diretamente do Jira!', 'success');
        }
      } catch (err: any) {
        console.error(err);
        setFetchError(err.message || 'Erro ao comunicar com a API do Jira');
        onShowToast(err.message || 'Erro ao carregar métricas', 'error');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [selectedProject, selectedIssueType, onShowToast]
  );

  // Efeito ao trocar projeto ou tipo
  useEffect(() => {
    fetchLeadTimeData(false);
  }, [fetchLeadTimeData]);

  // Lista de canais únicos encontrados nos dados (se aplicável ao projeto)
  const availableCanais = useMemo(() => {
    if (!data?.issues || !data?.hasCanal) return [];
    const set = new Set<string>();
    data.issues.forEach((i) => {
      if (i.canal && i.canal !== 'Não Definido' && i.canal.trim() !== '') {
        set.add(i.canal);
      }
    });
    return Array.from(set).sort();
  }, [data]);

  // Aplicação dos Filtros Dinâmicos
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
      // 1. Filtro de Status
      if (statusFilter === 'completed_only' && !issue.isDone) {
        return false;
      }

      // 2. Filtro de Canal (apenas se o projeto possuir canais de distribuição)
      if (data?.hasCanal && !selectedCanais.includes('all')) {
        if (!issue.canal || !selectedCanais.includes(issue.canal)) {
          return false;
        }
      }

      // 3. Filtro de Data
      if (filterStart || filterEnd) {
        const targetDateStr = dateField === 'created' ? issue.created : (issue.dt_finalizado || issue.created);
        if (targetDateStr) {
          const d = new Date(targetDateStr);
          if (filterStart && d < filterStart) return false;
          if (filterEnd && d > filterEnd) return false;
        }
      }

      // 4. Busca textual
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesKey = issue.key.toLowerCase().includes(q);
        const matchesSummary = issue.summary.toLowerCase().includes(q);
        const matchesCanal = Boolean(issue.canal && issue.canal.toLowerCase().includes(q));
        const matchesType = issue.issuetype.toLowerCase().includes(q);
        if (!matchesKey && !matchesSummary && !matchesCanal && !matchesType) {
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
    selectedCanais,
    statusFilter,
    searchQuery,
  ]);

  // Cálculo das Métricas e KPIs com base nos cards filtrados
  const metrics = useMemo(() => {
    const list = filteredIssues;
    if (list.length === 0) {
      return {
        totalCards: 0,
        completedCards: 0,
        inProgressCards: 0,
        avgLeadTime: 0,
        avgCycleTime: 0,
        avgUat: 0,
        avgBloqueado: 0,
        avgTriagem: 0,
        avgPronto: 0,
        avgDev: 0,
        avgDeploy: 0,
        etapas: [],
        byCanal: [],
        byType: [],
        outliers: {
          longestStage: null,
          fastestActivation: null,
          longestLeadTime: null,
        },
      };
    }

    let sumLead = 0;
    let countLead = 0;

    let sumCycle = 0;
    let countCycle = 0;

    let sumUat = 0;
    let countUat = 0;

    let sumBloq = 0;
    let countBloq = 0;

    let sumTriagem = 0;
    let countTriagem = 0;

    let sumPronto = 0;
    let countPronto = 0;

    let sumDev = 0;
    let countDev = 0;

    let sumDeploy = 0;
    let countDeploy = 0;

    let completedCards = 0;

    // Estruturas para identificar outliers
    let longestStage: { issueKey: string; summary: string; stage: string; days: number; url: string } | null = null;
    let fastestActivation: { issueKey: string; summary: string; days: number; url: string } | null = null;
    let longestLeadTime: { issueKey: string; summary: string; days: number; url: string } | null = null;

    // Agrupamento por canal
    const canalStats = new Map<string, { total: number; sumLead: number; sumCycle: number; sumUat: number }>();

    // Agrupamento por tipo de item (para projetos sem canal de distribuição)
    const typeStats = new Map<string, { total: number; sumLead: number; sumCycle: number; sumUat: number }>();

    for (const item of list) {
      if (item.isDone) completedCards++;

      const lead = isLiquidoMode ? item.lead_time_liquido : item.lead_time_bruto;
      const cycle = isLiquidoMode ? item.cycle_time_liquido : item.cycle_time_tecnico;

      if (lead !== null && lead !== undefined) {
        sumLead += lead;
        countLead++;

        if (item.isDone) {
          if (!fastestActivation || lead < fastestActivation.days) {
            fastestActivation = { issueKey: item.key, summary: item.summary, days: lead, url: item.url };
          }
        }
        if (!longestLeadTime || lead > longestLeadTime.days) {
          longestLeadTime = { issueKey: item.key, summary: item.summary, days: lead, url: item.url };
        }
      }

      if (cycle !== null && cycle !== undefined) {
        sumCycle += cycle;
        countCycle++;
      }

      if (item.dias_uat !== null && item.dias_uat !== undefined) {
        sumUat += item.dias_uat;
        countUat++;
        if (!longestStage || item.dias_uat > longestStage.days) {
          longestStage = { issueKey: item.key, summary: item.summary, stage: 'Validação & UAT', days: item.dias_uat, url: item.url };
        }
      }

      if (item.dias_triagem !== null && item.dias_triagem !== undefined) {
        sumTriagem += item.dias_triagem;
        countTriagem++;
        if (!longestStage || item.dias_triagem > longestStage.days) {
          longestStage = { issueKey: item.key, summary: item.summary, stage: 'Triagem / Aberto', days: item.dias_triagem, url: item.url };
        }
      }

      if (item.dias_pronto !== null && item.dias_pronto !== undefined) {
        sumPronto += item.dias_pronto;
        countPronto++;
        if (!longestStage || item.dias_pronto > longestStage.days) {
          longestStage = { issueKey: item.key, summary: item.summary, stage: 'Pronto p/ Fazer', days: item.dias_pronto, url: item.url };
        }
      }

      if (item.dias_dev !== null && item.dias_dev !== undefined) {
        sumDev += item.dias_dev;
        countDev++;
        if (!longestStage || item.dias_dev > longestStage.days) {
          longestStage = { issueKey: item.key, summary: item.summary, stage: 'Dev & HML', days: item.dias_dev, url: item.url };
        }
      }

      if (item.dias_deploy !== null && item.dias_deploy !== undefined) {
        sumDeploy += item.dias_deploy;
        countDeploy++;
        if (!longestStage || item.dias_deploy > longestStage.days) {
          longestStage = { issueKey: item.key, summary: item.summary, stage: 'Deploy PRD', days: item.dias_deploy, url: item.url };
        }
      }

      if (item.dias_bloqueado > 0) {
        sumBloq += item.dias_bloqueado;
        countBloq++;
      }

      // Canal
      const c = item.canal || 'Não Definido';
      const curr = canalStats.get(c) || { total: 0, sumLead: 0, sumCycle: 0, sumUat: 0 };
      curr.total++;
      if (lead !== null) curr.sumLead += lead;
      if (cycle !== null) curr.sumCycle += cycle;
      if (item.dias_uat !== null) curr.sumUat += item.dias_uat;
      canalStats.set(c, curr);

      // Tipo de Item
      const t = item.issuetype || 'Item';
      const currT = typeStats.get(t) || { total: 0, sumLead: 0, sumCycle: 0, sumUat: 0 };
      currT.total++;
      if (lead !== null) currT.sumLead += lead;
      if (cycle !== null) currT.sumCycle += cycle;
      if (item.dias_uat !== null) currT.sumUat += item.dias_uat;
      typeStats.set(t, currT);
    }

    const avgLeadTime = countLead > 0 ? parseFloat((sumLead / countLead).toFixed(1)) : 0;
    const avgCycleTime = countCycle > 0 ? parseFloat((sumCycle / countCycle).toFixed(1)) : 0;
    const avgUat = countUat > 0 ? parseFloat((sumUat / countUat).toFixed(1)) : 0;
    const avgBloqueado = countBloq > 0 ? parseFloat((sumBloq / countBloq).toFixed(1)) : 0;
    const avgTriagem = countTriagem > 0 ? parseFloat((sumTriagem / countTriagem).toFixed(1)) : 0;
    const avgPronto = countPronto > 0 ? parseFloat((sumPronto / countPronto).toFixed(1)) : 0;
    const avgDev = countDev > 0 ? parseFloat((sumDev / countDev).toFixed(1)) : 0;
    const avgDeploy = countDeploy > 0 ? parseFloat((sumDeploy / countDeploy).toFixed(1)) : 0;

    // Etapas ordenadas para o gráfico de funil
    const etapas = [
      { key: 'triagem', label: '1. Triagem (Aberto)', days: avgTriagem, count: countTriagem, color: '#38bdf8' },
      { key: 'pronto', label: '2. Pronto p/ Fazer', days: avgPronto, count: countPronto, color: '#818cf8' },
      { key: 'dev', label: '3. Dev & HML', days: avgDev, count: countDev, color: '#a855f7' },
      { key: 'uat', label: '4. Validação & UAT', days: avgUat, count: countUat, color: '#f59e0b' },
      { key: 'deploy', label: '5. Deploy PRD & Fim', days: avgDeploy, count: countDeploy, color: '#10b981' },
    ];

    // Identificar qual etapa tem a maior média (gargalo crítico)
    let maxEtapaKey = '';
    let maxEtapaDays = -1;
    etapas.forEach((e) => {
      if (e.days > maxEtapaDays) {
        maxEtapaDays = e.days;
        maxEtapaKey = e.key;
      }
    });

    // Comparativo por Canal
    const byCanal = Array.from(canalStats.entries())
      .map(([canal, stat]) => ({
        canal,
        count: stat.total,
        avgLeadTime: stat.total > 0 ? parseFloat((stat.sumLead / stat.total).toFixed(1)) : 0,
        avgCycleTime: stat.total > 0 ? parseFloat((stat.sumCycle / stat.total).toFixed(1)) : 0,
        avgUat: stat.total > 0 ? parseFloat((stat.sumUat / stat.total).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // Comparativo por Tipo de Item (usado quando o projeto não possui canais de distribuição)
    const byType = Array.from(typeStats.entries())
      .map(([type, stat]) => ({
        type,
        count: stat.total,
        avgLeadTime: stat.total > 0 ? parseFloat((stat.sumLead / stat.total).toFixed(1)) : 0,
        avgCycleTime: stat.total > 0 ? parseFloat((stat.sumCycle / stat.total).toFixed(1)) : 0,
        avgUat: stat.total > 0 ? parseFloat((stat.sumUat / stat.total).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    return {
      totalCards: list.length,
      completedCards,
      inProgressCards: list.length - completedCards,
      avgLeadTime,
      avgCycleTime,
      avgUat,
      avgBloqueado,
      avgTriagem,
      avgPronto,
      avgDev,
      avgDeploy,
      etapas: etapas.map((e) => ({ ...e, isBottleneck: e.key === maxEtapaKey && e.days > 0 })),
      byCanal,
      byType,
      outliers: {
        longestStage,
        fastestActivation,
        longestLeadTime,
      },
    };
  }, [filteredIssues, isLiquidoMode]);

  // Ordenação da Tabela Detalhada
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
        case 'canal':
          valA = a.canal;
          valB = b.canal;
          break;
        case 'issuetype':
          valA = a.issuetype;
          valB = b.issuetype;
          break;
        case 'status':
          valA = a.status;
          valB = b.status;
          break;
        case 'dias_triagem':
          valA = a.dias_triagem ?? -1;
          valB = b.dias_triagem ?? -1;
          break;
        case 'dias_pronto':
          valA = a.dias_pronto ?? -1;
          valB = b.dias_pronto ?? -1;
          break;
        case 'dias_dev':
          valA = a.dias_dev ?? -1;
          valB = b.dias_dev ?? -1;
          break;
        case 'dias_uat':
          valA = a.dias_uat ?? -1;
          valB = b.dias_uat ?? -1;
          break;
        case 'dias_deploy':
          valA = a.dias_deploy ?? -1;
          valB = b.dias_deploy ?? -1;
          break;
        case 'dias_bloqueado':
          valA = a.dias_bloqueado ?? -1;
          valB = b.dias_bloqueado ?? -1;
          break;
        case 'cycle_time':
          valA = (isLiquidoMode ? a.cycle_time_liquido : a.cycle_time_tecnico) ?? -1;
          valB = (isLiquidoMode ? b.cycle_time_liquido : b.cycle_time_tecnico) ?? -1;
          break;
        case 'lead_time':
        default:
          valA = (isLiquidoMode ? a.lead_time_liquido : a.lead_time_bruto) ?? -1;
          valB = (isLiquidoMode ? b.lead_time_liquido : b.lead_time_bruto) ?? -1;
          break;
      }

      if (typeof valA === 'string' && typeof valB === 'string') {
        return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }

      if (valA === valB) return 0;
      return sortAsc ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
    });
  }, [filteredIssues, sortField, sortAsc, isLiquidoMode]);

  // Manipulador de Ordenação
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false); // Maior primeiro por padrão
    }
  };

  // Exportação para CSV (com BOM UTF-8)
  const handleExportCsv = () => {
    if (sortedIssues.length === 0) {
      onShowToast('Nenhum card para exportar no período.', 'info');
      return;
    }

    const headers = [
      'Key',
      'Resumo',
      data?.hasCanal ? 'Canal' : 'Tipo de Item',
      'Status',
      'Concluído',
      'Data Criação',
      'Data Finalização',
      'Triagem (dias)',
      'Pronto p/ Fazer (dias)',
      'Dev & HML (dias)',
      'Validação & UAT (dias)',
      'Deploy PRD (dias)',
      'Bloqueio (dias)',
      'Cycle Time Técnico (dias)',
      'Cycle Time Líquido (dias)',
      'Lead Time Bruto (dias)',
      'Lead Time Líquido (dias)',
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
      escapeCsv(data?.hasCanal ? (iss.canal || '') : iss.issuetype),
      escapeCsv(iss.status),
      escapeCsv(iss.isDone ? 'Sim' : 'Não'),
      escapeCsv(iss.created ? iss.created.substring(0, 10) : ''),
      escapeCsv(iss.dt_finalizado ? iss.dt_finalizado.substring(0, 10) : ''),
      escapeCsv(iss.dias_triagem ?? ''),
      escapeCsv(iss.dias_pronto ?? ''),
      escapeCsv(iss.dias_dev ?? ''),
      escapeCsv(iss.dias_uat ?? ''),
      escapeCsv(iss.dias_deploy ?? ''),
      escapeCsv(iss.dias_bloqueado ?? 0),
      escapeCsv(iss.cycle_time_tecnico ?? ''),
      escapeCsv(iss.cycle_time_liquido ?? ''),
      escapeCsv(iss.lead_time_bruto ?? ''),
      escapeCsv(iss.lead_time_liquido ?? ''),
      escapeCsv(iss.url),
    ]);

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `lead_time_jira_${selectedProject.toLowerCase()}_${new Date().toISOString().substring(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    onShowToast('Arquivo CSV exportado com sucesso!', 'success');
  };

  const maxEtapaDaysOverall = useMemo(() => {
    return Math.max(...metrics.etapas.map((e) => e.days), 1);
  }, [metrics.etapas]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Barra de Filtros e Controles Superiores */}
      <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#0e1628]/90 border border-slate-200 dark:border-slate-800 shadow-xl backdrop-blur-sm space-y-4">
        {/* Linha 1: Seletores de Projeto, Tipo, Período e Botão de Refresh */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800/80 pb-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Seletor de Projeto */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Projeto:</span>
              <select
                value={selectedProject}
                onChange={(e) => handleProjectChange(e.target.value)}
                className="px-3 py-1.5 text-xs font-bold bg-slate-50 dark:bg-slate-950 border border-indigo-500/40 rounded-xl text-indigo-600 dark:text-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 cursor-pointer shadow-sm"
              >
                {data?.availableProjects?.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                )) || <option value="NEO">NEO</option>}
              </select>
            </div>

            {/* Seletor de Tipo de Item (issuetype) */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Tipo:</span>
              <select
                value={selectedIssueType}
                onChange={(e) => setSelectedIssueType(e.target.value)}
                className="px-3 py-1.5 text-xs font-semibold bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer shadow-sm"
              >
                <option value="Todos">Todos os Tipos</option>
                {data?.availableIssueTypes?.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
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
              onClick={() => fetchLeadTimeData(true)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 text-indigo-600 dark:text-indigo-300 hover:text-indigo-700 dark:hover:text-white border border-slate-300 dark:border-slate-700 text-xs font-bold transition-all shadow-sm active:scale-95"
              title="Recarregar dados atualizados da nuvem do Jira"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-indigo-500 dark:text-indigo-400' : ''}`} />
              <span>{isRefreshing ? 'Sincronizando...' : 'Atualizar Agora'}</span>
            </button>
          </div>
        </div>

        {/* Linha 2: Canais, Modos (Líquido/Bruto), Status e Busca */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          {/* Filtro por Canal de Distribuição ou Indicador por Tipo de Item */}
          {data?.hasCanal ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <Filter className="w-3 h-3 text-slate-400 dark:text-slate-500" />
                Canal:
              </span>
              <button
                type="button"
                onClick={() => setSelectedCanais(['all'])}
                className={`px-2.5 py-1 rounded-xl text-xs font-semibold transition-all border ${
                  selectedCanais.includes('all')
                    ? 'bg-indigo-600/10 dark:bg-indigo-600/30 text-indigo-700 dark:text-indigo-200 border-indigo-500/40 dark:border-indigo-500/50 font-bold'
                    : 'bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-900'
                }`}
              >
                Todos ({availableCanais.length})
              </button>
              {availableCanais.map((c) => {
                const isSelected = selectedCanais.includes(c) && !selectedCanais.includes('all');
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => {
                      if (selectedCanais.includes('all')) {
                        setSelectedCanais([c]);
                      } else if (selectedCanais.includes(c)) {
                        const next = selectedCanais.filter((item) => item !== c);
                        setSelectedCanais(next.length === 0 ? ['all'] : next);
                      } else {
                        setSelectedCanais([...selectedCanais, c]);
                      }
                    }}
                    className={`px-2.5 py-1 rounded-xl text-xs font-semibold transition-all border ${
                      isSelected
                        ? 'bg-indigo-600/10 dark:bg-indigo-600/30 text-indigo-700 dark:text-indigo-200 border-indigo-500/40 dark:border-indigo-500/50 font-bold'
                        : 'bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-900'
                    }`}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-950/60 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800">
              <Layers className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
              <span>
                Projeto <strong className="text-indigo-600 dark:text-indigo-300">{selectedProject}</strong> &bull; Análise segmentada por <strong>Tipo de Item</strong> ({filteredIssues.length} cards)
              </span>
            </div>
          )}

          {/* Toggle Modo Líquido vs Bruto + Status */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Toggle de Modo de Tempo */}
            <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsLiquidoMode(true)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  isLiquidoMode
                    ? 'bg-emerald-600/15 dark:bg-emerald-600/30 text-emerald-700 dark:text-emerald-300 font-bold border border-emerald-500/40 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
                title="Deduz os dias em bloqueio/impedimento do Lead Time e Cycle Time"
              >
                Tempo Líquido (Sem Bloqueios)
              </button>
              <button
                type="button"
                onClick={() => setIsLiquidoMode(false)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  !isLiquidoMode
                    ? 'bg-indigo-600/15 dark:bg-indigo-600/30 text-indigo-700 dark:text-indigo-300 font-bold border border-indigo-500/40 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
                title="Calcula o tempo corrido integral desde a abertura até a conclusão"
              >
                Tempo Bruto Integral
              </button>
            </div>

            {/* Filtro de Conclusão */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-3 py-1.5 text-xs font-semibold bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-300 focus:outline-none focus:border-indigo-500 cursor-pointer shadow-sm"
            >
              <option value="all">Todos os Status (Concluídos e Em Andamento)</option>
              <option value="completed_only">Apenas Concluídos / Finalizados</option>
            </select>
          </div>
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
            onClick={() => fetchLeadTimeData(true)}
            className="px-3 py-1.5 rounded-xl bg-rose-500/10 dark:bg-rose-500/20 hover:bg-rose-500/20 dark:hover:bg-rose-500/30 text-rose-700 dark:text-rose-200 font-bold border border-rose-500/30 text-xs transition-all flex-shrink-0"
          >
            Tentar Novamente
          </button>
        </div>
      )}

      {/* Cards de Métricas Principais (KPIs) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Lead Time Médio */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#0e1628]/90 border border-slate-200 dark:border-slate-800 shadow-xl relative overflow-hidden group hover:border-indigo-500/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Timer className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
              Lead Time Médio
            </span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                isLiquidoMode
                  ? 'bg-emerald-500/15 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                  : 'bg-indigo-500/15 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30'
              }`}
            >
              {isLiquidoMode ? 'Líquido' : 'Bruto'}
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">
              {metrics.avgLeadTime}
            </span>
            <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">dias</span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
            Criação até Conclusão {isLiquidoMode ? '(descontando bloqueios)' : '(tempo total corrido)'}
          </p>
        </div>

        {/* KPI 2: Cycle Time Técnico Médio */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#0e1628]/90 border border-slate-200 dark:border-slate-800 shadow-xl relative overflow-hidden group hover:border-purple-500/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-purple-500 dark:text-purple-400" />
              Cycle Time Médio
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-500/15 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 border border-purple-500/30">
              Dev ➔ Fim
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">
              {metrics.avgCycleTime}
            </span>
            <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">dias</span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
            Início do desenvolvimento até a entrega em produção
          </p>
        </div>

        {/* KPI 3: Tempo Médio em UAT / Validação */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#0e1628]/90 border border-slate-200 dark:border-slate-800 shadow-xl relative overflow-hidden group hover:border-amber-500/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Flame className="w-4 h-4 text-amber-500 dark:text-amber-400" />
              Tempo Médio UAT
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500/15 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30">
              Homologação
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">
              {metrics.avgUat}
            </span>
            <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">dias</span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
            Deploy HML até aprovação e Deploy PRD (etapa externa)
          </p>
        </div>

        {/* KPI 4: Bloqueio Médio e Volume */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#0e1628]/90 border border-slate-200 dark:border-slate-800 shadow-xl relative overflow-hidden group hover:border-rose-500/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-rose-500 dark:text-rose-400" />
              Bloqueio Médio
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-500/15 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/30">
              Impedimentos
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">
              {metrics.avgBloqueado}
            </span>
            <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">dias</span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
            {metrics.completedCards} de {metrics.totalCards} cards concluídos ({metrics.totalCards > 0 ? Math.round((metrics.completedCards / metrics.totalCards) * 100) : 0}%)
          </p>
        </div>
      </div>

      {/* Gráficos e Comparações */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Gráfico 1: Tempo Médio por Etapa do Fluxo (Funil) */}
        <div id="chart-leadtime-stages" className="lg:col-span-7 p-5 rounded-2xl bg-white dark:bg-[#0e1628]/90 border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
                Tempo Médio por Etapa do Fluxo
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Duração média em dias que os cards permanecem em cada marco
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800">
                {filteredIssues.length} cards analisados
              </span>
              <ExportChartButton
                targetId="chart-leadtime-stages"
                fileName="leadtime-tempo-medio-etapas"
                onShowToast={onShowToast}
              />
            </div>
          </div>

          <div className="space-y-4 pt-1">
            {metrics.etapas.map((etapa) => {
              const pct = maxEtapaDaysOverall > 0 ? (etapa.days / maxEtapaDaysOverall) * 100 : 0;
              return (
                <div key={etapa.key} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                      {etapa.label}
                      {etapa.isBottleneck && (
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/40 animate-pulse flex items-center gap-1">
                          <Flame className="w-2.5 h-2.5" /> Maior Gargalo
                        </span>
                      )}
                    </span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white">
                      {etapa.days} <span className="text-slate-500 dark:text-slate-400 font-normal">dias</span>
                      <span className="text-slate-400 dark:text-slate-500 text-[10px] ml-1.5">({etapa.count} cards)</span>
                    </span>
                  </div>

                  <div className="h-3 w-full bg-slate-100 dark:bg-slate-950 rounded-full overflow-hidden p-0.5 border border-slate-200 dark:border-slate-800/80">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${
                        etapa.isBottleneck
                          ? 'bg-gradient-to-r from-amber-500 to-rose-500 shadow-md shadow-amber-500/20'
                          : 'bg-gradient-to-r from-indigo-500 to-violet-500'
                      }`}
                      style={{ width: `${Math.max(pct, 2)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Gráfico 2: Desempenho por Canal ou por Tipo de Item */}
        <div id="chart-leadtime-performance" className="lg:col-span-5 p-5 rounded-2xl bg-white dark:bg-[#0e1628]/90 border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-purple-500 dark:text-purple-400" />
                {data?.hasCanal ? 'Desempenho por Canal' : 'Desempenho por Tipo de Item'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {data?.hasCanal
                  ? 'Comparativo de Lead Time e UAT por canal de distribuição'
                  : 'Comparativo de Lead Time e UAT por tipo de item/demanda'}
              </p>
            </div>
            <ExportChartButton
              targetId="chart-leadtime-performance"
              fileName={data?.hasCanal ? 'leadtime-desempenho-por-canal' : 'leadtime-desempenho-por-tipo'}
              onShowToast={onShowToast}
            />
          </div>

          <div className="space-y-3 pt-1">
            {data?.hasCanal ? (
              metrics.byCanal.length === 0 ? (
                <p className="text-xs text-slate-500 italic py-6 text-center">Nenhum dado por canal no período.</p>
              ) : (
                metrics.byCanal.map((c) => (
                  <div key={c.canal} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{c.canal}</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20">
                        {c.count} cards
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                      <div className="bg-white dark:bg-slate-900/80 p-2 rounded-lg border border-slate-200 dark:border-slate-800 shadow-xs">
                        <span className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400">Lead Time</span>
                        <span className="text-sm font-bold text-indigo-600 dark:text-indigo-300">{c.avgLeadTime}d</span>
                      </div>
                      <div className="bg-white dark:bg-slate-900/80 p-2 rounded-lg border border-slate-200 dark:border-slate-800 shadow-xs">
                        <span className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400">Cycle Time</span>
                        <span className="text-sm font-bold text-purple-600 dark:text-purple-300">{c.avgCycleTime}d</span>
                      </div>
                      <div className="bg-white dark:bg-slate-900/80 p-2 rounded-lg border border-slate-200 dark:border-slate-800 shadow-xs">
                        <span className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400">UAT Médio</span>
                        <span className="text-sm font-bold text-amber-600 dark:text-amber-300">{c.avgUat}d</span>
                      </div>
                    </div>
                  </div>
                ))
              )
            ) : (
              metrics.byType.length === 0 ? (
                <p className="text-xs text-slate-500 italic py-6 text-center">Nenhum dado por tipo de item no período.</p>
              ) : (
                metrics.byType.map((t) => (
                  <div key={t.type} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{t.type}</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20">
                        {t.count} cards
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                      <div className="bg-white dark:bg-slate-900/80 p-2 rounded-lg border border-slate-200 dark:border-slate-800 shadow-xs">
                        <span className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400">Lead Time</span>
                        <span className="text-sm font-bold text-indigo-600 dark:text-indigo-300">{t.avgLeadTime}d</span>
                      </div>
                      <div className="bg-white dark:bg-slate-900/80 p-2 rounded-lg border border-slate-200 dark:border-slate-800 shadow-xs">
                        <span className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400">Cycle Time</span>
                        <span className="text-sm font-bold text-purple-600 dark:text-purple-300">{t.avgCycleTime}d</span>
                      </div>
                      <div className="bg-white dark:bg-slate-900/80 p-2 rounded-lg border border-slate-200 dark:border-slate-800 shadow-xs">
                        <span className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400">UAT Médio</span>
                        <span className="text-sm font-bold text-amber-600 dark:text-amber-300">{t.avgUat}d</span>
                      </div>
                    </div>
                  </div>
                ))
              )
            )}
          </div>
        </div>
      </div>

      {/* Destaques e Outliers do Período */}
      <div className="p-5 rounded-2xl bg-white dark:bg-[#0e1628]/90 border border-slate-200 dark:border-slate-800 shadow-xl space-y-3">
        <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
          Destaques & Outliers do Período
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
          {/* Outlier 1: Maior Gargalo */}
          <div className="p-3.5 rounded-xl bg-amber-500/5 dark:bg-slate-950/80 border border-amber-500/30 space-y-1.5">
            <span className="text-[10px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <Flame className="w-3 h-3" /> Maior Permanência em Etapa
            </span>
            {metrics.outliers.longestStage ? (
              <div>
                <a
                  href={metrics.outliers.longestStage.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-bold text-slate-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-1 group transition-colors"
                >
                  <span className="text-indigo-600 dark:text-indigo-400 font-mono">{metrics.outliers.longestStage.issueKey}</span>
                  <span className="truncate">{metrics.outliers.longestStage.summary}</span>
                  <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 flex-shrink-0 transition-opacity" />
                </a>
                <p className="text-[11px] text-amber-700 dark:text-amber-300/90 font-medium mt-1">
                  <strong>{metrics.outliers.longestStage.days} dias</strong> na etapa {metrics.outliers.longestStage.stage}
                </p>
              </div>
            ) : (
              <p className="text-xs text-slate-500 italic">Sem registros suficientes.</p>
            )}
          </div>

          {/* Outlier 2: Ativação Mais Rápida */}
          <div className="p-3.5 rounded-xl bg-emerald-500/5 dark:bg-slate-950/80 border border-emerald-500/30 space-y-1.5">
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Ativação Mais Rápida (Lead Time)
            </span>
            {metrics.outliers.fastestActivation ? (
              <div>
                <a
                  href={metrics.outliers.fastestActivation.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-bold text-slate-900 dark:text-white hover:text-emerald-600 dark:hover:text-emerald-400 flex items-center gap-1 group transition-colors"
                >
                  <span className="text-emerald-600 dark:text-emerald-400 font-mono">{metrics.outliers.fastestActivation.issueKey}</span>
                  <span className="truncate">{metrics.outliers.fastestActivation.summary}</span>
                  <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 flex-shrink-0 transition-opacity" />
                </a>
                <p className="text-[11px] text-emerald-700 dark:text-emerald-300/90 font-medium mt-1">
                  Lead Time total de apenas <strong>{metrics.outliers.fastestActivation.days} dias</strong>
                </p>
              </div>
            ) : (
              <p className="text-xs text-slate-500 italic">Nenhum card concluído no período.</p>
            )}
          </div>

          {/* Outlier 3: Maior Lead Time Geral */}
          <div className="p-3.5 rounded-xl bg-rose-500/5 dark:bg-slate-950/80 border border-rose-500/30 space-y-1.5">
            <span className="text-[10px] font-black uppercase tracking-wider text-rose-600 dark:text-rose-400 flex items-center gap-1">
              <Clock className="w-3 h-3" /> Maior Lead Time Geral
            </span>
            {metrics.outliers.longestLeadTime ? (
              <div>
                <a
                  href={metrics.outliers.longestLeadTime.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-bold text-slate-900 dark:text-white hover:text-rose-600 dark:hover:text-rose-400 flex items-center gap-1 group transition-colors"
                >
                  <span className="text-rose-600 dark:text-rose-400 font-mono">{metrics.outliers.longestLeadTime.issueKey}</span>
                  <span className="truncate">{metrics.outliers.longestLeadTime.summary}</span>
                  <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 flex-shrink-0 transition-opacity" />
                </a>
                <p className="text-[11px] text-rose-700 dark:text-rose-300/90 font-medium mt-1">
                  Lead Time acumulado de <strong>{metrics.outliers.longestLeadTime.days} dias</strong>
                </p>
              </div>
            ) : (
              <p className="text-xs text-slate-500 italic">Sem registros suficientes.</p>
            )}
          </div>
        </div>
      </div>

      {/* Tabela Analítica Detalhada com Busca e Exportação */}
      <div className="p-5 rounded-2xl bg-white dark:bg-[#0e1628]/90 border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Detalhamento Analítico por Card</h3>
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
                placeholder="Buscar por key ou resumo..."
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
              title="Baixar planilha CSV com todas as métricas detalhadas"
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
                  className="p-3 font-bold cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors min-w-[200px]"
                >
                  <div className="flex items-center gap-1">
                    <span>Resumo</span>
                    {sortField === 'summary' && (sortAsc ? <ArrowUp className="w-3 h-3 text-indigo-500 dark:text-indigo-400" /> : <ArrowDown className="w-3 h-3 text-indigo-500 dark:text-indigo-400" />)}
                  </div>
                </th>
                <th
                  onClick={() => handleSort(data?.hasCanal ? 'canal' : 'issuetype')}
                  className="p-3 font-bold cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span>{data?.hasCanal ? 'Canal' : 'Tipo'}</span>
                    {((data?.hasCanal && sortField === 'canal') || (!data?.hasCanal && sortField === 'issuetype')) && (
                      sortAsc ? <ArrowUp className="w-3 h-3 text-indigo-500 dark:text-indigo-400" /> : <ArrowDown className="w-3 h-3 text-indigo-500 dark:text-indigo-400" />
                    )}
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
                  onClick={() => handleSort('dias_triagem')}
                  className="p-3 font-bold text-right cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Triagem</span>
                    {sortField === 'dias_triagem' && (sortAsc ? <ArrowUp className="w-3 h-3 text-indigo-500 dark:text-indigo-400" /> : <ArrowDown className="w-3 h-3 text-indigo-500 dark:text-indigo-400" />)}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('dias_pronto')}
                  className="p-3 font-bold text-right cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Pronto</span>
                    {sortField === 'dias_pronto' && (sortAsc ? <ArrowUp className="w-3 h-3 text-indigo-500 dark:text-indigo-400" /> : <ArrowDown className="w-3 h-3 text-indigo-500 dark:text-indigo-400" />)}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('dias_dev')}
                  className="p-3 font-bold text-right cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Dev & HML</span>
                    {sortField === 'dias_dev' && (sortAsc ? <ArrowUp className="w-3 h-3 text-indigo-500 dark:text-indigo-400" /> : <ArrowDown className="w-3 h-3 text-indigo-500 dark:text-indigo-400" />)}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('dias_uat')}
                  className="p-3 font-bold text-right cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span className="text-amber-600 dark:text-amber-400">UAT</span>
                    {sortField === 'dias_uat' && (sortAsc ? <ArrowUp className="w-3 h-3 text-indigo-500 dark:text-indigo-400" /> : <ArrowDown className="w-3 h-3 text-indigo-500 dark:text-indigo-400" />)}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('dias_deploy')}
                  className="p-3 font-bold text-right cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Deploy</span>
                    {sortField === 'dias_deploy' && (sortAsc ? <ArrowUp className="w-3 h-3 text-indigo-500 dark:text-indigo-400" /> : <ArrowDown className="w-3 h-3 text-indigo-500 dark:text-indigo-400" />)}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('dias_bloqueado')}
                  className="p-3 font-bold text-right cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span className="text-rose-600 dark:text-rose-400">Bloqueio</span>
                    {sortField === 'dias_bloqueado' && (sortAsc ? <ArrowUp className="w-3 h-3 text-indigo-500 dark:text-indigo-400" /> : <ArrowDown className="w-3 h-3 text-indigo-500 dark:text-indigo-400" />)}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('cycle_time')}
                  className="p-3 font-bold text-right cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Cycle Time</span>
                    {sortField === 'cycle_time' && (sortAsc ? <ArrowUp className="w-3 h-3 text-indigo-500 dark:text-indigo-400" /> : <ArrowDown className="w-3 h-3 text-indigo-500 dark:text-indigo-400" />)}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('lead_time')}
                  className="p-3 font-bold text-right cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors bg-indigo-50 dark:bg-indigo-950/20"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span className="text-indigo-600 dark:text-indigo-300 font-extrabold">Lead Time</span>
                    {sortField === 'lead_time' && (sortAsc ? <ArrowUp className="w-3 h-3 text-indigo-500 dark:text-indigo-400" /> : <ArrowDown className="w-3 h-3 text-indigo-500 dark:text-indigo-400" />)}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 font-sans">
              {sortedIssues.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-8 text-center text-slate-500 italic">
                    Nenhum card encontrado com os filtros selecionados.
                  </td>
                </tr>
              ) : (
                sortedIssues.map((iss) => {
                  const lead = isLiquidoMode ? iss.lead_time_liquido : iss.lead_time_bruto;
                  const cycle = isLiquidoMode ? iss.cycle_time_liquido : iss.cycle_time_tecnico;

                  return (
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

                      {/* Canal ou Tipo */}
                      <td className="p-3 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800">
                          {data?.hasCanal ? (iss.canal || 'N/D') : iss.issuetype}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="p-3 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            iss.isDone
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                              : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                          }`}
                        >
                          {iss.status}
                        </span>
                      </td>

                      {/* Triagem */}
                      <td className="p-3 text-right font-mono text-slate-600 dark:text-slate-400">
                        {iss.dias_triagem !== null ? `${iss.dias_triagem}d` : '-'}
                      </td>

                      {/* Pronto */}
                      <td className="p-3 text-right font-mono text-slate-600 dark:text-slate-400">
                        {iss.dias_pronto !== null ? `${iss.dias_pronto}d` : '-'}
                      </td>

                      {/* Dev */}
                      <td className="p-3 text-right font-mono text-slate-600 dark:text-slate-400">
                        {iss.dias_dev !== null ? `${iss.dias_dev}d` : '-'}
                      </td>

                      {/* UAT */}
                      <td className="p-3 text-right font-mono font-semibold text-amber-600 dark:text-amber-300">
                        {iss.dias_uat !== null ? `${iss.dias_uat}d` : '-'}
                      </td>

                      {/* Deploy */}
                      <td className="p-3 text-right font-mono text-slate-600 dark:text-slate-400">
                        {iss.dias_deploy !== null ? `${iss.dias_deploy}d` : '-'}
                      </td>

                      {/* Bloqueio */}
                      <td className="p-3 text-right font-mono">
                        {iss.dias_bloqueado > 0 ? (
                          <span className="text-rose-600 dark:text-rose-400 font-bold">{iss.dias_bloqueado}d</span>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-600">0d</span>
                        )}
                      </td>

                      {/* Cycle Time */}
                      <td className="p-3 text-right font-mono text-purple-600 dark:text-purple-300">
                        {cycle !== null ? `${cycle}d` : '-'}
                      </td>

                      {/* Lead Time */}
                      <td className="p-3 text-right font-mono font-bold text-indigo-700 dark:text-white bg-indigo-50/60 dark:bg-indigo-950/10">
                        {lead !== null ? `${lead}d` : '-'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
