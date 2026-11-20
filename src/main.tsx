import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { isDesktop } from './sync/desktop';

// Offline support for the browser/installed-app version. The desktop window loads the
// files straight from disk, where a cached copy would only show an old version after a rebuild.
if (import.meta.env.PROD && !isDesktop && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => undefined);
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
