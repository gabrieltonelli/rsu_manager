import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Container, Search, Phone, MapPin, CheckCircle2, ArrowLeft, RefreshCw, Trash2 } from 'lucide-react';
import { apiFetch } from '../api/http';

export default function PublicVolquetesPage() {
  const [direccion, setDireccion] = useState('');
  const [verificando, setVerificando] = useState(false);
  const [consulta, setConsulta] = useState(null);

  const [telefono, setTelefono] = useState('');
  const [nombreSolicitante, setNombreSolicitante] = useState('');
  const [accionSeleccionada, setAccionSeleccionada] = useState('solicitar_nuevo');
  const [notas, setNotas] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [resultadoExito, setResultadoExito] = useState(null);
  const [error, setError] = useState('');

  const handleVerificar = async (e) => {
    e.preventDefault();
    setError('');
    setResultadoExito(null);
    setVerificando(true);
    try {
      const data = await apiFetch(
        `/volquetes/publico/verificar?direccion=${encodeURIComponent(direccion)}`
      );
      setConsulta(data);
      if (data.existe_gestion_activa) {
        setAccionSeleccionada('solicitar_cambio');
        setTelefono(data.gestion_activa.telefono_contacto || '');
        setNombreSolicitante(data.gestion_activa.nombre_solicitante || '');
      } else {
        setAccionSeleccionada('solicitar_nuevo');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setVerificando(false);
    }
  };

  const handleSolicitar = async (e) => {
    e.preventDefault();
    setError('');
    setEnviando(true);
    try {
      const res = await apiFetch('/volquetes/publico/solicitar', {
        method: 'POST',
        body: JSON.stringify({
          direccion,
          telefono_contacto: telefono,
          nombre_solicitante: nombreSolicitante || 'Solicitante Web',
          accion: accionSeleccionada,
          notas,
        }),
      });
      setResultadoExito(res);
      setConsulta(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="public-volquetes-page">
      <div className="public-container">
        <div className="public-topbar">
          <Link to="/login" className="btn btn-outline btn-sm">
            <ArrowLeft size={16} />
            <span>Volver al Acceso del Sistema</span>
          </Link>
          <span className="badge badge-emerald">Portal Público RSU · Volquetes</span>
        </div>

        <div className="card">
          <div className="card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div className="brand-logo">
                <Container size={22} />
              </div>
              <div>
                <h2>Solicitud y Gestión Pública de Volquetes</h2>
                <p className="text-muted">
                  Ingrese su dirección para solicitar un volquete nuevo, pedir un recambio o finalizar una gestión activa.
                </p>
              </div>
            </div>
          </div>

          {error && <div className="alert alert-danger">{error}</div>}

          {resultadoExito && (
            <div className="alert alert-success" style={{ marginBottom: '20px' }}>
              <CheckCircle2 size={22} />
              <div>
                <strong>¡Solicitud registrada con éxito!</strong>
                <p style={{ margin: '4px 0 0' }}>{resultadoExito.message}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleVerificar} className="search-address-bar">
            <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
              <label>1. Ingrese la dirección exacta de entrega o retiro</label>
              <div style={{ display: 'flex', gap: '10px' }}>
                <input
                  type="text"
                  required
                  placeholder="Ej: Av. Paseo Colón 850, CABA  o  Av. Corrientes 2500, CABA"
                  value={direccion}
                  onChange={(e) => setDireccion(e.target.value)}
                />
                <button type="submit" className="btn btn-primary" disabled={verificando}>
                  <Search size={18} />
                  <span>{verificando ? 'Consultando...' : 'Verificar Dirección'}</span>
                </button>
              </div>
              <small className="text-muted">
                Tip de prueba: ingresa <code>Av. Paseo Colón 850, CABA</code> para ver una dirección que ya tiene una gestión activa.
              </small>
            </div>
          </form>

          {consulta && (
            <div className="volquete-step-2">
              {consulta.existe_gestion_activa ? (
                <div className="active-volquete-notice">
                  <h4>
                    📍 Existe una gestión activa en "{consulta.gestion_activa.direccion}" (Código:{' '}
                    {consulta.gestion_activa.codigo})
                  </h4>
                  <p>
                    Estado actual: <strong>{consulta.gestion_activa.estado.toUpperCase()}</strong> · Envios realizados:{' '}
                    {consulta.gestion_activa.cantidad_envios} · Cambios: {consulta.gestion_activa.cantidad_cambios}
                  </p>
                  <p className="text-muted">
                    Seleccione si desea solicitar el <strong>retiro (cambio de volquete)</strong> o{' '}
                    <strong>finalizar la gestión</strong>:
                  </p>

                  <div className="action-radio-grid">
                    <label
                      className={`action-radio-card ${
                        accionSeleccionada === 'solicitar_cambio' ? 'selected' : ''
                      }`}
                    >
                      <input
                        type="radio"
                        name="accion"
                        value="solicitar_cambio"
                        checked={accionSeleccionada === 'solicitar_cambio'}
                        onChange={() => setAccionSeleccionada('solicitar_cambio')}
                      />
                      <RefreshCw size={20} />
                      <div>
                        <strong>Solicitar Retiro (Cambio)</strong>
                        <span>Se retira el volquete lleno y se deja uno vacío en la misma dirección.</span>
                      </div>
                    </label>

                    <label
                      className={`action-radio-card ${
                        accionSeleccionada === 'finalizar_gestion' ? 'selected' : ''
                      }`}
                    >
                      <input
                        type="radio"
                        name="accion"
                        value="finalizar_gestion"
                        checked={accionSeleccionada === 'finalizar_gestion'}
                        onChange={() => setAccionSeleccionada('finalizar_gestion')}
                      />
                      <Trash2 size={20} />
                      <div>
                        <strong>Finalizar la Gestión</strong>
                        <span>Se solicita el retiro definitivo del volquete sin reposición.</span>
                      </div>
                    </label>
                  </div>
                </div>
              ) : (
                <div className="new-volquete-notice">
                  <h4>
                    <MapPin size={18} /> No se registran gestiones activas en "{consulta.direccion_consultada}"
                  </h4>
                  <p>Puede solicitar el envío de un nuevo volquete completando sus datos de contacto a continuación.</p>
                </div>
              )}

              <form onSubmit={handleSolicitar} className="grid-form" style={{ marginTop: '18px' }}>
                <div className="form-group">
                  <label>
                    <Phone size={15} /> Número de Teléfono de Contacto (Obligatorio)
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="+54 9 11 5555-1234"
                    value={telefono}
                    onChange={(e) => setTelefono(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Nombre o Empresa Solicitante</label>
                  <input
                    type="text"
                    placeholder="Nombre y Apellido / Constructora"
                    value={nombreSolicitante}
                    onChange={(e) => setNombreSolicitante(e.target.value)}
                  />
                </div>

                <div className="form-group full-col">
                  <label>Indicaciones adicionales (horario o referencias de entrega)</label>
                  <input
                    type="text"
                    placeholder="Ej: Frente al portón gris, horario de 8 a 17 hs."
                    value={notas}
                    onChange={(e) => setNotas(e.target.value)}
                  />
                </div>

                <div className="full-col" style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button type="submit" className="btn btn-primary" disabled={enviando}>
                    <Container size={18} />
                    <span>
                      {enviando
                        ? 'Procesando solicitud...'
                        : consulta.existe_gestion_activa
                        ? accionSeleccionada === 'solicitar_cambio'
                          ? 'Confirmar Solicitud de Cambio (Retiro y Reposición)'
                          : 'Confirmar Finalización y Retiro Definitivo'
                        : 'Confirmar Solicitud de Nuevo Volquete'}
                    </span>
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

