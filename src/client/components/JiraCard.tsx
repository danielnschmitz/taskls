import React from 'react';
import {
  ExternalLink,
  User,
  Layers,
  Building2,
  LayoutTemplate,
  Tag,
} from 'lucide-react';
import { JiraDemand } from '../types';

interface JiraCardProps {
  demand: JiraDemand;
}

/**
 * Retorna as classes de estilo para o badge de status com base no texto
 */
function getStatusBadgeStyle(displayStatus: string): string {
  const norm = (displayStatus || '').toLowerCase().trim();

  if (norm.includes('concluído') || norm.includes('resolvido') || norm.includes('em produção')) {
    return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
  }
  if (norm.includes('validação diária') || norm.includes('deploy hml')) {
    return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
  }
  if (norm.includes('validação histórica') || norm.includes('teste de aceitação')) {
    return 'bg-purple-500/15 text-purple-300 border-purple-500/30';
  }
  if (norm.includes('validação técnica')) {
    return 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30';
  }
  if (norm.includes('desenvolvimento')) {
    return 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30';
  }
  if (norm.includes('pronto') || norm.includes('aberto')) {
    return 'bg-sky-500/15 text-sky-300 border-sky-500/30';
  }
  if (norm.includes('deploy') || norm.includes('documentação')) {
    return 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30';
  }
  if (norm.includes('cancelado') || norm.includes('desativado')) {
    return 'bg-rose-500/15 text-rose-300 border-rose-500/30';
  }

  return 'bg-slate-800 text-slate-300 border-slate-700';
}

export const JiraCard: React.FC<JiraCardProps> = ({ demand }) => {
  const statusStyle = getStatusBadgeStyle(demand.displayStatus);

  return (
    <a
      href={demand.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group block relative p-3 rounded-xl bg-slate-900/90 border border-slate-800/90 hover:border-indigo-500/60 hover:bg-slate-850 hover:shadow-lg hover:shadow-indigo-950/20 transition-all duration-200 text-left no-underline"
      title={`Abrir ${demand.key} no Jira`}
    >
      {/* Top row: Key + Link icon & Status Badge */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs font-black tracking-wide text-indigo-400 group-hover:text-indigo-300 group-hover:underline flex items-center gap-1">
            {demand.key}
            <ExternalLink className="w-3 h-3 opacity-60 group-hover:opacity-100 transition-opacity flex-shrink-0" />
          </span>
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
      <h4 className="text-xs font-semibold text-slate-100 group-hover:text-white leading-snug line-clamp-3 mb-2.5">
        {demand.summary}
      </h4>

      {/* Capsules / Badges */}
      <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-800/60 text-[10px]">
        {/* Project Capsule */}
        <span
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-indigo-950/50 text-indigo-300 border border-indigo-500/25 font-bold"
          title={`Projeto: ${demand.project.name || demand.project.key}`}
        >
          <Tag className="w-2.5 h-2.5" />
          {demand.project.key}
        </span>

        {/* Assignee Capsule */}
        <span
          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border font-medium ${
            demand.assignee
              ? 'bg-slate-800/80 text-slate-300 border-slate-700/60'
              : 'bg-slate-900/60 text-slate-500 border-slate-800 italic'
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
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-purple-950/40 text-purple-300 border border-purple-500/30 font-medium truncate max-w-[140px]"
            title={`Épico: ${demand.epic.summary || demand.epic.key}`}
          >
            <Layers className="w-2.5 h-2.5 flex-shrink-0 text-purple-400" />
            <span className="truncate">{demand.epic.summary || demand.epic.key}</span>
          </span>
        )}

        {/* Indústria Capsule (quando houver) */}
        {demand.industry && (
          <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-teal-950/40 text-teal-300 border border-teal-500/30 font-medium truncate max-w-[130px]"
            title={`Indústria: ${demand.industry}`}
          >
            <Building2 className="w-2.5 h-2.5 flex-shrink-0 text-teal-400" />
            <span className="truncate">{demand.industry}</span>
          </span>
        )}

        {/* Layout Capsule (quando houver) */}
        {demand.layout && (
          <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-950/40 text-amber-300 border border-amber-500/30 font-medium truncate max-w-[130px]"
            title={`Layout: ${demand.layout}`}
          >
            <LayoutTemplate className="w-2.5 h-2.5 flex-shrink-0 text-amber-400" />
            <span className="truncate">{demand.layout}</span>
          </span>
        )}
      </div>
    </a>
  );
};
