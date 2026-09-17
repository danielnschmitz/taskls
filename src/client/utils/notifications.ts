/**
 * Utilitários para Notificações Nativas do Navegador e Efeitos Sonoros com Web Audio API
 */

let audioCtx: AudioContext | null = null;
let swRegistrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;

/**
 * Obtém ou registra o Service Worker do TaskLS para disparo de notificações em background
 */
export async function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  if (swRegistrationPromise) {
    return swRegistrationPromise;
  }

  swRegistrationPromise = (async () => {
    try {
      // Tentar obter registro existente
      const existing = await navigator.serviceWorker.getRegistration('/');
      if (existing) {
        return existing;
      }
      // Registrar se ainda não registrado
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      console.log('[Notification SW] Service Worker registrado com sucesso:', reg.scope);
      return reg;
    } catch (err) {
      console.warn('[Notification SW] Não foi possível registrar Service Worker:', err);
      return null;
    }
  })();

  return swRegistrationPromise;
}

/**
 * Obtém e resume o contexto de áudio
 */
async function getAudioContext(): Promise<AudioContext | null> {
  if (typeof window === 'undefined') return null;
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!audioCtx) {
      audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  } catch (e) {
    return null;
  }
}

/**
 * Toca um aviso sonoro agradável (chime de dois tons: D5 -> A5)
 * utilizando exclusivamente a Web Audio API nativa sem arquivos externos
 */
export async function playNotificationSound(): Promise<void> {
  try {
    const ctx = await getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // Tom 1: 587.33 Hz (D5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now);

    gain1.gain.setValueAtTime(0.001, now);
    gain1.gain.exponentialRampToValueAtTime(0.25, now + 0.02);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);

    osc1.start(now);
    osc1.stop(now + 0.16);

    // Tom 2: 880.00 Hz (A5)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880.0, now + 0.1);

    gain2.gain.setValueAtTime(0.001, now + 0.1);
    gain2.gain.exponentialRampToValueAtTime(0.3, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);

    osc2.start(now + 0.1);
    osc2.stop(now + 0.46);
  } catch (err) {
    console.warn('[Audio] Não foi possível reproduzir som de notificação:', err);
  }
}

/**
 * Verifica se o contexto atual é seguro (HTTPS ou localhost/127.0.0.1)
 */
export function isSecureOrigin(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(window.isSecureContext);
}

/**
 * Verifica se o navegador suporta a API de Notificações
 */
export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && ('Notification' in window || 'serviceWorker' in navigator);
}

/**
 * Retorna o status de permissão atual ('granted', 'denied', 'default')
 */
export function getNotificationPermission(): NotificationPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'denied';
  return Notification.permission;
}

/**
 * Solicita permissão ao usuário para emitir notificações no navegador
 */
export async function requestBrowserNotificationPermission(): Promise<NotificationPermission> {
  if (!isNotificationSupported() || !('Notification' in window)) return 'denied';
  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch (err) {
    console.error('[Notification] Erro ao solicitar permissão:', err);
    return 'denied';
  }
}

export interface NotificationDiagnostic {
  supported: boolean;
  isSecureContext: boolean;
  permission: NotificationPermission;
  hasServiceWorker: boolean;
  canNotify: boolean;
}

/**
 * Diagnostica o estado atual do ambiente para disparo de notificações
 */
export async function diagnoseNotificationState(): Promise<NotificationDiagnostic> {
  const supported = isNotificationSupported();
  const isSecure = isSecureOrigin();
  const perm = getNotificationPermission();
  let hasSW = false;

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration('/');
      hasSW = Boolean(reg);
    }
  } catch {}

  return {
    supported,
    isSecureContext: isSecure,
    permission: perm,
    hasServiceWorker: hasSW,
    canNotify: supported && perm === 'granted',
  };
}

export interface BrowserNotificationOptions {
  body?: string;
  tag?: string;
  onClick?: () => void;
  silent?: boolean;
}

export interface TriggerNotificationResult {
  success: boolean;
  method: 'serviceworker' | 'notification' | 'none';
  error?: string;
}

/**
 * Dispara uma notificação nativa no navegador do usuário e toca o som.
 * Tenta utilizar o Service Worker (showNotification) para máxima compatibilidade com o SO;
 * se não disponível, utiliza new Notification().
 */
export async function triggerBrowserNotification(
  title: string,
  options?: BrowserNotificationOptions
): Promise<TriggerNotificationResult | null> {
  if (!isNotificationSupported()) {
    return { success: false, method: 'none', error: 'Navegador não suporta a API de Notificações.' };
  }

  // Toca o som (se não configurado como silencioso)
  if (!options?.silent) {
    playNotificationSound().catch(() => {});
  }

  let permission = getNotificationPermission();

  if (permission === 'default') {
    permission = await requestBrowserNotificationPermission();
  }

  if (permission !== 'granted') {
    console.warn('[Notification] Permissão não concedida para notificações no navegador:', permission);
    return {
      success: false,
      method: 'none',
      error: `Permissão de notificação está como '${permission}'.`,
    };
  }

  // 1. Tentar via Service Worker (mais confiável e suporta abas inativas no Windows/Chrome)
  try {
    const swReg = await getServiceWorkerRegistration();
    if (swReg && typeof swReg.showNotification === 'function') {
      await swReg.showNotification(title, {
        body: options?.body,
        tag: options?.tag || `taskls-${Date.now()}`,
        icon: '/icon-192.png',
        badge: '/favicon.png',
        data: { url: '/' },
      });
      console.log('[Notification] Notificação disparada com sucesso via Service Worker.');
      return { success: true, method: 'serviceworker' };
    }
  } catch (swErr) {
    console.warn('[Notification] Falha ao disparar via Service Worker, tentando fallback nativo:', swErr);
  }

  // 2. Fallback para new Notification nativo
  try {
    if ('Notification' in window) {
      const notif = new Notification(title, {
        body: options?.body,
        tag: options?.tag,
        icon: '/icon-192.png',
        badge: '/favicon.png',
      });

      notif.onclick = () => {
        try {
          window.focus();
        } catch {}
        if (options?.onClick) {
          options.onClick();
        }
        notif.close();
      };

      console.log('[Notification] Notificação disparada com sucesso via new Notification().');
      return { success: true, method: 'notification' };
    }
  } catch (err: any) {
    console.error('[Notification] Falha ao instanciar Notification:', err);
    return {
      success: false,
      method: 'none',
      error: err?.message || 'Erro desconhecido ao exibir notificação.',
    };
  }

  return { success: false, method: 'none', error: 'Nenhum mecanismo de notificação pôde ser executado.' };
}
