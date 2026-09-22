import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Scale,
  Plus,
  TrendingDown,
  TrendingUp,
  Target,
  Send,
  Calendar,
  Clock,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Info,
  X,
  ExternalLink,
  Bot,
  Copy,
  Check,
  RotateCcw,
  Sparkles,
  Search,
  ArrowRight,
} from 'lucide-react';
import { WeightLog, HealthSummary, HealthGoal, TelegramConfigStatus } from '../types';

interface HealthModuleProps {
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

type PeriodFilter = '7d' | '30d' | '90d' | '6m' | '1y' | 'all';

export const HealthModule: React.FC<HealthModuleProps> = ({ onShowToast }) => {
  // Estados principais
  const [weights, setWeights] = useState<WeightLog[]>([]);
  const [summary, setSummary] = useState<HealthSummary | null>(null);
  const [telegramStatus, setTelegramStatus] = useState<TelegramConfigStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodFilter>('30d');
  const [searchFilter, setSearchFilter] = useState('');

  // Modais
  const [isWeightModalOpen, setIsWeightModalOpen] = useState(false);
  const [editingWeight, setEditingWeight] = useState<WeightLog | null>(null);
  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
  const [isTelegramModalOpen, setIsTelegramModalOpen] = useState(false);

  // Formulário de Pesagem
  const [formWeight, setFormWeight] = useState('');
  const [formLoggedAt, setFormLoggedAt] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [isSubmittingWeight, setIsSubmittingWeight] = useState(false);

  // Formulário de Meta
  const [formTargetWeight, setFormTargetWeight] = useState('');
  const [formInitialWeight, setFormInitialWeight] = useState('');
  const [isSubmittingGoal, setIsSubmittingGoal] = useState(false);

  // Formulário de Token Telegram
  const [telegramTokenInput, setTelegramTokenInput] = useState('');
  const [isSavingTelegramToken, setIsSavingTelegramToken] = useState(false);
  const [telegramCode, setTelegramCode] = useState<string | null>(null);
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);
  const [hasCopiedCode, setHasCopiedCode] = useState(false);

