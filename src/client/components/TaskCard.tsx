import React, { useState } from 'react';
import {
  Check,
  Bell,
  Calendar,
  Repeat,
  Pencil,
  Trash2,
  Clock,
  ChevronDown,
  ChevronUp,
  CheckSquare,
  Square,
  AlarmClockOff,
} from 'lucide-react';
import { format } from 'date-fns';
import { Task, Priority, CategoryInfo } from '../types';
import { getCategoryInfo, renderCategoryIcon } from '../utils/categories';

interface TaskCardProps {
  task: Task;
  targetDate?: string;
  isCompleted?: boolean;
  categories?: CategoryInfo[];
  onToggleComplete: (task: Task, date?: string) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onToggleSubtask?: (task: Task, subtaskId: string) => void;
  onSnooze?: (task: Task, minutes: number) => void;
  onCancelSnooze?: (task: Task) => void;
  showDate?: boolean;
  showRecurrence?: boolean;
  showNotifications?: boolean;
}

const WEEKDAY_NAMES_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const PATTERN_NAMES: Record<string, string> = {
  first: '1ª',
  second: '2ª',
  third: '3ª',
  fourth: '4ª',
  last: 'Última',
};

export const TaskCard: React.FC<TaskCardProps> = ({
  task,
  targetDate,
  isCompleted: isCompletedProp,
  categories = [],
  onToggleComplete,
  onEdit,
  onDelete,
  onToggleSubtask,
  onSnooze,
  onCancelSnooze,
  showDate = false,
  showRecurrence = true,
  showNotifications = true,
}) => {
  const [showSubtasks, setShowSubtasks] = useState(false);
  const [showSnoozeMenu, setShowSnoozeMenu] = useState(false);

  const completed =
    isCompletedProp !== undefined
      ? isCompletedProp
      : task.is_completed_for_date !== undefined
      ? task.is_completed_for_date
      : task.is_completed;

  const categoryInfo = getCategoryInfo(task.category, categories);

  // Subtasks info
  const subtasks = task.subtasks || [];
  const completedSubtasksCount = subtasks.filter((s) => s.completed).length;
  const hasSubtasks = subtasks.length > 0;

  // Snooze status
  const isSnoozed =
    task.snoozed_until && new Date(task.snoozed_until) > new Date();

  // Priority styling
  const getPriorityBadge = (p: Priority) => {
    switch (p) {
      case 'urgent':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/25">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
            Urgente
          </span>
        );
      case 'high':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/25">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
            Alta
          </span>
        );
      case 'medium':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-500/15 text-indigo-400 border border-indigo-500/25">
            Média
          </span>
        );
      case 'low':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">
            Baixa
          </span>
        );
    }
  };

  // Recurrence description
  const getRecurrenceLabel = () => {
    if (task.type === 'weekly') {
      const days = (task.weekly_days || [])
        .map((d) => WEEKDAY_NAMES_SHORT[d] || '')
        .join(', ');
      return `Semanal (${days})`;
    }
    if (task.type === 'monthly') {
      if (task.monthly_type === 'day_of_month') {
        return `Todo dia ${task.monthly_day}`;
      }
      if (task.monthly_type === 'pattern') {
        const pat = PATTERN_NAMES[task.monthly_pattern || ''] || task.monthly_pattern;
        const wkd = WEEKDAY_NAMES_SHORT[task.monthly_weekday ?? 0];
        return `${pat} ${wkd} do mês`;
      }
      return 'Mensal';
    }
    if (task.type === 'once') {
      return 'Única';
    }
    return 'Sem data';
  };

  // Drag start handler
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', task.id);
    e.dataTransfer.setData('application/json', JSON.stringify(task));
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      className={`group relative rounded-xl border p-3 transition-all duration-200 cursor-grab active:cursor-grabbing ${
        completed
          ? 'bg-slate-950/40 border-slate-800/50 opacity-65 hover:opacity-90'
          : 'bg-slate-900/80 border-slate-800 hover:border-slate-700/80 hover:bg-slate-900 hover:shadow-md hover:shadow-black/40'
      }`}
    >
      {/* Quick Actions Floating Toolbar (Pinned inside top-right) */}
      <div className="absolute top-2 right-2 flex items-center gap-0.5 bg-slate-900/95 border border-slate-700/80 rounded-lg p-0.5 shadow-lg backdrop-blur-md opacity-0 group-hover:opacity-100 transition-opacity z-20">
        {/* Snooze button */}
        <div className="relative">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowSnoozeMenu(!showSnoozeMenu);
            }}
            className={`p-1 rounded-md hover:bg-slate-800 text-slate-400 hover:text-amber-300 transition-all ${
              isSnoozed ? 'text-amber-400' : ''
            }`}
            title="Adiar lembrete (Snooze)"
          >
            <Clock className="w-3.5 h-3.5" />
          </button>

          {showSnoozeMenu && (
            <div className="absolute right-0 top-full mt-1.5 w-36 bg-[#0c1222] border border-slate-700 rounded-xl shadow-2xl z-30 p-1 text-xs">
              <span className="block px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Adiar Alerta:
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSnooze?.(task, 15);
                  setShowSnoozeMenu(false);
                }}
                className="w-full text-left px-2 py-1 rounded hover:bg-slate-800 text-slate-300 text-[11px]"
              >
                + 15 minutos
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSnooze?.(task, 30);
                  setShowSnoozeMenu(false);
                }}
                className="w-full text-left px-2 py-1 rounded hover:bg-slate-800 text-slate-300 text-[11px]"
              >
                + 30 minutos
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSnooze?.(task, 60);
                  setShowSnoozeMenu(false);
                }}
                className="w-full text-left px-2 py-1 rounded hover:bg-slate-800 text-slate-300 text-[11px]"
              >
                + 1 hora
              </button>
              {isSnoozed && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onCancelSnooze?.(task);
                    setShowSnoozeMenu(false);
                  }}
                  className="w-full text-left px-2 py-1 rounded hover:bg-rose-950/40 text-rose-400 text-[11px] border-t border-slate-800 mt-1"
                >
                  Cancelar adiamento
                </button>
              )}
            </div>
          )}
        </div>

        {/* Edit */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit(task);
          }}
          className="p-1 rounded-md hover:bg-slate-800 text-slate-400 hover:text-indigo-300 transition-all"
          title="Editar tarefa"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>

        {/* Delete */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(task);
          }}
          className="p-1 rounded-md hover:bg-slate-800 text-slate-400 hover:text-rose-400 transition-all"
          title="Excluir tarefa"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex items-start gap-2.5">
        {/* Checkbox */}
        <button
          onClick={() => onToggleComplete(task, targetDate)}
          className={`mt-0.5 shrink-0 w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
            completed
              ? 'bg-emerald-600 border-emerald-500 text-white shadow-sm shadow-emerald-600/30'
              : 'border-slate-600 hover:border-indigo-400 bg-slate-950/50 text-transparent'
          }`}
          title={completed ? 'Marcar como pendente' : 'Marcar como concluída'}
        >
          <Check className={`w-3.5 h-3.5 stroke-[3] ${completed ? 'opacity-100' : 'opacity-0'}`} />
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h4
            className={`text-sm font-semibold tracking-tight leading-snug break-words ${
              completed ? 'line-through text-slate-500' : 'text-slate-100'
            }`}
          >
            {task.title}
          </h4>

          {/* Description */}
          {task.description && (
            <p
              className={`mt-1 text-xs line-clamp-2 leading-relaxed ${
                completed ? 'text-slate-600' : 'text-slate-400'
              }`}
            >
              {task.description}
            </p>
          )}

          {/* Snoozed Badge */}
          {isSnoozed && task.snoozed_until && (
            <div className="mt-1.5 flex items-center gap-1.5 text-[10px] font-bold text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-lg w-fit">
              <Clock className="w-3 h-3 text-amber-400" />
              <span>
                Adiada até {format(new Date(task.snoozed_until), 'HH:mm')}
              </span>
              <button
                onClick={() => onCancelSnooze?.(task)}
                className="hover:text-amber-100 ml-1"
                title="Cancelar adiamento"
              >
                ✕
              </button>
            </div>
          )}

          {/* Checklist / Subtasks preview */}
          {hasSubtasks && (
            <div className="mt-2 pt-1.5 border-t border-slate-800/60">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setShowSubtasks(!showSubtasks)}
                  className="flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-slate-200 transition-colors"
                >
                  {showSubtasks ? (
                    <ChevronUp className="w-3.5 h-3.5 text-indigo-400" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-indigo-400" />
                  )}
                  <span>
                    Subtarefas ({completedSubtasksCount}/{subtasks.length})
                  </span>
                </button>

                {/* Subtask Mini Bar */}
                <div className="w-16 bg-slate-800 h-1 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 rounded-full transition-all"
                    style={{
                      width: `${(completedSubtasksCount / subtasks.length) * 100}%`,
                    }}
                  ></div>
                </div>
              </div>

              {/* Subtasks Accordion */}
              {showSubtasks && (
                <div className="mt-2 space-y-1.5 pl-1">
                  {subtasks.map((sub) => (
                    <div
                      key={sub.id}
                      onClick={() => onToggleSubtask?.(task, sub.id)}
                      className="flex items-center gap-2 text-xs text-slate-300 hover:text-white cursor-pointer py-0.5"
                    >
                      <button
                        type="button"
                        className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 transition-all ${
                          sub.completed
                            ? 'bg-indigo-600 border-indigo-500 text-white'
                            : 'border-slate-600 hover:border-indigo-400'
                        }`}
                      >
                        {sub.completed && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                      </button>
                      <span
                        className={`text-[11px] leading-snug break-words ${
                          sub.completed ? 'line-through text-slate-500' : ''
                        }`}
                      >
                        {sub.title}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Metadata Badges */}
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px]">
            {/* Priority */}
            {getPriorityBadge(task.priority)}

            {/* Dynamic Category with Custom Color & Icon */}
            {task.category && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium text-[10px] border transition-all"
                style={{
                  backgroundColor: `${categoryInfo.color}15`,
                  borderColor: `${categoryInfo.color}35`,
                  color: categoryInfo.color,
                }}
              >
                {renderCategoryIcon(categoryInfo.icon, 'w-2.5 h-2.5')}
                <span>{task.category}</span>
              </span>
            )}

            {/* Recurrence / Type */}
            {showRecurrence && (
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium border ${
                  task.type === 'weekly'
                    ? 'bg-indigo-950/30 text-indigo-300 border-indigo-500/20'
                    : task.type === 'monthly'
                    ? 'bg-purple-950/30 text-purple-300 border-purple-500/20'
                    : task.type === 'once'
                    ? 'bg-cyan-950/30 text-cyan-300 border-cyan-500/20'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
              >
                {task.type === 'weekly' || task.type === 'monthly' ? (
                  <Repeat className="w-3 h-3" />
                ) : (
                  <Calendar className="w-3 h-3" />
                )}
                {getRecurrenceLabel()}
              </span>
            )}

            {/* Notifications badges */}
            {showNotifications && task.notification_times && task.notification_times.length > 0 && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20 font-medium"
                title={`Notificações configuradas: ${task.notification_times.join(', ')}`}
              >
                <Bell className="w-3 h-3 text-amber-400" />
                <span>{task.notification_times.join(', ')}</span>
              </span>
            )}
          </div>

        </div>
      </div>
    </div>
  );
};
