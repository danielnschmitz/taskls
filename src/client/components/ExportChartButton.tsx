import React, { useState } from 'react';
import { Camera, Download, Loader2 } from 'lucide-react';
import { exportElementToJpg } from '../utils/chartExport';

export interface ExportChartButtonProps {
  /** Referência direta ao elemento DOM (card ou SVG) */
  targetRef?: React.RefObject<HTMLElement | null>;
  /** ID do elemento DOM caso não utilize ref */
  targetId?: string;
  /** Nome base do arquivo baixado (sem extensão .jpg) */
  fileName: string;
  /** Rótulo textual opcional do botão */
  label?: string;
  /** Modo de exibição: 'button' com texto, 'compact' pequeno ou 'icon' apenas ícone */
  variant?: 'button' | 'compact' | 'icon';
  /** Classes CSS adicionais */
  className?: string;
  /** Callback para exibir mensagem toast */
  onShowToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const ExportChartButton: React.FC<ExportChartButtonProps> = ({
  targetRef,
  targetId,
  fileName,
  label = 'Exportar JPG',
  variant = 'compact',
  className = '',
  onShowToast,
}) => {
  const [isExporting, setIsExporting] = useState<boolean>(false);

  const handleExport = async (e: React.MouseEvent) => {
    e.stopPropagation();

    let element: HTMLElement | null = null;
    if (targetRef && targetRef.current) {
      element = targetRef.current;
    } else if (targetId) {
      element = document.getElementById(targetId);
    }

    if (!element) {
      console.warn('[ExportChartButton] Elemento alvo não encontrado para exportação:', { targetId, targetRef });
      onShowToast?.('Erro ao identificar o gráfico para exportação.', 'error');
      return;
    }

    setIsExporting(true);
    try {
      await exportElementToJpg(element, { fileName });
      onShowToast?.(`Gráfico "${fileName}" exportado como JPG com sucesso!`, 'success');
    } catch (err: any) {
      console.error('[ExportChartButton] Falha ao exportar:', err);
      onShowToast?.('Não foi possível gerar a imagem do gráfico.', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const baseClasses =
    'inline-flex items-center justify-center gap-1.5 transition-all cursor-pointer font-medium disabled:opacity-50 disabled:cursor-not-allowed select-none focus:outline-none';

  if (variant === 'icon') {
    return (
      <button
        type="button"
        data-export-ignore="true"
        onClick={handleExport}
        disabled={isExporting}
        title="Exportar gráfico como JPG"
        className={`${baseClasses} p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:text-slate-900 dark:hover:text-white shadow-xs ${className}`}
      >
        {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500" /> : <Camera className="w-3.5 h-3.5" />}
      </button>
    );
  }

  if (variant === 'compact') {
    return (
      <button
        type="button"
        data-export-ignore="true"
        onClick={handleExport}
        disabled={isExporting}
        title="Exportar gráfico como JPG"
        className={`${baseClasses} px-2.5 py-1 rounded-xl text-xs bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700/80 hover:text-slate-900 dark:hover:text-white shadow-xs ${className}`}
      >
        {isExporting ? <Loader2 className="w-3 h-3 animate-spin text-indigo-500" /> : <Camera className="w-3 h-3 text-slate-500 dark:text-slate-400" />}
        <span className="font-semibold text-[11px]">JPG</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      data-export-ignore="true"
      onClick={handleExport}
      disabled={isExporting}
      title="Exportar gráfico como JPG"
      className={`${baseClasses} px-3 py-1.5 rounded-xl text-xs bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:text-slate-900 dark:hover:text-white shadow-xs font-semibold ${className}`}
    >
      {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500" /> : <Download className="w-3.5 h-3.5 text-indigo-500" />}
      <span>{label}</span>
    </button>
  );
};
