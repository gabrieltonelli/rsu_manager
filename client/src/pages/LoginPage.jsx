import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  LogIn,
  ArrowLeft,
  Mail,
  Lock,
  User,
  Phone,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Clock,
  Shield,
  Container,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../api/http';

export function LoginPage() {
  const { user, login, startGoogleOAuth } = useAuth();
  const navigate = useNavigate();

  // Estados de vista: 'login' | 'recuperar' | 'registro'
  const [activeCard, setActiveCard] = useState('login');

  // Estados para Login
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Estados para Recuperar Contraseña
  const [recoverEmail, setRecoverEmail] = useState('');
  const [recoverSent, setRecoverSent] = useState(false);

  // Estados para Registro
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [regSuccess, setRegSuccess] = useState(false);

  // Manejo de carga y errores
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');

  useEffect(() => {
    if (user) {
      if (user.rol_codigo === 'pendiente_aprobacion') navigate('/pendiente');
      else if (user.rol_codigo === 'recolector') navigate('/recolector');
      else if (user.rol_codigo === 'cliente') navigate('/mi-dashboard');
      else navigate('/usuarios');
    }
  }, [user, navigate]);

  const resetFormState = () => {
    setError('');
    setInfoMessage('');
    setSubmitting(false);
  };

  const handleSwitchCard = (card) => {
    resetFormState();
    setActiveCard(card);
  };

  // 1. Submit Login Email/Password
  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    resetFormState();
    setSubmitting(true);
    try {
      await login(loginEmail, loginPassword);
    } catch (err) {
      setError(err.message || 'Error al iniciar sesión.');
    } finally {
      setSubmitting(false);
    }
  };

  // 2. Click Login Google
  const handleGoogleClick = async () => {
    resetFormState();
    try {
      await startGoogleOAuth();
    } catch (err) {
      setError(err.message || 'No se pudo iniciar el inicio de sesión con Google.');
    }
  };

  // 3. Submit Recuperar Contraseña
  const handleRecoverSubmit = async (e) => {
    e.preventDefault();
    resetFormState();
    setSubmitting(true);
    try {
      const res = await apiFetch('/auth/recuperar-password', {
        method: 'POST',
        body: JSON.stringify({ email: recoverEmail }),
      });
      setRecoverSent(true);
      setInfoMessage(
        res?.message ||
          'En caso de existir en el sistema, recibirá un email con instrucciones para restablecer su contraseña.'
      );
    } catch (err) {
      setError(err.message || 'Error al procesar la solicitud de recuperación.');
    } finally {
      setSubmitting(false);
    }
  };

  // 4. Submit Registro
  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    resetFormState();

    if (regPassword !== regConfirmPassword) {
      setError('Las contraseñas ingresadas no coinciden.');
      return;
    }
    if (regPassword.length < 6) {
      setError('La contraseña debe tener un mínimo de 6 caracteres.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch('/auth/registro', {
        method: 'POST',
        body: JSON.stringify({
          nombre_completo: regName,
          email: regEmail,
          telefono: regPhone,
          password: regPassword,
        }),
      });
      setRegSuccess(true);
      setInfoMessage(
        res?.message ||
          'Su solicitud de registro ha sido enviada exitosamente y está sujeta a aprobación de un Administrador.'
      );
    } catch (err) {
      setError(err.message || 'Error al enviar la solicitud de registro.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        {/* Cabecera limpia y minimalista */}
        <div className="auth-header-minimal">
          <img
            src="/brand/rsu-symbol.png"
            alt="RSU Símbolo"
            className="auth-header-symbol"
          />
          <h1 className="auth-header-title">Manager</h1>
        </div>

        {error && (
          <div className="alert alert-danger" style={{ marginBottom: '16px' }}>
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {/* VISTA 1: CARD DE INICIO DE SESIÓN */}
        {activeCard === 'login' && (
          <>
            <form onSubmit={handleLoginSubmit} className="auth-form">
              <div className="form-group">
                <label>Correo Electrónico</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="email"
                    required
                    placeholder="usuario@rsu.com.ar"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Contraseña</label>
                <input
                  type="password"
                  required
                  placeholder="••••••••••••"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                />
              </div>

              {/* Botón verde de Email */}
              <button
                type="submit"
                className="btn btn-primary full-width"
                disabled={submitting}
                style={{ marginTop: '4px' }}
              >
                <LogIn size={18} />
                <span>{submitting ? 'Verificando...' : 'Iniciar Sesión con Email'}</span>
              </button>

              {/* Botón azul de Google con icono */}
              <button
                type="button"
                className="btn btn-google-blue full-width"
                onClick={handleGoogleClick}
                disabled={submitting}
                style={{ marginTop: '10px' }}
              >
                <span className="google-icon-wrapper">
                  <svg width="16" height="16" viewBox="0 0 24 24">
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
                </span>
                <span>Iniciar Sesión con Google</span>
              </button>
            </form>

            {/* Enlaces inferiores divididos por pipe */}
            <div className="auth-links-row">
              <button
                type="button"
                className="auth-link-btn"
                onClick={() => handleSwitchCard('recuperar')}
              >
                Recuperar contraseña
              </button>
              <span className="auth-pipe-separator">|</span>
              <button
                type="button"
                className="auth-link-btn"
                onClick={() => handleSwitchCard('registro')}
              >
                Registrarse
              </button>
            </div>
          </>
        )}

        {/* VISTA 2: CARD RECUPERAR CONTRASEÑA */}
        {activeCard === 'recuperar' && (
          <div>
            <div style={{ marginBottom: '16px' }}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => handleSwitchCard('login')}
                style={{ paddingLeft: 0, gap: '6px' }}
              >
                <ArrowLeft size={16} />
                <span>Volver al inicio de sesión</span>
              </button>
            </div>

            <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px', color: '#1e293b' }}>
              Recuperar Contraseña
            </h2>
            <p className="text-muted" style={{ fontSize: '13px', marginBottom: '20px', lineHeight: 1.5 }}>
              Ingrese el correo electrónico registrado en su cuenta. Le enviaremos un enlace con las instrucciones para establecer una nueva clave de acceso.
            </p>

            {recoverSent ? (
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <div
                  style={{
                    width: '48px',
                    height: '48px',
                    background: '#dcfce7',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 14px',
                    color: '#16a34a',
                  }}
                >
                  <CheckCircle2 size={28} />
                </div>
                <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px', color: '#0f172a' }}>
                  Instrucciones enviadas
                </h3>
                <p style={{ fontSize: '13px', color: '#475569', lineHeight: 1.5, marginBottom: '20px' }}>
                  {infoMessage}
                </p>
                <button
                  type="button"
                  className="btn btn-primary full-width"
                  onClick={() => handleSwitchCard('login')}
                >
                  Regresar a Iniciar Sesión
                </button>
              </div>
            ) : (
              <form onSubmit={handleRecoverSubmit} className="auth-form">
                <div className="form-group">
                  <label>Correo Electrónico</label>
                  <input
                    type="email"
                    required
                    placeholder="usuario@rsu.com.ar"
                    value={recoverEmail}
                    onChange={(e) => setRecoverEmail(e.target.value)}
                  />
                </div>

                <button
                  type="submit"
                  className="btn btn-primary full-width"
                  disabled={submitting}
                  style={{ marginTop: '10px' }}
                >
                  <Mail size={16} />
                  <span>{submitting ? 'Procesando...' : 'Enviar instrucciones de recuperación'}</span>
                </button>
              </form>
            )}
          </div>
        )}

        {/* VISTA 3: CARD REGISTRARSE (SUJETO A APROBACIÓN) */}
        {activeCard === 'registro' && (
          <div>
            <div style={{ marginBottom: '16px' }}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => handleSwitchCard('login')}
                style={{ paddingLeft: 0, gap: '6px' }}
              >
                <ArrowLeft size={16} />
                <span>Volver al inicio de sesión</span>
              </button>
            </div>

            <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '6px', color: '#1e293b' }}>
              Solicitud de Registro
            </h2>

            {/* Advertencia destacada de Aprobación */}
            <div
              style={{
                background: '#fffbeb',
                border: '1px solid #fde68a',
                borderRadius: '8px',
                padding: '12px',
                marginBottom: '18px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
              }}
            >
              <Clock size={18} style={{ color: '#d97706', flexShrink: 0, marginTop: '2px' }} />
              <div style={{ fontSize: '12px', color: '#92400e', lineHeight: 1.45 }}>
                <strong>Aviso de Seguridad:</strong> Las cuentas nuevas quedan registradas en estado{' '}
                <em>Pendiente de Aprobación</em>. Un Administrador revisará su perfil y le asignará el rol correspondiente antes de permitir el acceso a las funciones operativas.
              </div>
            </div>

            {regSuccess ? (
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <div
                  style={{
                    width: '48px',
                    height: '48px',
                    background: '#fef3c7',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 14px',
                    color: '#d97706',
                  }}
                >
                  <CheckCircle2 size={28} />
                </div>
                <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px', color: '#0f172a' }}>
                  Solicitud Registrada
                </h3>
                <p style={{ fontSize: '13px', color: '#475569', lineHeight: 1.5, marginBottom: '20px' }}>
                  {infoMessage}
                </p>
                <button
                  type="button"
                  className="btn btn-primary full-width"
                  onClick={() => handleSwitchCard('login')}
                >
                  Ir al Inicio de Sesión
                </button>
              </div>
            ) : (
              <form onSubmit={handleRegisterSubmit} className="auth-form">
                <div className="form-group">
                  <label>Nombre y Apellido</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Juan Pérez"
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Correo Electrónico</label>
                  <input
                    type="email"
                    required
                    placeholder="ejemplo@rsu.com.ar"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Teléfono de Contacto (Opcional)</label>
                  <input
                    type="tel"
                    placeholder="+54 9 11 ..."
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Contraseña</label>
                  <input
                    type="password"
                    required
                    placeholder="Mínimo 6 caracteres"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Confirmar Contraseña</label>
                  <input
                    type="password"
                    required
                    placeholder="Repita su contraseña"
                    value={regConfirmPassword}
                    onChange={(e) => setRegConfirmPassword(e.target.value)}
                  />
                </div>

                <button
                  type="submit"
                  className="btn btn-primary full-width"
                  disabled={submitting}
                  style={{ marginTop: '10px' }}
                >
                  <User size={16} />
                  <span>{submitting ? 'Enviando solicitud...' : 'Enviar Solicitud de Registro'}</span>
                </button>
              </form>
            )}
          </div>
        )}
      </div>
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
