import React, { useState } from 'react';
import {
  CalendarDays,
  Clock,
  Repeat,
  Calendar,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { format, parseISO, isToday, isTomorrow, isPast, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Task, Priority, CategoryInfo } from '../types';
import { TaskCard } from './TaskCard';

interface UpcomingPanelProps {
  tasks: Task[];
  categories?: CategoryInfo[];
  onToggleComplete: (task: Task, date?: string) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onNewTask: () => void;
  onToggleSubtask?: (task: Task, subtaskId: string) => void;
  onSnooze?: (task: Task, minutes: number) => void;
  onCancelSnooze?: (task: Task) => void;
  searchQuery: string;
  selectedPriority: Priority | 'all';
  selectedCategory: string;
}

export const UpcomingPanel: React.FC<UpcomingPanelProps> = ({
  tasks,
  categories = [],
  onToggleComplete,
  onEdit,
  onDelete,
  onNewTask,
  onToggleSubtask,
  onSnooze,
  onCancelSnooze,
  searchQuery,
  selectedPriority,
  selectedCategory,
}) => {
  const [hideCompleted, setHideCompleted] = useState(false);

  // Filter tasks
  const filteredTasks = tasks.filter((task) => {
    if (hideCompleted && (task.is_completed || task.is_completed_for_date)) {
      return false;
    }
    if (selectedPriority !== 'all' && task.priority !== selectedPriority) {
      return false;
    }
    if (selectedCategory !== 'all' && task.category !== selectedCategory) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = task.title.toLowerCase().includes(q);
      const matchDesc = task.description?.toLowerCase().includes(q);
      const matchCat = task.category.toLowerCase().includes(q);
      if (!matchTitle && !matchDesc && !matchCat) return false;
    }
    return true;
  });

  // Format occurrence badge
  const formatOccurrenceLabel = (task: Task) => {
    const targetDateStr = task.next_occurrence || task.due_date;
    if (!targetDateStr) return { label: 'Sem data', isOverdue: false, isUrgent: false };

    try {
      const targetDate = parseISO(targetDateStr.substring(0, 10));
      if (isToday(targetDate)) {
        return { label: 'Hoje', isOverdue: false, isUrgent: true, color: 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 border-indigo-200 dark:border-indigo-500/20' };
      }
      if (isTomorrow(targetDate)) {
        return { label: 'Amanhã', isOverdue: false, isUrgent: false, color: 'text-cyan-700 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-500/10 border-cyan-200 dark:border-cyan-500/20' };
      }
      if (isPast(targetDate) && !task.is_completed) {
        return {
          label: `Atrasada (${format(targetDate, "dd 'de' MMM", { locale: ptBR })})`,
          isOverdue: true,
          isUrgent: true,
          color: 'text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/20',
        };
      }
      return {
        label: format(targetDate, "EEEE, dd 'de' MMMM", { locale: ptBR }),
        isOverdue: false,
        isUrgent: false,
        color: 'text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700',
      };
    } catch {
      return { label: targetDateStr, isOverdue: false, isUrgent: false, color: 'text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700' };
    }
  };

  return (
    <div className="bg-white dark:bg-[#0b101d] border border-slate-200 dark:border-slate-800/80 rounded-2xl p-4 lg:p-6 shadow-xl shadow-slate-200/50 dark:shadow-black/20 flex flex-col h-full transition-colors">
      {/* Panel Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-5 border-b border-slate-200 dark:border-slate-800/80">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-600 dark:text-cyan-400">
              <CalendarDays className="w-4 h-4" />
            </div>
            <h2 className="text-lg font-bold text-slate-800 dark:text-white tracking-tight">
              Agenda & Recorrentes Mensais
            </h2>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20">
              {filteredTasks.length} {filteredTasks.length === 1 ? 'tarefa' : 'tarefas'}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Tarefas de ocorrência única ou repetição mensal, organizadas cronologicamente pela data de realização.
          </p>
        </div>

        {/* Filter completed toggle */}
        <button
          onClick={() => setHideCompleted(!hideCompleted)}
          className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all ${
            hideCompleted
              ? 'bg-indigo-600/20 text-indigo-700 dark:text-indigo-300 border-indigo-500/30'
              : 'bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          {hideCompleted ? 'Exibindo apenas pendentes' : 'Ocultar concluídas'}
        </button>
      </div>

      {/* Task List */}
      <div className="mt-5 space-y-3 flex-1 overflow-y-auto max-h-[620px] pr-1">
        {filteredTasks.length === 0 ? (
          <div className="py-12 text-center flex flex-col items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-600 mb-3">
              <Calendar className="w-6 h-6" />
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 font-medium">
              Nenhuma tarefa com data ou repetição mensal encontrada.
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              Crie uma tarefa de ocorrência única ou que se repita em um dia do mês.
            </p>
            <button
              onClick={onNewTask}
              className="mt-4 px-3.5 py-1.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30 text-xs font-semibold transition-all"
            >
              + Criar Tarefa Agendada
            </button>
          </div>
        ) : (
          filteredTasks.map((task) => {
            const occurrenceInfo = formatOccurrenceLabel(task);
            const targetDateStr = task.next_occurrence || task.due_date || undefined;

            return (
              <div key={`${task.id}-${targetDateStr}`} className="space-y-1">
                {/* Date header badge above card */}
                <div className="flex items-center justify-between text-xs px-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-semibold border ${occurrenceInfo.color}`}
                    >
                      <Calendar className="w-3 h-3" />
                      {occurrenceInfo.label}
                    </span>
                    {task.type === 'monthly' && (
                      <span className="text-[10px] text-purple-600 dark:text-purple-400 font-medium flex items-center gap-1">
                        <Repeat className="w-3 h-3" />
                        Repetição mensal
                      </span>
                    )}
                  </div>
                </div>

                <TaskCard
                  task={task}
                  targetDate={targetDateStr}
                  isCompleted={task.is_completed_for_date !== undefined ? task.is_completed_for_date : task.is_completed}
                  categories={categories}
                  onToggleComplete={onToggleComplete}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onToggleSubtask={onToggleSubtask}
                  onSnooze={onSnooze}
                  onCancelSnooze={onCancelSnooze}
                  showDate={true}
                />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
