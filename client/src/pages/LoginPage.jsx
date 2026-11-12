import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Shield, LogIn, Container, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../api/http';
import RsuLogo from '../components/RsuLogo';

export function LoginPage() {
  const { user, login, startGoogleOAuth, registerGooglePending } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showGoogleModal, setShowGoogleModal] = useState(false);
  const [googleEmail, setGoogleEmail] = useState('');
  const [googleName, setGoogleName] = useState('');

  useEffect(() => {
    if (user) {
      if (user.rol_codigo === 'pendiente_aprobacion') navigate('/pendiente');
      else if (user.rol_codigo === 'recolector') navigate('/recolector');
      else if (user.rol_codigo === 'cliente') navigate('/mi-dashboard');
      else navigate('/usuarios');
    }
  }, [user, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleClick = async () => {
    setError('');
    try {
      await startGoogleOAuth();
    } catch (err) {
      setShowGoogleModal(true);
    }
  };

  const handleGoogleModalSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await registerGooglePending(googleEmail, googleName);
      setShowGoogleModal(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const fillDemo = (demoEmail, demoPass) => {
    setEmail(demoEmail);
    setPassword(demoPass);
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <div style={{ marginBottom: '14px' }}>
            <RsuLogo size="lg" />
          </div>
          <h1>Gestión de Recolección y Reciclaje</h1>
          <p>Puntos de recolección, rutas óptimas, volquetes y trazabilidad integral</p>
        </div>

        {error && (
          <div className="alert alert-danger">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label>Correo Electrónico</label>
            <input
              type="email"
              required
              placeholder="usuario@rsu.com.ar"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>Contraseña</label>
            <input
              type="password"
              required
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button type="submit" className="btn btn-primary full-width" disabled={submitting}>
            <LogIn size={18} />
            <span>{submitting ? 'Verificando credenciales...' : 'Iniciar Sesión con Email'}</span>
          </button>
        </form>

        <div className="auth-separator">
          <span>o ingresar con proveedor externo</span>
        </div>

        <div className="google-buttons">
          <button type="button" className="btn btn-outline full-width" onClick={handleGoogleClick}>
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path
                fill="#EA4335"
                d="M12 5c1.6 0 3 .6 4.1 1.7l3.1-3.1C17.3 1.8 14.8 1 12 1 7.4 1 3.5 3.6 1.6 7.4l3.7 2.8C6.2 7.2 8.9 5 12 5z"
              />
              <path
                fill="#4285F4"
                d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.6l3.7 2.9c2.2-2 3.7-5 3.7-8.7z"
              />
              <path
                fill="#FBBC05"
                d="M5.3 14.8c-.2-.8-.4-1.6-.4-2.5s.2-1.7.4-2.5L1.6 7C.6 9 0 11.2 0 13.5s.6 4.5 1.6 6.5l3.7-2.9z"
              />
              <path
                fill="#34A853"
                d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3.1 0-5.8-2.1-6.7-5l-3.7 2.8C3.5 19.9 7.4 23 12 23z"
              />
            </svg>
            <span>Continuar con cuenta de Google (Supabase OAuth)</span>
          </button>

          <button
            type="button"
            className="btn btn-ghost btn-sm full-width"
            onClick={() => setShowGoogleModal(true)}
          >
            ¿Primera vez con Google? Solicitar alta de cuenta Google (Estado Pendiente)
          </button>
        </div>

        <div className="demo-credentials-box">
          <div className="demo-title">
            <Shield size={15} />
            <span>Accesos rápidos por rol (Datos Semilla en Supabase):</span>
          </div>
          <div className="demo-buttons">
            <button
              type="button"
              className="chip-btn"
              onClick={() => fillDemo('admin@rsu.com.ar', 'AdminRSU2026!')}
            >
              Administrador
            </button>
            <button
              type="button"
              className="chip-btn"
              onClick={() => fillDemo('recolector1@rsu.com.ar', 'Recolector2026!')}
            >
              Recolector (Carlos)
            </button>
            <button
              type="button"
              className="chip-btn"
              onClick={() => fillDemo('cliente@ecopack.com.ar', 'Cliente2026!')}
            >
              Cliente (EcoPack)
            </button>
          </div>
        </div>

        <div className="public-portal-banner">
          <Container size={20} />
          <div>
            <strong>¿Necesitas pedir o retirar un Volquete?</strong>
            <p>Accede sin usuario al portal público de gestión por dirección.</p>
          </div>
          <Link to="/volquetes/solicitud" className="btn btn-secondary btn-sm">
            Ir a Volquetes
          </Link>
        </div>
      </div>

      {showGoogleModal && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <h3>Ingreso con Cuenta de Google</h3>
            <p className="text-muted">
              Según la política de seguridad del sistema, toda cuenta nueva que ingresa con Google se registra en estado{' '}
              <strong>Pendiente de Aprobación</strong> hasta que un Administrador la habilite y le asigne su rol.
            </p>
            <form onSubmit={handleGoogleModalSubmit} className="auth-form">
              <div className="form-group">
                <label>Correo de Google (@gmail.com / corporativo)</label>
                <input
                  type="email"
                  required
                  placeholder="ejemplo@gmail.com"
                  value={googleEmail}
                  onChange={(e) => setGoogleEmail(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Nombre y Apellido</label>
                <input
                  type="text"
                  required
                  placeholder="Juan Pérez"
                  value={googleName}
                  onChange={(e) => setGoogleName(e.target.value)}
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-outline" onClick={() => setShowGoogleModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  Continuar con Google
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export function OAuthCallbackPage() {
  const { refreshUser } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState('Validando credenciales de Google con el servidor...');

  useEffect(() => {
    async function processCallback() {
      try {
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        const accessToken = hashParams.get('access_token');
        // Limpiar inmediatamente el hash de la barra de direcciones para no dejar tokens en el DOM/URL
        window.history.replaceState(null, '', window.location.pathname);

        if (!accessToken) {
          setStatus('No se recibió token OAuth. Redirigiendo al login...');
          setTimeout(() => navigate('/login'), 1500);
          return;
        }

        await apiFetch('/auth/oauth-exchange', {
          method: 'POST',
          body: JSON.stringify({ access_token: accessToken }),
        });

        const loggedUser = await refreshUser();
        if (loggedUser?.rol_codigo === 'pendiente_aprobacion') {
          navigate('/pendiente');
        } else {
          navigate('/');
        }
      } catch (err) {
        setStatus(`Error: ${err.message}`);
        setTimeout(() => navigate('/login'), 2500);
      }
    }
    processCallback();
  }, [navigate, refreshUser]);

  return (
    <div className="auth-page">
      <div className="auth-card" style={{ textAlign: 'center' }}>
        <h3>Autenticación OAuth</h3>
        <p>{status}</p>
      </div>
    </div>
  );
}

export function PendingApprovalPage() {
  const { user, logout, refreshUser } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user && user.rol_codigo !== 'pendiente_aprobacion') {
      navigate('/');
    }
  }, [user, navigate]);

  return (
    <div className="auth-page">
      <div className="auth-card" style={{ textAlign: 'center' }}>
        <div className="brand-logo large" style={{ background: '#f59e0b', margin: '0 auto 16px' }}>
          <Clock size={28} />
        </div>
        <h2>Cuenta Pendiente de Aprobación</h2>
        <p className="text-muted" style={{ marginBottom: '20px' }}>
          Hola <strong>{user?.nombre_completo}</strong> ({user?.email}). Tu cuenta fue registrada correctamente pero el
          sistema no permite autogestión de permisos: un <strong>Administrador</strong> debe asignarte un rol (Cliente,
          Recolector o Administrador) para habilitar tu acceso.
        </p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <button className="btn btn-primary" onClick={refreshUser}>
            <CheckCircle2 size={16} />
            <span>Comprobar si ya fui aprobado</span>
          </button>
          <button
            className="btn btn-outline"
            onClick={async () => {
              await logout();
              navigate('/login');
            }}
          >
            Cerrar Sesión
          </button>
        </div>
      </div>
    </div>
  );
}

