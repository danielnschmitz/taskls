import React, { useState, useEffect } from 'react';
import {
  X,
  Repeat,
  Calendar,
  CalendarDays,
  Inbox,
  Bell,
  Clock,
  Plus,
  Trash2,
  Check,
  AlertCircle,
  CheckSquare,
} from 'lucide-react';
import { Task, TaskType, Priority, MonthlyType, MonthlyPattern, SubtaskItem, CategoryInfo } from '../types';
import { getCategoryInfo, renderCategoryIcon } from '../utils/categories';

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (taskData: any) => Promise<void>;
  initialData?: Task | null;
  defaultDayOfWeek?: number;
  defaultDate?: string;
  categories?: CategoryInfo[];
}

const WEEKDAYS = [
  { value: 1, label: 'Seg', fullName: 'Segunda-feira' },
  { value: 2, label: 'Ter', fullName: 'Terça-feira' },
  { value: 3, label: 'Qua', fullName: 'Quarta-feira' },
  { value: 4, label: 'Qui', fullName: 'Quinta-feira' },
  { value: 5, label: 'Sex', fullName: 'Sexta-feira' },
  { value: 6, label: 'Sáb', fullName: 'Sábado' },
  { value: 0, label: 'Dom', fullName: 'Domingo' },
];

const PRESET_TIMES = ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00', '17:00'];
const CATEGORY_SUGGESTIONS = ['Geral', 'Trabalho', 'Pessoal', 'Estudos', 'Saúde', 'Finanças', 'Casa', 'Estratégia'];

