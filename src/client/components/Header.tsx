import React, { useState, useEffect } from 'react';
import {
  Plus,
  Bell,
  BellOff,
  Search,
  CheckCircle2,
  Power,
  Target,
  Database,
  Loader2,
  ChevronDown,
  Clock,
} from 'lucide-react';
import { Priority, Task, DndStatus, CategoryInfo } from '../types';
import { PomodoroTimer } from './PomodoroTimer';

interface HeaderProps {
  onNewTask: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  selectedPriority: Priority | 'all';
  onPriorityChange: (p: Priority | 'all') => void;
  selectedCategory: string;
  onCategoryChange: (c: string) => void;
  categories: string[];
  categoriesInfo?: CategoryInfo[];
  allTasks: Task[];
  dndStatus?: DndStatus;
  onToggleDnd: (enabled: boolean, minutes?: number) => void;
  focusMode: boolean;
  onToggleFocusMode: () => void;
  onOpenBackupModal: () => void;
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const Header: React.FC<HeaderProps> = ({
  onNewTask,
  searchQuery,
  onSearchChange,
  selectedPriority,
  onPriorityChange,
  selectedCategory,
  onCategoryChange,
  categories,
  categoriesInfo = [],
  allTasks,
  dndStatus,
  onToggleDnd,
  focusMode,
  onToggleFocusMode,
  onOpenBackupModal,
  onShowToast,
}) => {
  const [autostartEnabled, setAutostartEnabled] = useState(false);
  const [isTogglingAutostart, setIsTogglingAutostart] = useState(false);
  const [isTestingNotif, setIsTestingNotif] = useState(false);
  const [showDndMenu, setShowDndMenu] = useState(false);

  // Fetch autostart status
  useEffect(() => {
    fetch('/api/system/autostart')
      .then((res) => res.json())
      .then((data) => setAutostartEnabled(Boolean(data.enabled)))
      .catch((err) => console.error('Erro ao buscar autostart:', err));
  }, []);

  const handleToggleAutostart = async () => {
    setIsTogglingAutostart(true);
    const targetState = !autostartEnabled;
    try {
      const res = await fetch('/api/system/autostart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: targetState }),
      });
      const data = await res.json();
      setAutostartEnabled(data.enabled);
      onShowToast(
        data.enabled
          ? 'TaskLS configurado para iniciar junto com o Windows!'
          : 'Inicialização com o Windows desativada.',
        'success'
      );
    } catch (err) {
      onShowToast('Falha ao configurar inicialização com o Windows', 'error');
    } finally {
      setIsTogglingAutostart(false);
    }
  };

