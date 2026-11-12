import React, { useState, useEffect } from 'react';
import {
  MapPin,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  Trash2,
  PlusCircle,
  HelpCircle,
  Phone,
  User,
  AlertCircle,
  Building,
  Navigation,
} from 'lucide-react';
import { apiFetch } from '../api/http';
import InteractiveMap from '../components/InteractiveMap';

// Ciudades predefinidas para facilitar la selección con 1 clic sin tener que tipear
const CIUDADES_PREDEFINIDAS = [
  { nombre: 'Buenos Aires (CABA)', lat: -34.6037, lng: -58.3816 },
  { nombre: 'La Plata', lat: -34.9205, lng: -57.9536 },
  { nombre: 'Rosario', lat: -32.9468, lng: -60.6393 },
  { nombre: 'Córdoba', lat: -31.4201, lng: -64.1888 },
  { nombre: 'Mendoza', lat: -32.8895, lng: -68.8458 },
  { nombre: 'Mar del Plata', lat: -38.0055, lng: -57.556 },
];

export default function PublicVolquetesPage() {
  // PASOS: 1 (Ciudad) -> 2 (Ubicación en Mapa) -> 3 (Tipo de Gestión) -> 4 (Detalles/Contacto) -> 5 (Éxito)
  const [paso, setPaso] = useState(1);

  // Paso 1: Ciudad
  const [ciudadSeleccionada, setCiudadSeleccionada] = useState(CIUDADES_PREDEFINIDAS[0]);
  const [otraCiudad, setOtraCiudad] = useState('');
  const [usarOtraCiudad, setUsarOtraCiudad] = useState(false);

  // Paso 2: Ubicación
  const [posicion, setPosicion] = useState({
    latitud: CIUDADES_PREDEFINIDAS[0].lat,
    longitud: CIUDADES_PREDEFINIDAS[0].lng,
  });
  const [calleNumero, setCalleNumero] = useState('');
  const [geolocalizando, setGeolocalizando] = useState(false);

  // Paso 3: Botonera de Acción
  // 'solicitar_nuevo' | 'solicitar_cambio' | 'finalizar_gestion' | 'otros'
  const [accion, setAccion] = useState('solicitar_nuevo');

  // Paso 4: Datos adicionales
  const [motivoOtros, setMotivoOtros] = useState('');
  const [telefono, setTelefono] = useState('');
  const [nombre, setNombre] = useState('');
  const [horarioPreferencia, setHorarioPreferencia] = useState('Indistinto / Lo antes posible');
  const [observaciones, setObservaciones] = useState('');

  // Estados de proceso
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState(null);

  // Actualizar coordenadas si cambia la ciudad predefinida
  const handleSelectCiudad = (c) => {
    setCiudadSeleccionada(c);
    setUsarOtraCiudad(false);
    setPosicion({ latitud: c.lat, longitud: c.lng });
  };

  // Geolocalización del navegador
  const handleUsarMiUbicacion = () => {
    if (!navigator.geolocation) {
      alert('La geolocalización no está soportada en su dispositivo.');
      return;
    }
    setGeolocalizando(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosicion({
          latitud: Number(pos.coords.latitude.toFixed(6)),
          longitud: Number(pos.coords.longitude.toFixed(6)),
        });
        setGeolocalizando(false);
      },
      () => {
        setGeolocalizando(false);
        alert('No se pudo obtener su ubicación actual. Puede mover la marca en el mapa.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Selección de clic en el mapa
  const handleMapClick = (coords) => {
    setPosicion(coords);
  };

  // Envío final
  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setError('');

    if (!telefono || telefono.trim().length < 6) {
      setError('Por favor ingrese un número de teléfono de contacto válido.');
      return;
    }

    if (accion === 'otros' && !motivoOtros.trim()) {
      setError('Por favor describa brevemente el motivo de su consulta.');
      return;
    }

    const ciudadFinal = usarOtraCiudad ? otraCiudad.trim() : ciudadSeleccionada.nombre;
    const direccionCompleta = calleNumero.trim()
      ? `${calleNumero.trim()}, ${ciudadFinal}`
      : `Ubicación GPS (${posicion.latitud}, ${posicion.longitud}), ${ciudadFinal}`;

    let notasFinales = `Horario preferido: ${horarioPreferencia}.`;
    if (accion === 'otros') {
      notasFinales += ` Motivo: ${motivoOtros.trim()}.`;
    }
    if (observaciones.trim()) {
      notasFinales += ` Indicaciones: ${observaciones.trim()}.`;
    }

    setEnviando(true);
    try {
      const res = await apiFetch('/volquetes/publico/solicitar', {
        method: 'POST',
        body: JSON.stringify({
          direccion: direccionCompleta,
          latitud: posicion.latitud,
          longitud: posicion.longitud,
          telefono_contacto: telefono.trim(),
          nombre_solicitante: nombre.trim() || 'Vecino/a',
          accion,
          notas: notasFinales,
        }),
      });
      setResultado(res);
      setPaso(5);
    } catch (err) {
      setError(err.message || 'Ocurrió un error al enviar la solicitud.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="public-volquetes-page">
      <div className="wizard-container">
        {/* Cabecera limpia sin enlaces */}
        <div className="wizard-header-logo">
          <img src="/brand/rsu-symbol.png" alt="RSU Símbolo" />
          <h1>Solicitud de Volquetes</h1>
        </div>

        {/* Indicador de progreso paso a paso */}
        {paso < 5 && (
          <div className="wizard-progress-bar">
            <div className="wizard-step-indicator">
              <div
                className={`wizard-step-circle ${
                  paso === 1 ? 'active' : paso > 1 ? 'completed' : ''
                }`}
              >
                1
              </div>
              <span className={`wizard-step-label ${paso === 1 ? 'active' : ''}`}>Ciudad</span>
            </div>
            <div className="wizard-step-indicator">
              <div
                className={`wizard-step-circle ${
                  paso === 2 ? 'active' : paso > 2 ? 'completed' : ''
                }`}
              >
                2
              </div>
              <span className={`wizard-step-label ${paso === 2 ? 'active' : ''}`}>Ubicación</span>
            </div>
            <div className="wizard-step-indicator">
              <div
                className={`wizard-step-circle ${
                  paso === 3 ? 'active' : paso > 3 ? 'completed' : ''
                }`}
              >
                3
              </div>
              <span className={`wizard-step-label ${paso === 3 ? 'active' : ''}`}>Servicio</span>
            </div>
            <div className="wizard-step-indicator">
              <div
                className={`wizard-step-circle ${
                  paso === 4 ? 'active' : paso > 4 ? 'completed' : ''
                }`}
              >
                4
              </div>
              <span className={`wizard-step-label ${paso === 4 ? 'active' : ''}`}>Contacto</span>
            </div>
          </div>
        )}

        {error && (
          <div className="alert alert-danger" style={{ marginBottom: '16px' }}>
            <AlertCircle size={20} />
            <span>{error}</span>
          </div>
        )}

        {/* ========================================================================= */}
        {/* PASO 1: CIUDAD */}
        {/* ========================================================================= */}
        {paso === 1 && (
          <div className="wizard-card">
            <h2 className="wizard-card-title">
              <Building size={22} style={{ color: '#059669' }} />
              ¿En qué ciudad se encuentra?
            </h2>
            <p className="wizard-card-subtitle">
              Elija una opción para ubicar rápidamente el mapa en su zona:
            </p>

            <div className="city-pill-grid">
              {CIUDADES_PREDEFINIDAS.map((c) => {
                const isSelected = !usarOtraCiudad && ciudadSeleccionada.nombre === c.nombre;
                return (
                  <button
                    key={c.nombre}
                    type="button"
                    className={`city-pill-btn ${isSelected ? 'active' : ''}`}
                    onClick={() => handleSelectCiudad(c)}
                  >
                    <span>{c.nombre}</span>
                  </button>
                );
              })}
            </div>

            <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid #f1f5f9' }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '14px',
                  color: '#475569',
                  marginBottom: '10px',
                }}
              >
                <input
                  type="checkbox"
                  checked={usarOtraCiudad}
                  onChange={(e) => setUsarOtraCiudad(e.target.checked)}
                />
                <span>Mi ciudad no figura en la lista</span>
              </label>

              {usarOtraCiudad && (
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <input
                    type="text"
                    placeholder="Escriba el nombre de su localidad o partido"
                    value={otraCiudad}
                    onChange={(e) => setOtraCiudad(e.target.value)}
                    autoFocus
                  />
                </div>
              )}
            </div>

            <div className="wizard-footer-buttons">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setError('');
                  if (usarOtraCiudad && !otraCiudad.trim()) {
                    setError('Por favor escriba el nombre de su localidad.');
                    return;
                  }
                  setPaso(2);
                }}
              >
                <span>Continuar</span>
                <ArrowRight size={18} />
              </button>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* PASO 2: MAPA CON MARCA MOVIBLE */}
        {/* ========================================================================= */}
        {paso === 2 && (
          <div className="wizard-card">
            <h2 className="wizard-card-title">
              <MapPin size={22} style={{ color: '#059669' }} />
              Indique el lugar exacto
            </h2>
            <p className="wizard-card-subtitle">
              Toque cualquier punto del mapa para colocar la marca donde irá el volquete.
            </p>

            <div style={{ marginBottom: '12px', display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={handleUsarMiUbicacion}
                disabled={geolocalizando}
                style={{ width: '100%', justifyContent: 'center' }}
              >
                <Navigation size={16} />
                <span>{geolocalizando ? 'Obteniendo GPS...' : 'Usar mi ubicación actual (GPS)'}</span>
              </button>
            </div>

            <InteractiveMap
              center={[posicion.latitud, posicion.longitud]}
              zoom={15}
              height="280px"
              onMapClick={handleMapClick}
              markers={[
                {
                  id: 'marca_usuario',
                  latitud: posicion.latitud,
                  longitud: posicion.longitud,
                  color: '#059669',
                  label: 'V',
                  popup: 'Punto de colocación del volquete',
                },
              ]}
            />

            <div className="map-pin-tip">
              <MapPin size={18} style={{ flexShrink: 0 }} />
              <span>Toque la pantalla sobre la calle deseada para mover el marcador verde.</span>
            </div>

            <div className="form-group" style={{ marginTop: '16px', marginBottom: 0 }}>
              <label>Calle y Altura aproximada (Opcional pero recomendable)</label>
              <input
                type="text"
                placeholder="Ej: Av. San Martín 1420"
                value={calleNumero}
                onChange={(e) => setCalleNumero(e.target.value)}
              />
            </div>

            <div className="wizard-footer-buttons">
              <button type="button" className="btn btn-outline" onClick={() => setPaso(1)}>
                <ArrowLeft size={18} />
                <span>Atrás</span>
              </button>
              <button type="button" className="btn btn-primary" onClick={() => setPaso(3)}>
                <span>Continuar</span>
                <ArrowRight size={18} />
              </button>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* PASO 3: BOTONERA DE ACCIÓN */}
        {/* ========================================================================= */}
        {paso === 3 && (
          <div className="wizard-card">
            <h2 className="wizard-card-title">
              <HelpCircle size={22} style={{ color: '#059669' }} />
              ¿Qué tipo de gestión necesita?
            </h2>
            <p className="wizard-card-subtitle">
              Seleccione la opción que mejor describa su pedido:
            </p>

            <div className="big-action-grid">
              {/* Opción 1: Nuevo Volquete */}
              <div
                className={`big-action-card ${accion === 'solicitar_nuevo' ? 'selected' : ''}`}
                onClick={() => setAccion('solicitar_nuevo')}
              >
                <div
                  className="big-action-icon-wrap"
                  style={{ background: '#ecfdf5', color: '#059669' }}
                >
                  <PlusCircle size={24} />
                </div>
                <div className="big-action-info">
                  <div className="big-action-title">Nuevo volquete</div>
                  <div className="big-action-desc">
                    Para iniciar una obra o limpieza donde no hay volquete actualmente.
                  </div>
                </div>
              </div>

              {/* Opción 2: Reemplazo / Cambio */}
              <div
                className={`big-action-card ${accion === 'solicitar_cambio' ? 'selected' : ''}`}
                onClick={() => setAccion('solicitar_cambio')}
              >
                <div
                  className="big-action-icon-wrap"
                  style={{ background: '#eff6ff', color: '#2563eb' }}
                >
                  <RefreshCw size={24} />
                </div>
                <div className="big-action-info">
                  <div className="big-action-title">Reemplazo / Cambio</div>
                  <div className="big-action-desc">
                    Retirar el volquete lleno y dejar uno vacío en la misma dirección.
                  </div>
                </div>
              </div>

              {/* Opción 3: Retiro definitivo */}
              <div
                className={`big-action-card ${accion === 'finalizar_gestion' ? 'selected' : ''}`}
                onClick={() => setAccion('finalizar_gestion')}
              >
                <div
                  className="big-action-icon-wrap"
                  style={{ background: '#fef2f2', color: '#dc2626' }}
                >
                  <Trash2 size={24} />
                </div>
                <div className="big-action-info">
                  <div className="big-action-title">Solicitar retiro de volquete</div>
                  <div className="big-action-desc">
                    Retiro definitivo por finalización de trabajos, sin reposición.
                  </div>
                </div>
              </div>

              {/* Opción 4: Otros */}
              <div
                className={`big-action-card ${accion === 'otros' ? 'selected' : ''}`}
                onClick={() => setAccion('otros')}
              >
                <div
                  className="big-action-icon-wrap"
                  style={{ background: '#f8fafc', color: '#64748b' }}
                >
                  <HelpCircle size={24} />
                </div>
                <div className="big-action-info">
                  <div className="big-action-title">Otros</div>
                  <div className="big-action-desc">
                    Consultas especiales, presupuestos por cantidad o situaciones particulares.
                  </div>
                </div>
              </div>
            </div>

            <div className="wizard-footer-buttons">
              <button type="button" className="btn btn-outline" onClick={() => setPaso(2)}>
                <ArrowLeft size={18} />
                <span>Atrás</span>
              </button>
              <button type="button" className="btn btn-primary" onClick={() => setPaso(4)}>
                <span>Continuar</span>
                <ArrowRight size={18} />
              </button>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* PASO 4: FORMULARIO AMIGABLE (MINIMO TIPEO) */}
        {/* ========================================================================= */}
        {paso === 4 && (
          <div className="wizard-card">
            <h2 className="wizard-card-title">
              <Phone size={22} style={{ color: '#059669' }} />
              Datos de contacto
            </h2>
            <p className="wizard-card-subtitle">
              Para coordinar la entrega y avisarle cuando el chofer esté en camino.
            </p>

            <form onSubmit={handleSubmit}>
              {/* Si eligió "Otros", mostramos campo de texto libre */}
              {accion === 'otros' && (
                <div
                  className="form-group"
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #cbd5e1',
                    padding: '14px',
                    borderRadius: '12px',
                    marginBottom: '16px',
                  }}
                >
                  <label style={{ color: '#0f172a', fontWeight: 700 }}>
                    Cuéntenos brevemente qué necesita:
                  </label>
                  <textarea
                    rows={3}
                    required
                    placeholder="Ej: Necesitamos 3 volquetes para el fin de semana o consultar tarifas..."
                    value={motivoOtros}
                    onChange={(e) => setMotivoOtros(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontFamily: 'inherit',
                      fontSize: '14px',
                    }}
                  />
                </div>
              )}

              <div className="form-group">
                <label>Número de Teléfono / WhatsApp (Obligatorio)</label>
                <input
                  type="tel"
                  required
                  placeholder="Ej: 11 5555 1234"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  style={{ fontSize: '16px', padding: '12px' }}
                />
              </div>

              <div className="form-group">
                <label>Su Nombre o Razón Social (Opcional)</label>
                <input
                  type="text"
                  placeholder="Ej: Marcelo Gómez"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                />
              </div>

              {/* Opciones rápidas de horario con botones para no tipear */}
              <div className="form-group">
                <label>Preferencia de horario:</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {[
                    'Indistinto / Lo antes posible',
                    'Por la Mañana (8 a 13 hs)',
                    'Por la Tarde (13 a 18 hs)',
                    'Coordinar previamente por llamada',
                  ].map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      className={`chip-btn ${horarioPreferencia === opt ? 'active' : ''}`}
                      onClick={() => setHorarioPreferencia(opt)}
                      style={{
                        padding: '10px 8px',
                        fontSize: '12px',
                        textAlign: 'center',
                        justifyContent: 'center',
                        borderRadius: '10px',
                      }}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Indicación o referencia visual (Opcional)</label>
                <input
                  type="text"
                  placeholder="Ej: Dejar frente al portón negro, al lado del árbol"
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                />
              </div>

              <div className="wizard-footer-buttons">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setPaso(3)}
                  disabled={enviando}
                >
                  <ArrowLeft size={18} />
                  <span>Atrás</span>
                </button>
                <button type="submit" className="btn btn-primary" disabled={enviando}>
                  <CheckCircle2 size={18} />
                  <span>{enviando ? 'Enviando...' : 'Confirmar Pedido'}</span>
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ========================================================================= */}
        {/* PASO 5: PANTALLA DE ÉXITO */}
        {/* ========================================================================= */}
        {paso === 5 && (
          <div className="wizard-card" style={{ textAlign: 'center', padding: '36px 20px' }}>
            <div
              style={{
                width: '64px',
                height: '64px',
                background: '#dcfce7',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
                color: '#16a34a',
              }}
            >
              <CheckCircle2 size={36} />
            </div>

            <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a', marginBottom: '8px' }}>
              ¡Solicitud Recibida!
            </h2>

            <p style={{ fontSize: '15px', color: '#475569', lineHeight: 1.5, marginBottom: '24px' }}>
              {resultado?.message ||
                'Su pedido ha sido registrado con éxito. Nuestro equipo se pondrá en contacto a la brevedad para coordinar la llegada del móvil.'}
            </p>

            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '16px',
                textAlign: 'left',
                fontSize: '13px',
                color: '#334155',
                marginBottom: '24px',
              }}
            >
              <div style={{ marginBottom: '6px' }}>
                <strong>Gestión:</strong>{' '}
                {accion === 'solicitar_nuevo'
                  ? 'Nuevo Volquete'
                  : accion === 'solicitar_cambio'
                  ? 'Reemplazo / Cambio'
                  : accion === 'finalizar_gestion'
                  ? 'Retiro Definitivo'
                  : 'Consulta / Otros'}
              </div>
              <div style={{ marginBottom: '6px' }}>
                <strong>Teléfono:</strong> {telefono}
              </div>
              <div>
                <strong>Ubicación:</strong>{' '}
                {calleNumero.trim()
                  ? `${calleNumero.trim()} (${
                      usarOtraCiudad ? otraCiudad : ciudadSeleccionada.nombre
                    })`
                  : usarOtraCiudad
                  ? otraCiudad
                  : ciudadSeleccionada.nombre}
              </div>
            </div>

            <button
              type="button"
              className="btn btn-primary full-width"
              onClick={() => {
                // Reiniciar para un nuevo pedido si lo desea
                setPaso(1);
                setTelefono('');
                setCalleNumero('');
                setMotivoOtros('');
                setObservaciones('');
                setResultado(null);
              }}
            >
              Realizar otra solicitud
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
