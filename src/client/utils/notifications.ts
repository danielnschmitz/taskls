/**
 * Utilitários para Notificações Nativas do Navegador e Efeitos Sonoros com Web Audio API
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!audioCtx) {
      audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
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
export function playNotificationSound(): void {
  try {
    const ctx = getAudioContext();
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
 * Verifica se o navegador suporta a API de Notificações
 */
export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/**
 * Retorna o status de permissão atual ('granted', 'denied', 'default')
 */
export function getNotificationPermission(): NotificationPermission {
  if (!isNotificationSupported()) return 'denied';
  return Notification.permission;
}

/**
 * Solicita permissão ao usuário para emitir notificações no navegador
 */
export async function requestBrowserNotificationPermission(): Promise<NotificationPermission> {
  if (!isNotificationSupported()) return 'denied';
  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch (err) {
    console.error('[Notification] Erro ao solicitar permissão:', err);
    return 'denied';
  }
}

export interface BrowserNotificationOptions {
  body?: string;
  tag?: string;
  onClick?: () => void;
  silent?: boolean;
}

/**
 * Dispara uma notificação nativa no navegador do usuário e toca o som
 */
export async function triggerBrowserNotification(
  title: string,
  options?: BrowserNotificationOptions
): Promise<Notification | null> {
  if (!isNotificationSupported()) {
    return null;
  }

  // Toca o som (se não configurado como silencioso)
  if (!options?.silent) {
    playNotificationSound();
  }

  let permission = Notification.permission;

  if (permission === 'default') {
    permission = await requestBrowserNotificationPermission();
  }

  if (permission !== 'granted') {
    console.warn('[Notification] Permissão não concedida para notificações no navegador.');
    return null;
  }

  try {
    const notif = new Notification(title, {
      body: options?.body,
      tag: options?.tag,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
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

    return notif;
  } catch (err) {
    console.error('[Notification] Falha ao instanciar Notification:', err);
    return null;
  }
}