  const handleTestNotification = async () => {
    if (dndStatus?.enabled) {
      onShowToast('Modo Não Perturbe está ativado. Desative para ouvir notificações.', 'info');
    }
    setIsTestingNotif(true);
    try {
      const res = await fetch('/api/notifications/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'TaskLS - Notificação de Teste',
          message: 'Notificação do Windows disparada com sucesso!',
        }),
      });
      const data = await res.json();
      if (data.success) {
        onShowToast('Notificação do Windows enviada com sucesso!', 'success');
      } else {
        onShowToast('A notificação pode estar bloqueada nas configurações do Windows.', 'info');
      }
    } catch (err) {
      onShowToast('Erro ao disparar notificação de teste', 'error');
    } finally {
      setIsTestingNotif(false);
    }
  };

  const isDndActive = Boolean(dndStatus?.enabled);

  return (
    <header className="sticky top-0 z-30 bg-[#0c1222]/95 backdrop-blur-md border-b border-slate-800/80 px-4 lg:px-8 py-3 transition-all">
      <div className="max-w-[1680px] mx-auto flex flex-col xl:flex-row items-center justify-between gap-3.5">
        
        {/* Brand Logo & Title */}
        <div className="flex items-center gap-3 w-full xl:w-auto justify-between xl:justify-start">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/25 ring-1 ring-white/20">
              <CheckCircle2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-100 to-slate-400">
                  TaskLS
                </span>
                <span className="px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  Pro Edition
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium">Gestão Inteligente de Tarefas</p>
            </div>
          </div>

          {/* Quick Mobile Action */}
          <button
            onClick={onNewTask}
            className="xl:hidden flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/30 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Nova</span>
          </button>
        </div>

        {/* Search & Filters */}
        <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto flex-1 max-w-2xl justify-center">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[180px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar tarefas..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-900/90 border border-slate-700/60 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-200"
              >
                ✕
              </button>
            )}
          </div>

          {/* Priority Filter */}
          <select
            value={selectedPriority}
            onChange={(e) => onPriorityChange(e.target.value as Priority | 'all')}
            className="px-2.5 py-1.5 text-xs font-medium bg-slate-900/90 border border-slate-700/60 rounded-xl text-slate-300 focus:outline-none focus:border-indigo-500 cursor-pointer"
          >
            <option value="all">Todas Prioridades</option>
            <option value="urgent">🚨 Urgente</option>
            <option value="high">⚠️ Alta</option>
            <option value="medium">🔹 Média</option>
            <option value="low">▫️ Baixa</option>
          </select>

          {/* Category Filter */}
          <select
            value={selectedCategory}
            onChange={(e) => onCategoryChange(e.target.value)}
            className="px-2.5 py-1.5 text-xs font-medium bg-slate-900/90 border border-slate-700/60 rounded-xl text-slate-300 focus:outline-none focus:border-indigo-500 cursor-pointer"
          >
            <option value="all">Todas Categorias</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                📁 {cat}
              </option>
            ))}
          </select>
        </div>

        {/* Productivity Tools & Controls */}
        <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto justify-end">
          
          {/* Pomodoro Widget */}
          <PomodoroTimer tasks={allTasks} onShowToast={onShowToast} />

          {/* Focus Mode Quick Toggle */}
          <button
            onClick={onToggleFocusMode}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
              focusMode
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm shadow-amber-500/20 animate-pulse'
                : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 border-slate-700/60 hover:bg-slate-800'
            }`}
            title="Modo Foco: exibe exclusivamente tarefas de hoje"
          >
            <Target className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Foco</span>
          </button>

          {/* Do Not Disturb (DND) Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowDndMenu(!showDndMenu)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                isDndActive
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 shadow-sm'
                  : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 border-slate-700/60 hover:bg-slate-800'
              }`}
              title="Modo Não Perturbe (Silenciar notificações)"
            >
              {isDndActive ? (
                <BellOff className="w-3.5 h-3.5 text-rose-400" />
              ) : (
                <Bell className="w-3.5 h-3.5 text-slate-400" />
              )}
              <span className="hidden md:inline">
                {isDndActive ? 'Silenciado' : 'Sons'}
              </span>
              <ChevronDown className="w-3 h-3 opacity-60" />
            </button>

            {showDndMenu && (
              <div className="absolute right-0 mt-2 w-48 bg-[#0c1222] border border-slate-700 rounded-2xl shadow-2xl p-1.5 z-40 text-xs">
                <span className="block px-2.5 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Modo Não Perturbe:
                </span>
                <button
                  onClick={() => {
                    onToggleDnd(true, 60);
                    setShowDndMenu(false);
                  }}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-800 text-slate-300"
                >
                  Silenciar por 1 hora
                </button>
                <button
                  onClick={() => {
                    onToggleDnd(true, 120);
                    setShowDndMenu(false);
                  }}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-800 text-slate-300"
                >
                  Silenciar por 2 horas
                </button>
                <button
                  onClick={() => {
                    onToggleDnd(true);
                    setShowDndMenu(false);
                  }}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-800 text-slate-300"
                >
                  Silenciar indefinidamente
                </button>
                {isDndActive && (
                  <button
                    onClick={() => {
                      onToggleDnd(false);
                      setShowDndMenu(false);
                    }}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-emerald-950/40 text-emerald-400 font-bold border-t border-slate-800 mt-1"
                  >
                    🔔 Reativar Notificações
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Backup & Export Modal Button */}
          <button
            onClick={onOpenBackupModal}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/60 text-xs font-semibold transition-all"
            title="Exportar/Importar Backup JSON ou CSV"
          >
            <Database className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden lg:inline">Backup</span>
          </button>

          {/* Autostart Toggle */}
          <button
            onClick={handleToggleAutostart}
            disabled={isTogglingAutostart}
            title={
              autostartEnabled
                ? 'TaskLS inicia automaticamente com o Windows (Clique para desativar)'
                : 'Clique para fazer o TaskLS iniciar com o Windows'
            }
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
              autostartEnabled
                ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/30 hover:bg-emerald-950/60'
                : 'bg-slate-900/80 text-slate-400 border-slate-700/60 hover:text-slate-300 hover:border-slate-600'
            }`}
          >
            {isTogglingAutostart ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Power className={`w-3.5 h-3.5 ${autostartEnabled ? 'text-emerald-400' : 'text-slate-400'}`} />
            )}
            <span className="hidden xl:inline">Windows:</span>
            <span className={autostartEnabled ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
              {autostartEnabled ? 'ON' : 'OFF'}
            </span>
          </button>

          {/* Windows Notification Test */}
          <button
            onClick={handleTestNotification}
            disabled={isTestingNotif}
            title="Enviar notificação de teste no Windows"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/60 text-xs font-semibold transition-all shadow-sm"
          >
            {isTestingNotif ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
            ) : (
              <Bell className="w-3.5 h-3.5 text-amber-400" />
            )}
            <span className="hidden xl:inline">Testar</span>
          </button>

          {/* New Task Button (Desktop) */}
          <button
            onClick={onNewTask}
            className="hidden xl:flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 ring-1 ring-white/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Nova Tarefa</span>
          </button>
        </div>

      </div>
    </header>
  );
};
