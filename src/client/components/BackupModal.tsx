import React, { useState, useRef } from 'react';
import {
  X,
  Database,
  Download,
  Upload,
  FileSpreadsheet,
  FileJson,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
} from 'lucide-react';

interface BackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const BackupModal: React.FC<BackupModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  onShowToast,
}) => {
  if (!isOpen) return null;

  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<any | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleExportJson = () => {
    const token = localStorage.getItem('taskls_auth_token');
    const query = token ? `?token=${encodeURIComponent(token)}` : '';
    window.location.href = `/api/backup/export${query}`;
    onShowToast('Download do backup JSON iniciado com sucesso!', 'success');
  };

  const handleExportCsv = () => {
    const token = localStorage.getItem('taskls_auth_token');
    const query = token ? `?token=${encodeURIComponent(token)}` : '';
    window.location.href = `/api/backup/export/csv${query}`;
    onShowToast('Download da planilha CSV iniciado com sucesso!', 'success');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.json')) {
      setErrorMsg('Por favor, selecione um arquivo válido .json');
      setSelectedFile(null);
      setFilePreview(null);
      return;
    }

    setSelectedFile(file);
    setErrorMsg('');

    // Read and preview
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (!parsed.tasks || !Array.isArray(parsed.tasks)) {
          setErrorMsg('O arquivo JSON não contém uma lista de tarefas válida.');
          setFilePreview(null);
          return;
        }
        setFilePreview(parsed);
      } catch (err) {
        setErrorMsg('Falha ao ler arquivo JSON: conteúdo corrompido ou inválido.');
        setFilePreview(null);
      }
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!filePreview) {
      setErrorMsg('Selecione um arquivo de backup antes de importar.');
      return;
    }

    setIsImporting(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/backup/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: importMode,
          data: filePreview,
        }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Falha ao importar dados');

      onShowToast(
        `Backup restaurado com sucesso! ${result.count} tarefas processadas.`,
        'success'
      );
      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao importar backup');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-xl bg-white dark:bg-[#0d1424] border border-slate-200 dark:border-slate-700/80 rounded-2xl shadow-2xl shadow-slate-900/20 dark:shadow-black/80 overflow-hidden my-8 transition-colors">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800/80 flex items-center justify-between bg-slate-50/80 dark:bg-slate-900/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800 dark:text-white tracking-tight">
                Backup, Exportação & Restauração
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Exporte todos os seus dados em 1 clique ou restaure backups anteriores.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-800 dark:text-rose-400 text-xs font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Export Section */}
          <div>
            <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2.5">
              1. Exportar Dados (1 Clique)
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleExportJson}
                className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/80 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/80 text-left flex items-start gap-3 transition-all hover:border-emerald-500/40 group"
              >
                <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center text-emerald-600 dark:text-emerald-400 group-hover:scale-105 transition-transform">
                  <FileJson className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-800 dark:text-white flex items-center gap-1">
                    <span>Backup Completo</span>
                    <Download className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Arquivo JSON com tarefas, conclusões e categorias para restauração.
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={handleExportCsv}
                className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/80 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/80 text-left flex items-start gap-3 transition-all hover:border-cyan-500/40 group"
              >
                <div className="w-8 h-8 rounded-lg bg-cyan-500/15 border border-cyan-500/25 flex items-center justify-center text-cyan-600 dark:text-cyan-400 group-hover:scale-105 transition-transform">
                  <FileSpreadsheet className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-800 dark:text-white flex items-center gap-1">
                    <span>Planilha Excel / CSV</span>
                    <Download className="w-3 h-3 text-cyan-600 dark:text-cyan-400" />
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Tabela legível para Excel, Google Sheets ou relatórios.
                  </p>
                </div>
              </button>
            </div>
          </div>

          {/* Import Section */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
            <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2.5">
              2. Restaurar / Importar Backup JSON (1 Clique)
            </h4>

            {/* Hidden input */}
            <input
              type="file"
              ref={fileInputRef}
              accept=".json"
              onChange={handleFileChange}
              className="hidden"
            />

            {/* Drop zone / button */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className={`p-5 rounded-xl border-2 border-dashed text-center cursor-pointer transition-all ${
                selectedFile
                  ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-400 dark:border-emerald-500/40 text-emerald-800 dark:text-emerald-300'
                  : 'bg-slate-50/80 dark:bg-slate-950/50 border-slate-300 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-500/50 hover:bg-indigo-50/30 dark:hover:bg-indigo-950/10 text-slate-500 dark:text-slate-400'
              }`}
            >
              <Upload className="w-6 h-6 mx-auto mb-2 text-indigo-600 dark:text-indigo-400" />
              {selectedFile ? (
                <div>
                  <p className="text-xs font-bold text-slate-800 dark:text-white">{selectedFile.name}</p>
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-1">
                    {filePreview?.tasks?.length || 0} tarefas prontas para importação. Clique para trocar de arquivo.
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Clique aqui para selecionar o arquivo JSON de backup
                  </p>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                    Arquivos no formato taskls-backup-*.json
                  </p>
                </div>
              )}
            </div>

            {/* Import Mode Options */}
            {filePreview && (
              <div className="mt-4 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-2">
                <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block">
                  Modo de Restauração:
                </span>
                
                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700 dark:text-slate-300">
                  <input
                    type="radio"
                    name="importMode"
                    value="merge"
                    checked={importMode === 'merge'}
                    onChange={() => setImportMode('merge')}
                    className="accent-indigo-500"
                  />
                  <span>
                    <strong>Mesclar:</strong> Mantém tarefas atuais e adiciona/atualiza as do backup (Recomendado).
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700 dark:text-slate-300">
                  <input
                    type="radio"
                    name="importMode"
                    value="replace"
                    checked={importMode === 'replace'}
                    onChange={() => setImportMode('replace')}
                    className="accent-rose-500"
                  />
                  <span className="text-rose-700 dark:text-rose-300">
                    <strong>Substituir tudo:</strong> Limpa o banco atual e restaura exatamente o arquivo.
                  </span>
                </label>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800/80 bg-slate-50/80 dark:bg-slate-900/40 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-all"
          >
            Fechar
          </button>

          {filePreview && (
            <button
              type="button"
              disabled={isImporting}
              onClick={handleImport}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/30 transition-all disabled:opacity-50"
            >
              {isImporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Restaurando...</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  <span>Restaurar Backup Agora</span>
                </>
              )}
            </button>
          )}
        </div>

      </div>
    </div>
  );
};
