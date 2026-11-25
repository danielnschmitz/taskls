import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  MessageCircle,
  RefreshCw,
  CheckCheck,
  Check,
  RotateCcw,
  ExternalLink,
  MessageSquare,
  AlertOctagon,
  User,
  Search,
  ArrowRight,
  Clock,
  Loader2,
  Sliders,
  Sparkles,
} from 'lucide-react';
import { JiraReviewEvent, JiraEventsResponse, JiraReviewGroup, WahaConfig } from '../types';
import { WhatsappSendModal } from './WhatsappSendModal';

interface JiraMyNeoReviewPanelProps {
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onRefreshCount?: () => void;
}

function groupEventsByCard(events: JiraReviewEvent[]): JiraReviewGroup[] {
  const groups: JiraReviewGroup[] = [];

  for (const event of events) {
    let matchedGroup: JiraReviewGroup | undefined;

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

  for (const g of groups) {
    g.events.sort((a, b) => new Date(a.eventTime).getTime() - new Date(b.eventTime).getTime());
  }

  groups.sort((a, b) => new Date(b.eventTime).getTime() - new Date(a.eventTime).getTime());
  return groups;
}

export const JiraMyNeoReviewPanel: React.FC<JiraMyNeoReviewPanelProps> = ({
  onShowToast,
  onRefreshCount,
}) => {
  const [events, setEvents] = useState<JiraReviewEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  const [statusFilter, setStatusFilter] = useState<'pending' | 'reviewed' | 'all'>('pending');
  const [authorFilter, setAuthorFilter] = useState<string>('');
  const [availableAuthors, setAvailableAuthors] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const [sendModalGroup, setSendModalGroup] = useState<JiraReviewGroup | null>(null);
  const [processingGroupIds, setProcessingGroupIds] = useState<Set<string>>(new Set());

  // Carrega autor padrão configurado no WAHA + autores disponíveis no projeto NEO
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch('/api/waha/config'),
      fetch('/api/jira/events/authors?project=NEO'),
    ])
      .then(async ([cfgRes, authRes]) => {
        if (cancelled) return;
        if (cfgRes.ok) {
          const cfg: WahaConfig = await cfgRes.json();
          if (cfg.jiraAuthorName) {
            setAuthorFilter(cfg.jiraAuthorName);
          }
        }
        if (authRes.ok) {
          const data = await authRes.json();
          setAvailableAuthors(data.authors || []);
        }
      })
      .catch((err) => console.warn('[JiraMyNeoReview] Erro ao carregar metadados:', err));

    return () => {
      cancelled = true;
    };
  }, []);

  const fetchEvents = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        status: statusFilter,
        project: 'NEO',
        limit: '200',
      });
      if (authorFilter.trim()) {
        params.set('author', authorFilter.trim());
      }
      if (searchQuery.trim()) {
        params.set('search', searchQuery.trim());
      }

      const res = await fetch(`/api/jira/events?${params.toString()}`);
      if (!res.ok) throw new Error('Falha ao buscar alterações NEO');
      const data: JiraEventsResponse = await res.json();
      setEvents(data.events || []);
    } catch (err: any) {
      onShowToast(err.message || 'Erro ao carregar alterações do projeto NEO.', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, authorFilter, searchQuery, onShowToast]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const handleSyncJira = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch('/api/jira/events/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ daysBack: 3 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha na sincronização');
      onShowToast(`Sincronização concluída (${data.inserted || 0} novas alterações).`, 'success');
      await fetchEvents();
      onRefreshCount?.();
    } catch (err: any) {
      onShowToast(err.message || 'Erro ao sincronizar Jira.', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleToggleGroupReview = async (group: JiraReviewGroup) => {
    const ids = group.events.map((e) => e.id);
    if (ids.length === 0) return;

    setProcessingGroupIds((prev) => new Set(prev).add(group.groupId));
    try {
      const endpoint = group.isReviewed
        ? '/api/jira/events/unreview-batch'
        : '/api/jira/events/review-batch';
      const res = await fetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error('Falha ao atualizar status da revisão');

      onShowToast(
        group.isReviewed ? `${group.issueKey} movido para pendentes.` : `${group.issueKey} marcado como revisado.`,
        'success'
      );
      await fetchEvents();
      onRefreshCount?.();
    } catch (err: any) {
      onShowToast(err.message || 'Erro ao atualizar revisão.', 'error');
    } finally {
      setProcessingGroupIds((prev) => {
        const next = new Set(prev);
        next.delete(group.groupId);
        return next;
      });
    }
  };

  const groupedCards = useMemo(() => groupEventsByCard(events), [events]);

  return (
    <div className="space-y-5">
      {/* Header & Filtros */}
      <div className="bg-white/90 dark:bg-[#0c1222]/90 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-lg space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                Minhas Alterações — Projeto NEO
                <span className="px-2 py-0.5 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[11px] font-bold">
                  {groupedCards.length} card(s)
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Revise suas alterações em cards NEO e envie avisos formatados diretamente para o grupo do WhatsApp via WAHA.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSyncJira}
            disabled={isSyncing}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold shadow-md shadow-blue-600/20 transition-all self-start md:self-auto"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Sincronizando...' : 'Sincronizar Jira'}</span>
          </button>
        </div>

        {/* Barra de filtros */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
          {/* Status */}
          <div className="md:col-span-4 flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800">
            {(
              [
                { key: 'pending', label: 'Pendentes' },
                { key: 'reviewed', label: 'Revisados' },
                { key: 'all', label: 'Todos' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setStatusFilter(opt.key)}
                className={`flex-1 py-1.5 px-2.5 rounded-lg text-xs font-bold transition-all ${
                  statusFilter === opt.key
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Autor */}
          <div className="md:col-span-4 relative">
            <User className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              list="neo-my-authors"
              placeholder="Filtrar por autor (ex: seu nome)..."
              value={authorFilter}
              onChange={(e) => setAuthorFilter(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
            />
            <datalist id="neo-my-authors">
              {availableAuthors.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          </div>

          {/* Busca */}
          <div className="md:col-span-4 relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar card NEO ou texto..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>
      </div>

      {/* Lista de Cards */}
      {isLoading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-7 h-7 animate-spin text-emerald-500" />
          <p className="text-xs text-slate-400 font-medium">Carregando alterações do projeto NEO...</p>
        </div>
      ) : groupedCards.length === 0 ? (
        <div className="py-16 text-center bg-white/60 dark:bg-slate-900/40 border border-dashed border-slate-300 dark:border-slate-800 rounded-3xl p-8 space-y-2">
          <Sliders className="w-8 h-8 text-slate-400 mx-auto" />
          <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
            Nenhuma alteração encontrada no projeto NEO
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            {authorFilter
              ? `Não há registros para o autor "${authorFilter}" com o filtro atual.`
              : 'Configure seu nome de autor do Jira em Configurações > WhatsApp (WAHA) ou digite no filtro acima.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {groupedCards.map((group) => {
            const isProcessing = processingGroupIds.has(group.groupId);
            const cardUrl = group.cardData?.url;

            return (
              <div
                key={group.groupId}
                className="bg-white dark:bg-[#0c1222] border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-md hover:border-emerald-500/40 transition-all space-y-4"
              >
                {/* Cabeçalho do Card */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800/80">
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-lg bg-blue-600/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 text-xs font-extrabold font-mono">
                        {group.issueKey}
                      </span>
                      {group.cardData?.displayStatus && (
                        <span className="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] font-semibold">
                          {group.cardData.displayStatus}
                        </span>
                      )}
                      {group.cardData?.industry && (
                        <span className="px-2 py-0.5 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[11px] font-semibold">
                          {group.cardData.industry}
                        </span>
                      )}
                      <span className="text-[11px] text-slate-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(group.eventTime).toLocaleString('pt-BR')}
                      </span>
                    </div>

                    <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-snug">
                      {group.summary}
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Autor: <strong className="text-slate-700 dark:text-slate-300">{group.authorName}</strong>
                    </p>
                  </div>

                  {/* Ações */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {cardUrl && (
                      <a
                        href={cardUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Jira</span>
                      </a>
                    )}

                    <button
                      type="button"
                      onClick={() => setSendModalGroup(group)}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition-all"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>Enviar WhatsApp</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleToggleGroupReview(group)}
                      disabled={isProcessing}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                        group.isReviewed
                          ? 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                          : 'bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20'
                      }`}
                    >
                      {isProcessing ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : group.isReviewed ? (
                        <RotateCcw className="w-3.5 h-3.5" />
                      ) : (
                        <CheckCheck className="w-3.5 h-3.5" />
                      )}
                      <span>{group.isReviewed ? 'Reabrir' : 'Revisado'}</span>
                    </button>
                  </div>
                </div>

                {/* Lista de alterações do card */}
                <div className="space-y-2">
                  {group.events.map((ev) => (
                    <div
                      key={ev.id}
                      className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-950/70 border border-slate-100 dark:border-slate-800/80 text-xs flex items-start gap-2.5"
                    >
                      {ev.eventType === 'comment_added' ? (
                        <MessageSquare className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                      ) : ev.eventType === 'flagged_changed' ? (
                        <AlertOctagon className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                      ) : (
                        <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                      )}

                      <div className="flex-1 min-w-0 space-y-1">
                        {ev.eventType === 'comment_added' ? (
                          <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                            {ev.diff.text || '(Comentário sem texto)'}
                          </p>
                        ) : ev.eventType === 'issue_created' ? (
                          <p className="font-semibold text-emerald-600 dark:text-emerald-400">
                            Card criado no projeto NEO
                          </p>
                        ) : (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-bold text-slate-700 dark:text-slate-200">
                              {ev.diff.label || ev.diff.field}:
                            </span>
                            <span className="px-2 py-0.5 rounded bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-400 line-through">
                              {ev.diff.from || 'vazio'}
                            </span>
                            <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                            <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-semibold">
                              {ev.diff.to || 'vazio'}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de envio para WhatsApp */}
      <WhatsappSendModal
        isOpen={Boolean(sendModalGroup)}
        group={sendModalGroup}
        onClose={() => setSendModalGroup(null)}
        onShowToast={onShowToast}
      />
    </div>
  );
};
