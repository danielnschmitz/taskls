import React, { useState, useEffect } from 'react';
import {
  X,
  Settings2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Plus,
  Trash2,
  Copy,
  ExternalLink,
  ShieldCheck,
  Server,
  HelpCircle,
  Radio,
  RefreshCw,
  Filter,
} from 'lucide-react';
import { GoogleChatConfig, GoogleChatSpaceConfig } from '../types';

interface IntegrationConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const IntegrationConfigModal: React.FC<IntegrationConfigModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  onShowToast,
}) => {
  if (!isOpen) return null;

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; email?: string } | null>(null);

  // States
  const [serviceAccountJson, setServiceAccountJson] = useState('');
  const [hasExistingKey, setHasExistingKey] = useState(false);
  const [serviceAccountEmail, setServiceAccountEmail] = useState<string | undefined>();
  const [spaces, setSpaces] = useState<GoogleChatSpaceConfig[]>([]);
  const [newSpaceId, setNewSpaceId] = useState('');
  const [newSpaceName, setNewSpaceName] = useState('');
  const [pollIntervalMinutes, setPollIntervalMinutes] = useState(5);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(true);
  const [filterMode, setFilterMode] = useState<'all' | 'errors_only'>('errors_only');
  const [filterKeywords, setFilterKeywords] = useState<string[]>([]);
  const [newFilterKeyword, setNewFilterKeyword] = useState('');
  const [ignoredKeywords, setIgnoredKeywords] = useState<string[]>([]);
  const [newIgnoredKeyword, setNewIgnoredKeyword] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [isWebhookCopied, setIsWebhookCopied] = useState(false);

  // Carregar configurações existentes ao abrir
  useEffect(() => {
    setIsLoading(true);
    setTestResult(null);
    fetch('/api/integrations/settings')
      .then((res) => {
        if (!res.ok) throw new Error('Falha ao carregar configurações');
        return res.json();
      })
      .then((data: GoogleChatConfig) => {
        setHasExistingKey(Boolean(data.hasServiceAccount));
        setServiceAccountEmail(data.serviceAccountEmail);
        setSpaces(data.spaces || []);
        setPollIntervalMinutes(data.pollIntervalMinutes || 5);
        setAutoSyncEnabled(data.autoSyncEnabled !== false);
        setFilterMode(data.filterMode || 'errors_only');
        setFilterKeywords(data.filterKeywords || []);
        setIgnoredKeywords(data.ignoredKeywords || []);
        if (data.webhookUrl) setWebhookUrl(data.webhookUrl);
      })
      .catch((err) => {
        console.error(err);
        onShowToast('Falha ao carregar configurações de integração', 'error');
      })
      .finally(() => setIsLoading(false));
  }, [onShowToast]);

  // Salvar configurações
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const payload: any = {
        spaces,
        poll_interval_minutes: Number(pollIntervalMinutes) || 5,
        auto_sync_enabled: autoSyncEnabled,
        filter_mode: filterMode,
        filter_keywords: filterKeywords,
        ignored_keywords: ignoredKeywords,
      };

      if (serviceAccountJson.trim()) {
        payload.service_account_key = serviceAccountJson.trim();
      }

      const res = await fetch('/api/integrations/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Erro ao salvar configurações');
      }

      onShowToast('Configurações salvas com sucesso!', 'success');
      onSaved();
      onClose();
    } catch (err: any) {
      onShowToast(err.message || 'Falha ao salvar configurações', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Testar conexão com a API do Google Chat
  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/integrations/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_account_key: serviceAccountJson.trim() || undefined,
          test_space_id: spaces.length > 0 ? spaces[0].id : undefined,
        }),
      });

      const data = await res.json();
      setTestResult(data);
      if (data.success) {
        onShowToast('Conexão com Google Chat validada com sucesso!', 'success');
      } else {
        onShowToast('Falha no teste de conexão com o Google Chat.', 'error');
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Erro de rede ao testar conexão',
      });
      onShowToast('Erro ao testar conexão', 'error');
    } finally {
      setIsTesting(false);
    }
  };

  // Adicionar espaço
  const handleAddSpace = () => {
    if (!newSpaceId.trim()) return;
    const formattedId = newSpaceId.trim().startsWith('spaces/')
      ? newSpaceId.trim()
      : `spaces/${newSpaceId.trim()}`;

    // Evita duplicatas
    if (spaces.some((s) => s.id === formattedId)) {
      onShowToast('Este grupo já está cadastrado na lista.', 'info');
      return;
    }

    setSpaces([
      ...spaces,
      {
        id: formattedId,
        name: newSpaceName.trim() || formattedId,
      },
    ]);
    setNewSpaceId('');
    setNewSpaceName('');
  };

  // Remover espaço
  const handleRemoveSpace = (id: string) => {
    setSpaces(spaces.filter((s) => s.id !== id));
  };

  // Adicionar palavra-chave de filtro
  const handleAddFilterKeyword = () => {
    if (!newFilterKeyword.trim()) return;
    const kw = newFilterKeyword.trim().toLowerCase();
    if (!filterKeywords.includes(kw)) {
      setFilterKeywords([...filterKeywords, kw]);
    }
    setNewFilterKeyword('');
  };

  // Remover palavra-chave de filtro
  const handleRemoveFilterKeyword = (kw: string) => {
    setFilterKeywords(filterKeywords.filter((k) => k !== kw));
  };

  // Adicionar palavra-chave ignorada
  const handleAddIgnoredKeyword = () => {
    if (!newIgnoredKeyword.trim()) return;
    const kw = newIgnoredKeyword.trim().toLowerCase();
    if (!ignoredKeywords.includes(kw)) {
      setIgnoredKeywords([...ignoredKeywords, kw]);
    }
    setNewIgnoredKeyword('');
  };

  // Remover palavra-chave ignorada
  const handleRemoveIgnoredKeyword = (kw: string) => {
    setIgnoredKeywords(ignoredKeywords.filter((k) => k !== kw));
  };

  const copyWebhook = () => {
    if (!webhookUrl) return;
    navigator.clipboard.writeText(webhookUrl);
    setIsWebhookCopied(true);
    onShowToast('URL do webhook copiada!', 'success');
    setTimeout(() => setIsWebhookCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-[#0c1222] border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-600/20 border border-indigo-200 dark:border-indigo-500/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800 dark:text-white">
                Configurações de Monitoramento de Integrações
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Integração com Google Chat (Service Account) e Webhooks de Alertas
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          {isLoading ? (
            <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-500">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
              <p className="font-medium">Carregando configurações...</p>
            </div>
          ) : (
            <>
              {/* Seção 1: Credenciais Google Service Account */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                    <span>1. Credenciais da Service Account (Google Cloud)</span>
                    {hasExistingKey && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300">
                        <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                        Ativa
                        {serviceAccountEmail && ` (${serviceAccountEmail})`}
                      </span>
                    )}
                  </label>
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={isTesting || (!hasExistingKey && !serviceAccountJson.trim())}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-[11px] disabled:opacity-50 transition-colors"
                  >
                    <RefreshCw className={`w-3 h-3 ${isTesting ? 'animate-spin' : ''}`} />
                    <span>{isTesting ? 'Testando...' : 'Testar Conexão'}</span>
                  </button>
                </div>

                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Cole o conteúdo do arquivo JSON da chave da Service Account baixado no console do Google Cloud. A Service Account deve ter a API do Google Chat ativada e ter sido adicionada aos grupos.
                </p>

                <textarea
                  value={serviceAccountJson}
                  onChange={(e) => setServiceAccountJson(e.target.value)}
                  placeholder={
                    hasExistingKey
                      ? 'Chave configurada. Deixe em branco para manter a atual ou cole um novo JSON para substituir.'
                      : 'Cole o JSON da Service Account aqui...'
                  }
                  rows={4}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900/60 font-mono text-[11px] text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                />

                {testResult && (
                  <div
                    className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
                      testResult.success
                        ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                        : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
                    }`}
                  >
                    {testResult.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
                    )}
                    <div>
                      <p className="font-semibold">{testResult.success ? 'Sucesso!' : 'Atenção / Erro'}</p>
                      <p className="text-[11px] opacity-90 mt-0.5">{testResult.message}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Seção 2: Grupos / Spaces do Google Chat */}
              <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800/80">
                <label className="font-bold text-slate-700 dark:text-slate-200 flex items-center justify-between">
                  <span>2. Grupos do Google Chat para Monitoramento</span>
                  <span className="text-[11px] font-normal text-slate-400">
                    {spaces.length} {spaces.length === 1 ? 'grupo configurado' : 'grupos configurados'}
                  </span>
                </label>

                {/* Formulário para adicionar grupo */}
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={newSpaceId}
                    onChange={(e) => setNewSpaceId(e.target.value)}
                    placeholder="ID do Grupo (ex: spaces/AAAA12345 ou AAAA12345)"
                    className="flex-1 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900/60 text-slate-800 dark:text-slate-200 font-mono text-[11px]"
                  />
                  <input
                    type="text"
                    value={newSpaceName}
                    onChange={(e) => setNewSpaceName(e.target.value)}
                    placeholder="Nome amigável (ex: Alertas Neogrid)"
                    className="sm:w-52 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900/60 text-slate-800 dark:text-slate-200 text-[11px]"
                  />
                  <button
                    type="button"
                    onClick={handleAddSpace}
                    disabled={!newSpaceId.trim()}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs shadow-sm transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Adicionar</span>
                  </button>
                </div>

                {/* Lista de grupos cadastrados */}
                {spaces.length === 0 ? (
                  <p className="text-slate-400 italic text-[11px] py-1">
                    Nenhum grupo configurado ainda. Adicione o ID do grupo acima.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {spaces.map((sp) => (
                      <div
                        key={sp.id}
                        className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-800 dark:text-slate-200">{sp.name}</span>
                          <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500 bg-slate-200/60 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                            {sp.id}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveSpace(sp.id)}
                          className="p-1 rounded text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                          title="Remover grupo"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Seção 3: Modo de Filtro e Regras de Alertas */}
              <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800/80">
                <label className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                  <Filter className="w-4 h-4 text-indigo-500" />
                  <span>3. Filtros e Critérios de Revisão</span>
                </label>

                {/* Seletor de Modo */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFilterMode('errors_only')}
                    className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition-all ${
                      filterMode === 'errors_only'
                        ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/30 font-semibold text-indigo-900 dark:text-indigo-200 shadow-sm'
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          filterMode === 'errors_only' ? 'bg-indigo-600 dark:bg-indigo-400' : 'bg-slate-300'
                        }`}
                      ></span>
                      Apenas Alertas e Erros (Recomendado)
                    </span>
                    <span className="text-[10px] opacity-75 font-normal">
                      Ignora notificações rotineiras (ex: "execução iniciada", "sucesso") e gera cards apenas para falhas.
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFilterMode('all')}
                    className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition-all ${
                      filterMode === 'all'
                        ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/30 font-semibold text-indigo-900 dark:text-indigo-200 shadow-sm'
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          filterMode === 'all' ? 'bg-indigo-600 dark:bg-indigo-400' : 'bg-slate-300'
                        }`}
                      ></span>
                      Todas as Mensagens
                    </span>
                    <span className="text-[10px] opacity-75 font-normal">
                      Cria um card de revisão para absolutamente qualquer mensagem postada nos grupos.
                    </span>
                  </button>
                </div>

                {/* Palavras-chave de Erro */}
                {filterMode === 'errors_only' && (
                  <div className="space-y-2 pt-2">
                    <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                      Termos que identificam Erros / Alertas:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {filterKeywords.map((kw) => (
                        <span
                          key={kw}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800"
                        >
                          {kw}
                          <button
                            type="button"
                            onClick={() => handleRemoveFilterKeyword(kw)}
                            className="hover:text-rose-900"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>

                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newFilterKeyword}
                        onChange={(e) => setNewFilterKeyword(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddFilterKeyword())}
                        placeholder="Adicionar termo de erro (ex: timeout, falha fatal)..."
                        className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900/60 text-[11px]"
                      />
                      <button
                        type="button"
                        onClick={handleAddFilterKeyword}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold"
                      >
                        Adicionar
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Seção 4: Webhook Alternativo */}
              <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800/80">
                <label className="font-bold text-slate-700 dark:text-slate-200 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Radio className="w-3.5 h-3.5 text-emerald-500" />
                    4. Webhook HTTP Público (Opcional / Alternativo)
                  </span>
                </label>

                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Caso prefira receber alertas via webhook disparados diretamente pelo Google Chat Bot ou scripts externos:
                </p>

                <div className="flex items-center gap-2 p-2 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                  <code className="flex-1 font-mono text-[11px] text-slate-700 dark:text-slate-300 truncate">
                    {webhookUrl || '/api/integrations/webhook'}
                  </code>
                  <button
                    type="button"
                    onClick={copyWebhook}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 text-slate-700 dark:text-slate-300 font-semibold"
                  >
                    {isWebhookCopied ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>{isWebhookCopied ? 'Copiado!' : 'Copiar'}</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-xs transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md shadow-indigo-600/20 disabled:opacity-50 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
            <span>{isSaving ? 'Salvando...' : 'Salvar Configurações'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
