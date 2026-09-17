import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export interface AuthUser {
  id: string;
  username: string;
  isAdmin: boolean;
  canAccessJira: boolean;
  isDefaultPassword?: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isDefaultPassword: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  changePassword: (currentPassword: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_STORAGE_KEY = 'taskls_auth_token';
const USER_STORAGE_KEY = 'taskls_auth_user';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_STORAGE_KEY));
  const [user, setUser] = useState<AuthUser | null>(() => {
    const saved = localStorage.getItem(USER_STORAGE_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return null;
      }
    }
    return null;
  });
  const [isLoading, setIsLoading] = useState(true);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
    setToken(null);
    setUser(null);
  }, []);

  // Interceptar globalmente o fetch para injetar o token e capturar 401
  useEffect(() => {
    const originalFetch = window.fetch;

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

      // Se for chamada para /api e não for /api/auth/login, anexa o token
      if (urlStr.includes('/api/') && !urlStr.includes('/api/auth/login')) {
        const currentToken = localStorage.getItem(TOKEN_STORAGE_KEY);
        if (currentToken) {
          init = init || {};
          const headers = new Headers(init.headers || {});
          if (!headers.has('Authorization')) {
            headers.set('Authorization', `Bearer ${currentToken}`);
          }
          init.headers = headers;
        }
      }

      const response = await originalFetch(input, init);

      // Se retornar 401 em uma rota protegida, desloga
      if (response.status === 401 && urlStr.includes('/api/') && !urlStr.includes('/api/auth/login')) {
        console.warn('[Auth] Requisição rejeitada com 401. Realizando logout automático.');
        logout();
      }

      return response;
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, [logout]);

  // Validar o token salvo ao carregar a página
  useEffect(() => {
    const verifyStoredToken = async () => {
      const savedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
      if (!savedToken) {
        setIsLoading(false);
        return;
      }

      try {
        const res = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${savedToken}` },
        });

        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
          localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(data.user));
          setToken(savedToken);
        } else {
          logout();
        }
      } catch (err) {
        console.error('[Auth] Erro ao validar token existente:', err);
      } finally {
        setIsLoading(false);
      }
    };

    verifyStoredToken();
  }, [logout]);

  const login = async (username: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });

      const data = await res.json();

      if (!res.ok) {
        return { success: false, error: data.error || 'Credenciais inválidas.' };
      }

      setToken(data.token);
      setUser(data.user);
      localStorage.setItem(TOKEN_STORAGE_KEY, data.token);
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(data.user));

      return { success: true };
    } catch (err: any) {
      console.error('[Auth] Erro no login:', err);
      return { success: false, error: 'Não foi possível conectar ao servidor.' };
    }
  };

  const changePassword = async (
    currentPassword: string,
    newPassword: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await res.json();

      if (!res.ok) {
        return { success: false, error: data.error || 'Erro ao alterar senha.' };
      }

      if (data.token) {
        setToken(data.token);
        localStorage.setItem(TOKEN_STORAGE_KEY, data.token);
      }
      if (data.user) {
        setUser(data.user);
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(data.user));
      }

      return { success: true };
    } catch (err: any) {
      console.error('[Auth] Erro ao alterar senha:', err);
      return { success: false, error: 'Erro de conexão ao alterar senha.' };
    }
  };

  const isAuthenticated = Boolean(token && user);
  const isDefaultPassword = Boolean(user?.isDefaultPassword);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated,
        isLoading,
        isDefaultPassword,
        login,
        logout,
        changePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser utilizado dentro de um AuthProvider');
  }
  return context;
};
