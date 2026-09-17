import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
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
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export interface ManagedUser {
  id: string;
  username: string;
  isAdmin: boolean;
  canAccessJira: boolean;
  isDefaultPassword: boolean;
  createdAt: string;
  updatedAt: string;
}

interface UserManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const UserManagementModal: React.FC<UserManagementModalProps> = ({
  isOpen,
  onClose,
  onShowToast,
}) => {
  if (!isOpen) return null;

  const { user: currentAuthUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'list' | 'create'>('list');
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Formulário de Criação de Usuário
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [canAccessJira, setCanAccessJira] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // Estado para Redefinição de Senha
  const [resetModalUser, setResetModalUser] = useState<ManagedUser | null>(null);
  const [resetPasswordInput, setResetPasswordInput] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [resetError, setResetError] = useState('');

  // Carregar lista de usuários
  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      } else {
        onShowToast('Falha ao carregar lista de usuários.', 'error');
      }
    } catch (err) {
      console.error(err);
      onShowToast('Erro de conexão ao carregar usuários.', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [onShowToast]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // Submeter novo usuário
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');

    if (!newUsername.trim() || newUsername.trim().length < 3) {
      setCreateError('O nome de usuário deve ter no mínimo 3 caracteres.');
      return;
    }

    if (!newPassword || newPassword.trim().length < 4) {
      setCreateError('A senha inicial deve possuir no mínimo 4 caracteres.');
      return;
    }

    setIsCreating(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: newUsername.trim(),
          password: newPassword.trim(),
          canAccessJira,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        onShowToast(`Usuário "${data.username}" criado com sucesso!`, 'success');
        setNewUsername('');
        setNewPassword('');
        setCanAccessJira(false);
        setActiveTab('list');
        loadUsers();
      } else {
        setCreateError(data.error || 'Erro ao criar usuário.');
      }
    } catch (err) {
      setCreateError('Erro de conexão ao criar usuário.');
    } finally {
      setIsCreating(false);
    }
  };

  // Alternar permissão do Jira
  const handleToggleJira = async (targetUser: ManagedUser) => {
    if (targetUser.username.toLowerCase() === 'admin') return;

    try {
      const targetState = !targetUser.canAccessJira;
      const res = await fetch(`/api/users/${targetUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canAccessJira: targetState }),
      });

      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) => (u.id === targetUser.id ? { ...u, canAccessJira: targetState } : u))
        );
        onShowToast(
          targetState
            ? `Acesso ao Jira liberado para ${targetUser.username}!`
            : `Acesso ao Jira revogado para ${targetUser.username}.`,
          'success'
        );
      } else {
        onShowToast('Falha ao atualizar permissão do Jira.', 'error');
      }
    } catch (err) {
      onShowToast('Erro de comunicação ao atualizar permissão.', 'error');
    }
  };

  // Redefinir senha de usuário
  const handleConfirmResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetModalUser) return;
    setResetError('');

    if (!resetPasswordInput || resetPasswordInput.trim().length < 4) {
      setResetError('A nova senha deve ter no mínimo 4 caracteres.');
      return;
    }

    setIsResetting(true);
    try {
      const res = await fetch(`/api/users/${resetModalUser.id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: resetPasswordInput.trim() }),
      });

      const data = await res.json();
      if (res.ok) {
        onShowToast(`Senha do usuário ${resetModalUser.username} redefinida com sucesso!`, 'success');
        setResetModalUser(null);
        setResetPasswordInput('');
        loadUsers();
      } else {
        setResetError(data.error || 'Falha ao redefinir senha.');
      }
    } catch (err) {
      setResetError('Erro ao comunicar com o servidor.');
    } finally {
      setIsResetting(false);
    }
  };

  // Excluir usuário
  const handleDeleteUser = async (targetUser: ManagedUser) => {
    if (targetUser.username.toLowerCase() === 'admin') {
      onShowToast('O usuário admin não pode ser excluído.', 'error');
      return;
    }
    if (targetUser.id === currentAuthUser?.id) {
      onShowToast('Você não pode excluir sua própria conta.', 'error');
      return;
    }

    if (!window.confirm(`Tem certeza que deseja excluir o usuário "${targetUser.username}" e todas as suas tarefas?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/users/${targetUser.id}`, { method: 'DELETE' });
      if (res.ok) {
        setUsers((prev) => prev.filter((u) => u.id !== targetUser.id));
        onShowToast(`Usuário "${targetUser.username}" excluído com sucesso.`, 'success');
      } else {
        const data = await res.json();
        onShowToast(data.error || 'Erro ao excluir usuário.', 'error');
      }
    } catch (err) {
      onShowToast('Erro de conexão ao excluir usuário.', 'error');
    }
  };

  const filteredUsers = users.filter((u) =>
    u.username.toLowerCase().includes(searchQuery.toLowerCase().trim())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-[#0d1424] border border-slate-700/80 rounded-2xl shadow-2xl shadow-black/80 flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                Gestão de Usuários
                <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                  Admin
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Gerencie usuários, permissões de acesso ao Jira e redefinição de senhas
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Abas */}
        <div className="flex items-center gap-2 px-6 pt-3 border-b border-slate-800/80 bg-slate-950/40">
          <button
            onClick={() => setActiveTab('list')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold border-b-2 transition-all ${
              activeTab === 'list'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Usuários Cadastrados ({users.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('create')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold border-b-2 transition-all ${
              activeTab === 'create'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Novo Usuário</span>
          </button>
        </div>

        {/* Conteúdo das Abas */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'list' ? (
            <div className="space-y-4">
              {/* Barra de Busca */}
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filtrar por nome de usuário..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-xs bg-slate-950/80 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Lista de Usuários */}
              {isLoading ? (
                <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-400">
                  <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
                  <span className="text-xs">Carregando usuários...</span>
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-400">
                  Nenhum usuário encontrado.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {filteredUsers.map((u) => {
                    const isSelf = u.id === currentAuthUser?.id;
                    const isMasterAdmin = u.username.toLowerCase() === 'admin';

                    return (
                      <div
                        key={u.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 hover:border-slate-700/80 gap-3 transition-all"
                      >
                        {/* Identificação do Usuário */}
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs uppercase ${
                            u.isAdmin
                              ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/30'
                              : 'bg-slate-800 text-slate-300 border border-slate-700'
                          }`}>
                            {u.username.substring(0, 2)}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white text-xs">{u.username}</span>
                              {u.isAdmin && (
                                <span className="px-2 py-0.5 text-[9px] font-bold rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                                  Admin
                                </span>
                              )}
                              {isSelf && (
                                <span className="px-1.5 py-0.5 text-[9px] font-semibold rounded bg-slate-800 text-slate-300 border border-slate-700">
                                  Você
                                </span>
                              )}
                              {u.isDefaultPassword && (
                                <span className="px-2 py-0.5 text-[9px] font-semibold rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                  1º Acesso Pendente
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-500">
                              Criado em: {new Date(u.createdAt).toLocaleDateString('pt-BR')}
                            </span>
                          </div>
                        </div>

                        {/* Controles de Permissão e Ações */}
                        <div className="flex items-center gap-2 sm:self-center">
                          {/* Botão de Toggle Jira */}
                          <button
                            onClick={() => handleToggleJira(u)}
                            disabled={isMasterAdmin}
                            title={
                              isMasterAdmin
                                ? 'Admin possui acesso total ao Jira'
                                : u.canAccessJira
                                ? 'Clique para bloquear acesso ao Jira'
                                : 'Clique para liberar acesso ao Jira'
                            }
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
                              u.canAccessJira
                                ? 'bg-blue-950/40 text-blue-300 border-blue-500/40 hover:bg-blue-950/60'
                                : 'bg-slate-950/60 text-slate-500 border-slate-800 hover:text-slate-300'
                            } ${isMasterAdmin ? 'cursor-default opacity-80' : ''}`}
                          >
                            <svg className="w-3 h-3 fill-current flex-shrink-0" viewBox="0 0 24 24">
                              <path d="M11.53 2c0 2.4 1.97 4.35 4.38 4.35h2.15v2.17c0 2.4 1.97 4.35 4.39 4.35V2h-10.92zm-5.77 5.79c0 2.4 1.97 4.35 4.39 4.35h2.14v2.17c0 2.4 1.97 4.35 4.39 4.35V7.79H5.76zm-5.76 5.79c0 2.4 1.97 4.35 4.39 4.35h2.14v2.17c0 2.4 1.97 4.35 4.39 4.35v-10.87H0z"/>
                            </svg>
                            <span className="text-[11px]">
                              {u.canAccessJira ? 'Jira: Liberado' : 'Jira: Bloqueado'}
                            </span>
                          </button>

                          {/* Redefinir Senha */}
                          <button
                            onClick={() => {
                              setResetModalUser(u);
                              setResetPasswordInput('');
                              setResetError('');
                            }}
                            className="p-1.5 rounded-lg bg-slate-950/60 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800 transition-all"
                            title="Redefinir senha temporária do usuário"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                          </button>

                          {/* Excluir Usuário */}
                          {!isMasterAdmin && !isSelf && (
                            <button
                              onClick={() => handleDeleteUser(u)}
                              className="p-1.5 rounded-lg bg-slate-950/60 text-rose-400/70 hover:text-rose-400 hover:bg-rose-950/30 border border-slate-800 hover:border-rose-500/30 transition-all"
                              title="Excluir usuário"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* Formulário de Cadastro de Novo Usuário */
            <form onSubmit={handleCreateUser} className="space-y-4 max-w-md mx-auto">
              {createError && (
                <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400" />
                  <span>{createError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Nome de Usuário (Login)
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="ex: daniel.silva"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value.toLowerCase().replace(/\s+/g, ''))}
                  className="w-full px-3.5 py-2 text-xs bg-slate-950/70 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                />
                <span className="text-[10px] text-slate-500 mt-0.5 block">
                  Somente letras, números e pontos (sem espaços). Mínimo 3 caracteres.
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Senha Inicial Temporária
                </label>
                <input
                  type="text"
                  required
                  placeholder="ex: senha123"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs bg-slate-950/70 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono"
                />
                <span className="text-[10px] text-slate-500 mt-0.5 block">
                  Mínimo 4 caracteres. O usuário precisará trocá-la no primeiro acesso.
                </span>
              </div>

              {/* Opção de Acesso ao Jira */}
              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex items-start gap-3 cursor-pointer hover:bg-slate-900/80 transition-colors">
                <input
                  type="checkbox"
                  id="chk-jira"
                  checked={canAccessJira}
                  onChange={(e) => setCanAccessJira(e.target.checked)}
                  className="mt-1 rounded border-slate-700 bg-slate-950 text-indigo-600 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                />
                <label htmlFor="chk-jira" className="cursor-pointer">
                  <span className="block text-xs font-bold text-slate-200">
                    Permitir Acesso ao Painel do Jira
                  </span>
                  <span className="block text-[11px] text-slate-400 mt-0.5">
                    Permite ao usuário visualizar as demandas do Jira com entrega na semana. Usuários comuns não têm acesso às configurações e credenciais do Jira.
                  </span>
                </label>
              </div>

              <div className="p-3 rounded-xl bg-indigo-950/30 border border-indigo-500/20 text-indigo-300 text-xs flex items-center gap-2">
                <Shield className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                <span>
                  O usuário verá apenas as tarefas que ele próprio criar. As tarefas são 100% isoladas.
                </span>
              </div>

              <div className="pt-3 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setActiveTab('list')}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-xl transition-all"
                >
                  Voltar
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="px-5 py-2 text-xs font-bold text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 rounded-xl shadow-lg shadow-indigo-600/30 flex items-center gap-2 transition-all disabled:opacity-50"
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Cadastrando...</span>
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>Cadastrar Usuário</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer do Modal */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-900/40 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-all"
          >
            Fechar
          </button>
        </div>

        {/* Submodal de Redefinição de Senha */}
        {resetModalUser && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
            <div className="w-full max-w-sm bg-[#0d1424] border border-slate-700 rounded-2xl shadow-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-white font-bold text-sm">
                  <KeyRound className="w-4 h-4 text-indigo-400" />
                  <span>Redefinir Senha de {resetModalUser.username}</span>
                </div>
                <button
                  onClick={() => setResetModalUser(null)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-xs text-slate-400">
                Digite uma nova senha temporária. O usuário será obrigado a alterá-la no próximo login.
              </p>

              {resetError && (
                <div className="p-2.5 rounded-lg bg-rose-950/60 border border-rose-500/40 text-rose-300 text-xs">
                  {resetError}
                </div>
              )}

              <form onSubmit={handleConfirmResetPassword} className="space-y-3">
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="Nova senha temporária"
                  value={resetPasswordInput}
                  onChange={(e) => setResetPasswordInput(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs bg-slate-950 border border-slate-800 rounded-xl text-white font-mono focus:outline-none focus:border-indigo-500"
                />

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setResetModalUser(null)}
                    className="px-3 py-1.5 text-xs text-slate-400 hover:text-white bg-slate-900 border border-slate-800 rounded-xl"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isResetting}
                    className="px-4 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {isResetting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    <span>Confirmar Redefinição</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
