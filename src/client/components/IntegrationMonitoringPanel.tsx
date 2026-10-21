import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Activity,
  RefreshCw,
  CheckCheck,
  Search,
  Filter,
  X,
  Radio,
  Settings2,
  Server,
  Layers,
  Clock,
  Loader2,
  Copy,
  CheckCircle2,
  ShieldCheck,
} from 'lucide-react';
import { IntegrationReviewEvent, IntegrationEventsResponse } from '../types';
import { IntegrationCard } from './IntegrationCard';

interface IntegrationMonitoringPanelProps {
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onRefreshCount?: () => void;
  onOpenSettings?: () => void;
}

export const IntegrationMonitoringPanel: React.FC<IntegrationMonitoringPanelProps> = ({
  onShowToast,
  onRefreshCount,
  onOpenSettings,
}) => {
  const [events, setEvents] = useState<IntegrationReviewEvent[]>([]);
  const [totalPending, setTotalPending] = useState(0);
  const [totalReviewed, setTotalReviewed] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Filtros
  const [activeTab, setActiveTab] = useState<'pending' | 'reviewed'>('pending');
  const [selectedSender, setSelectedSender] = useState<string>('all');
  const [selectedSpace, setSelectedSpace] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Listas de opções distintas para os selects
  const [availableSenders, setAvailableSenders] = useState<string[]>([]);
  const [availableSpaces, setAvailableSpaces] = useState<Array<{ id: string; name: string }>>([]);

  // Modal de ajuda do Webhook
  const [isWebhookModalOpen, setIsWebhookModalOpen] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState<string>('');
  const [isCopied, setIsCopied] = useState(false);

  // Carregar eventos da API
  const fetchEvents = useCallback(
    async (isSilent = false) => {
      if (!isSilent) setIsLoading(true);
      try {
        const params = new URLSearchParams({
          status: activeTab,
          sender: selectedSender,
          spaceId: selectedSpace,
          search: searchQuery.trim(),
          limit: '100',
        });

        const res = await fetch(`/api/integrations/events?${params.toString()}`);
        if (!res.ok) {
          throw new Error('Falha ao obter eventos de integração');
        }

        const data: IntegrationEventsResponse = await res.json();
        setEvents(data.events || []);
        setTotalPending(data.totalPending);
        setTotalReviewed(data.totalReviewed);
        if (data.availableSenders) setAvailableSenders(data.availableSenders);
        if (data.availableSpaces) setAvailableSpaces(data.availableSpaces);

        if (onRefreshCount) {
          onRefreshCount();
        }
      } catch (err: any) {
        console.error('[IntegrationMonitoringPanel] Erro:', err);
        if (!isSilent) {
          onShowToast('Falha ao carregar erros de integração', 'error');
        }
      } finally {
        if (!isSilent) setIsLoading(false);
      }
    },
    [activeTab, selectedSender, selectedSpace, searchQuery, onShowToast, onRefreshCount]
  );

  // Auto-refresh silencioso a cada 30 segundos
  useEffect(() => {
    fetchEvents();

    const interval = setInterval(() => {
      fetchEvents(true);
    }, 30000);

    return () => clearInterval(interval);
  }, [fetchEvents]);

  // Carregar informações do webhook
  const loadWebhookInfo = async () => {
    try {
      const res = await fetch('/api/integrations/webhook-info');
      if (res.ok) {
        const json = await res.json();
        setWebhookUrl(json.webhookUrl);
      }
    } catch {}
  };

  // Disparar sincronização manual com Google Chat
  const handleSyncChat = async () => {
    setIsSyncing(true);
    try {
      onShowToast('Sincronizando com grupos do Google Chat...', 'info');
      const res = await fetch('/api/integrations/sync', {
        method: 'POST',
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Erro ao sincronizar');
      }

      const data = await res.json();
      const newSaved = data.newEventsSaved || 0;
      const pending = data.pendingCount ?? 0;

      if (newSaved > 0) {
        onShowToast(
          `Sincronização concluída! ${newSaved} ${newSaved === 1 ? 'novo erro encontrado' : 'novos erros encontrados'}.`,
          'success'
        );
      } else {
        onShowToast('Sincronização concluída! Nenhum novo erro nos grupos.', 'success');
      }

      fetchEvents(true);
    } catch (err: any) {
      onShowToast(err.message || 'Falha ao sincronizar com Google Chat', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  // Marcar um evento individual como revisado
  const handleReview = async (event: IntegrationReviewEvent) => {
    // Atualização otimista
    setEvents((prev) => prev.filter((e) => e.id !== event.id));
    setTotalPending((prev) => Math.max(0, prev - 1));
    setTotalReviewed((prev) => prev + 1);

    try {
      const res = await fetch(`/api/integrations/events/${event.id}/review`, {
        method: 'PUT',
      });
      if (!res.ok) throw new Error('Falha ao revisar');

      onShowToast('Erro de integração marcado como revisado!', 'success');
      if (onRefreshCount) onRefreshCount();
    } catch (err) {
      fetchEvents(true);
      onShowToast('Erro ao marcar como revisado', 'error');
    }
  };

  // Desmarcar revisão (voltar para pendentes)
  const handleUnreview = async (event: IntegrationReviewEvent) => {
    // Atualização otimista
    setEvents((prev) => prev.filter((e) => e.id !== event.id));
    setTotalReviewed((prev) => Math.max(0, prev - 1));
    setTotalPending((prev) => prev + 1);

    try {
      const res = await fetch(`/api/integrations/events/${event.id}/unreview`, {
        method: 'PUT',
      });
      if (!res.ok) throw new Error('Falha ao desmarcar');

      onShowToast('Evento retornado para pendentes.', 'info');
      if (onRefreshCount) onRefreshCount();
    } catch (err) {
      fetchEvents(true);
      onShowToast('Erro ao reverter revisão', 'error');
    }
  };

  // Marcar todos como revisados
  const handleReviewAll = async () => {
    if (totalPending === 0) return;
    if (!window.confirm('Deseja marcar todos os erros de integração pendentes como revisados?')) {
      return;
    }

    try {
      const res = await fetch('/api/integrations/events/review-all', {
        method: 'PUT',
      });
      if (!res.ok) throw new Error('Falha ao revisar todos');

      const data = await res.json();
      onShowToast(`${data.count || 'Todos os'} erros foram marcados como revisados!`, 'success');
      fetchEvents(false);
      if (onRefreshCount) onRefreshCount();
    } catch (err) {
      onShowToast('Erro ao marcar todos como revisados', 'error');
    }
  };

  const copyWebhookUrl = () => {
    if (!webhookUrl) return;
    navigator.clipboard.writeText(webhookUrl);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 3000);
  };

  return (
    <div className="bg-white dark:bg-[#0a0f1d] border border-slate-200 dark:border-indigo-950/40 rounded-2xl p-4 lg:p-6 shadow-xl shadow-slate-200/50 dark:shadow-black/30 relative space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800/80">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-600/20 border border-indigo-200 dark:border-indigo-500/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shadow-sm shadow-indigo-500/10">
              <Activity className="w-4 h-4" />
            </div>
            <h2 className="text-lg font-bold text-slate-800 dark:text-white tracking-tight flex flex-wrap items-center gap-2">
              <span>Monitoramento de integrações</span>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-50 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-500/30">
                {activeTab === 'pending' ? (
                  <>
                    {events.length} {events.length === 1 ? 'card pendente' : 'cards pendentes'}
                    {totalPending !== events.length && (
                      <span className="opacity-75 font-normal ml-1">({totalPending} no total)</span>
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
                title="Sincronização em segundo plano a cada 5 minutos"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse"></span>
                Auto-sync Google Chat
              </span>
            </h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
            Revise erros e alertas de integrações sincronizados dos grupos do Google Chat ou recebidos via Webhook.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Sync Button */}
          <button
            onClick={handleSyncChat}
            disabled={isSyncing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700/80 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white text-xs font-semibold transition-all shadow-sm"
            title="Buscar novas mensagens nos grupos do Google Chat"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Sincronizando...' : 'Sincronizar Chat'}</span>
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
            title="Ver URL do Webhook para recebimento direto de alertas"
          >
            <Radio className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
            <span>Webhook</span>
          </button>

          {/* Settings Button */}
          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700/80 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white text-xs font-semibold transition-all shadow-sm"
              title="Configurar Service Account do Google e Grupos a monitorar"
            >
              <Settings2 className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
              <span>Configurações</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs: Pendentes vs Já Revisados & Filters */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 pt-1 pb-2">
        {/* Toggle Tabs */}
        <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl">
          <button
            onClick={() => setActiveTab('pending')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'pending'
                ? 'bg-white dark:bg-indigo-600 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            <span>Pendentes</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                activeTab === 'pending'
                  ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
              }`}
            >
              {totalPending}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('reviewed')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'reviewed'
                ? 'bg-white dark:bg-indigo-600 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            <span>Já Revisados</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                activeTab === 'reviewed'
                  ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
              }`}
            >
              {totalReviewed}
            </span>
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 w-full md:w-auto flex-wrap sm:flex-nowrap">
          {/* Search Input */}
          <div className="relative flex-1 sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por ERP, ID, Campanha, erro..."
              className="w-full pl-8 pr-8 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500/50"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filter by Sender / App */}
          {availableSenders.length > 0 && (
            <select
              value={selectedSender}
              onChange={(e) => setSelectedSender(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value="all">Todos os Apps</option>
              {availableSenders.map((snd) => (
                <option key={snd} value={snd}>
                  {snd}
                </option>
              ))}
            </select>
          )}

          {/* Filter by Space */}
          {availableSpaces.length > 1 && (
            <select
              value={selectedSpace}
              onChange={(e) => setSelectedSpace(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value="all">Todos os Grupos</option>
              {availableSpaces.map((sp) => (
                <option key={sp.id} value={sp.id}>
                  {sp.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Cards List / Feed */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-500">
            <Loader2 className="w-7 h-7 animate-spin text-indigo-500" />
            <p className="text-xs font-medium">Carregando erros de integração...</p>
          </div>
        ) : events.length === 0 ? (
          <div className="py-12 px-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center flex flex-col items-center justify-center gap-2.5 bg-slate-50/50 dark:bg-slate-900/20">
            <div className="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
              {activeTab === 'pending'
                ? 'Tudo limpo! Nenhuma integração com erro pendente no momento.'
                : 'Nenhum erro de integração revisado encontrado para os filtros selecionados.'}
            </p>
            <p className="text-xs text-slate-400 max-w-md">
              {activeTab === 'pending'
                ? 'Novos alertas recebidos nos grupos do Google Chat monitorados aparecerão aqui automaticamente.'
                : 'Quando você revisar falhas de integração na aba Pendentes, o histórico ficará salvo aqui.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3.5">
            {events.map((event) => (
              <IntegrationCard
                key={event.id}
                event={event}
                onReview={handleReview}
                onUnreview={handleUnreview}
                onShowToast={onShowToast}
              />
            ))}
          </div>
        )}
      </div>

      {/* Webhook Help Modal */}
      {isWebhookModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#0c1222] border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Radio className="w-5 h-5 text-emerald-500" />
                <h3 className="font-bold text-slate-800 dark:text-white text-sm">
                  Webhook de Monitoramento de Integrações
                </h3>
              </div>
              <button
                onClick={() => setIsWebhookModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300">
              Além da busca automática direta na API do Google Chat, você também pode configurar alertas para serem disparados diretamente para o TaskLS via HTTP POST:
            </p>

            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
              <code className="flex-1 font-mono text-xs text-slate-800 dark:text-slate-200 truncate">
                {webhookUrl || '/api/integrations/webhook'}
              </code>
              <button
                onClick={copyWebhookUrl}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs transition-colors shrink-0"
              >
                {isCopied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{isCopied ? 'Copiado!' : 'Copiar'}</span>
              </button>
            </div>

            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              O webhook aceita payloads padrão do Google Chat (com cardsV2, cards ou texto puro).
            </p>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setIsWebhookModalOpen(false)}
                className="px-4 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200"
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
