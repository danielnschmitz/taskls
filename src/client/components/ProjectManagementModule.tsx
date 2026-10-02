import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Calendar,
  Clock,
  Users,
  User,
  UserPlus,
  ChevronDown,
  ChevronRight,
  Plus,
  ArrowUp,
  ArrowDown,
  Trash2,
  Save,
  RotateCcw,
  Search,
  ExternalLink,
  Download,
  FileSpreadsheet,
  FileText,
  Image,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  Settings as SettingsIcon,
  RefreshCw,
  FolderKanban,
  Check,
  X,
  Layers,
  BarChart2,
  CalendarDays,
  AlertOctagon,
  Building2,
  LayoutTemplate,
  Eye,
  EyeOff,
  Pencil,
  Radio,
  FolderPlus,
  Globe,
  Briefcase,
  GripVertical,
  Play,
  Filter,
  FilterX,
  SlidersHorizontal,
  CalendarRange,
  CalendarSync,
  MessageSquare,
  ArrowUpDown,
  Pin,
} from 'lucide-react';
import {
  format,
  parseISO,
  differenceInCalendarDays,
  addDays,
  subDays,
  startOfMonth,
  endOfMonth,
  isSameDay,
  isToday,
  startOfWeek,
  endOfWeek,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toJpeg, toPng } from 'html-to-image';
import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';
import { ProjectPdfExportTemplate } from './ProjectPdfExportTemplate';

import {
  ProjectRecord,
  ProjectSettings,
  ProjectHoliday,
  PlanItemInput,
  ScheduledPlanItem,
  ProjectBacklogGroup,
  ProjectBacklogIssue,
  ProjectBacklogResponse,
  ProjectPlanResponse,
  JiraDemand,
  ProjectChangeLog,
} from '../types';
import {
  calculatePlanSchedule,
  isWorkingDay,
  countWorkingDays,
  addWorkingDays,
} from '../utils/projectScheduling';
import { useTheme } from '../contexts/ThemeContext';
import { JiraCard, getStatusBadgeStyle } from './JiraCard';

