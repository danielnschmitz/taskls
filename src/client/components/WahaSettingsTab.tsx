import React, { useState, useEffect, useCallback } from 'react';
import {
  MessageCircle,
  ShieldCheck,
  Eye,
  EyeOff,
  RotateCw,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Users,
  Plus,
  Trash2,
  Edit3,
  Save,
  Star,
  User,
  FileText,
} from 'lucide-react';
import { WahaConfig, WahaGroup, WahaTemplate } from '../types';

interface WahaSettingsTabProps {
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

const TEMPLATE_VARIABLES = [
  { key: '{{issueKey}}', label: 'Chave (ex: NEO-123)' },
  { key: '{{summary}}', label: 'Título do Card' },
  { key: '{{status}}', label: 'Status Atual' },
  { key: '{{industry}}', label: 'Indústria' },
  { key: '{{layout}}', label: 'Layout' },
  { key: '{{analistaResponsavel}}', label: 'Analista Responsável' },
  { key: '{{author}}', label: 'Autor' },
  { key: '{{changes}}', label: 'Lista de Alterações' },
  { key: '{{url}}', label: 'Link do Card' },
];

export const WahaSettingsTab: React.FC<WahaSettingsTabProps> = ({ onShowToast }) => {
  // Config WAHA
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const [baseUrl, setBaseUrl] = useState('http://localhost:3000');
  const [apiKey, setApiKey] = useState('');
  const [hasExistingKey, setHasExistingKey] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [session, setSession] = useState('default');
  const [defaultGroupId, setDefaultGroupId] = useState('');
  const [defaultGroupName, setDefaultGroupName] = useState('');
  const [jiraAuthorName, setJiraAuthorName] = useState('');

  // Grupos & Autores
  const [groups, setGroups] = useState<WahaGroup[]>([]);
  const [isLoadingGroups, setIsLoadingGroups] = useState(false);
  const [jiraAuthors, setJiraAuthors] = useState<string[]>([]);

  // Templates
  const [templates, setTemplates] = useState<WahaTemplate[]>([]);
  const [isSavingTemplates, setIsSavingTemplates] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [tplName, setTplName] = useState('');
  const [tplContent, setTplContent] = useState('');
  const [tplIsDefault, setTplIsDefault] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [cfgRes, tplRes, authorsRes] = await Promise.all([
        fetch('/api/waha/config'),
        fetch('/api/waha/templates'),
        fetch('/api/jira/events/authors?project=NEO'),
      ]);

      if (cfgRes.ok) {
        const cfg: WahaConfig = await cfgRes.json();
        setBaseUrl(cfg.baseUrl || 'http://localhost:3000');
        setSession(cfg.session || 'default');
        setDefaultGroupId(cfg.defaultGroupId || '');
        setDefaultGroupName(cfg.defaultGroupName || '');
        setJiraAuthorName(cfg.jiraAuthorName || '');
        setHasExistingKey(Boolean(cfg.hasApiKey));
        setApiKey('');
      }

      if (tplRes.ok) {
        const tplData = await tplRes.json();
        setTemplates(tplData.templates || []);
      }

      if (authorsRes.ok) {
        const authData = await authorsRes.json();
        setJiraAuthors(authData.authors || []);
      }
    } catch (err) {
      console.error('[WahaSettings] Erro ao carregar:', err);
      onShowToast('Erro ao carregar configurações do WAHA.', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [onShowToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setTestResult(null);
    try {
      const payload: Partial<WahaConfig> = {
        baseUrl: baseUrl.trim(),
        session: session.trim() || 'default',
        defaultGroupId: defaultGroupId.trim(),
        defaultGroupName: defaultGroupName.trim(),
        jiraAuthorName: jiraAuthorName.trim(),
      };
      if (apiKey.trim()) {
        payload.apiKey = apiKey.trim();
      }

      const res = await fetch('/api/waha/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao salvar');

      setHasExistingKey(Boolean(data.config?.hasApiKey));
      setApiKey('');
      onShowToast('Configurações do WAHA salvas com sucesso!', 'success');
    } catch (err: any) {
      onShowToast(err.message || 'Erro ao salvar configurações do WAHA.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/waha/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseUrl: baseUrl.trim(),
          session: session.trim() || 'default',
          apiKey: apiKey.trim() || undefined,
        }),
      });
      const data = await res.json();
      setTestResult({ success: Boolean(data.success), message: data.message || 'Teste concluído.' });
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || 'Erro de conexão.' });
    } finally {
      setIsTesting(false);
    }
  };

  const handleLoadGroups = async () => {
    setIsLoadingGroups(true);
    try {
      const res = await fetch('/api/waha/groups');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao listar grupos');
      setGroups(data.groups || []);
      if ((data.groups || []).length === 0) {
        onShowToast('Nenhum grupo encontrado na sessão WAHA.', 'info');
      } else {
        onShowToast(`${data.groups.length} grupo(s) carregado(s).`, 'success');
      }
    } catch (err: any) {
      onShowToast(err.message || 'Erro ao carregar grupos do WAHA.', 'error');
    } finally {
      setIsLoadingGroups(false);
    }
  };

  const persistTemplates = async (nextTemplates: WahaTemplate[]) => {
    setIsSavingTemplates(true);
    try {
      const res = await fetch('/api/waha/templates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templates: nextTemplates }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar templates');
      setTemplates(data.templates || nextTemplates);
      onShowToast('Templates salvos com sucesso!', 'success');
    } catch (err: any) {
      onShowToast(err.message || 'Erro ao salvar templates.', 'error');
    } finally {
      setIsSavingTemplates(false);
    }
  };

  const handleStartNewTemplate = () => {
    setEditingTemplateId('new');
    setTplName('');
    setTplContent(`*Atualização no Card {{issueKey}}*\n📋 {{summary}}\n\n🔄 *Alterações:*\n{{changes}}\n\n🔗 {{url}}`);
    setTplIsDefault(templates.length === 0);
  };

  const handleEditTemplate = (tpl: WahaTemplate) => {
    setEditingTemplateId(tpl.id);
    setTplName(tpl.name);
    setTplContent(tpl.content);
    setTplIsDefault(Boolean(tpl.isDefault));
  };

  const handleSaveTemplateForm = async () => {
    if (!tplName.trim() || !tplContent.trim()) {
      onShowToast('Preencha o nome e o conteúdo do template.', 'error');
      return;
    }

    let next: WahaTemplate[];
    if (editingTemplateId === 'new') {
      const created: WahaTemplate = {
        id: `tpl-${Date.now()}`,
        name: tplName.trim(),
        content: tplContent,
        isDefault: tplIsDefault,
      };
      next = tplIsDefault
        ? [...templates.map((t) => ({ ...t, isDefault: false })), created]
        : [...templates, created];
    } else {
      next = templates.map((t) => {
        if (t.id === editingTemplateId) {
          return { ...t, name: tplName.trim(), content: tplContent, isDefault: tplIsDefault };
        }
        return tplIsDefault ? { ...t, isDefault: false } : t;
      });
    }

    await persistTemplates(next);
    setEditingTemplateId(null);
  };

  const handleDeleteTemplate = async (id: string) => {
    const next = templates.filter((t) => t.id !== id);
    await persistTemplates(next);
    if (editingTemplateId === id) {
      setEditingTemplateId(null);
    }
  };

  const insertVariable = (variable: string) => {
    setTplContent((prev) => prev + variable);
  };

  if (isLoading) {
    return (
      <div className="py-16 flex items-center justify-center gap-2 text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin text-emerald-500" />
        <span className="text-xs font-medium">Carregando configurações do WAHA...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Card 1: Conexão WAHA */}
      <div className="bg-white dark:bg-[#0c1222] border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xl space-y-6 transition-colors">
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-emerald-500" />
              Integração WhatsApp via WAHA (WhatsApp HTTP API)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Configure a URL do seu servidor WAHA, a sessão conectada, o grupo de destino e seu usuário do Jira para revisão NEO.
            </p>
          </div>
          {hasExistingKey && (
            <span className="px-3 py-1 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-xs font-bold flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              API Key Configurada
            </span>
          )}
        </div>

        <form onSubmit={handleSaveConfig} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                URL do Servidor WAHA: *
              </label>
              <input
                type="url"
                required
                placeholder="http://localhost:3000"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                Nome da Sessão: *
              </label>
              <input
                type="text"
                required
                placeholder="default"
                value={session}
                onChange={(e) => setSession(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* API Key */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              API Key do WAHA (opcional se não configurada no servidor):
            </label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                placeholder={
                  hasExistingKey
                    ? '•••••••••••••••• (Já gravada. Preencha apenas para alterar)'
                    : 'Cole a X-Api-Key do WAHA aqui'
                }
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="w-full pl-3 pr-10 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono focus:outline-none focus:border-emerald-500"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Grupo padrão */}
          <div className="space-y-2 p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-emerald-500" />
                Grupo de WhatsApp Padrão
              </label>
              <button
                type="button"
                onClick={handleLoadGroups}
                disabled={isLoadingGroups}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 text-[11px] font-bold transition-all"
              >
                {isLoadingGroups ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RotateCw className="w-3.5 h-3.5" />
                )}
                <span>Carregar Grupos da Sessão</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <span className="text-[11px] text-slate-500 dark:text-slate-400">ID do Grupo (chatId):</span>
                <input
                  type="text"
                  placeholder="ex: 120363012345678901@g.us"
                  value={defaultGroupId}
                  onChange={(e) => setDefaultGroupId(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div className="space-y-1">
                <span className="text-[11px] text-slate-500 dark:text-slate-400">Nome de identificação:</span>
                <input
                  type="text"
                  placeholder="ex: Time NEO / Deploys"
                  value={defaultGroupName}
                  onChange={(e) => setDefaultGroupName(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            {groups.length > 0 && (
              <div className="pt-2">
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                  Clique para selecionar um grupo encontrado:
                </p>
                <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
                  {groups.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => {
                        setDefaultGroupId(g.id);
                        setDefaultGroupName(g.name);
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all ${
                        defaultGroupId === g.id
                          ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm'
                          : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-emerald-500/50'
                      }`}
                    >
                      {g.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Autor no Jira */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <User className="w-4 h-4 text-blue-500" />
              Seu Nome de Autor no Jira (para filtrar &quot;Minhas Alterações NEO&quot;):
            </label>
            <input
              type="text"
              list="jira-neo-authors-list"
              placeholder="ex: Daniel Schmitz"
              value={jiraAuthorName}
              onChange={(e) => setJiraAuthorName(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
            />
            <datalist id="jira-neo-authors-list">
              {jiraAuthors.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Corresponde ao nome exibido no histórico de alterações dos cards do Jira.
            </p>
          </div>

          {testResult && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                testResult.success
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{testResult.message}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={isTesting}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all"
            >
              {isTesting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RotateCw className="w-3.5 h-3.5 text-emerald-500" />
              )}
              <span>Testar Conexão WAHA</span>
            </button>

            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-1.5 px-6 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold shadow-lg shadow-emerald-600/30 transition-all"
            >
              {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Salvar Configurações WAHA</span>
            </button>
          </div>
        </form>
      </div>

      {/* Card 2: Templates de Mensagem */}
      <div className="bg-white dark:bg-[#0c1222] border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xl space-y-5 transition-colors">
        <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FileText className="w-5 h-5 text-indigo-500" />
              Templates de Mensagem para WhatsApp
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Crie modelos com variáveis dinâmicas que serão preenchidas automaticamente ao clicar em enviar.
            </p>
          </div>
          <button
            type="button"
            onClick={handleStartNewTemplate}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-600/20 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Template</span>
          </button>
        </div>

        {/* Editor de Template */}
        {editingTemplateId && (
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-indigo-500/30 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Nome do Template: *
                </label>
                <input
                  type="text"
                  placeholder="ex: Aviso de Deploy HML"
                  value={tplName}
                  onChange={(e) => setTplName(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={tplIsDefault}
                    onChange={(e) => setTplIsDefault(e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>Definir como template padrão</span>
                </label>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mr-1">
                  Inserir variável:
                </span>
                {TEMPLATE_VARIABLES.map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => insertVariable(v.key)}
                    title={v.label}
                    className="px-2 py-0.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 text-[11px] font-mono transition-all"
                  >
                    {v.key}
                  </button>
                ))}
              </div>
              <textarea
                rows={7}
                value={tplContent}
                onChange={(e) => setTplContent(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingTemplateId(null)}
                className="px-3.5 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveTemplateForm}
                disabled={isSavingTemplates}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold"
              >
                {isSavingTemplates ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                <span>Salvar Template</span>
              </button>
            </div>
          </div>
        )}

        {/* Lista de Templates */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {templates.map((tpl) => (
            <div
              key={tpl.id}
              className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex flex-col justify-between gap-3"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    {tpl.isDefault && <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />}
                    {tpl.name}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleEditTemplate(tpl)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-500/10 transition-colors"
                      title="Editar template"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteTemplate(tpl.id)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-500/10 transition-colors"
                      title="Excluir template"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <pre className="text-[11px] text-slate-600 dark:text-slate-400 font-mono whitespace-pre-wrap bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 max-h-32 overflow-y-auto">
                  {tpl.content}
                </pre>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
