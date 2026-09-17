import React, { useState, useEffect, useCallback } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Settings,
  Layers,
  Clock,
  ExternalLink,
  AlertCircle,
  FolderOpen,
  Filter,
  X,
} from 'lucide-react';
import { JiraWeekResponse, JiraDemand } from '../types';
import { JiraCard } from './JiraCard';

interface JiraWeekPanelProps {
  weekStartDate: string; // 'YYYY-MM-DD'
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onToday: () => void;
  onOpenSettings?: () => void;
  searchQuery?: string;
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const JiraWeekPanel: React.FC<JiraWeekPanelProps> = ({
  weekStartDate,
  onPrevWeek,
  onNextWeek,
  onToday,
  onOpenSettings,
  searchQuery = '',
  onShowToast,
}) => {
  const [data, setData] = useState<JiraWeekResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdatedTime, setLastUpdatedTime] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filter states: Projeto e Usuário
  const [selectedProject, setSelectedProject] = useState<string>('all');
  const [selectedUser, setSelectedUser] = useState<string>('all');

  // Fetch Jira demands for current week
  const fetchJiraDemands = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/jira/demands?weekStart=${weekStartDate}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Erro na requisição (${res.status})`);
      }
      const json: JiraWeekResponse = await res.json();
      setData(json);

      // Formatar horário da última atualização (HH:mm)
      const now = new Date();
      const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      setLastUpdatedTime(timeStr);
    } catch (err: any) {
      console.error('[Jira] Erro ao buscar demandas:', err);
      setErrorMsg(err.message || 'Falha ao buscar demandas do Jira');
      if (!isSilent) {
        onShowToast('Falha ao atualizar dados do Jira', 'error');
      }
    } finally {
      if (!isSilent) setIsLoading(false);
    }
  }, [weekStartDate, onShowToast]);

  // Load demands when week changes
  useEffect(() => {
    fetchJiraDemands(false);
  }, [fetchJiraDemands]);

  // Auto-refresh every 30 minutes (30 * 60 * 1000 = 1,800,000 ms)
  useEffect(() => {
    const THIRTY_MINUTES_MS = 30 * 60 * 1000;
    const interval = setInterval(() => {
      fetchJiraDemands(true);
    }, THIRTY_MINUTES_MS);

    return () => clearInterval(interval);
  }, [fetchJiraDemands]);

  // Format date interval for display
  const formatInterval = () => {
    if (!data?.startDate || !data?.endDate) return '';
    try {
      const [startYear, startMonth, startDay] = data.startDate.split('-');
      const [endYear, endMonth, endDay] = data.endDate.split('-');
      return `${startDay}/${startMonth} a ${endDay}/${endMonth}/${endYear}`;
    } catch {
      return `${data.startDate} - ${data.endDate}`;
    }
  };

  // Coletar todos os projetos e usuários disponíveis na semana atual
  const allWeekDemands = (data?.days || []).flatMap((d) => d.demands);

  const availableProjects = Array.from(
    new Set(allWeekDemands.map((d) => d.project.key).filter(Boolean))
  ).sort();

  const availableUsers = Array.from(
    new Set(
      allWeekDemands
        .map((d) => d.assignee?.displayName)
        .filter((name): name is string => Boolean(name))
    )
  ).sort();

  const hasUnassigned = allWeekDemands.some((d) => !d.assignee);

  // Filter demands by project, user, and search query
  const filterDemand = (demand: JiraDemand) => {
    // Filtro por Projeto
    if (selectedProject !== 'all' && demand.project.key !== selectedProject) {
      return false;
    }

    // Filtro por Usuário
    if (selectedUser !== 'all') {
      if (selectedUser === '__unassigned__') {
        if (demand.assignee) return false;
      } else {
        if (demand.assignee?.displayName !== selectedUser) return false;
      }
    }

    // Filtro por Busca Global
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchKey = demand.key.toLowerCase().includes(q);
      const matchSummary = demand.summary.toLowerCase().includes(q);
      const matchProj =
        demand.project.key.toLowerCase().includes(q) ||
        demand.project.name.toLowerCase().includes(q);
      const matchAssignee = demand.assignee?.displayName?.toLowerCase().includes(q);
      const matchEpic = demand.epic?.summary?.toLowerCase().includes(q);
      const matchIndustry = demand.industry?.toLowerCase().includes(q);
      const matchLayout = demand.layout?.toLowerCase().includes(q);
      const matchStatus = demand.displayStatus.toLowerCase().includes(q);

      if (
        !matchKey &&
        !matchSummary &&
        !matchProj &&
        !matchAssignee &&
        !matchEpic &&
        !matchIndustry &&
        !matchLayout &&
        !matchStatus
      ) {
        return false;
      }
    }

    return true;
  };

  const totalDemandsInCurrentWeek = data ? data.totalDemands : 0;
  const filteredTotalCount = (data?.days || []).reduce((acc, day) => {
    return acc + day.demands.filter(filterDemand).length;
  }, 0);

  return (
    <div className="bg-[#0a0f1d] border border-blue-900/40 rounded-2xl p-4 lg:p-6 shadow-xl shadow-black/30 relative">
      {/* Panel Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-5 border-b border-slate-800/80">
        <div>
          <div className="flex items-center gap-2.5">
            {/* Jira Icon / Brand */}
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shadow-sm shadow-blue-500/10">
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <path d="M11.53 2c0 2.4 1.97 4.35 4.38 4.35h2.15v2.17c0 2.4 1.97 4.35 4.39 4.35V2h-10.92zm-5.77 5.79c0 2.4 1.97 4.35 4.39 4.35h2.14v2.17c0 2.4 1.97 4.35 4.39 4.35V7.79H5.76zm-5.76 5.79c0 2.4 1.97 4.35 4.39 4.35h2.14v2.17c0 2.4 1.97 4.35 4.39 4.35v-10.87H0z"/>
              </svg>
            </div>
            <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
              Demandas Jira
              <span className="text-xs font-semibold text-slate-400 font-normal">
                (Entrega na Semana)
              </span>
            </h2>

            {/* Total Demands Badge */}
            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-blue-500/15 text-blue-300 border border-blue-500/30">
              {totalDemandsInCurrentWeek} {totalDemandsInCurrentWeek === 1 ? 'demanda' : 'demandas'}
            </span>
          </div>

          <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-400">
            <span>Cards agrupados pela data de entrega (Segunda a Sexta).</span>
            {lastUpdatedTime && (
              <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 bg-slate-900 px-2 py-0.5 rounded-md border border-slate-800">
                <Clock className="w-3 h-3 text-slate-400" />
                Última atualização: {lastUpdatedTime}
              </span>
            )}
          </div>
        </div>

        {/* Navigation Controls & Actions */}
        <div className="flex items-center gap-2 self-end sm:self-auto flex-wrap">
          {/* Refresh button (Manual) */}
          <button
            onClick={() => {
              fetchJiraDemands(false);
              onShowToast('Atualizando dados do Jira...', 'info');
            }}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700/80 text-slate-300 hover:text-white text-xs font-semibold hover:bg-slate-800 transition-all shadow-sm"
            title="Atualizar dados do Jira agora"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-blue-400 ${isLoading ? 'animate-spin' : ''}`} />
            <span>{isLoading ? 'Atualizando...' : 'Atualizar'}</span>
          </button>

          {/* Settings Button */}
          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700/80 text-slate-300 hover:text-white text-xs font-semibold hover:bg-slate-800 transition-all shadow-sm"
              title="Configurar projetos e status do Jira"
            >
              <Settings className="w-3.5 h-3.5 text-slate-400" />
              <span className="hidden sm:inline">Configurações</span>
            </button>
          )}

          {/* Week interval label */}
          <span className="text-xs font-medium text-slate-400 mx-1 hidden lg:inline">
            {formatInterval()}
          </span>

          {/* Prev Week */}
          <button
            onClick={onPrevWeek}
            className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
            title="Semana Anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {/* Today Button */}
          <button
            onClick={onToday}
            className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white text-xs font-semibold hover:bg-slate-800 transition-all"
          >
            Hoje
          </button>

          {/* Next Week */}
          <button
            onClick={onNextWeek}
            className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
            title="Próxima Semana"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Filter Bar: Listboxes de Projeto e Usuário */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-3.5 pb-2">
        <div className="flex flex-wrap items-center gap-2.5 text-xs">
          <div className="flex items-center gap-1.5 text-slate-400 font-semibold mr-1">
            <Filter className="w-3.5 h-3.5 text-blue-400" />
            <span>Filtrar:</span>
          </div>

          {/* Listbox: Projeto */}
          <div className="relative">
            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-xl border focus:outline-none focus:border-blue-500 cursor-pointer transition-all ${
                selectedProject !== 'all'
                  ? 'bg-blue-950/50 border-blue-500/60 text-blue-300 ring-1 ring-blue-500/30'
                  : 'bg-slate-900/90 border-slate-700/70 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <option value="all">
                Todos os Projetos ({availableProjects.length})
              </option>
              {availableProjects.map((proj) => (
                <option key={proj} value={proj}>
                  🏷️ Projeto: {proj}
                </option>
              ))}
            </select>
          </div>

          {/* Listbox: Usuário */}
          <div className="relative">
            <select
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-xl border focus:outline-none focus:border-blue-500 cursor-pointer transition-all ${
                selectedUser !== 'all'
                  ? 'bg-blue-950/50 border-blue-500/60 text-blue-300 ring-1 ring-blue-500/30'
                  : 'bg-slate-900/90 border-slate-700/70 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <option value="all">
                Todos os Usuários ({availableUsers.length + (hasUnassigned ? 1 : 0)})
              </option>
              {availableUsers.map((user) => (
                <option key={user} value={user}>
                  👤 {user}
                </option>
              ))}
              {hasUnassigned && (
                <option value="__unassigned__">
                  👤 Não atribuído
                </option>
              )}
            </select>
          </div>

          {/* Botão Limpar Filtros */}
          {(selectedProject !== 'all' || selectedUser !== 'all') && (
            <button
              onClick={() => {
                setSelectedProject('all');
                setSelectedUser('all');
              }}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold transition-all"
              title="Limpar filtros aplicados"
            >
              <X className="w-3 h-3 text-rose-400" />
              <span>Limpar filtros</span>
            </button>
          )}
        </div>

        {/* Indicador de demandas filtradas vs total */}
        <div className="text-[11px] font-medium text-slate-400">
          {selectedProject !== 'all' || selectedUser !== 'all' || searchQuery.trim() ? (
            <span>
              Exibindo <strong className="text-blue-400 font-bold">{filteredTotalCount}</strong> de{' '}
              <strong className="text-slate-200">{totalDemandsInCurrentWeek}</strong> demandas
            </span>
          ) : (
            <span>
              Total: <strong className="text-slate-200">{totalDemandsInCurrentWeek}</strong> demandas na semana
            </span>
          )}
        </div>
      </div>

      {/* Error State */}
      {errorMsg && (
        <div className="mt-4 p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400" />
            <span>{errorMsg}</span>
          </div>
          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              className="px-2.5 py-1 rounded-lg bg-rose-900/60 hover:bg-rose-800 border border-rose-500/40 text-rose-200 text-xs font-semibold transition-all"
            >
              Verificar Configurações
            </button>
          )}
        </div>
      )}

      {/* 5 Day Columns Grid (Segunda a Sexta) */}
      <div className="mt-5 overflow-x-auto pb-3 custom-scrollbar">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 min-w-[850px] xl:min-w-0 gap-3">
          {(data?.days || []).map((day) => {
            const filteredDemands = day.demands.filter(filterDemand);

            return (
              <div
                key={day.date}
                className={`flex flex-col rounded-xl border transition-all duration-200 min-w-0 ${
                  day.isToday
                    ? 'bg-slate-900/90 border-blue-500/50 ring-1 ring-blue-500/30 shadow-lg shadow-blue-950/20'
                    : 'bg-slate-950/50 border-slate-800/80 hover:border-slate-700/60'
                }`}
              >
                {/* Day Column Header */}
                <div
                  className={`p-3 border-b flex items-center justify-between ${
                    day.isToday
                      ? 'border-blue-500/30 bg-blue-950/20'
                      : 'border-slate-800/80 bg-slate-900/40'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`text-xs font-bold tracking-tight ${
                          day.isToday ? 'text-blue-400' : 'text-slate-300'
                        }`}
                      >
                        {day.dayName}
                      </span>
                      {day.isToday && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-blue-600 text-white shadow-sm">
                          Hoje
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] font-medium text-slate-500">
                      {day.dayNumber} de {day.monthName}
                    </span>
                  </div>

                  {/* Demands Counter for this day */}
                  <span
                    className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                      filteredDemands.length > 0
                        ? day.isToday
                          ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                          : 'bg-slate-800 text-slate-300 border border-slate-700'
                        : 'text-slate-600'
                    }`}
                  >
                    {filteredDemands.length}
                  </span>
                </div>

                {/* Demands List */}
                <div className="p-2.5 flex-1 flex flex-col gap-2 min-h-[160px]">
                  {filteredDemands.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-3">
                      <p className="text-[11px] text-slate-600 font-medium">
                        Sem entregas previstas
                      </p>
                    </div>
                  ) : (
                    filteredDemands.map((demand) => (
                      <JiraCard key={demand.id} demand={demand} />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
