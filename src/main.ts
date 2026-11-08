import { mountGame } from './ui/app.js';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Missing game root');
mountGame(root);

if ('serviceWorker' in navigator && !window.SkewerAndroid) {
  navigator.serviceWorker.register('/sw.js').catch(() => {
    // Gameplay is still available when service workers are disabled by the host.
  });
}
