import React, { useState, useEffect, useCallback } from 'react';
import { Route, Sparkles, CheckSquare, Square, Truck } from 'lucide-react';
import { apiFetch } from '../api/http';
import InteractiveMap from '../components/InteractiveMap';

export default function AdminRutasPage() {
  const [puntos, setPuntos] = useState([]);
  const [recolectores, setRecolectores] = useState([]);
  const [rutasExistentes, setRutasExistentes] = useState([]);
  const [rutaActivaVista, setRutaActivaVista] = useState(null);

  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [modo, setModo] = useState('reparto_automatico');
  const [recolectorUnicoId, setRecolectorUnicoId] = useState('');
  const [recolectoresSeleccionados, setRecolectoresSeleccionados] = useState([]);
  const [puntosSeleccionados, setPuntosSeleccionados] = useState([]);

  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');

  const cargarDatos = useCallback(async () => {
    try {
      const [pRes, rRes, rtRes] = await Promise.all([
        apiFetch('/admin/puntos?habilitado=true'),
        apiFetch('/admin/recolectores?habilitado=true'),
        apiFetch(`/admin/rutas?fecha=${fecha}`),
      ]);
      const pts = pRes.puntos || [];
      const recs = rRes.recolectores || [];
      setPuntos(pts);
      setRecolectores(recs);
      setRutasExistentes(rtRes.rutas || []);
      if (rtRes.rutas?.[0]) {
        setRutaActivaVista(rtRes.rutas[0]);
      }

      if (puntosSeleccionados.length === 0 && pts.length > 0) {
        setPuntosSeleccionados(pts.map((p) => p.id));
      }
      if (recolectoresSeleccionados.length === 0 && recs.length > 0) {
        setRecolectoresSeleccionados(recs.map((r) => r.id));
        setRecolectorUnicoId(recs[0].id);
      }
    } catch (err) {
      setError(err.message);
    }
  }, [fecha]);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  const togglePunto = (id) => {
    setPuntosSeleccionados((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const toggleRecolector = (id) => {
    setRecolectoresSeleccionados((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]
    );
  };

  const handleGenerarRutas = async (e) => {
    e.preventDefault();
    setError('');
    setMensaje('');
    setGenerando(true);
    try {
      const res = await apiFetch('/admin/rutas/generar', {
        method: 'POST',
        body: JSON.stringify({
          fecha,
          puntos_ids: puntosSeleccionados,
          modo,
          recolector_id: recolectorUnicoId,
          recolectores_ids: recolectoresSeleccionados,
        }),
      });
      setMensaje(res.message);
      if (res.rutas && res.rutas.length > 0) {
        setRutaActivaVista(res.rutas[0]);
      }
      cargarDatos();
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerando(false);
    }
  };

  const polylineCoords =
    rutaActivaVista?.geometria_geojson?.coordinates?.map(([lng, lat]) => [lat, lng]) || [];

  return (
    <div className="page-section">
      <div className="section-header">
        <div>
          <h2>Generación y Optimización de Rutas</h2>
          <p className="text-muted">
            Selecciona los puntos a recolectar en una fecha y genera el recorrido óptimo (TSP + OSRM) o reparte automáticamente entre recolectores por cercanía geográfica.
          </p>
        </div>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}
      {mensaje && <div className="alert alert-success">{mensaje}</div>}

      <div className="two-col-layout">
        <div className="card">
          <h3>
            <Sparkles size={18} /> Configurar Generación de Ruta
          </h3>
          <form onSubmit={handleGenerarRutas} className="auth-form">
            <div className="form-group">
              <label>Fecha de Recolección</label>
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>

            <div className="form-group">
              <label>Modalidad de Asignación y Algoritmo</label>
              <select value={modo} onChange={(e) => setModo(e.target.value)}>
                <option value="reparto_automatico">
                  Reparto Automático entre Recolectores (Clustering Geográfico + TSP)
                </option>
                <option value="unico_recolector">
                  Asignar a un único Recolector (Recorrido Óptimo TSP)
                </option>
              </select>
            </div>

            {modo === 'unico_recolector' ? (
              <div className="form-group">
                <label>Seleccionar Recolector</label>
                <select
                  value={recolectorUnicoId}
                  onChange={(e) => setRecolectorUnicoId(e.target.value)}
                >
                  {recolectores.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nombre_completo} ({r.vehiculo_patente || 'Sin patente'})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="form-group">
                <label>Recolectores Participantes en el Reparto Automático:</label>
                <div className="perm-tags">
                  {recolectores.map((r) => (
                    <button
                      type="button"
                      key={r.id}
                      onClick={() => toggleRecolector(r.id)}
                      className={`chip-btn ${
                        recolectoresSeleccionados.includes(r.id) ? 'active' : ''
                      }`}
                    >
                      <Truck size={14} /> {r.nombre_completo}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label>Puntos a Recolectar ({puntosSeleccionados.length} de {puntos.length}):</label>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() =>
                    setPuntosSeleccionados(
                      puntosSeleccionados.length === puntos.length ? [] : puntos.map((p) => p.id)
                    )
                  }
                >
                  {puntosSeleccionados.length === puntos.length ? 'Deseleccionar todos' : 'Seleccionar todos'}
                </button>
              </div>
              <div className="points-checkbox-grid compact">
                {puntos.map((pt) => {
                  const checked = puntosSeleccionados.includes(pt.id);
                  return (
                    <div
                      key={pt.id}
                      onClick={() => togglePunto(pt.id)}
                      className={`point-check-card ${checked ? 'checked' : ''}`}
                    >
                      {checked ? <CheckSquare size={18} color="#059669" /> : <Square size={18} />}
                      <div>
                        <strong>{pt.nombre}</strong>
                        <div className="subtext">
                          {pt.cliente_nombre} · {pt.direccion}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary full-width"
              disabled={generando || puntosSeleccionados.length === 0}
            >
              <Route size={18} />
              <span>
                {generando
                  ? 'Calculando recorrido óptimo...'
                  : modo === 'reparto_automatico'
                  ? 'Generar y Repartir Rutas Automáticamente'
                  : 'Generar Ruta Óptima para el Recolector'}
              </span>
            </button>
          </form>
        </div>

        <div className="card">
          <h3>Rutas Generadas para el {fecha}</h3>
          {rutasExistentes.length === 0 ? (
            <p className="text-muted">No hay rutas generadas para esta fecha todavía.</p>
          ) : (
            <>
              <div className="route-tabs" style={{ marginBottom: '14px' }}>
                {rutasExistentes.map((rt) => (
                  <button
                    key={rt.id}
                    type="button"
                    onClick={() => setRutaActivaVista(rt)}
                    className={`chip-btn ${rutaActivaVista?.id === rt.id ? 'active' : ''}`}
                  >
                    {rt.recolector_nombre} ({(rt.puntos || []).length} pts ·{' '}
                    {((rt.distancia_total_m || 0) / 1000).toFixed(1)} km)
                  </button>
                ))}
              </div>

              {rutaActivaVista && (
                <>
                  <InteractiveMap
                    height="320px"
                    polylineCoords={polylineCoords}
                    markers={(rutaActivaVista.puntos || []).map((pt, idx) => ({
                      id: pt.punto_id || idx,
                      latitud: pt.latitud,
                      longitud: pt.longitud,
                      color: pt.estado === 'recolectado' ? '#10b981' : '#0284c7',
                      label: idx + 1,
                      popup: (
                        <div>
                          <strong>
                            Orden #{idx + 1}: {pt.nombre}
                          </strong>
                          <div>{pt.direccion}</div>
                          <div>Estado: {pt.estado}</div>
                        </div>
                      ),
                    }))}
                  />

                  <div style={{ marginTop: '14px' }}>
                    <h4>Secuencia de Recorrido ({rutaActivaVista.nombre})</h4>
                    <div className="ordered-route-list">
                      {(rutaActivaVista.puntos || []).map((pt, idx) => (
                        <div key={pt.punto_id || idx} className="ordered-route-item">
                          <span className="step-circle">{idx + 1}</span>
                          <div style={{ flex: 1 }}>
                            <strong>{pt.nombre}</strong>
                            <div className="subtext">{pt.direccion}</div>
                          </div>
                          <span
                            className={`status-pill ${
                              pt.estado === 'recolectado' ? 'status-active' : 'status-pending'
                            }`}
                          >
                            {pt.estado === 'recolectado' ? 'Recolectado' : 'Pendiente'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

