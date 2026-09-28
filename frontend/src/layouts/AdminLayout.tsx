import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../app/providers';
import { getSocket } from '../services/socket/socket';

const NAV = [
  ['/', 'Dashboard', '◧'],
  ['/projects', 'Projects', '▦'],
  ['/instances', 'WhatsApp Instances', '◉'],
  ['/messages', 'Messages', '✉'],
  ['/templates', 'Templates', '☰'],
  ['/api-keys', 'API Keys', '⚿'],
  ['/webhooks', 'Webhooks', '⇄'],
  ['/logs', 'Logs', '≡'],
  ['/settings', 'Settings', '⚙'],
] as const;

function useTheme() {
  const [theme, setTheme] = useState<string>(() => document.documentElement.dataset.theme ?? '');
  useEffect(() => {
    if (theme) document.documentElement.dataset.theme = theme;
    try {
      if (theme) localStorage.setItem('vmp-theme', theme);
    } catch {
      /* ignore */
    }
  }, [theme]);
  const isDark = theme ? theme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  return { isDark, toggle: () => setTheme(isDark ? 'light' : 'dark') };
}

function useLive() {
  const [live, setLive] = useState(false);
  useEffect(() => {
    const s = getSocket();
    const on = () => setLive(true);
    const off = () => setLive(false);
    s.on('connect', on);
    s.on('disconnect', off);
    s.on('connect_error', off);
    setLive(s.connected);
    return () => {
      s.off('connect', on);
      s.off('disconnect', off);
      s.off('connect_error', off);
    };
  }, []);
  return live;
}

export function AdminLayout() {
  const { user, logout } = useAuth();
  const { isDark, toggle } = useTheme();
  const live = useLive();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);

  const sidebar = (
    <nav className="flex flex-col gap-1.5" aria-label="Main">
      {NAV.map(([to, label, icon]) => (
        <NavLink key={to} to={to} end={to === '/'} className="neu-nav">
          <span className="w-5 text-center" aria-hidden>
            {icon}
          </span>
          {label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen lg:flex">
      <aside className="hidden w-64 shrink-0 p-5 lg:block">
        <div className="sticky top-5">
          <Brand />
          {sidebar}
        </div>
      </aside>

      <div className="min-w-0 flex-1 px-4 pb-10 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between gap-3 py-5">
          <button className="neu-btn neu-btn-sm lg:hidden" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Menu">
            ☰
          </button>
          <div className="lg:hidden">
            <Brand compact />
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className="neu-badge hidden text-xs sm:inline-flex" title="Realtime updates">
              <span className={`h-2 w-2 rounded-full ${live ? 'bg-success' : 'bg-muted'}`} aria-hidden />
              {live ? 'Live' : 'Offline'}
            </span>
            <button className="neu-btn neu-btn-sm" onClick={toggle} aria-label="Toggle dark mode">
              {isDark ? '☀' : '☾'}
            </button>
            <div className="hidden text-right text-sm sm:block">
              <div className="font-medium text-heading">{user?.name}</div>
              <div className="text-xs text-muted">{user?.role}</div>
            </div>
            <button className="neu-btn neu-btn-sm" onClick={logout}>
              Sign out
            </button>
          </div>
        </header>
        {open && <div className="neu-card mb-6 p-4 lg:hidden">{sidebar}</div>}
        <main>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function Brand({ compact }: { compact?: boolean }) {
  return (
    <div className={`flex items-center gap-3 ${compact ? '' : 'mb-8 px-2'}`}>
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-lg text-white shadow-[var(--neu-small)]">✉</div>
      {!compact && (
        <div>
          <div className="font-medium leading-tight text-heading">Vengurla Tech</div>
          <div className="text-xs text-muted">WhatsApp Messaging</div>
        </div>
      )}
    </div>
  );
}
