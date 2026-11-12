import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  Users,
  Recycle,
  MapPin,
  Truck,
  Route,
  Container,
  Building2,
  BarChart3,
  ShieldCheck,
  Bell,
  LogOut,
  Menu,
  X,
  ExternalLink,
  Navigation,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { subscribeToWebPush } from '../api/http';

export default function AppLayout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pushStatus, setPushStatus] = useState('');

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleEnablePush = async () => {
    try {
      setPushStatus('Activando...');
      const res = await subscribeToWebPush();
      setPushStatus(res.message || 'Push activo');
      setTimeout(() => setPushStatus(''), 4000);
    } catch (err) {
      setPushStatus(err.message);
      setTimeout(() => setPushStatus(''), 4500);
    }
  };

  const rol = user?.rol_codigo;

  const navItems = [
    ...(rol === 'administrador'
      ? [
          { to: '/usuarios', label: 'Usuarios y Roles', icon: Users },
          { to: '/tipos-residuo', label: 'Tipos de Residuo', icon: Recycle },
          { to: '/puntos', label: 'Puntos de Recolección', icon: MapPin },
          { to: '/recolectores', label: 'Recolectores y Mapa Vivo', icon: Truck },
          { to: '/rutas', label: 'Generación de Rutas', icon: Route },
          { to: '/volquetes-admin', label: 'Volquetes · Administración', icon: Container },
          { to: '/clientes', label: 'Clientes e Historial', icon: Building2 },
          { to: '/auditoria', label: 'Auditoría (Triggers BD)', icon: ShieldCheck },
        ]
      : []),
    ...(rol === 'recolector'
      ? [
          { to: '/recolector', label: 'Home del Recolector', icon: Navigation },
        ]
      : []),
    ...(rol === 'cliente'
      ? [
          { to: '/mi-dashboard', label: 'Dashboard de Cliente', icon: Building2 },
        ]
      : []),
    ...(rol && rol !== 'pendiente_aprobacion'
      ? [
          { to: '/trazabilidad', label: 'Reporte de Trazabilidad', icon: BarChart3 },
        ]
      : []),
  ];

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <div className="brand-logo">RSU</div>
          <div>
            <div className="brand-title">RSU Manager</div>
            <div className="brand-subtitle">Inquilino: {user?.inquilino_codigo || 'RSU'}</div>
          </div>
          <button className="mobile-close-btn" onClick={() => setSidebarOpen(false)}>
            <X size={20} />
          </button>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}

          <div className="nav-divider" />
          <NavLink
            to="/volquetes/solicitud"
            onClick={() => setSidebarOpen(false)}
            className="nav-link public-link"
          >
            <ExternalLink size={18} />
            <span>Portal Público Volquetes</span>
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          <div className="user-summary">
            <div className="user-name">{user?.nombre_completo}</div>
            <div className="user-email">{user?.email}</div>
            <span className={`role-badge role-${rol}`}>{user?.rol_nombre}</span>
          </div>
          <button className="btn btn-outline btn-sm full-width" onClick={handleLogout}>
            <LogOut size={16} />
            <span>Cerrar Sesión</span>
          </button>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <button className="mobile-menu-btn" onClick={() => setSidebarOpen(true)}>
            <Menu size={22} />
          </button>
          <div className="topbar-left">
            <span className="security-pill">
              🔒 Sesión Cookie HttpOnly · RBAC en Tiempo Real
            </span>
          </div>
          <div className="topbar-right">
            {pushStatus && <span className="push-toast">{pushStatus}</span>}
            <button className="btn btn-secondary btn-sm" onClick={handleEnablePush} title="Activar y probar notificaciones Web Push">
              <Bell size={16} />
              <span>Notificaciones Push</span>
            </button>
          </div>
        </header>

        <main className="page-content">{children}</main>
      </div>
    </div>
  );
}

