import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  BellRing,
  RefreshCw,
  CheckCheck,
  Check,
  RotateCcw,
  ExternalLink,
  MessageSquare,
  AlertOctagon,
  Tag,
  User,
  Calendar,
  Layers,
  Search,
  Filter,
  X,
  Radio,
  Sliders,
  Sparkles,
  ArrowRight,
  ShieldAlert,
  HelpCircle,
  Copy,
  Clock,
  Loader2,
} from 'lucide-react';
import { JiraReviewEvent, JiraEventsResponse, JiraReviewGroup } from '../types';

/**
 * Agrupa alterações integradas juntas do mesmo card para revisão
 * - Apenas eventos com o mesmo status de revisão são agrupados (pendentes com pendentes, revisados com revisados)
 * - Critério: mesmo card (issueKey) e mesmo changelog (ID em eventId) OU fluxo contíguo (mesmo autor e dentro de 90s)
 * - ORDENAÇÃO INTERNA: as alterações dentro de cada card são ordenadas estritamente da MAIS ANTIGA para a MAIS RECENTE
 * - ORDENAÇÃO EXTERNA: os cards no feed são ordenados com as atividades mais recentes primeiro
 */
function groupJiraEvents(events: JiraReviewEvent[]): JiraReviewGroup[] {
  const groups: JiraReviewGroup[] = [];

  for (const event of events) {
    let matchedGroup: JiraReviewGroup | undefined;

    // Extrai ID do changelog se for evento chg-${issueKey}-${changelogId}-${field}
    let changelogId: string | null = null;
    if (event.eventId && event.eventId.startsWith(`chg-${event.issueKey}-`)) {
      const parts = event.eventId.split('-');
      if (parts.length >= 4) {
        changelogId = parts[parts.length - 2];
      }
    }

    const eventTimeMs = new Date(event.eventTime).getTime();

    for (const g of groups) {
      if (g.issueKey !== event.issueKey) continue;
      if (g.isReviewed !== event.isReviewed) continue;

      // 1. Mesmo changelog do Jira
      if (changelogId) {
        const hasMatchingChangelog = g.events.some((existingEv) => {
          if (existingEv.eventId && existingEv.eventId.startsWith(`chg-${event.issueKey}-`)) {
            const exParts = existingEv.eventId.split('-');
            const exChgId = exParts.length >= 4 ? exParts[exParts.length - 2] : null;
            return exChgId === changelogId;
          }
          return false;
        });
        if (hasMatchingChangelog) {
          matchedGroup = g;
          break;
        }
      }

      // 2. Fluxo contíguo no mesmo card (mesmo autor e até 90 segundos de diferença)
      const sameAuthor = (g.authorName || '').toLowerCase() === (event.authorName || '').toLowerCase();
      const timeDiff = Math.abs(new Date(g.eventTime).getTime() - eventTimeMs);
      if (sameAuthor && timeDiff <= 90000) {
        matchedGroup = g;
        break;
      }
    }

    if (matchedGroup) {
      matchedGroup.events.push(event);
      if (eventTimeMs > new Date(matchedGroup.eventTime).getTime()) {
        matchedGroup.eventTime = event.eventTime;
      }
    } else {
      groups.push({
        groupId: changelogId ? `grp-${event.issueKey}-${changelogId}` : `grp-${event.issueKey}-${event.id}`,
        issueKey: event.issueKey,
        issueId: event.issueId,
        projectKey: event.projectKey,
        summary: event.summary,
        authorName: event.authorName,
        authorAvatar: event.authorAvatar,
        eventTime: event.eventTime,
        cardData: event.cardData,
        isReviewed: event.isReviewed,
        events: [event],
      });
    }
  }

  // Ordenação interna: da MAIS ANTIGA para a MAIS RECENTE dentro do card
  for (const g of groups) {
    g.events.sort((a, b) => new Date(a.eventTime).getTime() - new Date(b.eventTime).getTime());
  }

  // Ordenação externa: cards com alterações mais recentes primeiro no feed
  groups.sort((a, b) => new Date(b.eventTime).getTime() - new Date(a.eventTime).getTime());

  return groups;
}

interface JiraReviewPanelProps {
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onRefreshCount?: () => void;
}

