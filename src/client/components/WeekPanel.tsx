import React, { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Plus,
  Target,
  Sparkles,
  Zap,
} from 'lucide-react';
import { DayData, Task, Priority, CategoryInfo } from '../types';
import { TaskCard } from './TaskCard';
import { WeekProgress } from './WeekProgress';

interface WeekPanelProps {
  days: DayData[];
  weekStartDate: string;
  weekEndDate: string;
  categories?: CategoryInfo[];
  focusMode?: boolean;
  onToggleFocusMode?: () => void;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onToday: () => void;
  onToggleComplete: (task: Task, date?: string) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onAddTaskForDay: (dayOfWeek: number, dateStr: string) => void;
  onToggleSubtask?: (task: Task, subtaskId: string) => void;
  onSnooze?: (task: Task, minutes: number) => void;
  onCancelSnooze?: (task: Task) => void;
  onDropTaskOnDay?: (task: Task, targetDayOfWeek: number, targetDateStr: string) => void;
  searchQuery: string;
  selectedPriority: Priority | 'all';
  selectedCategory: string;
}

export const WeekPanel: React.FC<WeekPanelProps> = ({
  days,
  weekStartDate,
  weekEndDate,
  categories = [],
  focusMode = false,
  onToggleFocusMode,
  onPrevWeek,
  onNextWeek,
  onToday,
  onToggleComplete,
  onEdit,
  onDelete,
  onAddTaskForDay,
  onToggleSubtask,
  onSnooze,
  onCancelSnooze,
  onDropTaskOnDay,
  searchQuery,
  selectedPriority,
  selectedCategory,
}) => {
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);

  // Format date interval for display
  const formatInterval = () => {
    if (!weekStartDate || !weekEndDate) return '';
    try {
      const [startYear, startMonth, startDay] = weekStartDate.split('-');
      const [endYear, endMonth, endDay] = weekEndDate.split('-');
      return `${startDay}/${startMonth} a ${endDay}/${endMonth}/${endYear}`;
    } catch {
      return `${weekStartDate} - ${weekEndDate}`;
    }
  };

  // Filter tasks
  const filterTask = (task: Task) => {
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
  };

  // Drag & Drop handlers
  const handleDragOver = (e: React.DragEvent, dateStr: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverDay !== dateStr) {
      setDragOverDay(dateStr);
    }
  };

  const handleDragLeave = (e: React.DragEvent, dateStr: string) => {
    if (dragOverDay === dateStr) {
      setDragOverDay(null);
    }
  };

  const handleDrop = (e: React.DragEvent, dayOfWeek: number, dateStr: string) => {
    e.preventDefault();
    setDragOverDay(null);
    const json = e.dataTransfer.getData('application/json');
    if (!json) return;

    try {
      const task: Task = JSON.parse(json);
      onDropTaskOnDay?.(task, dayOfWeek, dateStr);
    } catch (err) {
      console.error('Falha ao processar drop de tarefa:', err);
    }
  };

  // Days to show: if focusMode, prioritize today
  const displayedDays = focusMode
    ? days.filter((d) => d.isToday)
    : days;

  return (
    <div className="bg-[#0b101d] border border-slate-800/80 rounded-2xl p-4 lg:p-6 shadow-xl shadow-black/20">
      
      {/* Week Progress Bar Component */}
      <WeekProgress days={days} />

      {/* Panel Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-5 border-b border-slate-800/80">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <CalendarIcon className="w-4 h-4" />
            </div>
            <h2 className="text-lg font-bold text-white tracking-tight">Semana Atual</h2>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              Tarefas Semanais & Calendário
            </span>
            {focusMode && (
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1 animate-pulse">
                <Target className="w-3 h-3" />
                Modo Foco Ativo
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Arraste e solte tarefas diretamente nos dias para agendá-las.
          </p>
        </div>

        {/* Navigation Controls & Focus Mode Toggle */}
        <div className="flex items-center gap-2 self-end sm:self-auto">
          {/* Focus mode toggle */}
          <button
            onClick={onToggleFocusMode}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
              focusMode
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-300 shadow-sm shadow-amber-500/20'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
            title="Modo Foco: exibir apenas o dia de hoje"
          >
            <Target className="w-3.5 h-3.5" />
            <span>{focusMode ? 'Ver Semana Completa' : 'Modo Foco (Hoje)'}</span>
          </button>

          <span className="text-xs font-medium text-slate-400 mr-2 hidden md:inline">
            {formatInterval()}
          </span>

          <button
            onClick={onPrevWeek}
            className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
            title="Semana Anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <button
            onClick={onToday}
            className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white text-xs font-semibold hover:bg-slate-800 transition-all"
          >
            Hoje
          </button>

          <button
            onClick={onNextWeek}
            className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
            title="Próxima Semana"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 7 Day Columns Grid (or 1 expanded column in Focus Mode) */}
      <div className="mt-5 overflow-x-auto pb-3 custom-scrollbar">
        <div
          className={`grid gap-3 transition-all ${
            focusMode
              ? 'grid-cols-1 max-w-2xl mx-auto'
              : 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-7 min-w-[1050px] xl:min-w-0'
          }`}
        >
          {displayedDays.map((day) => {
            const filteredTasks = day.tasks.filter(filterTask);
            const completedCount = filteredTasks.filter(
              (t) => t.is_completed_for_date
            ).length;

            const isOver = dragOverDay === day.date;

            return (
              <div
                key={day.date}
                onDragOver={(e) => handleDragOver(e, day.date)}
                onDragLeave={(e) => handleDragLeave(e, day.date)}
                onDrop={(e) => handleDrop(e, day.dayOfWeek, day.date)}
                className={`flex flex-col rounded-xl border transition-all duration-200 min-w-0 ${
                  isOver
                    ? 'bg-indigo-950/40 border-indigo-400 ring-2 ring-indigo-500/50 scale-[1.01]'
                    : day.isToday
                    ? 'bg-slate-900/90 border-indigo-500/50 ring-1 ring-indigo-500/30 shadow-lg shadow-indigo-950/20'
                    : 'bg-slate-950/50 border-slate-800/80 hover:border-slate-700/60'
                }`}
              >
              {/* Day Column Header */}
              <div
                className={`p-3 border-b flex items-center justify-between ${
                  day.isToday
                    ? 'border-indigo-500/30 bg-indigo-950/20'
                    : 'border-slate-800/80 bg-slate-900/40'
                }`}
              >
                <div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`text-xs font-bold tracking-tight ${
                        day.isToday ? 'text-indigo-400' : 'text-slate-300'
                      }`}
                    >
                      {day.dayName}
                    </span>
                    {day.isToday && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-indigo-600 text-white shadow-sm">
                        Hoje
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] font-medium text-slate-500">
                    {day.dayNumber} de {day.monthName}
                  </span>
                </div>

                {/* Counter */}
                <span
                  className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                    filteredTasks.length > 0
                      ? day.isToday
                        ? 'bg-indigo-500/20 text-indigo-300'
                        : 'bg-slate-800 text-slate-400'
                      : 'text-slate-600'
                  }`}
                >
                  {filteredTasks.length > 0
                    ? `${completedCount}/${filteredTasks.length}`
                    : '0'}
                </span>
              </div>

              {/* Tasks List */}
              <div className="p-2.5 flex-1 flex flex-col gap-2 min-h-[160px]">
                {isOver && (
                  <div className="p-3 border-2 border-dashed border-indigo-400 rounded-xl bg-indigo-950/30 text-indigo-300 text-center text-xs font-bold animate-pulse">
                    Solte aqui para agendar em {day.dayName}!
                  </div>
                )}

                {filteredTasks.length === 0 && !isOver ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-3">
                    <p className="text-[11px] text-slate-600 font-medium">
                      Sem tarefas programadas
                    </p>
                    <span className="text-[10px] text-slate-600 mt-0.5">
                      Arraste uma tarefa ou adicione abaixo
                    </span>
                  </div>
                ) : (
                  filteredTasks.map((task) => (
                    <TaskCard
                      key={`${task.id}-${day.date}`}
                      task={task}
                      targetDate={day.date}
                      isCompleted={task.is_completed_for_date}
                      categories={categories}
                      onToggleComplete={onToggleComplete}
                      onEdit={onEdit}
                      onDelete={onDelete}
                      onToggleSubtask={onToggleSubtask}
                      onSnooze={onSnooze}
                      onCancelSnooze={onCancelSnooze}
                      showRecurrence={false}
                      showNotifications={false}
                    />
                  ))
                )}
              </div>

              {/* Quick Add for this day */}
              <div className="p-2 pt-0">
                <button
                  onClick={() => onAddTaskForDay(day.dayOfWeek, day.date)}
                  className="w-full py-1.5 px-2 rounded-lg border border-dashed border-slate-800 hover:border-indigo-500/50 hover:bg-indigo-950/20 text-slate-500 hover:text-indigo-300 text-[11px] font-medium flex items-center justify-center gap-1 transition-all"
                >
                  <Plus className="w-3 h-3" />
                  <span>Adicionar</span>
                </button>
              </div>
            </div>
          );
        })}
        </div>
      </div>
    </div>
  );
};
