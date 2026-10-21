import React, { useState } from 'react';
import {
  Check,
  RotateCcw,
  Copy,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Info,
  Clock,
  Layers,
  Server,
  Hash,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { IntegrationReviewEvent } from '../types';
import { formatDistanceToNow, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface IntegrationCardProps {
  event: IntegrationReviewEvent;
  onReview: (event: IntegrationReviewEvent) => void;
  onUnreview: (event: IntegrationReviewEvent) => void;
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const IntegrationCard: React.FC<IntegrationCardProps> = ({
  event,
  onReview,
  onUnreview,
  onShowToast,
}) => {
  const [isCopied, setIsCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const parsed = event.parsedData || {};
  const items = parsed.items || [];
  const details = parsed.details || {};
  const severity = parsed.severity || 'warning';

  // Formatação de data
  let timeAgo = '';
  let fullDate = '';
  try {
    const d = new Date(event.eventTime);
    timeAgo = formatDistanceToNow(d, { addSuffix: true, locale: ptBR });
    fullDate = format(d, "dd 'de' MMMM 'às' HH:mm", { locale: ptBR });
  } catch {
    timeAgo = event.eventTime;
    fullDate = event.eventTime;
  }

  // Copiar resumo do erro para o clipboard
  const handleCopy = () => {
    const textToCopy = `[${event.senderName || 'Integração'}] ${event.headerTitle} - ${event.headerSubtitle}\n${event.summary}\n${event.parsedData?.rawText || ''}`;
    navigator.clipboard.writeText(textToCopy);
    setIsCopied(true);
    onShowToast('Detalhes do erro copiados para a área de transferência!', 'success');
    setTimeout(() => setIsCopied(false), 2500);
  };

  // Cores de severidade
  const severityStyles = {
    error: {
      border: 'border-red-200 dark:border-red-500/30 hover:border-red-300 dark:hover:border-red-500/50',
      badgeBg: 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/20',
      icon: <AlertOctagon className="w-3.5 h-3.5 text-red-500" />,
      accent: 'text-red-600 dark:text-red-400',
    },
    warning: {
      border: 'border-amber-200 dark:border-amber-500/30 hover:border-amber-300 dark:hover:border-amber-500/50',
      badgeBg: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20',
      icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />,
      accent: 'text-amber-600 dark:text-amber-400',
    },
    info: {
      border: 'border-blue-200 dark:border-blue-500/30 hover:border-blue-300 dark:hover:border-blue-500/50',
      badgeBg: 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/20',
      icon: <Info className="w-3.5 h-3.5 text-blue-500" />,
      accent: 'text-blue-600 dark:text-blue-400',
    },
  }[severity];

  const hasExtraDetails = Object.keys(details).length > 0 || (parsed.sections && parsed.sections.length > 0);

  return (
    <div
      className={`bg-white dark:bg-[#0c1222] border ${severityStyles.border} rounded-xl p-4 transition-all shadow-sm hover:shadow-md relative flex flex-col justify-between gap-3`}
    >
      {/* Top Header: Origem / App, Espaço e Data */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Remetente / App */}
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
            <Server className="w-3 h-3 text-indigo-500" />
            {event.senderName || 'Google Chat App'}
          </span>

          {/* Nome do Grupo / Espaço */}
          {event.spaceName && (
            <span
              className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate max-w-[180px]"
              title={event.spaceName}
            >
              • {event.spaceName}
            </span>
          )}

          {/* Badge de Severidade */}
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${severityStyles.badgeBg}`}
          >
            {severityStyles.icon}
            {severity === 'error' ? 'Erro' : severity === 'warning' ? 'Alerta' : 'Notificação'}
          </span>

          {/* Código HTTP se houver */}
          {parsed.httpCode && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 border border-rose-300 dark:border-rose-800">
              HTTP {parsed.httpCode}
            </span>
          )}
        </div>

        {/* Data e Ações Rápidas */}
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span className="inline-flex items-center gap-1" title={fullDate}>
            <Clock className="w-3 h-3 text-slate-400" />
            {timeAgo}
          </span>

          <button
            onClick={handleCopy}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Copiar texto do erro"
          >
            {isCopied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Título e Subtítulo do Card */}
      <div className="space-y-0.5">
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <span>{event.headerTitle || 'Alerta de Integração'}</span>
          {event.headerSubtitle && (
            <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
              — {event.headerSubtitle}
            </span>
          )}
        </h3>

        {/* Categoria / Campanha destacada */}
        {parsed.campaign && (
          <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
            Campanha: <span className="font-semibold text-slate-700 dark:text-slate-200">{parsed.campaign}</span>
          </p>
        )}
      </div>

      {/* Lista de Itens com Falha (ex: Distribuidores ou Empresas não processadas) */}
      {items.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <Layers className="w-3 h-3" />
            <span>
              {items.length} {items.length === 1 ? 'item afetado' : 'itens afetados'}:
            </span>
          </div>

          <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
            {items.map((it, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300"
              >
                {it.type && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                    {it.type}
                  </span>
                )}
                {it.id && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800/40">
                    ID: {it.id}
                  </span>
                )}
                {it.erp && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-800/40">
                    ERP: {it.erp}
                  </span>
                )}
                <span className="flex-1 text-slate-600 dark:text-slate-300 truncate" title={it.message}>
                  {it.message}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pares Chave-Valor / Detalhes Estruturados (Etapa, Operação, Erro, etc) */}
      {Object.keys(details).length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-xs">
          {Object.entries(details).map(([k, v], idx) => {
            const isErrorField = k.toLowerCase().includes('erro') || k.toLowerCase().includes('status');
            return (
              <div
                key={idx}
                className="p-2 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-800 flex flex-col"
              >
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{k}</span>
                <span
                  className={`font-medium truncate ${
                    isErrorField
                      ? 'text-rose-600 dark:text-rose-400 font-semibold'
                      : 'text-slate-700 dark:text-slate-200'
                  }`}
                  title={String(v)}
                >
                  {String(v)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Accordion para texto bruto / payload completo se necessário */}
      {parsed.rawText && items.length === 0 && Object.keys(details).length === 0 && (
        <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/40 border border-slate-200/60 dark:border-slate-800/60 text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap font-sans">
          {parsed.rawText}
        </div>
      )}

      {/* Bottom Bar: Status de Revisão e Botão de Ação */}
      <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2 mt-auto">
        <div className="text-[11px] text-slate-400">
          {event.isReviewed ? (
            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Revisado
              {event.reviewedAt && (
                <span className="text-slate-400 font-normal">
                  (em {format(new Date(event.reviewedAt), 'dd/MM HH:mm')})
                </span>
              )}
            </span>
          ) : (
            <span className="text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
              Pendente de revisão
            </span>
          )}
        </div>

        {/* Botão de Ação */}
        <div>
          {event.isReviewed ? (
            <button
              onClick={() => onUnreview(event)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors shadow-sm"
              title="Voltar para a lista de pendentes"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Desmarcar</span>
            </button>
          ) : (
            <button
              onClick={() => onReview(event)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm shadow-emerald-600/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
              title="Marcar este erro de integração como revisado"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Revisar</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
