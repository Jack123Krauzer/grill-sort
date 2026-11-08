interface NativeBridge {
  request(id: string, method: string, path: string, auth: string, body: string): void;
  share(title: string, text: string, url: string): void;
  shareUrl(): string;
}

declare global {
  interface Window {
    SkewerAndroid?: NativeBridge;
    skewerApiReply?: (id: string, status: number, body: string) => void;
  }
}

const pending = new Map<string, (response: Response) => void>();
let requestNumber = 0;

if (window.SkewerAndroid) {
  window.skewerApiReply = (id, status, body) => {
    const resolve = pending.get(id);
    pending.delete(id);
    resolve?.(new Response(body, { status, headers: { 'Content-Type': 'application/json' } }));
  };
}

export function gameFetch(input: string, init?: RequestInit): Promise<Response> {
  const bridge = window.SkewerAndroid;
  if (!bridge) return fetch(input, init);
  const headers = new Headers(init?.headers);
  return new Promise((resolve, reject) => {
    const id = String(++requestNumber);
    const timeout = window.setTimeout(() => {
      pending.delete(id);
      reject(new Error('The code service timed out.'));
    }, 18_000);
    pending.set(id, (response) => {
      window.clearTimeout(timeout);
      resolve(response);
    });
    try {
      bridge.request(id, init?.method ?? 'GET', input, headers.get('authorization') ?? '', String(init?.body ?? ''));
    } catch (error) {
      pending.delete(id);
      window.clearTimeout(timeout);
      reject(error);
    }
  });
}

export function getShareUrl(): URL | null {
  if (window.SkewerAndroid) {
    const url = window.SkewerAndroid.shareUrl();
    return url ? new URL(url) : null;
  }
  return new URL('/', window.location.origin);
}

export function canShareGame(): boolean {
  return Boolean(window.SkewerAndroid || navigator.share);
}

export async function shareGame(data: ShareData): Promise<void> {
  if (window.SkewerAndroid) {
    window.SkewerAndroid.share(data.title ?? '', data.text ?? '', data.url ?? '');
    return;
  }
  await navigator.share(data);
}