  // Tooltip interativo do gráfico
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null);

  // Formatar agora para datetime-local (YYYY-MM-DDTHH:mm)
  const getNowForInput = () => {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    const local = new Date(now.getTime() - offset);
    return local.toISOString().slice(0, 16);
  };

  // Carregar dados
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [weightsRes, summaryRes, tgRes] = await Promise.all([
        fetch(`/api/health/weights?period=${period}`),
        fetch('/api/health/summary'),
        fetch('/api/health/telegram/config'),
      ]);

      if (weightsRes.ok) {
        const wData = await weightsRes.json();
        setWeights(wData);
      }
      if (summaryRes.ok) {
        const sData = await summaryRes.json();
        setSummary(sData);
        if (sData.goal) {
          setFormTargetWeight(String(sData.goal.targetWeight));
          if (sData.goal.initialWeight) {
            setFormInitialWeight(String(sData.goal.initialWeight));
          }
        }
      }
      if (tgRes.ok) {
        const tgData = await tgRes.json();
        setTelegramStatus(tgData);
      }
    } catch (err) {
      console.error('[HealthModule] Erro ao carregar dados:', err);
      onShowToast('Falha ao carregar informações de saúde', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [period, onShowToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Abertura do modal de cadastro/edição
  const handleOpenAddWeight = () => {
    setEditingWeight(null);
    setFormWeight('');
    setFormLoggedAt(getNowForInput());
    setFormNotes('');
    setIsWeightModalOpen(true);
  };

  const handleOpenEditWeight = (item: WeightLog) => {
    setEditingWeight(item);
    setFormWeight(String(item.weight).replace('.', ','));
    const d = new Date(item.loggedAt);
    const offset = d.getTimezoneOffset() * 60000;
    const local = new Date(d.getTime() - offset);
    setFormLoggedAt(local.toISOString().slice(0, 16));
    setFormNotes(item.notes || '');
    setIsWeightModalOpen(true);
  };

  // Submeter pesagem
  const handleSaveWeight = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanWeight = parseFloat(formWeight.replace(',', '.'));
    if (isNaN(cleanWeight) || cleanWeight <= 0) {
      onShowToast('Informe um peso válido (ex: 93,5)', 'error');
      return;
    }

    setIsSubmittingWeight(true);
    try {
      const url = editingWeight ? `/api/health/weights/${editingWeight.id}` : '/api/health/weights';
      const method = editingWeight ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weight: cleanWeight,
          loggedAt: formLoggedAt ? new Date(formLoggedAt).toISOString() : new Date().toISOString(),
          notes: formNotes.trim() || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Erro ao salvar pesagem');
      }

      onShowToast(editingWeight ? 'Pesagem atualizada com sucesso!' : 'Pesagem registrada com sucesso!', 'success');
      setIsWeightModalOpen(false);
      loadData();
    } catch (err: any) {
      onShowToast(err.message || 'Erro ao salvar pesagem', 'error');
    } finally {
      setIsSubmittingWeight(false);
    }
  };

  // Excluir pesagem
  const handleDeleteWeight = async (id: string) => {
    if (!confirm('Deseja realmente excluir esta pesagem?')) return;
    try {
      const res = await fetch(`/api/health/weights/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Erro ao excluir pesagem');
      onShowToast('Pesagem excluída com sucesso.', 'info');
      loadData();
    } catch (err: any) {
      onShowToast(err.message || 'Falha ao excluir pesagem', 'error');
    }
  };

  // Salvar meta de peso
  const handleSaveGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = parseFloat(formTargetWeight.replace(',', '.'));
    if (isNaN(target) || target <= 0) {
      onShowToast('Informe uma meta de peso válida', 'error');
      return;
    }

    const initial = formInitialWeight ? parseFloat(formInitialWeight.replace(',', '.')) : null;

    setIsSubmittingGoal(true);
    try {
      const res = await fetch('/api/health/goal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetWeight: target,
          initialWeight: initial,
        }),
      });

      if (!res.ok) throw new Error('Falha ao salvar meta');

      onShowToast('Meta de peso salva com sucesso!', 'success');
      setIsGoalModalOpen(false);
      loadData();
    } catch (err: any) {
      onShowToast(err.message || 'Erro ao salvar meta', 'error');
    } finally {
      setIsSubmittingGoal(false);
    }
  };

  // Salvar token do Telegram
  const handleSaveTelegramToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!telegramTokenInput.trim()) {
      onShowToast('Informe o Token HTTP do Bot Telegram', 'error');
      return;
    }

    setIsSavingTelegramToken(true);
    try {
      const res = await fetch('/api/health/telegram/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: telegramTokenInput.trim() }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Token inválido');

      onShowToast(`Bot @${data.botUsername} conectado com sucesso!`, 'success');
      setTelegramTokenInput('');
      loadData();
    } catch (err: any) {
      onShowToast(err.message || 'Erro ao configurar token', 'error');
    } finally {
      setIsSavingTelegramToken(false);
    }
  };

  // Gerar código de vinculação
  const handleGenerateCode = async () => {
    setIsGeneratingCode(true);
    try {
      const res = await fetch('/api/health/telegram/generate-code', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao gerar código');
      setTelegramCode(data.code);
    } catch (err: any) {
      onShowToast(err.message || 'Falha ao gerar código', 'error');
    } finally {
      setIsGeneratingCode(false);
    }
  };

  // Desvincular Telegram
  const handleUnlinkTelegram = async () => {
    if (!confirm('Deseja desvincular seu Telegram da sua conta TaskLS?')) return;
    try {
      const res = await fetch('/api/health/telegram/unlink', { method: 'POST' });
      if (!res.ok) throw new Error('Falha ao desvincular');
      onShowToast('Conta do Telegram desvinculada com sucesso.', 'info');
      setTelegramCode(null);
      loadData();
    } catch (err: any) {
      onShowToast(err.message || 'Erro ao desvincular Telegram', 'error');
    }
  };

  // Copiar comando para área de transferência
  const handleCopyCommand = (text: string) => {
    navigator.clipboard.writeText(text);
    setHasCopiedCode(true);
    setTimeout(() => setHasCopiedCode(false), 2000);
    onShowToast('Comando copiado para a área de transferência!', 'success');
  };

  // Lista cronológica para o gráfico (do mais antigo para o mais recente)
  const chartData = useMemo(() => {
    return [...weights].reverse();
  }, [weights]);

  // Filtragem da tabela por texto/data
  const filteredWeights = useMemo(() => {
    if (!searchFilter.trim()) return weights;
    const q = searchFilter.toLowerCase();
    return weights.filter((w) => {
      const dateStr = new Date(w.loggedAt).toLocaleDateString('pt-BR');
      return (
        String(w.weight).includes(q) ||
        dateStr.includes(q) ||
        (w.notes && w.notes.toLowerCase().includes(q))
      );
    });
  }, [weights, searchFilter]);

  // Cálculos para o Gráfico SVG
  const chartMetrics = useMemo(() => {
    if (chartData.length === 0) return null;

    const weightsArr = chartData.map((d) => d.weight);
    let min = Math.min(...weightsArr);
    let max = Math.max(...weightsArr);

    // Se houver meta configurada, inclui a meta na escala vertical se fizer sentido
    if (summary?.goal?.targetWeight) {
      min = Math.min(min, summary.goal.targetWeight);
      max = Math.max(max, summary.goal.targetWeight);
    }

    // Margem superior e inferior para visual agradável (pelo menos 1kg de folga)
    const padding = Math.max((max - min) * 0.15, 1.2);
    const yMin = Math.floor(min - padding);
    const yMax = Math.ceil(max + padding);
    const yRange = yMax - yMin || 1;

    // Dimensões internas do SVG
    const width = 900;
    const height = 300;
    const margin = { top: 25, right: 35, bottom: 40, left: 55 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // Mapeamento de coordenadas
    const points = chartData.map((d, index) => {
      const x =
        chartData.length === 1
          ? margin.left + innerWidth / 2
          : margin.left + (index / (chartData.length - 1)) * innerWidth;
      const y = margin.top + innerHeight - ((d.weight - yMin) / yRange) * innerHeight;
      return { x, y, data: d, index };
    });

    // Caminho da linha
    let linePath = '';
    if (points.length === 1) {
      linePath = `M ${points[0].x - 10} ${points[0].y} L ${points[0].x + 10} ${points[0].y}`;
    } else {
      linePath = points.reduce((acc, curr, idx) => {
        return idx === 0 ? `M ${curr.x} ${curr.y}` : `${acc} L ${curr.x} ${curr.y}`;
      }, '');
    }

    // Caminho da área gradiente fechada até o chão do gráfico
    let areaPath = '';
    if (points.length > 1) {
      const firstX = points[0].x;
      const lastX = points[points.length - 1].x;
      const bottomY = margin.top + innerHeight;
      areaPath = `${linePath} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
    }

    // Posição Y da meta (se aplicável)
    let goalY: number | null = null;
    if (summary?.goal?.targetWeight) {
      goalY = margin.top + innerHeight - ((summary.goal.targetWeight - yMin) / yRange) * innerHeight;
    }

    // Linhas de grade no eixo Y (4 a 5 divisões)
    const gridLines = [];
    const steps = 4;
    for (let i = 0; i <= steps; i++) {
      const val = yMin + (i * yRange) / steps;
      const y = margin.top + innerHeight - ((val - yMin) / yRange) * innerHeight;
      gridLines.push({ val: Number(val.toFixed(1)), y });
    }

    return {
      width,
      height,
      margin,
      innerWidth,
      innerHeight,
      yMin,
      yMax,
      points,
      linePath,
      areaPath,
      goalY,
      gridLines,
    };
  }, [chartData, summary]);

  return (
    <div className="max-w-[1680px] mx-auto p-4 lg:p-8 space-y-8 animate-in fade-in duration-300">
      
      {/* ========================================================== */}
      {/* CABEÇALHO DO MÓDULO & AÇÕES RÁPIDAS */}
      {/* ========================================================== */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-[#0c1222]/90 border border-slate-800/80 p-6 rounded-3xl backdrop-blur-md shadow-xl">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 via-teal-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-emerald-500/25 ring-1 ring-white/20">
            <Scale className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl lg:text-2xl font-black tracking-tight text-white">
                Saúde & Evolução de Peso
              </h1>
              <span className="px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Ativo
              </span>
            </div>
            <p className="text-xs text-slate-400 font-medium mt-0.5">
              Acompanhe pesagens diárias, metas corporais e integre com o Telegram para registros automáticos.
            </p>
          </div>
        </div>

        {/* Botões de Ação */}
        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          {/* Botão Bot Telegram */}
          <button
            type="button"
            onClick={() => setIsTelegramModalOpen(true)}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-3.5 py-2 rounded-2xl bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/80 hover:border-cyan-500/50 text-xs font-bold transition-all shadow-sm group"
            title="Conectar com Bot do Telegram"
          >
            <div className="relative">
              <Send className="w-3.5 h-3.5 text-cyan-400 group-hover:translate-x-0.5 transition-transform" />
              {telegramStatus?.isLinked && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-slate-900" />
              )}
            </div>
            <span>Bot Telegram</span>
            {telegramStatus?.isLinked && (
              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Vinculado
              </span>
            )}
          </button>

          {/* Botão Definir Meta */}
          <button
            type="button"
            onClick={() => setIsGoalModalOpen(true)}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-3.5 py-2 rounded-2xl bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/80 hover:border-amber-500/50 text-xs font-bold transition-all shadow-sm"
            title="Definir Meta de Peso"
          >
            <Target className="w-3.5 h-3.5 text-amber-400" />
            <span>Definir Meta</span>
          </button>

          {/* Botão Registrar Pesagem */}
          <button
            type="button"
            onClick={handleOpenAddWeight}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-extrabold shadow-lg shadow-emerald-600/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            <span>Registrar Pesagem</span>
          </button>
        </div>
      </div>

      {/* ========================================================== */}
      {/* CARDS DE RESUMO (KPIS) */}
      {/* ========================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* 1. Peso Atual */}
        <div className="bg-[#0c1222]/90 border border-slate-800 p-5 rounded-3xl shadow-xl relative overflow-hidden group hover:border-slate-700 transition-all">
          <div className="absolute top-0 right-0 w-28 h-28 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Peso Atual</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20">
              <Scale className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-white tracking-tight">
              {summary?.currentWeight ? `${summary.currentWeight.toFixed(1).replace('.', ',')}` : '--'}
            </span>
            <span className="text-sm font-bold text-slate-400">kg</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            {summary?.currentLoggedAt
              ? `Última: ${new Date(summary.currentLoggedAt).toLocaleDateString('pt-BR')} às ${new Date(summary.currentLoggedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
              : 'Nenhum registro ainda'}
          </p>
        </div>

        {/* 2. Variação Recente */}
        <div className="bg-[#0c1222]/90 border border-slate-800 p-5 rounded-3xl shadow-xl relative overflow-hidden group hover:border-slate-700 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Última Variação</span>
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center border ${
              (summary?.recentDiff || 0) < 0
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : (summary?.recentDiff || 0) > 0
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}>
              {(summary?.recentDiff || 0) <= 0 ? (
                <TrendingDown className="w-4 h-4" />
              ) : (
                <TrendingUp className="w-4 h-4" />
              )}
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className={`text-3xl font-black tracking-tight ${
              (summary?.recentDiff || 0) < 0
                ? 'text-emerald-400'
                : (summary?.recentDiff || 0) > 0
                ? 'text-amber-400'
                : 'text-slate-300'
            }`}>
              {summary && summary.previousWeight !== null
                ? `${summary.recentDiff > 0 ? '+' : ''}${summary.recentDiff.toFixed(2).replace('.', ',')}`
                : '--'}
            </span>
            <span className="text-sm font-bold text-slate-400">kg</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            {summary && summary.previousWeight !== null
              ? `Em relação à pesagem anterior (${summary.previousWeight.toFixed(1).replace('.', ',')} kg)`
              : 'Cadastre mais pesagens para comparar'}
          </p>
        </div>

        {/* 3. Evolução Total */}
        <div className="bg-[#0c1222]/90 border border-slate-800 p-5 rounded-3xl shadow-xl relative overflow-hidden group hover:border-slate-700 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Perda Total</span>
            <div className="w-8 h-8 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center border border-cyan-500/20">
              <Sparkles className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className={`text-3xl font-black tracking-tight ${
              (summary?.totalDiff || 0) < 0 ? 'text-cyan-400' : 'text-slate-300'
            }`}>
              {summary && summary.totalEntries > 0
                ? `${summary.totalDiff > 0 ? '+' : ''}${summary.totalDiff.toFixed(1).replace('.', ',')}`
                : '--'}
            </span>
            <span className="text-sm font-bold text-slate-400">kg</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            {summary && summary.initialWeight !== null
              ? `Desde o peso inicial (${summary.initialWeight.toFixed(1).replace('.', ',')} kg)`
              : 'Primeiro registro'}
          </p>
        </div>

        {/* 4. Meta de Peso */}
        <div className="bg-[#0c1222]/90 border border-slate-800 p-5 rounded-3xl shadow-xl relative overflow-hidden group hover:border-slate-700 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Meta</span>
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center border border-amber-500/20">
              <Target className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between gap-2">
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-black text-amber-300 tracking-tight">
                {summary?.goal?.targetWeight ? `${summary.goal.targetWeight.toFixed(1).replace('.', ',')}` : '--'}
              </span>
              <span className="text-sm font-bold text-slate-400">kg</span>
            </div>
            {summary?.goal && (
              <span className="px-2 py-0.5 rounded-lg text-xs font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                {summary.goal.progressPercentage}%
              </span>
            )}
          </div>
          
          {summary?.goal ? (
            <div className="mt-2 space-y-1">
              <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden border border-slate-700">
                <div
                  className="bg-gradient-to-r from-amber-500 to-emerald-400 h-full rounded-full transition-all duration-500"
                  style={{ width: `${summary.goal.progressPercentage}%` }}
                />
              </div>
              <p className="text-[10px] text-slate-400 text-right">
                {summary.goal.remainingKg && summary.goal.remainingKg > 0
                  ? `Faltam ${summary.goal.remainingKg.toFixed(1).replace('.', ',')} kg para a meta`
                  : 'Meta atingida! Parabéns! 🎉'}
              </p>
            </div>
          ) : (
            <p className="text-[11px] text-amber-400/80 mt-1 cursor-pointer hover:underline" onClick={() => setIsGoalModalOpen(true)}>
              Clique para definir sua meta
            </p>
          )}
        </div>
      </div>

      {/* ========================================================== */}
      {/* GRÁFICO INTERATIVO DE EVOLUÇÃO TEMPORAL */}
      {/* ========================================================== */}
      <div className="bg-[#0c1222]/90 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-slate-800/80">
          <div>
            <h2 className="text-base font-extrabold text-white flex items-center gap-2">
              <span>Gráfico de Evolução de Peso</span>
              <span className="text-xs font-semibold text-slate-400">({chartData.length} registros no período)</span>
            </h2>
            <p className="text-xs text-slate-400">Passe o mouse pelos pontos para detalhes de cada pesagem</p>
          </div>

          {/* Filtro de Período */}
          <div className="flex items-center gap-1 bg-slate-900/90 border border-slate-800 p-1 rounded-2xl">
            {(
              [
                { id: '7d', label: '7D' },
                { id: '30d', label: '30D' },
                { id: '90d', label: '90D' },
                { id: '6m', label: '6M' },
                { id: '1y', label: '1A' },
                { id: 'all', label: 'Tudo' },
              ] as { id: PeriodFilter; label: string }[]
            ).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPeriod(p.id)}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                  period === p.id
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Área do Gráfico */}
        {isLoading ? (
          <div className="h-64 flex flex-col items-center justify-center gap-3 text-slate-500">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
            <span className="text-xs font-semibold">Carregando dados do gráfico...</span>
          </div>
        ) : chartMetrics && chartMetrics.points.length > 0 ? (
          <div className="relative w-full overflow-hidden">
            {/* SVG Responsivo */}
            <svg
              viewBox={`0 0 ${chartMetrics.width} ${chartMetrics.height}`}
              className="w-full h-64 lg:h-72 select-none overflow-visible"
            >
              <defs>
                {/* Gradiente da Linha */}
                <linearGradient id="weightLineGradient" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#10b981" />
                  <stop offset="50%" stopColor="#06b6d4" />
                  <stop offset="100%" stopColor="#3b82f6" />
                </linearGradient>

                {/* Gradiente da Área Preenchida */}
                <linearGradient id="weightAreaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.35" />
                  <stop offset="60%" stopColor="#06b6d4" stopOpacity="0.10" />
                  <stop offset="100%" stopColor="#0f172a" stopOpacity="0" />
                </linearGradient>
              </defs>

              {/* Linhas de Grade Horizontais */}
              {chartMetrics.gridLines.map((gl, i) => (
                <g key={i}>
                  <line
                    x1={chartMetrics.margin.left}
                    y1={gl.y}
                    x2={chartMetrics.width - chartMetrics.margin.right}
                    y2={gl.y}
                    stroke="#1e293b"
                    strokeDasharray="4 4"
                    strokeWidth="1"
                  />
                  <text
                    x={chartMetrics.margin.left - 12}
                    y={gl.y + 4}
                    textAnchor="end"
                    fill="#64748b"
                    fontSize="11"
                    fontWeight="600"
                  >
                    {gl.val}kg
                  </text>
                </g>
              ))}

              {/* Linha Tracejada de Meta (se visível no intervalo) */}
              {chartMetrics.goalY !== null &&
                chartMetrics.goalY >= chartMetrics.margin.top &&
                chartMetrics.goalY <= chartMetrics.margin.top + chartMetrics.innerHeight && (
                  <g>
                    <line
                      x1={chartMetrics.margin.left}
                      y1={chartMetrics.goalY}
                      x2={chartMetrics.width - chartMetrics.margin.right}
                      y2={chartMetrics.goalY}
                      stroke="#f59e0b"
                      strokeDasharray="6 4"
                      strokeWidth="1.5"
                    />
                    <text
                      x={chartMetrics.width - chartMetrics.margin.right + 6}
                      y={chartMetrics.goalY + 4}
                      fill="#f59e0b"
                      fontSize="10"
                      fontWeight="bold"
                    >
                      Meta
                    </text>
                  </g>
                )}

              {/* Área Sombreada Gradiente */}
              {chartMetrics.areaPath && (
                <path d={chartMetrics.areaPath} fill="url(#weightAreaGradient)" />
              )}

              {/* Linha do Gráfico */}
              <path
                d={chartMetrics.linePath}
                fill="none"
                stroke="url(#weightLineGradient)"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Pontos de Dados */}
              {chartMetrics.points.map((pt, idx) => {
                const isHovered = hoveredPointIndex === idx;
                return (
                  <g key={idx}>
                    {/* Anel de destaque ao passar mouse */}
                    {isHovered && (
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r="8"
                        fill="none"
                        stroke="#10b981"
                        strokeWidth="2"
                        className="animate-ping opacity-75"
                      />
                    )}
                    {/* Círculo Principal */}
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={isHovered ? '6' : '4.5'}
                      fill={isHovered ? '#10b981' : '#0c1222'}
                      stroke={isHovered ? '#ffffff' : '#10b981'}
                      strokeWidth="2.5"
                      className="cursor-pointer transition-all duration-150"
                      onMouseEnter={() => setHoveredPointIndex(idx)}
                      onMouseLeave={() => setHoveredPointIndex(null)}
                    />
                  </g>
                );
              })}

              {/* Rótulos de Data no Eixo X (Primeiro, Meio, Último) */}
              {chartMetrics.points.length > 0 && (
                <>
                  <text
                    x={chartMetrics.points[0].x}
                    y={chartMetrics.margin.top + chartMetrics.innerHeight + 24}
                    textAnchor="start"
                    fill="#64748b"
                    fontSize="11"
                    fontWeight="600"
                  >
                    {new Date(chartMetrics.points[0].data.loggedAt).toLocaleDateString('pt-BR')}
                  </text>
                  {chartMetrics.points.length > 2 && (
                    <text
                      x={chartMetrics.points[Math.floor(chartMetrics.points.length / 2)].x}
                      y={chartMetrics.margin.top + chartMetrics.innerHeight + 24}
                      textAnchor="middle"
                      fill="#64748b"
                      fontSize="11"
                      fontWeight="600"
                    >
                      {new Date(
                        chartMetrics.points[Math.floor(chartMetrics.points.length / 2)].data.loggedAt
                      ).toLocaleDateString('pt-BR')}
                    </text>
                  )}
                  {chartMetrics.points.length > 1 && (
                    <text
                      x={chartMetrics.points[chartMetrics.points.length - 1].x}
                      y={chartMetrics.margin.top + chartMetrics.innerHeight + 24}
                      textAnchor="end"
                      fill="#64748b"
                      fontSize="11"
                      fontWeight="600"
                    >
                      {new Date(
                        chartMetrics.points[chartMetrics.points.length - 1].data.loggedAt
                      ).toLocaleDateString('pt-BR')}
                    </text>
                  )}
                </>
              )}
            </svg>

            {/* Tooltip Dinâmico Flutuante em HTML */}
            {hoveredPointIndex !== null && chartMetrics.points[hoveredPointIndex] && (
              (() => {
                const pt = chartMetrics.points[hoveredPointIndex];
                const d = pt.data;
                const dateObj = new Date(d.loggedAt);
                const diff = d.diffFromPrevious || 0;

                return (
                  <div
                    className="absolute z-20 pointer-events-none bg-[#090d16] border border-slate-700 p-3 rounded-2xl shadow-2xl text-xs space-y-1 transform -translate-x-1/2 -translate-y-full mb-3 ring-1 ring-white/10"
                    style={{
                      left: `${(pt.x / chartMetrics.width) * 100}%`,
                      top: `${(pt.y / chartMetrics.height) * 100}%`,
                    }}
                  >
                    <div className="flex items-center justify-between gap-3 text-slate-400 text-[10px] font-bold uppercase">
                      <span>{dateObj.toLocaleDateString('pt-BR')}</span>
                      <span>{dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-base font-extrabold text-white">
                        {d.weight.toFixed(1).replace('.', ',')} kg
                      </span>
                      {diff !== 0 && (
                        <span
                          className={`font-bold text-[11px] ${
                            diff < 0 ? 'text-emerald-400' : 'text-amber-400'
                          }`}
                        >
                          {diff > 0 ? `+${diff.toFixed(2)}` : `${diff.toFixed(2)}`} kg
                        </span>
                      )}
                    </div>
                    {d.notes && (
                      <p className="text-[11px] text-slate-300 italic border-t border-slate-800 pt-1">
                        "{d.notes}"
                      </p>
                    )}
                    <span className="text-[9px] text-slate-500 block uppercase tracking-wider">
                      Origem: {d.source === 'telegram' ? '🤖 Telegram' : '🌐 Web'}
                    </span>
                  </div>
                );
              })()
            )}
          </div>
        ) : (
          <div className="h-56 flex flex-col items-center justify-center gap-3 text-slate-500 border border-dashed border-slate-800 rounded-2xl">
            <Scale className="w-8 h-8 text-slate-600" />
            <p className="text-xs font-semibold">Nenhuma pesagem encontrada para o período selecionado.</p>
            <button
              onClick={handleOpenAddWeight}
              className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors"
            >
              Registrar Primeira Pesagem
            </button>
          </div>
        )}
      </div>

      {/* ========================================================== */}
      {/* TABELA DE HISTÓRICO DE PESAGENS */}
      {/* ========================================================== */}
      <div className="bg-[#0c1222]/90 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-3 border-b border-slate-800">
          <div>
            <h2 className="text-base font-extrabold text-white flex items-center gap-2">
              <span>Histórico de Registros</span>
              <span className="text-xs font-semibold text-slate-400">({weights.length} registros)</span>
            </h2>
            <p className="text-xs text-slate-400">Todas as pesagens registradas pela web ou pelo bot do Telegram</p>
          </div>

          {/* Busca */}
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar peso, data ou nota..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            />
          </div>
        </div>

        {/* Tabela */}
        {filteredWeights.length === 0 ? (
          <div className="py-12 text-center text-slate-500 space-y-2">
            <p className="text-xs font-medium">Nenhum registro encontrado.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-4">Data & Hora</th>
                  <th className="py-3 px-4">Peso</th>
                  <th className="py-3 px-4">Variação vs. Anterior</th>
                  <th className="py-3 px-4">Origem</th>
                  <th className="py-3 px-4">Observações</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-xs">
                {filteredWeights.map((item) => {
                  const dateObj = new Date(item.loggedAt);
                  const diff = item.diffFromPrevious || 0;

                  return (
                    <tr key={item.id} className="hover:bg-slate-900/40 transition-colors">
                      {/* Data & Hora */}
                      <td className="py-3.5 px-4 font-semibold text-slate-200">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-3.5 h-3.5 text-slate-500" />
                          <span>{dateObj.toLocaleDateString('pt-BR')}</span>
                          <span className="text-slate-500 text-[11px]">
                            {dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </td>

                      {/* Peso */}
                      <td className="py-3.5 px-4 font-extrabold text-white">
                        <span className="text-sm">{item.weight.toFixed(1).replace('.', ',')}</span>
                        <span className="text-slate-400 text-xs ml-1 font-normal">kg</span>
                      </td>

                      {/* Variação */}
                      <td className="py-3.5 px-4">
                        {diff !== 0 ? (
                          <span
                            className={`inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded-lg text-[11px] ${
                              diff < 0
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            }`}
                          >
                            {diff < 0 ? (
                              <TrendingDown className="w-3 h-3" />
                            ) : (
                              <TrendingUp className="w-3 h-3" />
                            )}
                            {diff > 0 ? `+${diff.toFixed(2)}` : `${diff.toFixed(2)}`} kg
                          </span>
                        ) : (
                          <span className="text-slate-500 text-[11px]">—</span>
                        )}
                      </td>

                      {/* Origem */}
                      <td className="py-3.5 px-4">
                        {item.source === 'telegram' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                            <Send className="w-3 h-3" />
                            Telegram
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                            Web
                          </span>
                        )}
                      </td>

                      {/* Observações */}
                      <td className="py-3.5 px-4 text-slate-400 italic max-w-xs truncate">
                        {item.notes || '—'}
                      </td>

                      {/* Ações */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenEditWeight(item)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                            title="Editar Pesagem"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteWeight(item.id)}
                            className="p-1.5 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 transition-colors"
                            title="Excluir Pesagem"
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

      {/* ========================================================== */}
      {/* MODAL: REGISTRAR / EDITAR PESAGEM */}
      {/* ========================================================== */}
      {isWeightModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0b101e] border border-slate-700 rounded-3xl max-w-md w-full shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-600/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
                  <Scale className="w-5 h-5" />
                </div>
                <h3 className="text-base font-extrabold text-white">
                  {editingWeight ? 'Editar Pesagem' : 'Registrar Pesagem'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsWeightModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveWeight} className="space-y-4">
              {/* Peso em kg */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Peso em kg <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    autoFocus
                    placeholder="Ex: 93,5"
                    value={formWeight}
                    onChange={(e) => setFormWeight(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white font-black text-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 font-bold text-sm text-slate-400">
                    kg
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">Aceita vírgula ou ponto (ex: 93,5 ou 93.5)</p>
              </div>

              {/* Data e Hora */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Data e Hora da Pesagem
                </label>
                <input
                  type="datetime-local"
                  value={formLoggedAt}
                  onChange={(e) => setFormLoggedAt(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
              </div>

              {/* Observações */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Observações (Opcional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Ex: Em jejum, logo ao acordar / Pós-treino..."
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/50 resize-none"
                />
              </div>

              {/* Botões */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsWeightModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingWeight}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold shadow-md shadow-emerald-600/30 flex items-center gap-1.5"
                >
                  {isSubmittingWeight ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  <span>{editingWeight ? 'Salvar Alterações' : 'Salvar Pesagem'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* MODAL: DEFINIR META DE PESO */}
      {/* ========================================================== */}
      {isGoalModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0b101e] border border-slate-700 rounded-3xl max-w-md w-full shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
                  <Target className="w-5 h-5" />
                </div>
                <h3 className="text-base font-extrabold text-white">Meta de Peso</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsGoalModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveGoal} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Peso Meta Desejado (kg) <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    autoFocus
                    placeholder="Ex: 85,0"
                    value={formTargetWeight}
                    onChange={(e) => setFormTargetWeight(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-amber-300 font-black text-lg focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 font-bold text-sm text-slate-400">
                    kg
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">O seu objetivo final de peso.</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Peso Inicial de Partida (kg) <span className="text-slate-500">(Opcional)</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder={
                      summary?.initialWeight ? `Atual: ${summary.initialWeight} kg` : 'Ex: 98,0'
                    }
                    value={formInitialWeight}
                    onChange={(e) => setFormInitialWeight(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 font-bold text-xs text-slate-400">
                    kg
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  Se omitido, será usado o peso da sua primeira pesagem registrada para calcular o progresso.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsGoalModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingGoal}
                  className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-bold shadow-md shadow-amber-600/30 flex items-center gap-1.5"
                >
                  {isSubmittingGoal ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  <span>Salvar Meta</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* MODAL: CONFIGURAÇÃO & VINCULAÇÃO DO TELEGRAM BOT */}
      {/* ========================================================== */}
      {isTelegramModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#0b101e] border border-slate-700 rounded-3xl max-w-xl w-full shadow-2xl p-6 space-y-6 animate-in fade-in zoom-in-95 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-cyan-600/20 text-cyan-400 flex items-center justify-center border border-cyan-500/30 shadow-md shadow-cyan-600/20">
                  <Send className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white">Bot do Telegram</h3>
                  <p className="text-xs text-slate-400">Registre suas pesagens por mensagem no celular</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsTelegramModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Status da Conexão */}
            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400">Status do Bot no Servidor:</span>
                {telegramStatus?.isBotActive ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-xl">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Online (@{telegramStatus.botUsername})
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-xl">
                    <AlertCircle className="w-3.5 h-3.5" />
                    Aguardando Configuração de Token
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                <span className="text-xs font-bold text-slate-400">Vinculação da sua conta:</span>
                {telegramStatus?.isLinked ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-extrabold text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2.5 py-1 rounded-xl">
                      Vinculado (ID: {telegramStatus.chatId})
                    </span>
                    <button
                      type="button"
                      onClick={handleUnlinkTelegram}
                      className="text-[11px] text-rose-400 hover:underline font-semibold"
                    >
                      Desvincular
                    </button>
                  </div>
                ) : (
                  <span className="text-xs font-semibold text-slate-500">Não vinculada</span>
                )}
              </div>
            </div>

            {/* SEÇÃO 1: Vinculação de Conta via Código */}
            {telegramStatus?.isBotActive && (
              <div className="space-y-3 p-4 rounded-2xl bg-gradient-to-tr from-cyan-950/20 to-slate-900/60 border border-cyan-500/20">
                <div className="flex items-center gap-2">
                  <Bot className="w-4 h-4 text-cyan-400" />
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                    Como Vincular seu Telegram à sua Conta
                  </h4>
                </div>

                <p className="text-xs text-slate-300">
                  Gere um código de 6 dígitos e envie no chat do bot para conectar sua conta:
                </p>

                {telegramCode ? (
                  <div className="p-3 bg-slate-950 rounded-xl border border-cyan-500/40 flex items-center justify-between gap-3">
                    <div>
                      <span className="text-[10px] text-slate-400 block font-bold uppercase">
                        Envie este comando no bot do Telegram:
                      </span>
                      <code className="text-cyan-300 font-mono font-bold text-sm">
                        /vincular {telegramCode}
                      </code>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopyCommand(`/vincular ${telegramCode}`)}
                      className="px-3 py-1.5 rounded-lg bg-cyan-600/30 hover:bg-cyan-600/50 text-cyan-200 border border-cyan-500/40 text-xs font-bold flex items-center gap-1 transition-all"
                    >
                      {hasCopiedCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{hasCopiedCode ? 'Copiado!' : 'Copiar'}</span>
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleGenerateCode}
                    disabled={isGeneratingCode}
                    className="w-full py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-xs font-bold shadow-md shadow-cyan-600/30 flex items-center justify-center gap-2 transition-all"
                  >
                    {isGeneratingCode ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    <span>Gerar Código de Vinculação</span>
                  </button>
                )}

                {/* Exemplo de Mensagem de Pesagem */}
                <div className="mt-3 p-3 bg-slate-950/80 rounded-xl border border-slate-800 space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    💬 Formato de Registro de Peso:
                  </span>
                  <p className="text-xs text-slate-300">
                    Após vincular, envie qualquer mensagem no formato:
                  </p>
                  <div className="p-2 rounded-lg bg-slate-900 border border-slate-700 font-mono text-emerald-400 font-bold text-xs">
                    Peso: 93,5
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    O bot registrará automaticamente a data e a hora atual e responderá imediatamente com:
                  </p>
                  <p className="text-[11px] text-slate-300 font-medium italic">
                    "Peso registrado com sucesso. Diferença da última pesagem: -0.60kg"
                  </p>
                </div>
              </div>
            )}

            {/* SEÇÃO 2: Configuração do Token do Bot (para caso precise atualizar ou configurar) */}
            <div className="space-y-3 pt-2 border-t border-slate-800">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Configuração do Bot Token (@BotFather)
                </span>
                <a
                  href="https://t.me/BotFather"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-cyan-400 hover:underline flex items-center gap-1"
                >
                  <span>Abrir @BotFather</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              <p className="text-[11px] text-slate-400 leading-relaxed">
                Se você ainda não criou um bot: acesse o <strong>@BotFather</strong> no Telegram, envie o comando <code>/newbot</code>, escolha um nome e copie o token HTTP da API fornecido.
              </p>

              <form onSubmit={handleSaveTelegramToken} className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="password"
                    placeholder={
                      telegramStatus?.hasToken
                        ? 'Token já configurado (digite para alterar)...'
                        : 'Cole o token aqui (ex: 123456789:ABCdefGhI...)'
                    }
                    value={telegramTokenInput}
                    onChange={(e) => setTelegramTokenInput(e.target.value)}
                    className="flex-1 px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                  />
                  <button
                    type="submit"
                    disabled={isSavingTelegramToken || !telegramTokenInput.trim()}
                    className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-xs font-bold shadow-md shadow-cyan-600/30 transition-all flex items-center gap-1"
                  >
                    {isSavingTelegramToken ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                    <span>Salvar Token</span>
                  </button>
                </div>
              </form>
            </div>

            {/* Fechar */}
            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsTelegramModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
