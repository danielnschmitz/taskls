import React from 'react';
import { CheckCircle2, TrendingUp, Sparkles, Flame } from 'lucide-react';
import { DayData } from '../types';

interface WeekProgressProps {
  days: DayData[];
}

export const WeekProgress: React.FC<WeekProgressProps> = ({ days }) => {
  // Aggregate all tasks across the 7 days
  const allWeekTasks = days.flatMap((d) => d.tasks);
  const total = allWeekTasks.length;
  const completed = allWeekTasks.filter((t) => t.is_completed_for_date).length;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  // Find today's tasks
  const todayDay = days.find((d) => d.isToday);
  const todayTasks = todayDay ? todayDay.tasks : [];
  const todayCompleted = todayTasks.filter((t) => t.is_completed_for_date).length;
  const todayPending = todayTasks.length - todayCompleted;

  // Motivational message
  const getMotivationalMessage = () => {
    if (total === 0) return 'Nenhuma tarefa programada para esta semana.';
    if (percentage === 100) return '🎉 Incrível! Todas as tarefas da semana foram concluídas!';
    if (percentage >= 75) return '🔥 Quase lá! Você está na reta final da semana.';
    if (percentage >= 50) return '⚡ Mais da metade concluída! Excelente ritmo.';
    if (percentage >= 25) return '🚀 Bom progresso! Continue focado nas prioridades.';
    return '🌱 Começando a semana. Um passo de cada vez!';
  };

  return (
    <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 rounded-xl p-3.5 mb-4 shadow-sm transition-colors">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        
        {/* Left Stats */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500/20 to-violet-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 flex-shrink-0">
            {percentage === 100 ? (
              <Sparkles className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
            ) : percentage >= 50 ? (
              <Flame className="w-4 h-4 text-amber-500 dark:text-amber-400" />
            ) : (
              <TrendingUp className="w-4 h-4" />
            )}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-800 dark:text-white tracking-tight">
                Progresso Semanal
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                  percentage === 100
                    ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                    : 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/25'
                }`}
              >
                {percentage}%
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-medium">
              {getMotivationalMessage()}
            </p>
          </div>
        </div>

        {/* Right Counters */}
        <div className="flex items-center gap-4 text-xs font-semibold self-end sm:self-auto">
          {todayDay && (
            <div className="text-right">
              <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold block">
                Hoje
              </span>
              <span className="text-slate-700 dark:text-slate-300">
                {todayPending === 0 && todayTasks.length > 0 ? (
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">Tudo feito! ✨</span>
                ) : (
                  `${todayCompleted}/${todayTasks.length} feitas (${todayPending} pendentes)`
                )}
              </span>
            </div>
          )}

          <div className="text-right border-l border-slate-200 dark:border-slate-800 pl-4">
            <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold block">
              Total da Semana
            </span>
            <span className="text-slate-800 dark:text-white font-bold">
              {completed} <span className="text-slate-500 font-normal">/</span> {total}
            </span>
          </div>
        </div>

      </div>

      {/* Progress bar */}
      <div className="w-full bg-slate-200/80 dark:bg-slate-950/80 h-2 rounded-full mt-3 overflow-hidden border border-slate-200 dark:border-slate-800/60 p-0.5">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            percentage === 100
              ? 'bg-gradient-to-r from-emerald-500 to-teal-400 shadow-sm shadow-emerald-500/50'
              : 'bg-gradient-to-r from-indigo-500 via-violet-500 to-emerald-400 shadow-sm shadow-indigo-500/30'
          }`}
          style={{ width: `${percentage}%` }}
        ></div>
      </div>
    </div>
  );
};
