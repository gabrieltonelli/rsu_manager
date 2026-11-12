import React, { useState, useEffect, useCallback } from 'react';
import {
  Navigation,
  Container,
  MapPin,
  Scale,
  CheckCircle2,
  ExternalLink,
  LocateFixed,
  Calendar,
} from 'lucide-react';
import { apiFetch } from '../api/http';
import InteractiveMap from '../components/InteractiveMap';

export default function RecolectorHomePage() {
  const [activeTab, setActiveTab] = useState('ruta'); // 'ruta' | 'volquetes'
  const [rutaActual, setRutaActual] = useState(null);
  const [rutasSemana, setRutasSemana] = useState([]);
  const [siguientePunto, setSiguientePunto] = useState(null);
  const [siguienteTramo, setSiguienteTramo] = useState(null);
  const [tiposResiduo, setTiposResiduo] = useState([]);
  const [volquetesAsignados, setVolquetesAsignados] = useState([]);
  const [geofenceRadius, setGeofenceRadius] = useState(250);

  const [miUbicacion, setMiUbicacion] = useState({
    latitud: -34.6176,
    longitud: -58.3688,
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Modal Nueva Recolección
  const [recModalOpen, setRecModalOpen] = useState(false);
  const [puntoSeleccionado, setPuntoSeleccionado] = useState(null);
  const [recForm, setRecForm] = useState({
    peso_total_kg: '',
    modo_calculo: 'automatico',
    observaciones: '',
    detalles_manuales: {},
  });

  const cargarHome = useCallback(
    async (coords = miUbicacion) => {
      try {
        const [homeRes, volRes] = await Promise.all([
          apiFetch(`/recolector/home?lat=${coords.latitud}&lng=${coords.longitud}`),
          apiFetch('/recolector/volquetes'),
        ]);
        setRutaActual(homeRes.ruta_actual || null);
        setRutasSemana(homeRes.rutas_semana || []);
        setSiguientePunto(homeRes.siguiente_punto || null);
        setSiguienteTramo(homeRes.siguiente_tramo || null);
        setTiposResiduo(homeRes.tipos_residuo || []);
        setGeofenceRadius(homeRes.geofence_radius_m || 250);
        setVolquetesAsignados(volRes.volquetes || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    },
    [miUbicacion]
  );

  useEffect(() => {
    cargarHome();
  }, []);

  const reportarUbicacion = async (lat, lng) => {
    const nuevasCoords = { latitud: Number(lat.toFixed(6)), longitud: Number(lng.toFixed(6)) };
    setMiUbicacion(nuevasCoords);
    try {
      await apiFetch('/recolector/ubicacion', {
        method: 'POST',
        body: JSON.stringify(nuevasCoords),
      });
      await cargarHome(nuevasCoords);
    } catch (err) {
      setError(err.message);
    }
  };

  const usarGpsReal = () => {
    if (!navigator.geolocation) {
      setError('Tu navegador no dispone de geolocalización.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        reportarUbicacion(pos.coords.latitude, pos.coords.longitude);
      },
      () => {
        setError('No se pudo obtener el GPS del navegador. Puedes usar el botón de posicionamiento en el punto.');
      }
    );
  };

  const abrirModalNuevaRecoleccion = (pt) => {
    setPuntoSeleccionado(pt);
    const initManual = {};
    for (const t of tiposResiduo) {
      initManual[t.id] = '';
    }
    setRecForm({
      peso_total_kg: '',
      modo_calculo: 'automatico',
      observaciones: '',
      detalles_manuales: initManual,
    });
    setRecModalOpen(true);
  };

  const handleConfirmarRecoleccion = async (e) => {
    e.preventDefault();
    setError('');
    try {
      let pesoTotal = Number(recForm.peso_total_kg);
      const detallesArray = Object.entries(recForm.detalles_manuales)
        .filter(([, val]) => Number(val) > 0)
        .map(([tipo_residuo_id, val]) => ({
          tipo_residuo_id,
          peso_kg: Number(val),
        }));

      if (recForm.modo_calculo === 'manual' && detallesArray.length > 0 && !pesoTotal) {
        pesoTotal = detallesArray.reduce((acc, d) => acc + d.peso_kg, 0);
      }

      const res = await apiFetch('/recolector/nueva-recoleccion', {
        method: 'POST',
        body: JSON.stringify({
          ruta_id: rutaActual?.id,
          punto_id: puntoSeleccionado.punto_id,
          peso_total_kg: pesoTotal,
          modo_calculo: recForm.modo_calculo,
          detalles_manuales: detallesArray,
          lat_recolector: miUbicacion.latitud,
          longitud: miUbicacion.longitud,
          lng_recolector: miUbicacion.longitud,
          observaciones: recForm.observaciones,
        }),
      });

      setRecModalOpen(false);
      setSuccessMsg(res.message);
      setTimeout(() => setSuccessMsg(''), 4500);
      cargarHome(miUbicacion);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCompletarMovimientoVolquete = async (volqueteId, tipoMovimiento) => {
    try {
      await apiFetch(`/recolector/volquetes/${volqueteId}/completar-movimiento`, {
        method: 'POST',
        body: JSON.stringify({ tipo_movimiento: tipoMovimiento }),
      });
      setSuccessMsg('Movimiento de volquete registrado correctamente.');
      setTimeout(() => setSuccessMsg(''), 4000);
      cargarHome(miUbicacion);
    } catch (err) {
      setError(err.message);
    }
  };

  const rutaCompletaCoords =
    rutaActual?.geometria_geojson?.coordinates?.map(([lng, lat]) => [lat, lng]) || [];
  const siguienteTramoCoords =
    siguienteTramo?.geometria_geojson?.coordinates?.map(([lng, lat]) => [lat, lng]) || [];

  return (
    <div className="page-section">
      <div className="section-header">
        <div>
          <h2>Home del Recolector</h2>
          <p className="text-muted">
            Ruta actual a seguir, navegación al siguiente punto más cercano, registro de Nueva Recolección validado por GPS y gestión de Volquetes.
          </p>
        </div>

        <div className="tab-pills">
          <button
            className={`btn ${activeTab === 'ruta' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setActiveTab('ruta')}
          >
            <Navigation size={18} />
            <span>Mi Ruta Actual y Semana</span>
          </button>
          <button
            className={`btn ${activeTab === 'volquetes' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setActiveTab('volquetes')}
          >
            <Container size={18} />
            <span>Volquetes Asignados ({volquetesAsignados.length})</span>
          </button>
        </div>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}
      {successMsg && (
        <div className="alert alert-success">
          <CheckCircle2 size={18} />
          <span>{successMsg}</span>
        </div>
      )}

      {activeTab === 'ruta' ? (
        <>
          <div className="card" style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
              <div>
                <h3 style={{ margin: 0 }}>
                  {rutaActual ? `📍 ${rutaActual.nombre} (${String(rutaActual.fecha).slice(0, 10)})` : 'Sin ruta activa'}
                </h3>
                {siguientePunto ? (
                  <small className="text-muted">
                    Siguiente punto más cercano: <strong>{siguientePunto.nombre}</strong> (a{' '}
                    {siguientePunto.distancia_actual_m != null
                      ? `${Math.round(siguientePunto.distancia_actual_m)} m`
                      : 'calcular'}
                    ) · Radio habilitado para recolectar: {geofenceRadius} m
                  </small>
                ) : (
                  <small className="text-muted">¡Todos los puntos de la ruta actual fueron recolectados!</small>
                )}
              </div>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button className="btn btn-outline btn-sm" onClick={usarGpsReal}>
                  <LocateFixed size={15} /> Usar mi GPS Real
                </button>
                {siguientePunto && (
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => reportarUbicacion(siguientePunto.latitud, siguientePunto.longitud)}
                    title="Posiciona el vehículo en las coordenadas del siguiente punto para probar la validación de geocerca"
                  >
                    <MapPin size={15} /> Posicionarme en "{siguientePunto.nombre}"
                  </button>
                )}
              </div>
            </div>

            <InteractiveMap
              height="350px"
              center={[miUbicacion.latitud, miUbicacion.longitud]}
              polylineCoords={rutaCompletaCoords}
              secondaryPolylineCoords={siguienteTramoCoords}
              geofenceCircle={
                siguientePunto
                  ? {
                      latitud: siguientePunto.latitud,
                      longitud: siguientePunto.longitud,
                      radius: geofenceRadius,
                    }
                  : null
              }
              markers={[
                {
                  id: 'mi-camion',
                  latitud: miUbicacion.latitud,
                  longitud: miUbicacion.longitud,
                  color: '#0f172a',
                  label: '🚛',
                  popup: <strong>Mi Ubicación Actual</strong>,
                },
                ...(rutaActual?.puntos || []).map((pt, idx) => ({
                  id: pt.punto_id || idx,
                  latitud: pt.latitud,
                  longitud: pt.longitud,
                  color: pt.estado === 'recolectado' ? '#10b981' : '#f59e0b',
                  label: pt.estado === 'recolectado' ? '✓' : idx + 1,
                  popup: (
                    <div>
                      <strong>
                        #{idx + 1} - {pt.nombre}
                      </strong>
                      <div>{pt.direccion}</div>
                      <div>
                        Estado:{' '}
                        <strong>
                          {pt.estado === 'recolectado' ? 'RECOLECTADO' : 'NO RECOLECTADO'}
                        </strong>
                      </div>
                    </div>
                  ),
                })),
              ]}
            />
          </div>

          <div className="two-col-layout">
            <div className="card">
              <h3>Puntos de la Ruta Actual</h3>
              {loading ? (
                <p>Cargando puntos...</p>
              ) : !rutaActual ? (
                <p className="text-muted">No tienes puntos asignados para hoy.</p>
              ) : (
                <div className="ordered-route-list">
                  {(rutaActual.puntos || []).map((pt, idx) => {
                    const recolectado = pt.estado === 'recolectado';
                    return (
                      <div key={pt.punto_id} className="ordered-route-item">
                        <span
                          className="step-circle"
                          style={{ background: recolectado ? '#10b981' : '#f59e0b' }}
                        >
                          {recolectado ? '✓' : idx + 1}
                        </span>
                        <div style={{ flex: 1 }}>
                          <strong>{pt.nombre}</strong>
                          <div className="subtext">
                            {pt.cliente_nombre} · {pt.direccion}
                          </div>
                        </div>
                        {recolectado ? (
                          <span className="status-pill status-active">Recolectado</span>
                        ) : (
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              className="btn btn-outline btn-sm"
                              onClick={() => reportarUbicacion(pt.latitud, pt.longitud)}
                              title="Acercarse al punto"
                            >
                              <MapPin size={14} /> Ir aquí
                            </button>
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={() => abrirModalNuevaRecoleccion(pt)}
                            >
                              <Scale size={14} /> Nueva Recolección
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="card">
              <h3>
                <Calendar size={18} /> Previsualización de Rutas en la Semana
              </h3>
              {rutasSemana.length === 0 ? (
                <p className="text-muted">No hay más rutas programadas para esta semana.</p>
              ) : (
                <div className="ordered-route-list">
                  {rutasSemana.map((rt) => (
                    <div
                      key={rt.id}
                      className="ordered-route-item"
                      style={{ cursor: 'pointer' }}
                      onClick={() => setRutaActual(rt)}
                    >
                      <div style={{ flex: 1 }}>
                        <strong>
                          {String(rt.fecha).slice(0, 10)} — {rt.nombre}
                        </strong>
                        <div className="subtext">
                          {(rt.puntos || []).length} puntos asignados ·{' '}
                          {((rt.distancia_total_m || 0) / 1000).toFixed(1)} km
                        </div>
                      </div>
                      <span
                        className={`status-pill ${
                          rt.estado === 'completada' ? 'status-active' : 'status-pending'
                        }`}
                      >
                        {rt.estado.toUpperCase()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        /* PESTAÑA VOLQUETES DEL RECOLECTOR */
        <div className="card">
          <h3>
            <Container size={18} /> Volquetes Asignados — Direcciones de Entrega y Recolección
          </h3>
          <p className="text-muted">
            Al tocar una dirección se abre directamente Google Maps con esa dirección marcada para navegar.
          </p>

          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Dirección (Tocar para abrir Google Maps)</th>
                  <th>Teléfono / Solicitante</th>
                  <th>Tarea Asignada</th>
                  <th>Registrar Movimiento en Calle</th>
                </tr>
              </thead>
              <tbody>
                {volquetesAsignados.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="text-center">
                      No tienes volquetes asignados en este momento.
                    </td>
                  </tr>
                ) : (
                  volquetesAsignados.map((v) => {
                    const gmapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                      v.direccion
                    )}`;
                    return (
                      <tr key={v.id}>
                        <td>
                          <strong>{v.codigo}</strong>
                        </td>
                        <td>
                          <a
                            href={gmapsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="gmaps-link"
                          >
                            <MapPin size={16} />
                            <span>{v.direccion}</span>
                            <ExternalLink size={14} />
                          </a>
                        </td>
                        <td>
                          <div>{v.nombre_solicitante}</div>
                          <div className="subtext">Tel: {v.telefono_contacto}</div>
                        </td>
                        <td>
                          <span className="status-pill status-pending">
                            {(v.accion_pendiente_recolector || v.estado).toUpperCase()}
                          </span>
                        </td>
                        <td>
                          <div className="action-btns">
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => handleCompletarMovimientoVolquete(v.id, 'envio')}
                            >
                              Confirmar Entrega
                            </button>
                            <button
                              className="btn btn-outline btn-sm"
                              onClick={() => handleCompletarMovimientoVolquete(v.id, 'cambio')}
                            >
                              Confirmar Cambio
                            </button>
                            <button
                              className="btn btn-outline btn-sm"
                              onClick={() => handleCompletarMovimientoVolquete(v.id, 'retiro_final')}
                            >
                              Confirmar Retiro Final
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Nueva Recolección */}
      {recModalOpen && puntoSeleccionado && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <h3>
              <Scale size={18} /> Nueva Recolección — {puntoSeleccionado.nombre}
            </h3>
            <p className="text-muted">
              Se verificará que tu geolocalización actual coincida con el punto ({puntoSeleccionado.direccion}).
            </p>

            <form onSubmit={handleConfirmarRecoleccion} className="auth-form">
              <div className="form-group">
                <label>Peso Total de la Recolección (kg) *</label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  required
                  placeholder="Ej: 380"
                  value={recForm.peso_total_kg}
                  onChange={(e) => setRecForm({ ...recForm, peso_total_kg: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Modalidad de Desglose por Tipo de Residuo</label>
                <select
                  value={recForm.modo_calculo}
                  onChange={(e) => setRecForm({ ...recForm, modo_calculo: e.target.value })}
                >
                  <option value="automatico">
                    Utilizar cálculo automático configurado en el punto
                  </option>
                  <option value="manual">
                    Ingresar manualmente el peso para cada tipo de residuo
                  </option>
                </select>
              </div>

              {recForm.modo_calculo === 'automatico' ? (
                <div className="point-config-box">
                  <small style={{ display: 'block', marginBottom: '6px', fontWeight: 600 }}>
                    Vista previa del cálculo automático según configuración del punto:
                  </small>
                  <div className="perm-tags">
                    {(puntoSeleccionado.composicion || []).map((c) => {
                      const calcKg = recForm.peso_total_kg
                        ? ((Number(recForm.peso_total_kg) * Number(c.porcentaje)) / 100).toFixed(1)
                        : '0.0';
                      return (
                        <span key={c.tipo_residuo_id} className="perm-chip">
                          {c.nombre} ({c.porcentaje}%): <strong>{calcKg} kg</strong>
                        </span>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="residuo-pct-grid">
                  {tiposResiduo.map((t) => (
                    <div key={t.id} className="pct-item">
                      <span>{t.nombre} (kg)</span>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        placeholder="0 kg"
                        value={recForm.detalles_manuales[t.id] || ''}
                        onChange={(e) =>
                          setRecForm({
                            ...recForm,
                            detalles_manuales: {
                              ...recForm.detalles_manuales,
                              [t.id]: e.target.value,
                            },
                          })
                        }
                      />
                    </div>
                  ))}
                </div>
              )}

              <div className="form-group">
                <label>Observaciones (Opcional)</label>
                <input
                  type="text"
                  placeholder="Estado de bolsones / precintos..."
                  value={recForm.observaciones}
                  onChange={(e) => setRecForm({ ...recForm, observaciones: e.target.value })}
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-outline" onClick={() => setRecModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  Validar GPS y Confirmar Recolección
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

