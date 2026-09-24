import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  SkipForward,
  Timer,
  X,
  Volume2,
  Sparkles,
  ChevronDown,
} from 'lucide-react';
import { Task } from '../types';

interface PomodoroTimerProps {
  tasks: Task[];
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

type Mode = 'focus' | 'shortBreak' | 'longBreak';

const MODE_TIMES: Record<Mode, number> = {
  focus: 25 * 60,
  shortBreak: 5 * 60,
  longBreak: 15 * 60,
};

const MODE_LABELS: Record<Mode, string> = {
  focus: 'Foco Total (25m)',
  shortBreak: 'Pausa Curta (5m)',
  longBreak: 'Pausa Longa (15m)',
};

// Play audio chime using Web Audio API (zero external asset dependencies!)
function playCompletionChime() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const now = ctx.currentTime;
    
    // 3 pleasant harmonic chime tones
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.15);
      gain.gain.setValueAtTime(0.2, now + i * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.15 + 0.6);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.15);
      osc.stop(now + i * 0.15 + 0.6);
    });
  } catch {
    // Ignore audio context autoplay restrictions
  }
}

export const PomodoroTimer: React.FC<PomodoroTimerProps> = ({ tasks, onShowToast }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('focus');
  const [timeLeft, setTimeLeft] = useState(MODE_TIMES.focus);
  const [isRunning, setIsRunning] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string>('');
  const [completedSessions, setCompletedSessions] = useState(0);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Active selected task
  const activeTask = tasks.find((t) => t.id === selectedTaskId);

  // Countdown effect
  useEffect(() => {
    if (isRunning) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            handleTimerComplete();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRunning, mode, selectedTaskId, activeTask]);

  const handleTimerComplete = () => {
    setIsRunning(false);
    playCompletionChime();

    if (mode === 'focus') {
      const newCount = completedSessions + 1;
      setCompletedSessions(newCount);
      const nextMode = newCount % 4 === 0 ? 'longBreak' : 'shortBreak';
      setMode(nextMode);
      setTimeLeft(MODE_TIMES[nextMode]);

      // Fire Windows Toast
      fetch('/api/notifications/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: '🍅 Pomodoro Concluído!',
          message: activeTask
            ? `Parabéns! 25 minutos de foco dedicados a: "${activeTask.title}". Hora da sua pausa!`
            : 'Sessão de 25 minutos finalizada com sucesso. Aproveite sua pausa!',
        }),
      }).catch(() => {});

      onShowToast('🍅 Bloco de Foco concluído! Hora de descansar um pouco.', 'success');
    } else {
      setMode('focus');
      setTimeLeft(MODE_TIMES.focus);

      fetch('/api/notifications/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: '⚡ Pausa Concluída!',
          message: 'Hora de voltar ao foco. Selecione sua próxima tarefa e vamos lá!',
        }),
      }).catch(() => {});

      onShowToast('⚡ Pausa encerrada! Pronto para o próximo bloco de foco.', 'info');
    }
  };

  const handleModeChange = (newMode: Mode) => {
    setMode(newMode);
    setTimeLeft(MODE_TIMES[newMode]);
    setIsRunning(false);
  };

  const handleTogglePlay = () => {
    setIsRunning(!isRunning);
  };

  const handleReset = () => {
    setIsRunning(false);
    setTimeLeft(MODE_TIMES[mode]);
  };

  // Format MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const progressPercent =
    ((MODE_TIMES[mode] - timeLeft) / MODE_TIMES[mode]) * 100;

  return (
    <div className="relative">
      {/* Compact Trigger Button in Header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
          isRunning
            ? 'bg-rose-50 text-rose-600 border-rose-300 dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-500/40 shadow-sm shadow-rose-500/20 animate-pulse'
            : 'bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 border-slate-300 dark:bg-slate-900/80 dark:text-slate-300 dark:hover:text-white dark:border-slate-700/60 dark:hover:bg-slate-800'
        }`}
        title="Timer Pomodoro Integrado"
      >
        <span className="text-sm">🍅</span>
        <span className="font-mono font-bold">{formatTime(timeLeft)}</span>
        <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 hidden sm:inline">
          {mode === 'focus' ? 'Foco' : 'Pausa'}
        </span>
        <ChevronDown className="w-3 h-3 text-slate-400" />
      </button>

      {/* Popover Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white/98 dark:bg-[#0c1324] border border-slate-200 dark:border-slate-700/80 rounded-2xl shadow-2xl shadow-slate-200/50 dark:shadow-black/80 p-4 z-50 backdrop-blur-xl animate-in fade-in zoom-in-95 ring-1 ring-black/5 dark:ring-white/10">
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Timer className="w-4 h-4 text-rose-500 dark:text-rose-400" />
              <span className="text-xs font-bold text-slate-900 dark:text-white tracking-tight">
                Pomodoro & Foco
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/25">
                {completedSessions} {completedSessions === 1 ? 'bloco' : 'blocos'}
              </span>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Mode Selector Tabs */}
          <div className="mt-3.5 grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-100/80 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80">
            <button
              onClick={() => handleModeChange('focus')}
              className={`py-1 text-[11px] font-semibold rounded-lg transition-all ${
                mode === 'focus'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              Foco (25m)
            </button>
            <button
              onClick={() => handleModeChange('shortBreak')}
              className={`py-1 text-[11px] font-semibold rounded-lg transition-all ${
                mode === 'shortBreak'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              Pausa (5m)
            </button>
            <button
              onClick={() => handleModeChange('longBreak')}
              className={`py-1 text-[11px] font-semibold rounded-lg transition-all ${
                mode === 'longBreak'
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              Longa (15m)
            </button>
          </div>

          {/* Timer Display */}
          <div className="my-5 text-center">
            <div className="text-4xl font-extrabold font-mono tracking-tight text-slate-900 dark:text-white">
              {formatTime(timeLeft)}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-medium">
              {MODE_LABELS[mode]}
            </p>

            {/* Progress Bar */}
            <div className="w-full bg-slate-200 dark:bg-slate-800/80 h-1.5 rounded-full mt-3 overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  mode === 'focus'
                    ? 'bg-rose-500'
                    : mode === 'shortBreak'
                    ? 'bg-emerald-500'
                    : 'bg-cyan-500'
                }`}
                style={{ width: `${progressPercent}%` }}
              ></div>
            </div>
          </div>

          {/* Link to Task */}
          <div className="mb-4">
            <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
              Vincular a uma Tarefa:
            </label>
            <select
              value={selectedTaskId}
              onChange={(e) => setSelectedTaskId(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-200 text-xs focus:outline-none focus:border-rose-500 truncate"
            >
              <option value="">Sem tarefa vinculada (geral)</option>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              onClick={handleReset}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white dark:hover:bg-slate-800 transition-all"
              title="Reiniciar tempo"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <button
              onClick={handleTogglePlay}
              className={`px-6 py-2 rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg transition-all ${
                isRunning
                  ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-600/30'
                  : 'bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white shadow-rose-600/30'
              }`}
            >
              {isRunning ? (
                <>
                  <Pause className="w-4 h-4" />
                  <span>Pausar</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  <span>Iniciar Foco</span>
                </>
              )}
            </button>

            <button
              onClick={handleTimerComplete}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white dark:hover:bg-slate-800 transition-all"
              title="Avançar / Concluir"
            >
              <SkipForward className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
