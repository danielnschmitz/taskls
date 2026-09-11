import React, { useState } from 'react';
import {
  Inbox,
  Plus,
  ArrowRight,
  Calendar,
  Sparkles,
} from 'lucide-react';
import { format } from 'date-fns';
import { Task, Priority, CategoryInfo } from '../types';
import { TaskCard } from './TaskCard';

interface BacklogPanelProps {
  tasks: Task[];
  categories?: CategoryInfo[];
  onToggleComplete: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onNewTask: () => void;
  onScheduleForToday: (task: Task) => void;
  onToggleSubtask?: (task: Task, subtaskId: string) => void;
  onSnooze?: (task: Task, minutes: number) => void;
  onCancelSnooze?: (task: Task) => void;
  searchQuery: string;
  selectedPriority: Priority | 'all';
  selectedCategory: string;
}

export const BacklogPanel: React.FC<BacklogPanelProps> = ({
  tasks,
  categories = [],
  onToggleComplete,
  onEdit,
  onDelete,
  onNewTask,
  onScheduleForToday,
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
    if (hideCompleted && task.is_completed) {
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

  return (
    <div className="bg-[#0b101d] border border-slate-800/80 rounded-2xl p-4 lg:p-6 shadow-xl shadow-black/20 flex flex-col h-full">
      {/* Panel Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-5 border-b border-slate-800/80">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Inbox className="w-4 h-4" />
            </div>
            <h2 className="text-lg font-bold text-white tracking-tight">
              Tarefas Sem Data (Backlog)
            </h2>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              {filteredTasks.length} {filteredTasks.length === 1 ? 'tarefa' : 'tarefas'}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Espaço para anotações, ideias e pendências gerais sem prazo fixo.
          </p>
        </div>

        {/* Filter completed */}
        <button
          onClick={() => setHideCompleted(!hideCompleted)}
          className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all ${
            hideCompleted
              ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/30'
              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
          }`}
        >
          {hideCompleted ? 'Exibindo apenas pendentes' : 'Ocultar concluídas'}
        </button>
      </div>

      {/* Task List */}
      <div className="mt-5 space-y-2.5 flex-1 overflow-y-auto max-h-[620px] pr-1">
        {filteredTasks.length === 0 ? (
          <div className="py-12 text-center flex flex-col items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-600 mb-3">
              <Inbox className="w-6 h-6" />
            </div>
            <p className="text-sm text-slate-400 font-medium">
              Nenhuma tarefa sem data no momento.
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Guarde ideias e afazeres que não precisam de uma data específica agora.
            </p>
            <button
              onClick={onNewTask}
              className="mt-4 px-3.5 py-1.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-xs font-semibold transition-all"
            >
              + Adicionar ao Backlog
            </button>
          </div>
        ) : (
          filteredTasks.map((task) => (
            <div key={task.id} className="relative group/card">
              <TaskCard
                task={task}
                isCompleted={task.is_completed}
                categories={categories}
                onToggleComplete={onToggleComplete}
                onEdit={onEdit}
                onDelete={onDelete}
                onToggleSubtask={onToggleSubtask}
                onSnooze={onSnooze}
                onCancelSnooze={onCancelSnooze}
              />
              {/* Quick schedule today button */}
              {!task.is_completed && (
                <div className="absolute right-12 bottom-3 opacity-0 group-hover/card:opacity-100 transition-opacity">
                  <button
                    onClick={() => onScheduleForToday(task)}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-950/60 border border-indigo-500/30 text-[10px] font-semibold text-indigo-300 hover:bg-indigo-900/80 transition-all"
                    title="Definir data para hoje"
                  >
                    <Calendar className="w-3 h-3" />
                    <span>Fazer Hoje</span>
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
