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
  Search,
} from 'lucide-react';
import {
  DashboardData,
  Task,
  Priority,
  CategoryInfo,
  DndStatus,
  ModuleType,
} from './types';
import { Header } from './components/Header';
import { WeekPanel } from './components/WeekPanel';
import { UpcomingPanel } from './components/UpcomingPanel';
import { BacklogPanel } from './components/BacklogPanel';
import { TaskModal } from './components/TaskModal';
import { ConfirmModal } from './components/ConfirmModal';
import { BackupModal } from './components/BackupModal';
import { JiraWeekPanel } from './components/JiraWeekPanel';
import { JiraConfigModal } from './components/JiraConfigModal';
import { LoginScreen } from './components/LoginScreen';
import { ChangePasswordModal } from './components/ChangePasswordModal';
import { UserManagementModal } from './components/UserManagementModal';
import { CardWriterModule } from './components/CardWriterModule';
import { SettingsModule } from './components/SettingsModule';
import { useAuth } from './contexts/AuthContext';
import {
  triggerBrowserNotification,
  requestBrowserNotificationPermission,
  getNotificationPermission,
  isNotificationSupported,
  getServiceWorkerRegistration,
} from './utils/notifications';

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
  const [activeTab, setActiveTab] = useState<'all' | 'week' | 'upcoming' | 'backlog' | 'jira'>('all');

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

  // Jira integration state
  const [isJiraModalOpen, setIsJiraModalOpen] = useState(false);
  const [jiraWeekBaseDate, setJiraWeekBaseDate] = useState<Date>(new Date());
  const [jiraRefreshKey, setJiraRefreshKey] = useState(0);

  // Auth state
  const { user, isAuthenticated, isLoading: isAuthLoading, isDefaultPassword } = useAuth();
  const [isChangePasswordModalOpen, setIsChangePasswordModalOpen] = useState(false);
  const [isUserManagementModalOpen, setIsUserManagementModalOpen] = useState(false);

  // Jira permission check
  const canAccessJira = Boolean(user?.isAdmin || user?.canAccessJira);

  // Modular access checks
  const userModules = user?.allowedModules || ['tasks', 'cards'];
  const canAccessTasks = Boolean(user?.isAdmin || userModules.includes('tasks'));
  const canAccessCards = Boolean(user?.isAdmin || userModules.includes('cards'));

  const [activeModule, setActiveModule] = useState<ModuleType>(() => {
    if (canAccessTasks) return 'tasks';
    if (canAccessCards) return 'cards';
    if (user?.isAdmin) return 'settings';
    return 'tasks';
  });

  // Sync active module if user or permissions change
  useEffect(() => {
    if (activeModule === 'tasks' && !canAccessTasks) {
      if (canAccessCards) setActiveModule('cards');
      else if (user?.isAdmin) setActiveModule('settings');
    } else if (activeModule === 'cards' && !canAccessCards) {
      if (canAccessTasks) setActiveModule('tasks');
      else if (user?.isAdmin) setActiveModule('settings');
    } else if (activeModule === 'settings' && !user?.isAdmin) {
      if (canAccessTasks) setActiveModule('tasks');
      else if (canAccessCards) setActiveModule('cards');
    }
  }, [user, activeModule, canAccessTasks, canAccessCards]);

  // Handlers for Jira Week Navigation
  const handleJiraPrevWeek = () => setJiraWeekBaseDate((prev) => subWeeks(prev, 1));
  const handleJiraNextWeek = () => setJiraWeekBaseDate((prev) => addWeeks(prev, 1));
  const handleJiraToday = () => setJiraWeekBaseDate(new Date());

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
    if (!isAuthenticated || !canAccessTasks) return;
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
  }, [currentWeekBaseDate, showToast, isAuthenticated, canAccessTasks]);

  useEffect(() => {
    if (isAuthenticated && canAccessTasks) {
      fetchDashboard();
    } else {
      setIsLoading(false);
    }
  }, [fetchDashboard, isAuthenticated, canAccessTasks]);

  // Polling de Notificações do Navegador (a cada 15 segundos)
  useEffect(() => {
    if (!isAuthenticated || !canAccessTasks) return;

    // Registrar Service Worker para notificações em background
    getServiceWorkerRegistration().catch(() => {});

    // Solicitar permissão de notificação no navegador se ainda estiver em 'default'
    if (isNotificationSupported() && getNotificationPermission() === 'default') {
      requestBrowserNotificationPermission().catch(() => {});
    }

    const pollNotifications = async () => {
      try {
        const res = await fetch('/api/notifications/pending');
        if (!res.ok) return;
        const data = await res.json();
        if (data.notifications && data.notifications.length > 0) {
          for (const notif of data.notifications) {
            await triggerBrowserNotification(notif.title, { body: notif.message });
            showToast(`${notif.title}: ${notif.message}`, 'info');
          }
        }
      } catch (err) {
        // Silencioso em caso de instabilidade pontual de rede
      }
    };

    const initialTimer = setTimeout(pollNotifications, 2000);
    const interval = setInterval(pollNotifications, 15000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [isAuthenticated, canAccessTasks, showToast]);

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

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-[#070b14] flex flex-col items-center justify-center text-slate-400 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        <span className="text-xs font-semibold">Carregando TaskLS...</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col">
      {/* Top Header */}
      <Header
        activeModule={activeModule}
        onSelectModule={setActiveModule}
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
        onOpenJiraSettings={user?.isAdmin ? () => setIsJiraModalOpen(true) : undefined}
        onOpenUserManagement={user?.isAdmin ? () => setIsUserManagementModalOpen(true) : undefined}
        onOpenChangePassword={() => setIsChangePasswordModalOpen(true)}
        onShowToast={showToast}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-[1680px] w-full mx-auto px-4 lg:px-8 py-6 space-y-6">
        
        {/* Aviso de Senha Padrão */}
        {isDefaultPassword && (
          <div className="p-3.5 rounded-2xl bg-amber-950/40 border border-amber-500/30 text-amber-200 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg shadow-amber-950/10">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
              <span>
                <strong>Aviso de Segurança:</strong> Você está utilizando uma senha temporária/inicial. É obrigatório definir uma nova senha pessoal para prosseguir.
              </span>
            </div>
            <button
              onClick={() => setIsChangePasswordModalOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-bold border border-amber-500/40 text-xs transition-all flex-shrink-0"
            >
              Alterar Senha Agora
            </button>
          </div>
        )}

        {/* Módulo: Escrita de Cards */}
        {activeModule === 'cards' && canAccessCards && (
          <CardWriterModule onShowToast={showToast} />
        )}

        {/* Módulo: Configurações (Apenas Administrador) */}
        {activeModule === 'settings' && user?.isAdmin && (
          <SettingsModule onShowToast={showToast} />
        )}

        {/* Módulo: Gestão de Tarefas */}
        {activeModule === 'tasks' && canAccessTasks && (
          <>
            {/* Navigation Tabs (Seleção de Painéis) & Filtros de Tarefas */}
            <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-3.5 border-b border-slate-800 pb-3.5">
              {/* Seleção de Painéis */}
              <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-900/80 border border-slate-800 rounded-xl shadow-inner">
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

                {canAccessJira && (
                  <button
                    onClick={() => setActiveTab('jira')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      activeTab === 'jira'
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                      <path d="M11.53 2c0 2.4 1.97 4.35 4.38 4.35h2.15v2.17c0 2.4 1.97 4.35 4.39 4.35V2h-10.92zm-5.77 5.79c0 2.4 1.97 4.35 4.39 4.35h2.14v2.17c0 2.4 1.97 4.35 4.39 4.35V7.79H5.76zm-5.76 5.79c0 2.4 1.97 4.35 4.39 4.35h2.14v2.17c0 2.4 1.97 4.35 4.39 4.35v-10.87H0z"/>
                    </svg>
                    <span>Demandas Jira</span>
                  </button>
                )}
              </div>

              {/* Filtros de Tarefas (Posicionados ao lado da seleção de painéis) */}
              <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto">
                {/* Campo de Busca de Tarefas */}
                <div className="relative flex-1 sm:w-56 min-w-[170px]">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Buscar tarefas..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-7 py-1.5 text-xs bg-slate-900/90 border border-slate-700/60 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-all shadow-sm"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-200"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Filtro de Prioridade */}
                <select
                  value={selectedPriority}
                  onChange={(e) => setSelectedPriority(e.target.value as Priority | 'all')}
                  className="px-2.5 py-1.5 text-xs font-medium bg-slate-900/90 border border-slate-700/60 rounded-xl text-slate-300 focus:outline-none focus:border-indigo-500 cursor-pointer shadow-sm"
                >
                  <option value="all">Todas Prioridades</option>
                  <option value="urgent">🚨 Urgente</option>
                  <option value="high">⚠️ Alta</option>
                  <option value="medium">🔹 Média</option>
                  <option value="low">▫️ Baixa</option>
                </select>

                {/* Filtro de Categoria */}
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="px-2.5 py-1.5 text-xs font-medium bg-slate-900/90 border border-slate-700/60 rounded-xl text-slate-300 focus:outline-none focus:border-indigo-500 cursor-pointer shadow-sm"
                >
                  <option value="all">Todas Categorias</option>
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      📁 {cat}
                    </option>
                  ))}
                </select>

                {/* Botão para Limpar Filtros quando algum estiver ativo */}
                {(searchQuery || selectedPriority !== 'all' || selectedCategory !== 'all') && (
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedPriority('all');
                      setSelectedCategory('all');
                    }}
                    title="Limpar todos os filtros"
                    className="px-2.5 py-1.5 text-xs font-semibold text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 rounded-xl transition-all"
                  >
                    Limpar
                  </button>
                )}

                {/* Modo Foco Badge */}
                {focusMode && (
                  <span className="text-amber-400 font-bold flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-xl text-xs">
                    <Target className="w-3.5 h-3.5" />
                    Modo Foco Ativo
                  </span>
                )}
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

                {/* Panel 4: Jira Demands Week (Demandas Jira com Entrega na Semana) */}
                {canAccessJira && (activeTab === 'all' || activeTab === 'jira') && (
                  <section className="pt-2">
                    <JiraWeekPanel
                      key={jiraRefreshKey}
                      weekStartDate={format(startOfWeek(jiraWeekBaseDate, { weekStartsOn: 1 }), 'yyyy-MM-dd')}
                      onPrevWeek={handleJiraPrevWeek}
                      onNextWeek={handleJiraNextWeek}
                      onToday={handleJiraToday}
                      onOpenSettings={user?.isAdmin ? () => setIsJiraModalOpen(true) : undefined}
                      searchQuery={searchQuery}
                      onShowToast={showToast}
                    />
                  </section>
                )}

              </div>
            ) : null}
          </>
        )}

        {/* Sem Permissões de Módulo */}
        {!canAccessTasks && !canAccessCards && !user?.isAdmin && (
          <div className="py-24 text-center text-slate-400 bg-slate-900/30 rounded-2xl border border-slate-800 p-8">
            <p className="text-base font-semibold text-slate-200">Você não possui permissão para acessar nenhum módulo no momento.</p>
            <p className="text-xs text-slate-500 mt-2">Entre em contato com o administrador do sistema para solicitar a liberação de módulos na sua conta.</p>
          </div>
        )}

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

      {/* Jira Configuration Modal (Apenas Admin) */}
      {user?.isAdmin && (
        <JiraConfigModal
          isOpen={isJiraModalOpen}
          onClose={() => setIsJiraModalOpen(false)}
          onSaved={() => {
            setJiraRefreshKey((prev) => prev + 1);
          }}
          onShowToast={showToast}
        />
      )}

      {/* User Management Modal (Apenas Admin) */}
      {user?.isAdmin && (
        <UserManagementModal
          isOpen={isUserManagementModalOpen}
          onClose={() => setIsUserManagementModalOpen(false)}
          onShowToast={showToast}
        />
      )}

      {/* Change Password Modal (Forçado se for primeiro acesso com senha padrão) */}
      <ChangePasswordModal
        isOpen={isDefaultPassword || isChangePasswordModalOpen}
        isForced={isDefaultPassword}
        onClose={() => setIsChangePasswordModalOpen(false)}
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
