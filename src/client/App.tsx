import React, { useState, useEffect, useCallback } from 'react';
import {
  format,
  addWeeks,
  subWeeks,
  startOfWeek,
  parseISO,
} from 'date-fns';
import {
  Calendar,
  CalendarDays,
  Inbox,
  LayoutGrid,
  CheckCircle2,
  AlertCircle,
  Info,
  X,
  Loader2,
  Target,
} from 'lucide-react';
import {
  DashboardData,
  Task,
  Priority,
  CategoryInfo,
  DndStatus,
} from './types';
import { Header } from './components/Header';
import { WeekPanel } from './components/WeekPanel';
import { UpcomingPanel } from './components/UpcomingPanel';
import { BacklogPanel } from './components/BacklogPanel';
import { TaskModal } from './components/TaskModal';
import { ConfirmModal } from './components/ConfirmModal';
import { BackupModal } from './components/BackupModal';

interface ToastState {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

export const App: React.FC = () => {
  // Navigation state
  const [currentWeekBaseDate, setCurrentWeekBaseDate] = useState<Date>(new Date());
  
  // Dashboard data
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPriority, setSelectedPriority] = useState<Priority | 'all'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'all' | 'week' | 'upcoming' | 'backlog'>('all');

  // Focus mode
  const [focusMode, setFocusMode] = useState(false);

  // Modal states
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [defaultDayOfWeek, setDefaultDayOfWeek] = useState<number | undefined>(undefined);
  const [defaultDate, setDefaultDate] = useState<string | undefined>(undefined);

