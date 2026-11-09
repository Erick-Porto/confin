import { supabase } from './supabase';
import { VAPID_PUBLIC_KEY } from './vapid';

/**
 * Notificações (Web Push). O aparelho se inscreve aqui; quem envia é o job diário
 * (.github/workflows/notify.yml), que lê push_subscriptions e as preferências do perfil.
 * O service worker que mostra os avisos é public/push-sw.js.
 */


/**
 * - unsupported: navegador sem notificações.
 * - needs-install: iPhone/iPad fora do app instalado (no iOS só funciona pela tela de início).
 * - denied: a pessoa bloqueou as notificações do site.
 * - off / on: inscrito ou não neste aparelho.
 */
export type PushState = 'unsupported' | 'needs-install' | 'denied' | 'off' | 'on';

function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Service worker pronto, com limite de espera (no modo dev ele não existe). */
async function readyRegistration(timeoutMs = 10000): Promise<ServiceWorkerRegistration> {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('O app ainda está sendo instalado. Tente de novo em alguns segundos.')), timeoutMs),
    ),
  ]);
}

export async function getPushState(): Promise<PushState> {
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (!supported) return isIOS() && !isStandalone() ? 'needs-install' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub ? 'on' : 'off';
}

/** Pede permissão, inscreve este aparelho e registra no banco para a pessoa logada. */
export async function enablePush(): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Permissão de notificação não concedida.');
  const reg = await readyRegistration();
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) }));
  const keys = sub.toJSON().keys ?? {};
  const { error } = await supabase.rpc('register_push', {
    p_endpoint: sub.endpoint,
    p_p256dh: keys.p256dh ?? '',
    p_auth: keys.auth ?? '',
    p_user_agent: navigator.userAgent,
  });
  if (error) {
    await sub.unsubscribe();
    throw error;
  }
}

/** Cancela a inscrição deste aparelho (no navegador e no banco). */
export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe();
}

/** Aviso local, só para conferir se o aparelho mostra notificações (não passa pelo servidor). */
export async function showTestNotification(): Promise<void> {
  const reg = await readyRegistration();
  await reg.showNotification('Confin', {
    body: 'As notificações estão funcionando neste aparelho.',
    tag: 'confin-teste',
    icon: new URL('icon.svg', reg.scope).href,
  });
}
