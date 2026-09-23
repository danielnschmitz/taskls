import React, { useState, useEffect, useCallback } from 'react';
import {
  Settings,
  Users,
  UserPlus,
  KeyRound,
  Trash2,
  Shield,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Lock,
  Search,
  Check,
  RotateCw,
  Plus,
  ExternalLink,
  ShieldCheck,
  CheckSquare,
  Square,
  ChevronRight,
  Eye,
  EyeOff,
  Sparkles,
  Sliders,
  X,
  Database,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { JiraConfig } from '../types';

export interface ManagedUser {
  id: string;
  username: string;
  isAdmin: boolean;
  canAccessJira: boolean;
  allowedModules?: string[];
  isDefaultPassword: boolean;
  createdAt: string;
  updatedAt: string;
}

interface SettingsModuleProps {
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

export const SettingsModule: React.FC<SettingsModuleProps> = ({ onShowToast }) => {
  const { user: currentAuthUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'users' | 'jira'>('users');

  // ==========================================
  // ESTADOS - GESTÃO DE USUÁRIOS
  // ==========================================
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [searchUserQuery, setSearchUserQuery] = useState('');

  // Formulário de Novo Usuário
  const [isCreateUserOpen, setIsCreateUserOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newAllowedModules, setNewAllowedModules] = useState<string[]>(['tasks', 'cards']);
  const [newCanAccessJira, setNewCanAccessJira] = useState(false);
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [createUserError, setCreateUserError] = useState('');

  // Modal de Gerenciamento de Usuário (Módulos, Senha e Exclusão)
  const [manageModalUser, setManageModalUser] = useState<ManagedUser | null>(null);
  const [manageAllowedModules, setManageAllowedModules] = useState<string[]>(['tasks', 'cards']);
  const [manageCanAccessJira, setManageCanAccessJira] = useState(false);
  const [isSavingModules, setIsSavingModules] = useState(false);
  const [managePasswordInput, setManagePasswordInput] = useState('');
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [managePasswordError, setManagePasswordError] = useState('');
  const [managePasswordSuccess, setManagePasswordSuccess] = useState('');
  const [manageError, setManageError] = useState('');

  // ==========================================
  // ESTADOS - CONFIGURAÇÃO DO JIRA
  // ==========================================
  const [isLoadingJira, setIsLoadingJira] = useState(true);
  const [isSavingJira, setIsSavingJira] = useState(false);
  const [isTestingJira, setIsTestingJira] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const [domain, setDomain] = useState('sysmiddle.atlassian.net');
  const [email, setEmail] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [hasExistingToken, setHasExistingToken] = useState(false);
  const [projects, setProjects] = useState<string[]>(['NEO', 'ESM']);
  const [newProjectInput, setNewProjectInput] = useState('');
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([...DEFAULT_POSSIBLE_STATUSES]);
  const [allPossibleStatuses, setAllPossibleStatuses] = useState<string[]>([...DEFAULT_POSSIBLE_STATUSES]);
  const [ignoredFields, setIgnoredFields] = useState<string[]>([...DEFAULT_IGNORED_FIELDS]);
  const [newIgnoredFieldInput, setNewIgnoredFieldInput] = useState('');

  // ==========================================
  // CARREGAR DADOS DE USUÁRIOS
  // ==========================================
  const fetchUsers = useCallback(async () => {
    setIsLoadingUsers(true);
    try {
      const res = await fetch('/api/users');
      if (!res.ok) throw new Error('Falha ao listar usuários');
      const data = await res.json();
      setUsers(data);
    } catch (err: any) {
      console.error(err);
      onShowToast('Erro ao carregar lista de usuários.', 'error');
    } finally {
      setIsLoadingUsers(false);
    }
  }, [onShowToast]);

  // ==========================================
  // CARREGAR DADOS DO JIRA
  // ==========================================
  const fetchJiraSettings = useCallback(async () => {
    setIsLoadingJira(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/jira/settings');
      if (!res.ok) throw new Error('Falha ao obter configurações do Jira');
      const data = await res.json();
      if (data.domain) setDomain(data.domain);
      if (data.email) setEmail(data.email);
      if (data.hasApiToken) setHasExistingToken(true);
      if (data.projects && Array.isArray(data.projects)) setProjects(data.projects);
      if (data.statuses && Array.isArray(data.statuses)) setSelectedStatuses(data.statuses);
      if (data.allPossibleStatuses && Array.isArray(data.allPossibleStatuses)) {
        setAllPossibleStatuses(data.allPossibleStatuses);
      }
      if (data.ignored_fields && Array.isArray(data.ignored_fields)) {
        setIgnoredFields(data.ignored_fields);
      }
    } catch (err) {
      console.error(err);
      onShowToast('Erro ao carregar configurações do Jira.', 'error');
    } finally {
      setIsLoadingJira(false);
    }
  }, [onShowToast]);

  useEffect(() => {
    fetchUsers();
    fetchJiraSettings();
  }, [fetchUsers, fetchJiraSettings]);

  // ==========================================
  // AÇÕES DE USUÁRIO
  // ==========================================
  const handleToggleModule = async (user: ManagedUser, moduleName: string) => {
    if (user.username.toLowerCase() === 'admin') {
      onShowToast('O usuário admin possui acesso total e irrestrito.', 'info');
      return;
    }

    const currentModules = user.allowedModules || ['tasks', 'cards'];
    const hasModule = currentModules.includes(moduleName);
    const updatedModules = hasModule
      ? currentModules.filter((m) => m !== moduleName)
      : [...currentModules, moduleName];

    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allowedModules: updatedModules,
          canAccessJira: user.canAccessJira,
        }),
      });

      if (!res.ok) throw new Error('Erro ao atualizar permissão');
      const updated = await res.json();
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      onShowToast(`Permissão do módulo atualizada para ${user.username}!`, 'success');
    } catch (err) {
      onShowToast('Falha ao atualizar módulo do usuário.', 'error');
    }
  };

  const handleToggleJiraAccess = async (user: ManagedUser) => {
    if (user.username.toLowerCase() === 'admin') {
      onShowToast('O administrador principal sempre possui acesso ao Jira.', 'info');
      return;
    }

    const targetState = !user.canAccessJira;
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          canAccessJira: targetState,
          allowedModules: user.allowedModules,
        }),
      });

      if (!res.ok) throw new Error('Erro ao alterar permissão do Jira');
      const updated = await res.json();
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      onShowToast(
        targetState
          ? `Acesso ao Jira concedido para ${user.username}.`
          : `Acesso ao Jira revogado para ${user.username}.`,
        'success'
      );
    } catch (err) {
      onShowToast('Falha ao alterar permissão do Jira.', 'error');
    }
  };

  const handleCreateUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateUserError('');

    if (!newUsername.trim() || !newPassword.trim()) {
      setCreateUserError('Preencha o nome de usuário e a senha inicial.');
      return;
    }

    setIsCreatingUser(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: newUsername.trim(),
          password: newPassword.trim(),
          allowedModules: newAllowedModules,
          canAccessJira: newCanAccessJira,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao criar usuário');

      setUsers((prev) => [...prev, data]);
      setNewUsername('');
      setNewPassword('');
      setNewAllowedModules(['tasks', 'cards']);
      setNewCanAccessJira(false);
      setIsCreateUserOpen(false);
      onShowToast(`Usuário ${data.username} criado com sucesso!`, 'success');
    } catch (err: any) {
      setCreateUserError(err.message || 'Erro ao criar usuário');
    } finally {
      setIsCreatingUser(false);
    }
  };

  const handleOpenManageUser = (user: ManagedUser) => {
    setManageModalUser(user);
    setManageAllowedModules(user.allowedModules || ['tasks', 'cards']);
    setManageCanAccessJira(Boolean(user.canAccessJira));
    setManagePasswordInput('');
    setManagePasswordError('');
    setManagePasswordSuccess('');
    setManageError('');
  };

  const handleSaveUserModules = async () => {
    if (!manageModalUser) return;
    setIsSavingModules(true);
    setManageError('');

    try {
      const res = await fetch(`/api/users/${manageModalUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allowedModules: manageAllowedModules,
          canAccessJira: manageCanAccessJira,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao atualizar permissões');

      setUsers((prev) =>
        prev.map((u) =>
          u.id === manageModalUser.id
            ? { ...u, allowedModules: manageAllowedModules, canAccessJira: manageCanAccessJira }
            : u
        )
      );
      setManageModalUser((prev) =>
        prev ? { ...prev, allowedModules: manageAllowedModules, canAccessJira: manageCanAccessJira } : null
      );
      onShowToast(`Permissões do usuário ${manageModalUser.username} salvas com sucesso!`, 'success');
    } catch (err: any) {
      setManageError(err.message || 'Erro ao salvar módulos do usuário.');
      onShowToast(err.message || 'Erro ao salvar permissões.', 'error');
    } finally {
      setIsSavingModules(false);
    }
  };

  const handleResetPasswordInModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manageModalUser) return;
    setManagePasswordError('');
    setManagePasswordSuccess('');

    if (!managePasswordInput.trim()) {
      setManagePasswordError('Digite a nova senha temporária.');
      return;
    }

    if (managePasswordInput.trim().length < 4) {
      setManagePasswordError('A senha deve ter no mínimo 4 caracteres.');
      return;
    }

    setIsResettingPassword(true);
    try {
      const res = await fetch(`/api/users/${manageModalUser.id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: managePasswordInput.trim() }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao redefinir senha');

      setUsers((prev) =>
        prev.map((u) => (u.id === manageModalUser.id ? { ...u, isDefaultPassword: true } : u))
      );
      setManageModalUser((prev) => (prev ? { ...prev, isDefaultPassword: true } : null));
      setManagePasswordInput('');
      setManagePasswordSuccess('Senha redefinida com sucesso! O usuário deverá trocá-la no próximo login.');
      onShowToast(`Senha do usuário ${manageModalUser.username} redefinida com sucesso!`, 'success');
    } catch (err: any) {
      setManagePasswordError(err.message || 'Erro ao redefinir senha');
    } finally {
      setIsResettingPassword(false);
    }
  };

  const handleDeleteUserFromModal = async () => {
    if (!manageModalUser) return;

    if (manageModalUser.id === currentAuthUser?.id) {
      onShowToast('Você não pode excluir a sua própria conta de usuário.', 'error');
      return;
    }
    if (manageModalUser.username.toLowerCase() === 'admin') {
      onShowToast('O usuário administrador principal não pode ser excluído.', 'error');
      return;
    }

    if (
      !confirm(
        `Tem certeza que deseja excluir o usuário "${manageModalUser.username}"? Todas as tarefas vinculadas a ele serão excluídas permanentemente.`
      )
    ) {
      return;
    }

    try {
      const res = await fetch(`/api/users/${manageModalUser.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao excluir usuário');

      const deletedName = manageModalUser.username;
      setUsers((prev) => prev.filter((u) => u.id !== manageModalUser.id));
      setManageModalUser(null);
      onShowToast(`Usuário ${deletedName} excluído com sucesso.`, 'success');
    } catch (err: any) {
      onShowToast(err.message || 'Erro ao excluir usuário.', 'error');
    }
  };

  // ==========================================
  // AÇÕES DE CONFIGURAÇÃO DO JIRA
  // ==========================================
  const handleAddProject = () => {
    const p = newProjectInput.trim().toUpperCase();
    if (!p) return;
    if (projects.includes(p)) {
      onShowToast('Projeto já adicionado.', 'info');
      return;
    }
    setProjects([...projects, p]);
    setNewProjectInput('');
  };

  const handleRemoveProject = (p: string) => {
    setProjects(projects.filter((item) => item !== p));
  };

  const handleToggleStatus = (status: string) => {
    if (selectedStatuses.includes(status)) {
      setSelectedStatuses(selectedStatuses.filter((s) => s !== status));
    } else {
      setSelectedStatuses([...selectedStatuses, status]);
    }
  };

  const handleAddIgnoredField = () => {
    const f = newIgnoredFieldInput.trim();
    if (!f) return;
    if (ignoredFields.some((item) => item.toLowerCase() === f.toLowerCase())) {
      onShowToast('Campo já está na lista de desconsiderados.', 'info');
      return;
    }
    setIgnoredFields([...ignoredFields, f]);
    setNewIgnoredFieldInput('');
  };

  const handleRemoveIgnoredField = (fieldToRemove: string) => {
    setIgnoredFields(ignoredFields.filter((item) => item !== fieldToRemove));
  };

  const handleResetIgnoredFields = () => {
    setIgnoredFields([...DEFAULT_IGNORED_FIELDS]);
    onShowToast('Lista restaurada para os padrões.', 'info');
  };

  const handleTestJiraConnection = async () => {
    setIsTestingJira(true);
    setTestResult(null);

    try {
      const res = await fetch('/api/jira/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: domain.trim(),
          email: email.trim(),
          ...(apiToken.trim() && { api_token: apiToken.trim() }),
        }),
      });

      const data = await res.json();
      setTestResult({
        success: Boolean(data.success),
        message: data.message || (data.success ? 'Conexão bem sucedida!' : 'Falha na conexão.'),
      });
      if (data.success) {
        onShowToast('Conexão com o Jira validada com sucesso!', 'success');
      } else {
        onShowToast('Falha na validação com o Jira.', 'error');
      }
    } catch (err: any) {
      setTestResult({ success: false, message: `Erro ao testar conexão: ${err.message}` });
      onShowToast('Erro de rede ao testar Jira.', 'error');
    } finally {
      setIsTestingJira(false);
    }
  };

  const handleSaveJiraSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingJira(true);
    setTestResult(null);

    try {
      const res = await fetch('/api/jira/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: domain.trim(),
          email: email.trim(),
          ...(apiToken.trim() && { api_token: apiToken.trim() }),
          projects,
          statuses: selectedStatuses,
          ignored_fields: ignoredFields,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar configurações');

      if (apiToken.trim()) {
        setHasExistingToken(true);
        setApiToken('');
      }

      onShowToast('Configurações do Jira salvas com sucesso no banco de dados!', 'success');
    } catch (err: any) {
      onShowToast(err.message || 'Erro ao salvar configurações do Jira.', 'error');
    } finally {
      setIsSavingJira(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-5 bg-[#0d1424] border border-slate-800 rounded-3xl shadow-xl">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-slate-700 via-indigo-600 to-blue-600 flex items-center justify-center shadow-lg shadow-indigo-600/30 ring-1 ring-white/20">
            <Settings className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl font-extrabold text-white tracking-tight">Painel de Configurações</h2>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                Administração
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Controle de acesso por módulos, gestão de contas de usuários e parâmetros de integração com Jira Cloud.
            </p>
          </div>
        </div>

        {/* Controles do Cabeçalho: Status do BD e Seleção de Abas */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full md:w-auto">
          {/* Indicador de Banco de Dados Conectado */}
          <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-2xl bg-slate-950 border border-slate-800 text-xs font-medium shadow-inner">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <Database className="w-3.5 h-3.5 text-emerald-400" />
            <div className="flex items-center gap-1.5">
              <span className="text-slate-300 font-semibold">PostgreSQL</span>
              <span className="text-emerald-400 font-bold">Conectado</span>
            </div>
          </div>

          {/* Tab Switcher */}
          <div className="flex items-center gap-1.5 p-1.5 bg-slate-950 border border-slate-800 rounded-2xl shadow-inner w-full sm:w-auto">
            <button
              onClick={() => setActiveTab('users')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'users'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Gestão de Usuários & Módulos</span>
            </button>

            <button
              onClick={() => setActiveTab('jira')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'jira'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <path d="M11.53 2c0 2.4 1.97 4.35 4.38 4.35h2.15v2.17c0 2.4 1.97 4.35 4.39 4.35V2h-10.92zm-5.77 5.79c0 2.4 1.97 4.35 4.39 4.35h2.14v2.17c0 2.4 1.97 4.35 4.39 4.35V7.79H5.76zm-5.76 5.79c0 2.4 1.97 4.35 4.39 4.35h2.14v2.17c0 2.4 1.97 4.35 4.39 4.35v-10.87H0z"/>
              </svg>
              <span>Integração Jira Cloud</span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================== */}
      {/* ABA 1: GESTÃO DE USUÁRIOS & MÓDULOS */}
      {/* ========================================================== */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 bg-[#0c1222] border border-slate-800 rounded-2xl">
            <div className="relative flex-1 w-full sm:max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar usuário cadastrado..."
                value={searchUserQuery}
                onChange={(e) => setSearchUserQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <button
              onClick={() => setIsCreateUserOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 transition-all w-full sm:w-auto justify-center"
            >
              <UserPlus className="w-4 h-4" />
              <span>Novo Usuário</span>
            </button>
          </div>

          {/* Tabela de Usuários */}
          <div className="bg-[#0c1222] border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
            {isLoadingUsers ? (
              <div className="py-16 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                <span>Carregando usuários...</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-950/80 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                      <th className="py-3.5 px-5">Usuário</th>
                      <th className="py-3.5 px-4">Módulos Ativos</th>
                      <th className="py-3.5 px-4">Status de Acesso</th>
                      <th className="py-3.5 px-4">Cadastrado em</th>
                      <th className="py-3.5 px-5 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {users
                      .filter((u) => u.username.toLowerCase().includes(searchUserQuery.toLowerCase()))
                      .map((u) => {
                        const userModules = u.allowedModules || ['tasks', 'cards', 'health'];
                        const hasTasks = userModules.includes('tasks');
                        const hasCards = userModules.includes('cards');
                        const hasHealth = userModules.includes('health');

                        return (
                          <tr key={u.id} className="hover:bg-slate-900/40 transition-colors">
                            {/* Nome / Perfil */}
                            <td className="py-3.5 px-5">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600/40 to-violet-600/40 text-indigo-300 font-bold flex items-center justify-center text-xs border border-indigo-500/30">
                                  {u.username.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-bold text-white text-sm">{u.username}</span>
                                    {u.isAdmin && (
                                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/20">
                                        ADMIN
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* Módulos Liberados (Badges Informativos) */}
                            <td className="py-3.5 px-4">
                              <div className="flex flex-wrap items-center gap-1.5">
                                {(hasTasks || u.isAdmin) && (
                                  <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                                    Tarefas
                                  </span>
                                )}
                                {(hasCards || u.isAdmin) && (
                                  <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30">
                                    Cards
                                  </span>
                                )}
                                {(hasHealth || u.isAdmin) && (
                                  <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                    Saúde & Peso
                                  </span>
                                )}
                                {(u.canAccessJira || u.isAdmin) && (
                                  <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-blue-500/15 text-blue-300 border border-blue-500/30">
                                    Jira
                                  </span>
                                )}
                                {!hasTasks && !hasCards && !hasHealth && !u.canAccessJira && !u.isAdmin && (
                                  <span className="text-[11px] text-slate-500 italic">Nenhum</span>
                                )}
                              </div>
                            </td>

                            {/* Status de Senha */}
                            <td className="py-3.5 px-4">
                              {u.isDefaultPassword ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 rounded-lg">
                                  <AlertCircle className="w-3 h-3" />
                                  Troca Obrigatória
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-lg">
                                  <CheckCircle2 className="w-3 h-3" />
                                  Senha Pessoal Ativa
                                </span>
                              )}
                            </td>

                            {/* Data de Criação */}
                            <td className="py-3.5 px-4 text-slate-400 text-[11px]">
                              {new Date(u.createdAt).toLocaleDateString('pt-BR')}
                            </td>

                            {/* Ações: Botão Gerenciar único */}
                            <td className="py-3.5 px-5 text-right">
                              <button
                                type="button"
                                onClick={() => handleOpenManageUser(u)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/70 hover:border-indigo-500/50 text-xs font-semibold shadow-sm transition-all"
                                title="Gerenciar Módulos e Senha"
                              >
                                <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                                <span>Gerenciar</span>
                              </button>
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

      {/* ========================================================== */}
      {/* ABA 2: INTEGRAÇÃO JIRA CLOUD */}
      {/* ========================================================== */}
      {activeTab === 'jira' && (
        <div className="bg-[#0c1222] border border-slate-800 rounded-3xl p-6 shadow-xl space-y-6">
          <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-800">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <svg className="w-4 h-4 fill-blue-400" viewBox="0 0 24 24">
                  <path d="M11.53 2c0 2.4 1.97 4.35 4.38 4.35h2.15v2.17c0 2.4 1.97 4.35 4.39 4.35V2h-10.92zm-5.77 5.79c0 2.4 1.97 4.35 4.39 4.35h2.14v2.17c0 2.4 1.97 4.35 4.39 4.35V7.79H5.76zm-5.76 5.79c0 2.4 1.97 4.35 4.39 4.35h2.14v2.17c0 2.4 1.97 4.35 4.39 4.35v-10.87H0z"/>
                </svg>
                Configurações da Conexão Atlassian Jira
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Defina as credenciais da API e os filtros de projetos e status exibidos no painel semanal de demandas.
              </p>
            </div>

            {hasExistingToken && (
              <span className="px-3 py-1 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-bold flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" />
                Token de API Configurado
              </span>
            )}
          </div>

          {/* Form Jira */}
          <form onSubmit={handleSaveJiraSettings} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Domínio */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-300">
                  Domínio Atlassian: *
                </label>
                <input
                  type="text"
                  required
                  placeholder="ex: suaempresa.atlassian.net"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-300">
                  E-mail da Conta Atlassian: *
                </label>
                <input
                  type="email"
                  required
                  placeholder="seu.email@empresa.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Token da API */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-slate-300">
                  Token de API Atlassian:
                </label>
                <a
                  href="https://id.atlassian.com/manage-profile/security/api-tokens"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                >
                  <span>Gerar token no portal Atlassian</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <div className="relative">
                <input
                  type={showToken ? 'text' : 'password'}
                  placeholder={hasExistingToken ? '•••••••••••••••• (Já gravado com segurança. Preencha apenas para alterar)' : 'Cole o token de API aqui'}
                  value={apiToken}
                  onChange={(e) => setApiToken(e.target.value)}
                  className="w-full pl-3 pr-10 py-2 text-xs bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[10px] text-slate-500">
                O token é armazenado criptografado no banco PostgreSQL e nunca é exposto nas respostas da API.
              </p>
            </div>

            {/* Projetos Monitorados */}
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <label className="block text-xs font-bold text-slate-300">
                Chaves de Projetos Monitorados:
              </label>
              <div className="flex items-center gap-2 max-w-md">
                <input
                  type="text"
                  placeholder="Ex: NEO, ESM, TASK"
                  value={newProjectInput}
                  onChange={(e) => setNewProjectInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddProject();
                    }
                  }}
                  className="flex-1 px-3 py-1.5 text-xs bg-slate-950 border border-slate-700 rounded-xl text-white uppercase font-mono"
                />
                <button
                  type="button"
                  onClick={handleAddProject}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold"
                >
                  Adicionar
                </button>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                {projects.map((p) => (
                  <span
                    key={p}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-indigo-500/10 text-indigo-300 border border-indigo-500/30 text-xs font-mono font-bold"
                  >
                    <span>{p}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveProject(p)}
                      className="text-slate-400 hover:text-rose-400 text-sm font-bold ml-1"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>

            {/* Status do Jira */}
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-slate-300">
                  Status a Exibir no Painel Semanal:
                </label>
                <div className="flex items-center gap-2 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setSelectedStatuses([...allPossibleStatuses])}
                    className="text-indigo-400 hover:text-indigo-300 font-semibold"
                  >
                    Marcar Todos
                  </button>
                  <span className="text-slate-600">|</span>
                  <button
                    type="button"
                    onClick={() => setSelectedStatuses([])}
                    className="text-slate-400 hover:text-slate-300 font-semibold"
                  >
                    Desmarcar Todos
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 pt-1 max-h-56 overflow-y-auto pr-1">
                {allPossibleStatuses.map((st) => {
                  const isChecked = selectedStatuses.includes(st);
                  return (
                    <button
                      key={st}
                      type="button"
                      onClick={() => handleToggleStatus(st)}
                      className={`flex items-center gap-2 p-2 rounded-xl text-xs text-left border transition-all ${
                        isChecked
                          ? 'bg-indigo-600/20 text-indigo-200 border-indigo-500/40 font-semibold'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-900'
                      }`}
                    >
                      {isChecked ? (
                        <CheckSquare className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                      ) : (
                        <Square className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" />
                      )}
                      <span className="truncate">{st}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Campos Desconsiderados nas Revisões */}
            <div className="space-y-3 pt-3 border-t border-slate-800">
              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-xs font-bold text-slate-300">
                    Campos Desconsiderados nas Revisões:
                  </label>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Alterações nesses campos no Jira não aparecerão no painel de revisões e as pendências existentes deles serão limpas.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleResetIgnoredFields}
                  className="text-[11px] text-indigo-400 hover:text-indigo-300 font-semibold transition-colors"
                  title="Restaurar a lista padrão recomendada"
                >
                  Restaurar Padrões
                </button>
              </div>

              <div className="flex items-center gap-2 max-w-md">
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
                  className="flex-1 px-3 py-1.5 text-xs bg-slate-950 border border-slate-700 rounded-xl text-white font-mono placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="button"
                  onClick={handleAddIgnoredField}
                  className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition-all"
                >
                  Adicionar
                </button>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                {ignoredFields.length === 0 ? (
                  <span className="text-xs text-slate-500 italic">Nenhum campo desconsiderado. Todas as alterações serão notificadas.</span>
                ) : (
                  ignoredFields.map((field) => (
                    <span
                      key={field}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-800/90 text-slate-300 border border-slate-700 text-xs font-medium shadow-sm hover:border-slate-600 transition-colors"
                    >
                      <span>{field}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveIgnoredField(field)}
                        className="text-slate-400 hover:text-rose-400 text-sm font-bold ml-1 transition-colors"
                        title={`Remover ${field}`}
                      >
                        ×
                      </button>
                    </span>
                  ))
                )}
              </div>
            </div>

            {/* Resultado do Teste de Conexão */}
            {testResult && (
              <div
                className={`p-4 rounded-2xl text-xs flex items-start gap-2.5 border ${
                  testResult.success
                    ? 'bg-emerald-950/30 text-emerald-300 border-emerald-500/30'
                    : 'bg-rose-950/30 text-rose-300 border-rose-500/30'
                }`}
              >
                {testResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
                )}
                <span>{testResult.message}</span>
              </div>
            )}

            {/* Ações Finais */}
            <div className="pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleTestJiraConnection}
                disabled={isTestingJira || !domain || !email || (!apiToken && !hasExistingToken)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold transition-all"
              >
                {isTestingJira ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                ) : (
                  <RotateCw className="w-3.5 h-3.5 text-indigo-400" />
                )}
                <span>Testar Conexão Agora</span>
              </button>

              <button
                type="submit"
                disabled={isSavingJira}
                className="flex items-center gap-1.5 px-6 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 transition-all"
              >
                {isSavingJira && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Salvar Configurações</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ========================================================== */}
      {/* MODAL: CRIAR NOVO USUÁRIO */}
      {/* ========================================================== */}
      {isCreateUserOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0b101e] border border-slate-700 rounded-3xl max-w-md w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-indigo-400" />
                <h3 className="text-sm font-bold text-white">Cadastrar Novo Usuário</h3>
              </div>
              <button
                onClick={() => setIsCreateUserOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateUserSubmit} className="p-6 space-y-4">
              {createUserError && (
                <div className="p-3 rounded-xl bg-rose-950/30 border border-rose-500/30 text-rose-300 text-xs">
                  {createUserError}
                </div>
              )}

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-300">Login / Username: *</label>
                <input
                  type="text"
                  required
                  placeholder="ex: daniel.silva"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-300">Senha Inicial Temporária: *</label>
                <input
                  type="password"
                  required
                  placeholder="Mínimo 4 caracteres"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
                <span className="text-[10px] text-amber-400 block pt-0.5">
                  O usuário será forçado a alterar esta senha no primeiro login.
                </span>
              </div>

              {/* Módulos Permitidos */}
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <label className="block text-xs font-bold text-slate-300">
                  Módulos e Acessos Permitidos:
                </label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs cursor-pointer hover:bg-slate-900">
                    <input
                      type="checkbox"
                      checked={newAllowedModules.includes('tasks')}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setNewAllowedModules([...newAllowedModules, 'tasks']);
                        } else {
                          setNewAllowedModules(newAllowedModules.filter((m) => m !== 'tasks'));
                        }
                      }}
                      className="rounded bg-slate-950 border-slate-700 text-indigo-600 focus:ring-0"
                    />
                    <div>
                      <span className="font-bold text-white block">📋 Gestão de Tarefas</span>
                      <span className="text-[11px] text-slate-400 block">
                        Permite acessar quadro de tarefas, calendário e backlog.
                      </span>
                    </div>
                  </label>

                  <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs cursor-pointer hover:bg-slate-900">
                    <input
                      type="checkbox"
                      checked={newAllowedModules.includes('cards')}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setNewAllowedModules([...newAllowedModules, 'cards']);
                        } else {
                          setNewAllowedModules(newAllowedModules.filter((m) => m !== 'cards'));
                        }
                      }}
                      className="rounded bg-slate-950 border-slate-700 text-indigo-600 focus:ring-0"
                    />
                    <div>
                      <span className="font-bold text-white block">✍️ Escrita de Cards</span>
                      <span className="text-[11px] text-slate-400 block">
                        Permite criar templates, preencher macros e gerar Markdown.
                      </span>
                    </div>
                  </label>

                  <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs cursor-pointer hover:bg-slate-900">
                    <input
                      type="checkbox"
                      checked={newAllowedModules.includes('health')}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setNewAllowedModules([...newAllowedModules, 'health']);
                        } else {
                          setNewAllowedModules(newAllowedModules.filter((m) => m !== 'health'));
                        }
                      }}
                      className="rounded bg-slate-950 border-slate-700 text-emerald-600 focus:ring-0"
                    />
                    <div>
                      <span className="font-bold text-white block">⚖️ Saúde & Peso</span>
                      <span className="text-[11px] text-slate-400 block">
                        Permite acompanhar evolução de peso e conectar bot Telegram.
                      </span>
                    </div>
                  </label>

                  <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs cursor-pointer hover:bg-slate-900">
                    <input
                      type="checkbox"
                      checked={newCanAccessJira}
                      onChange={(e) => setNewCanAccessJira(e.target.checked)}
                      className="rounded bg-slate-950 border-slate-700 text-blue-600 focus:ring-0"
                    />
                    <div>
                      <span className="font-bold text-white block">🔷 Demandas Jira</span>
                      <span className="text-[11px] text-slate-400 block">
                        Permite visualizar a aba de demandas do Jira em Tarefas.
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateUserOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isCreatingUser}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold shadow-md shadow-indigo-600/30"
                >
                  {isCreatingUser ? 'Criando...' : 'Criar Usuário'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* MODAL: GERENCIAMENTO COMPLETO DE USUÁRIO */}
      {/* ========================================================== */}
      {manageModalUser && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#0b101e] border border-slate-700 rounded-3xl max-w-xl w-full shadow-2xl p-6 space-y-6 animate-in fade-in zoom-in-95 my-8">
            
            {/* Cabeçalho do Modal */}
            <div className="flex items-start justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-600 text-white font-bold flex items-center justify-center text-sm shadow-md shadow-indigo-600/30">
                  {manageModalUser.username.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-extrabold text-white">{manageModalUser.username}</h3>
                    {manageModalUser.isAdmin && (
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/20">
                        ADMINISTRADOR
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400">Gerenciamento de módulos, permissões e credenciais</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setManageModalUser(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Mensagem de Erro Geral */}
            {manageError && (
              <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{manageError}</span>
              </div>
            )}

            {/* SEÇÃO 1: SELEÇÃO DE MÓDULOS */}
            <div className="space-y-3">
              <div>
                <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-indigo-400" />
                  Módulos e Permissões de Acesso
                </h4>
                <p className="text-[11px] text-slate-400">Defina os módulos que este usuário tem autorização para utilizar:</p>
              </div>

              {manageModalUser.isAdmin ? (
                <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center gap-2.5">
                  <ShieldCheck className="w-4 h-4 flex-shrink-0" />
                  <span>O usuário administrador possui acesso permanente e completo a todos os módulos e ferramentas da plataforma.</span>
                </div>
              ) : (
                <div className="space-y-2">
                  {/* Checkbox Módulo Tarefas */}
                  <label className={`p-3 rounded-2xl border flex items-start gap-3 cursor-pointer transition-all ${
                    manageAllowedModules.includes('tasks')
                      ? 'bg-indigo-600/10 border-indigo-500/40 text-white'
                      : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}>
                    <input
                      type="checkbox"
                      checked={manageAllowedModules.includes('tasks')}
                      onChange={() => {
                        setManageAllowedModules((prev) =>
                          prev.includes('tasks') ? prev.filter((m) => m !== 'tasks') : [...prev, 'tasks']
                        );
                      }}
                      className="mt-0.5 rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                    />
                    <div className="flex-1">
                      <span className="font-bold text-xs block text-slate-200">Gestão de Tarefas</span>
                      <span className="text-[11px] text-slate-400 block">
                        Permite cadastrar, acompanhar e gerenciar tarefas diárias, calendário semanal, agenda e backlog.
                      </span>
                    </div>
                  </label>

                  {/* Checkbox Módulo Cards */}
                  <label className={`p-3 rounded-2xl border flex items-start gap-3 cursor-pointer transition-all ${
                    manageAllowedModules.includes('cards')
                      ? 'bg-purple-600/10 border-purple-500/40 text-white'
                      : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}>
                    <input
                      type="checkbox"
                      checked={manageAllowedModules.includes('cards')}
                      onChange={() => {
                        setManageAllowedModules((prev) =>
                          prev.includes('cards') ? prev.filter((m) => m !== 'cards') : [...prev, 'cards']
                        );
                      }}
                      className="mt-0.5 rounded border-slate-700 text-purple-600 focus:ring-purple-500 w-4 h-4"
                    />
                    <div className="flex-1">
                      <span className="font-bold text-xs block text-slate-200">Escrita de Cards</span>
                      <span className="text-[11px] text-slate-400 block">
                        Permite criar templates com macros, gerar especificações estruturadas e exportar em Markdown.
                      </span>
                    </div>
                  </label>

                  {/* Checkbox Módulo Saúde & Peso */}
                  <label className={`p-3 rounded-2xl border flex items-start gap-3 cursor-pointer transition-all ${
                    manageAllowedModules.includes('health')
                      ? 'bg-emerald-600/10 border-emerald-500/40 text-white'
                      : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}>
                    <input
                      type="checkbox"
                      checked={manageAllowedModules.includes('health')}
                      onChange={() => {
                        setManageAllowedModules((prev) =>
                          prev.includes('health') ? prev.filter((m) => m !== 'health') : [...prev, 'health']
                        );
                      }}
                      className="mt-0.5 rounded border-slate-700 text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                    />
                    <div className="flex-1">
                      <span className="font-bold text-xs block text-slate-200">Saúde & Evolução de Peso</span>
                      <span className="text-[11px] text-slate-400 block">
                        Permite registrar pesagens corporais, visualizar gráficos de evolução e integrar com o Bot Telegram.
                      </span>
                    </div>
                  </label>

                  {/* Checkbox Demandas Jira */}
                  <label className={`p-3 rounded-2xl border flex items-start gap-3 cursor-pointer transition-all ${
                    manageCanAccessJira
                      ? 'bg-blue-600/10 border-blue-500/40 text-white'
                      : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}>
                    <input
                      type="checkbox"
                      checked={manageCanAccessJira}
                      onChange={(e) => setManageCanAccessJira(e.target.checked)}
                      className="mt-0.5 rounded border-slate-700 text-blue-600 focus:ring-blue-500 w-4 h-4"
                    />
                    <div className="flex-1">
                      <span className="font-bold text-xs block text-slate-200">Acesso ao Painel do Jira</span>
                      <span className="text-[11px] text-slate-400 block">
                        Permite visualizar e consultar a aba de Demandas da Semana sincronizadas com o Jira Cloud.
                      </span>
                    </div>
                  </label>

                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={handleSaveUserModules}
                      disabled={isSavingModules}
                      className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold shadow-md shadow-indigo-600/30 flex items-center gap-1.5 transition-all"
                    >
                      {isSavingModules ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      <span>Salvar Permissões de Módulos</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* SEÇÃO 2: REDEFINIÇÃO DE SENHA */}
            <div className="space-y-3 pt-4 border-t border-slate-800">
              <div>
                <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                  Redefinir Senha do Usuário
                </h4>
                <p className="text-[11px] text-slate-400">
                  Defina uma nova senha temporária. O usuário será solicitado a alterá-la no próximo acesso.
                </p>
              </div>

              {managePasswordError && (
                <div className="p-2.5 rounded-xl bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs">
                  {managePasswordError}
                </div>
              )}

              {managePasswordSuccess && (
                <div className="p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                  <span>{managePasswordSuccess}</span>
                </div>
              )}

              <form onSubmit={handleResetPasswordInModal} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <input
                  type="password"
                  placeholder="Nova senha temporária (mín. 4 caracteres)"
                  value={managePasswordInput}
                  onChange={(e) => setManagePasswordInput(e.target.value)}
                  className="flex-1 px-3 py-2 text-xs bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
                <button
                  type="submit"
                  disabled={isResettingPassword || !managePasswordInput.trim()}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-bold shadow-md shadow-amber-600/20 flex items-center justify-center gap-1.5 transition-all flex-shrink-0"
                >
                  {isResettingPassword ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
                  <span>Atualizar Senha</span>
                </button>
              </form>
            </div>

            {/* SEÇÃO 3: EXCLUSÃO DE CONTA */}
            {manageModalUser.username.toLowerCase() !== 'admin' && manageModalUser.id !== currentAuthUser?.id && (
              <div className="space-y-3 pt-4 border-t border-slate-800">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h4 className="text-xs font-bold text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Trash2 className="w-3.5 h-3.5" />
                      Exclusão de Conta
                    </h4>
                    <p className="text-[11px] text-slate-400">
                      Remover este usuário e todas as suas tarefas vinculadas permanentemente.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleDeleteUserFromModal}
                    className="px-3.5 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 hover:border-rose-500/50 text-rose-300 hover:text-rose-200 text-xs font-bold transition-all flex items-center justify-center gap-1.5 flex-shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Excluir Usuário</span>
                  </button>
                </div>
              </div>
            )}

            {/* Rodapé do Modal */}
            <div className="pt-4 border-t border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setManageModalUser(null)}
                className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-all"
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