  // Deletion modal state
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);

  // Backup modal state
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);

  // Toast notifications
  const [toasts, setToasts] = useState<ToastState[]>([]);

  const showToast = useCallback(
    (message: string, type: 'success' | 'error' | 'info' = 'info') => {
      const id = Math.random().toString(36).substring(2, 9);
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    },
    []
  );

  // Fetch dashboard data
  const fetchDashboard = useCallback(async () => {
    try {
      const weekStartStr = format(
        startOfWeek(currentWeekBaseDate, { weekStartsOn: 1 }),
        'yyyy-MM-dd'
      );
      const res = await fetch(`/api/tasks/dashboard?weekStart=${weekStartStr}`);
      if (!res.ok) throw new Error('Falha ao obter tarefas');
      const data: DashboardData = await res.json();
      setDashboardData(data);
    } catch (err) {
      console.error(err);
      showToast('Erro ao carregar dados do painel', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [currentWeekBaseDate, showToast]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  // Extract list of all tasks
  const allTasksList = dashboardData
    ? [
        ...dashboardData.week.days.flatMap((d) => d.tasks),
        ...dashboardData.upcoming,
        ...dashboardData.backlog,
      ]
    : [];

  const categories = Array.from(
    new Set(allTasksList.map((t) => t.category).filter(Boolean))
  ).sort();

  const categoriesInfo = dashboardData?.categories || [];

  // Handlers for Week Navigation
  const handlePrevWeek = () => {
    setCurrentWeekBaseDate((prev) => subWeeks(prev, 1));
  };

  const handleNextWeek = () => {
    setCurrentWeekBaseDate((prev) => addWeeks(prev, 1));
  };

  const handleToday = () => {
    setCurrentWeekBaseDate(new Date());
  };

  // Toggle Completion Handler
  const handleToggleComplete = async (task: Task, date?: string) => {
    try {
      const res = await fetch(`/api/tasks/${task.id}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(
          data.isCompleted ? 'Tarefa marcada como concluída!' : 'Tarefa marcada como pendente.',
          'success'
        );
        fetchDashboard();
      }
    } catch (err) {
      showToast('Erro ao atualizar status da tarefa', 'error');
    }
  };

  // Toggle Subtask Handler
  const handleToggleSubtask = async (task: Task, subtaskId: string) => {
    const currentSubtasks = task.subtasks || [];
    const updatedSubtasks = currentSubtasks.map((s) =>
      s.id === subtaskId ? { ...s, completed: !s.completed } : s
    );

    try {
      const res = await fetch(`/api/tasks/${task.id}/subtasks`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subtasks: updatedSubtasks }),
      });
      if (res.ok) {
        fetchDashboard();
      }
    } catch (err) {
      showToast('Erro ao atualizar subtarefa', 'error');
    }
  };

  // Snooze Handler
  const handleSnooze = async (task: Task, minutes: number) => {
    try {
      const res = await fetch(`/api/tasks/${task.id}/snooze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minutes }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Lembrete adiado em +${minutes} minutos.`, 'info');
        fetchDashboard();
      }
    } catch (err) {
      showToast('Erro ao adiar lembrete', 'error');
    }
  };

  const handleCancelSnooze = async (task: Task) => {
    try {
      const res = await fetch(`/api/tasks/${task.id}/snooze`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        showToast('Adiamento cancelado.', 'info');
        fetchDashboard();
      }
    } catch (err) {
      showToast('Erro ao cancelar adiamento', 'error');
    }
  };

  // DND Toggle Handler
  const handleToggleDnd = async (enabled: boolean, minutes?: number) => {
    try {
      const res = await fetch('/api/system/dnd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, minutes }),
      });
      const data = await res.json();
      showToast(
        enabled
          ? minutes
            ? `Modo Não Perturbe ativado por ${minutes} minutos.`
            : 'Modo Não Perturbe ativado.'
          : 'Notificações sonoras reativadas.',
        'info'
      );
      fetchDashboard();
    } catch (err) {
      showToast('Erro ao alterar modo Não Perturbe', 'error');
    }
  };

  // Drag & Drop Handler (Drop task on a day)
  const handleDropTaskOnDay = async (
    task: Task,
    targetDayOfWeek: number,
    targetDateStr: string
  ) => {
    try {
      let updatePayload: any = {};

      if (task.type === 'weekly') {
        // Assign to dropped weekday
        const existingDays = task.weekly_days || [];
        const newDays = Array.from(new Set([...existingDays, targetDayOfWeek]));
        updatePayload = { weekly_days: newDays };
      } else {
        // Backlog or once -> schedule for dropped date
        updatePayload = {
          type: 'once',
          due_date: targetDateStr,
        };
      }

      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatePayload),
      });

      if (res.ok) {
        showToast(`Tarefa agendada para ${targetDateStr}!`, 'success');
        fetchDashboard();
      }
    } catch (err) {
      showToast('Erro ao reagendar tarefa arrastada', 'error');
    }
  };

  // Create or Update Task Handler
  const handleSaveTask = async (taskData: any) => {
    if (editingTask) {
      // Update
      const res = await fetch(`/api/tasks/${editingTask.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(taskData),
      });
      if (!res.ok) throw new Error('Falha ao atualizar tarefa');
      showToast('Tarefa atualizada com sucesso!', 'success');
    } else {
      // Create
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(taskData),
      });
      if (!res.ok) throw new Error('Falha ao criar tarefa');
      showToast('Tarefa criada com sucesso!', 'success');
    }
    fetchDashboard();
  };

  // Delete Task Handler
  const handleConfirmDelete = async () => {
    if (!taskToDelete) return;
    try {
      const res = await fetch(`/api/tasks/${taskToDelete.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Falha ao excluir');
      showToast('Tarefa excluída com sucesso!', 'success');
      setTaskToDelete(null);
      fetchDashboard();
    } catch (err) {
      showToast('Erro ao excluir tarefa', 'error');
    }
  };

  // Quick action: Schedule Backlog task for Today
  const handleScheduleForToday = async (task: Task) => {
    try {
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'once',
          due_date: todayStr,
        }),
      });
      if (!res.ok) throw new Error('Falha ao reagendar');
      showToast('Tarefa agendada para hoje!', 'success');
      fetchDashboard();
    } catch (err) {
      showToast('Erro ao agendar tarefa', 'error');
    }
  };

  // Modal open helpers
  const handleOpenNewTask = () => {
    setEditingTask(null);
    setDefaultDayOfWeek(undefined);
    setDefaultDate(undefined);
    setIsTaskModalOpen(true);
  };

  const handleEditTask = (task: Task) => {
    setEditingTask(task);
    setDefaultDayOfWeek(undefined);
    setDefaultDate(undefined);
    setIsTaskModalOpen(true);
  };

  const handleAddTaskForDay = (dayOfWeek: number, dateStr: string) => {
    setEditingTask(null);
    setDefaultDayOfWeek(dayOfWeek);
    setDefaultDate(dateStr);
    setIsTaskModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col">
      {/* Top Header */}
      <Header
        onNewTask={handleOpenNewTask}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedPriority={selectedPriority}
        onPriorityChange={setSelectedPriority}
        selectedCategory={selectedCategory}
        onCategoryChange={setSelectedCategory}
        categories={categories}
        categoriesInfo={categoriesInfo}
        allTasks={allTasksList}
        dndStatus={dashboardData?.dnd}
        onToggleDnd={handleToggleDnd}
        focusMode={focusMode}
        onToggleFocusMode={() => setFocusMode(!focusMode)}
        onOpenBackupModal={() => setIsBackupModalOpen(true)}
        onShowToast={showToast}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-[1680px] w-full mx-auto px-4 lg:px-8 py-6 space-y-6">
        
        {/* Navigation Tabs (Quick focus) */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-1.5 p-1 bg-slate-900/80 border border-slate-800 rounded-xl">
            <button
              onClick={() => setActiveTab('all')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'all'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Todos os Painéis</span>
            </button>

            <button
              onClick={() => setActiveTab('week')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'week'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Semana Atual</span>
            </button>

            <button
              onClick={() => setActiveTab('upcoming')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'upcoming'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <CalendarDays className="w-3.5 h-3.5" />
              <span>Agenda & Mensais</span>
            </button>

            <button
              onClick={() => setActiveTab('backlog')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'backlog'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Inbox className="w-3.5 h-3.5" />
              <span>Backlog</span>
            </button>
          </div>

          <div className="flex items-center gap-4 text-xs text-slate-400">
            {focusMode && (
              <span className="text-amber-400 font-bold flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-lg">
                <Target className="w-3.5 h-3.5" />
                Modo Foco Ativo
              </span>
            )}
            <div className="hidden sm:flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
              <span>PostgreSQL Conectado</span>
            </div>
          </div>
        </div>

        {/* Loading Spinner */}
        {isLoading && !dashboardData ? (
          <div className="py-24 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
            <p className="text-sm text-slate-400 font-medium">Carregando painéis do TaskLS...</p>
          </div>
        ) : dashboardData ? (
          <div className="space-y-6">
            
            {/* Panel 1: Current Week (Semana Atual) */}
            {(activeTab === 'all' || activeTab === 'week') && (
              <section>
                <WeekPanel
                  days={dashboardData.week.days}
                  weekStartDate={dashboardData.week.startDate}
                  weekEndDate={dashboardData.week.endDate}
                  categories={categoriesInfo}
                  focusMode={focusMode}
                  onToggleFocusMode={() => setFocusMode(!focusMode)}
                  onPrevWeek={handlePrevWeek}
                  onNextWeek={handleNextWeek}
                  onToday={handleToday}
                  onToggleComplete={handleToggleComplete}
                  onEdit={handleEditTask}
                  onDelete={(task) => setTaskToDelete(task)}
                  onAddTaskForDay={handleAddTaskForDay}
                  onToggleSubtask={handleToggleSubtask}
                  onSnooze={handleSnooze}
                  onCancelSnooze={handleCancelSnooze}
                  onDropTaskOnDay={handleDropTaskOnDay}
                  searchQuery={searchQuery}
                  selectedPriority={selectedPriority}
                  selectedCategory={selectedCategory}
                />
              </section>
            )}

            {/* Split Panels: Panel 2 & Panel 3 */}
            {(activeTab === 'all' || activeTab === 'upcoming' || activeTab === 'backlog') && (
              <div
                className={`grid gap-6 ${
                  activeTab === 'all'
                    ? 'grid-cols-1 lg:grid-cols-12'
                    : 'grid-cols-1'
                }`}
              >
                {/* Panel 2: Single & Monthly Tasks */}
                {(activeTab === 'all' || activeTab === 'upcoming') && (
                  <section className={activeTab === 'all' ? 'lg:col-span-7' : 'w-full'}>
                    <UpcomingPanel
                      tasks={dashboardData.upcoming}
                      categories={categoriesInfo}
                      onToggleComplete={handleToggleComplete}
                      onEdit={handleEditTask}
                      onDelete={(task) => setTaskToDelete(task)}
                      onNewTask={handleOpenNewTask}
                      onToggleSubtask={handleToggleSubtask}
                      onSnooze={handleSnooze}
                      onCancelSnooze={handleCancelSnooze}
                      searchQuery={searchQuery}
                      selectedPriority={selectedPriority}
                      selectedCategory={selectedCategory}
                    />
                  </section>
                )}

                {/* Panel 3: Backlog (Tarefas Sem Data) */}
                {(activeTab === 'all' || activeTab === 'backlog') && (
                  <section className={activeTab === 'all' ? 'lg:col-span-5' : 'w-full'}>
                    <BacklogPanel
                      tasks={dashboardData.backlog}
                      categories={categoriesInfo}
                      onToggleComplete={handleToggleComplete}
                      onEdit={handleEditTask}
                      onDelete={(task) => setTaskToDelete(task)}
                      onNewTask={handleOpenNewTask}
                      onScheduleForToday={handleScheduleForToday}
                      onToggleSubtask={handleToggleSubtask}
                      onSnooze={handleSnooze}
                      onCancelSnooze={handleCancelSnooze}
                      searchQuery={searchQuery}
                      selectedPriority={selectedPriority}
                      selectedCategory={selectedCategory}
                    />
                  </section>
                )}
              </div>
            )}

          </div>
        ) : null}

      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-[#090d16] py-4 px-6 text-center text-xs text-slate-500">
        <p>
          TaskLS &bull; Gestão de Tarefas & Notificações Windows &bull; PostgreSQL 18
        </p>
      </footer>

      {/* Task Creation & Edit Modal */}
      <TaskModal
        isOpen={isTaskModalOpen}
        onClose={() => setIsTaskModalOpen(false)}
        onSave={handleSaveTask}
        initialData={editingTask}
        defaultDayOfWeek={defaultDayOfWeek}
        defaultDate={defaultDate}
        categories={categoriesInfo}
      />

      {/* Deletion Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(taskToDelete)}
        title="Excluir Tarefa"
        message={`Deseja realmente excluir a tarefa "${taskToDelete?.title}"? Esta ação não pode ser desfeita.`}
        onConfirm={handleConfirmDelete}
        onCancel={() => setTaskToDelete(null)}
      />

      {/* 1-Click Backup, Export & Restore Modal */}
      <BackupModal
        isOpen={isBackupModalOpen}
        onClose={() => setIsBackupModalOpen(false)}
        onSuccess={fetchDashboard}
        onShowToast={showToast}
      />

      {/* Toast Notifications Container */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto p-3.5 rounded-xl border shadow-xl flex items-center justify-between gap-3 text-xs font-semibold backdrop-blur-md transition-all animate-in slide-in-from-bottom-3 ${
              toast.type === 'success'
                ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-200'
                : toast.type === 'error'
                ? 'bg-rose-950/90 border-rose-500/40 text-rose-200'
                : 'bg-indigo-950/90 border-indigo-500/40 text-indigo-200'
            }`}
          >
            <div className="flex items-center gap-2">
              {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />}
              {toast.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />}
              {toast.type === 'info' && <Info className="w-4 h-4 text-indigo-400 flex-shrink-0" />}
              <span>{toast.message}</span>
            </div>
            <button
              onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
              className="text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