interface ProjectManagementModuleProps {
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

// Paleta de cores moderna e distinta para cada responsável
const ASSIGNEE_COLORS = [
  { bg: 'bg-indigo-500', text: 'text-indigo-700 dark:text-indigo-300', border: 'border-indigo-400', lightBg: 'bg-indigo-50 dark:bg-indigo-950/40', bar: '#6366f1' },
  { bg: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-400', lightBg: 'bg-emerald-50 dark:bg-emerald-950/40', bar: '#10b981' },
  { bg: 'bg-purple-500', text: 'text-purple-700 dark:text-purple-300', border: 'border-purple-400', lightBg: 'bg-purple-50 dark:bg-purple-950/40', bar: '#a855f7' },
  { bg: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-400', lightBg: 'bg-amber-50 dark:bg-amber-950/40', bar: '#f59e0b' },
  { bg: 'bg-cyan-500', text: 'text-cyan-700 dark:text-cyan-300', border: 'border-cyan-400', lightBg: 'bg-cyan-50 dark:bg-cyan-950/40', bar: '#06b6d4' },
  { bg: 'bg-rose-500', text: 'text-rose-700 dark:text-rose-300', border: 'border-rose-400', lightBg: 'bg-rose-50 dark:bg-rose-950/40', bar: '#f43f5e' },
  { bg: 'bg-blue-500', text: 'text-blue-700 dark:text-blue-300', border: 'border-blue-400', lightBg: 'bg-blue-50 dark:bg-blue-950/40', bar: '#3b82f6' },
  { bg: 'bg-teal-500', text: 'text-teal-700 dark:text-teal-300', border: 'border-teal-400', lightBg: 'bg-teal-50 dark:bg-teal-950/40', bar: '#14b8a6' },
];

export type ExecutionStatus = 'not_started' | 'started' | 'completed';

export interface TaskExecutionState {
  status: ExecutionStatus;
  label: string;
  isDelayedStart: boolean;
  delayDays: number;
}

/**
 * Determina o estado de execução da tarefa e verifica se está atrasada por não ter sido iniciada
 */
export function getTaskExecutionState(item: ScheduledPlanItem): TaskExecutionState {
  const meta = item.metadata || {};
  let status: ExecutionStatus = 'not_started';

  if (meta.execution_status === 'completed') {
    status = 'completed';
  } else if (meta.execution_status === 'started') {
    status = 'started';
  } else if (meta.execution_status === 'not_started') {
    status = 'not_started';
  } else {
    // Inferência inteligente pelo texto do status atual
    const st = (item.status || meta.displayStatus || meta.rawStatus || '').toLowerCase().trim();
    if (
      st.includes('concluíd') ||
      st.includes('concluid') ||
      st.includes('finalizad') ||
      st.includes('resolvid') ||
      st.includes('em produç') ||
      st.includes('em produc') ||
      st === 'done'
    ) {
      status = 'completed';
    } else if (
      st.includes('iniciad') ||
      st.includes('em andamento') ||
      st.includes('em desenvolvimento') ||
      st.includes('desenvolvimento') ||
      st.includes('execução') ||
      st.includes('execucao') ||
      st === 'in progress'
    ) {
      status = 'started';
    } else {
      status = 'not_started';
    }
  }

  // Regra de Atraso por Não Ter Sido Iniciada:
  // Se ainda NÃO foi iniciada (status 'not_started') E a data planejada de início é anterior a hoje
  let isDelayedStart = false;
  let delayDays = 0;

  if (status === 'not_started' && item.start_date) {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    if (item.start_date < todayStr) {
      isDelayedStart = true;
      try {
        const startD = parseISO(item.start_date.substring(0, 10));
        const todayD = parseISO(todayStr);
        delayDays = Math.max(1, differenceInCalendarDays(todayD, startD));
      } catch {
        delayDays = 1;
      }
    }
  }

  let label = 'Não Iniciada';
  if (status === 'completed') {
    label = 'Concluída';
  } else if (status === 'started') {
    label = 'Iniciada';
  } else if (isDelayedStart) {
    label = 'Atrasada: não iniciada';
  } else {
    label = item.metadata?.displayStatus || item.status || 'Não Iniciada';
  }

  return {
    status,
    label,
    isDelayedStart,
    delayDays,
  };
}

export const ProjectManagementModule: React.FC<ProjectManagementModuleProps> = ({
  onShowToast,
}) => {
  const { resolvedTheme } = useTheme();

  // Navigation tab
  const [activeTab, setActiveTab] = useState<'gantt' | 'backlog' | 'settings'>('gantt');

  // Projects Management state
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [selectedProjectKey, setSelectedProjectKey] = useState<string>(() => {
    return localStorage.getItem('taskls_selected_project_key') || 'NEO';
  });
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false);

  // Modais de Criação e Edição de Projeto / Plano
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false);
  const [jiraProjects, setJiraProjects] = useState<string[]>([]);
  const [newJiraKey, setNewJiraKey] = useState('NEO');
  const [newProjectKey, setNewProjectKey] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [isCreatingProject, setIsCreatingProject] = useState(false);

  const [editingProjectModal, setEditingProjectModal] = useState<ProjectRecord | null>(null);
  const [editJiraKey, setEditJiraKey] = useState('');
  const [editProjectName, setEditProjectName] = useState('');
  const [editProjectDesc, setEditProjectDesc] = useState('');
  const [isSavingProjectInfo, setIsSavingProjectInfo] = useState(false);
  const [isDeletingProject, setIsDeletingProject] = useState(false);

  // Active project helper
  const activeProject = useMemo(() => {
    return projects.find((p) => p.key === selectedProjectKey) || projects[0] || null;
  }, [projects, selectedProjectKey]);

  // Loading states
  const [isLoadingPlan, setIsLoadingPlan] = useState(true);
  const [isLoadingBacklog, setIsLoadingBacklog] = useState(false);
  const [isSavingPlan, setIsSavingPlan] = useState(false);
  const [isExporting, setIsExporting] = useState<'jpg' | 'pdf' | 'excel' | null>(null);
  const [isJpgDropdownOpen, setIsJpgDropdownOpen] = useState(false);

  // Core Data
  const [settings, setSettings] = useState<ProjectSettings>({
    delivered_users: ['Neogrid'],
    work_hours_per_day: 8,
    plan_start_date: format(new Date(), 'yyyy-MM-dd'),
    holidays: [],
    global_assignees: [],
    client_hours_markup_percent: 0,
    client_delivery_buffer_days: 1,
    issue_types: ['Ativação', 'Tarefa'],
  });

  const registeredAssignees = useMemo(() => {
    if (Array.isArray(settings.global_assignees) && settings.global_assignees.length > 0) {
      return settings.global_assignees;
    }
    return [];
  }, [settings.global_assignees]);

  // Stored / Server Plan vs Live Local Plan
  const [serverItems, setServerItems] = useState<ScheduledPlanItem[]>([]);
  const [localItems, setLocalItems] = useState<ScheduledPlanItem[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Filtros de Projeto Contínuo / Ongoing & Linha do Tempo
  const [filterStatus, setFilterStatus] = useState<
    'all' | 'pending' | 'started' | 'not_started' | 'completed'
  >('all');
  const [filterHideCompleted, setFilterHideCompleted] = useState<boolean>(false);
  const [filterAssignee, setFilterAssignee] = useState<string>('all');
  const [filterPeriod, setFilterPeriod] = useState<
    'all' | 'current_window' | 'this_month' | 'next_30' | 'next_60' | 'custom'
  >('all');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [filterSearch, setFilterSearch] = useState<string>('');
  const [isAligningToday, setIsAligningToday] = useState(false);

  // Map of stored server items for fast baseline comparison
  const serverItemMap = useMemo(() => {
    const map = new Map<string, ScheduledPlanItem>();
    for (const it of serverItems) {
      if (it.id) map.set(it.id, it);
      if (it.issue_key) map.set(it.issue_key, it);
    }
    return map;
  }, [serverItems]);

  // Backlog state
  const [backlogData, setBacklogData] = useState<ProjectBacklogResponse | null>(null);
  const [openAccordions, setOpenAccordions] = useState<Record<string, boolean>>({});
  const [backlogSearch, setBacklogSearch] = useState('');

  // Modal: Add Demand to Plan (do Jira)
  const [addingIssue, setAddingIssue] = useState<ProjectBacklogIssue | null>(null);
  const [estimateHoursInput, setEstimateHoursInput] = useState<number>(8);
  const [assigneeInput, setAssigneeInput] = useState<string>('');
  const [addFixedStartDate, setAddFixedStartDate] = useState<string>('');

  // Modal: Incluir Tarefa (Jira ou Tarefa Avulsa/Não Jira)
  const [isAddManualModalOpen, setIsAddManualModalOpen] = useState(false);
  const [manualKey, setManualKey] = useState('');
  const [manualSummary, setManualSummary] = useState('');
  const [manualAssignee, setManualAssignee] = useState('');
  const [manualEstimateHours, setManualEstimateHours] = useState<number>(8);
  const [manualFixedStartDate, setManualFixedStartDate] = useState<string>('');
  const [manualExecutionStatus, setManualExecutionStatus] = useState<ExecutionStatus>('not_started');
  const [manualIndustry, setManualIndustry] = useState('');
  const [manualCanal, setManualCanal] = useState('');
  const [manualPosition, setManualPosition] = useState<'end' | 'start' | 'custom'>('end');
  const [manualCustomPosition, setManualCustomPosition] = useState<number>(1);
  const [isSearchingJira, setIsSearchingJira] = useState(false);
  const [jiraSearchFeedback, setJiraSearchFeedback] = useState<{ type: 'success' | 'warning' | 'error'; message: string } | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [manualJiraMetadata, setManualJiraMetadata] = useState<any | null>(null);

  // Modal: Edit Demand in Plan
  const [editingItem, setEditingItem] = useState<ScheduledPlanItem | null>(null);
  const [editEstimateHours, setEditEstimateHours] = useState<number>(8);
  const [editAssignee, setEditAssignee] = useState<string>('');
  const [editFixedStartDate, setEditFixedStartDate] = useState<string>('');
  const [editSummary, setEditSummary] = useState<string>('');
  const [editStatus, setEditStatus] = useState<string>('Planejado');
  const [editIndustry, setEditIndustry] = useState<string>('');
  const [editCanal, setEditCanal] = useState<string>('');
  const [editExecutionStatus, setEditExecutionStatus] = useState<ExecutionStatus>('not_started');

  // Modal: Sincronizar Datas com o Jira
  const [syncJiraItem, setSyncJiraItem] = useState<ScheduledPlanItem | null>(null);
  const [syncJiraComment, setSyncJiraComment] = useState<string>('');
  const [isSyncingJira, setIsSyncingJira] = useState<boolean>(false);

  // Dropdown menu de status na linha da tabela
  const [openStatusMenuId, setOpenStatusMenuId] = useState<string | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (openStatusMenuId) {
        const target = e.target as HTMLElement;
        if (!target.closest('[data-status-menu-container]')) {
          setOpenStatusMenuId(null);
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openStatusMenuId]);

  // Modo de visualização alternativo
  const [isClientView, setIsClientView] = useState(false);

  // Gantt Chart View state
  const [ganttScale, setGanttScale] = useState<'day' | 'week'>('day');
  const ganttContainerRef = useRef<HTMLDivElement>(null);
  const pdfExportContainerRef = useRef<HTMLDivElement>(null);

  // Log de auditoria e exportação
  const [changeLogs, setChangeLogs] = useState<ProjectChangeLog[]>([]);
  const [pdfExportMode, setPdfExportMode] = useState<'plan' | 'log' | 'all'>('plan');
  const [isPdfDropdownOpen, setIsPdfDropdownOpen] = useState(false);

  // Modal: Inverter Ordem de Tarefas
  const [isSwapModalOpen, setIsSwapModalOpen] = useState(false);
  const [swapItem1Key, setSwapItem1Key] = useState<string>('');
  const [swapItem2Key, setSwapItem2Key] = useState<string>('');
  const [isSwapping, setIsSwapping] = useState<boolean>(false);

  // Assignee Color Mapping Cache
  const assigneeColorMap = useMemo(() => {
    const map = new Map<string, typeof ASSIGNEE_COLORS[0]>();
    let colorIdx = 0;
    for (const item of localItems) {
      const name = item.assignee_name.trim();
      if (!map.has(name)) {
        map.set(name, ASSIGNEE_COLORS[colorIdx % ASSIGNEE_COLORS.length]);
        colorIdx++;
      }
    }
    return map;
  }, [localItems]);

  // Set of Holiday strings for quick lookup
  const holidaySet = useMemo(() => {
    return new Set((settings.holidays || []).map((h) => h.date.trim()));
  }, [settings.holidays]);

  // Buscar siglas de projetos do Jira disponíveis
  const loadJiraProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/projects/jira-projects');
      if (res.ok) {
        const data: string[] = await res.json();
        setJiraProjects(data);
      }
    } catch (err) {
      console.warn('[Projects API] Falha ao carregar lista de projetos do Jira:', err);
    }
  }, []);

  // Helper para sugerir a próxima chave única disponível para um plano baseado no Jira
  const suggestNextPlanKey = useCallback(
    (jiraKey: string) => {
      const raw = jiraKey.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
      if (!raw) return '';
      const existingKeys = new Set(projects.map((p) => p.key.toUpperCase()));
      if (!existingKeys.has(raw)) return raw;
      let i = 2;
      while (existingKeys.has(`${raw}-${i}`)) {
        i++;
      }
      return `${raw}-${i}`;
    },
    [projects]
  );

  // 0. Fetch projects list
  const loadProjects = useCallback(async () => {
    try {
      setIsLoadingProjects(true);
      const res = await fetch('/api/projects');
      if (!res.ok) throw new Error('Falha ao carregar lista de projetos.');
      const data: ProjectRecord[] = await res.json();
      setProjects(data);
      if (data.length > 0 && !data.some((p) => p.key === selectedProjectKey)) {
        const fallbackKey = data[0].key;
        setSelectedProjectKey(fallbackKey);
        localStorage.setItem('taskls_selected_project_key', fallbackKey);
      }
      loadJiraProjects();
    } catch (err: any) {
      console.error(err);
      onShowToast(err.message || 'Erro ao carregar lista de projetos.', 'error');
    } finally {
      setIsLoadingProjects(false);
    }
  }, [selectedProjectKey, onShowToast, loadJiraProjects]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // Carregar histórico de logs de auditoria do projeto
  const loadProjectLogs = useCallback(async (projectKey: string) => {
    if (!projectKey) return;
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectKey)}/logs`);
      if (res.ok) {
        const data = await res.json();
        setChangeLogs(data);
      }
    } catch (err) {
      console.warn('[Projects API] Falha ao carregar logs:', err);
    }
  }, []);

  // 1. Fetch settings and plan for active project
  const loadPlanAndSettings = useCallback(async (projectKey: string) => {
    if (!projectKey) return;
    try {
      setIsLoadingPlan(true);
      const res = await fetch(`/api/projects/${encodeURIComponent(projectKey)}/plan`);
      if (!res.ok) throw new Error('Falha ao carregar plano de projeto.');
      const data: ProjectPlanResponse = await res.json();
      setSettings(data.settings);
      setServerItems(data.items);
      setLocalItems(data.items);
      setHasUnsavedChanges(false);
      loadProjectLogs(projectKey);
    } catch (err: any) {
      console.error(err);
      onShowToast(err.message || 'Erro ao carregar dados do plano.', 'error');
    } finally {
      setIsLoadingPlan(false);
    }
  }, [onShowToast, loadProjectLogs]);

  useEffect(() => {
    if (selectedProjectKey) {
      loadPlanAndSettings(selectedProjectKey);
    }
  }, [selectedProjectKey, loadPlanAndSettings]);

  // 2. Fetch Backlog from Jira for active project
  const loadBacklog = useCallback(async (projectKey: string) => {
    if (!projectKey) return;
    try {
      setIsLoadingBacklog(true);
      const res = await fetch(`/api/projects/${encodeURIComponent(projectKey)}/backlog`);
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Falha ao buscar backlog do Jira.');
      }
      const data: ProjectBacklogResponse = await res.json();
      setBacklogData(data);

      // Default: open the first 3 status groups
      const initialOpen: Record<string, boolean> = {};
      data.groups.forEach((g, idx) => {
        initialOpen[g.status] = idx < 3;
      });
      setOpenAccordions(initialOpen);
    } catch (err: any) {
      console.error(err);
      onShowToast(err.message || 'Erro ao carregar backlog do Jira.', 'error');
    } finally {
      setIsLoadingBacklog(false);
    }
  }, [onShowToast]);

  useEffect(() => {
    if (
      activeTab === 'backlog' &&
      selectedProjectKey &&
      (!backlogData || backlogData.project !== selectedProjectKey) &&
      !isLoadingBacklog
    ) {
      loadBacklog(selectedProjectKey);
    }
  }, [activeTab, selectedProjectKey, backlogData, isLoadingBacklog, loadBacklog]);

  // Switch project handler with unsaved changes verification
  const handleSwitchProject = (newKey: string) => {
    if (newKey === selectedProjectKey) {
      setIsProjectDropdownOpen(false);
      return;
    }
    if (hasUnsavedChanges) {
      if (
        !window.confirm(
          'Existem alterações não salvas no plano deste projeto. Ao alternar de projeto, essas alterações serão descartadas. Deseja continuar?'
        )
      ) {
        setIsProjectDropdownOpen(false);
        return;
      }
    }
    setIsProjectDropdownOpen(false);
    setSelectedProjectKey(newKey);
    localStorage.setItem('taskls_selected_project_key', newKey);
    setBacklogData(null);
  };

  // Open create new plan modal with auto-suggested keys
  const handleOpenNewProject = useCallback(() => {
    const defaultJira = (activeProject?.jira_project_key || activeProject?.key || jiraProjects[0] || 'NEO').toUpperCase();
    setNewJiraKey(defaultJira);
    setNewProjectKey(suggestNextPlanKey(defaultJira));
    setNewProjectName('');
    setNewProjectDesc('');
    setIsNewProjectModalOpen(true);
    loadJiraProjects();
  }, [activeProject, jiraProjects, suggestNextPlanKey, loadJiraProjects]);

  // Create new project / plan
  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanJiraKey = newJiraKey.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    const cleanKey = newProjectKey.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    const cleanName = newProjectName.trim();

    if (!cleanJiraKey) {
      onShowToast('Informe a chave/sigla do projeto no Jira.', 'error');
      return;
    }
    if (!cleanName) {
      onShowToast('Informe o nome do plano/projeto.', 'error');
      return;
    }

    try {
      setIsCreatingProject(true);
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jira_project_key: cleanJiraKey,
          key: cleanKey || undefined,
          name: cleanName,
          description: newProjectDesc.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Falha ao cadastrar plano/projeto.');
      }

      const json = await res.json();
      const created: ProjectRecord = json.project || json;
      setProjects((prev) => [...prev, created]);
      setSelectedProjectKey(created.key);
      localStorage.setItem('taskls_selected_project_key', created.key);
      setBacklogData(null);
      setIsNewProjectModalOpen(false);
      setNewProjectKey('');
      setNewProjectName('');
      setNewProjectDesc('');
      onShowToast(`Plano "${created.name}" cadastrado com sucesso!`, 'success');
    } catch (err: any) {
      console.error(err);
      onShowToast(err.message || 'Erro ao cadastrar plano/projeto.', 'error');
    } finally {
      setIsCreatingProject(false);
    }
  };

  // Open edit project modal
  const handleOpenEditProject = () => {
    if (!activeProject) return;
    setEditingProjectModal(activeProject);
    setEditProjectName(activeProject.name);
    setEditProjectDesc(activeProject.description || '');
    setEditJiraKey(activeProject.jira_project_key || activeProject.key || 'NEO');
    loadJiraProjects();
  };

  // Update project details
  const handleUpdateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProjectModal) return;

    const cleanJiraKey = editJiraKey.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    const cleanName = editProjectName.trim();

    if (!cleanName) {
      onShowToast('O nome do plano é obrigatório.', 'error');
      return;
    }
    if (!cleanJiraKey) {
      onShowToast('A sigla do projeto Jira associado é obrigatória.', 'error');
      return;
    }

    try {
      setIsSavingProjectInfo(true);
      const res = await fetch(`/api/projects/${encodeURIComponent(editingProjectModal.key)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: cleanName,
          description: editProjectDesc.trim(),
          jira_project_key: cleanJiraKey,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Falha ao atualizar plano.');
      }

      const json = await res.json();
      const updated: ProjectRecord = json.project || json;
      setProjects((prev) => prev.map((p) => (p.key === updated.key ? updated : p)));
      setEditingProjectModal(null);
      onShowToast(`Plano "${updated.name}" atualizado com sucesso!`, 'success');

      // Se a chave do Jira foi alterada no plano atual, recarrega o backlog
      if (updated.key === selectedProjectKey) {
        loadBacklog(updated.key);
      }
    } catch (err: any) {
      console.error(err);
      onShowToast(err.message || 'Erro ao atualizar plano.', 'error');
    } finally {
      setIsSavingProjectInfo(false);
    }
  };

  // Delete project
  const handleDeleteProject = async (projectToDelete: ProjectRecord) => {
    if (projects.length <= 1) {
      onShowToast('Não é possível excluir o único projeto restante do sistema.', 'error');
      return;
    }
    if (
      !window.confirm(
        `Tem certeza que deseja excluir o projeto "${projectToDelete.name}" (${projectToDelete.key})? Todas as demandas salvas no plano deste projeto serão permanentemente removidas.`
      )
    ) {
      return;
    }

    try {
      setIsDeletingProject(true);
      const res = await fetch(`/api/projects/${encodeURIComponent(projectToDelete.key)}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Falha ao excluir projeto.');
      }

      const remaining = projects.filter((p) => p.key !== projectToDelete.key);
      setProjects(remaining);
      setEditingProjectModal(null);
      const nextKey = remaining[0]?.key || 'NEO';
      setSelectedProjectKey(nextKey);
      localStorage.setItem('taskls_selected_project_key', nextKey);
      setBacklogData(null);
      onShowToast(`Projeto "${projectToDelete.name}" excluído com sucesso.`, 'info');
    } catch (err: any) {
      console.error(err);
      onShowToast(err.message || 'Erro ao excluir projeto.', 'error');
    } finally {
      setIsDeletingProject(false);
    }
  };

  // Helper to recalculate local items whenever list order or settings change
  const applySchedule = useCallback(
    (newItems: PlanItemInput[]) => {
      const recalculated = calculatePlanSchedule(newItems, settings);
      setLocalItems(recalculated);
      setHasUnsavedChanges(true);
    },
    [settings]
  );

  // Actions on Plan Items
  const handleMoveUp = (index: number) => {
    if (index <= 0) return;
    const reordered = [...localItems];
    const temp = reordered[index - 1];
    reordered[index - 1] = reordered[index];
    reordered[index] = temp;
    // update sort_order
    reordered.forEach((it, idx) => {
      it.sort_order = idx + 1;
    });
    applySchedule(reordered);
  };

  const handleMoveDown = (index: number) => {
    if (index >= localItems.length - 1) return;
    const reordered = [...localItems];
    const temp = reordered[index + 1];
    reordered[index + 1] = reordered[index];
    reordered[index] = temp;
    reordered.forEach((it, idx) => {
      it.sort_order = idx + 1;
    });
    applySchedule(reordered);
  };

  // Drag and Drop reordering state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    if (isClientView || hasActiveFilters) return;
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    if (isClientView || hasActiveFilters) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    if (isClientView || hasActiveFilters) return;
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const reordered = [...localItems];
    const [movedItem] = reordered.splice(draggedIndex, 1);
    reordered.splice(targetIndex, 0, movedItem);
    reordered.forEach((it, idx) => {
      it.sort_order = idx + 1;
    });

    applySchedule(reordered);
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleRemoveFromPlan = (itemToRemove: ScheduledPlanItem) => {
    const remaining = localItems.filter((i) => i.id !== itemToRemove.id);
    remaining.forEach((it, idx) => {
      it.sort_order = idx + 1;
    });
    applySchedule(remaining);
    onShowToast(`Demanda ${itemToRemove.issue_key} removida do plano.`, 'info');
  };

  // Open modal to add backlog item to plan
  const handleOpenAddModal = (issue: ProjectBacklogIssue) => {
    setAddingIssue(issue);
    setEstimateHoursInput(8);
    setAddFixedStartDate('');
    const jiraAssignee = issue.assignee?.displayName || '';
    const match = registeredAssignees.find(
      (a) => a.trim().toLowerCase() === jiraAssignee.trim().toLowerCase()
    );
    setAssigneeInput(match || (registeredAssignees.length === 1 ? registeredAssignees[0] : ''));
  };

  // Confirm addition to plan
  const handleConfirmAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addingIssue) return;

    if (!estimateHoursInput || estimateHoursInput <= 0) {
      onShowToast('Informe uma estimativa de horas válida (maior que 0).', 'error');
      return;
    }

    if (!assigneeInput.trim()) {
      onShowToast('Selecione quem irá executar a demanda.', 'error');
      return;
    }

    const fixedStart = addFixedStartDate.trim() || null;

    const newItem: PlanItemInput = {
      id: `plan_${addingIssue.key}_${Date.now()}`,
      issue_key: addingIssue.key,
      summary: addingIssue.summary,
      status: 'Planejado',
      assignee_name: assigneeInput.trim(),
      estimate_hours: Number(estimateHoursInput),
      sort_order: localItems.length + 1, // Sempre no final da fila!
      fixed_start_date: fixedStart,
      metadata: {
        issuetype: addingIssue.issuetype,
        priority: addingIssue.priority,
        url: addingIssue.url,
        duedate: addingIssue.duedate,
        project: addingIssue.project,
        epic: addingIssue.epic,
        industry: addingIssue.industry,
        layout: addingIssue.layout,
        canal: addingIssue.canal || null,
        jira_assignee: addingIssue.assignee?.displayName || addingIssue.assignee?.name || assigneeInput.trim() || null,
        isBlocked: addingIssue.isBlocked,
        blockedReason: addingIssue.blockedReason,
        rawStatus: addingIssue.rawStatus || addingIssue.status,
        displayStatus: 'Planejado',
        execution_status: 'not_started',
        fixed_start_date: fixedStart,
      },
    };

    const updatedList = [...localItems, newItem];
    applySchedule(updatedList);
    setAddingIssue(null);
    onShowToast(`Demanda ${addingIssue.key} incluída na última posição da fila do plano!`, 'success');
  };

  // Open modal to add task (Jira ou Avulsa)
  const handleOpenAddManualModal = () => {
    setManualKey('');
    setManualSummary('');
    setManualAssignee(registeredAssignees.length === 1 ? registeredAssignees[0] : '');
    setManualEstimateHours(8);
    setManualFixedStartDate('');
    setManualExecutionStatus('not_started');
    setManualIndustry('');
    setManualCanal('');
    setManualPosition('end');
    setManualCustomPosition(localItems.length + 1);
    setIsSearchingJira(false);
    setJiraSearchFeedback(null);
    setDuplicateWarning(null);
    setManualJiraMetadata(null);
    setIsAddManualModalOpen(true);
  };

  // Verificar se a tarefa já está no plano e alertar caso não esteja concluída
  const checkDuplicateWarning = useCallback((keyInput: string) => {
    const clean = keyInput.trim().toUpperCase();
    if (!clean) {
      setDuplicateWarning(null);
      return;
    }
    const jiraKey = (activeProject?.jira_project_key || activeProject?.key || 'EXT').toUpperCase();
    let targetKey = clean;
    if (/^\d+$/.test(clean)) {
      targetKey = `${jiraKey}-${clean}`;
    }
    const existing = localItems.find((it) => it.issue_key.toUpperCase() === targetKey);
    if (existing) {
      const exec = getTaskExecutionState(existing);
      if (exec.status !== 'completed') {
        const statusLabel =
          exec.status === 'started'
            ? 'Iniciada (Em andamento)'
            : exec.isDelayedStart
            ? 'Atrasada: não iniciada'
            : 'Não Iniciada / Planejado';
        setDuplicateWarning(
          `Atenção: A tarefa "${targetKey}" já consta no plano com status "${statusLabel}" (não concluída). Você pode prosseguir com a inclusão se desejar.`
        );
      } else {
        setDuplicateWarning(null);
      }
    } else {
      setDuplicateWarning(null);
    }
  }, [activeProject, localItems]);

  // Buscar dados da tarefa no Jira para autopreenchimento
  const handleFetchJiraIssue = async (keyInput: string) => {
    const clean = keyInput.trim().toUpperCase();
    if (!clean) {
      setJiraSearchFeedback(null);
      return;
    }

    const jiraKey = (activeProject?.jira_project_key || activeProject?.key || 'EXT').toUpperCase();
    let fullKey = clean;
    if (/^\d+$/.test(clean)) {
      fullKey = `${jiraKey}-${clean}`;
    }

    setIsSearchingJira(true);
    setJiraSearchFeedback(null);

    try {
      // 1. Tentar encontrar no backlog já carregado
      let foundIssue: any = null;
      if (backlogData?.groups) {
        for (const g of backlogData.groups) {
          const f = g.issues.find((iss) => iss.key.toUpperCase() === fullKey);
          if (f) {
            foundIssue = f;
            break;
          }
        }
      }

      if (foundIssue) {
        setManualSummary(foundIssue.summary || '');
        if (foundIssue.assignee && foundIssue.assignee !== 'Não atribuído') {
          const match = registeredAssignees.find(
            (a) => a.trim().toLowerCase() === foundIssue.assignee.trim().toLowerCase()
          );
          if (match) {
            setManualAssignee(match);
          }
        }
        setManualExecutionStatus('not_started');
        if (foundIssue.metadata?.industry) {
          setManualIndustry(foundIssue.metadata.industry);
        }
        if (foundIssue.metadata?.canal) {
          setManualCanal(foundIssue.metadata.canal);
        }
        setManualJiraMetadata({
          epic: foundIssue.metadata?.epic || null,
          layout: foundIssue.metadata?.layout || null,
          canal: foundIssue.metadata?.canal || null,
          industry: foundIssue.metadata?.industry || null,
          duedate: foundIssue.metadata?.duedate || null,
          isBlocked: foundIssue.metadata?.isBlocked || false,
          blockedReason: foundIssue.metadata?.blockedReason || null,
          url: foundIssue.url || `https://sysmiddle.atlassian.net/browse/${fullKey}`,
          jira_assignee: foundIssue.assignee || null,
          issuetype: foundIssue.issuetype || 'Demanda',
          rawStatus: foundIssue.rawStatus || foundIssue.status || 'Planejado',
        });
        setJiraSearchFeedback({
          type: 'success',
          message: `Demanda ${fullKey} encontrada no Jira! Dados preenchidos automaticamente com status Não Iniciada.`,
        });
        return;
      }

      // 2. Buscar no endpoint do servidor
      const res = await fetch(
        `/api/projects/${encodeURIComponent(prefix)}/jira-issue/${encodeURIComponent(fullKey)}`
      );
      if (res.ok) {
        const data = await res.json();
        setManualSummary(data.summary || '');
        if (data.assignee && data.assignee !== 'Não atribuído') {
          const match = registeredAssignees.find(
            (a) => a.trim().toLowerCase() === data.assignee.trim().toLowerCase()
          );
          if (match) {
            setManualAssignee(match);
          }
        }
        setManualExecutionStatus('not_started');
        if (data.industry) {
          setManualIndustry(data.industry);
        }
        if (data.canal) {
          setManualCanal(data.canal);
        }
        if (data.estimate_hours && data.estimate_hours > 0) {
          setManualEstimateHours(data.estimate_hours);
        }
        setManualJiraMetadata({
          epic: data.epic || null,
          layout: data.layout || null,
          canal: data.canal || null,
          industry: data.industry || null,
          duedate: data.duedate || null,
          isBlocked: data.isBlocked || false,
          blockedReason: data.blockedReason || null,
          url: data.url || `https://sysmiddle.atlassian.net/browse/${fullKey}`,
          jira_assignee: data.assignee || null,
          issuetype: data.issuetype || 'Demanda',
          rawStatus: data.rawStatus || data.status || 'Planejado',
        });
        setJiraSearchFeedback({
          type: 'success',
          message: `Demanda ${data.key} encontrada no Jira! Dados preenchidos automaticamente com status Não Iniciada.`,
        });
      } else {
        setJiraSearchFeedback({
          type: 'warning',
          message: `Demanda "${fullKey}" não localizada no Jira. Você pode preencher os campos manualmente.`,
        });
      }
    } catch (err: any) {
      console.warn('Erro ao buscar issue no Jira:', err);
      setJiraSearchFeedback({
        type: 'warning',
        message: `Demanda "${fullKey}" não localizada no Jira. Você pode preencher manualmente.`,
      });
    } finally {
      setIsSearchingJira(false);
    }
  };

  // Efeito para debounce de busca e verificação de duplicidade quando a chave digitada mudar
  useEffect(() => {
    if (!isAddManualModalOpen) return;
    const trimmed = manualKey.trim();
    checkDuplicateWarning(trimmed);

    if (/^\d+$/.test(trimmed) || /^[A-Z0-9]+-\d+$/i.test(trimmed)) {
      const timer = setTimeout(() => {
        handleFetchJiraIssue(trimmed);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [manualKey, isAddManualModalOpen, checkDuplicateWarning]);

  // Confirm addition of task (Jira ou Avulsa)
  const handleConfirmAddManual = (e: React.FormEvent) => {
    e.preventDefault();
    const rawKey = manualKey.trim();
    const planPrefix = activeProject?.key || 'EXT';
    const jiraKey = (activeProject?.jira_project_key || activeProject?.key || 'EXT').toUpperCase();

    let finalKey = '';
    let isJira = false;

    if (!rawKey) {
      // Chave em branco: assumir tarefa que não está no Jira (avulsa)
      let maxNum = 0;
      const regex = new RegExp(`^${planPrefix}[-_](?:EXT|AV|TASK)[-_]?(\\d+)`, 'i');
      localItems.forEach((it) => {
        const m = it.issue_key.match(regex);
        if (m && m[1]) {
          const n = parseInt(m[1], 10);
          if (!isNaN(n) && n > maxNum) maxNum = n;
        }
      });
      const nextNum = maxNum + 1;
      finalKey = `${planPrefix}-EXT-${String(nextNum).padStart(2, '0')}`;
      isJira = false;
    } else if (/^\d+$/.test(rawKey)) {
      finalKey = `${jiraKey}-${rawKey}`;
      isJira = true;
    } else {
      finalKey = rawKey.toUpperCase().replace(/[^A-Z0-9_-]/g, '');
      isJira = Boolean(manualJiraMetadata?.url || finalKey.startsWith(`${jiraKey}-`));
    }

    if (!manualSummary.trim()) {
      onShowToast('Informe o resumo / título da demanda.', 'error');
      return;
    }

    if (!manualAssignee.trim()) {
      onShowToast('Selecione quem irá executar a demanda.', 'error');
      return;
    }

    if (!manualEstimateHours || manualEstimateHours <= 0) {
      onShowToast('Informe uma estimativa de horas válida (maior que 0).', 'error');
      return;
    }

    const uniqueId = isJira
      ? `jira_${finalKey.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
      : `manual_${finalKey.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    let initialStatus = 'Planejado';
    let initialDisplayStatus = 'Planejado';
    let startedAt: string | undefined = undefined;
    let completedAt: string | undefined = undefined;

    if (manualExecutionStatus === 'completed') {
      initialStatus = 'Concluída';
      initialDisplayStatus = 'Concluída';
      completedAt = new Date().toISOString();
    } else if (manualExecutionStatus === 'started') {
      initialStatus = 'Iniciada';
      initialDisplayStatus = 'Iniciada';
      startedAt = new Date().toISOString();
    } else {
      initialStatus = 'Planejado';
      initialDisplayStatus = 'Planejado';
    }

    const fixedStart = manualFixedStartDate.trim() || null;
    const newItem: PlanItemInput = {
      id: uniqueId,
      issue_key: finalKey,
      summary: manualSummary.trim(),
      status: initialStatus,
      assignee_name: manualAssignee.trim(),
      estimate_hours: Number(manualEstimateHours),
      sort_order: 1,
      fixed_start_date: fixedStart,
      metadata: {
        isManual: !isJira,
        isExternal: !isJira,
        source: isJira ? 'jira' : 'manual',
        jira_assignee: manualAssignee.trim() || null,
        issuetype: isJira ? (manualJiraMetadata?.issuetype || 'Demanda') : 'Tarefa Avulsa',
        priority: 'Medium',
        industry: manualIndustry.trim() || manualJiraMetadata?.industry || null,
        canal: manualCanal.trim() || manualJiraMetadata?.canal || null,
        layout: manualJiraMetadata?.layout || null,
        epic: manualJiraMetadata?.epic || null,
        duedate: manualJiraMetadata?.duedate || null,
        isBlocked: manualJiraMetadata?.isBlocked || false,
        blockedReason: manualJiraMetadata?.blockedReason || null,
        url: isJira ? (manualJiraMetadata?.url || `https://sysmiddle.atlassian.net/browse/${finalKey}`) : undefined,
        displayStatus: initialDisplayStatus,
        rawStatus: isJira ? (manualJiraMetadata?.rawStatus || 'Planejado') : initialStatus,
        execution_status: manualExecutionStatus,
        started_at: startedAt,
        completed_at: completedAt,
        created: new Date().toISOString(),
        fixed_start_date: fixedStart,
      },
    };

    let updatedList = [...localItems];
    let targetIndex = localItems.length;

    if (manualPosition === 'start') {
      targetIndex = 0;
    } else if (manualPosition === 'end') {
      targetIndex = localItems.length;
    } else if (manualPosition === 'custom') {
      const pos = Number(manualCustomPosition);
      targetIndex = isNaN(pos) ? localItems.length : Math.max(0, Math.min(pos - 1, localItems.length));
    }

    updatedList.splice(targetIndex, 0, newItem);
    updatedList.forEach((it, idx) => {
      it.sort_order = idx + 1;
    });

    applySchedule(updatedList);
    setIsAddManualModalOpen(false);
    onShowToast(`Tarefa "${finalKey}" incluída na posição #${targetIndex + 1} da fila do plano!`, 'success');
  };

  // Limpar datas de histórico (datas traçadas / riscadas)
  const handleClearHistoricalDates = async () => {
    if (localItems.length === 0) return;

    try {
      setIsSavingPlan(true);

      const itemsToSave = localItems.map((item) => {
        const meta = { ...(item.metadata || {}) };
        delete meta.previous_start_date;
        delete meta.previous_end_date;
        return {
          ...item,
          metadata: meta,
        };
      });

      const res = await fetch(`/api/projects/${encodeURIComponent(selectedProjectKey)}/plan`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: itemsToSave }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Erro ao limpar datas alteradas no servidor.');
      }

      const data = await res.json();
      setServerItems(data.items);
      setLocalItems(data.items);
      setHasUnsavedChanges(false);
      onShowToast('Datas de histórico (datas traçadas) apagadas com sucesso!', 'success');
    } catch (err: any) {
      console.error(err);
      onShowToast(err.message || 'Erro ao limpar datas alteradas.', 'error');
    } finally {
      setIsSavingPlan(false);
    }
  };

  // Open modal to edit plan item
  const handleOpenEditModal = (item: ScheduledPlanItem) => {
    const baseItem = localItems.find((i) => i.id === item.id || i.issue_key === item.issue_key) || item;
    setEditingItem(baseItem);
    setEditEstimateHours(baseItem.estimate_hours);
    setEditAssignee(baseItem.assignee_name);
    const currentFixed = baseItem.fixed_start_date || baseItem.metadata?.fixed_start_date || '';
    setEditFixedStartDate(currentFixed ? currentFixed.substring(0, 10) : '');
    setEditSummary(baseItem.summary);
    setEditStatus(baseItem.status || 'Planejado');
    setEditIndustry(baseItem.metadata?.industry || '');
    setEditCanal(baseItem.metadata?.canal || '');
    setEditExecutionStatus(getTaskExecutionState(baseItem).status);
  };

  // Confirm edit of plan item
  const handleConfirmEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;

    if (!editEstimateHours || editEstimateHours <= 0) {
      onShowToast('Informe uma estimativa de horas válida (maior que 0).', 'error');
      return;
    }

    if (!editAssignee.trim()) {
      onShowToast('Selecione quem irá executar a demanda.', 'error');
      return;
    }

    const isManual = Boolean(editingItem.metadata?.isManual || editingItem.metadata?.isExternal);
    if (isManual && !editSummary.trim()) {
      onShowToast('Informe o resumo / título da demanda.', 'error');
      return;
    }

    const fixedStart = editFixedStartDate.trim() || null;

    const updatedList = localItems.map((item) => {
      if (item.id === editingItem.id || item.issue_key === editingItem.issue_key) {
        const newMeta = { ...(item.metadata || {}) };
        newMeta.execution_status = editExecutionStatus;
        newMeta.fixed_start_date = fixedStart;

        let updatedStatus = item.status;
        if (editExecutionStatus === 'completed') {
          updatedStatus = 'Concluída';
          newMeta.displayStatus = 'Concluída';
          if (!newMeta.completed_at) newMeta.completed_at = new Date().toISOString();
        } else if (editExecutionStatus === 'started') {
          updatedStatus = 'Iniciada';
          newMeta.displayStatus = 'Iniciada';
          if (!newMeta.started_at) newMeta.started_at = new Date().toISOString();
        } else {
          updatedStatus = isManual ? (editStatus.trim() || 'Planejado') : (newMeta.rawStatus || 'Planejado');
          newMeta.displayStatus = updatedStatus;
          delete newMeta.completed_at;
          delete newMeta.started_at;
        }

        if (isManual) {
          if (editIndustry.trim()) newMeta.industry = editIndustry.trim();
          else delete newMeta.industry;
          if (editCanal.trim()) newMeta.canal = editCanal.trim();
          else delete newMeta.canal;
          if (editExecutionStatus === 'not_started') {
            newMeta.displayStatus = editStatus.trim() || 'Planejado';
            newMeta.rawStatus = editStatus.trim() || 'Planejado';
          }
        }
        return {
          ...item,
          summary: isManual ? editSummary.trim() : item.summary,
          status: updatedStatus,
          estimate_hours: Number(editEstimateHours),
          assignee_name: editAssignee.trim(),
          fixed_start_date: fixedStart,
          metadata: newMeta,
        };
      }
      return item;
    });

    applySchedule(updatedList);
    setEditingItem(null);
    onShowToast(`Demanda ${editingItem.issue_key} atualizada e cronograma recalculado!`, 'success');
  };

  // Alterna diretamente o status de execução de uma tarefa (Não Iniciada / Iniciada / Concluída)
  const handleUpdateTaskExecutionStatus = (
    itemToUpdate: ScheduledPlanItem,
    newExecutionStatus: ExecutionStatus
  ) => {
    setOpenStatusMenuId(null);
    const updatedList = localItems.map((item) => {
      if (item.id === itemToUpdate.id || item.issue_key === itemToUpdate.issue_key) {
        const meta = { ...(item.metadata || {}) };
        meta.execution_status = newExecutionStatus;

        let newStatus = item.status;
        if (newExecutionStatus === 'completed') {
          newStatus = 'Concluída';
          meta.completed_at = new Date().toISOString();
          meta.displayStatus = 'Concluída';
        } else if (newExecutionStatus === 'started') {
          newStatus = 'Iniciada';
          meta.started_at = new Date().toISOString();
          meta.displayStatus = 'Iniciada';
        } else {
          newStatus = meta.rawStatus || 'Planejado';
          meta.displayStatus = meta.rawStatus || 'Planejado';
          delete meta.completed_at;
          delete meta.started_at;
        }

        return {
          ...item,
          status: newStatus,
          metadata: meta,
        };
      }
      return item;
    });

    setLocalItems(updatedList);
    setHasUnsavedChanges(true);

    const statusLabel =
      newExecutionStatus === 'completed'
        ? 'Concluída'
        : newExecutionStatus === 'started'
        ? 'Iniciada'
        : 'Não Iniciada';
    onShowToast(`Demanda ${itemToUpdate.issue_key} marcada como "${statusLabel}". Clique em "Salvar Alterações" para gravar.`, 'info');
  };

  // Object for JiraCard representation in editing modal
  const editingDemand: JiraDemand | null = useMemo(() => {
    if (!editingItem) return null;
    const meta = editingItem.metadata || {};
    return {
      id: editingItem.id,
      key: editingItem.issue_key,
      summary: editingItem.summary,
      duedate: meta.duedate || '',
      project: meta.project || { key: activeProject?.key || 'NEO', name: activeProject?.name || 'Neogrid' },
      rawStatus: meta.rawStatus || editingItem.status || '',
      displayStatus: meta.displayStatus || editingItem.status || 'Planejado',
      assignee: editAssignee ? { displayName: editAssignee } : null,
      epic: meta.epic || null,
      industry: meta.industry || null,
      layout: meta.layout || null,
      isBlocked: meta.isBlocked || false,
      blockedReason: meta.blockedReason || null,
      url: meta.url || `https://sysmiddle.atlassian.net/browse/${editingItem.issue_key}`,
    };
  }, [editingItem, editAssignee, activeProject]);

  // Object for JiraCard representation in sync Jira modal
  const syncJiraDemand: JiraDemand | null = useMemo(() => {
    if (!syncJiraItem) return null;
    const meta = syncJiraItem.metadata || {};
    return {
      id: syncJiraItem.id,
      key: syncJiraItem.issue_key,
      summary: syncJiraItem.summary,
      duedate: meta.duedate || '',
      project: meta.project || { key: activeProject?.key || 'NEO', name: activeProject?.name || 'Neogrid' },
      rawStatus: meta.rawStatus || syncJiraItem.status || '',
      displayStatus: meta.displayStatus || syncJiraItem.status || 'Planejado',
      assignee: syncJiraItem.assignee_name ? { displayName: syncJiraItem.assignee_name } : null,
      epic: meta.epic || null,
      industry: meta.industry || null,
      layout: meta.layout || null,
      isBlocked: meta.isBlocked || false,
      blockedReason: meta.blockedReason || null,
      url: meta.url || `https://sysmiddle.atlassian.net/browse/${syncJiraItem.issue_key}`,
    };
  }, [syncJiraItem, activeProject]);

  // Abrir modal de sincronização de datas com o Jira
  const handleOpenSyncJiraModal = (item: ScheduledPlanItem) => {
    setSyncJiraItem(item);
    setSyncJiraComment('');
  };

  // Confirmar sincronização de datas com a API do Jira
  const handleConfirmSyncJira = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!syncJiraItem) return;

    try {
      setIsSyncingJira(true);
      const res = await fetch(
        `/api/projects/${encodeURIComponent(selectedProjectKey)}/jira-issue/${encodeURIComponent(syncJiraItem.issue_key)}/sync-dates`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            startDate: syncJiraItem.start_date,
            endDate: syncJiraItem.end_date,
            comment: syncJiraComment.trim() || undefined,
          }),
        }
      );

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Erro ao sincronizar datas no Jira.');
      }

      const data = await res.json();

      // Atualiza localItems com a nova data limite (duedate = end_date)
      setLocalItems((prev) =>
        prev.map((it) => {
          if (it.id === syncJiraItem.id || it.issue_key === syncJiraItem.issue_key) {
            return {
              ...it,
              metadata: {
                ...(it.metadata || {}),
                duedate: syncJiraItem.end_date,
              },
            };
          }
          return it;
        })
      );

      // Atualiza serverItems também para manter sincronizado com a base
      setServerItems((prev) =>
        prev.map((it) => {
          if (it.id === syncJiraItem.id || it.issue_key === syncJiraItem.issue_key) {
            return {
              ...it,
              metadata: {
                ...(it.metadata || {}),
                duedate: syncJiraItem.end_date,
              },
            };
          }
          return it;
        })
      );

      setSyncJiraItem(null);
      setSyncJiraComment('');
      const successMsg = isClientView
        ? `Data de entrega da demanda ${syncJiraItem.issue_key} (${format(parseISO(syncJiraItem.end_date), 'dd/MM/yyyy')}) sincronizada no Jira com sucesso!`
        : (data.message || `Datas da demanda ${syncJiraItem.issue_key} sincronizadas no Jira com sucesso!`);
      onShowToast(successMsg, 'success');
    } catch (err: any) {
      console.error(err);
      onShowToast(err.message || 'Erro ao sincronizar datas com o Jira.', 'error');
    } finally {
      setIsSyncingJira(false);
    }
  };

  // Save changes to database
  const handleSavePlan = async () => {
    try {
      setIsSavingPlan(true);

      const itemsToSave = localItems.map((item) => {
        const baseItem = serverItemMap.get(item.issue_key) || (item.id ? serverItemMap.get(item.id) : undefined);
        const meta = { ...(item.metadata || {}) };
        if (baseItem) {
          if (baseItem.start_date !== item.start_date) {
            meta.previous_start_date = baseItem.start_date;
          }
          if (baseItem.end_date !== item.end_date) {
            meta.previous_end_date = baseItem.end_date;
          }
        }
        if (meta.previous_start_date === item.start_date) {
          delete meta.previous_start_date;
        }
        if (meta.previous_end_date === item.end_date) {
          delete meta.previous_end_date;
        }
        return {
          ...item,
          metadata: meta,
        };
      });

      const res = await fetch(`/api/projects/${encodeURIComponent(selectedProjectKey)}/plan`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: itemsToSave }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Erro ao persistir plano no servidor.');
      }

      const data = await res.json();
      setServerItems(data.items);
      setLocalItems(data.items);
      setHasUnsavedChanges(false);
      onShowToast('Plano de projeto salvo com sucesso!', 'success');
      // Invalidate backlog cache so added demands disappear from backlog
      loadBacklog(selectedProjectKey);
      loadProjectLogs(selectedProjectKey);
    } catch (err: any) {
      console.error(err);
      onShowToast(err.message || 'Falha ao salvar plano de projeto.', 'error');
    } finally {
      setIsSavingPlan(false);
    }
  };

  // Discard changes and revert to server state
  const handleDiscardChanges = () => {
    setLocalItems(serverItems);
    setHasUnsavedChanges(false);
    onShowToast('Alterações descartadas. Plano restaurado para o estado salvo.', 'info');
  };

  // Toggle Accordions in Backlog
  const handleToggleAccordion = (status: string) => {
    setOpenAccordions((prev) => ({ ...prev, [status]: !prev[status] }));
  };

  const handleExpandAll = () => {
    if (!backlogData) return;
    const allOpen: Record<string, boolean> = {};
    backlogData.groups.forEach((g) => {
      allOpen[g.status] = true;
    });
    setOpenAccordions(allOpen);
  };

  const handleCollapseAll = () => {
    setOpenAccordions({});
  };

  // Itens para exibição: quando o modo cliente está ativo, recalcula o cronograma com as horas acrescidas pelo percentual e aplica os dias úteis adicionais de entrega
  const displayPlanItems = useMemo(() => {
    if (!isClientView) {
      return localItems;
    }

    const markupPercent = Number(settings.client_hours_markup_percent) || 0;
    const bufferDays =
      settings.client_delivery_buffer_days !== undefined
        ? Math.max(0, Number(settings.client_delivery_buffer_days) || 0)
        : 1;

    // 1. Aplica o percentual configurado na quantidade de horas de cada demanda
    const clientInputs: PlanItemInput[] = localItems.map((item) => {
      const adjustedHours =
        markupPercent > 0
          ? Math.round(item.estimate_hours * (1 + markupPercent / 100) * 10) / 10
          : item.estimate_hours;

      return {
        ...item,
        estimate_hours: adjustedHours,
      };
    });

    // 2. Recalcula completamente as datas de início e fim do plano considerando as novas horas
    const recalculated = calculatePlanSchedule(clientInputs, settings);

    // 3. Aplica os dias úteis adicionais na data de entrega (buffer), se configurado > 0
    if (bufferDays <= 0) {
      return recalculated;
    }

    return recalculated.map((item) => {
      const origEndDate = parseISO(item.end_date);
      const adjustedEndDate = addWorkingDays(origEndDate, bufferDays, holidaySet);
      const adjustedEndStr = format(adjustedEndDate, 'yyyy-MM-dd');
      const adjustedWorkingDays = countWorkingDays(item.start_date, adjustedEndStr, holidaySet);

      return {
        ...item,
        end_date: adjustedEndStr,
        working_days: adjustedWorkingDays,
      };
    });
  }, [localItems, isClientView, holidaySet, settings]);

  // Itens salvos transformados para o modo de exibição atual (para comparação de datas de início e fim)
  const serverDisplayItems = useMemo(() => {
    if (!isClientView) {
      return serverItems;
    }

    const markupPercent = Number(settings.client_hours_markup_percent) || 0;
    const bufferDays =
      settings.client_delivery_buffer_days !== undefined
        ? Math.max(0, Number(settings.client_delivery_buffer_days) || 0)
        : 1;

    const clientInputs: PlanItemInput[] = serverItems.map((item) => {
      const adjustedHours =
        markupPercent > 0
          ? Math.round(item.estimate_hours * (1 + markupPercent / 100) * 10) / 10
          : item.estimate_hours;

      return {
        ...item,
        estimate_hours: adjustedHours,
      };
    });

    const recalculated = calculatePlanSchedule(clientInputs, settings);

    if (bufferDays <= 0) {
      return recalculated;
    }

    return recalculated.map((item) => {
      const origEndDate = parseISO(item.end_date);
      const adjustedEndDate = addWorkingDays(origEndDate, bufferDays, holidaySet);
      const adjustedEndStr = format(adjustedEndDate, 'yyyy-MM-dd');
      const adjustedWorkingDays = countWorkingDays(item.start_date, adjustedEndStr, holidaySet);

      return {
        ...item,
        end_date: adjustedEndStr,
        working_days: adjustedWorkingDays,
      };
    });
  }, [serverItems, isClientView, holidaySet, settings]);

  const serverDisplayItemMap = useMemo(() => {
    const map = new Map<string, ScheduledPlanItem>();
    for (const it of serverDisplayItems) {
      if (it.id) map.set(it.id, it);
      if (it.issue_key) map.set(it.issue_key, it);
    }
    return map;
  }, [serverDisplayItems]);

  // Metrics computation for Gantt & Header
  const totalPlannedHours = useMemo(() => {
    return Math.round(displayPlanItems.reduce((acc, it) => acc + it.estimate_hours, 0) * 10) / 10;
  }, [displayPlanItems]);

  const uniqueAssignees = useMemo(() => {
    return Array.from(new Set(displayPlanItems.map((i) => i.assignee_name))).filter(Boolean);
  }, [displayPlanItems]);

  const projectedEndDate = useMemo(() => {
    if (displayPlanItems.length === 0) return null;
    let maxDateStr = displayPlanItems[0].end_date;
    for (const item of displayPlanItems) {
      if (item.end_date > maxDateStr) {
        maxDateStr = item.end_date;
      }
    }
    return maxDateStr;
  }, [displayPlanItems]);

  // Estatísticas de execução do plano (Não iniciadas, Iniciadas, Concluídas, Atrasadas por não início)
  const executionStats = useMemo(() => {
    let started = 0;
    let completed = 0;
    let delayedNotStarted = 0;
    for (const it of localItems) {
      const st = getTaskExecutionState(it);
      if (st.status === 'completed') completed++;
      else if (st.status === 'started') started++;
      if (st.isDelayedStart) delayedNotStarted++;
    }
    const notStarted = Math.max(0, localItems.length - started - completed);
    return { started, completed, notStarted, delayedNotStarted };
  }, [localItems]);

  // -------------------------------------------------------------
  // FILTERING & ONGOING PROJECT LOGIC
  // -------------------------------------------------------------
  const periodWindow = useMemo<{ startDate: string; endDate: string } | null>(() => {
    if (filterPeriod === 'all') return null;

    const today = new Date();
    if (filterPeriod === 'current_window') {
      // Visão Atual: 15 dias corridos atrás até 45 dias corridos à frente
      return {
        startDate: format(subDays(today, 15), 'yyyy-MM-dd'),
        endDate: format(addDays(today, 45), 'yyyy-MM-dd'),
      };
    }
    if (filterPeriod === 'this_month') {
      // Mês Atual
      return {
        startDate: format(startOfMonth(today), 'yyyy-MM-dd'),
        endDate: format(endOfMonth(today), 'yyyy-MM-dd'),
      };
    }
    if (filterPeriod === 'next_30') {
      // Próximos 30 dias a partir de hoje
      return {
        startDate: format(today, 'yyyy-MM-dd'),
        endDate: format(addDays(today, 30), 'yyyy-MM-dd'),
      };
    }
    if (filterPeriod === 'next_60') {
      // Próximos 60 dias a partir de hoje
      return {
        startDate: format(today, 'yyyy-MM-dd'),
        endDate: format(addDays(today, 60), 'yyyy-MM-dd'),
      };
    }
    if (filterPeriod === 'custom') {
      if (customStartDate && customEndDate) {
        return {
          startDate: customStartDate <= customEndDate ? customStartDate : customEndDate,
          endDate: customStartDate <= customEndDate ? customEndDate : customStartDate,
        };
      } else if (customStartDate) {
        return {
          startDate: customStartDate,
          endDate: '2099-12-31',
        };
      } else if (customEndDate) {
        return {
          startDate: '2000-01-01',
          endDate: customEndDate,
        };
      }
    }
    return null;
  }, [filterPeriod, customStartDate, customEndDate]);

  const hasActiveFilters = useMemo(() => {
    return (
      filterStatus !== 'all' ||
      filterHideCompleted ||
      filterAssignee !== 'all' ||
      filterPeriod !== 'all' ||
      Boolean(customStartDate) ||
      Boolean(customEndDate) ||
      filterSearch.trim() !== ''
    );
  }, [
    filterStatus,
    filterHideCompleted,
    filterAssignee,
    filterPeriod,
    customStartDate,
    customEndDate,
    filterSearch,
  ]);

  const handleClearAllFilters = () => {
    setFilterStatus('all');
    setFilterHideCompleted(false);
    setFilterAssignee('all');
    setFilterPeriod('all');
    setCustomStartDate('');
    setCustomEndDate('');
    setFilterSearch('');
  };

  // Dynamic Anchor Date: alinhar marco zero do plano com a data de hoje
  const handleAlignPlanToToday = async () => {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    if (settings.plan_start_date === todayStr) {
      onShowToast(
        `A data inicial do plano já está alinhada com hoje (${format(new Date(), 'dd/MM/yyyy')}).`,
        'info'
      );
      return;
    }

    if (
      !window.confirm(
        `Deseja atualizar a data inicial do plano para hoje (${format(new Date(), 'dd/MM/yyyy')})?\n\nIsso recalculará o cronograma das demandas a partir de hoje sem alterar a ordem das tarefas.`
      )
    ) {
      return;
    }

    try {
      setIsAligningToday(true);
      const updatedSettings: ProjectSettings = {
        ...settings,
        plan_start_date: todayStr,
      };

      const res = await fetch(`/api/projects/${encodeURIComponent(selectedProjectKey)}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedSettings),
      });

      if (!res.ok) throw new Error('Falha ao atualizar data inicial nas configurações.');
      const savedSettings = await res.json();
      setSettings(savedSettings);

      const recalculated = calculatePlanSchedule(localItems, savedSettings);
      setLocalItems(recalculated);
      setServerItems(recalculated);
      setHasUnsavedChanges(false);

      onShowToast(
        `Cronograma alinhado a partir de hoje (${format(new Date(), 'dd/MM/yyyy')}) com sucesso!`,
        'success'
      );
    } catch (err: any) {
      console.error(err);
      onShowToast(err.message || 'Erro ao alinhar cronograma com hoje.', 'error');
    } finally {
      setIsAligningToday(false);
    }
  };

  // Lista de itens filtrados para exibição no Gantt, Tabela e Exportações
  const filteredPlanItems = useMemo(() => {
    let result = displayPlanItems;

    // 1. Ocultar Concluídas
    if (filterHideCompleted) {
      result = result.filter((it) => {
        const exec = getTaskExecutionState(it);
        return exec.status !== 'completed';
      });
    }

    // 2. Filtro de Status
    if (filterStatus !== 'all') {
      result = result.filter((it) => {
        const exec = getTaskExecutionState(it);
        if (filterStatus === 'pending') {
          return exec.status === 'not_started' || exec.status === 'started';
        }
        return exec.status === filterStatus;
      });
    }

    // 3. Filtro por Executor
    if (filterAssignee !== 'all') {
      const cleanAssignee = filterAssignee.trim().toLowerCase();
      result = result.filter(
        (it) => it.assignee_name.trim().toLowerCase() === cleanAssignee
      );
    }

    // 4. Filtro por Janela Temporal (intersecção com o período selecionado)
    if (periodWindow) {
      result = result.filter((it) => {
        return it.start_date <= periodWindow.endDate && it.end_date >= periodWindow.startDate;
      });
    }

    // 5. Busca textual rápida
    if (filterSearch.trim()) {
      const q = filterSearch.trim().toLowerCase();
      result = result.filter((it) => {
        const keyMatch = it.issue_key.toLowerCase().includes(q);
        const sumMatch = it.summary.toLowerCase().includes(q);
        const assigneeMatch = it.assignee_name.toLowerCase().includes(q);
        const jiraAssigneeMatch = (it.metadata?.jira_assignee || '').toLowerCase().includes(q);
        const indMatch = (it.metadata?.industry || '').toLowerCase().includes(q);
        const canalMatch = (it.metadata?.canal || '').toLowerCase().includes(q);
        const layoutMatch = (it.metadata?.layout || '').toLowerCase().includes(q);
        const epicMatch = (
          it.metadata?.epic?.summary ||
          it.metadata?.epic?.name ||
          it.metadata?.epic?.key ||
          ''
        )
          .toLowerCase()
          .includes(q);
        return (
          keyMatch ||
          sumMatch ||
          assigneeMatch ||
          jiraAssigneeMatch ||
          indMatch ||
          canalMatch ||
          layoutMatch ||
          epicMatch
        );
      });
    }

    return result;
  }, [
    displayPlanItems,
    filterHideCompleted,
    filterStatus,
    filterAssignee,
    periodWindow,
    filterSearch,
  ]);

  const filteredPlannedHours = useMemo(() => {
    return Math.round(filteredPlanItems.reduce((acc, it) => acc + it.estimate_hours, 0) * 10) / 10;
  }, [filteredPlanItems]);

  // Gantt Timeline Dates Calculation (Exclui sábados e domingos)
  const ganttTimelineDays = useMemo(() => {
    let minDateStr: string;
    let maxDateStr: string;

    if (periodWindow) {
      minDateStr = periodWindow.startDate;
      maxDateStr = periodWindow.endDate;
    } else {
      if (filteredPlanItems.length === 0) return [];

      minDateStr = settings.plan_start_date || filteredPlanItems[0].start_date;
      maxDateStr = filteredPlanItems[0].end_date;

      for (const it of filteredPlanItems) {
        if (it.start_date < minDateStr) minDateStr = it.start_date;
        if (it.end_date > maxDateStr) maxDateStr = it.end_date;
      }
    }

    const startDate = parseISO(minDateStr);
    const maxEnd = parseISO(maxDateStr);

    if (startDate > maxEnd) return [];

    let curr = startDate;
    const days: Date[] = [];

    // Itera dia a dia incluindo apenas dias de semana (segunda a sexta)
    while (curr <= maxEnd) {
      const dayOfWeek = curr.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) { // 0 = Domingo, 6 = Sábado
        days.push(curr);
      }
      curr = addDays(curr, 1);
    }

    // Se não for janela fechada personalizada, adiciona 3 dias úteis de margem ao final para respirar
    if (!periodWindow || filterPeriod === 'current_window') {
      let bufferCount = 0;
      while (bufferCount < 3) {
        const dayOfWeek = curr.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
          days.push(curr);
          bufferCount++;
        }
        curr = addDays(curr, 1);
      }
    }

    return days;
  }, [filteredPlanItems, settings.plan_start_date, periodWindow, filterPeriod]);

  // Mapa de datas (YYYY-MM-DD) para o índice da coluna correspondente no Gantt
  const timelineDayIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    ganttTimelineDays.forEach((d, idx) => {
      map.set(format(d, 'yyyy-MM-dd'), idx);
    });
    return map;
  }, [ganttTimelineDays]);

  // -------------------------------------------------------------
  // EXPORT FUNCTIONS: JPG, PDF, EXCEL
  // -------------------------------------------------------------

  const handleExportJpg = async (target: 'gantt' | 'table' | 'all' = 'gantt') => {
    try {
      setIsExporting('jpg');
      setIsJpgDropdownOpen(false);
      await new Promise((r) => setTimeout(r, 200));

      const container = pdfExportContainerRef.current;
      if (!container) {
        throw new Error('Contêiner de exportação não encontrado.');
      }

      let slidesToExport: HTMLElement[] = [];
      let defaultPrefix = '';

      if (target === 'gantt') {
        slidesToExport = Array.from(container.querySelectorAll<HTMLElement>('.pdf-gantt-slide'));
        defaultPrefix = 'cronograma-gantt';
      } else if (target === 'table') {
        slidesToExport = Array.from(container.querySelectorAll<HTMLElement>('.pdf-table-slide'));
        defaultPrefix = 'lista-demandas';
      } else {
        slidesToExport = Array.from(container.querySelectorAll<HTMLElement>('.pdf-export-slide'));
        defaultPrefix = 'projeto-slide';
      }

      if (slidesToExport.length === 0) {
        throw new Error(`Nenhum slide encontrado para exportar (${target}).`);
      }

      const projCleanName = (activeProject?.name || selectedProjectKey).toLowerCase().replace(/\s+/g, '-');
      const dateStr = format(new Date(), 'yyyy-MM-dd');

      for (let i = 0; i < slidesToExport.length; i++) {
        const slideEl = slidesToExport[i];
        let filePrefix = defaultPrefix;
        if (target === 'all') {
          filePrefix = slideEl.classList.contains('pdf-gantt-slide')
            ? 'cronograma-gantt'
            : 'lista-demandas';
        }

        const dataUrl = await toJpeg(slideEl, {
          quality: 0.98,
          pixelRatio: 2.5,
          backgroundColor: '#ffffff',
          width: 1024,
          height: 576,
          cacheBust: true,
        });

        const link = document.createElement('a');
        const suffix = slidesToExport.length > 1 ? `_parte${i + 1}` : '';
        link.download = `${filePrefix}-${projCleanName}${suffix}_${dateStr}.jpg`;
        link.href = dataUrl;
        link.click();
      }

      const labelMsg = target === 'gantt' ? 'Gantt' : target === 'table' ? 'Lista de Demandas' : 'Gantt e Lista de Demandas';
      onShowToast(`Imagem JPG (${labelMsg}) exportada com sucesso no padrão SysMiddle!`, 'success');
    } catch (err: any) {
      console.error('[JPG Export] Erro ao exportar:', err);
      onShowToast('Falha ao exportar imagem: ' + (err.message || ''), 'error');
    } finally {
      setIsExporting(null);
    }
  };

  // Logs filtrados respeitando exatamente os filtros aplicados na tela (filteredPlanItems)
  const filteredLogs = useMemo(() => {
    if (!changeLogs || changeLogs.length === 0) return [];
    const allowedKeys = new Set(filteredPlanItems.map((it) => it.issue_key));
    return changeLogs.filter((log) => allowedKeys.has(log.issue_key));
  }, [changeLogs, filteredPlanItems]);

  const formatLogItemDetailText = (log: ProjectChangeLog) => {
    if (log.event_type === 'order_changed') {
      return log.description;
    }

    const oldVal = log.old_value || {};
    const newVal = log.new_value || {};

    if (!oldVal.start_date || !newVal.start_date) {
      return log.description;
    }

    const sOld = format(parseISO(oldVal.start_date), 'dd/MM/yyyy');
    const sNew = format(parseISO(newVal.start_date), 'dd/MM/yyyy');

    if (!isClientView) {
      const eOld = format(parseISO(oldVal.end_date), 'dd/MM/yyyy');
      const eNew = format(parseISO(newVal.end_date), 'dd/MM/yyyy');
      return `Início: ${sOld} ➔ ${sNew} | Fim: ${eOld} ➔ ${eNew}`;
    }

    // Modo Cliente
    const bufferDays =
      settings.client_delivery_buffer_days !== undefined
        ? Math.max(0, Number(settings.client_delivery_buffer_days) || 0)
        : 1;

    let eOldDate = parseISO(oldVal.end_date);
    let eNewDate = parseISO(newVal.end_date);
    if (bufferDays > 0) {
      eOldDate = addWorkingDays(eOldDate, bufferDays, holidaySet);
      eNewDate = addWorkingDays(eNewDate, bufferDays, holidaySet);
    }

    const eOld = format(eOldDate, 'dd/MM/yyyy');
    const eNew = format(eNewDate, 'dd/MM/yyyy');
    return `Início: ${sOld} ➔ ${sNew} | Entrega Prevista: ${eOld} ➔ ${eNew}`;
  };

  const handleExportTextLog = () => {
    try {
      const list = filteredLogs;
      const projName = activeProject?.name || selectedProjectKey;
      const nowFormatted = format(new Date(), 'dd/MM/yyyy HH:mm:ss');
      const modeLabel = isClientView
        ? 'Modo Cliente (Com Buffer e Margem)'
        : 'Modo Interno (Datas Reais / Técnicas)';

      const orderCount = list.filter((l) => l.event_type === 'order_changed').length;
      const dateCount = list.filter((l) => l.event_type === 'date_changed').length;
      const affectedIssues = new Set(list.map((l) => l.issue_key)).size;

      let text = `================================================================================\n`;
      text += `LOG DE AUDITORIA E ALTERAÇÕES - ${projName.toUpperCase()} (${selectedProjectKey})\n`;
      text += `Data de Exportação: ${nowFormatted}\n`;
      text += `Visualização: ${modeLabel}\n`;
      text += `Filtros Aplicados na Tela: ${hasActiveFilters ? 'Sim (Exibindo subconjunto filtrado)' : 'Nenhum (Todos os itens)'}\n`;
      text += `Total de Eventos: ${list.length}\n`;
      text += `================================================================================\n\n`;

      text += `[RESUMO DOS EVENTOS]\n`;
      text += `- Alterações de Ordem na Fila: ${orderCount}\n`;
      text += `- Alterações de Datas: ${dateCount}\n`;
      text += `- Demandas Únicas Impactadas: ${affectedIssues}\n\n`;

      text += `--------------------------------------------------------------------------------\n`;
      text += `HISTÓRICO DETALHADO DE EVENTOS\n`;
      text += `--------------------------------------------------------------------------------\n\n`;

      if (list.length === 0) {
        text += `Nenhum registro de alteração de ordem ou data encontrado para as demandas filtradas.\n`;
      } else {
        list.forEach((item, idx) => {
          let dateStr = item.created_at;
          try {
            dateStr = format(parseISO(item.created_at), 'dd/MM/yyyy HH:mm:ss');
          } catch {
            // fallback
          }
          const typeLabel = item.event_type === 'order_changed' ? 'ALTERAÇÃO DE ORDEM' : 'ALTERAÇÃO DE DATA';
          const detail = formatLogItemDetailText(item);

          text += `[#${idx + 1}] [${dateStr}] [${typeLabel}]\n`;
          text += `Demanda:     ${item.issue_key} - ${item.summary}\n`;
          text += `Responsável: ${item.assignee_name || 'Não atribuído'}\n`;
          text += `Detalhes:    ${detail}\n`;
          text += `--------------------------------------------------------------------------------\n`;
        });
      }

      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const projClean = (activeProject?.name || selectedProjectKey).toLowerCase().replace(/\s+/g, '-');
      link.download = `log-alteracoes-${projClean}_${format(new Date(), 'yyyy-MM-dd')}.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      onShowToast('Log em modo texto (.txt) exportado com sucesso!', 'success');
    } catch (err: any) {
      console.error(err);
      onShowToast('Erro ao exportar log de texto: ' + (err.message || ''), 'error');
    }
  };

  const handleExportPdf = async (mode: 'plan' | 'log' | 'all' = 'plan') => {
    try {
      setIsExporting('pdf');
      setPdfExportMode(mode);
      // Aguardar renderização no DOM do template com o novo modo
      await new Promise((r) => setTimeout(r, 450));

      const container = pdfExportContainerRef.current;
      if (!container) {
        throw new Error('Contêiner de exportação PDF não encontrado.');
      }

      const slides = container.querySelectorAll<HTMLElement>('.pdf-export-slide');
      if (slides.length === 0) {
        throw new Error('Nenhum slide encontrado para gerar o PDF.');
      }

      // Formato Widescreen 16:9 em milímetros: 297 x 167.0625 mm
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: [297, 167.0625],
      });

      for (let i = 0; i < slides.length; i++) {
        const slideEl = slides[i];
        const imgDataUrl = await toPng(slideEl, {
          quality: 1,
          pixelRatio: 2.5,
          backgroundColor: '#ffffff',
          width: 1024,
          height: 576,
          cacheBust: true,
        });

        if (i > 0) {
          doc.addPage([297, 167.0625], 'landscape');
        }

        doc.addImage(imgDataUrl, 'PNG', 0, 0, 297, 167.0625, undefined, 'FAST');
      }

      const projCleanName = (activeProject?.name || selectedProjectKey).toLowerCase().replace(/\s+/g, '-');
      const suffix = mode === 'log' ? 'log-alteracoes' : mode === 'all' ? 'plano-e-log' : 'plano-cronograma';
      doc.save(`${suffix}-${projCleanName}_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
      
      const successMessage =
        mode === 'log'
          ? 'Log de alterações exportado em PDF com sucesso!'
          : mode === 'all'
          ? 'Plano e Log exportados em PDF com sucesso no padrão SysMiddle!'
          : 'Relatório PDF do plano exportado com sucesso no padrão SysMiddle!';
      onShowToast(successMessage, 'success');
    } catch (err: any) {
      console.error('[PDF Export] Erro ao exportar:', err);
      onShowToast('Falha ao exportar PDF: ' + (err.message || ''), 'error');
    } finally {
      setIsExporting(null);
    }
  };

  // Obter itens selecionados para o modal de inversão
  const swapItem1 = useMemo(() => {
    return localItems.find((i) => i.issue_key === swapItem1Key) || null;
  }, [localItems, swapItem1Key]);

  const swapItem2 = useMemo(() => {
    return localItems.find((i) => i.issue_key === swapItem2Key) || null;
  }, [localItems, swapItem2Key]);

  const handleExecuteSwap = async (saveImmediately: boolean = true) => {
    if (!swapItem1 || !swapItem2 || swapItem1.issue_key === swapItem2.issue_key) return;

    try {
      setIsSwapping(true);
      const idx1 = localItems.findIndex((it) => it.issue_key === swapItem1.issue_key);
      const idx2 = localItems.findIndex((it) => it.issue_key === swapItem2.issue_key);

      if (idx1 === -1 || idx2 === -1) {
        throw new Error('Uma das tarefas selecionadas não foi encontrada na fila.');
      }

      const reordered = [...localItems];
      const temp = reordered[idx1];
      reordered[idx1] = reordered[idx2];
      reordered[idx2] = temp;

      // Reindexar sort_order
      reordered.forEach((it, idx) => {
        it.sort_order = idx + 1;
      });

      const recalculated = calculatePlanSchedule(reordered, settings);

      if (!saveImmediately) {
        setLocalItems(recalculated);
        setHasUnsavedChanges(true);
        setIsSwapModalOpen(false);
        onShowToast(
          `Ordem invertida entre ${swapItem1.issue_key} e ${swapItem2.issue_key} na fila! Clique em Salvar Alterações para persistir.`,
          'info'
        );
        return;
      }

      // Inverter e salvar imediatamente no servidor
      setIsSavingPlan(true);
      const swapLogs = [
        {
          event_type: 'order_changed',
          issue_key: swapItem1.issue_key,
          summary: swapItem1.summary,
          assignee_name: swapItem1.assignee_name,
          old_value: { sort_order: swapItem1.sort_order },
          new_value: { sort_order: swapItem2.sort_order },
          description: `Inversão de ordem com ${swapItem2.issue_key}: Posição ${swapItem1.sort_order} ➔ Posição ${swapItem2.sort_order}`,
        },
        {
          event_type: 'order_changed',
          issue_key: swapItem2.issue_key,
          summary: swapItem2.summary,
          assignee_name: swapItem2.assignee_name,
          old_value: { sort_order: swapItem2.sort_order },
          new_value: { sort_order: swapItem1.sort_order },
          description: `Inversão de ordem com ${swapItem1.issue_key}: Posição ${swapItem2.sort_order} ➔ Posição ${swapItem1.sort_order}`,
        },
      ];

      const res = await fetch(`/api/projects/${encodeURIComponent(selectedProjectKey)}/plan`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: recalculated, logs: swapLogs }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Erro ao persistir inversão de tarefas.');
      }

      const data = await res.json();
      setServerItems(data.items);
      setLocalItems(data.items);
      setHasUnsavedChanges(false);
      setIsSwapModalOpen(false);
      await loadProjectLogs(selectedProjectKey);
      onShowToast(
        `Ordem invertida com sucesso entre ${swapItem1.issue_key} e ${swapItem2.issue_key}!`,
        'success'
      );
    } catch (err: any) {
      console.error(err);
      onShowToast(err.message || 'Erro ao inverter ordem de tarefas.', 'error');
    } finally {
      setIsSwapping(false);
      setIsSavingPlan(false);
    }
  };

  const handleExportExcel = () => {
    try {
      setIsExporting('excel');
      const rows = filteredPlanItems.map((item, idx) => {
        const isManual = Boolean(item.metadata?.isManual || item.metadata?.isExternal);
        const rawUser = item.metadata?.jira_assignee || item.metadata?.assignee?.displayName || item.assignee_name || '';
        const userFirstName = (!rawUser || rawUser.toLowerCase().includes('não atribuído') || rawUser.toLowerCase().includes('nao atribuido'))
          ? '-'
          : rawUser.trim().split(' ')[0];

        const row: any = {
          Ordem: idx + 1,
          'Chave / Código': item.issue_key,
          'Usuário': userFirstName,
          'Resumo da Demanda': item.summary,
          'Indústria': item.metadata?.industry || '-',
          'Canal de Distribuição': item.metadata?.canal || '-',
          Status: item.status || 'Planejado',
        };
        if (!isClientView) {
          row['Responsável / Executor'] = item.assignee_name;
          row['Estimativa (Horas)'] = item.estimate_hours;
        }
        row['Data Início'] = item.start_date;
        row['Data Fim'] = item.end_date;
        row['Link Jira'] = isManual ? '-' : (item.metadata?.url || `https://sysmiddle.atlassian.net/browse/${item.issue_key}`);
        return row;
      });

      const worksheet = XLSX.utils.json_to_sheet(rows);

      // Adjust column widths
      worksheet['!cols'] = isClientView
        ? [
            { wch: 8 },  // Ordem
            { wch: 14 }, // Chave
            { wch: 16 }, // Usuário
            { wch: 60 }, // Resumo
            { wch: 22 }, // Indústria
            { wch: 24 }, // Canal de Distribuição
            { wch: 18 }, // Status
            { wch: 14 }, // Data Início
            { wch: 14 }, // Data Fim
            { wch: 45 }, // Link Jira
          ]
        : [
            { wch: 8 },  // Ordem
            { wch: 14 }, // Chave
            { wch: 16 }, // Usuário
            { wch: 45 }, // Resumo
            { wch: 22 }, // Indústria
            { wch: 24 }, // Canal de Distribuição
            { wch: 18 }, // Status
            { wch: 22 }, // Responsável
            { wch: 16 }, // Estimativa
            { wch: 14 }, // Data Início
            { wch: 14 }, // Data Fim
            { wch: 45 }, // Link Jira
          ];

      const projCleanName = (activeProject?.name || selectedProjectKey).toLowerCase().replace(/\s+/g, '-');
      const sheetName = `Plano ${activeProject?.name || selectedProjectKey}`.substring(0, 31);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

      XLSX.writeFile(workbook, `cronograma-plano-${projCleanName}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
      onShowToast('Planilha Excel exportada com sucesso!', 'success');
    } catch (err) {
      console.error(err);
      onShowToast('Falha ao exportar planilha Excel.', 'error');
    } finally {
      setIsExporting(null);
    }
  };

  // Conjunto de chaves de demandas atualmente no plano (localItems)
  const plannedKeySet = useMemo(() => {
    return new Set(localItems.map((item) => item.issue_key.toUpperCase().trim()));
  }, [localItems]);

  // Contagem real de demandas no backlog ainda não adicionadas ao plano
  const actualBacklogCount = useMemo(() => {
    if (!backlogData) return 0;
    return backlogData.groups.reduce((sum, group) => {
      const remaining = group.issues.filter(
        (issue) => !plannedKeySet.has(issue.key.toUpperCase().trim())
      );
      return sum + remaining.length;
    }, 0);
  }, [backlogData, plannedKeySet]);

  // Filtra itens do backlog: remove as demandas que já estão no plano e aplica busca
  const filteredBacklogGroups = useMemo(() => {
    if (!backlogData) return [];

    const q = backlogSearch.toLowerCase().trim();

    return backlogData.groups
      .map((group) => {
        // Remove demandas que já foram adicionadas ao plano
        const unassignedIssues = group.issues.filter(
          (issue) => !plannedKeySet.has(issue.key.toUpperCase().trim())
        );

        const matched = q
          ? unassignedIssues.filter(
              (issue) =>
                issue.key.toLowerCase().includes(q) ||
                issue.summary.toLowerCase().includes(q) ||
                issue.assignee?.displayName.toLowerCase().includes(q)
            )
          : unassignedIssues;

        return {
          ...group,
          count: matched.length,
          issues: matched,
        };
      })
      .filter((g) => g.count > 0);
  }, [backlogData, backlogSearch, plannedKeySet]);

  return (
    <div className="space-y-5 animate-in fade-in duration-200 pb-16">
      {/* Top Header Card */}
      <div className="bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-600/20 border border-indigo-200 dark:border-indigo-500/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 flex-shrink-0 shadow-sm">
              <FolderKanban className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                {/* Project Selector Dropdown */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsProjectDropdownOpen((prev) => !prev)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700/80 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white transition-all shadow-sm active:scale-95 text-left"
                    title="Alternar entre planos cadastrados"
                  >
                    <Briefcase className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20">
                        {activeProject?.key || selectedProjectKey}
                      </span>
                      {activeProject?.jira_project_key && activeProject.jira_project_key !== activeProject.key && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                          Jira: {activeProject.jira_project_key}
                        </span>
                      )}
                      <span className="text-sm font-black tracking-tight text-slate-800 dark:text-white truncate max-w-[200px]">
                        {activeProject?.name || 'Carregando...'}
                      </span>
                    </div>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 ml-0.5" />
                  </button>

                  {/* Dropdown Menu */}
                  {isProjectDropdownOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-30"
                        onClick={() => setIsProjectDropdownOpen(false)}
                      />
                      <div className="absolute left-0 top-full mt-2 w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl z-40 p-2 space-y-1 animate-in fade-in zoom-in-95 duration-150">
                        <div className="px-2.5 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          Selecione o Plano Ativo
                        </div>
                        <div className="max-h-60 overflow-y-auto space-y-0.5 custom-scrollbar">
                          {projects.map((p) => {
                            const isSelected = p.key === selectedProjectKey;
                            return (
                              <button
                                key={p.key}
                                type="button"
                                onClick={() => handleSwitchProject(p.key)}
                                className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-left transition-all ${
                                  isSelected
                                    ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-bold border border-indigo-200 dark:border-indigo-500/30'
                                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
                                }`}
                              >
                                <div className="flex items-center gap-1.5 truncate">
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                                    {p.key}
                                  </span>
                                  {p.jira_project_key && p.jira_project_key !== p.key && (
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-800/60">
                                      Jira: {p.jira_project_key}
                                    </span>
                                  )}
                                  <span className="text-xs truncate">{p.name}</span>
                                </div>
                                {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 flex-shrink-0" />}
                              </button>
                            );
                          })}
                        </div>

                        <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                          <button
                            type="button"
                            onClick={() => {
                              setIsProjectDropdownOpen(false);
                              handleOpenNewProject();
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors"
                          >
                            <FolderPlus className="w-4 h-4" />
                            <span>+ Cadastrar Novo Plano</span>
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Edit Active Project Button */}
                <button
                  type="button"
                  onClick={handleOpenEditProject}
                  className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-300 dark:border-slate-700 transition-all shadow-sm active:scale-95"
                  title="Editar dados deste plano ou excluí-lo"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>

                {/* New Project Quick Button */}
                <button
                  type="button"
                  onClick={handleOpenNewProject}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 text-xs font-bold border border-indigo-200 dark:border-indigo-500/30 transition-all shadow-sm active:scale-95"
                  title="Cadastrar um novo plano no módulo"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Novo Plano</span>
                </button>
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {activeProject?.description || 'Capacidade produtiva, fila sequencial/paralela e cronograma Gantt com recálculo automático.'}
              </p>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="flex flex-wrap items-center gap-2.5">
            {!isClientView && (
              <div className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-500" />
                <div>
                  <span className="block text-[10px] text-slate-400 font-bold uppercase">Carga Total</span>
                  <span className="text-xs font-black text-slate-800 dark:text-white">
                    {hasActiveFilters ? `${filteredPlannedHours}h (${totalPlannedHours}h)` : `${totalPlannedHours}h`}
                  </span>
                </div>
              </div>
            )}

            <div className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-500" />
              <div>
                <span className="block text-[10px] text-slate-400 font-bold uppercase">Demandas</span>
                <span className="text-xs font-black text-slate-800 dark:text-white">
                  {hasActiveFilters ? `${filteredPlanItems.length} de ${localItems.length}` : localItems.length}
                </span>
              </div>
            </div>

            {!isClientView && (
              <div className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex items-center gap-2">
                <Users className="w-4 h-4 text-cyan-500" />
                <div>
                  <span className="block text-[10px] text-slate-400 font-bold uppercase">Executores</span>
                  <span className="text-xs font-black text-slate-800 dark:text-white">{uniqueAssignees.length}</span>
                </div>
              </div>
            )}

            <div className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-purple-500" />
              <div>
                <span className="block text-[10px] text-slate-400 font-bold uppercase">Término Previsto</span>
                <span className="text-xs font-black text-slate-800 dark:text-white">
                  {projectedEndDate ? format(parseISO(projectedEndDate), 'dd/MM/yyyy') : 'Sem itens'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Tab Switcher & Export Toolbar */}
        <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-950/60 p-1 rounded-xl border border-slate-200 dark:border-slate-800">
            <button
              onClick={() => setActiveTab('gantt')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'gantt'
                  ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <BarChart2 className="w-3.5 h-3.5" />
              <span>Plano & Gantt</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                {localItems.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('backlog')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'backlog'
                  ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <FolderKanban className="w-3.5 h-3.5" />
              <span>Backlog {activeProject?.name || activeProject?.key || 'Jira'}</span>
              {backlogData && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500/20 text-amber-700 dark:text-amber-300">
                  {actualBacklogCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('settings')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'settings'
                  ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <SettingsIcon className="w-3.5 h-3.5" />
              <span>Configurações</span>
            </button>
          </div>

          {/* Export & View Mode Buttons */}
          <div className="flex items-center gap-2" data-export-ignore="true">
            {activeTab === 'gantt' && (
              <button
                type="button"
                onClick={() => setIsClientView((prev) => !prev)}
                className={`p-2 rounded-xl border transition-all shadow-sm active:scale-95 flex items-center justify-center ${
                  isClientView
                    ? 'bg-indigo-50 border-indigo-200 text-indigo-600 dark:bg-indigo-950/50 dark:border-indigo-800 dark:text-indigo-400'
                    : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700'
                }`}
              >
                {isClientView ? (
                  <EyeOff className="w-3.5 h-3.5" />
                ) : (
                  <Eye className="w-3.5 h-3.5" />
                )}
              </button>
            )}

            {/* JPG Export Dropdown Selector */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsJpgDropdownOpen((prev) => !prev)}
                disabled={isExporting !== null || localItems.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold border border-slate-300 dark:border-slate-700 transition-all shadow-sm active:scale-95 disabled:opacity-50"
                title="Exportar como imagem JPG em alta resolução (Gantt ou Lista de Demandas)"
              >
                {isExporting === 'jpg' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500" />
                ) : (
                  <Image className="w-3.5 h-3.5 text-indigo-500" />
                )}
                <span>JPG</span>
                <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform duration-200 ${isJpgDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {isJpgDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setIsJpgDropdownOpen(false)}
                  />
                  <div className="absolute right-0 top-full mt-1.5 z-50 w-64 p-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl space-y-1 animate-in fade-in zoom-in-95 duration-100">
                    <div className="px-2.5 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">
                      Exportar Imagem JPG (SysMiddle)
                    </div>

                    <button
                      type="button"
                      onClick={() => handleExportJpg('gantt')}
                      className="w-full text-left flex items-start gap-2.5 p-2 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-slate-700 dark:text-slate-200 transition-colors group"
                    >
                      <div className="mt-0.5 p-1 rounded bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400">
                        <Calendar className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <span className="block text-xs font-bold group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                          Cronograma (Gantt)
                        </span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400">
                          Barras temporais e datas de entrega
                        </span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleExportJpg('table')}
                      className="w-full text-left flex items-start gap-2.5 p-2 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/40 text-slate-700 dark:text-slate-200 transition-colors group"
                    >
                      <div className="mt-0.5 p-1 rounded bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-400">
                        <LayoutTemplate className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <span className="block text-xs font-bold group-hover:text-blue-600 dark:group-hover:text-blue-400">
                          Lista de Demandas
                        </span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400">
                          Tabela de demandas, KPIs e métricas
                        </span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleExportJpg('all')}
                      className="w-full text-left flex items-start gap-2.5 p-2 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-slate-700 dark:text-slate-200 transition-colors group border-t border-slate-100 dark:border-slate-800/80"
                    >
                      <div className="mt-0.5 p-1 rounded bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-400">
                        <Layers className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <span className="block text-xs font-bold group-hover:text-emerald-600 dark:group-hover:text-emerald-400">
                          Ambos (Gantt + Lista)
                        </span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400">
                          Gera todos os slides separadamente
                        </span>
                      </div>
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* PDF Export Dropdown Selector */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsPdfDropdownOpen((prev) => !prev)}
                disabled={isExporting !== null || localItems.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold border border-slate-300 dark:border-slate-700 transition-all shadow-sm active:scale-95 disabled:opacity-50"
                title="Exportar documento PDF (Plano, Log ou Plano + Log)"
              >
                {isExporting === 'pdf' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-500" />
                ) : (
                  <FileText className="w-3.5 h-3.5 text-rose-500" />
                )}
                <span>PDF</span>
                <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform duration-200 ${isPdfDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {isPdfDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setIsPdfDropdownOpen(false)}
                  />
                  <div className="absolute right-0 top-full mt-1.5 z-50 w-64 p-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl space-y-1 animate-in fade-in zoom-in-95 duration-100">
                    <div className="px-2.5 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">
                      Exportar Relatório PDF
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setIsPdfDropdownOpen(false);
                        handleExportPdf('plan');
                      }}
                      className="w-full text-left flex items-start gap-2.5 p-2 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-700 dark:text-slate-200 transition-colors group"
                    >
                      <div className="mt-0.5 p-1 rounded bg-rose-100 dark:bg-rose-900/60 text-rose-600 dark:text-rose-400">
                        <FileText className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <span className="block text-xs font-bold group-hover:text-rose-600 dark:group-hover:text-rose-400">
                          1 - Exportar plano
                        </span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400">
                          Lista de demandas e cronograma Gantt
                        </span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsPdfDropdownOpen(false);
                        handleExportPdf('log');
                      }}
                      className="w-full text-left flex items-start gap-2.5 p-2 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-950/40 text-slate-700 dark:text-slate-200 transition-colors group"
                    >
                      <div className="mt-0.5 p-1 rounded bg-amber-100 dark:bg-amber-900/60 text-amber-600 dark:text-amber-400">
                        <RotateCcw className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <span className="block text-xs font-bold group-hover:text-amber-600 dark:group-hover:text-amber-400">
                          2 - Exportar log
                        </span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400">
                          Histórico de alterações ({filteredLogs.length} eventos)
                        </span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsPdfDropdownOpen(false);
                        handleExportPdf('all');
                      }}
                      className="w-full text-left flex items-start gap-2.5 p-2 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-slate-700 dark:text-slate-200 transition-colors group border-t border-slate-100 dark:border-slate-800/80"
                    >
                      <div className="mt-0.5 p-1 rounded bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400">
                        <Layers className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <span className="block text-xs font-bold group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                          3 - Exportar plano + log
                        </span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400">
                          Documento completo unificado
                        </span>
                      </div>
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Exportar Log em Modo Texto (.txt) */}
            <button
              onClick={handleExportTextLog}
              disabled={isExporting !== null || localItems.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold border border-slate-300 dark:border-slate-700 transition-all shadow-sm active:scale-95 disabled:opacity-50"
              title="Exportar log de alterações em arquivo de texto (.txt)"
            >
              <Download className="w-3.5 h-3.5 text-blue-500" />
              <span>Log (.txt)</span>
            </button>

            <button
              onClick={handleExportExcel}
              disabled={isExporting !== null || localItems.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold border border-slate-300 dark:border-slate-700 transition-all shadow-sm active:scale-95 disabled:opacity-50"
              title="Exportar dados do plano para planilha Excel XLSX"
            >
              {isExporting === 'excel' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-500" />
              ) : (
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
              )}
              <span>Excel</span>
            </button>
          </div>
        </div>
      </div>

      {/* Unsaved Changes Floating / Pinned Notice Banner */}
      {hasUnsavedChanges && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-500/50 rounded-2xl p-4 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center flex-shrink-0 animate-pulse">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-amber-900 dark:text-amber-200">
                Atenção! Existem alterações não salvas
              </h3>
              <p className="text-[11px] text-amber-700 dark:text-amber-400">
                A inclusão, remoção ou reordenação das demandas está em memória e só será persistida após salvar.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              onClick={handleDiscardChanges}
              disabled={isSavingPlan}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold border border-slate-300 dark:border-slate-700 transition-all shadow-sm"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
              <span>Descartar</span>
            </button>

            <button
              onClick={handleSavePlan}
              disabled={isSavingPlan}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition-all shadow-md shadow-amber-600/30 active:scale-95"
            >
              {isSavingPlan ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              <span>Salvar Plano</span>
            </button>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------- */}
      {/* TAB 1: GANTT CHART & ORDERED QUEUE LIST                 */}
      {/* -------------------------------------------------------- */}
      {activeTab === 'gantt' && (
        <div className="space-y-6">
          {/* Toolbar de Filtros do Cronograma (Projetos Contínuos / Ongoing) */}
          <div className="bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800/80">
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
                    <SlidersHorizontal className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-800 dark:text-white flex items-center gap-1.5">
                      <span>Filtros do Cronograma</span>
                      <span className="text-[10px] font-normal text-slate-400 dark:text-slate-500">
                        (Projeto Contínuo)
                      </span>
                    </h3>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold">
                    Exibindo <strong>{filteredPlanItems.length}</strong> de <strong>{localItems.length}</strong> demandas
                  </span>

                  {hasActiveFilters && (
                    <button
                      type="button"
                      onClick={handleClearAllFilters}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 border border-rose-200 dark:border-rose-900/50 transition-colors cursor-pointer"
                      title="Limpar todos os filtros ativos"
                    >
                      <FilterX className="w-3.5 h-3.5" />
                      <span>Limpar Filtros</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Botão Alinhar Início com Hoje (Dynamic Anchor Date) */}
                {!isClientView && (
                  <button
                    type="button"
                    onClick={handleAlignPlanToToday}
                    disabled={isAligningToday}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 text-xs font-bold border border-indigo-200 dark:border-indigo-500/30 transition-all shadow-sm active:scale-95 disabled:opacity-50 cursor-pointer"
                    title={`Recalcular cronograma das demandas pendentes tendo a data de hoje (${format(new Date(), 'dd/MM/yyyy')}) como marco zero inicial do plano`}
                  >
                    {isAligningToday ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                    ) : (
                      <CalendarDays className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                    )}
                    <span>Alinhar Início com Hoje</span>
                  </button>
                )}

                {/* Toggle Rápido: Ocultar Concluídas */}
                <button
                  type="button"
                  onClick={() => setFilterHideCompleted((prev) => !prev)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                    filterHideCompleted
                      ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 shadow-sm'
                      : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700'
                  }`}
                  title="Ocultar demandas que já foram marcadas como Concluídas"
                >
                  {filterHideCompleted ? (
                    <EyeOff className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <Eye className="w-3.5 h-3.5 text-slate-400" />
                  )}
                  <span>Ocultar Concluídas</span>
                </button>
              </div>
            </div>

            {/* Linha de Controles: Busca, Status, Executor e Janela Temporal */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Busca Textual */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={filterSearch}
                  onChange={(e) => setFilterSearch(e.target.value)}
                  placeholder="Buscar chave, resumo, layout..."
                  className="w-full pl-8 pr-7 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs text-slate-800 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
                {filterSearch && (
                  <button
                    type="button"
                    onClick={() => setFilterSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Filtro de Status */}
              <div>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as any)}
                  className={`w-full px-3 py-1.5 rounded-xl border text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/50 cursor-pointer ${
                    filterStatus !== 'all'
                      ? 'bg-indigo-50 dark:bg-indigo-950/50 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 font-bold'
                      : 'bg-slate-50 dark:bg-slate-950 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-white'
                  }`}
                >
                  <option value="all">Status: Todos</option>
                  <option value="pending">Status: Pendentes (Não Iniciada + Iniciada)</option>
                  <option value="not_started">Status: Apenas Não Iniciadas</option>
                  <option value="started">Status: Apenas Iniciadas</option>
                  <option value="completed">Status: Apenas Concluídas</option>
                </select>
              </div>

              {/* Filtro de Executor */}
              <div>
                <select
                  value={filterAssignee}
                  onChange={(e) => setFilterAssignee(e.target.value)}
                  className={`w-full px-3 py-1.5 rounded-xl border text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/50 cursor-pointer ${
                    filterAssignee !== 'all'
                      ? 'bg-indigo-50 dark:bg-indigo-950/50 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 font-bold'
                      : 'bg-slate-50 dark:bg-slate-950 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-white'
                  }`}
                >
                  <option value="all">Executor: Todos</option>
                  {uniqueAssignees.map((name) => (
                    <option key={`filter-assignee-${name}`} value={name}>
                      Executor: {name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Filtro de Janela Temporal / Período Móvel */}
              <div>
                <select
                  value={filterPeriod}
                  onChange={(e) => setFilterPeriod(e.target.value as any)}
                  className={`w-full px-3 py-1.5 rounded-xl border text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/50 cursor-pointer ${
                    filterPeriod !== 'all'
                      ? 'bg-indigo-50 dark:bg-indigo-950/50 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 font-bold'
                      : 'bg-slate-50 dark:bg-slate-950 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-white'
                  }`}
                >
                  <option value="all">Período: Todo o Cronograma</option>
                  <option value="current_window">Período: Visão Atual (-15d / +45d)</option>
                  <option value="this_month">Período: Mês Atual</option>
                  <option value="next_30">Período: Próximos 30 Dias</option>
                  <option value="next_60">Período: Próximos 60 Dias</option>
                  <option value="custom">Período: Personalizado...</option>
                </select>
              </div>
            </div>

            {/* Inputs de Data Personalizada se selecionado "Personalizado..." */}
            {filterPeriod === 'custom' && (
              <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100 dark:border-slate-800/80 animate-in fade-in duration-150">
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                  Definir Janela Personalizada:
                </span>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-slate-500">De:</label>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-slate-500">Até:</label>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  />
                </div>
                {(customStartDate || customEndDate) && (
                  <button
                    type="button"
                    onClick={() => {
                      setCustomStartDate('');
                      setCustomEndDate('');
                    }}
                    className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 underline cursor-pointer"
                  >
                    Resetar Datas
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Gantt Interactive Chart Canvas */}
          <div
            ref={ganttContainerRef}
            className="bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm overflow-hidden"
          >
            <div
              data-gantt-header="true"
              className="flex items-center justify-between gap-3 mb-4"
            >
              <div>
                <h2 className="text-sm font-black text-slate-800 dark:text-white flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-indigo-500" />
                  <span>Cronograma Gantt Automatizado</span>
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {isClientView
                    ? 'Cronograma de execução das atividades planejadas.'
                    : 'Execução em paralelo entre executores diferentes e sequenciamento contínuo por responsável.'}
                </p>
              </div>

              {/* Legend of Assignees */}
              {!isClientView && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {uniqueAssignees.map((name) => {
                    const color = assigneeColorMap.get(name) || ASSIGNEE_COLORS[0];
                    return (
                      <span
                        key={name}
                        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold border ${color.lightBg} ${color.text} ${color.border}`}
                      >
                        <span className={`w-2 h-2 rounded-full ${color.bg}`} />
                        <span>{name}</span>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            {localItems.length === 0 ? (
              <div className="py-16 text-center flex flex-col items-center justify-center">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 mb-3">
                  <Calendar className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">
                  Nenhuma demanda adicionada ao plano ainda.
                </h3>
                <p className="text-xs text-slate-400 max-w-sm mt-1">
                  Acesse a aba <strong>Backlog {activeProject?.name || activeProject?.key || 'Jira'}</strong> para selecionar atividades e definir a estimativa de horas e responsável.
                </p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  <button
                    onClick={() => setActiveTab('backlog')}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-md shadow-indigo-600/20"
                  >
                    Ver Backlog {activeProject?.name || activeProject?.key || 'Jira'}
                  </button>
                  <button
                    onClick={handleOpenAddManualModal}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-md shadow-emerald-600/20 flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Criar Tarefa Avulsa</span>
                  </button>
                </div>
              </div>
            ) : filteredPlanItems.length === 0 ? (
              <div className="py-14 text-center flex flex-col items-center justify-center">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 mb-3">
                  <Filter className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">
                  Nenhuma demanda corresponde aos filtros aplicados.
                </h3>
                <p className="text-xs text-slate-400 max-w-sm mt-1">
                  Verifique os filtros de status, executor, período ou termo de busca.
                </p>
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={handleClearAllFilters}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-md shadow-indigo-600/20 flex items-center gap-1.5"
                  >
                    <FilterX className="w-3.5 h-3.5" />
                    <span>Limpar Filtros</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto pb-4 custom-scrollbar">
                <div className="min-w-[900px]">
                  {/* Timeline Days Header */}
                  <div className="flex border-b border-slate-200 dark:border-slate-800 pb-2 mb-3">
                    <div className="w-64 flex-shrink-0 text-[11px] font-bold text-slate-400 uppercase tracking-wider pl-2">
                      Demanda / Fila
                    </div>
                    <div className="flex-1 flex">
                      {ganttTimelineDays.map((day, idx) => {
                        const dayStr = format(day, 'yyyy-MM-dd');
                        const isHoliday = holidaySet.has(dayStr);
                        const isTod = isToday(day);
                        const isFirstOfMonth = idx === 0 || day.getMonth() !== ganttTimelineDays[idx - 1].getMonth();

                        return (
                          <div
                            key={dayStr}
                            className={`flex-1 min-w-[32px] text-center border-l border-slate-100 dark:border-slate-800/60 ${
                              isHoliday ? 'bg-slate-100/60 dark:bg-slate-950/40 text-slate-400' : ''
                            } ${isTod ? 'bg-indigo-500/10 dark:bg-indigo-500/20 font-bold' : ''}`}
                            title={isHoliday ? `Feriado: ${dayStr}` : undefined}
                          >
                            <span className="block text-[9px] uppercase text-slate-400 dark:text-slate-500">
                              {format(day, 'EEE', { locale: ptBR }).substring(0, 3)}
                            </span>
                            <span
                              className={`block text-[11px] font-bold ${
                                isTod
                                  ? 'text-indigo-600 dark:text-indigo-400'
                                  : isHoliday
                                  ? 'text-slate-400'
                                  : 'text-slate-700 dark:text-slate-300'
                              }`}
                            >
                              {day.getDate()}
                            </span>
                            {isFirstOfMonth && (
                              <span className="block text-[8px] font-bold text-indigo-500 dark:text-indigo-400 uppercase">
                                {format(day, 'MMM', { locale: ptBR })}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Gantt Rows */}
                  <div className="space-y-2">
                    {filteredPlanItems.map((item, idx) => {
                      const color = assigneeColorMap.get(item.assignee_name.trim()) || ASSIGNEE_COLORS[0];
                      const execState = getTaskExecutionState(item);
                      const startDate = parseISO(item.start_date);
                      const endDate = parseISO(item.end_date);

                      // Calcula posições das colunas úteis (sem sábados e domingos)
                      const totalTimelineDays = ganttTimelineDays.length || 1;

                      let sIdx = timelineDayIndexMap.get(item.start_date);
                      if (sIdx === undefined) {
                        const sDate = parseISO(item.start_date);
                        if (ganttTimelineDays.length > 0 && sDate < ganttTimelineDays[0]) {
                          sIdx = 0;
                        } else {
                          sIdx = ganttTimelineDays.findIndex((d) => d >= sDate);
                          if (sIdx === -1) sIdx = Math.max(0, totalTimelineDays - 1);
                        }
                      }

                      let eIdx = timelineDayIndexMap.get(item.end_date);
                      if (eIdx === undefined) {
                        const eDate = parseISO(item.end_date);
                        if (ganttTimelineDays.length > 0 && eDate > ganttTimelineDays[ganttTimelineDays.length - 1]) {
                          eIdx = totalTimelineDays - 1;
                        } else {
                          let found = -1;
                          for (let i = ganttTimelineDays.length - 1; i >= 0; i--) {
                            if (ganttTimelineDays[i] <= eDate) {
                              found = i;
                              break;
                            }
                          }
                          eIdx = found >= 0 ? found : sIdx;
                        }
                      }

                      if (eIdx < sIdx) eIdx = sIdx;

                      const leftPercent = (sIdx / totalTimelineDays) * 100;
                      const durationCols = eIdx - sIdx + 1;
                      const widthPercent = (durationCols / totalTimelineDays) * 100;

                      return (
                        <div
                          key={item.id}
                          className="flex items-center group hover:bg-slate-50/80 dark:hover:bg-slate-800/40 py-1.5 rounded-xl transition-colors"
                        >
                          {/* Row Label (Left) */}
                          <div className="w-64 flex-shrink-0 pr-3 pl-2 flex items-center justify-between min-w-0">
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span
                                  className="text-[10px] font-mono font-bold text-slate-400"
                                  title={`Posição #${item.sort_order} na fila de execução`}
                                >
                                  #{item.sort_order}
                                </span>
                                {item.metadata?.isManual || item.metadata?.isExternal ? (
                                  <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 truncate">
                                    {item.issue_key}
                                  </span>
                                ) : (
                                  <a
                                    href={item.metadata?.url || `https://sysmiddle.atlassian.net/browse/${item.issue_key}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs font-black text-indigo-600 dark:text-indigo-400 hover:underline truncate"
                                  >
                                    {item.issue_key}
                                  </a>
                                )}
                                {execState.isDelayedStart && (
                                  <span
                                    className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 text-[9px] font-bold border border-rose-300 dark:border-rose-800"
                                    title={`Atrasada: deveria ter iniciado em ${format(startDate, 'dd/MM/yyyy')} (${execState.delayDays}d de atraso por não início)`}
                                  >
                                    <AlertTriangle className="w-2.5 h-2.5 text-rose-500 animate-pulse" />
                                    <span>Atrasada</span>
                                  </span>
                                )}
                                {execState.status === 'started' && (
                                  <span
                                    className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded bg-blue-100 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 text-[9px] font-bold border border-blue-300 dark:border-blue-800"
                                    title="Tarefa iniciada"
                                  >
                                    <Play className="w-2 h-2 text-blue-500 fill-current" />
                                    <span>Iniciada</span>
                                  </span>
                                )}
                                {execState.status === 'completed' && (
                                  <span
                                    className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 text-[9px] font-bold border border-emerald-300 dark:border-emerald-800"
                                    title="Tarefa concluída"
                                  >
                                    <Check className="w-2.5 h-2.5 text-emerald-500" />
                                    <span>Concluída</span>
                                  </span>
                                )}
                                {!isClientView && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                                    {item.estimate_hours}h
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-600 dark:text-slate-300 truncate" title={item.summary}>
                                {item.summary}
                              </p>
                            </div>
                          </div>

                          {/* Gantt Bar Area (Right) */}
                          <div className="flex-1 relative h-7 bg-slate-50/40 dark:bg-slate-950/20 rounded-lg overflow-hidden border border-slate-100 dark:border-slate-800/60">
                            {/* Grid / Holiday stripe background */}
                            <div className="absolute inset-0 flex pointer-events-none">
                              {ganttTimelineDays.map((d, i) => {
                                const dStr = format(d, 'yyyy-MM-dd');
                                const isHoliday = holidaySet.has(dStr);
                                const isTod = isToday(d);
                                return (
                                  <div
                                    key={i}
                                    className={`flex-1 border-r border-slate-100/60 dark:border-slate-800/40 ${
                                      isHoliday ? 'bg-slate-200/40 dark:bg-slate-950/50' : ''
                                    } ${isTod ? 'bg-indigo-500/10' : ''}`}
                                  />
                                );
                              })}
                            </div>

                            {/* The Actual Task Bar */}
                            <div
                              onClick={() => {
                                if (!isClientView) {
                                  handleOpenEditModal(item);
                                }
                              }}
                              style={{
                                left: `${leftPercent}%`,
                                width: `${Math.max(widthPercent, 1.5)}%`,
                              }}
                              className={`absolute top-1 bottom-1 rounded-md shadow-sm transition-all flex items-center px-2 min-w-[28px] overflow-hidden ${color.bg} text-white group-hover:brightness-110 cursor-pointer ${
                                execState.isDelayedStart ? 'ring-2 ring-rose-500 ring-offset-1 dark:ring-offset-slate-900' : ''
                              } ${execState.status === 'completed' ? 'opacity-90' : ''}`}
                              title={
                                isClientView
                                  ? `${item.issue_key}: ${item.summary}\nStatus: ${execState.label}\nInício: ${format(startDate, 'dd/MM/yyyy')}\nEntrega: ${format(endDate, 'dd/MM/yyyy')}\nDias Úteis: ${item.working_days}`
                                  : `${item.issue_key}: ${item.summary}\nStatus: ${execState.label}${execState.isDelayedStart ? ` (Atraso: ${execState.delayDays} dias)` : ''}\nResponsável: ${item.assignee_name}\nEstimativa: ${item.estimate_hours}h\nInício: ${format(startDate, 'dd/MM/yyyy')}\nFim: ${format(endDate, 'dd/MM/yyyy')}\nDias Úteis: ${item.working_days}\n(Clique para editar)`
                              }
                            >
                              {execState.isDelayedStart && (
                                <AlertTriangle className="w-3 h-3 text-amber-200 mr-1 flex-shrink-0 animate-pulse" />
                              )}
                              {execState.status === 'started' && (
                                <Play className="w-2.5 h-2.5 text-white/95 fill-current mr-1 flex-shrink-0" />
                              )}
                              {execState.status === 'completed' && (
                                <Check className="w-3 h-3 text-white mr-1 flex-shrink-0" />
                              )}
                              <span className="text-[10px] font-bold truncate">
                                {isClientView
                                  ? item.issue_key
                                  : `${item.issue_key} (${item.assignee_name.split(' ')[0]})`}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Ordered Queue Table with Actions (Up, Down, Remove) */}
          <div className="bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-sm font-black text-slate-800 dark:text-white flex items-center gap-2">
                  <Layers className="w-4 h-4 text-emerald-500" />
                  <span>Fila de Execução das Demandas</span>
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {hasActiveFilters
                    ? 'Filtros ativos. A reordenação manual por arraste e solte está pausada para preservar a ordem global da fila.'
                    : 'Arraste as demandas ou use as flechas para reordenar a fila e recalcular o cronograma automaticamente.'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Indicadores de status da fila */}
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold text-[11px]">
                    Total: <strong>{localItems.length}</strong>
                  </span>
                  {executionStats.completed > 0 && (
                    <span className="px-2 py-0.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40 font-bold text-[11px] flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                      <span>{executionStats.completed} {executionStats.completed === 1 ? 'concluída' : 'concluídas'}</span>
                    </span>
                  )}
                  {executionStats.started > 0 && (
                    <span className="px-2 py-0.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/40 font-bold text-[11px] flex items-center gap-1">
                      <Play className="w-2.5 h-2.5 text-blue-500 fill-current" />
                      <span>{executionStats.started} {executionStats.started === 1 ? 'iniciada' : 'iniciadas'}</span>
                    </span>
                  )}
                  {executionStats.delayedNotStarted > 0 && (
                    <span className="px-2.5 py-0.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800 font-bold text-[11px] flex items-center gap-1 shadow-2xs animate-pulse">
                      <AlertTriangle className="w-3 h-3 text-rose-600 dark:text-rose-400" />
                      <span>{executionStats.delayedNotStarted} {executionStats.delayedNotStarted === 1 ? 'atrasada por não início' : 'atrasadas por não início'}</span>
                    </span>
                  )}
                </div>

                {!isClientView && (
                  <div className="flex items-center gap-2">
                    {localItems.length > 0 && (
                      <button
                        type="button"
                        onClick={handleClearHistoricalDates}
                        disabled={isSavingPlan}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold border border-slate-300 dark:border-slate-700 transition-all active:scale-95 disabled:opacity-50"
                        title="Apagar datas de histórico (remove as datas traçadas/riscadas da listagem)"
                      >
                        <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                        <span>Limpar Datas Alteradas</span>
                      </button>
                    )}

                    {localItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          setSwapItem1Key(localItems[0]?.issue_key || '');
                          setSwapItem2Key(localItems[1]?.issue_key || '');
                          setIsSwapModalOpen(true);
                        }}
                        disabled={isSavingPlan}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold border border-slate-300 dark:border-slate-700 transition-all active:scale-95 disabled:opacity-50"
                        title="Inverter a ordem de duas tarefas na fila de execução"
                      >
                        <ArrowUpDown className="w-3.5 h-3.5 text-indigo-500" />
                        <span>Inverter ordem</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={handleOpenAddManualModal}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-sm shadow-emerald-600/30 transition-all active:scale-95"
                      title="Incluir tarefa do Jira ou tarefa avulsa diretamente ao cronograma"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Incluir Tarefa</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Banner de alerta visual se houver tarefas atrasadas por não início */}
            {executionStats.delayedNotStarted > 0 && (
              <div className="mb-4 px-3.5 py-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 text-rose-700 dark:text-rose-300 font-medium">
                  <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 flex-shrink-0 animate-pulse" />
                  <span>
                    <strong>{executionStats.delayedNotStarted} {executionStats.delayedNotStarted === 1 ? 'tarefa está atrasada' : 'tarefas estão atrasadas'}</strong> por não {executionStats.delayedNotStarted === 1 ? 'ter sido iniciada' : 'terem sido iniciadas'} (data planejada de início anterior a hoje).
                  </span>
                </div>
                <span className="text-[11px] text-rose-600 dark:text-rose-400 font-bold whitespace-nowrap">
                  Inicie as tarefas na lista abaixo ou reorganize a fila
                </span>
              </div>
            )}

            {localItems.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">Nenhuma demanda na fila de execução.</p>
            ) : filteredPlanItems.length === 0 ? (
              <div className="py-12 text-center flex flex-col items-center justify-center">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 mb-2">
                  <Filter className="w-6 h-6" />
                </div>
                <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Nenhuma demanda corresponde aos filtros aplicados.
                </h3>
                <button
                  type="button"
                  onClick={handleClearAllFilters}
                  className="mt-3 px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 text-xs font-bold hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-colors cursor-pointer"
                >
                  Limpar Filtros
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      <th className="py-2.5 px-3">Ordem</th>
                      <th className="py-2.5 px-3">Chave</th>
                      <th className="py-2.5 px-3">Usuário</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Resumo da Demanda</th>
                      <th className="py-2.5 px-3">Detalhes</th>
                      {!isClientView && <th className="py-2.5 px-3">Executor</th>}
                      {!isClientView && <th className="py-2.5 px-3">EST</th>}
                      <th className="py-2.5 px-3">Início</th>
                      <th className="py-2.5 px-3">{isClientView ? 'Entrega Prevista' : 'Fim'}</th>
                      <th className="py-2.5 px-3">Prazo Jira</th>
                      <th className="py-2.5 px-3">Dias Úteis</th>
                      <th className="py-2.5 px-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {filteredPlanItems.map((item, idx) => {
                      const color = assigneeColorMap.get(item.assignee_name.trim()) || ASSIGNEE_COLORS[0];
                      const isBlocked = Boolean(item.metadata?.isBlocked);
                      const displayStatus = item.metadata?.displayStatus || item.status || 'Planejado';
                      const statusStyle = getStatusBadgeStyle(displayStatus);

                      const baseItem = serverDisplayItemMap.get(item.issue_key) || (item.id ? serverDisplayItemMap.get(item.id) : undefined);

                      let oldStartDate: string | null = null;
                      if (baseItem && baseItem.start_date !== item.start_date) {
                        oldStartDate = baseItem.start_date;
                      } else if (!hasUnsavedChanges && item.metadata?.previous_start_date && item.metadata.previous_start_date !== item.start_date) {
                        oldStartDate = item.metadata.previous_start_date;
                      }

                      let oldEndDate: string | null = null;
                      if (baseItem && baseItem.end_date !== item.end_date) {
                        oldEndDate = baseItem.end_date;
                      } else if (!hasUnsavedChanges && item.metadata?.previous_end_date) {
                        let histEnd = item.metadata.previous_end_date;
                        if (isClientView) {
                          const bufferDays =
                            settings.client_delivery_buffer_days !== undefined
                              ? Math.max(0, Number(settings.client_delivery_buffer_days) || 0)
                              : 1;
                          if (bufferDays > 0) {
                            try {
                              const adjusted = addWorkingDays(parseISO(histEnd), bufferDays, holidaySet);
                              histEnd = format(adjusted, 'yyyy-MM-dd');
                            } catch {
                              // fallback
                            }
                          }
                        }
                        if (histEnd !== item.end_date) {
                          oldEndDate = histEnd;
                        }
                      }

                      const execState = getTaskExecutionState(item);

                      return (
                        <tr
                          key={item.id}
                          draggable={!isClientView && !hasActiveFilters}
                          onDragStart={(e) => handleDragStart(e, idx)}
                          onDragOver={(e) => handleDragOver(e, idx)}
                          onDragEnd={handleDragEnd}
                          onDrop={(e) => handleDrop(e, idx)}
                          className={`transition-all group ${
                            !isClientView && !hasActiveFilters ? 'cursor-grab active:cursor-grabbing' : ''
                          } ${
                            isBlocked ? 'bg-red-50/40 dark:bg-red-950/20' : ''
                          } ${
                            execState.isDelayedStart ? 'border-l-4 border-l-rose-500 bg-rose-50/20 dark:bg-rose-950/15' : ''
                          } ${
                            draggedIndex === idx && !hasActiveFilters
                              ? 'opacity-35 bg-indigo-50/60 dark:bg-indigo-950/60 scale-[0.99] border-dashed border-2 border-indigo-400'
                              : dragOverIndex === idx && !hasActiveFilters
                              ? 'bg-indigo-50/80 dark:bg-indigo-950/70 border-t-2 border-indigo-600 dark:border-indigo-400 shadow-sm'
                              : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/40'
                          }`}
                        >
                          <td className="py-3 px-3 font-mono font-bold text-slate-500 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              {!isClientView && (
                                <span
                                  className={`p-0.5 rounded transition-colors ${
                                    hasActiveFilters
                                      ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
                                      : 'text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400'
                                  }`}
                                  title={
                                    hasActiveFilters
                                      ? 'Reordenação desabilitada enquanto filtros estiverem ativos'
                                      : 'Clique e arraste para reordenar'
                                  }
                                >
                                  <GripVertical className="w-3.5 h-3.5" />
                                </span>
                              )}
                              <span title={`Posição #${item.sort_order} na fila de execução`}>#{item.sort_order}</span>
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-1.5 min-w-0">
                              {item.metadata?.isManual || item.metadata?.isExternal ? (
                                <span className="font-black text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                  <span>{item.issue_key}</span>
                                  <span className="px-1.5 py-0.2 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[9px] font-bold border border-emerald-200 dark:border-emerald-700/40">
                                    Manual
                                  </span>
                                </span>
                              ) : (
                                <a
                                  href={item.metadata?.url || `https://sysmiddle.atlassian.net/browse/${item.issue_key}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  draggable={false}
                                  onMouseDown={(e) => e.stopPropagation()}
                                  className={`font-black hover:underline flex items-center gap-1 ${
                                    isBlocked
                                      ? 'text-red-600 dark:text-red-400'
                                      : 'text-indigo-600 dark:text-indigo-400'
                                  }`}
                                >
                                  <span>{item.issue_key}</span>
                                  <ExternalLink className="w-3 h-3 opacity-60 group-hover:opacity-100 flex-shrink-0" />
                                </a>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            {(() => {
                              const rawUser = item.metadata?.jira_assignee || item.metadata?.assignee?.displayName || item.assignee_name || '';
                              const isUnassigned = !rawUser || rawUser.toLowerCase().includes('não atribuído') || rawUser.toLowerCase().includes('nao atribuido') || rawUser.toLowerCase() === 'unassigned';
                              const userFirstName = isUnassigned ? '-' : rawUser.trim().split(' ')[0];

                              return (
                                <div
                                  className="flex items-center gap-1.5"
                                  title={`Usuário no Jira: ${rawUser || 'Não atribuído'}`}
                                >
                                  <span className="w-5 h-5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center text-[9px] font-black uppercase flex-shrink-0">
                                    {userFirstName !== '-' ? userFirstName.charAt(0) : '?'}
                                  </span>
                                  <span className="font-semibold text-slate-700 dark:text-slate-200 text-xs">
                                    {userFirstName}
                                  </span>
                                </div>
                              );
                            })()}
                          </td>
                          <td className="py-3 px-3 relative" data-status-menu-container="true">
                            <div className="flex flex-col items-start gap-1">
                              {/* Botão Badge de Status */}
                              {!isClientView ? (
                                <button
                                  type="button"
                                  onMouseDown={(e) => e.stopPropagation()}
                                  onClick={() => setOpenStatusMenuId(openStatusMenuId === item.id ? null : item.id)}
                                  className={`group/status inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all cursor-pointer shadow-2xs active:scale-95 ${
                                    execState.status === 'completed'
                                      ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 hover:bg-emerald-100'
                                      : execState.status === 'started'
                                      ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700 hover:bg-blue-100'
                                      : execState.isDelayedStart
                                      ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-800 hover:bg-rose-100'
                                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-200'
                                  }`}
                                  title={
                                    execState.isDelayedStart
                                      ? `Atrasada: deveria ter iniciado em ${format(parseISO(item.start_date), 'dd/MM/yyyy')} (${execState.delayDays}d de atraso por não ter sido iniciada). Clique para alterar status.`
                                      : 'Clique para alterar status de execução da tarefa'
                                  }
                                >
                                  {execState.status === 'completed' ? (
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                                  ) : execState.status === 'started' ? (
                                    <Play className="w-3 h-3 text-blue-600 dark:text-blue-400 fill-current flex-shrink-0" />
                                  ) : execState.isDelayedStart ? (
                                    <AlertTriangle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 flex-shrink-0 animate-pulse" />
                                  ) : (
                                    <Clock className="w-3 h-3 text-slate-400 flex-shrink-0" />
                                  )}
                                  <span className="whitespace-nowrap">
                                    {execState.status === 'completed'
                                      ? 'Concluída'
                                      : execState.status === 'started'
                                      ? 'Iniciada'
                                      : execState.isDelayedStart
                                      ? 'Atrasada: não iniciada'
                                      : 'Não Iniciada'}
                                  </span>
                                  <ChevronDown className="w-3 h-3 opacity-50 group-hover/status:opacity-100 transition-opacity ml-0.5" />
                                </button>
                              ) : (
                                <span
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                                    execState.status === 'completed'
                                      ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
                                      : execState.status === 'started'
                                      ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700'
                                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                                  }`}
                                >
                                  {execState.status === 'completed' ? 'Concluída' : execState.status === 'started' ? 'Iniciada' : 'Planejado'}
                                </span>
                              )}

                              {/* Status do Jira (apenas como visualização) */}
                              {(() => {
                                const isJira = !item.metadata?.isManual && !item.metadata?.isExternal;
                                const jiraStatus = item.metadata?.rawStatus || (!item.metadata?.isManual && !item.metadata?.isExternal && item.status && !['Planejado', 'Iniciada', 'Concluída', 'Não Iniciada'].includes(item.status) ? item.status : null);
                                if (!isJira || !jiraStatus) return null;

                                return (
                                  <div
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100/90 dark:bg-slate-800/70 text-[9.5px] font-medium text-slate-600 dark:text-slate-400 border border-slate-200/70 dark:border-slate-700/50"
                                    title={`Status no Jira: ${jiraStatus}`}
                                  >
                                    <span className="text-[8.5px] font-bold text-slate-400 dark:text-slate-500 uppercase">Jira:</span>
                                    <span className="truncate max-w-[110px] font-semibold text-slate-700 dark:text-slate-300">{jiraStatus}</span>
                                  </div>
                                );
                              })()}
                            </div>

                              {/* Menu Suspenso de Seleção de Status */}
                              {!isClientView && openStatusMenuId === item.id && (
                                <div
                                  className="absolute left-3 top-full mt-1 w-52 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl p-1.5 z-30 animate-in fade-in zoom-in-95 duration-100"
                                  onMouseDown={(e) => e.stopPropagation()}
                                >
                                  <div className="text-[10px] font-bold text-slate-400 px-2 py-1 uppercase tracking-wider">
                                    Status de Execução
                                  </div>

                                  {/* Não Iniciada */}
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateTaskExecutionStatus(item, 'not_started')}
                                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                                      execState.status === 'not_started'
                                        ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-bold'
                                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2">
                                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                                      <span>Não Iniciada</span>
                                    </div>
                                    {execState.status === 'not_started' && <Check className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />}
                                  </button>

                                  {/* Iniciada */}
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateTaskExecutionStatus(item, 'started')}
                                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                                      execState.status === 'started'
                                        ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-bold'
                                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2">
                                      <Play className="w-3.5 h-3.5 text-blue-500 fill-current" />
                                      <span>Iniciada (Em andamento)</span>
                                    </div>
                                    {execState.status === 'started' && <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />}
                                  </button>

                                  {/* Concluída */}
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateTaskExecutionStatus(item, 'completed')}
                                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                                      execState.status === 'completed'
                                        ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold'
                                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2">
                                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                      <span>Concluída</span>
                                    </div>
                                    {execState.status === 'completed' && <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />}
                                  </button>
                                </div>
                              )}
                          </td>
                          <td className="py-3 px-3 max-w-xs font-medium text-slate-800 dark:text-slate-200 truncate" title={item.summary}>
                            {item.summary}
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex flex-wrap items-center gap-1 max-w-[200px]">
                              {item.metadata?.industry && (
                                <span
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-500/30 text-[9px] font-medium truncate max-w-[100px]"
                                  title={`Indústria: ${item.metadata.industry}`}
                                >
                                  <Building2 className="w-2.5 h-2.5 flex-shrink-0 text-teal-500" />
                                  <span className="truncate">{item.metadata.industry}</span>
                                </span>
                              )}
                              {item.metadata?.canal && (
                                <span
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-500/30 text-[9px] font-medium truncate max-w-[110px]"
                                  title={`Canal: ${item.metadata.canal}`}
                                >
                                  <Radio className="w-2.5 h-2.5 flex-shrink-0 text-sky-500" />
                                  <span className="truncate">{item.metadata.canal}</span>
                                </span>
                              )}
                              {!item.metadata?.industry && !item.metadata?.canal && (
                                <span className="text-slate-400 text-[10px]">-</span>
                              )}
                            </div>
                          </td>
                          {!isClientView && (
                            <td className="py-3 px-3">
                              <button
                                type="button"
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={() => handleOpenEditModal(item)}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold border ${color.lightBg} ${color.text} ${color.border} hover:opacity-80 transition-opacity text-left cursor-pointer group/assignee`}
                                title="Clique para alterar executor ou horas"
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${color.bg}`} />
                                <span>{item.assignee_name}</span>
                                <Pencil className="w-2.5 h-2.5 opacity-0 group-hover/assignee:opacity-100 transition-opacity ml-0.5" />
                              </button>
                            </td>
                          )}
                          {!isClientView && (
                            <td className="py-3 px-3">
                              <button
                                type="button"
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={() => handleOpenEditModal(item)}
                                className="font-bold text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors inline-flex items-center gap-1 group/hours cursor-pointer text-left"
                                title="Clique para alterar estimativa de horas ou executor"
                              >
                                <span>{item.estimate_hours}h</span>
                                <Pencil className="w-2.5 h-2.5 opacity-0 group-hover/hours:opacity-100 transition-opacity text-slate-400" />
                              </button>
                            </td>
                          )}
                          <td className="py-3 px-3">
                            <div className="flex flex-col">
                              {oldStartDate && (
                                <span
                                  className="text-[10px] font-medium text-slate-400 dark:text-slate-500 line-through decoration-dashed"
                                  style={{ textDecoration: 'line-through dashed' }}
                                  title={`Data de início anterior: ${format(parseISO(oldStartDate), 'dd/MM/yyyy')}`}
                                >
                                  {format(parseISO(oldStartDate), 'dd/MM/yyyy')}
                                </span>
                              )}
                              {execState.isDelayedStart ? (
                                <div className="flex flex-col">
                                  <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-600 dark:text-rose-400">
                                    <AlertTriangle className="w-3 h-3 text-rose-500 flex-shrink-0 animate-pulse" />
                                    <span>{format(parseISO(item.start_date), 'dd/MM/yyyy')}</span>
                                  </span>
                                  <span className="text-[10px] font-bold text-rose-500 dark:text-rose-400">
                                    Atrasada ({execState.delayDays}d)
                                  </span>
                                </div>
                              ) : (
                                <span
                                  className={`text-xs ${
                                    oldStartDate
                                      ? 'font-bold text-slate-800 dark:text-slate-100'
                                      : 'text-slate-600 dark:text-slate-400'
                                  }`}
                                >
                                  {format(parseISO(item.start_date), 'dd/MM/yyyy')}
                                </span>
                              )}
                              {(item.fixed_start_date || item.metadata?.fixed_start_date) && (
                                <span
                                  className="inline-flex items-center gap-1 text-[9px] font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/50 px-1.5 py-0.5 rounded-md border border-indigo-200 dark:border-indigo-800/50 w-fit mt-1 shadow-xs"
                                  title={`Data de início fixada manualmente: ${format(parseISO(String(item.fixed_start_date || item.metadata?.fixed_start_date).substring(0, 10)), 'dd/MM/yyyy')}`}
                                >
                                  <Pin className="w-2.5 h-2.5 text-indigo-500 flex-shrink-0" />
                                  <span>Início Fixo</span>
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex flex-col">
                              {oldEndDate && (
                                <span
                                  className="text-[10px] font-medium text-slate-400 dark:text-slate-500 line-through decoration-dashed"
                                  style={{ textDecoration: 'line-through dashed' }}
                                  title={`Data de término anterior: ${format(parseISO(oldEndDate), 'dd/MM/yyyy')}`}
                                >
                                  {format(parseISO(oldEndDate), 'dd/MM/yyyy')}
                                </span>
                              )}
                              <span
                                className={`text-xs ${
                                  oldEndDate
                                    ? 'font-bold text-slate-800 dark:text-slate-100'
                                    : 'text-slate-600 dark:text-slate-400'
                                }`}
                              >
                                {format(parseISO(item.end_date), 'dd/MM/yyyy')}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            {item.metadata?.duedate ? (
                              <span
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[10px] font-semibold text-slate-700 dark:text-slate-300"
                                title={`Prazo original no Jira: ${item.metadata.duedate}`}
                              >
                                <Calendar className="w-2.5 h-2.5 text-slate-400" />
                                <span>{format(parseISO(item.metadata.duedate), 'dd/MM/yyyy')}</span>
                              </span>
                            ) : (
                              <span className="text-slate-400 text-[10px]">-</span>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-600 dark:text-slate-300">
                              {item.working_days}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right">
                            <div className="flex items-center justify-end gap-0.5">
                              {!item.metadata?.isManual && !item.metadata?.isExternal && (
                                <button
                                  type="button"
                                  onMouseDown={(e) => e.stopPropagation()}
                                  onClick={() => handleOpenSyncJiraModal(item)}
                                  className="p-1 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-all cursor-pointer"
                                  title={
                                    isClientView
                                      ? "Sincronizar data de entrega com o Jira (Modo Cliente)"
                                      : "Sincronizar datas com o Jira"
                                  }
                                >
                                  <CalendarSync className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {!isClientView && (
                                <button
                                  type="button"
                                  onMouseDown={(e) => e.stopPropagation()}
                                  onClick={() => handleOpenEditModal(item)}
                                  className="p-1 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
                                  title="Editar estimativa de horas e executor"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {(() => {
                                const origIdx = localItems.findIndex(
                                  (it) => it.id === item.id || it.issue_key === item.issue_key
                                );
                                return (
                                  <>
                                    <button
                                      type="button"
                                      onMouseDown={(e) => e.stopPropagation()}
                                      onClick={() => handleMoveUp(origIdx)}
                                      disabled={hasActiveFilters || origIdx <= 0}
                                      className="p-1 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer"
                                      title={
                                        hasActiveFilters
                                          ? 'Limpe os filtros para reordenar a fila'
                                          : 'Mover para cima na fila'
                                      }
                                    >
                                      <ArrowUp className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onMouseDown={(e) => e.stopPropagation()}
                                      onClick={() => handleMoveDown(origIdx)}
                                      disabled={
                                        hasActiveFilters ||
                                        origIdx < 0 ||
                                        origIdx >= localItems.length - 1
                                      }
                                      className="p-1 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer"
                                      title={
                                        hasActiveFilters
                                          ? 'Limpe os filtros para reordenar a fila'
                                          : 'Mover para baixo na fila'
                                      }
                                    >
                                      <ArrowDown className="w-3.5 h-3.5" />
                                    </button>
                                  </>
                                );
                              })()}
                              <button
                                type="button"
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={() => handleRemoveFromPlan(item)}
                                className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-all cursor-pointer"
                                title="Remover do plano e retornar ao backlog"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* -------------------------------------------------------- */}
      {/* TAB 2: BACKLOG SANFONA (ACCORDION)                      */}
      {/* -------------------------------------------------------- */}
      {activeTab === 'backlog' && (
        <div className="space-y-4">
          {/* Backlog Control Toolbar */}
          <div className="bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <div className="relative flex-1 min-w-[240px] max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={backlogSearch}
                  onChange={(e) => setBacklogSearch(e.target.value)}
                  placeholder="Filtrar por chave, resumo ou responsável..."
                  className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs text-slate-800 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
              </div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-bold bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30">
                <Check className="w-3 h-3 text-indigo-500" />
                <span>
                  Tipos:{' '}
                  {settings.issue_types && settings.issue_types.length > 0
                    ? settings.issue_types.join(' & ')
                    : 'Todos os tipos (sem Épicos)'}
                </span>
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleOpenAddManualModal}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 dark:text-emerald-300 text-xs font-bold border border-emerald-200 dark:border-emerald-500/30 transition-all shadow-sm active:scale-95"
                title="Incluir tarefa manual/externa diretamente no plano deste projeto"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Tarefa Avulsa</span>
              </button>

              <button
                type="button"
                onClick={handleExpandAll}
                className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold border border-slate-300 dark:border-slate-700 transition-all"
              >
                Expandir Todos
              </button>

              <button
                type="button"
                onClick={handleCollapseAll}
                className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold border border-slate-300 dark:border-slate-700 transition-all"
              >
                Recolher Todos
              </button>

              <button
                type="button"
                onClick={() => loadBacklog(selectedProjectKey)}
                disabled={isLoadingBacklog}
                className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 transition-all disabled:opacity-50"
                title="Sincronizar com o Jira agora"
              >
                <RefreshCw className={`w-4 h-4 ${isLoadingBacklog ? 'animate-spin text-indigo-500' : ''}`} />
              </button>
            </div>
          </div>

          {/* Accordion Groups */}
          {isLoadingBacklog ? (
            <div className="py-20 flex flex-col items-center justify-center gap-2">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
              <p className="text-xs text-slate-400 font-semibold">Carregando backlog do Jira (Projeto {activeProject?.name || selectedProjectKey})...</p>
            </div>
          ) : filteredBacklogGroups.length === 0 ? (
            <div className="py-16 text-center bg-white dark:bg-slate-900/80 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 flex flex-col items-center justify-center">
              <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-3">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-white">
                Nenhuma demanda pendente encontrada no backlog!
              </h3>
              <p className="text-xs text-slate-500 max-w-sm mt-1">
                Todas as atividades do projeto {activeProject?.name || selectedProjectKey} estão com usuário de entrega ou já foram incluídas no plano.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredBacklogGroups.map((group) => {
                const isOpen = Boolean(openAccordions[group.status]);
                return (
                  <div
                    key={group.status}
                    className="bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm transition-all"
                  >
                    {/* Accordion Header */}
                    <button
                      type="button"
                      onClick={() => handleToggleAccordion(group.status)}
                      className="w-full px-5 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-slate-50/80 dark:hover:bg-slate-850 transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        {isOpen ? (
                          <ChevronDown className="w-4 h-4 text-indigo-500" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-slate-400" />
                        )}
                        <span className="text-xs font-black text-slate-800 dark:text-white tracking-wide">
                          {group.status}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                          {group.count}
                        </span>
                      </div>

                      <span className="text-[10px] font-semibold text-slate-400">
                        {isOpen ? 'Recolher' : 'Expandir'}
                      </span>
                    </button>

                    {/* Accordion Body */}
                    {isOpen && (
                      <div className="p-4 pt-1 border-t border-slate-100 dark:border-slate-800/80 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                        {group.issues.map((issue) => (
                          <JiraCard
                            key={issue.id}
                            demand={issue}
                            showDueDateBadge={true}
                            actionButton={
                              <button
                                type="button"
                                onClick={() => handleOpenAddModal(issue)}
                                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-sm shadow-indigo-600/30 transition-all active:scale-95 flex-shrink-0"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>Incluir no Plano</span>
                              </button>
                            }
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* -------------------------------------------------------- */}
      {/* TAB 3: SETTINGS                                          */}
      {/* -------------------------------------------------------- */}
      {activeTab === 'settings' && (
        <ProjectSettingsPanel
          settings={settings}
          activeProject={activeProject}
          availablePlanAssignees={uniqueAssignees}
          onSaveSettings={async (updated) => {
            try {
              const res = await fetch(`/api/projects/${encodeURIComponent(selectedProjectKey)}/settings`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updated),
              });
              if (!res.ok) throw new Error('Falha ao salvar configurações.');
              const saved = await res.json();
              setSettings(saved);
              // Recalcula o plano local também
              applySchedule(localItems);
              // Invalida o backlog para recarregar se os issue_types foram alterados
              setBacklogData(null);
              onShowToast('Configurações salvas e cronograma recalculado!', 'success');
            } catch (err: any) {
              console.error(err);
              onShowToast(err.message || 'Erro ao atualizar configurações.', 'error');
            }
          }}
          onResetHolidays={async () => {
            try {
              const res = await fetch('/api/projects/settings/reset-holidays', { method: 'POST' });
              if (!res.ok) throw new Error('Falha ao restaurar feriados.');
              const saved = await res.json();
              setSettings(saved);
              applySchedule(localItems);
              onShowToast('Feriados nacionais restaurados para o padrão de 2026-2028!', 'success');
            } catch (err: any) {
              console.error(err);
              onShowToast(err.message || 'Erro ao restaurar feriados.', 'error');
            }
          }}
        />
      )}

      {/* -------------------------------------------------------- */}
      {/* MODAL: ADD DEMAND TO PLAN (Obrigatório: Horas + Executor) */}
      {/* -------------------------------------------------------- */}
      {addingIssue && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#0e1424] border border-slate-200 dark:border-indigo-900/60 rounded-2xl w-full max-w-lg p-6 shadow-2xl relative text-slate-800 dark:text-slate-200">
            <button
              type="button"
              onClick={() => setAddingIssue(null)}
              className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-600/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center border border-indigo-200 dark:border-indigo-500/30">
                <Plus className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Incluir Demanda no Plano
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  A atividade será inserida como última da fila e calculada automaticamente.
                </p>
              </div>
            </div>

            {/* Target Issue Details Card */}
            <div className="mb-5">
              <JiraCard demand={addingIssue} showDueDateBadge={true} />
            </div>

            <form onSubmit={handleConfirmAdd} className="space-y-4">
              {/* Estimativa em Horas (Obrigatório) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Estimativa de Tempo (Horas) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Clock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="number"
                    min="0.5"
                    step="0.5"
                    required
                    value={estimateHoursInput}
                    onChange={(e) => setEstimateHoursInput(parseFloat(e.target.value) || 0)}
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    placeholder="Ex: 8 ou 16"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Considera a jornada diária configurada ({settings.work_hours_per_day}h/dia).
                </p>
              </div>

              {/* Executor / Responsável (Obrigatório) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Quem irá executá-la? <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Users className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <select
                    required
                    value={assigneeInput}
                    onChange={(e) => setAssigneeInput(e.target.value)}
                    className="w-full pl-9 pr-8 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/50 appearance-none cursor-pointer"
                  >
                    <option value="" disabled>Selecione um executor cadastrado...</option>
                    {registeredAssignees.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                    {assigneeInput && !registeredAssignees.includes(assigneeInput) && (
                      <option value={assigneeInput}>
                        {assigneeInput} (Não cadastrado)
                      </option>
                    )}
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  {registeredAssignees.length === 0
                    ? 'Atenção: Nenhum executor cadastrado na aba Configurações.'
                    : 'Apenas executores cadastrados globalmente podem ser selecionados.'}
                </p>
              </div>

              {/* Data de Início Fixa (Opcional - Ideal para novos executores) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Data de Início Fixa <span className="text-slate-400 font-normal">(Opcional)</span>
                  </label>
                  {addFixedStartDate && (
                    <button
                      type="button"
                      onClick={() => setAddFixedStartDate('')}
                      className="text-[11px] text-rose-500 hover:text-rose-600 dark:hover:text-rose-400 font-semibold cursor-pointer"
                    >
                      Limpar data fixa
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="date"
                    value={addFixedStartDate}
                    onChange={(e) => setAddFixedStartDate(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Se informada, esta demanda iniciará exatamente nesta data (ideal para tarefas de novos executores no projeto). Deixe em branco para calcular automaticamente.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setAddingIssue(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 transition-all active:scale-95"
                >
                  <Plus className="w-4 h-4" />
                  <span>Incluir no Plano</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------- */}
      {/* MODAL: INCLUIR TAREFA (Jira ou Tarefa Avulsa/Não Jira)   */}
      {/* -------------------------------------------------------- */}
      {isAddManualModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#0e1424] border border-slate-200 dark:border-emerald-900/60 rounded-2xl w-full max-w-lg p-6 shadow-2xl relative text-slate-800 dark:text-slate-200">
            <button
              type="button"
              onClick={() => setIsAddManualModalOpen(false)}
              className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-600/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-200 dark:border-emerald-500/30">
                <Plus className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Incluir Tarefa no Plano
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Informe o código para buscar no Jira ou deixe em branco para criar uma tarefa avulsa.
                </p>
              </div>
            </div>

            {/* Alerta de duplicidade de tarefa Jira não concluída */}
            {duplicateWarning && (
              <div className="mb-4 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/60 text-amber-800 dark:text-amber-200 text-xs flex items-start gap-2.5 shadow-sm">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold">{duplicateWarning}</p>
                  <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-0.5">
                    Você pode prosseguir com a inclusão normalmente se desejar adicionar uma nova ocorrência na fila.
                  </p>
                </div>
              </div>
            )}

            <form onSubmit={handleConfirmAddManual} className="space-y-4">
              {/* Código / Chave e Status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Código / Chave
                    </label>
                    <span className="text-[9px] font-semibold px-1.5 py-0.2 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                      {manualKey.trim() === ''
                        ? 'Não Jira (Avulsa)'
                        : /^\d+$/.test(manualKey.trim())
                        ? `Jira (${activeProject?.key || 'EXT'}-${manualKey.trim()})`
                        : 'Jira'}
                    </span>
                  </div>
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      value={manualKey}
                      onChange={(e) => setManualKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))}
                      onBlur={() => {
                        if (manualKey.trim()) handleFetchJiraIssue(manualKey.trim());
                      }}
                      placeholder="Em branco p/ avulsa ou nº (ex: 123)"
                      className="w-full pr-20 pl-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                    />
                    <div className="absolute right-1.5 flex items-center gap-1">
                      {isSearchingJira ? (
                        <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          <span>Buscando...</span>
                        </span>
                      ) : manualKey.trim() ? (
                        <button
                          type="button"
                          onClick={() => handleFetchJiraIssue(manualKey.trim())}
                          className="px-2 py-1 rounded-lg bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer"
                          title="Buscar dados no Jira agora"
                        >
                          <Search className="w-3 h-3" />
                          <span>Buscar</span>
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {jiraSearchFeedback && (
                    <div
                      className={`mt-1.5 flex items-center gap-1.5 text-[11px] font-medium ${
                        jiraSearchFeedback.type === 'success'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      {jiraSearchFeedback.type === 'success' ? (
                        <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                      )}
                      <span>{jiraSearchFeedback.message}</span>
                    </div>
                  )}
                  <p className="text-[10px] text-slate-400 mt-1">
                    Deixe em branco para tarefa avulsa, ou informe o número para buscar no Jira ({activeProject?.key || 'EXT'}).
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Status Inicial
                  </label>
                  <select
                    value={manualExecutionStatus}
                    onChange={(e) => setManualExecutionStatus(e.target.value as ExecutionStatus)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/50 cursor-pointer"
                  >
                    <option value="not_started">Não Iniciada</option>
                    <option value="started">Iniciada</option>
                    <option value="completed">Concluída</option>
                  </select>
                  <p className="text-[10px] text-slate-400 mt-1">Status de execução na fila.</p>
                </div>
              </div>

              {/* Título / Resumo da Demanda (Obrigatório) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Resumo / Título da Demanda <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={manualSummary}
                  onChange={(e) => setManualSummary(e.target.value)}
                  placeholder="Ex: Reunião de kick-off, Homologação com cliente, Validação técnica..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
              </div>

              {/* Responsável e Estimativa */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Quem irá executá-la? <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <Users className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <select
                      required
                      value={manualAssignee}
                      onChange={(e) => setManualAssignee(e.target.value)}
                      className="w-full pl-9 pr-8 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/50 appearance-none cursor-pointer"
                    >
                      <option value="" disabled>Selecione um executor cadastrado...</option>
                      {registeredAssignees.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                      {manualAssignee && !registeredAssignees.includes(manualAssignee) && (
                        <option value={manualAssignee}>
                          {manualAssignee} (Não cadastrado)
                        </option>
                      )}
                    </select>
                    <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Estimativa (Horas) <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <Clock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="number"
                      min="0.5"
                      step="0.5"
                      required
                      value={manualEstimateHours}
                      onChange={(e) => setManualEstimateHours(parseFloat(e.target.value) || 0)}
                      placeholder="Ex: 8"
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                    />
                  </div>
                </div>
              </div>

              {/* Data de Início Fixa (Opcional - Ideal para novos executores) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Data de Início Fixa <span className="text-slate-400 font-normal">(Opcional)</span>
                  </label>
                  {manualFixedStartDate && (
                    <button
                      type="button"
                      onClick={() => setManualFixedStartDate('')}
                      className="text-[11px] text-rose-500 hover:text-rose-600 dark:hover:text-rose-400 font-semibold cursor-pointer"
                    >
                      Limpar data fixa
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="date"
                    value={manualFixedStartDate}
                    onChange={(e) => setManualFixedStartDate(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  Se informada, esta demanda iniciará exatamente nesta data (ideal para tarefas de novos executores no projeto). Deixe em branco para calcular automaticamente.
                </p>
              </div>

              {/* Indústria e Canal (Opcionais) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Indústria (Opcional)
                  </label>
                  <div className="relative">
                    <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={manualIndustry}
                      onChange={(e) => setManualIndustry(e.target.value)}
                      placeholder="Ex: Varejo, Alimentícia"
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Canal de Distribuição (Opcional)
                  </label>
                  <div className="relative">
                    <Radio className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={manualCanal}
                      onChange={(e) => setManualCanal(e.target.value)}
                      placeholder="Ex: Direto, Distribuidor"
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                    />
                  </div>
                </div>
              </div>

              {/* Posição na Fila de Execução */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Posição na Fila de Execução
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setManualPosition('end')}
                    className={`py-2 px-2 rounded-xl border text-xs font-bold transition-all text-center flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
                      manualPosition === 'end'
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 shadow-sm'
                        : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <span>Final da Fila</span>
                    <span className="text-[10px] opacity-70 font-normal">#{localItems.length + 1}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setManualPosition('start')}
                    className={`py-2 px-2 rounded-xl border text-xs font-bold transition-all text-center flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
                      manualPosition === 'start'
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 shadow-sm'
                        : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <span>Início da Fila</span>
                    <span className="text-[10px] opacity-70 font-normal">#1 (Prioridade)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setManualPosition('custom');
                      if (!manualCustomPosition || manualCustomPosition < 1) {
                        setManualCustomPosition(Math.max(1, Math.min(localItems.length + 1, 2)));
                      }
                    }}
                    className={`py-2 px-2 rounded-xl border text-xs font-bold transition-all text-center flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
                      manualPosition === 'custom'
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 shadow-sm'
                        : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <span>Posição</span>
                    <span className="text-[10px] opacity-70 font-normal">#{manualCustomPosition || 1}</span>
                  </button>
                </div>

                {manualPosition === 'custom' && (
                  <div className="mt-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 animate-in fade-in duration-150">
                    <span className="text-xs text-slate-600 dark:text-slate-400 font-medium">
                      Posição desejada na fila (1 a {localItems.length + 1}):
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-slate-400">#</span>
                      <input
                        type="number"
                        min={1}
                        max={localItems.length + 1}
                        value={manualCustomPosition}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          setManualCustomPosition(isNaN(val) ? 1 : Math.max(1, Math.min(localItems.length + 1, val)));
                        }}
                        className="w-20 px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-bold text-center focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddManualModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/30 transition-all active:scale-95 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Incluir no Plano</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------- */}
      {/* MODAL: EDIT DEMAND IN PLAN (Editar Horas, Executor, etc)  */}
      {/* -------------------------------------------------------- */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#0e1424] border border-slate-200 dark:border-indigo-900/60 rounded-2xl w-full max-w-lg p-6 shadow-2xl relative text-slate-800 dark:text-slate-200">
            <button
              type="button"
              onClick={() => setEditingItem(null)}
              className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-600/20 text-amber-600 dark:text-amber-400 flex items-center justify-center border border-amber-200 dark:border-amber-500/30">
                <Pencil className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Editar Demanda do Plano
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {editingItem.metadata?.isManual || editingItem.metadata?.isExternal
                    ? 'Altere os dados da tarefa avulsa no cronograma.'
                    : 'Altere a estimativa de horas ou o executor da demanda no plano.'}
                </p>
              </div>
            </div>

            {/* Target Issue Details Card */}
            {editingDemand && !editingItem.metadata?.isManual && !editingItem.metadata?.isExternal ? (
              <div className="mb-5">
                <JiraCard demand={editingDemand} showDueDateBadge={true} />
              </div>
            ) : (
              <div className="mb-5 p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/40 dark:bg-emerald-950/30">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-mono font-bold text-xs text-emerald-700 dark:text-emerald-300">
                    {editingItem?.issue_key}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 uppercase">
                    Tarefa Avulsa (Não Jira)
                  </span>
                </div>
                <div className="text-xs text-slate-700 dark:text-slate-300 font-medium">
                  {editingItem?.summary}
                </div>
              </div>
            )}

            <form onSubmit={handleConfirmEdit} className="space-y-4">
              {/* Para tarefas manuais: Resumo e Status */}
              {(editingItem.metadata?.isManual || editingItem.metadata?.isExternal) && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Resumo / Título da Demanda <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={editSummary}
                      onChange={(e) => setEditSummary(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Status da Demanda
                    </label>
                    <select
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    >
                      <option value="Planejado">Planejado</option>
                      <option value="A Fazer">A Fazer</option>
                      <option value="Em Andamento">Em Andamento</option>
                      <option value="Pendente">Pendente</option>
                    </select>
                  </div>
                </>
              )}

              {/* Status de Execução no Plano */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Status de Execução no Plano
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditExecutionStatus('not_started')}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      editExecutionStatus === 'not_started'
                        ? 'border-slate-500 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm ring-1 ring-slate-400'
                        : 'border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-900'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span>Não Iniciada</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditExecutionStatus('started')}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      editExecutionStatus === 'started'
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 shadow-sm ring-1 ring-blue-400'
                        : 'border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-900'
                    }`}
                  >
                    <Play className="w-3.5 h-3.5 text-blue-500 fill-current" />
                    <span>Iniciada</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditExecutionStatus('completed')}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      editExecutionStatus === 'completed'
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 shadow-sm ring-1 ring-emerald-400'
                        : 'border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-900'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Concluída</span>
                  </button>
                </div>
              </div>

              {/* Estimativa em Horas (Obrigatório) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Estimativa de Tempo (Horas) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Clock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="number"
                    min="0.5"
                    step="0.5"
                    required
                    value={editEstimateHours}
                    onChange={(e) => setEditEstimateHours(parseFloat(e.target.value) || 0)}
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    placeholder="Ex: 8 ou 16"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Considera a jornada diária configurada ({settings.work_hours_per_day}h/dia).
                </p>
              </div>

              {/* Executor / Responsável (Obrigatório) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Quem irá executá-la? <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Users className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <select
                    required
                    value={editAssignee}
                    onChange={(e) => setEditAssignee(e.target.value)}
                    className="w-full pl-9 pr-8 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/50 appearance-none cursor-pointer"
                  >
                    <option value="" disabled>Selecione um executor cadastrado...</option>
                    {registeredAssignees.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                    {editAssignee && !registeredAssignees.includes(editAssignee) && (
                      <option value={editAssignee}>
                        {editAssignee} (Atual - não cadastrado)
                      </option>
                    )}
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Ao trocar de responsável ou alterar as horas, o cronograma é recalculado automaticamente.
                </p>
              </div>

              {/* Data de Início Fixa (Opcional) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Data de Início Fixa <span className="text-slate-400 font-normal">(Opcional)</span>
                  </label>
                  {editFixedStartDate && (
                    <button
                      type="button"
                      onClick={() => setEditFixedStartDate('')}
                      className="text-[11px] text-rose-500 hover:text-rose-600 dark:hover:text-rose-400 font-semibold cursor-pointer"
                    >
                      Remover data fixa
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="date"
                    value={editFixedStartDate}
                    onChange={(e) => setEditFixedStartDate(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Se informada, esta demanda iniciará exatamente nesta data. Remova para calcular automaticamente.
                </p>
              </div>

              {/* Para tarefas manuais: Indústria e Canal */}
              {(editingItem.metadata?.isManual || editingItem.metadata?.isExternal) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Indústria (Opcional)
                    </label>
                    <input
                      type="text"
                      value={editIndustry}
                      onChange={(e) => setEditIndustry(e.target.value)}
                      placeholder="Ex: Varejo"
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Canal (Opcional)
                    </label>
                    <input
                      type="text"
                      value={editCanal}
                      onChange={(e) => setEditCanal(e.target.value)}
                      placeholder="Ex: Direto"
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    />
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 transition-all active:scale-95"
                >
                  <Save className="w-4 h-4" />
                  <span>Salvar Alterações</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------- */}
      {/* MODAL: SYNC DATES & COMMENT WITH JIRA                    */}
      {/* -------------------------------------------------------- */}
      {syncJiraItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#0e1424] border border-slate-200 dark:border-indigo-900/60 rounded-2xl w-full max-w-lg p-6 shadow-2xl relative text-slate-800 dark:text-slate-200">
            <button
              type="button"
              onClick={() => !isSyncingJira && setSyncJiraItem(null)}
              disabled={isSyncingJira}
              className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-40 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-600/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center border border-indigo-200 dark:border-indigo-500/30">
                <CalendarSync className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Sincronizar com o Jira
                  </h3>
                  {isClientView && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700/50">
                      Modo Cliente
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {isClientView
                    ? "Atualize o prazo/data de entrega (Due Date) no Jira com as datas calculadas no Modo Cliente."
                    : "Atualize as datas de início e fim da demanda diretamente no Jira."}
                </p>
              </div>
            </div>

            {/* Target Issue Details Card */}
            {syncJiraDemand && (
              <div className="mb-4">
                <JiraCard demand={syncJiraDemand} showDueDateBadge={true} />
              </div>
            )}

            {/* Datas calculadas que serão enviadas para o Jira */}
            <div className="mb-4 p-3.5 rounded-xl border border-indigo-100 dark:border-indigo-900/40 bg-indigo-50/40 dark:bg-indigo-950/30">
              <div className="text-[11px] font-bold text-indigo-900 dark:text-indigo-200 uppercase tracking-wider mb-2 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>Datas que serão gravadas no Jira</span>
                </div>
                {isClientView && (
                  <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                    Previsão com buffer ({settings.client_delivery_buffer_days ?? 1}d)
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white dark:bg-slate-900/80 p-2.5 rounded-lg border border-indigo-100/80 dark:border-indigo-900/30">
                  <span className="block text-[10px] font-bold text-slate-400 uppercase">Data de Início</span>
                  <span className="text-sm font-extrabold text-slate-800 dark:text-white">
                    {format(parseISO(syncJiraItem.start_date), 'dd/MM/yyyy')}
                  </span>
                </div>
                <div className="bg-white dark:bg-slate-900/80 p-2.5 rounded-lg border border-indigo-100/80 dark:border-indigo-900/30">
                  <span className="block text-[10px] font-bold text-slate-400 uppercase">
                    {isClientView ? "Data de Entrega (Due Date)" : "Data de Fim (Due Date)"}
                  </span>
                  <span className="text-sm font-extrabold text-slate-800 dark:text-white">
                    {format(parseISO(syncJiraItem.end_date), 'dd/MM/yyyy')}
                  </span>
                </div>
              </div>
              {syncJiraItem.metadata?.duedate && syncJiraItem.metadata.duedate !== syncJiraItem.end_date && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium mt-2 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                  <span>
                    O prazo anterior no Jira ({format(parseISO(syncJiraItem.metadata.duedate), 'dd/MM/yyyy')}) será substituído por {format(parseISO(syncJiraItem.end_date), 'dd/MM/yyyy')}.
                  </span>
                </p>
              )}
            </div>

            <form onSubmit={handleConfirmSyncJira} className="space-y-4">
              {/* Comentário Opcional */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
                  <span>Adicionar Comentário no Jira (Opcional)</span>
                </label>
                <textarea
                  rows={3}
                  value={syncJiraComment}
                  onChange={(e) => setSyncJiraComment(e.target.value)}
                  disabled={isSyncingJira}
                  placeholder={
                    isClientView
                      ? "Ex: Previsão de entrega alinhada com o cliente..."
                      : "Ex: Datas atualizadas conforme planejamento da fila de execução..."
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-y"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Se preenchido, este comentário será publicado no histórico da demanda no Jira.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setSyncJiraItem(null)}
                  disabled={isSyncingJira}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-all disabled:opacity-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSyncingJira}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  {isSyncingJira ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Sincronizando...</span>
                    </>
                  ) : (
                    <>
                      <CalendarSync className="w-4 h-4" />
                      <span>Confirmar e Sincronizar</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------- */}
      {/* MODAL: CREATE NEW PROJECT / PLAN                         */}
      {/* -------------------------------------------------------- */}
      {isNewProjectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#0e1424] border border-slate-200 dark:border-indigo-900/60 rounded-2xl w-full max-w-lg p-6 shadow-2xl relative text-slate-800 dark:text-slate-200">
            <button
              type="button"
              onClick={() => setIsNewProjectModalOpen(false)}
              className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-600/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center border border-indigo-200 dark:border-indigo-500/30">
                <FolderPlus className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Cadastrar Novo Plano
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Crie um plano independente com fila de execução e metas próprias.
                </p>
              </div>
            </div>

            <form onSubmit={handleCreateProject} className="space-y-4">
              {/* Projeto no Jira */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Projeto do Jira <span className="text-rose-500">*</span>
                </label>
                <div className="flex gap-2">
                  <select
                    value={newJiraKey}
                    onChange={(e) => {
                      const selected = e.target.value;
                      setNewJiraKey(selected);
                      setNewProjectKey(suggestNextPlanKey(selected));
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  >
                    {jiraProjects.map((jp) => (
                      <option key={jp} value={jp}>
                        {jp}
                      </option>
                    ))}
                    {!jiraProjects.includes(newJiraKey) && newJiraKey && (
                      <option value={newJiraKey}>{newJiraKey}</option>
                    )}
                  </select>
                  <input
                    type="text"
                    maxLength={15}
                    value={newJiraKey}
                    onChange={(e) => {
                      const val = e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '');
                      setNewJiraKey(val);
                      setNewProjectKey(suggestNextPlanKey(val));
                    }}
                    placeholder="Outro (Ex: CRM)"
                    className="w-36 px-2.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-mono font-bold uppercase focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    title="Ou digite outra sigla de projeto do Jira"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  As demandas do backlog serão obtidas deste projeto no Jira.
                </p>
              </div>

              {/* Nome do Plano */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Nome do Plano / Projeto <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="Ex: Neogrid - Fase 2, Neogrid - Sprint 1"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
              </div>

              {/* Identificador / Chave do Plano */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Identificador do Plano (Chave Única) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  maxLength={25}
                  value={newProjectKey}
                  onChange={(e) => setNewProjectKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))}
                  placeholder="Ex: NEO-2, NEO-FASE2"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-mono font-bold uppercase focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Identificador interno deste plano (sugestão automática baseada no projeto do Jira).
                </p>
              </div>

              {/* Descrição do Projeto */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Descrição (Opcional)
                </label>
                <textarea
                  rows={2}
                  value={newProjectDesc}
                  onChange={(e) => setNewProjectDesc(e.target.value)}
                  placeholder="Breve descrição do escopo, sprint ou equipe..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
              </div>

              <div className="p-3 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/50 text-[11px] text-indigo-700 dark:text-indigo-300 space-y-1">
                <span className="font-bold block">✨ Múltiplos Planos para o Mesmo Projeto Jira:</span>
                <span>Você pode criar quantos planos desejar associados ao mesmo projeto do Jira. Cada plano mantém sua própria fila de execução, datas e configurações de forma independente.</span>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsNewProjectModalOpen(false)}
                  disabled={isCreatingProject}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isCreatingProject}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 transition-all active:scale-95 disabled:opacity-50"
                >
                  {isCreatingProject ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  <span>Cadastrar Plano</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------- */}
      {/* MODAL: EDIT / MANAGE PROJECT / PLAN                      */}
      {/* -------------------------------------------------------- */}
      {editingProjectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#0e1424] border border-slate-200 dark:border-indigo-900/60 rounded-2xl w-full max-w-lg p-6 shadow-2xl relative text-slate-800 dark:text-slate-200">
            <button
              type="button"
              onClick={() => setEditingProjectModal(null)}
              className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-600/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center border border-indigo-200 dark:border-indigo-500/30">
                <Pencil className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Editar Plano · {editingProjectModal.key}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Atualize o nome, descrição ou projeto Jira associado.
                </p>
              </div>
            </div>

            <form onSubmit={handleUpdateProject} className="space-y-4">
              {/* Identificador do Plano (fixo) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Identificador do Plano
                </label>
                <div className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-mono font-bold text-slate-500">
                  {editingProjectModal.key}
                </div>
              </div>

              {/* Projeto Jira Associado */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Projeto do Jira Associado <span className="text-rose-500">*</span>
                </label>
                <div className="flex gap-2">
                  <select
                    value={editJiraKey}
                    onChange={(e) => setEditJiraKey(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  >
                    {jiraProjects.map((jp) => (
                      <option key={jp} value={jp}>
                        {jp}
                      </option>
                    ))}
                    {!jiraProjects.includes(editJiraKey) && editJiraKey && (
                      <option value={editJiraKey}>{editJiraKey}</option>
                    )}
                  </select>
                  <input
                    type="text"
                    maxLength={15}
                    value={editJiraKey}
                    onChange={(e) => setEditJiraKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))}
                    placeholder="Outro..."
                    className="w-36 px-2.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-mono font-bold uppercase focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  O backlog deste plano obtém as demandas deste projeto no Jira.
                </p>
              </div>

              {/* Nome do Plano */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Nome do Plano <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editProjectName}
                  onChange={(e) => setEditProjectName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
              </div>

              {/* Descrição do Projeto */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Descrição
                </label>
                <textarea
                  rows={2}
                  value={editProjectDesc}
                  onChange={(e) => setEditProjectDesc(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => handleDeleteProject(editingProjectModal)}
                  disabled={isDeletingProject || projects.length <= 1}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  title={projects.length <= 1 ? 'Não é possível excluir o único plano restante' : 'Excluir plano e suas tarefas'}
                >
                  {isDeletingProject ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  <span>Excluir Plano</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingProjectModal(null)}
                    disabled={isSavingProjectInfo}
                    className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingProjectInfo}
                    className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 transition-all active:scale-95 disabled:opacity-50"
                  >
                    {isSavingProjectInfo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    <span>Salvar</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------- */}
      {/* MODAL: INVERTER ORDEM DE TAREFAS NA FILA                 */}
      {/* -------------------------------------------------------- */}
      {isSwapModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#0e1424] border border-slate-200 dark:border-indigo-900/60 rounded-2xl w-full max-w-xl p-6 shadow-2xl relative text-slate-800 dark:text-slate-200">
            <button
              type="button"
              onClick={() => !isSwapping && setIsSwapModalOpen(false)}
              disabled={isSwapping}
              className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-40 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-600/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center border border-indigo-200 dark:border-indigo-500/30">
                <ArrowUpDown className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Inverter Ordem de Tarefas
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Troque a posição de duas tarefas na fila de execução mantendo o restante do cronograma alinhado.
                </p>
              </div>
            </div>

            {/* Selects: Tarefa 1 e Tarefa 2 */}
            <div className="space-y-4 mb-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                {/* Select Tarefa 1 */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Primeira Tarefa
                  </label>
                  <select
                    value={swapItem1Key}
                    onChange={(e) => setSwapItem1Key(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  >
                    {localItems.map((item) => (
                      <option key={`swap1-${item.issue_key}`} value={item.issue_key}>
                        #{item.sort_order} · {item.issue_key} - {item.summary.length > 28 ? item.summary.substring(0, 28) + '...' : item.summary} ({item.estimated_hours}h)
                      </option>
                    ))}
                  </select>
                </div>

                {/* Select Tarefa 2 */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Segunda Tarefa
                  </label>
                  <select
                    value={swapItem2Key}
                    onChange={(e) => setSwapItem2Key(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  >
                    {localItems.map((item) => (
                      <option key={`swap2-${item.issue_key}`} value={item.issue_key}>
                        #{item.sort_order} · {item.issue_key} - {item.summary.length > 28 ? item.summary.substring(0, 28) + '...' : item.summary} ({item.estimated_hours}h)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Botão rápido para alternar a seleção */}
              <div className="flex justify-center -my-2">
                <button
                  type="button"
                  onClick={() => {
                    const t = swapItem1Key;
                    setSwapItem1Key(swapItem2Key);
                    setSwapItem2Key(t);
                  }}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 text-[10px] font-bold transition-all shadow-xs cursor-pointer"
                  title="Inverter seleção"
                >
                  <ArrowUpDown className="w-3 h-3" />
                  <span>Alternar seleção</span>
                </button>
              </div>

              {/* Cards comparativos */}
              {swapItem1 && swapItem2 && swapItem1.issue_key !== swapItem2.issue_key && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-black text-indigo-600 dark:text-indigo-400 text-xs">
                        {swapItem1.issue_key}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300">
                        #{swapItem1.sort_order} ➔ #{swapItem2.sort_order}
                      </span>
                    </div>
                    <p className="font-medium text-slate-700 dark:text-slate-300 line-clamp-1 text-[11px]" title={swapItem1.summary}>
                      {swapItem1.summary}
                    </p>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-2">
                      <span>Duração: <strong>{swapItem1.estimated_hours}h</strong></span>
                      <span>•</span>
                      <span>Resp: <strong>{swapItem1.assignee_name || '-'}</strong></span>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-black text-indigo-600 dark:text-indigo-400 text-xs">
                        {swapItem2.issue_key}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300">
                        #{swapItem2.sort_order} ➔ #{swapItem1.sort_order}
                      </span>
                    </div>
                    <p className="font-medium text-slate-700 dark:text-slate-300 line-clamp-1 text-[11px]" title={swapItem2.summary}>
                      {swapItem2.summary}
                    </p>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-2">
                      <span>Duração: <strong>{swapItem2.estimated_hours}h</strong></span>
                      <span>•</span>
                      <span>Resp: <strong>{swapItem2.assignee_name || '-'}</strong></span>
                    </div>
                  </div>
                </div>
              )}

              {/* Mensagem contextual sobre a duração */}
              {swapItem1 && swapItem2 && swapItem1.issue_key === swapItem2.issue_key ? (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-[11px] text-rose-700 dark:text-rose-300 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>Selecione duas tarefas diferentes para realizar a inversão.</span>
                </div>
              ) : swapItem1 && swapItem2 && Number(swapItem1.estimated_hours) === Number(swapItem2.estimated_hours) ? (
                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 text-[11px] text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                  <span>
                    <strong>Mesmo tempo de execução ({swapItem1.estimated_hours}h):</strong> a inversão não alterará as datas das demais demandas da fila de execução.
                  </span>
                </div>
              ) : swapItem1 && swapItem2 ? (
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 text-[11px] text-amber-800 dark:text-amber-300 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                  <span>
                    <strong>Tempos diferentes ({swapItem1.estimated_hours}h vs {swapItem2.estimated_hours}h):</strong> as datas de início e fim das demandas posteriores serão recalculadas automaticamente.
                  </span>
                </div>
              ) : null}
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsSwapModalOpen(false)}
                disabled={isSwapping}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-all cursor-pointer"
              >
                Cancelar
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleExecuteSwap(false)}
                  disabled={!swapItem1 || !swapItem2 || swapItem1.issue_key === swapItem2.issue_key || isSwapping}
                  className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold transition-all disabled:opacity-40 cursor-pointer"
                  title="Inverte na tela para você conferir antes de salvar"
                >
                  Inverter na Fila
                </button>

                <button
                  type="button"
                  onClick={() => handleExecuteSwap(true)}
                  disabled={!swapItem1 || !swapItem2 || swapItem1.issue_key === swapItem2.issue_key || isSwapping}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 transition-all active:scale-95 disabled:opacity-40 cursor-pointer"
                  title="Inverte a ordem e salva imediatamente no banco de dados com registro no log"
                >
                  {isSwapping ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowUpDown className="w-3.5 h-3.5" />}
                  <span>Inverter e Salvar</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Hidden Off-Screen Container for SysMiddle Branded PDF Export */}
      <ProjectPdfExportTemplate
        containerRef={pdfExportContainerRef}
        projectName={activeProject?.name || selectedProjectKey}
        items={filteredPlanItems}
        settings={settings}
        holidaySet={holidaySet}
        isClientView={isClientView}
        pdfExportMode={pdfExportMode}
        logs={filteredLogs}
      />
    </div>
  );
};

// -------------------------------------------------------------
// SETTINGS PANEL COMPONENT
// -------------------------------------------------------------

interface ProjectSettingsPanelProps {
  settings: ProjectSettings;
  activeProject: ProjectRecord | null;
  availablePlanAssignees?: string[];
  onSaveSettings: (settings: ProjectSettings) => Promise<void>;
  onResetHolidays: () => Promise<void>;
}

const ProjectSettingsPanel: React.FC<ProjectSettingsPanelProps> = ({
  settings,
  activeProject,
  availablePlanAssignees = [],
  onSaveSettings,
  onResetHolidays,
}) => {
  const [formData, setFormData] = useState<ProjectSettings>(settings);
  const [newDeliveredUser, setNewDeliveredUser] = useState('');
  const [newIssueType, setNewIssueType] = useState('');
  const [newHolidayDate, setNewHolidayDate] = useState('');
  const [newHolidayName, setNewHolidayName] = useState('');
  const [holidaySearch, setHolidaySearch] = useState('');
  const [newAssigneeName, setNewAssigneeName] = useState('');
  const [assigneeSearch, setAssigneeSearch] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setFormData(settings);
  }, [settings]);

  // Add / Remove Global Assignees
  const handleAddAssignee = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const norm = newAssigneeName.trim();
    if (!norm) return;
    const current = formData.global_assignees || [];
    if (!current.some((a) => a.toLowerCase() === norm.toLowerCase())) {
      setFormData((prev) => ({
        ...prev,
        global_assignees: [...(prev.global_assignees || []), norm].sort((a, b) =>
          a.localeCompare(b, 'pt-BR')
        ),
      }));
    }
    setNewAssigneeName('');
  };

  const handleRemoveAssignee = (name: string) => {
    setFormData((prev) => ({
      ...prev,
      global_assignees: (prev.global_assignees || []).filter((a) => a !== name),
    }));
  };

  const handleImportExisting = () => {
    if (!availablePlanAssignees || availablePlanAssignees.length === 0) return;
    const current = formData.global_assignees || [];
    const combined = Array.from(new Set([...current, ...availablePlanAssignees])).sort((a, b) =>
      a.localeCompare(b, 'pt-BR')
    );
    setFormData((prev) => ({
      ...prev,
      global_assignees: combined,
    }));
  };

  const filteredAssignees = useMemo(() => {
    const list = formData.global_assignees || [];
    if (!assigneeSearch.trim()) return list;
    const q = assigneeSearch.toLowerCase();
    return list.filter((a) => a.toLowerCase().includes(q));
  }, [formData.global_assignees, assigneeSearch]);

  // Add delivered user tag
  const handleAddUser = () => {
    if (!newDeliveredUser.trim()) return;
    const norm = newDeliveredUser.trim();
    if (!formData.delivered_users.includes(norm)) {
      setFormData((prev) => ({
        ...prev,
        delivered_users: [...prev.delivered_users, norm],
      }));
    }
    setNewDeliveredUser('');
  };

  const handleRemoveUser = (name: string) => {
    setFormData((prev) => ({
      ...prev,
      delivered_users: prev.delivered_users.filter((u) => u !== name),
    }));
  };

  // Add / Remove Issue Types
  const handleAddIssueType = (customType?: string) => {
    const typeToAdd = (customType !== undefined ? customType : newIssueType).trim();
    if (!typeToAdd) return;
    const currentTypes = formData.issue_types || [];
    if (!currentTypes.some((t) => t.toLowerCase() === typeToAdd.toLowerCase())) {
      setFormData((prev) => ({
        ...prev,
        issue_types: [...(prev.issue_types || []), typeToAdd],
      }));
    }
    if (customType === undefined) {
      setNewIssueType('');
    }
  };

  const handleRemoveIssueType = (typeToRemove: string) => {
    setFormData((prev) => ({
      ...prev,
      issue_types: (prev.issue_types || []).filter(
        (t) => t.toLowerCase() !== typeToRemove.toLowerCase()
      ),
    }));
  };

  // Add Holiday
  const handleAddHoliday = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHolidayDate || !newHolidayName.trim()) return;
    setFormData((prev) => ({
      ...prev,
      holidays: [
        ...prev.holidays,
        { date: newHolidayDate.trim(), name: newHolidayName.trim() },
      ].sort((a, b) => a.date.localeCompare(b.date)),
    }));
    setNewHolidayDate('');
    setNewHolidayName('');
  };

  const handleRemoveHoliday = (date: string) => {
    setFormData((prev) => ({
      ...prev,
      holidays: prev.holidays.filter((h) => h.date !== date),
    }));
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      await onSaveSettings(formData);
    } finally {
      setIsSaving(false);
    }
  };

  const filteredHolidays = useMemo(() => {
    if (!holidaySearch.trim()) return formData.holidays;
    const q = holidaySearch.toLowerCase();
    return formData.holidays.filter(
      (h) => h.date.includes(q) || h.name.toLowerCase().includes(q)
    );
  }, [formData.holidays, holidaySearch]);

  return (
    <div className="bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4 gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-black text-slate-800 dark:text-white flex items-center gap-2">
              <SettingsIcon className="w-5 h-5 text-indigo-500" />
              <span>Configurações · {activeProject?.name || 'Projeto'}</span>
            </h2>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20">
              PROJETO {activeProject?.key || ''}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            As configurações abaixo (exceto executores e feriados globais) pertencem exclusivamente a este projeto.
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-600/30 transition-all active:scale-95 disabled:opacity-50 self-start sm:self-auto"
        >
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          <span>Salvar Configurações</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 1. Tipos de Cards Considerados no Backlog */}
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold text-slate-800 dark:text-white flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-emerald-500" />
                <span>Tipos de Cards Considerados no Backlog</span>
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Filtra quais tipos de demandas (issuetypes do Jira) são consideradas neste projeto.
              </p>
            </div>
            <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 uppercase">
              Por Projeto
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 min-h-[38px] p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700">
            {formData.issue_types && formData.issue_types.length > 0 ? (
              formData.issue_types.map((type) => (
                <span
                  key={type}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-xs font-bold border border-emerald-200 dark:border-emerald-500/30"
                >
                  <span>{type}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveIssueType(type)}
                    className="hover:text-rose-500 transition-colors"
                    title={`Remover tipo "${type}"`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))
            ) : (
              <span className="text-[11px] italic text-slate-400 px-1">
                Nenhum tipo específico selecionado (todas as demandas serão consideradas, exceto Épicos e Subtarefas).
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newIssueType}
              onChange={(e) => setNewIssueType(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddIssueType();
                }
              }}
              placeholder="Digite o tipo (ex: Ativação, Tarefa, Bug)..."
              className="flex-1 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs text-slate-800 dark:text-white"
            />
            <button
              type="button"
              onClick={() => handleAddIssueType()}
              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 transition-colors"
            >
              Adicionar
            </button>
          </div>

          {/* Sugestões Rápidas */}
          <div className="pt-1">
            <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">
              Sugestões rápidas:
            </div>
            <div className="flex flex-wrap gap-1.5">
              {['Ativação', 'Tarefa', 'Task', 'Bug', 'História', 'Story'].map((sug) => {
                const isSelected = (formData.issue_types || []).some(
                  (t) => t.toLowerCase() === sug.toLowerCase()
                );
                return (
                  <button
                    key={sug}
                    type="button"
                    disabled={isSelected}
                    onClick={() => handleAddIssueType(sug)}
                    className={`text-[11px] px-2 py-0.5 rounded-md font-medium transition-all ${
                      isSelected
                        ? 'opacity-40 cursor-not-allowed bg-slate-100 dark:bg-slate-800 text-slate-400'
                        : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/60 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-700/40'
                    }`}
                  >
                    + {sug}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* 2. Usuários de Atividade Concluída */}
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold text-slate-800 dark:text-white flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-indigo-500" />
                <span>Usuários de Conclusão / Entrega</span>
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Demandas atribuídas a esses usuários saem do backlog deste projeto.
              </p>
            </div>
            <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 uppercase">
              Por Projeto
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 min-h-[38px] p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700">
            {formData.delivered_users.map((u) => (
              <span
                key={u}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-xs font-bold border border-indigo-200 dark:border-indigo-500/30"
              >
                <span>{u}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveUser(u)}
                  className="hover:text-rose-500"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newDeliveredUser}
              onChange={(e) => setNewDeliveredUser(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddUser();
                }
              }}
              placeholder={`Adicionar usuário de entrega (${activeProject?.name || 'este projeto'})...`}
              className="flex-1 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs text-slate-800 dark:text-white"
            />
            <button
              type="button"
              onClick={handleAddUser}
              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 transition-colors"
            >
              Adicionar
            </button>
          </div>
        </div>

        {/* 3. Parâmetros de Cálculo da Jornada */}
        <div className="md:col-span-2 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold text-slate-800 dark:text-white flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-indigo-500" />
                <span>Parâmetros da Jornada de Trabalho</span>
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Capacidade produtiva diária e parâmetros de cálculo para este projeto.
              </p>
            </div>
            <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 uppercase">
              Por Projeto
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                Horas por Dia (Úteis)
              </label>
              <input
                type="number"
                min="1"
                max="24"
                value={formData.work_hours_per_day}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    work_hours_per_day: Math.max(1, parseInt(e.target.value, 10) || 8),
                  }))
                }
                className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-white"
              />
              <p className="text-[10px] text-slate-400 mt-1">Horas úteis produtivas/dia.</p>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                Data Base de Início
              </label>
              <input
                type="date"
                value={formData.plan_start_date}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    plan_start_date: e.target.value,
                  }))
                }
                className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-white"
              />
              <p className="text-[10px] text-slate-400 mt-1">Data que inicia a 1ª tarefa.</p>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                Acréscimo de Horas (%)
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  max="500"
                  step="1"
                  value={formData.client_hours_markup_percent ?? 0}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      client_hours_markup_percent: Math.max(0, parseFloat(e.target.value) || 0),
                    }))
                  }
                  placeholder="0"
                  className="w-full px-3 py-1.5 pr-8 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-white"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                  %
                </span>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                Margem no modo cliente.
              </p>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                Buffer de Entrega (Dias)
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  max="60"
                  step="1"
                  value={formData.client_delivery_buffer_days ?? 1}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      client_delivery_buffer_days: Math.max(0, parseInt(e.target.value, 10) || 0),
                    }))
                  }
                  placeholder="1"
                  className="w-full px-3 py-1.5 pr-20 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-white"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">
                  {(formData.client_delivery_buffer_days ?? 1) === 1 ? 'dia útil' : 'dias úteis'}
                </span>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                Dias extras no modo cliente.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Gestão de Executores Globais de Tarefas */}
      <div className="p-5 rounded-2xl border-2 border-dashed border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/20 dark:bg-indigo-950/20 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-slate-800 dark:text-white flex items-center gap-1.5">
                <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span>Executores de Tarefas Cadastrados ({(formData.global_assignees || []).length})</span>
              </h3>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700/50">
                <Globe className="w-3 h-3" />
                <span>Global · Compartilhado entre todos os projetos</span>
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              Cadastre os membros da equipe que podem ser atribuídos como executores das demandas. Todos os campos de responsável nas tarefas passam a aceitar exclusivamente a seleção desta lista.
            </p>
          </div>

          {availablePlanAssignees && availablePlanAssignees.length > 0 && (
            <button
              type="button"
              onClick={handleImportExisting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 dark:bg-slate-800 dark:hover:bg-slate-750 dark:text-slate-200 dark:border-slate-700 text-xs font-bold transition-all shadow-sm self-start sm:self-auto"
              title="Importa os executores das demandas existentes no plano atual para a lista global"
            >
              <UserPlus className="w-3.5 h-3.5 text-indigo-500" />
              <span>Importar das Demandas Atuais</span>
            </button>
          )}
        </div>

        {/* Formulário de Adicionar Executor */}
        <form onSubmit={handleAddAssignee} className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[240px]">
            <Users className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              required
              value={newAssigneeName}
              onChange={(e) => setNewAssigneeName(e.target.value)}
              placeholder="Nome completo do executor (Ex: Maria Silva)..."
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs text-slate-800 dark:text-white font-medium"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-colors shadow-sm"
          >
            + Cadastrar Executor
          </button>
        </form>

        {/* Lista de Executores */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <input
              type="text"
              value={assigneeSearch}
              onChange={(e) => setAssigneeSearch(e.target.value)}
              placeholder="Buscar executor cadastrado..."
              className="max-w-xs px-3 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-[11px] text-slate-800 dark:text-white"
            />
            <span className="text-[10px] text-slate-400 font-bold">
              Mostrando {filteredAssignees.length} de {(formData.global_assignees || []).length}
            </span>
          </div>

          {filteredAssignees.length === 0 ? (
            <div className="p-4 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-center text-xs text-slate-500 dark:text-slate-400">
              Nenhum executor cadastrado ainda. Digite o nome acima e clique em &quot;Cadastrar Executor&quot;.
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 max-h-56 overflow-y-auto">
              {filteredAssignees.map((assignee) => (
                <span
                  key={assignee}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-xs font-bold border border-indigo-200 dark:border-indigo-500/30"
                >
                  <Users className="w-3.5 h-3.5 text-indigo-500" />
                  <span>{assignee}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveAssignee(assignee)}
                    className="hover:text-rose-500 ml-1 p-0.5 text-slate-400 dark:text-slate-500 transition-colors"
                    title={`Remover ${assignee}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 5. Gestão de Feriados e Dias Não Trabalhados */}
      <div className="p-5 rounded-2xl border-2 border-dashed border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/20 dark:bg-indigo-950/20 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-slate-800 dark:text-white flex items-center gap-1.5">
                <Globe className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span>Feriados Nacionais e Dias Não Trabalhados ({formData.holidays.length})</span>
              </h3>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700/50">
                <Globe className="w-3 h-3" />
                <span>Global · Compartilhado entre todos os projetos</span>
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              As datas cadastradas aqui afetam o cronograma de todos os projetos cadastrados.
            </p>
          </div>

          <button
            type="button"
            onClick={onResetHolidays}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 dark:bg-slate-800 dark:hover:bg-slate-750 dark:text-slate-200 dark:border-slate-700 text-xs font-bold transition-all shadow-sm self-start sm:self-auto"
            title="Recarrega a lista padrão com todos os feriados nacionais de 2026 a 2028 para todos os projetos"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
            <span>Restaurar Feriados Padrões (2026-2028)</span>
          </button>
        </div>

        {/* Add Holiday Form */}
        <form onSubmit={handleAddHoliday} className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            required
            value={newHolidayDate}
            onChange={(e) => setNewHolidayDate(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs text-slate-800 dark:text-white"
          />
          <input
            type="text"
            required
            value={newHolidayName}
            onChange={(e) => setNewHolidayName(e.target.value)}
            placeholder="Nome do feriado ou recesso..."
            className="flex-1 min-w-[200px] px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs text-slate-800 dark:text-white"
          />
          <button
            type="submit"
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-bold transition-colors"
          >
            + Adicionar Feriado
          </button>
        </form>

        {/* Holidays List Table */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <input
              type="text"
              value={holidaySearch}
              onChange={(e) => setHolidaySearch(e.target.value)}
              placeholder="Buscar feriado..."
              className="max-w-xs px-3 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-[11px] text-slate-800 dark:text-white"
            />
            <span className="text-[10px] text-slate-400 font-bold">
              Mostrando {filteredHolidays.length} de {formData.holidays.length}
            </span>
          </div>

          <div className="max-h-60 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <table className="w-full text-left text-xs">
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredHolidays.map((h) => (
                  <tr key={h.date} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-2 px-3 font-mono font-bold text-slate-700 dark:text-slate-300 w-32">
                      {format(parseISO(h.date), 'dd/MM/yyyy')}
                    </td>
                    <td className="py-2 px-3 font-medium text-slate-800 dark:text-slate-200">
                      {h.name}
                    </td>
                    <td className="py-2 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleRemoveHoliday(h.date)}
                        className="text-slate-400 hover:text-rose-500 p-1"
                        title="Remover feriado"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
