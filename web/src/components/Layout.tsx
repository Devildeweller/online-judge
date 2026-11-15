import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { APP_NAME } from '../lib/constants';
import { useTheme } from './theme';
import { Loading } from './ui';
import { useToast } from './Toast';

const LINKS = [
  { to: '/problems', label: 'Problems' },
  { to: '/contests', label: 'Contests' },
  { to: '/submissions', label: 'Submissions' },
  { to: '/leaderboard', label: 'Leaderboard' },
];

function UserMenu() {
  const { user, isAdmin, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !wrap.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  if (!user) return null;
  return (
    <div className="menu-wrap" ref={wrap}>
      <button className="btn btn-ghost" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="avatar sm">{user.username[0]}</span>
        <span className="hide-sm">{user.username}</span>
      </button>
      {open && (
        <div className="menu" role="menu" onClick={() => setOpen(false)}>
          <Link className="menu-item" role="menuitem" to={`/users/${user.username}`}>
            Profile
          </Link>
          <Link className="menu-item" role="menuitem" to="/submissions?mine=1">
            My submissions
          </Link>
          {isAdmin && (
            <Link className="menu-item" role="menuitem" to="/admin">
              Admin panel
            </Link>
          )}
          <div className="menu-sep" />
          <button
            className="menu-item"
            role="menuitem"
            onClick={() => {
              void logout().then(() => {
                toast.show('Signed out');
                navigate('/');
              });
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export function Layout() {
  const { user, ready } = useAuth();
  const { theme, toggle } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  // The problem workspace uses the full viewport; every other page is a centred column.
  const workspace = /^\/problems\/[^/]+$|^\/contests\/[^/]+\/problems\/[^/]+$/.test(location.pathname);

  useEffect(() => setMenuOpen(false), [location.pathname]);

  return (
    <div className="app">
      <header className="navbar">
        <div className="navbar-inner">
          <Link to="/" className="brand">
            <span className="brand-mark" aria-hidden="true">
              {'</>'}
            </span>
            {APP_NAME}
          </Link>
          <button className="btn btn-ghost btn-icon nav-toggle" aria-label="Toggle navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)}>
            ☰
          </button>
          <nav className={`nav-links ${menuOpen ? 'open' : ''}`} aria-label="Main">
            {LINKS.map((link) => (
              <NavLink key={link.to} to={link.to} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                {link.label}
              </NavLink>
            ))}
          </nav>
          <div className="nav-actions">
            <button className="btn btn-ghost btn-icon" onClick={toggle} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} title="Toggle theme">
              {theme === 'dark' ? '☀' : '☾'}
            </button>
            {ready && !user && (
              <>
                <Link className="btn btn-ghost" to="/login" state={{ from: location.pathname + location.search }}>
                  Sign in
                </Link>
                <Link className="btn btn-primary hide-sm" to="/register">
                  Create account
                </Link>
              </>
            )}
            <UserMenu />
          </div>
        </div>
      </header>
      <main className={`main ${workspace ? 'wide' : ''}`}>
        {/* Pages wait for the session restore, so they never render (or fetch) as a guest first. */}
        {ready ? <Outlet /> : <Loading />}
      </main>
      {!workspace && (
        <footer className="footer">
          {APP_NAME} · Node.js, PostgreSQL, Redis and a Docker sandbox
        </footer>
      )}
    </div>
  );
}