export const TaskModal: React.FC<TaskModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
  defaultDayOfWeek,
  defaultDate,
  categories = [],
}) => {
  if (!isOpen) return null;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<TaskType>('weekly');
  const [priority, setPriority] = useState<Priority>('medium');
  const [category, setCategory] = useState('Geral');

  // Subtasks Checklist
  const [subtasks, setSubtasks] = useState<SubtaskItem[]>([]);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');

  // Specific type configurations
  const [dueDate, setDueDate] = useState('');
  const [weeklyDays, setWeeklyDays] = useState<number[]>([1]); // default: Segunda
  const [monthlyType, setMonthlyType] = useState<MonthlyType>('day_of_month');
  const [monthlyDay, setMonthlyDay] = useState<number>(15);
  const [monthlyPattern, setMonthlyPattern] = useState<MonthlyPattern>('last');
  const [monthlyWeekday, setMonthlyWeekday] = useState<number>(5); // default: Sexta-feira

  // Notification times
  const [notificationTimes, setNotificationTimes] = useState<string[]>([]);
  const [newTimeInput, setNewTimeInput] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Populate data when modal opens
  useEffect(() => {
    if (initialData) {
      setTitle(initialData.title || '');
      setDescription(initialData.description || '');
      setType(initialData.type || 'weekly');
      setPriority(initialData.priority || 'medium');
      setCategory(initialData.category || 'Geral');
      setDueDate(
        initialData.due_date
          ? typeof initialData.due_date === 'string'
            ? initialData.due_date.substring(0, 10)
            : ''
          : ''
      );
      setWeeklyDays(initialData.weekly_days || [1]);
      setMonthlyType(initialData.monthly_type || 'day_of_month');
      setMonthlyDay(initialData.monthly_day || 15);
      setMonthlyPattern(initialData.monthly_pattern || 'last');
      setMonthlyWeekday(
        initialData.monthly_weekday !== null && initialData.monthly_weekday !== undefined
          ? initialData.monthly_weekday
          : 5
      );
      setNotificationTimes(initialData.notification_times || []);
      setSubtasks(initialData.subtasks || []);
    } else {
      // Defaults for new task
      setTitle('');
      setDescription('');
      setPriority('medium');
      setCategory('Geral');
      setNotificationTimes([]);
      setSubtasks([]);

      const currentDay = new Date().getDay();
      if (defaultDayOfWeek !== undefined) {
        setType('weekly');
        setWeeklyDays([defaultDayOfWeek]);
      } else if (defaultDate) {
        setType('once');
        setDueDate(defaultDate);
      } else {
        setType('weekly');
        setWeeklyDays([currentDay]); // Hoje por padrão
      }

      const todayStr = new Date().toISOString().substring(0, 10);
      setDueDate(defaultDate || todayStr);
      setMonthlyType('day_of_month');
      setMonthlyDay(15);
      setMonthlyPattern('last');
      setMonthlyWeekday(5);
    }
    setNewSubtaskTitle('');
    setErrorMsg('');
  }, [initialData, defaultDayOfWeek, defaultDate, isOpen]);

  // Subtask handlers
  const handleAddSubtask = () => {
    if (!newSubtaskTitle.trim()) return;
    const newSubtask: SubtaskItem = {
      id: Math.random().toString(36).substring(2, 9),
      title: newSubtaskTitle.trim(),
      completed: false,
    };
    setSubtasks([...subtasks, newSubtask]);
    setNewSubtaskTitle('');
  };

  const handleRemoveSubtask = (id: string) => {
    setSubtasks(subtasks.filter((s) => s.id !== id));
  };

  const handleToggleSubtask = (id: string) => {
    setSubtasks(
      subtasks.map((s) => (s.id === id ? { ...s, completed: !s.completed } : s))
    );
  };

  // Toggle day of week for weekly tasks
  const handleToggleWeekday = (day: number) => {
    if (weeklyDays.includes(day)) {
      if (weeklyDays.length === 1) return; // keep at least one
      setWeeklyDays(weeklyDays.filter((d) => d !== day));
    } else {
      setWeeklyDays([...weeklyDays, day]);
    }
  };

  // Add notification time
  const handleAddTime = (timeToAdd?: string) => {
    const time = (timeToAdd || newTimeInput).trim();
    if (!time) return;

    // Validate HH:mm
    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(time)) {
      setErrorMsg('Horário inválido. Use o formato HH:mm (ex: 08:30)');
      return;
    }

    // Format with leading zero if needed
    const [h, m] = time.split(':');
    const formatted = `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;

    if (!notificationTimes.includes(formatted)) {
      setNotificationTimes([...notificationTimes, formatted].sort());
      setNewTimeInput('');
      setErrorMsg('');
    }
  };

  const handleRemoveTime = (timeToRemove: string) => {
    setNotificationTimes(notificationTimes.filter((t) => t !== timeToRemove));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMsg('Informe o título da tarefa');
      return;
    }

    if (type === 'weekly' && weeklyDays.length === 0) {
      setErrorMsg('Selecione pelo menos um dia da semana');
      return;
    }

    if (type === 'once' && !dueDate) {
      setErrorMsg('Selecione a data para a ocorrência única');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');

    try {
      // If user selected/typed a time in the input but forgot to click "+ Adicionar", include it automatically
      let finalNotificationTimes = [...notificationTimes];
      if (newTimeInput.trim()) {
        const time = newTimeInput.trim();
        const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
        if (timeRegex.test(time)) {
          const [h, m] = time.split(':');
          const formatted = `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
          if (!finalNotificationTimes.includes(formatted)) {
            finalNotificationTimes.push(formatted);
          }
        }
      }
      finalNotificationTimes.sort();

      const payload: any = {
        title: title.trim(),
        description: description.trim() || null,
        type,
        priority,
        category: category.trim() || 'Geral',
        notification_times: finalNotificationTimes,
        subtasks,
      };

      if (type === 'weekly') {
        payload.weekly_days = weeklyDays;
      } else if (type === 'once') {
        payload.due_date = dueDate;
      } else if (type === 'monthly') {
        payload.monthly_type = monthlyType;
        if (monthlyType === 'day_of_month') {
          payload.monthly_day = monthlyDay;
        } else {
          payload.monthly_pattern = monthlyPattern;
          payload.monthly_weekday = monthlyWeekday;
        }
      }

      await onSave(payload);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao salvar tarefa');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-[#0d1424] border border-slate-700/80 rounded-2xl shadow-2xl shadow-black/80 overflow-hidden my-8">
        
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800/80 flex items-center justify-between bg-slate-900/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">
                {initialData ? 'Editar Tarefa' : 'Nova Tarefa'}
              </h3>
              <p className="text-xs text-slate-400">
                Configure os detalhes, regras de repetição e lembretes do Windows.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[calc(85vh-120px)] overflow-y-auto">
          
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Título da Tarefa <span className="text-indigo-400">*</span>
            </label>
            <input
              type="text"
              required
              autoFocus
              placeholder="Ex: Revisar relatórios semanais de vendas"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-950/70 border border-slate-700/80 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 text-sm transition-all"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Descrição / Notas (Opcional)
            </label>
            <textarea
              rows={2}
              placeholder="Detalhes adicionais, checklists ou observações..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3.5 py-2 bg-slate-950/70 border border-slate-700/80 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 text-sm transition-all resize-none"
            />
          </div>

          {/* Task Type Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Tipo de Ocorrência & Recorrência
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {/* Weekly */}
              <button
                type="button"
                onClick={() => setType('weekly')}
                className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition-all ${
                  type === 'weekly'
                    ? 'bg-indigo-950/40 border-indigo-500 ring-1 ring-indigo-500/30 text-white'
                    : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <Repeat className={`w-4 h-4 ${type === 'weekly' ? 'text-indigo-400' : 'text-slate-500'}`} />
                  {type === 'weekly' && <Check className="w-3.5 h-3.5 text-indigo-400" />}
                </div>
                <span className="text-xs font-bold mt-1">Semanal</span>
                <span className="text-[10px] text-slate-500">Dias fixos da semana</span>
              </button>

              {/* Once */}
              <button
                type="button"
                onClick={() => setType('once')}
                className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition-all ${
                  type === 'once'
                    ? 'bg-cyan-950/40 border-cyan-500 ring-1 ring-cyan-500/30 text-white'
                    : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <Calendar className={`w-4 h-4 ${type === 'once' ? 'text-cyan-400' : 'text-slate-500'}`} />
                  {type === 'once' && <Check className="w-3.5 h-3.5 text-cyan-400" />}
                </div>
                <span className="text-xs font-bold mt-1">Única</span>
                <span className="text-[10px] text-slate-500">Data específica</span>
              </button>

              {/* Monthly */}
              <button
                type="button"
                onClick={() => setType('monthly')}
                className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition-all ${
                  type === 'monthly'
                    ? 'bg-purple-950/40 border-purple-500 ring-1 ring-purple-500/30 text-white'
                    : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <CalendarDays className={`w-4 h-4 ${type === 'monthly' ? 'text-purple-400' : 'text-slate-500'}`} />
                  {type === 'monthly' && <Check className="w-3.5 h-3.5 text-purple-400" />}
                </div>
                <span className="text-xs font-bold mt-1">Mensal</span>
                <span className="text-[10px] text-slate-500">Dia X ou padrão</span>
              </button>

              {/* None / Backlog */}
              <button
                type="button"
                onClick={() => setType('none')}
                className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition-all ${
                  type === 'none'
                    ? 'bg-emerald-950/40 border-emerald-500 ring-1 ring-emerald-500/30 text-white'
                    : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <Inbox className={`w-4 h-4 ${type === 'none' ? 'text-emerald-400' : 'text-slate-500'}`} />
                  {type === 'none' && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                </div>
                <span className="text-xs font-bold mt-1">Sem Data</span>
                <span className="text-[10px] text-slate-500">Backlog / Ideias</span>
              </button>
            </div>
          </div>

          {/* Type-Specific Options */}

          {/* 1. Weekly Days Selection */}
          {type === 'weekly' && (
            <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 space-y-2">
              <label className="block text-xs font-semibold text-slate-300">
                Selecione os dias da semana em que esta tarefa se repete:
              </label>
              <div className="flex flex-wrap gap-2 pt-1">
                {WEEKDAYS.map((w) => {
                  const isSelected = weeklyDays.includes(w.value);
                  return (
                    <button
                      key={w.value}
                      type="button"
                      onClick={() => handleToggleWeekday(w.value)}
                      className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all ${
                        isSelected
                          ? 'bg-indigo-600 border-indigo-500 text-white shadow-md shadow-indigo-600/30'
                          : 'bg-slate-950/60 border-slate-700 text-slate-400 hover:text-slate-200'
                      }`}
                      title={w.fullName}
                    >
                      {w.fullName}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 2. Once Due Date */}
          {type === 'once' && (
            <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 space-y-2">
              <label className="block text-xs font-semibold text-slate-300">
                Data de Realização da Tarefa:
              </label>
              <input
                type="date"
                required
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full sm:w-auto px-3.5 py-2 bg-slate-950/80 border border-slate-700 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-cyan-500"
              />
            </div>
          )}

          {/* 3. Monthly Recurrence Rules */}
          {type === 'monthly' && (
            <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 space-y-3">
              <label className="block text-xs font-semibold text-slate-300">
                Como essa tarefa deve se repetir mensalmente?
              </label>

              {/* Option A: Fixed day of month */}
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="monthlyType"
                  checked={monthlyType === 'day_of_month'}
                  onChange={() => setMonthlyType('day_of_month')}
                  className="accent-purple-500"
                />
                <span className="text-xs text-slate-300 font-medium">Em um dia específico do mês</span>
              </label>

              {monthlyType === 'day_of_month' && (
                <div className="pl-6 flex items-center gap-2 pt-1">
                  <span className="text-xs text-slate-400">Todo dia</span>
                  <select
                    value={monthlyDay}
                    onChange={(e) => setMonthlyDay(parseInt(e.target.value, 10))}
                    className="px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-slate-200 text-xs font-semibold focus:outline-none focus:border-purple-500"
                  >
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                      <option key={day} value={day}>
                        {day}
                      </option>
                    ))}
                  </select>
                  <span className="text-xs text-slate-400">de cada mês</span>
                </div>
              )}

              {/* Option B: Relative pattern */}
              <label className="flex items-center gap-3 cursor-pointer pt-2">
                <input
                  type="radio"
                  name="monthlyType"
                  checked={monthlyType === 'pattern'}
                  onChange={() => setMonthlyType('pattern')}
                  className="accent-purple-500"
                />
                <span className="text-xs text-slate-300 font-medium">
                  Em um padrão relativo (ex: última sexta-feira do mês)
                </span>
              </label>

              {monthlyType === 'pattern' && (
                <div className="pl-6 flex flex-wrap items-center gap-2 pt-1">
                  <span className="text-xs text-slate-400">Na</span>
                  <select
                    value={monthlyPattern}
                    onChange={(e) => setMonthlyPattern(e.target.value as MonthlyPattern)}
                    className="px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-slate-200 text-xs font-semibold focus:outline-none focus:border-purple-500"
                  >
                    <option value="first">1ª</option>
                    <option value="second">2ª</option>
                    <option value="third">3ª</option>
                    <option value="fourth">4ª</option>
                    <option value="last">Última</option>
                  </select>
                  <select
                    value={monthlyWeekday}
                    onChange={(e) => setMonthlyWeekday(parseInt(e.target.value, 10))}
                    className="px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-slate-200 text-xs font-semibold focus:outline-none focus:border-purple-500"
                  >
                    <option value={1}>Segunda-feira</option>
                    <option value={2}>Terça-feira</option>
                    <option value={3}>Quarta-feira</option>
                    <option value={4}>Quinta-feira</option>
                    <option value={5}>Sexta-feira</option>
                    <option value={6}>Sábado</option>
                    <option value={0}>Domingo</option>
                  </select>
                  <span className="text-xs text-slate-400">do mês</span>
                </div>
              )}
            </div>
          )}

          {/* Notification Times */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Bell className="w-3.5 h-3.5 text-amber-400" />
                <span>Horários de Notificação no Windows</span>
              </label>
              <span className="text-[11px] text-slate-500">
                Dispara alerta apenas se não concluída
              </span>
            </div>

            {/* List of active notification times */}
            <div className="flex flex-wrap items-center gap-2 mb-2.5">
              {notificationTimes.length === 0 ? (
                <span className="text-xs text-slate-500 italic py-1">
                  Nenhum horário configurado (a tarefa não emitirá notificação).
                </span>
              ) : (
                notificationTimes.map((time) => (
                  <span
                    key={time}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-bold"
                  >
                    <Clock className="w-3 h-3" />
                    <span>{time}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveTime(time)}
                      className="hover:text-amber-100 p-0.5 rounded"
                      title="Remover horário"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))
              )}
            </div>

            {/* Input to add time */}
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="time"
                value={newTimeInput}
                onChange={(e) => setNewTimeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddTime();
                  }
                }}
                className="px-3 py-1.5 bg-slate-950/80 border border-slate-700 rounded-lg text-slate-200 text-xs focus:outline-none focus:border-amber-500"
              />
              <button
                type="button"
                onClick={() => handleAddTime()}
                className="px-3 py-1.5 rounded-lg bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/30 text-amber-300 text-xs font-semibold flex items-center gap-1 transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Adicionar</span>
              </button>

              {/* Quick presets */}
              <div className="flex items-center gap-1 ml-auto text-[11px] text-slate-400">
                <span className="hidden sm:inline">Sugestões:</span>
                {PRESET_TIMES.map((pt) => (
                  <button
                    key={pt}
                    type="button"
                    onClick={() => handleAddTime(pt)}
                    className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 hover:border-amber-500/40 text-slate-400 hover:text-amber-300 text-[10px] transition-all"
                  >
                    +{pt}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Checklist / Subtasks Section */}
          <div className="pt-2 border-t border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <CheckSquare className="w-3.5 h-3.5 text-indigo-400" />
                <span>Checklist de Subtarefas</span>
              </label>
              <span className="text-[11px] text-slate-500">
                {subtasks.length} {subtasks.length === 1 ? 'item' : 'itens'}
              </span>
            </div>

            {/* List of subtasks */}
            {subtasks.length > 0 && (
              <div className="space-y-1.5 mb-3 max-h-44 overflow-y-auto pr-1">
                {subtasks.map((sub) => (
                  <div
                    key={sub.id}
                    className="flex items-center justify-between gap-2 p-2 rounded-xl bg-slate-950/70 border border-slate-800 text-xs"
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <button
                        type="button"
                        onClick={() => handleToggleSubtask(sub.id)}
                        className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-all ${
                          sub.completed
                            ? 'bg-indigo-600 border-indigo-500 text-white'
                            : 'border-slate-600 hover:border-indigo-400'
                        }`}
                      >
                        {sub.completed && <Check className="w-3 h-3 stroke-[3]" />}
                      </button>
                      <span
                        className={`text-slate-200 truncate ${
                          sub.completed ? 'line-through text-slate-500' : ''
                        }`}
                      >
                        {sub.title}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveSubtask(sub.id)}
                      className="text-slate-500 hover:text-rose-400 p-1 rounded"
                      title="Remover item"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add Subtask Input */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Adicionar etapa ou subtarefa..."
                value={newSubtaskTitle}
                onChange={(e) => setNewSubtaskTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddSubtask();
                  }
                }}
                className="flex-1 px-3.5 py-1.5 bg-slate-950/80 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 text-xs focus:outline-none focus:border-indigo-500"
              />
              <button
                type="button"
                onClick={handleAddSubtask}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1 transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Adicionar</span>
              </button>
            </div>
          </div>

          {/* Priority & Category */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-800">
            
            {/* Priority */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Prioridade
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className="w-full px-3 py-2 bg-slate-950/70 border border-slate-700 rounded-xl text-slate-200 text-xs font-medium focus:outline-none focus:border-indigo-500"
              >
                <option value="low">▫️ Baixa</option>
                <option value="medium">🔹 Média</option>
                <option value="high">⚠️ Alta</option>
                <option value="urgent">🚨 Urgente</option>
              </select>
            </div>

            {/* Category */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Categoria
              </label>
              <input
                type="text"
                list="category-suggestions"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Ex: Trabalho, Pessoal..."
                className="w-full px-3 py-2 bg-slate-950/70 border border-slate-700 rounded-xl text-slate-200 text-xs font-medium focus:outline-none focus:border-indigo-500"
              />
              <datalist id="category-suggestions">
                {CATEGORY_SUGGESTIONS.map((cat) => (
                  <option key={cat} value={cat} />
                ))}
              </datalist>

              {/* Category Quick Chips */}
              <div className="flex flex-wrap gap-1 mt-1.5">
                {CATEGORY_SUGGESTIONS.slice(0, 5).map((catName) => {
                  const info = getCategoryInfo(catName, categories);
                  return (
                    <button
                      key={catName}
                      type="button"
                      onClick={() => setCategory(catName)}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border transition-all ${
                        category.toLowerCase() === catName.toLowerCase()
                          ? 'border-indigo-500 bg-indigo-500/20 text-white'
                          : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:text-slate-200'
                      }`}
                      style={
                        category.toLowerCase() === catName.toLowerCase()
                          ? { borderColor: info.color, color: info.color }
                          : {}
                      }
                    >
                      {renderCategoryIcon(info.icon, 'w-2.5 h-2.5')}
                      <span>{catName}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Modal Footer */}
          <div className="pt-4 border-t border-slate-800/80 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-xs font-semibold transition-all"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 transition-all disabled:opacity-50"
            >
              {isSubmitting ? 'Salvando...' : initialData ? 'Salvar Alterações' : 'Criar Tarefa'}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};
