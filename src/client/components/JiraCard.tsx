import React from 'react';
import {
  ExternalLink,
  User,
  Layers,
  Building2,
  LayoutTemplate,
  Tag,
  Calendar,
  Clock,
  AlertOctagon,
} from 'lucide-react';
import { JiraDemand } from '../types';

interface JiraCardProps {
  demand: JiraDemand;
  showDueDateBadge?: boolean;
}

/**
 * Retorna as classes de estilo para o badge de status com base no texto
 */
function getStatusBadgeStyle(displayStatus: string): string {
  const norm = (displayStatus || '').toLowerCase().trim();

  if (norm.includes('concluído') || norm.includes('resolvido') || norm.includes('em produção')) {
    return 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30';
  }
  if (norm.includes('validação diária') || norm.includes('deploy hml')) {
    return 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30';
  }
  if (norm.includes('validação histórica') || norm.includes('teste de aceitação')) {
    return 'bg-purple-50 text-purple-700 border-purple-300 dark:bg-purple-500/15 dark:text-purple-300 dark:border-purple-500/30';
  }
  if (norm.includes('validação técnica')) {
    return 'bg-indigo-50 text-indigo-700 border-indigo-300 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500/30';
  }
  if (norm.includes('desenvolvimento')) {
    return 'bg-cyan-50 text-cyan-700 border-cyan-300 dark:bg-cyan-500/15 dark:text-cyan-300 dark:border-cyan-500/30';
  }
  if (norm.includes('pronto') || norm.includes('aberto')) {
    return 'bg-sky-50 text-sky-700 border-sky-300 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/30';
  }
  if (norm.includes('deploy') || norm.includes('documentação')) {
    return 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-300 dark:bg-fuchsia-500/15 dark:text-fuchsia-300 dark:border-fuchsia-500/30';
  }
  if (norm.includes('cancelado') || norm.includes('desativado')) {
    return 'bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30';
  }

  return 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
}

