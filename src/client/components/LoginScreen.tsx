import React, { useState } from 'react';
import {
  CheckCircle2,
  Lock,
  User,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  ShieldCheck,
  Globe,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export const LoginScreen: React.FC = () => {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setErrorMsg('Informe o usuário e a senha para acessar.');
      return;
    }

    setIsLoading(true);
    setErrorMsg('');

    try {
      const result = await login(username, password);
      if (!result.success) {
        setErrorMsg(result.error || 'Credenciais inválidas. Verifique os dados.');
      }
    } catch (err: any) {
      setErrorMsg('Erro inesperado ao conectar ao servidor.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 flex flex-col justify-center items-center p-4 relative overflow-hidden selection:bg-indigo-500 selection:text-white">
      {/* Glow effects de fundo */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-violet-600/15 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-violet-500 shadow-xl shadow-indigo-500/25 ring-1 ring-white/20 mb-4">
            <CheckCircle2 className="w-8 h-8 text-white" />
          </div>
          <div className="flex items-center justify-center gap-2 mb-1">
            <h1 className="text-2xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-100 to-slate-300">
              TaskLS
            </h1>
            <span className="px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/25">
              Cloud Ready
            </span>
          </div>
          <p className="text-xs text-slate-400 font-medium">
            Gestão Inteligente de Tarefas & Demandas
          </p>
        </div>

        {/* Login Box */}
        <div className="bg-[#0c1222]/90 backdrop-blur-xl border border-slate-800 rounded-3xl p-7 shadow-2xl shadow-black/60">
          <div className="mb-6">
            <h2 className="text-base font-bold text-white tracking-tight">
              Acesso Seguro
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Entre com suas credenciais para gerenciar suas tarefas
            </p>
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="mb-5 p-3 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2.5 animate-in fade-in slide-in-from-top-1">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Input Usuário */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Usuário
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  autoFocus
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Ex: admin"
                  className="w-full pl-10 pr-3.5 py-2.5 text-xs bg-slate-950/60 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                />
              </div>
            </div>

            {/* Input Senha */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Senha
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-2.5 text-xs bg-slate-950/60 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 transition-all disabled:opacity-50 hover:scale-[1.01] active:scale-[0.99]"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Autenticando...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Entrar no TaskLS</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Dica de Acesso Inicial */}
          <div className="mt-6 pt-5 border-t border-slate-800/80 text-center">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-indigo-950/40 border border-indigo-500/20 text-[11px] text-indigo-300 font-medium">
              <Globe className="w-3 h-3 text-indigo-400" />
              <span>Acesso Inicial: usuário <strong>admin</strong> e senha <strong>admin</strong></span>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <p className="text-center text-[11px] text-slate-600 mt-6">
          Protegido com PBKDF2/SHA-512 &bull; Pronto para uso em servidor web
        </p>
      </div>
    </div>
  );
};
