import { NavLink, Outlet } from 'react-router-dom';
import { usePageTitle } from '../../components/ui';

const LINKS = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/problems', label: 'Problems', end: false },
  { to: '/admin/contests', label: 'Contests', end: false },
  { to: '/admin/users', label: 'Users', end: false },
];

export function AdminLayout() {
  usePageTitle('Admin');
  return (
    <div className="admin">
      <nav className="side-nav" aria-label="Admin">
        {LINKS.map((link) => (
          <NavLink key={link.to} to={link.to} end={link.end} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            {link.label}
          </NavLink>
        ))}
      </nav>
      <div style={{ minWidth: 0 }}>
        <Outlet />
      </div>
    </div>
  );
}
