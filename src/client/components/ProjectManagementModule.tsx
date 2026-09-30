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

  // Modal: Add Demand to Plan
  const [addingIssue, setAddingIssue] = useState<ProjectBacklogIssue | null>(null);
  const [estimateHoursInput, setEstimateHoursInput] = useState<number>(8);
  const [assigneeInput, setAssigneeInput] = useState<string>('');

  // Modal: Edit Demand in Plan
  const [editingItem, setEditingItem] = useState<ScheduledPlanItem | null>(null);
  const [editEstimateHours, setEditEstimateHours] = useState<number>(8);
  const [editAssignee, setEditAssignee] = useState<string>('');

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

  // 1. Fetch initial settings and plan
  const loadPlanAndSettings = useCallback(async () => {
    try {
      setIsLoadingPlan(true);
      const res = await fetch('/api/projects/neo/plan');
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
    loadPlanAndSettings();
  }, [loadPlanAndSettings]);

  // 2. Fetch Backlog from Jira
  const loadBacklog = useCallback(async () => {
    try {
      setIsLoadingBacklog(true);
      const res = await fetch('/api/projects/neo/backlog');
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
    if (activeTab === 'backlog' && !backlogData && !isLoadingBacklog) {
      loadBacklog();
    }
  }, [activeTab, backlogData, isLoadingBacklog, loadBacklog]);

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

  // Open modal to edit plan item
  const handleOpenEditModal = (item: ScheduledPlanItem) => {
    const baseItem = localItems.find((i) => i.id === item.id || i.issue_key === item.issue_key) || item;
    setEditingItem(baseItem);
    setEditEstimateHours(baseItem.estimate_hours);
    setEditAssignee(baseItem.assignee_name);
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

    const updatedList = localItems.map((item) => {
      if (item.id === editingItem.id || item.issue_key === editingItem.issue_key) {
        return {
          ...item,
          estimate_hours: Number(editEstimateHours),
          assignee_name: editAssignee.trim(),
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
      project: meta.project || { key: 'NEO', name: 'Neogrid' },
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
  }, [editingItem, editAssignee]);

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

      const res = await fetch('/api/projects/neo/plan', {
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
      loadBacklog();
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

  // Gantt Timeline Dates Calculation
  const ganttTimelineDays = useMemo(() => {
    if (displayPlanItems.length === 0) return [];

    let minDateStr = settings.plan_start_date || displayPlanItems[0].start_date;
    let maxDateStr = displayPlanItems[0].end_date;

    for (const it of displayPlanItems) {
      if (it.start_date < minDateStr) minDateStr = it.start_date;
      if (it.end_date > maxDateStr) maxDateStr = it.end_date;
    }

    const startDate = parseISO(minDateStr);
    const endDate = addDays(parseISO(maxDateStr), 5); // buffer de 5 dias
    const totalDays = differenceInCalendarDays(endDate, startDate) + 1;

    const days: Date[] = [];
    for (let i = 0; i < totalDays; i++) {
      days.push(addDays(startDate, i));
    }
    return days;
  }, [displayPlanItems, settings.plan_start_date]);

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

      const link = document.createElement('a');
      link.download = `cronograma-gantt-neogrid_${format(new Date(), 'yyyy-MM-dd')}.jpg`;
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
    try {
      setIsExporting('pdf');
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
      doc.text('Plano de Projeto & Cronograma', 14, 16);

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
        doc.text('Chave', 25, curY + 5.5);
        if (isClientView) {
          doc.text('Resumo da Demanda', 50, curY + 5.5);
          doc.text('Início', 205, curY + 5.5);
          doc.text('Entrega', 230, curY + 5.5);
          doc.text('Dias Úteis', 255, curY + 5.5);
        } else {
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
        doc.text(item.issue_key, 25, y + 4.8);
        if (isClientView) {
          const truncatedSummary =
            item.summary.length > 95 ? item.summary.substring(0, 93) + '...' : item.summary;
          doc.text(truncatedSummary, 50, y + 4.8);
          doc.text(format(parseISO(item.start_date), 'dd/MM/yyyy'), 205, y + 4.8);
          doc.text(format(parseISO(item.end_date), 'dd/MM/yyyy'), 230, y + 4.8);
          doc.text(`${item.working_days} d`, 255, y + 4.8);
        } else {
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

      doc.save(`relatorio-plano-neogrid_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
      onShowToast('Relatório PDF exportado com sucesso!', 'success');
    } catch (err) {
      console.error(err);
      onShowToast('Falha ao exportar PDF do plano.', 'error');
    } finally {
      setIsExporting(null);
    }
  };

  const handleExportExcel = () => {
    try {
      setIsExporting('excel');
      const rows = displayPlanItems.map((item, idx) => {
        const row: any = {
          Ordem: idx + 1,
          'Chave Jira': item.issue_key,
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
        row['Link Jira'] = item.metadata?.url || `https://sysmiddle.atlassian.net/browse/${item.issue_key}`;
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

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Plano Neogrid');

      XLSX.writeFile(workbook, `cronograma-plano-neogrid_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
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
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black text-slate-800 dark:text-white tracking-tight">
                  Gestão de Projetos · Neogrid
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30">
                  PROJETO NEO
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Capacidade produtiva, fila sequencial/paralela e cronograma Gantt com recálculo automático.
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
              <span>Backlog Neogrid</span>
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
            <div className="flex items-center justify-between gap-3 mb-4">
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
                  Acesse a aba <strong>Backlog Neogrid</strong> para selecionar atividades e definir a estimativa de horas e responsável.
                </p>
                <button
                  onClick={() => setActiveTab('backlog')}
                  className="mt-4 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-md shadow-indigo-600/20"
                >
                  Ver Backlog Neogrid
                </button>
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
                        const isWknd = !isWorkingDay(day, holidaySet);
                        const isTod = isToday(day);
                        const isFirstOfMonth = day.getDate() === 1 || idx === 0;

                        return (
                          <div
                            key={dayStr}
                            className={`flex-1 min-w-[32px] text-center border-l border-slate-100 dark:border-slate-800/60 ${
                              isWknd ? 'bg-slate-100/60 dark:bg-slate-950/40 text-slate-400' : ''
                            } ${isTod ? 'bg-indigo-500/10 dark:bg-indigo-500/20 font-bold' : ''}`}
                          >
                            <span className="block text-[9px] uppercase text-slate-400 dark:text-slate-500">
                              {format(day, 'EEE', { locale: ptBR }).substring(0, 3)}
                            </span>
                            <span
                              className={`block text-[11px] font-bold ${
                                isTod
                                  ? 'text-indigo-600 dark:text-indigo-400'
                                  : isWknd
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

                      // Calculate column offsets
                      const timelineStart = ganttTimelineDays[0];
                      const startOffset = Math.max(0, differenceInCalendarDays(startDate, timelineStart));
                      const durationDays = Math.max(1, differenceInCalendarDays(endDate, startDate) + 1);
                      const totalTimelineDays = ganttTimelineDays.length;

                      const leftPercent = (startOffset / totalTimelineDays) * 100;
                      const widthPercent = (durationDays / totalTimelineDays) * 100;

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
                                <a
                                  href={item.metadata?.url || `https://sysmiddle.atlassian.net/browse/${item.issue_key}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs font-black text-indigo-600 dark:text-indigo-400 hover:underline truncate"
                                >
                                  {item.issue_key}
                                </a>
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
                            {/* Weekend stripe background */}
                            <div className="absolute inset-0 flex pointer-events-none">
                              {ganttTimelineDays.map((d, i) => {
                                const isWk = !isWorkingDay(d, holidaySet);
                                const isTod = isToday(d);
                                return (
                                  <div
                                    key={i}
                                    className={`flex-1 border-r border-slate-100/60 dark:border-slate-800/40 ${
                                      isWk ? 'bg-slate-200/40 dark:bg-slate-950/50' : ''
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
                  Reordene as atividades para recalcular automaticamente as datas de início e fim da equipe.
                </p>
              </div>

              <span className="text-xs text-slate-500 font-semibold">
                {localItems.length} {localItems.length === 1 ? 'demanda no plano' : 'demandas no plano'}
              </span>
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
                          className={`hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors group ${
                            isBlocked ? 'bg-red-50/40 dark:bg-red-950/20' : ''
                          }`}
                        >
                          <td className="py-3 px-3 font-mono font-bold text-slate-500">
                            #{idx + 1}
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <a
                                href={item.metadata?.url || `https://sysmiddle.atlassian.net/browse/${item.issue_key}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`font-black hover:underline flex items-center gap-1 ${
                                  isBlocked
                                    ? 'text-red-600 dark:text-red-400'
                                    : 'text-indigo-600 dark:text-indigo-400'
                                }`}
                              >
                                <span>{item.issue_key}</span>
                                <ExternalLink className="w-3 h-3 opacity-60 group-hover:opacity-100 flex-shrink-0" />
                              </a>
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
                                  onClick={() => handleOpenEditModal(item)}
                                  className="p-1 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all mr-1"
                                  title="Editar estimativa de horas e executor"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleMoveUp(idx)}
                                disabled={idx === 0}
                                className="p-1 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none transition-all"
                                title="Mover para cima na fila"
                              >
                                <ArrowUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleMoveDown(idx)}
                                disabled={idx === localItems.length - 1}
                                className="p-1 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none transition-all"
                                title="Mover para baixo na fila"
                              >
                                <ArrowDown className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
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
                <span>Tipos: Ativação & Tarefa (sem Épicos)</span>
              </span>
            </div>

            <div className="flex items-center gap-2">
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
                onClick={loadBacklog}
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
              <p className="text-xs text-slate-400 font-semibold">Carregando backlog do Jira (Projeto NEO)...</p>
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
                Todas as atividades do projeto Neogrid estão com usuário de entrega ou já foram incluídas no plano.
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
          onSaveSettings={async (updated) => {
            try {
              const res = await fetch('/api/projects/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updated),
              });
              if (!res.ok) throw new Error('Falha ao salvar configurações.');
              const saved = await res.json();
              setSettings(saved);
              // Recalcula o plano local também
              applySchedule(localItems);
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
      {/* MODAL: EDIT DEMAND IN PLAN (Editar Horas + Executor)     */}
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
                  Altere a estimativa de horas ou o executor da demanda no plano.
                </p>
              </div>
            </div>

            {/* Target Issue Details Card */}
            {editingDemand && (
              <div className="mb-5">
                <JiraCard demand={editingDemand} showDueDateBadge={true} />
              </div>
            )}

            <form onSubmit={handleConfirmEdit} className="space-y-4">
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
    </div>
  );
};

// -------------------------------------------------------------
// SETTINGS PANEL COMPONENT
// -------------------------------------------------------------

interface ProjectSettingsPanelProps {
  settings: ProjectSettings;
  onSaveSettings: (settings: ProjectSettings) => Promise<void>;
  onResetHolidays: () => Promise<void>;
}

const ProjectSettingsPanel: React.FC<ProjectSettingsPanelProps> = ({
  settings,
  onSaveSettings,
  onResetHolidays,
}) => {
  const [formData, setFormData] = useState<ProjectSettings>(settings);
  const [newDeliveredUser, setNewDeliveredUser] = useState('');
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
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
        <div>
          <h2 className="text-base font-black text-slate-800 dark:text-white flex items-center gap-2">
            <SettingsIcon className="w-5 h-5 text-indigo-500" />
            <span>Configurações do Módulo de Gestão de Projetos</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Critérios de conclusão, parâmetros de jornada diária e calendário de feriados.
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-600/30 transition-all active:scale-95 disabled:opacity-50"
        >
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          <span>Salvar Configurações</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 1. Usuários de Atividade Concluída */}
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 space-y-3">
          <div>
            <h3 className="text-xs font-bold text-slate-800 dark:text-white">
              Usuários de Conclusão / Entrega
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Demandas atribuídas a esses usuários são consideradas entregues e saem do backlog.
            </p>
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
              placeholder="Adicionar nome de usuário (ex: Neogrid)..."
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

        {/* 2. Parâmetros de Cálculo da Jornada */}
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 space-y-4">
          <div>
            <h3 className="text-xs font-bold text-slate-800 dark:text-white">
              Parâmetros da Jornada de Trabalho
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Define a capacidade produtiva diária por pessoa e a data de corte inicial do plano.
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                Horas Trabalhadas por Dia (Horas Úteis)
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
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                Data Base de Início do Planejamento
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
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                Acréscimo de Horas na Visão do Cliente (%)
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
                Percentual adicionado automaticamente à quantidade de horas informada das demandas quando a visão do cliente estiver ativa (ex: 20%). Deixe 0 para não aplicar acréscimo.
              </p>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                Dias Úteis Adicionais na Visão do Cliente
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
                Quantidade de dias úteis adicionados à data de entrega de cada demanda na visão do cliente (padrão: 1 dia útil). Deixe 0 para não estender a data de entrega.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Gestão de Feriados e Dias Não Trabalhados */}
      <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-xs font-bold text-slate-800 dark:text-white flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-rose-500" />
              <span>Feriados Nacionais e Dias Não Trabalhados ({formData.holidays.length})</span>
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Essas datas são puladas automaticamente pelo motor de cronograma durante o cálculo das atividades.
            </p>
          </div>

          <button
            type="button"
            onClick={onResetHolidays}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 dark:text-rose-300 dark:border-rose-500/30 text-xs font-bold transition-all shadow-sm self-start sm:self-auto"
            title="Recarrega a lista padrão com todos os feriados nacionais de 2026 a 2028"
          >
            <RotateCcw className="w-3.5 h-3.5" />
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
