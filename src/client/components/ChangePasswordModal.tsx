import React, { useState } from 'react';
import {
  X,
  KeyRound,
  Lock,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface ChangePasswordModalProps {
  isOpen: boolean;
  isForced?: boolean;
  onClose: () => void;
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({
  isOpen,
  isForced = false,
  onClose,
  onShowToast,
}) => {
  if (!isOpen) return null;

  const { changePassword } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!currentPassword) {
      setErrorMsg('Informe sua senha atual.');
      return;
    }

    if (newPassword.length < 4) {
      setErrorMsg('A nova senha deve possuir no mínimo 4 caracteres.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg('A nova senha e a confirmação não conferem.');
      return;
    }

    setIsLoading(true);

    try {
      const res = await changePassword(currentPassword, newPassword);
      if (res.success) {
        onShowToast('Senha alterada com sucesso!', 'success');
        onClose();
      } else {
        setErrorMsg(res.error || 'Falha ao alterar senha.');
      }
    } catch (err) {
      setErrorMsg('Erro inesperado ao alterar senha.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-[#0d1424] border border-slate-700/80 rounded-2xl shadow-2xl shadow-black/80 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl border flex items-center justify-center ${
              isForced
                ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                : 'bg-indigo-500/15 border-indigo-500/30 text-indigo-400'
            }`}>
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">
                {isForced ? 'Definir Senha Pessoal (Primeiro Acesso)' : 'Alterar Senha de Acesso'}
              </h3>
              <p className="text-xs text-slate-400">
                {isForced
                  ? 'É obrigatório definir sua própria senha para continuar'
                  : 'Defina uma nova senha para proteger seu TaskLS'}
              </p>
            </div>
          </div>
          {!isForced && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Banner de Primeiro Acesso Obrigatório */}
        {isForced && (
          <div className="px-6 py-3 bg-amber-500/10 border-b border-amber-500/20 text-amber-300 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <strong className="font-semibold block text-amber-200">Troca de Senha Obrigatória</strong>
              Para a segurança da sua conta, você deve alterar a senha inicial antes de acessar o sistema.
            </div>
          </div>
        )}

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Senha Atual */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Senha Atual
            </label>
            <input
              type={showPasswords ? 'text' : 'password'}
              required
              autoFocus
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Digite sua senha atual"
              className="w-full px-3.5 py-2 text-xs bg-slate-950/70 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono"
            />
          </div>

          {/* Nova Senha */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Nova Senha (mínimo 4 caracteres)
            </label>
            <input
              type={showPasswords ? 'text' : 'password'}
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Digite a nova senha"
              className="w-full px-3.5 py-2 text-xs bg-slate-950/70 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono"
            />
          </div>

          {/* Confirmar Nova Senha */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Confirmar Nova Senha
            </label>
            <input
              type={showPasswords ? 'text' : 'password'}
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repita a nova senha"
              className="w-full px-3.5 py-2 text-xs bg-slate-950/70 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono"
            />
          </div>

          {/* Alternar visibilidade */}
          <div className="flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={() => setShowPasswords(!showPasswords)}
              className="text-slate-400 hover:text-slate-200 flex items-center gap-1.5"
            >
              {showPasswords ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              <span>{showPasswords ? 'Ocultar senhas' : 'Ver senhas digitadas'}</span>
            </button>
          </div>

          {/* Ações */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2.5">
            {!isForced && (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-xl transition-all"
              >
                Cancelar
              </button>
            )}
            <button
              type="submit"
              disabled={isLoading}
              className="px-5 py-2 text-xs font-bold text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 rounded-xl shadow-lg shadow-indigo-600/30 flex items-center gap-2 transition-all disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Salvando...</span>
                </>
              ) : (
                <span>Salvar Nova Senha</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
