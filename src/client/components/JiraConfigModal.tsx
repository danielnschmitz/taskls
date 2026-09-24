import React, { useState, useEffect } from 'react';
import {
  X,
  Settings2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Plus,
  Trash2,
  ExternalLink,
  ShieldCheck,
  CheckSquare,
  Square,
  RotateCw,
} from 'lucide-react';
import { JiraConfig } from '../types';

interface JiraConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

const DEFAULT_POSSIBLE_STATUSES = [
  'Resolvido',
  'Validação técnica',
  'Aberto',
  'Pronto p/ fazer',
  'Desenvolvimento',
  'Deploy HML',
  'Teste de Aceitação',
  'Deploy',
  'Documentação',
  'Concluído',
  'Em produção',
  'Cancelado',
  'Desativado',
];

const DEFAULT_IGNORED_FIELDS = [
  'Classificação',
  '[BI] Priorizado',
  'labels',
  'IssueParentAssociation',
  'Link',
  'Attachment',
  '[BI] Desenvolvedor',
  '[BI] Desenvolvimento',
  '[BI] Finalizado',
];

export const JiraConfigModal: React.FC<JiraConfigModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  onShowToast,
}) => {
  if (!isOpen) return null;

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const [domain, setDomain] = useState('sysmiddle.atlassian.net');
  const [email, setEmail] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [hasExistingToken, setHasExistingToken] = useState(false);
  const [projects, setProjects] = useState<string[]>(['NEO', 'ESM']);
  const [newProjectInput, setNewProjectInput] = useState('');
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([...DEFAULT_POSSIBLE_STATUSES]);
  const [allPossibleStatuses, setAllPossibleStatuses] = useState<string[]>([...DEFAULT_POSSIBLE_STATUSES]);
  const [ignoredFields, setIgnoredFields] = useState<string[]>([...DEFAULT_IGNORED_FIELDS]);
  const [newIgnoredFieldInput, setNewIgnoredFieldInput] = useState('');

  // Load existing settings on modal open
  useEffect(() => {
    setIsLoading(true);
    setTestResult(null);
    fetch('/api/jira/settings')
      .then((res) => res.json())
      .then((data: JiraConfig) => {
        if (data.domain) setDomain(data.domain);
        if (data.email) setEmail(data.email);
        if (data.projects) setProjects(data.projects);
        if (data.statuses) setSelectedStatuses(data.statuses);
        if (data.hasApiToken) setHasExistingToken(true);
        if (data.allPossibleStatuses && data.allPossibleStatuses.length > 0) {
          setAllPossibleStatuses(data.allPossibleStatuses);
        }
        if (data.ignored_fields && Array.isArray(data.ignored_fields)) {
          setIgnoredFields(data.ignored_fields);
        }
      })
      .catch((err) => {
        console.error('Erro ao carregar configurações do Jira:', err);
        onShowToast('Falha ao carregar configurações do Jira', 'error');
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [isOpen]);

  // Add project tag
  const handleAddProject = () => {
    const raw = newProjectInput.trim();
    if (!raw) return;

    // Support comma-separated input
    const parts = raw.split(/[,;\s]+/).map((p) => p.trim().toUpperCase()).filter(Boolean);
    const updated = Array.from(new Set([...projects, ...parts]));
    setProjects(updated);
    setNewProjectInput('');
  };

  // Remove project tag
  const handleRemoveProject = (projToRemove: string) => {
    setProjects(projects.filter((p) => p !== projToRemove));
  };

  // Handlers para campos ignorados nas revisões
  const handleAddIgnoredField = () => {
    const raw = newIgnoredFieldInput.trim();
    if (!raw) return;
    if (!ignoredFields.some((f) => f.toLowerCase() === raw.toLowerCase())) {
      setIgnoredFields([...ignoredFields, raw]);
    }
    setNewIgnoredFieldInput('');
  };

  const handleRemoveIgnoredField = (fieldToRemove: string) => {
    setIgnoredFields(ignoredFields.filter((f) => f !== fieldToRemove));
  };

  const handleResetIgnoredFields = () => {
    setIgnoredFields([...DEFAULT_IGNORED_FIELDS]);
  };

  // Toggle status selection
  const handleToggleStatus = (status: string) => {
    if (selectedStatuses.includes(status)) {
      setSelectedStatuses(selectedStatuses.filter((s) => s !== status));
    } else {
      setSelectedStatuses([...selectedStatuses, status]);
    }
  };

  // Select/Deselect All Statuses
  const handleSelectAllStatuses = () => {
    setSelectedStatuses([...allPossibleStatuses]);
  };

  const handleDeselectAllStatuses = () => {
    setSelectedStatuses([]);
  };

  // Test Jira Connection
  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/jira/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: domain.trim(),
          email: email.trim(),
          api_token: apiToken.trim() || undefined,
        }),
      });
      const data = await res.json();
      setTestResult(data);
      if (data.success) {
        onShowToast('Conexão com o Jira validada com sucesso!', 'success');
      } else {
        onShowToast(data.message || 'Falha ao conectar com o Jira', 'error');
      }
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || 'Erro de rede ao testar conexão' });
      onShowToast('Erro de rede ao conectar com o Jira', 'error');
    } finally {
      setIsTesting(false);
    }
  };

  // Save Settings
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (projects.length === 0) {
      onShowToast('Configure ao menos um código de projeto do Jira (ex: NEO).', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const payload: any = {
        domain: domain.trim(),
        email: email.trim(),
        projects,
        statuses: selectedStatuses,
        ignored_fields: ignoredFields,
      };

      if (apiToken.trim()) {
        payload.api_token = apiToken.trim();
      }

      const res = await fetch('/api/jira/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('Falha ao salvar configurações do Jira');

      onShowToast('Configurações do Jira salvas com sucesso!', 'success');
      onSaved();
      onClose();
    } catch (err: any) {
      console.error(err);
      onShowToast(err.message || 'Erro ao salvar configurações do Jira', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col bg-white dark:bg-[#0d1424] border border-slate-200 dark:border-slate-700/80 rounded-2xl shadow-2xl shadow-slate-900/20 dark:shadow-black/80 overflow-hidden transition-colors">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
              <Settings2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800 dark:text-white tracking-tight">
                Configurações da Integração Jira
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Gerencie projetos, credenciais de acesso e status visíveis no painel
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        {isLoading ? (
          <div className="p-12 flex flex-col items-center justify-center text-slate-400 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            <span className="text-xs font-medium">Carregando configurações...</span>
          </div>
        ) : (
          <form onSubmit={handleSave} className="p-6 overflow-y-auto space-y-6 custom-scrollbar flex-1">
            {/* Section 1: Projetos Considerados */}
            <div className="space-y-3">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">
                1. Chaves dos Projetos Jira <span className="text-rose-500 dark:text-rose-400">*</span>
              </label>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Apenas as demandas com data de entrega associadas a estes projetos serão exibidas no painel (ex: NEO, ESM).
              </p>

              {/* Badges of current projects */}
              <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 min-h-[46px]">
                {projects.length === 0 ? (
                  <span className="text-xs text-slate-400 dark:text-slate-500 italic">Nenhum projeto adicionado. Adicione abaixo.</span>
                ) : (
                  projects.map((proj) => (
                    <span
                      key={proj}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/40 text-xs font-bold shadow-sm"
                    >
                      {proj}
                      <button
                        type="button"
                        onClick={() => handleRemoveProject(proj)}
                        className="hover:text-rose-500 dark:hover:text-rose-400 transition-colors"
                        title={`Remover projeto ${proj}`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  ))
                )}
              </div>

              {/* Add Project Input */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Ex: NEO, ESM (digite a chave e clique Adicionar)"
                  value={newProjectInput}
                  onChange={(e) => setNewProjectInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddProject();
                    }
                  }}
                  className="flex-1 px-3 py-2 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="button"
                  onClick={handleAddProject}
                  className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md shadow-indigo-600/20"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Adicionar</span>
                </button>
              </div>
            </div>

            {/* Section 2: Filtro de Status Visíveis */}
            <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800/80">
              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">
                    2. Status Exibidos no Painel
                  </label>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Selecione quais status devem ser incluídos no quadro semanal. Demandas desmarcadas não aparecerão.
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={handleSelectAllStatuses}
                    className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium"
                  >
                    Marcar Todos
                  </button>
                  <span className="text-slate-400 dark:text-slate-600">&bull;</span>
                  <button
                    type="button"
                    onClick={handleDeselectAllStatuses}
                    className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 font-medium"
                  >
                    Desmarcar Todos
                  </button>
                </div>
              </div>

              {/* Status checkboxes grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 max-h-56 overflow-y-auto custom-scrollbar">
                {allPossibleStatuses.map((st) => {
                  const isChecked = selectedStatuses.includes(st);
                  const isSpecialNeoDeploy = st === 'Deploy HML';
                  const isSpecialNeoTeste = st === 'Teste de Aceitação';

                  return (
                    <label
                      key={st}
                      onClick={() => handleToggleStatus(st)}
                      className={`flex items-start gap-2.5 p-2 rounded-lg border text-xs cursor-pointer transition-all ${
                        isChecked
                          ? 'bg-white dark:bg-slate-900/90 border-indigo-400 dark:border-indigo-500/40 text-slate-800 dark:text-slate-200 shadow-sm'
                          : 'bg-slate-100/50 dark:bg-slate-950/40 border-slate-200 dark:border-slate-800/60 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400'
                      }`}
                    >
                      <div className="mt-0.5 flex-shrink-0 text-indigo-600 dark:text-indigo-400">
                        {isChecked ? (
                          <CheckSquare className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-400 dark:text-slate-600" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <span className={`font-semibold ${isChecked ? 'text-slate-800 dark:text-slate-200' : 'text-slate-500'}`}>
                          {st}
                        </span>
                        {isSpecialNeoDeploy && (
                          <span className="block text-[10px] text-amber-600 dark:text-amber-400/90 font-medium">
                            ↳ No projeto NEO: "Validação Diária"
                          </span>
                        )}
                        {isSpecialNeoTeste && (
                          <span className="block text-[10px] text-purple-600 dark:text-purple-400/90 font-medium">
                            ↳ No projeto NEO: "Validação Histórica"
                          </span>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
              <p className="text-[11px] text-slate-500">
                {selectedStatuses.length} de {allPossibleStatuses.length} status selecionados.
              </p>
            </div>

            {/* Section 3: Credenciais de Acesso */}
            <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800/80">
              <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                3. Acesso à API do Jira Cloud
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Domínio */}
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Domínio Atlassian
                  </label>
                  <input
                    type="text"
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                    placeholder="sysmiddle.atlassian.net"
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    E-mail da Conta
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="daniel.schmitz@sysmiddle.com.br"
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>
              </div>

              {/* API Token */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                    Token de API Atlassian
                  </label>
                  {hasExistingToken && (
                    <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Token já configurado no servidor
                    </span>
                  )}
                </div>
                <input
                  type="password"
                  value={apiToken}
                  onChange={(e) => setApiToken(e.target.value)}
                  placeholder={
                    hasExistingToken
                      ? '•••••••••••••••••••••••••••••••• (Deixe em branco para manter atual)'
                      : 'Cole seu token de API gerado na Atlassian'
                  }
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              {/* Test Connection Button & Result */}
              <div className="pt-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={isTesting}
                  className="px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-300 dark:border-slate-700 text-xs font-semibold flex items-center gap-2 transition-all"
                >
                  {isTesting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500 dark:text-blue-400" />
                  ) : (
                    <RotateCw className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
                  )}
                  <span>Testar Conexão com Jira</span>
                </button>

                {testResult && (
                  <div
                    className={`text-xs font-semibold flex items-center gap-1.5 px-3 py-1 rounded-lg border ${
                      testResult.success
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-300'
                        : 'bg-rose-50 dark:bg-rose-950/60 border-rose-300 dark:border-rose-500/40 text-rose-700 dark:text-rose-300'
                    }`}
                  >
                    {testResult.success ? (
                      <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 text-emerald-500 dark:text-emerald-400" />
                    ) : (
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 text-rose-500 dark:text-rose-400" />
                    )}
                    <span className="line-clamp-1">{testResult.message}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Section 4: Campos Desconsiderados nas Revisões */}
            <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800/80">
              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                    4. Campos Desconsiderados nas Revisões
                  </label>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Alterações nesses campos no Jira não aparecerão no painel de revisões e as pendências existentes deles serão limpas.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleResetIgnoredFields}
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium whitespace-nowrap"
                  title="Restaurar a lista padrão recomendada"
                >
                  Restaurar Padrões
                </button>
              </div>

              {/* Badges dos campos ignorados */}
              <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-xl bg-slate-100/70 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 min-h-[46px]">
                {ignoredFields.length === 0 ? (
                  <span className="text-xs text-slate-400 dark:text-slate-500 italic">Nenhum campo desconsiderado. Todas as alterações serão notificadas.</span>
                ) : (
                  ignoredFields.map((field) => (
                    <span
                      key={field}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800/90 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 text-xs font-medium shadow-sm hover:border-slate-400 dark:hover:border-slate-600 transition-colors"
                    >
                      <span>{field}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveIgnoredField(field)}
                        className="hover:text-rose-500 text-slate-400 transition-colors"
                        title={`Remover ${field} da lista de desconsiderados`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  ))
                )}
              </div>

              {/* Input para adicionar novo campo */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Nome do campo no Jira (ex: labels, Classificação, [BI] Priorizado)"
                  value={newIgnoredFieldInput}
                  onChange={(e) => setNewIgnoredFieldInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddIgnoredField();
                    }
                  }}
                  className="flex-1 px-3 py-2 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="button"
                  onClick={handleAddIgnoredField}
                  className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-white text-xs font-semibold flex items-center gap-1.5 transition-all border border-slate-300 dark:border-slate-700"
                >
                  <Plus className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
                  <span>Adicionar</span>
                </button>
              </div>
            </div>

            {/* Modal Footer Actions */}
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl transition-all"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-5 py-2 text-xs font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 rounded-xl shadow-lg shadow-indigo-600/30 flex items-center gap-2 transition-all disabled:opacity-50"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Salvando...</span>
                  </>
                ) : (
                  <span>Salvar Configurações</span>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
