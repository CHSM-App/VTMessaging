import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './styles/index.css';

// Saved theme. Lives here, not inline in index.html: the backend's CSP (helmet) blocks inline scripts.
try {
  const theme = localStorage.getItem('vmp-theme');
  if (theme) document.documentElement.dataset.theme = theme;
} catch {
  /* storage unavailable */
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