export const JiraCard: React.FC<JiraCardProps> = ({ demand, showDueDateBadge = false }) => {
  const statusStyle = getStatusBadgeStyle(demand.displayStatus);
  const isBlocked = Boolean(demand.isBlocked);

  // Badge relativo de data de entrega para visualização em listas (atrasadas/futuras)
  let dueDateBadge = null;
  if (showDueDateBadge && demand.duedate) {
    try {
      const [year, month, day] = demand.duedate.split('-').map(Number);
      const due = new Date(year, month - 1, day);
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const diffTime = due.getTime() - today.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

      const dateFmt = `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`;

      if (diffDays < 0) {
        const daysLate = Math.abs(diffDays);
        dueDateBadge = (
          <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-500/40 font-bold"
            title={`Prazo vencido em ${demand.duedate} (há ${daysLate} dias)`}
          >
            <Clock className="w-2.5 h-2.5 text-rose-500 dark:text-rose-400" />
            <span>{dateFmt} ({daysLate}d atrasado)</span>
          </span>
        );
      } else if (diffDays === 0) {
        dueDateBadge = (
          <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-500/40 font-bold"
            title={`Prazo para hoje (${demand.duedate})`}
          >
            <Clock className="w-2.5 h-2.5 text-amber-500 dark:text-amber-400" />
            <span>Hoje ({dateFmt})</span>
          </span>
        );
      } else {
        dueDateBadge = (
          <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 border border-sky-300 dark:border-sky-500/30 font-medium"
            title={`Prazo previsto: ${demand.duedate} (em ${diffDays} dias)`}
          >
            <Calendar className="w-2.5 h-2.5 text-sky-500 dark:text-sky-400" />
            <span>{dateFmt} (em ${diffDays}d)</span>
          </span>
        );
      }
    } catch {}
  }

  const containerClasses = isBlocked
    ? 'group block relative p-3 rounded-xl bg-red-50/70 dark:bg-red-500/15 border border-red-300 dark:border-red-500/40 hover:bg-red-50 hover:border-red-400 dark:hover:bg-red-500/20 dark:hover:border-red-400/70 shadow-sm dark:shadow-lg dark:shadow-red-950/30 ring-1 ring-red-300/50 dark:ring-red-500/25 transition-all duration-200 text-left no-underline'
    : 'group block relative p-3 rounded-xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800/90 hover:border-indigo-400 hover:bg-slate-50/80 dark:hover:border-indigo-500/60 dark:hover:bg-slate-800/80 shadow-sm dark:shadow-none hover:shadow-md dark:hover:shadow-indigo-950/20 transition-all duration-200 text-left no-underline';

  return (
    <a
      href={demand.url}
      target="_blank"
      rel="noopener noreferrer"
      className={containerClasses}
      title={isBlocked ? `[BLOQUEADO] ${demand.key}: ${demand.summary}` : `Abrir ${demand.key} no Jira`}
    >
      {/* Top row: Key + Link icon & Status Badge */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className={`text-xs font-black tracking-wide flex items-center gap-1 ${
              isBlocked
                ? 'text-red-600 dark:text-red-300 group-hover:text-red-700 dark:group-hover:text-red-200 group-hover:underline'
                : 'text-indigo-600 dark:text-indigo-400 group-hover:text-indigo-700 dark:group-hover:text-indigo-300 group-hover:underline'
            }`}
          >
            {demand.key}
            <ExternalLink className="w-3 h-3 opacity-60 group-hover:opacity-100 transition-opacity flex-shrink-0" />
          </span>

          {isBlocked && (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-red-100 dark:bg-red-500/25 text-red-700 dark:text-red-200 border border-red-200 dark:border-red-500/40 text-[9px] font-black uppercase tracking-wider shadow-sm flex-shrink-0"
              title={`Demanda com impedimento / bloqueio: ${demand.blockedReason || 'Impediment'}`}
            >
              <AlertOctagon className="w-2.5 h-2.5 text-red-500 dark:text-red-300 flex-shrink-0" />
              <span>Bloqueado</span>
            </span>
          )}
        </div>

        {/* Status Capsule */}
        <span
          className={`px-2 py-0.5 rounded-full text-[10px] font-bold tracking-tight border flex-shrink-0 ${statusStyle}`}
          title={`Status no Jira: ${demand.rawStatus}`}
        >
          {demand.displayStatus}
        </span>
      </div>

      {/* Card Title / Summary */}
      <h4
        className={`text-xs font-semibold leading-snug line-clamp-3 mb-2.5 ${
          isBlocked
            ? 'text-red-900 group-hover:text-red-950 dark:text-red-50 dark:group-hover:text-white'
            : 'text-slate-800 group-hover:text-slate-950 dark:text-slate-100 dark:group-hover:text-white'
        }`}
      >
        {demand.summary}
      </h4>

      {/* Capsules / Badges */}
      <div
        className={`flex flex-wrap items-center gap-1.5 pt-2 border-t text-[10px] ${
          isBlocked ? 'border-red-200 dark:border-red-500/25' : 'border-slate-100 dark:border-slate-800/60'
        }`}
      >
        {/* Due Date Capsule (se aplicável) */}
        {dueDateBadge}

        {/* Project Capsule */}
        <span
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/25 font-bold"
          title={`Projeto: ${demand.project.name || demand.project.key}`}
        >
          <Tag className="w-2.5 h-2.5" />
          {demand.project.key}
        </span>

        {/* Assignee Capsule */}
        <span
          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border font-medium ${
            demand.assignee
              ? 'bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700/60'
              : 'bg-slate-100/60 dark:bg-slate-900/60 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-800 italic'
          }`}
          title={`Responsável: ${demand.assignee?.displayName || 'Não atribuído'}`}
        >
          {demand.assignee?.avatarUrl ? (
            <img
              src={demand.assignee.avatarUrl}
              alt=""
              className="w-3 h-3 rounded-full object-cover"
            />
          ) : (
            <User className="w-2.5 h-2.5" />
          )}
          <span className="truncate max-w-[110px]">
            {demand.assignee ? demand.assignee.displayName.split(' ')[0] : 'Não atribuído'}
          </span>
        </span>

        {/* Epic Capsule (quando houver) */}
        {demand.epic && (
          <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-500/30 font-medium truncate max-w-[140px]"
            title={`Épico: ${demand.epic.summary || demand.epic.key}`}
          >
            <Layers className="w-2.5 h-2.5 flex-shrink-0 text-purple-500 dark:text-purple-400" />
            <span className="truncate">{demand.epic.summary || demand.epic.key}</span>
          </span>
        )}

        {/* Indústria Capsule (quando houver) */}
        {demand.industry && (
          <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-500/30 font-medium truncate max-w-[130px]"
            title={`Indústria: ${demand.industry}`}
          >
            <Building2 className="w-2.5 h-2.5 flex-shrink-0 text-teal-500 dark:text-teal-400" />
            <span className="truncate">{demand.industry}</span>
          </span>
        )}

        {/* Layout Capsule (quando houver) */}
        {demand.layout && (
          <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30 font-medium truncate max-w-[130px]"
            title={`Layout: ${demand.layout}`}
          >
            <LayoutTemplate className="w-2.5 h-2.5 flex-shrink-0 text-amber-500 dark:text-amber-400" />
            <span className="truncate">{demand.layout}</span>
          </span>
        )}
      </div>
    </a>
  );
};
