import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Calendar,
  Clock,
  Users,
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
} from 'lucide-react';
import {
  format,
  parseISO,
  differenceInCalendarDays,
  addDays,
  isSameDay,
  isToday,
  startOfWeek,
  endOfWeek,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toJpeg } from 'html-to-image';
import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';

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

  // Modais de Criação e Edição de Projeto
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false);
  const [newProjectKey, setNewProjectKey] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [isCreatingProject, setIsCreatingProject] = useState(false);

  const [editingProjectModal, setEditingProjectModal] = useState<ProjectRecord | null>(null);
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

  // Core Data
  const [settings, setSettings] = useState<ProjectSettings>({
    delivered_users: ['Neogrid'],
    work_hours_per_day: 8,
    plan_start_date: format(new Date(), 'yyyy-MM-dd'),
    holidays: [],
    client_hours_markup_percent: 0,
    client_delivery_buffer_days: 1,
    issue_types: ['Ativação', 'Tarefa'],
  });

  // Stored / Server Plan vs Live Local Plan
  const [serverItems, setServerItems] = useState<ScheduledPlanItem[]>([]);
  const [localItems, setLocalItems] = useState<ScheduledPlanItem[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

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

  // Modal: Add Manual Task (Não Jira)
  const [isAddManualModalOpen, setIsAddManualModalOpen] = useState(false);
  const [manualKey, setManualKey] = useState('');
  const [manualSummary, setManualSummary] = useState('');
  const [manualAssignee, setManualAssignee] = useState('');
  const [manualEstimateHours, setManualEstimateHours] = useState<number>(8);
  const [manualStatus, setManualStatus] = useState('Planejado');
  const [manualIndustry, setManualIndustry] = useState('');
  const [manualCanal, setManualCanal] = useState('');
  const [manualPosition, setManualPosition] = useState<'end' | 'start'>('end');

  // Modal: Edit Demand in Plan
  const [editingItem, setEditingItem] = useState<ScheduledPlanItem | null>(null);
  const [editEstimateHours, setEditEstimateHours] = useState<number>(8);
  const [editAssignee, setEditAssignee] = useState<string>('');
  const [editSummary, setEditSummary] = useState<string>('');
  const [editStatus, setEditStatus] = useState<string>('Planejado');
  const [editIndustry, setEditIndustry] = useState<string>('');
  const [editCanal, setEditCanal] = useState<string>('');

  // Modo de visualização alternativo
  const [isClientView, setIsClientView] = useState(false);

  // Gantt Chart View state
  const [ganttScale, setGanttScale] = useState<'day' | 'week'>('day');
  const ganttContainerRef = useRef<HTMLDivElement>(null);

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
    } catch (err: any) {
      console.error(err);
      onShowToast(err.message || 'Erro ao carregar lista de projetos.', 'error');
    } finally {
      setIsLoadingProjects(false);
    }
  }, [selectedProjectKey, onShowToast]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

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
    } catch (err: any) {
      console.error(err);
      onShowToast(err.message || 'Erro ao carregar dados do plano.', 'error');
    } finally {
      setIsLoadingPlan(false);
    }
  }, [onShowToast]);

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

  // Create new project
  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanKey = newProjectKey.trim().toUpperCase();
    const cleanName = newProjectName.trim();
    if (!cleanKey || !cleanName) {
      onShowToast('Informe a chave/sigla e o nome do projeto.', 'error');
      return;
    }

    try {
      setIsCreatingProject(true);
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: cleanKey,
          name: cleanName,
          description: newProjectDesc.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Falha ao cadastrar projeto.');
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
      onShowToast(`Projeto "${created.name}" cadastrado com sucesso!`, 'success');
    } catch (err: any) {
      console.error(err);
      onShowToast(err.message || 'Erro ao cadastrar projeto.', 'error');
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
  };

  // Update project details
  const handleUpdateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProjectModal) return;
    try {
      setIsSavingProjectInfo(true);
      const res = await fetch(`/api/projects/${encodeURIComponent(editingProjectModal.key)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editProjectName.trim(),
          description: editProjectDesc.trim(),
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Falha ao atualizar projeto.');
      }

      const json = await res.json();
      const updated: ProjectRecord = json.project || json;
      setProjects((prev) => prev.map((p) => (p.key === updated.key ? updated : p)));
      setEditingProjectModal(null);
      onShowToast(`Projeto "${updated.name}" atualizado com sucesso!`, 'success');
    } catch (err: any) {
      console.error(err);
      onShowToast(err.message || 'Erro ao atualizar projeto.', 'error');
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
    if (isClientView) return;
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    if (isClientView) return;
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
    if (isClientView) return;
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
    setAssigneeInput(issue.assignee?.displayName || '');
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
      onShowToast('Informe quem irá executar a demanda.', 'error');
      return;
    }

    const newItem: PlanItemInput = {
      id: `plan_${addingIssue.key}_${Date.now()}`,
      issue_key: addingIssue.key,
      summary: addingIssue.summary,
      status: addingIssue.status,
      assignee_name: assigneeInput.trim(),
      estimate_hours: Number(estimateHoursInput),
      sort_order: localItems.length + 1, // Sempre no final da fila!
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
        isBlocked: addingIssue.isBlocked,
        blockedReason: addingIssue.blockedReason,
        rawStatus: addingIssue.rawStatus,
        displayStatus: addingIssue.displayStatus,
      },
    };

    const updatedList = [...localItems, newItem];
    applySchedule(updatedList);
    setAddingIssue(null);
    onShowToast(`Demanda ${addingIssue.key} incluída na última posição da fila do plano!`, 'success');
  };

  // Open modal to add manual task (Não Jira)
  const handleOpenAddManualModal = () => {
    const prefix = activeProject?.key || 'EXT';
    // Determina o próximo número de tarefa manual no plano
    let maxNum = 0;
    const regex = new RegExp(`^${prefix}[-_](?:EXT|AV|TASK)[-_]?(\\d+)`, 'i');
    localItems.forEach((it) => {
      const m = it.issue_key.match(regex);
      if (m && m[1]) {
        const n = parseInt(m[1], 10);
        if (!isNaN(n) && n > maxNum) maxNum = n;
      }
    });
    const nextNum = maxNum + 1;
    const suggestedKey = `${prefix}-EXT-${String(nextNum).padStart(2, '0')}`;

    setManualKey(suggestedKey);
    setManualSummary('');
    setManualAssignee(uniqueAssignees[0] || '');
    setManualEstimateHours(8);
    setManualStatus('Planejado');
    setManualIndustry('');
    setManualCanal('');
    setManualPosition('end');
    setIsAddManualModalOpen(true);
  };

  // Confirm addition of manual task
  const handleConfirmAddManual = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanKey = manualKey.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    if (!cleanKey) {
      onShowToast('Informe um código/chave válido para a tarefa.', 'error');
      return;
    }

    if (localItems.some((it) => it.issue_key.toUpperCase() === cleanKey)) {
      onShowToast(`Já existe uma demanda com a chave "${cleanKey}" no plano deste projeto.`, 'error');
      return;
    }

    if (!manualSummary.trim()) {
      onShowToast('Informe o resumo / título da demanda.', 'error');
      return;
    }

    if (!manualAssignee.trim()) {
      onShowToast('Informe quem irá executar a demanda.', 'error');
      return;
    }

    if (!manualEstimateHours || manualEstimateHours <= 0) {
      onShowToast('Informe uma estimativa de horas válida (maior que 0).', 'error');
      return;
    }

    const newItem: PlanItemInput = {
      id: `manual_${cleanKey.toLowerCase()}_${Date.now()}`,
      issue_key: cleanKey,
      summary: manualSummary.trim(),
      status: manualStatus.trim() || 'Planejado',
      assignee_name: manualAssignee.trim(),
      estimate_hours: Number(manualEstimateHours),
      sort_order: manualPosition === 'start' ? 1 : localItems.length + 1,
      metadata: {
        isManual: true,
        isExternal: true,
        source: 'manual',
        issuetype: 'Tarefa Avulsa',
        priority: 'Medium',
        industry: manualIndustry.trim() || null,
        canal: manualCanal.trim() || null,
        displayStatus: manualStatus.trim() || 'Planejado',
        rawStatus: manualStatus.trim() || 'Planejado',
        created: new Date().toISOString(),
      },
    };

    let updatedList: PlanItemInput[] = [];
    if (manualPosition === 'start') {
      updatedList = [newItem, ...localItems];
    } else {
      updatedList = [...localItems, newItem];
    }
    updatedList.forEach((it, idx) => {
      it.sort_order = idx + 1;
    });

    applySchedule(updatedList);
    setIsAddManualModalOpen(false);
    onShowToast(`Tarefa avulsa "${cleanKey}" incluída no plano com sucesso!`, 'success');
  };

  // Open modal to edit plan item
  const handleOpenEditModal = (item: ScheduledPlanItem) => {
    const baseItem = localItems.find((i) => i.id === item.id || i.issue_key === item.issue_key) || item;
    setEditingItem(baseItem);
    setEditEstimateHours(baseItem.estimate_hours);
    setEditAssignee(baseItem.assignee_name);
    setEditSummary(baseItem.summary);
    setEditStatus(baseItem.status || 'Planejado');
    setEditIndustry(baseItem.metadata?.industry || '');
    setEditCanal(baseItem.metadata?.canal || '');
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
      onShowToast('Informe quem irá executar a demanda.', 'error');
      return;
    }

    const isManual = Boolean(editingItem.metadata?.isManual || editingItem.metadata?.isExternal);
    if (isManual && !editSummary.trim()) {
      onShowToast('Informe o resumo / título da demanda.', 'error');
      return;
    }

    const updatedList = localItems.map((item) => {
      if (item.id === editingItem.id || item.issue_key === editingItem.issue_key) {
        const newMeta = { ...(item.metadata || {}) };
        if (isManual) {
          if (editIndustry.trim()) newMeta.industry = editIndustry.trim();
          else delete newMeta.industry;
          if (editCanal.trim()) newMeta.canal = editCanal.trim();
          else delete newMeta.canal;
          newMeta.displayStatus = editStatus.trim() || 'Planejado';
          newMeta.rawStatus = editStatus.trim() || 'Planejado';
        }
        return {
          ...item,
          summary: isManual ? editSummary.trim() : item.summary,
          status: isManual ? (editStatus.trim() || 'Planejado') : item.status,
          estimate_hours: Number(editEstimateHours),
          assignee_name: editAssignee.trim(),
          metadata: newMeta,
        };
      }
      return item;
    });

    applySchedule(updatedList);
    setEditingItem(null);
    onShowToast(`Demanda ${editingItem.issue_key} atualizada e cronograma recalculado!`, 'success');
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

  // Gantt Timeline Dates Calculation (Exclui sábados e domingos)
  const ganttTimelineDays = useMemo(() => {
    if (displayPlanItems.length === 0) return [];

    let minDateStr = settings.plan_start_date || displayPlanItems[0].start_date;
    let maxDateStr = displayPlanItems[0].end_date;

    for (const it of displayPlanItems) {
      if (it.start_date < minDateStr) minDateStr = it.start_date;
      if (it.end_date > maxDateStr) maxDateStr = it.end_date;
    }

    const startDate = parseISO(minDateStr);
    const maxEnd = parseISO(maxDateStr);

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

    // Adiciona 3 dias úteis de margem ao final para respirar
    let bufferCount = 0;
    while (bufferCount < 3) {
      const dayOfWeek = curr.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        days.push(curr);
        bufferCount++;
      }
      curr = addDays(curr, 1);
    }

    return days;
  }, [displayPlanItems, settings.plan_start_date]);

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

  const handleExportJpg = async () => {
    if (!ganttContainerRef.current) return;
    try {
      setIsExporting('jpg');
      const isDark = resolvedTheme === 'dark';
      const bgColor = isDark ? '#0c1222' : '#ffffff';

      const dataUrl = await toJpeg(ganttContainerRef.current, {
        quality: 0.95,
        pixelRatio: 2,
        backgroundColor: bgColor,
        filter: (node) => {
          if (node instanceof HTMLElement && node.getAttribute('data-export-ignore') === 'true') {
            return false;
          }
          return true;
        },
      });

      const projCleanName = (activeProject?.name || selectedProjectKey).toLowerCase().replace(/\s+/g, '-');
      const link = document.createElement('a');
      link.download = `cronograma-gantt-${projCleanName}_${format(new Date(), 'yyyy-MM-dd')}.jpg`;
      link.href = dataUrl;
      link.click();
      onShowToast('Imagem JPG do Gantt exportada com sucesso!', 'success');
    } catch (err) {
      console.error(err);
      onShowToast('Falha ao exportar imagem do Gantt.', 'error');
    } finally {
      setIsExporting(null);
    }
  };

  const handleExportPdf = async () => {
    let restoredTab: 'gantt' | 'backlog' | 'settings' | null = null;
    const wasDark = document.documentElement.classList.contains('dark');
    try {
      setIsExporting('pdf');

      // Se não estiver na aba do Gantt, alterna temporariamente para montar o container no DOM
      if (activeTab !== 'gantt') {
        restoredTab = activeTab;
        setActiveTab('gantt');
        await new Promise((r) => setTimeout(r, 200));
      }

      // O Gantt no PDF deve ser sempre exportado no modo claro: desativa temporariamente o tema escuro
      if (wasDark) {
        document.documentElement.classList.remove('dark');
        await new Promise((r) => setTimeout(r, 120));
      }

      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4',
      });

      const todayStr = format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });

      // Title & Header
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(30, 41, 59);
      doc.text(`Plano de Projeto & Cronograma · ${activeProject?.name || selectedProjectKey}`, 14, 16);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text(`Gerado em: ${todayStr}`, 14, 22);

      // KPI Summary Box
      doc.setFillColor(241, 245, 249);
      doc.roundedRect(14, 26, 269, 14, 2, 2, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(51, 65, 85);
      doc.text(`Total de Demandas: ${displayPlanItems.length}`, 20, 35);
      if (!isClientView) {
        doc.text(`Total de Horas: ${totalPlannedHours}h`, 80, 35);
        doc.text(`Executores Ativos: ${uniqueAssignees.length}`, 140, 35);
        doc.text(
          `Previsão de Término: ${
            projectedEndDate ? format(parseISO(projectedEndDate), 'dd/MM/yyyy') : 'N/A'
          }`,
          205,
          35
        );
      } else {
        doc.text(
          `Previsão de Término: ${
            projectedEndDate ? format(parseISO(projectedEndDate), 'dd/MM/yyyy') : 'N/A'
          }`,
          100,
          35
        );
      }

      // Table Header renderer
      let y = 46;
      const renderPdfHeader = (curY: number) => {
        doc.setFillColor(79, 70, 229);
        doc.rect(14, curY, 269, 8, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(255, 255, 255);
        doc.text('#', 16, curY + 5.5);
        if (isClientView) {
          doc.text('Chave', 24, curY + 5.5);
          doc.text('Resumo da Demanda', 48, curY + 5.5);
          doc.text('Indústria', 162, curY + 5.5);
          doc.text('Canal de Distribuição', 209, curY + 5.5);
          doc.text('Entrega', 258, curY + 5.5);
        } else {
          doc.text('Chave', 25, curY + 5.5);
          doc.text('Resumo da Demanda', 50, curY + 5.5);
          doc.text('Responsável', 160, curY + 5.5);
          doc.text('Estimativa', 205, curY + 5.5);
          doc.text('Início', 225, curY + 5.5);
          doc.text('Fim', 245, curY + 5.5);
          doc.text('Dias Úteis', 265, curY + 5.5);
        }
      };

      renderPdfHeader(y);
      y += 8;

      // Table Rows
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(30, 41, 59);

      displayPlanItems.forEach((item, idx) => {
        if (y > 185) {
          doc.addPage('a4', 'landscape');
          y = 15;
          renderPdfHeader(y);
          y += 8;
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(30, 41, 59);
        }

        // Zebra striping
        if (idx % 2 === 0) {
          doc.setFillColor(248, 250, 252);
          doc.rect(14, y, 269, 7, 'F');
        }

        doc.text(String(idx + 1), 16, y + 4.8);
        if (isClientView) {
          const truncatedSummary =
            item.summary.length > 68 ? item.summary.substring(0, 66) + '...' : item.summary;
          const cleanText = (str: string | null | undefined) =>
            (str || '').replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').trim() || '-';
          const ind = cleanText(item.metadata?.industry);
          const truncatedIndustry = ind.length > 25 ? ind.substring(0, 23) + '...' : ind;
          const canal = cleanText(item.metadata?.canal);
          const truncatedCanal = canal.length > 25 ? canal.substring(0, 23) + '...' : canal;

          doc.text(item.issue_key, 24, y + 4.8);
          doc.text(truncatedSummary, 48, y + 4.8);
          doc.text(truncatedIndustry, 162, y + 4.8);
          doc.text(truncatedCanal, 209, y + 4.8);
          doc.text(format(parseISO(item.end_date), 'dd/MM/yyyy'), 258, y + 4.8);
        } else {
          doc.text(item.issue_key, 25, y + 4.8);
          const truncatedSummary =
            item.summary.length > 60 ? item.summary.substring(0, 58) + '...' : item.summary;
          doc.text(truncatedSummary, 50, y + 4.8);
          doc.text(item.assignee_name, 160, y + 4.8);
          doc.text(`${item.estimate_hours}h`, 205, y + 4.8);
          doc.text(format(parseISO(item.start_date), 'dd/MM/yyyy'), 225, y + 4.8);
          doc.text(format(parseISO(item.end_date), 'dd/MM/yyyy'), 245, y + 4.8);
          doc.text(`${item.working_days} d`, 265, y + 4.8);
        }

        y += 7;
      });

      // Captura e inclusão do cronograma Gantt abaixo da lista de demandas
      if (ganttContainerRef.current) {
        try {
          const bgColor = '#ffffff';

          const scrollEl = ganttContainerRef.current.querySelector('.overflow-x-auto') as HTMLElement | null;
          const innerContent = scrollEl?.firstElementChild as HTMLElement | null;
          const fullContentWidth = innerContent ? innerContent.scrollWidth : 0;
          const targetWidth = Math.max(
            ganttContainerRef.current.offsetWidth || 1000,
            fullContentWidth + 48
          );

          const ganttDataUrl = await toJpeg(ganttContainerRef.current, {
            quality: 0.95,
            pixelRatio: 2,
            backgroundColor: bgColor,
            width: targetWidth,
            style: {
              width: `${targetWidth}px`,
              maxWidth: 'none',
            },
            filter: (node) => {
              if (node instanceof HTMLElement) {
                if (node.getAttribute('data-export-ignore') === 'true') {
                  return false;
                }
                if (node.getAttribute('data-gantt-header') === 'true') {
                  return false;
                }
              }
              return true;
            },
          });

          // Obter dimensões reais da imagem gerada
          const img = new window.Image();
          img.src = ganttDataUrl;
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = (e) => reject(e);
          });

          const imgWidth = img.naturalWidth || img.width || 1200;
          const imgHeight = img.naturalHeight || img.height || 400;
          const aspectRatio = imgHeight / imgWidth;

          // Espaço utilizável na página A4 Paisagem (297 x 210 mm)
          // Margens padrão: x = 14 a 283 (largura utilizável = 269 mm), y máx = 196 mm
          const pageWidth = 269;
          const maxPageHeight = 182; // 196 - 14

          let pdfGanttWidth = pageWidth;
          let pdfGanttHeight = pdfGanttWidth * aspectRatio;

          const remainingHeightOnPage = 196 - (y + 8);

          // Se couber na mesma página abaixo da lista (com folga e altura mínima de 40mm)
          if (pdfGanttHeight <= remainingHeightOnPage && remainingHeightOnPage >= 40) {
            const ganttY = y + 8;
            doc.addImage(ganttDataUrl, 'JPEG', 14, ganttY, pdfGanttWidth, pdfGanttHeight);
          } else {
            // Caso contrário, adiciona uma nova página dedicada ao Gantt
            doc.addPage('a4', 'landscape');
            if (pdfGanttHeight > maxPageHeight) {
              pdfGanttHeight = maxPageHeight;
              pdfGanttWidth = pdfGanttHeight / aspectRatio;
            }
            const ganttX = 14 + (pageWidth - pdfGanttWidth) / 2;
            doc.addImage(ganttDataUrl, 'JPEG', ganttX, 14, pdfGanttWidth, pdfGanttHeight);
          }
        } catch (ganttErr) {
          console.error('[PDF Export] Erro ao renderizar Gantt no PDF:', ganttErr);
        }
      }

      const projCleanName = (activeProject?.name || selectedProjectKey).toLowerCase().replace(/\s+/g, '-');
      doc.save(`relatorio-plano-${projCleanName}_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
      onShowToast('Relatório PDF exportado com sucesso!', 'success');
    } catch (err) {
      console.error(err);
      onShowToast('Falha ao exportar PDF do plano.', 'error');
    } finally {
      if (wasDark) {
        document.documentElement.classList.add('dark');
      }
      if (restoredTab !== null) {
        setActiveTab(restoredTab);
      }
      setIsExporting(null);
    }
  };

  const handleExportExcel = () => {
    try {
      setIsExporting('excel');
      const rows = displayPlanItems.map((item, idx) => {
        const isManual = Boolean(item.metadata?.isManual || item.metadata?.isExternal);
        const row: any = {
          Ordem: idx + 1,
          'Chave / Código': item.issue_key,
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
                    title="Alternar entre projetos cadastrados"
                  >
                    <Briefcase className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                    <div className="flex items-center gap-1.5">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20">
                        {activeProject?.key || selectedProjectKey}
                      </span>
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
                      <div className="absolute left-0 top-full mt-2 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl z-40 p-2 space-y-1 animate-in fade-in zoom-in-95 duration-150">
                        <div className="px-2.5 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          Selecione o Projeto Ativo
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
                                <div className="flex items-center gap-2 truncate">
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                                    {p.key}
                                  </span>
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
                              setIsNewProjectModalOpen(true);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors"
                          >
                            <FolderPlus className="w-4 h-4" />
                            <span>+ Cadastrar Novo Projeto</span>
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
                  title="Editar dados deste projeto ou excluí-lo"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>

                {/* New Project Quick Button */}
                <button
                  type="button"
                  onClick={() => setIsNewProjectModalOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 text-xs font-bold border border-indigo-200 dark:border-indigo-500/30 transition-all shadow-sm active:scale-95"
                  title="Cadastrar um novo projeto no módulo"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Novo Projeto</span>
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
                  <span className="text-xs font-black text-slate-800 dark:text-white">{totalPlannedHours}h</span>
                </div>
              </div>
            )}

            <div className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-500" />
              <div>
                <span className="block text-[10px] text-slate-400 font-bold uppercase">Demandas</span>
                <span className="text-xs font-black text-slate-800 dark:text-white">{localItems.length}</span>
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

            <button
              onClick={handleExportJpg}
              disabled={isExporting !== null || localItems.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold border border-slate-300 dark:border-slate-700 transition-all shadow-sm active:scale-95 disabled:opacity-50"
              title="Exportar gráfico de Gantt como imagem JPG em alta resolução"
            >
              {isExporting === 'jpg' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500" />
              ) : (
                <Image className="w-3.5 h-3.5 text-indigo-500" />
              )}
              <span>JPG</span>
            </button>

            <button
              onClick={handleExportPdf}
              disabled={isExporting !== null || localItems.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold border border-slate-300 dark:border-slate-700 transition-all shadow-sm active:scale-95 disabled:opacity-50"
              title="Exportar plano detalhado e relatório em PDF"
            >
              {isExporting === 'pdf' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-500" />
              ) : (
                <FileText className="w-3.5 h-3.5 text-rose-500" />
              )}
              <span>PDF</span>
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
                    {displayPlanItems.map((item, idx) => {
                      const color = assigneeColorMap.get(item.assignee_name.trim()) || ASSIGNEE_COLORS[0];
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
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-mono font-bold text-slate-400">
                                  #{idx + 1}
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
                              className={`absolute top-1 bottom-1 rounded-md shadow-sm transition-all flex items-center px-2 min-w-[28px] overflow-hidden ${color.bg} text-white group-hover:brightness-110 cursor-pointer`}
                              title={
                                isClientView
                                  ? `${item.issue_key}: ${item.summary}\nInício: ${format(startDate, 'dd/MM/yyyy')}\nEntrega: ${format(endDate, 'dd/MM/yyyy')}\nDias Úteis: ${item.working_days}`
                                  : `${item.issue_key}: ${item.summary}\nResponsável: ${item.assignee_name}\nEstimativa: ${item.estimate_hours}h\nInício: ${format(startDate, 'dd/MM/yyyy')}\nFim: ${format(endDate, 'dd/MM/yyyy')}\nDias Úteis: ${item.working_days}\n(Clique para editar)`
                              }
                            >
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
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-sm font-black text-slate-800 dark:text-white flex items-center gap-2">
                  <Layers className="w-4 h-4 text-emerald-500" />
                  <span>Fila de Execução das Demandas</span>
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Arraste as demandas ou use as flechas para reordenar a fila e recalcular o cronograma automaticamente.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500 font-semibold">
                  {localItems.length} {localItems.length === 1 ? 'demanda no plano' : 'demandas no plano'}
                </span>
                {!isClientView && (
                  <button
                    type="button"
                    onClick={handleOpenAddManualModal}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-sm shadow-emerald-600/30 transition-all active:scale-95"
                    title="Adicionar tarefa avulsa que não está no Jira diretamente ao cronograma"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Tarefa Avulsa (Não Jira)</span>
                  </button>
                )}
              </div>
            </div>

            {localItems.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">Nenhuma demanda na fila de execução.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      <th className="py-2.5 px-3">Ordem</th>
                      <th className="py-2.5 px-3">Chave</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Resumo da Demanda</th>
                      <th className="py-2.5 px-3">Detalhes</th>
                      {!isClientView && <th className="py-2.5 px-3">Executor</th>}
                      {!isClientView && <th className="py-2.5 px-3">Estimativa</th>}
                      <th className="py-2.5 px-3">Início Calculado</th>
                      <th className="py-2.5 px-3">{isClientView ? 'Entrega Prevista' : 'Fim Calculado'}</th>
                      <th className="py-2.5 px-3">Prazo Jira</th>
                      <th className="py-2.5 px-3">Dias Úteis</th>
                      <th className="py-2.5 px-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {displayPlanItems.map((item, idx) => {
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

                      return (
                        <tr
                          key={item.id}
                          draggable={!isClientView}
                          onDragStart={(e) => handleDragStart(e, idx)}
                          onDragOver={(e) => handleDragOver(e, idx)}
                          onDragEnd={handleDragEnd}
                          onDrop={(e) => handleDrop(e, idx)}
                          className={`transition-all group ${
                            !isClientView ? 'cursor-grab active:cursor-grabbing' : ''
                          } ${
                            isBlocked ? 'bg-red-50/40 dark:bg-red-950/20' : ''
                          } ${
                            draggedIndex === idx
                              ? 'opacity-35 bg-indigo-50/60 dark:bg-indigo-950/60 scale-[0.99] border-dashed border-2 border-indigo-400'
                              : dragOverIndex === idx
                              ? 'bg-indigo-50/80 dark:bg-indigo-950/70 border-t-2 border-indigo-600 dark:border-indigo-400 shadow-sm'
                              : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/40'
                          }`}
                        >
                          <td className="py-3 px-3 font-mono font-bold text-slate-500 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              {!isClientView && (
                                <span
                                  className="text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 p-0.5 rounded transition-colors"
                                  title="Clique e arraste para reordenar"
                                >
                                  <GripVertical className="w-3.5 h-3.5" />
                                </span>
                              )}
                              <span>#{idx + 1}</span>
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
                              {isBlocked && (
                                <span
                                  className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-300 text-[9px] font-bold flex-shrink-0"
                                  title={`Bloqueado: ${item.metadata?.blockedReason || 'Impedimento'}`}
                                >
                                  <AlertOctagon className="w-2.5 h-2.5 text-red-500" />
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusStyle}`}
                            >
                              {displayStatus}
                            </span>
                          </td>
                          <td className="py-3 px-3 max-w-xs font-medium text-slate-800 dark:text-slate-200 truncate" title={item.summary}>
                            {item.summary}
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex flex-wrap items-center gap-1 max-w-[200px]">
                              {item.metadata?.epic && (
                                <span
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-500/30 text-[9px] font-medium truncate max-w-[120px]"
                                  title={`Épico: ${item.metadata.epic.summary || item.metadata.epic.key}`}
                                >
                                  <Layers className="w-2.5 h-2.5 flex-shrink-0 text-purple-500" />
                                  <span className="truncate">{item.metadata.epic.summary || item.metadata.epic.key}</span>
                                </span>
                              )}
                              {item.metadata?.industry && (
                                <span
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-500/30 text-[9px] font-medium truncate max-w-[100px]"
                                  title={`Indústria: ${item.metadata.industry}`}
                                >
                                  <Building2 className="w-2.5 h-2.5 flex-shrink-0 text-teal-500" />
                                  <span className="truncate">{item.metadata.industry}</span>
                                </span>
                              )}
                              {item.metadata?.layout && (
                                <span
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30 text-[9px] font-medium truncate max-w-[100px]"
                                  title={`Layout: ${item.metadata.layout}`}
                                >
                                  <LayoutTemplate className="w-2.5 h-2.5 flex-shrink-0 text-amber-500" />
                                  <span className="truncate">{item.metadata.layout}</span>
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
                              {!item.metadata?.epic && !item.metadata?.industry && !item.metadata?.layout && !item.metadata?.canal && (
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
                              <span
                                className={`text-xs ${
                                  oldStartDate
                                    ? 'font-bold text-slate-800 dark:text-slate-100'
                                    : 'text-slate-600 dark:text-slate-400'
                                }`}
                              >
                                {format(parseISO(item.start_date), 'dd/MM/yyyy')}
                              </span>
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
                              {item.working_days} {item.working_days === 1 ? 'dia' : 'dias'}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {!isClientView && (
                                <button
                                  type="button"
                                  onMouseDown={(e) => e.stopPropagation()}
                                  onClick={() => handleOpenEditModal(item)}
                                  className="p-1 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all mr-1"
                                  title="Editar estimativa de horas e executor"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button
                                type="button"
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={() => handleMoveUp(idx)}
                                disabled={idx === 0}
                                className="p-1 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none transition-all"
                                title="Mover para cima na fila"
                              >
                                <ArrowUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={() => handleMoveDown(idx)}
                                disabled={idx === localItems.length - 1}
                                className="p-1 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none transition-all"
                                title="Mover para baixo na fila"
                              >
                                <ArrowDown className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={() => handleRemoveFromPlan(item)}
                                className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-all ml-1"
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

      {/* Autocomplete Datalist for Assignees (shared across modals) */}
      <datalist id="available-assignees-list">
        {backlogData?.availableAssignees.map((name) => (
          <option key={`backlog-${name}`} value={name} />
        ))}
        {uniqueAssignees.map((name) => (
          <option key={`unique-${name}`} value={name} />
        ))}
      </datalist>

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
                  <Users className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={assigneeInput}
                    onChange={(e) => setAssigneeInput(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    placeholder="Nome da pessoa responsável"
                    list="available-assignees-list"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Executores diferentes trabalham em paralelo; o mesmo executor trabalha em sequência.
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
      {/* MODAL: ADD MANUAL TASK (Tarefa fora do Jira)             */}
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
                  Adicionar Tarefa Avulsa (Não Jira)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Inclua reuniões, alinhamentos, homologações ou tarefas internas no cronograma.
                </p>
              </div>
            </div>

            <form onSubmit={handleConfirmAddManual} className="space-y-4">
              {/* Código / Chave e Status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Código / Chave <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={manualKey}
                    onChange={(e) => setManualKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))}
                    placeholder="Ex: NEO-EXT-01"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Identificador único no plano.</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Status Inicial
                  </label>
                  <select
                    value={manualStatus}
                    onChange={(e) => setManualStatus(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  >
                    <option value="Planejado">Planejado</option>
                    <option value="A Fazer">A Fazer</option>
                    <option value="Em Andamento">Em Andamento</option>
                    <option value="Pendente">Pendente</option>
                  </select>
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
                    <Users className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      value={manualAssignee}
                      onChange={(e) => setManualAssignee(e.target.value)}
                      placeholder="Nome do responsável"
                      list="available-assignees-list"
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                    />
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

              {/* Posição na Fila */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Posição na Fila de Execução
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setManualPosition('end')}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all text-center ${
                      manualPosition === 'end'
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 shadow-sm'
                        : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Final da Fila (Padrão)
                  </button>
                  <button
                    type="button"
                    onClick={() => setManualPosition('start')}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all text-center ${
                      manualPosition === 'start'
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 shadow-sm'
                        : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Início da Fila (Prioridade)
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddManualModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/30 transition-all active:scale-95"
                >
                  <Plus className="w-4 h-4" />
                  <span>Adicionar ao Plano</span>
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
                  <Users className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={editAssignee}
                    onChange={(e) => setEditAssignee(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    placeholder="Nome da pessoa responsável"
                    list="available-assignees-list"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Ao trocar de responsável ou alterar as horas, o cronograma é recalculado automaticamente.
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
      {/* MODAL: CREATE NEW PROJECT                                */}
      {/* -------------------------------------------------------- */}
      {isNewProjectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#0e1424] border border-slate-200 dark:border-indigo-900/60 rounded-2xl w-full max-w-md p-6 shadow-2xl relative text-slate-800 dark:text-slate-200">
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
                  Cadastrar Novo Projeto
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Crie um contexto exclusivo para plano, backlog e metas.
                </p>
              </div>
            </div>

            <form onSubmit={handleCreateProject} className="space-y-4">
              {/* Sigla / Chave do Projeto */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Chave / Sigla Jira <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  maxLength={10}
                  value={newProjectKey}
                  onChange={(e) => setNewProjectKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))}
                  placeholder="Ex: NEO, PORTAL, CRM"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-mono font-bold uppercase focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Chave do projeto no Jira (ex: NEO). O backlog buscará as demandas via JQL desse projeto.
                </p>
              </div>

              {/* Nome do Projeto */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Nome do Projeto <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="Ex: Neogrid, Portal do Cliente"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
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
                  placeholder="Breve descrição do escopo ou equipe..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
              </div>

              <div className="p-3 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/50 text-[11px] text-indigo-700 dark:text-indigo-300 space-y-1">
                <span className="font-bold block">✨ Contexto Isolado:</span>
                <span>Ao cadastrar o projeto, seu plano Gantt, backlog e parâmetros de jornada serão independentes. Apenas os feriados nacionais serão globais.</span>
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
                  <span>Cadastrar Projeto</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------- */}
      {/* MODAL: EDIT / MANAGE PROJECT                             */}
      {/* -------------------------------------------------------- */}
      {editingProjectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#0e1424] border border-slate-200 dark:border-indigo-900/60 rounded-2xl w-full max-w-md p-6 shadow-2xl relative text-slate-800 dark:text-slate-200">
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
                  Editar Projeto · {editingProjectModal.key}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Atualize o nome e descrição ou remova o projeto.
                </p>
              </div>
            </div>

            <form onSubmit={handleUpdateProject} className="space-y-4">
              {/* Sigla / Chave do Projeto (fixa) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Chave Jira
                </label>
                <div className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-mono font-bold text-slate-500">
                  {editingProjectModal.key}
                </div>
              </div>

              {/* Nome do Projeto */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Nome do Projeto <span className="text-rose-500">*</span>
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
                  title={projects.length <= 1 ? 'Não é possível excluir o único projeto restante' : 'Excluir projeto e seus itens'}
                >
                  {isDeletingProject ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  <span>Excluir Projeto</span>
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
    </div>
  );
};

// -------------------------------------------------------------
// SETTINGS PANEL COMPONENT
// -------------------------------------------------------------

interface ProjectSettingsPanelProps {
  settings: ProjectSettings;
  activeProject: ProjectRecord | null;
  onSaveSettings: (settings: ProjectSettings) => Promise<void>;
  onResetHolidays: () => Promise<void>;
}

const ProjectSettingsPanel: React.FC<ProjectSettingsPanelProps> = ({
  settings,
  activeProject,
  onSaveSettings,
  onResetHolidays,
}) => {
  const [formData, setFormData] = useState<ProjectSettings>(settings);
  const [newDeliveredUser, setNewDeliveredUser] = useState('');
  const [newIssueType, setNewIssueType] = useState('');
  const [newHolidayDate, setNewHolidayDate] = useState('');
  const [newHolidayName, setNewHolidayName] = useState('');
  const [holidaySearch, setHolidaySearch] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setFormData(settings);
  }, [settings]);

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
            As configurações abaixo (exceto feriados) pertencem exclusivamente a este projeto.
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

      {/* 3. Gestão de Feriados e Dias Não Trabalhados */}
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
              Esta é a única configuração compartilhada da plataforma. As datas cadastradas aqui afetam o cronograma de todos os projetos cadastrados.
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
