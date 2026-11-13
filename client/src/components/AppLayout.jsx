import React, { useState, useEffect, useRef } from 'react';
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
  Navigation,
  ChevronDown,
  User as UserIcon,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { subscribeToWebPush } from '../api/http';
import RsuLogo from './RsuLogo';
import pkg from '../../package.json';

export default function AppLayout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const [pushStatus, setPushStatus] = useState('');
  const avatarDropdownRef = useRef(null);

  // Bloquear el scroll del fondo cuando el drawer o un modal estén abiertos
  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';
    } else {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    }

    return () => {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    };
  }, [sidebarOpen]);

  // Listener para cerrar el dropdown al hacer clic fuera
  useEffect(() => {
    function handleClickOutside(event) {
      if (avatarDropdownRef.current && !avatarDropdownRef.current.contains(event.target)) {
        setAvatarMenuOpen(false);
      }
    }

    if (avatarMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [avatarMenuOpen]);

  // Observer global para congelar el scroll del body ante modales abiertos (.modal-backdrop)
  useEffect(() => {
    const checkModals = () => {
      const modalOpen = Boolean(document.querySelector('.modal-backdrop'));
      if (modalOpen && !sidebarOpen) {
        document.body.style.overflow = 'hidden';
      } else if (!sidebarOpen) {
        document.body.style.overflow = '';
      }
    };

    const observer = new MutationObserver(checkModals);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, [sidebarOpen]);

  const handleLogout = async () => {
    setAvatarMenuOpen(false);
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

  // Obtener iniciales para el avatar
  const initials = user?.nombre_completo
    ? user.nombre_completo
        .split(' ')
        .map((n) => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'U';

  return (
    <div className="app-shell">
      {/* Fondo oscurecido para mobile que previene eventos y scroll */}
      {sidebarOpen && (
        <div
          className="drawer-backdrop"
          onClick={() => setSidebarOpen(false)}
          onTouchMove={(e) => e.preventDefault()}
          onWheel={(e) => e.preventDefault()}
        />
      )}

      {/* Drawer / Sidebar Lateral */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <span className="sidebar-brand-title">Menú de Navegación</span>
          <button
            className="mobile-close-btn"
            onClick={() => setSidebarOpen(false)}
            aria-label="Cerrar menú"
          >
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
        </nav>
      </aside>

      {/* Área Principal */}
      <div className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="mobile-menu-btn"
              onClick={() => setSidebarOpen(true)}
              aria-label="Abrir menú"
              style={{ marginRight: '4px' }}
            >
              <Menu size={22} />
            </button>

            {/* Logo de la aplicación ahora ubicado en el Header */}
            <RsuLogo size="sm" showText={true} />

            {/* Versión extraída dinámicamente de client/package.json */}
            <span className="version-pill" title={`Versión de la app: ${pkg.version}`}>
              v{pkg.version}
            </span>
          </div>

          <div className="topbar-right">
            {pushStatus && <span className="push-toast">{pushStatus}</span>}

            {/* Menú desplegable del Avatar del Usuario */}
            <div className="user-menu-container" ref={avatarDropdownRef}>
              <button
                type="button"
                className={`avatar-btn ${avatarMenuOpen ? 'active' : ''}`}
                onClick={() => setAvatarMenuOpen(!avatarMenuOpen)}
                aria-label="Menú de usuario"
              >
                <div className="avatar-circle">{initials}</div>
                <ChevronDown size={14} style={{ color: '#64748b' }} />
              </button>

              {avatarMenuOpen && (
                <div className="avatar-dropdown">
                  <div className="dropdown-user-header">
                    <div className="dropdown-user-name">{user?.nombre_completo}</div>
                    <div className="dropdown-user-email">{user?.email}</div>
                    <span className={`role-badge role-${rol}`}>{user?.rol_nombre}</span>
                  </div>

                  <button
                    type="button"
                    className="dropdown-item"
                    onClick={() => {
                      setAvatarMenuOpen(false);
                      handleEnablePush();
                    }}
                    title="Activar notificaciones Web Push"
                  >
                    <Bell size={16} />
                    <span>Notificaciones Push</span>
                  </button>

                  <button
                    type="button"
                    className="dropdown-item logout"
                    onClick={handleLogout}
                  >
                    <LogOut size={16} />
                    <span>Cerrar Sesión</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="page-content">{children}</main>
      </div>
    </div>
  );
}