export const JiraReviewPanel: React.FC<JiraReviewPanelProps> = ({ onShowToast, onRefreshCount }) => {
  const [events, setEvents] = useState<JiraReviewEvent[]>([]);
  const [totalPending, setTotalPending] = useState(0);
  const [totalReviewed, setTotalReviewed] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Filters
  const [activeTab, setActiveTab] = useState<'pending' | 'reviewed'>('pending');
  const [selectedProject, setSelectedProject] = useState<string>('all');
  const [selectedEventType, setSelectedEventType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Webhook Help Modal
  const [isWebhookModalOpen, setIsWebhookModalOpen] = useState(false);
  const [webhookInfo, setWebhookInfo] = useState<{ webhookUrl: string; settingsUrl: string; projects: string[] } | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  // Load events
  const fetchEvents = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsLoading(true);
    try {
      const params = new URLSearchParams({
        status: activeTab,
        project: selectedProject,
        eventType: selectedEventType,
        search: searchQuery.trim(),
        limit: '100',
      });

      const res = await fetch(`/api/jira/events?${params.toString()}`);
      if (!res.ok) {
        throw new Error('Falha ao obter eventos do Jira');
      }

      const data: JiraEventsResponse = await res.json();
      setEvents(data.events || []);
      setTotalPending(data.totalPending);
      setTotalReviewed(data.totalReviewed);

      if (onRefreshCount) {
        onRefreshCount();
      }
    } catch (err: any) {
      console.error('[JiraReviewPanel] Erro:', err);
      if (!isSilent) {
        onShowToast('Falha ao carregar eventos do Jira', 'error');
      }
    } finally {
      if (!isSilent) setIsLoading(false);
    }
  }, [activeTab, selectedProject, selectedEventType, searchQuery, onShowToast, onRefreshCount]);

  useEffect(() => {
    fetchEvents();

    // Auto-refresh silencioso a cada 30 segundos para manter a lista sincronizada com as rotinas de fundo
    const interval = setInterval(() => {
      fetchEvents(true);
    }, 30000);

    return () => clearInterval(interval);
  }, [fetchEvents]);

  // Load webhook info
  const loadWebhookInfo = async () => {
    try {
      const res = await fetch('/api/jira/webhook-info');
      if (res.ok) {
        const json = await res.json();
        setWebhookInfo(json);
      }
    } catch {}
  };

  // Sync REST API
  const handleSyncRest = async () => {
    setIsSyncing(true);
    try {
      onShowToast('Sincronizando evoluções com a API do Jira...', 'info');
      const res = await fetch('/api/jira/events/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ daysBack: 1 }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Erro ao sincronizar');
      }

      const data = await res.json();
      const pending = data.pendingCount ?? data.totalPending ?? 0;
      if (pending === 0) {
        onShowToast('Sincronização concluída! Nenhuma evolução pendente no momento.', 'success');
      } else {
        onShowToast(
          `Sincronização concluída! ${pending} ${pending === 1 ? 'evolução pendente' : 'evoluções pendentes'} para revisão.`,
          'success'
        );
      }
      fetchEvents(true);
    } catch (err: any) {
      onShowToast(err.message || 'Falha ao sincronizar com Jira', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  // Agrupar alterações integradas juntas de um mesmo card para exibição conjunta
  const groupedEvents = useMemo(() => groupJiraEvents(events), [events]);

  // Mark group of events as reviewed
  const handleReviewGroup = async (group: JiraReviewGroup) => {
    const eventIds = group.events.map((e) => e.id);

    // Optimistic UI update
    setEvents((prev) => prev.filter((e) => !eventIds.includes(e.id)));
    setTotalPending((prev) => Math.max(0, prev - eventIds.length));
    setTotalReviewed((prev) => prev + eventIds.length);

    try {
      const res = await fetch('/api/jira/events/review-batch', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: eventIds }),
      });
      if (!res.ok) throw new Error('Falha ao revisar lote');
      const plural = eventIds.length > 1 ? `${eventIds.length} alterações revisadas` : 'Evolução revisada';
      onShowToast(`${group.issueKey}: ${plural} com sucesso!`, 'success');
      if (onRefreshCount) onRefreshCount();
    } catch (err) {
      fetchEvents(true);
      onShowToast('Erro ao marcar alterações como revisadas', 'error');
    }
  };

  // Unreview group of events (move back to pending)
  const handleUnreviewGroup = async (group: JiraReviewGroup) => {
    const eventIds = group.events.map((e) => e.id);

    // Optimistic UI update
    setEvents((prev) => prev.filter((e) => !eventIds.includes(e.id)));
    setTotalReviewed((prev) => Math.max(0, prev - eventIds.length));
    setTotalPending((prev) => prev + eventIds.length);

    try {
      const res = await fetch('/api/jira/events/unreview-batch', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: eventIds }),
      });
      if (!res.ok) throw new Error('Falha ao reverter lote');
      onShowToast(`${group.issueKey}: retornado para pendentes.`, 'info');
      if (onRefreshCount) onRefreshCount();
    } catch (err) {
      fetchEvents(true);
      onShowToast('Erro ao reverter revisão', 'error');
    }
  };

  // Mark all as reviewed
  const handleReviewAll = async () => {
    if (totalPending === 0) return;
    if (!window.confirm('Deseja marcar todas as evoluções pendentes como revisadas?')) {
      return;
    }

    try {
      const res = await fetch('/api/jira/events/review-all', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectKey: selectedProject !== 'all' ? selectedProject : undefined,
        }),
      });

      if (!res.ok) throw new Error('Falha ao revisar todos');
      const data = await res.json();
      onShowToast(`${data.count || 'Todos os'} eventos foram marcados como revisados!`, 'success');
      fetchEvents(false);
    } catch (err) {
      onShowToast('Erro ao marcar todos como revisados', 'error');
    }
  };

  const copyWebhookUrl = () => {
    if (!webhookInfo?.webhookUrl) return;
    navigator.clipboard.writeText(webhookInfo.webhookUrl);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 3000);
  };

  // Coletar projetos distintos presentes nos eventos para o filtro
  const availableProjects = Array.from(
    new Set(events.map((e) => e.projectKey).filter(Boolean))
  ).sort();

  return (
    <div className="bg-white dark:bg-[#0a0f1d] border border-slate-200 dark:border-blue-900/40 rounded-2xl p-4 lg:p-6 shadow-xl shadow-slate-200/50 dark:shadow-black/30 relative space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800/80">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-600/20 border border-blue-200 dark:border-blue-500/30 flex items-center justify-center text-blue-600 dark:text-blue-400 shadow-sm shadow-blue-500/10">
              <BellRing className="w-4 h-4" />
            </div>
            <h2 className="text-lg font-bold text-slate-800 dark:text-white tracking-tight flex flex-wrap items-center gap-2">
              <span>Revisões de Evoluções Jira</span>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-50 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-500/30">
                {activeTab === 'pending' ? (
                  <>
                    {groupedEvents.length} {groupedEvents.length === 1 ? 'card pendente' : 'cards pendentes'}
                    {totalPending !== groupedEvents.length && (
                      <span className="opacity-75 font-normal ml-1">({totalPending} alterações)</span>
                    )}
                  </>
                ) : (
                  <>
                    {totalPending} {totalPending === 1 ? 'pendente' : 'pendentes'}
                  </>
                )}
              </span>
              <span
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 text-[10px] font-semibold"
                title="Sincronização automática em segundo plano a cada 5 minutos"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse"></span>
                Auto-sync a cada 5 min
              </span>
            </h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
            Revise alterações de status, impedimentos, novos cards e comentários recebidos em tempo real ou sincronizados da API.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Sync Button */}
          <button
            onClick={handleSyncRest}
            disabled={isSyncing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700/80 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white text-xs font-semibold transition-all shadow-sm"
            title="Buscar alterações recentes na API do Jira"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-blue-500 dark:text-blue-400 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Sincronizando...' : 'Sincronizar Jira'}</span>
          </button>

          {/* Mark All as Reviewed */}
          {activeTab === 'pending' && totalPending > 0 && (
            <button
              onClick={handleReviewAll}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:hover:bg-emerald-900/50 border border-emerald-300 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-300 text-xs font-semibold transition-all shadow-sm"
              title="Marcar todas as pendências da lista como revisadas"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span>Marcar Todos Revisados</span>
            </button>
          )}

          {/* Webhook Info Button */}
          <button
            onClick={() => {
              loadWebhookInfo();
              setIsWebhookModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700/80 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white text-xs font-semibold transition-all shadow-sm"
            title="Configurar webhook para tempo real no Jira"
          >
            <Radio className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
            <span>Webhook Jira</span>
          </button>
        </div>
      </div>

      {/* Tabs: Pendentes vs Já Revisados & Filters */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 pt-1 pb-2">
        {/* Toggle Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-xl">
          <button
            onClick={() => setActiveTab('pending')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'pending'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <span>Pendentes de Revisão</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
              activeTab === 'pending' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
            }`}>
              {activeTab === 'pending' ? groupedEvents.length : totalPending}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('reviewed')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'reviewed'
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <Check className="w-3 h-3 text-emerald-500 dark:text-emerald-400" />
            <span>Já Revisados</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
              {activeTab === 'reviewed' ? groupedEvents.length : totalReviewed}
            </span>
          </button>
        </div>

        {/* Filter controls */}
        <div className="flex flex-wrap items-center gap-2 text-xs w-full md:w-auto">
          {/* Search box */}
          <div className="relative flex-1 sm:w-48 min-w-[150px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar evento..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-7 py-1.5 text-xs bg-slate-50 dark:bg-slate-900/90 border border-slate-300 dark:border-slate-700/60 rounded-xl text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-all shadow-sm"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                ✕
              </button>
            )}
          </div>

          {/* Project selector */}
          <select
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
            className="px-2.5 py-1.5 text-xs font-semibold bg-slate-50 dark:bg-slate-900/90 border border-slate-300 dark:border-slate-700/70 rounded-xl text-slate-700 dark:text-slate-300 focus:outline-none focus:border-blue-500 cursor-pointer"
          >
            <option value="all">Todos Projetos</option>
            {availableProjects.map((p) => (
              <option key={p} value={p}>
                🏷️ {p}
              </option>
            ))}
          </select>

          {/* Event type selector */}
          <select
            value={selectedEventType}
            onChange={(e) => setSelectedEventType(e.target.value)}
            className="px-2.5 py-1.5 text-xs font-semibold bg-slate-50 dark:bg-slate-900/90 border border-slate-300 dark:border-slate-700/70 rounded-xl text-slate-700 dark:text-slate-300 focus:outline-none focus:border-blue-500 cursor-pointer"
          >
            <option value="all">Todos os Tipos</option>
            <option value="status_changed">🔄 Mudança de Status</option>
            <option value="flagged_changed">🚨 Impedimento / Bloqueio</option>
            <option value="comment_added">💬 Comentários</option>
            <option value="issue_created">✨ Novos Cards</option>
            <option value="assignee_changed">👤 Troca de Responsável</option>
            <option value="field_updated">📝 Outros Campos</option>
          </select>

          {/* Clear filters button */}
          {(selectedProject !== 'all' || selectedEventType !== 'all' || searchQuery.trim()) && (
            <button
              onClick={() => {
                setSelectedProject('all');
                setSelectedEventType('all');
                setSearchQuery('');
              }}
              className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/80 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-300 dark:border-slate-700 transition-all"
              title="Limpar filtros"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Events List */}
      {isLoading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-7 h-7 animate-spin text-blue-500" />
          <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold">Carregando eventos do Jira...</p>
        </div>
      ) : groupedEvents.length === 0 ? (
        <div className="py-16 text-center text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-slate-900/40 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-8 flex flex-col items-center justify-center gap-2">
          {activeTab === 'pending' ? (
            <>
              <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 mb-1">
                <CheckCheck className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">Tudo em dia! Nenhuma evolução pendente.</h3>
              <p className="text-xs text-slate-500 max-w-md">
                Todas as alterações dos seus projetos Jira já foram revisadas. Novos eventos recebidos via webhook ou sincronização aparecerão aqui.
              </p>
              <button
                onClick={handleSyncRest}
                disabled={isSyncing}
                className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-600/20 border border-blue-200 dark:border-blue-500/30 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-600/30 text-xs font-bold transition-all"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>Verificar Atualizações Agora</span>
              </button>
            </>
          ) : (
            <>
              <Clock className="w-8 h-8 text-slate-400 dark:text-slate-600 mb-1" />
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Nenhuma evolução revisada encontrada com os filtros atuais.</h3>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {groupedEvents.map((group) => {
            const hasBlocked =
              group.cardData?.isBlocked ||
              group.events.some((e) => e.eventType === 'flagged_changed' && e.diff.isBlocked);

            return (
              <div
                key={group.groupId}
                className={`group relative rounded-xl border p-4 transition-all duration-200 flex flex-col justify-between min-w-0 overflow-hidden ${
                  hasBlocked
                    ? 'bg-red-50/70 border-red-300 hover:bg-red-50 hover:border-red-400 dark:bg-red-500/10 dark:border-red-500/30 dark:hover:border-red-500/50 dark:hover:bg-red-500/20 shadow-sm'
                    : 'bg-white border-slate-200 hover:border-blue-400 hover:bg-slate-50/80 dark:bg-slate-900/90 dark:border-slate-800 dark:hover:border-blue-500/50 dark:hover:bg-slate-800/80 shadow-sm hover:shadow-md'
                }`}
              >
                <div className="min-w-0">
                  {/* Event Top Bar: Author, Time ago, Event Type / Batch Count Badge */}
                  <div className="flex items-center justify-between gap-2 mb-2.5 pb-2 border-b border-slate-100 dark:border-slate-800/80 text-[11px] min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {group.authorAvatar ? (
                        <img
                          src={group.authorAvatar}
                          alt=""
                          className="w-4 h-4 rounded-full object-cover flex-shrink-0"
                        />
                      ) : (
                        <User className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                      )}
                      <span className="font-semibold text-slate-700 dark:text-slate-200 truncate" title={group.authorName}>
                        {group.authorName}
                      </span>
                      <span className="text-slate-400">·</span>
                      <span className="text-slate-500 dark:text-slate-400 text-[10px] whitespace-nowrap">
                        {formatTimeAgo(group.eventTime)}
                      </span>
                    </div>

                    {/* Batch Badge or Event Type Badge */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {group.events.length > 1 ? (
                        <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/40 text-[10px] font-bold">
                          {group.events.length} alterações
                        </span>
                      ) : (
                        <EventTypeBadge type={group.events[0]?.eventType || 'field_updated'} />
                      )}
                    </div>
                  </div>

                  {/* Jira Card Header: Key + External Link + Status */}
                  <div className="flex items-center justify-between gap-2 mb-1.5 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <a
                        href={group.cardData?.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-black text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 hover:underline flex items-center gap-1 min-w-0"
                        title={`Abrir ${group.issueKey} no Jira`}
                      >
                        <span className="truncate">{group.issueKey}</span>
                        <ExternalLink className="w-3 h-3 opacity-60 group-hover:opacity-100 flex-shrink-0" />
                      </a>

                      {group.cardData?.isBlocked && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-red-100 text-red-700 border border-red-200 dark:bg-red-500/25 dark:text-red-200 dark:border-red-500/40 text-[9px] font-black uppercase tracking-wider flex-shrink-0">
                          <AlertOctagon className="w-2.5 h-2.5 text-red-500 dark:text-red-300" />
                          Bloqueado
                        </span>
                      )}
                    </div>

                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 flex-shrink-0">
                      {group.cardData?.displayStatus || 'Jira'}
                    </span>
                  </div>

                  {/* Card Title / Summary */}
                  <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-100 line-clamp-2 mb-3 leading-snug break-words">
                    {group.summary}
                  </h4>

                  {/* Diffs List (strictly ordered from oldest to newest) */}
                  <div className="space-y-2 mb-3.5 min-w-0">
                    {group.events.map((ev, idx) => (
                      <div key={ev.id} className="min-w-0">
                        {group.events.length > 1 && (
                          <div className="flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500 mb-1 px-0.5">
                            <span className="font-semibold text-slate-600 dark:text-slate-400">
                              #{idx + 1} · {ev.diff?.label || ev.diff?.field || ev.eventType}
                            </span>
                            <span className="text-[9px] text-slate-400 dark:text-slate-500">
                              {formatTimeAgo(ev.eventTime)}
                            </span>
                          </div>
                        )}
                        <EventDeltaBox event={ev} />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Action Button & Metadata Footer */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                    <Tag className="w-2.5 h-2.5" />
                    <span>{group.projectKey}</span>
                    {group.cardData?.assignee && (
                      <>
                        <span>·</span>
                        <span className="truncate max-w-[100px]">{group.cardData.assignee.displayName.split(' ')[0]}</span>
                      </>
                    )}
                  </div>

                  {/* Mark as Reviewed / Undo Button */}
                  {activeTab === 'pending' ? (
                    <button
                      onClick={() => handleReviewGroup(group)}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white border border-emerald-300 dark:bg-emerald-600/20 dark:hover:bg-emerald-600 dark:text-emerald-300 dark:hover:text-white dark:border-emerald-500/40 text-xs font-bold transition-all shadow-sm group-hover:bg-emerald-600 group-hover:text-white"
                      title="Marcar todas as alterações deste card como revisadas"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>{group.events.length > 1 ? `Revisar (${group.events.length})` : 'Revisar'}</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => handleUnreviewGroup(group)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 text-xs font-semibold border border-slate-300 dark:border-slate-700 transition-all"
                      title="Mover alterações deste card de volta para pendentes"
                    >
                      <RotateCcw className="w-3 h-3 text-amber-500 dark:text-amber-400" />
                      <span>{group.events.length > 1 ? `Desfazer (${group.events.length})` : 'Desfazer'}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Instruções do Webhook */}
      {isWebhookModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#0e1424] border border-slate-200 dark:border-blue-900/60 rounded-2xl w-full max-w-xl p-6 shadow-2xl relative text-slate-800 dark:text-slate-200">
            <button
              onClick={() => setIsWebhookModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-600/20 border border-blue-200 dark:border-blue-500/40 flex items-center justify-center text-blue-600 dark:text-blue-400">
                <Radio className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Configuração do Webhook do Jira</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Receba notificações instantâneas em tempo real no TaskLS.</p>
              </div>
            </div>

            <div className="space-y-4 text-xs">
              {/* Webhook URL Box */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  1. URL do Webhook do TaskLS:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={webhookInfo?.webhookUrl || 'https://taskls.duckdns.org/api/jira/webhook'}
                    className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono text-emerald-600 dark:text-emerald-400 select-all"
                  />
                  <button
                    onClick={copyWebhookUrl}
                    className="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold flex items-center gap-1.5 transition-all shadow-md shadow-blue-600/30"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>{isCopied ? 'Copiado!' : 'Copiar'}</span>
                  </button>
                </div>
              </div>

              {/* Step-by-step instructions */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 space-y-2 text-slate-700 dark:text-slate-300 leading-relaxed">
                <p className="font-bold text-slate-900 dark:text-white">2. Como ativar no Jira Cloud:</p>
                <ol className="list-decimal list-inside space-y-1.5 text-slate-700 dark:text-slate-300">
                  <li>
                    Acesse o Jira como Administrador em:{' '}
                    <a
                      href={webhookInfo?.settingsUrl || 'https://sysmiddle.atlassian.net/plugins/servlet/webhooks'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 dark:text-blue-400 hover:underline font-semibold"
                    >
                      Configurações ➔ Sistema ➔ WebHooks ↗
                    </a>
                  </li>
                  <li>Clique no botão <strong>Criar um WebHook</strong> no canto superior direito.</li>
                  <li>Cole a URL acima no campo <strong>URL</strong>.</li>
                  <li>
                    No campo <strong>JQL</strong>, restrinja aos seus projetos (opcional):
                    <div className="mt-1 p-2 bg-white dark:bg-slate-950 rounded border border-slate-200 dark:border-slate-800 font-mono text-[11px] text-amber-700 dark:text-amber-300">
                      project in ({webhookInfo?.projects?.map((p) => `"${p}"`).join(', ') || '"ESM", "NEO", "VOAL"'})
                    </div>
                  </li>
                  <li>
                    Em <strong>Eventos</strong>, marque as opções:
                    <ul className="list-disc list-inside ml-4 mt-0.5 text-slate-500 dark:text-slate-400">
                      <li><strong>Issue:</strong> created, updated</li>
                      <li><strong>Comment:</strong> created, updated</li>
                    </ul>
                  </li>
                  <li>Role até o final da página e clique em <strong>Criar / Salvar</strong>.</li>
                </ol>
              </div>

              <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-500/30 text-blue-700 dark:text-blue-300 text-[11px]">
                💡 <strong>Abordagem Híbrida Ativa:</strong> Mesmo antes de configurar o webhook ou se alguma notificação falhar, você pode clicar no botão <strong>"Sincronizar Jira"</strong> a qualquer momento para resgatar todo o histórico recente!
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setIsWebhookModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-white font-bold text-xs border border-slate-300 dark:border-slate-700 transition-all"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Extrai texto legível de um documento ADF (Atlassian Document Format) ou string JSON
 */
function extractAdfText(node: any): string {
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
 * Limpa marcações brutas do Jira ({panel}, {color}, URLs longas com tokens) e converte ADF em texto
 */
function cleanJiraMarkup(input: any): string {
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
 * Renderiza o texto do comentário com destaque para links e menções @usuario
 */
function renderFormattedComment(text: string): React.ReactNode {
  if (!text) return null;

  // Separa URLs no texto para torná-las links clicáveis
  const urlRegex = /(https?:\/\/[^\s<>"'()]+)/g;
  const parts = text.split(urlRegex);

  return (
    <>
      {parts.map((part, i) => {
        if (part.match(urlRegex)) {
          return (
            <a
              key={i}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 underline font-semibold break-all inline-block hover:brightness-110 transition-all"
              onClick={(e) => e.stopPropagation()}
            >
              {part}
            </a>
          );
        }

        // Separa menções como @Lucas Kauling ou @Usuario
        const mentionRegex = /(@[A-Za-zÀ-ÿ0-9._-]+(?:\s+[A-Za-zÀ-ÿ0-9._-]+)?)/g;
        const subParts = part.split(mentionRegex);

        if (subParts.length > 1) {
          return subParts.map((sub, j) => {
            if (sub.startsWith('@') && sub.length > 2) {
              return (
                <span
                  key={`${i}-${j}`}
                  className="inline-flex items-center px-1.5 py-0.5 mx-0.5 rounded-md bg-blue-500/20 text-blue-300 font-semibold text-[11px] border border-blue-500/40 select-text"
                >
                  {sub}
                </span>
              );
            }
            return sub;
          });
        }

        return part;
      })}
    </>
  );
}

/**
 * Renderiza a caixa com os dados exatos do que mudou no evento
 */
const EventDeltaBox: React.FC<{ event: JiraReviewEvent }> = ({ event }) => {
  const { eventType, diff } = event;

  switch (eventType) {
    case 'status_changed':
      return (
        <div className="p-2.5 rounded-lg bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-500/30 text-xs min-w-0 overflow-hidden">
          <div className="text-[10px] font-bold text-blue-700 dark:text-blue-300 mb-1.5 flex items-center gap-1">
            <span>🔄 Status alterado:</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 font-bold min-w-0">
            <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 text-[10px] break-words">
              {diff.from || 'Sem status'}
            </span>
            <ArrowRight className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400 flex-shrink-0" />
            <span className="px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-500/20 text-blue-800 dark:text-blue-200 border border-blue-300 dark:border-blue-500/40 text-[10px] break-words">
              {diff.to || 'Desconhecido'}
            </span>
          </div>
        </div>
      );

    case 'flagged_changed':
      return (
        <div className={`p-2.5 rounded-lg border text-xs min-w-0 overflow-hidden ${
          diff.isBlocked
            ? 'bg-red-50 border-red-300 text-red-700 dark:bg-red-500/20 dark:border-red-500/50 dark:text-red-200'
            : 'bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-500/40 dark:text-emerald-200'
        }`}>
          <div className="flex items-center gap-1.5 font-bold min-w-0 break-words">
            {diff.isBlocked ? (
              <>
                <AlertOctagon className="w-4 h-4 text-red-500 dark:text-red-400 flex-shrink-0" />
                <span className="break-words">🚨 Marcado como Impedimento (Card Bloqueado)</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4 text-emerald-500 dark:text-emerald-400 flex-shrink-0" />
                <span className="break-words">✅ Impedimento Removido (Card Desbloqueado)</span>
              </>
            )}
          </div>
        </div>
      );

    case 'comment_added': {
      const cleanText = cleanJiraMarkup(diff.text || 'Sem texto no comentário');
      return (
        <div className="p-2.5 rounded-lg bg-purple-50/70 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-500/30 text-xs min-w-0 overflow-hidden">
          <div className="text-[10px] font-bold text-purple-700 dark:text-purple-300 mb-1.5 flex items-center gap-1">
            <MessageSquare className="w-3.5 h-3.5 text-purple-500 dark:text-purple-400 flex-shrink-0" />
            <span>Novo comentário registrado:</span>
          </div>
          <div className="text-slate-800 dark:text-slate-200 text-xs max-h-36 overflow-y-auto break-words break-all whitespace-pre-wrap bg-white dark:bg-purple-950/40 p-2.5 rounded-lg border border-purple-200 dark:border-purple-500/20 leading-relaxed font-sans shadow-inner">
            {renderFormattedComment(cleanText)}
          </div>
        </div>
      );
    }

    case 'issue_created':
      return (
        <div className="p-2.5 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-500/30 text-xs min-w-0 overflow-hidden">
          <div className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 mb-1 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-emerald-500 dark:text-emerald-400 flex-shrink-0" />
            <span>Novo card incluído no Jira:</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-emerald-800 dark:text-emerald-200 font-semibold min-w-0">
            <span>Tipo: {diff.issueType || 'Demanda'}</span>
            {diff.priority && <span>· Prioridade: {diff.priority}</span>}
          </div>
        </div>
      );

    case 'assignee_changed':
      return (
        <div className="p-2.5 rounded-lg bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-500/30 text-xs min-w-0 overflow-hidden">
          <div className="text-[10px] font-bold text-amber-700 dark:text-amber-300 mb-1 flex items-center gap-1">
            <User className="w-3 h-3 text-amber-500 dark:text-amber-400 flex-shrink-0" />
            <span>Responsável alterado:</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 font-bold text-[11px] min-w-0">
            <span className="text-slate-400 line-through break-words">{diff.from}</span>
            <ArrowRight className="w-3 h-3 text-amber-500 dark:text-amber-400 flex-shrink-0" />
            <span className="text-amber-800 dark:text-amber-200 break-words">{diff.to}</span>
          </div>
        </div>
      );

    default: {
      const fromText = cleanJiraMarkup(diff.from || '');
      const toText = cleanJiraMarkup(diff.to || '');
      const isLong =
        diff.field?.toLowerCase() === 'description' ||
        fromText.length > 50 ||
        toText.length > 50 ||
        fromText.includes('\n') ||
        toText.includes('\n');

      if (isLong) {
        return (
          <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 text-xs min-w-0 overflow-hidden">
            <div className="text-[10px] font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center justify-between">
              <span className="truncate">{diff.label || `Campo alterado: ${diff.field}`}</span>
            </div>

            <div className="space-y-1.5 min-w-0">
              {fromText && (
                <div className="min-w-0">
                  <span className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider block mb-0.5">
                    Anterior:
                  </span>
                  <div className="p-2 rounded bg-white dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 line-through max-h-24 overflow-y-auto break-words break-all whitespace-pre-wrap">
                    {fromText}
                  </div>
                </div>
              )}

              <div className="min-w-0">
                <span className="text-[9px] font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider block mb-0.5">
                  Novo:
                </span>
                <div className="p-2 rounded bg-white dark:bg-slate-950/80 border border-blue-200 dark:border-blue-500/30 text-[11px] text-slate-800 dark:text-slate-100 font-medium max-h-32 overflow-y-auto break-words break-all whitespace-pre-wrap">
                  {toText || 'vazio'}
                </div>
              </div>
            </div>
          </div>
        );
      }

      return (
        <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 text-xs min-w-0 overflow-hidden">
          <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1 truncate">
            {diff.label || `Campo alterado: ${diff.field}`}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 font-medium text-[11px] text-slate-700 dark:text-slate-300 min-w-0">
            <span className="line-through text-slate-400 break-words break-all">{fromText || 'vazio'}</span>
            <ArrowRight className="w-3 h-3 text-slate-400 flex-shrink-0" />
            <span className="text-slate-900 dark:text-white font-bold break-words break-all">{toText || 'vazio'}</span>
          </div>
        </div>
      );
    }
  }
};

/**
 * Badge visual para o tipo do evento
 */
const EventTypeBadge: React.FC<{ type: string }> = ({ type }) => {
  switch (type) {
    case 'status_changed':
      return (
        <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30 text-[9px] font-bold uppercase tracking-wide">
          Status
        </span>
      );
    case 'flagged_changed':
      return (
        <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-200 dark:bg-red-500/20 dark:text-red-300 dark:border-red-500/40 text-[9px] font-bold uppercase tracking-wide">
          Impedimento
        </span>
      );
    case 'comment_added':
      return (
        <span className="px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-500/15 dark:text-purple-300 dark:border-purple-500/30 text-[9px] font-bold uppercase tracking-wide">
          Comentário
        </span>
      );
    case 'issue_created':
      return (
        <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30 text-[9px] font-bold uppercase tracking-wide">
          Novo Card
        </span>
      );
    case 'assignee_changed':
      return (
        <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30 text-[9px] font-bold uppercase tracking-wide">
          Responsável
        </span>
      );
    default:
      return (
        <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700 text-[9px] font-bold uppercase tracking-wide">
          Alteração
        </span>
      );
  }
};

/**
 * Formata tempo decorrido relativo (ex: 'há 15m', 'há 2h', 'ontem')
 */
function formatTimeAgo(isoString: string): string {
  try {
    const eventDate = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - eventDate.getTime();
    const diffMin = Math.round(diffMs / (1000 * 60));
    const diffHours = Math.round(diffMin / 60);
    const diffDays = Math.round(diffHours / 24);

    if (diffMin < 1) return 'Agora mesmo';
    if (diffMin < 60) return `há ${diffMin}m`;
    if (diffHours < 24) return `há ${diffHours}h`;
    if (diffDays === 1) return 'Ontem';
    if (diffDays < 7) return `há ${diffDays}d`;

    return eventDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  } catch {
    return '';
  }
}
