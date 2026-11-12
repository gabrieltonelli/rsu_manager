import React, { useState, useEffect, useCallback } from 'react';
import { Truck, Radio, Route, UserPlus, Edit3, Power, RefreshCw } from 'lucide-react';
import { apiFetch } from '../api/http';
import InteractiveMap from '../components/InteractiveMap';

export default function AdminRecolectoresPage() {
  const [recolectores, setRecolectores] = useState([]);
  const [puntos, setPuntos] = useState([]);
  const [filtroEstado, setFiltroEstado] = useState('');
  const [showLiveMap, setShowLiveMap] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modal de Crear / Editar Recolector
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingRec, setEditingRec] = useState(null);
  const [recForm, setRecForm] = useState({
    nombre_completo: '',
    email: '',
    password: '',
    telefono: '',
    vehiculo_patente: '',
    licencia_conducir: '',
    capacidad_max_kg: 5000,
    habilitado: true,
  });

  // Modal de Modificación de Ruta del Recolector
  const [rutaModalOpen, setRutaModalOpen] = useState(false);
  const [recParaRuta, setRecParaRuta] = useState(null);
  const [fechaRuta, setFechaRuta] = useState(new Date().toISOString().slice(0, 10));
  const [puntosSeleccionados, setPuntosSeleccionados] = useState([]);
  const [rutaGeneradaPreview, setRutaGeneradaPreview] = useState(null);
  const [guardandoRuta, setGuardandoRuta] = useState(false);

  const cargarDatos = useCallback(async () => {
    setLoading(true);
    try {
      const q = filtroEstado !== '' ? `?habilitado=${filtroEstado}` : '';
      const [recRes, ptsRes] = await Promise.all([
        apiFetch(`/admin/recolectores${q}`),
        apiFetch('/admin/puntos?habilitado=true'),
      ]);
      setRecolectores(recRes.recolectores || []);
      setPuntos(ptsRes.puntos || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filtroEstado]);

  useEffect(() => {
    cargarDatos();
    const interval = setInterval(cargarDatos, 15000); // Refresco automático del mapa en vivo
    return () => clearInterval(interval);
  }, [cargarDatos]);

  const openCreateRecolector = () => {
    setEditingRec(null);
    setRecForm({
      nombre_completo: '',
      email: '',
      password: '',
      telefono: '',
      vehiculo_patente: '',
      licencia_conducir: '',
      capacidad_max_kg: 5500,
      habilitado: true,
    });
    setEditModalOpen(true);
  };

  const openEditRecolector = (r) => {
    setEditingRec(r);
    setRecForm({
      nombre_completo: r.nombre_completo,
      email: r.email,
      password: '',
      telefono: r.telefono || '',
      vehiculo_patente: r.vehiculo_patente || '',
      licencia_conducir: r.licencia_conducir || '',
      capacidad_max_kg: r.capacidad_max_kg || 5500,
      habilitado: r.habilitado,
    });
    setEditModalOpen(true);
  };

  const handleSaveRecolector = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (editingRec) {
        await apiFetch(`/admin/usuarios/${editingRec.id}`, {
          method: 'PUT',
          body: JSON.stringify({ ...recForm, rol_codigo: 'recolector' }),
        });
      } else {
        await apiFetch('/admin/usuarios', {
          method: 'POST',
          body: JSON.stringify({ ...recForm, rol_codigo: 'recolector' }),
        });
      }
      setEditModalOpen(false);
      cargarDatos();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleToggleEstado = async (r) => {
    try {
      await apiFetch(`/admin/usuarios/${r.id}`, {
        method: 'PUT',
        body: JSON.stringify({ habilitado: !r.habilitado }),
      });
      cargarDatos();
    } catch (err) {
      setError(err.message);
    }
  };

  const openModificarRuta = (r) => {
    setRecParaRuta(r);
    const currentIds = (r.ruta_actual?.puntos || []).map((p) => p.punto_id);
    setPuntosSeleccionados(currentIds);
    setRutaGeneradaPreview(r.ruta_actual || null);
    setRutaModalOpen(true);
  };

  const togglePuntoRuta = (id) => {
    setPuntosSeleccionados((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleGuardarRutaRecolector = async (e) => {
    e.preventDefault();
    setError('');
    setGuardandoRuta(true);
    try {
      const res = await apiFetch(`/admin/recolectores/${recParaRuta.id}/ruta`, {
        method: 'PUT',
        body: JSON.stringify({
          fecha: fechaRuta,
          puntos_ids: puntosSeleccionados,
          nombre: `Ruta ${recParaRuta.nombre_completo} (${fechaRuta})`,
          optimizar_orden: true,
        }),
      });
      setRutaGeneradaPreview(res.ruta);
      cargarDatos();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardandoRuta(false);
    }
  };

  const polylinePreview =
    rutaGeneradaPreview?.geometria_geojson?.coordinates?.map(([lng, lat]) => [lat, lng]) || [];

  return (
    <div className="page-section">
      <div className="section-header">
        <div>
          <h2>Recolectores y Mapa en Vivo</h2>
          <p className="text-muted">
            Administración de recolectores, modificación de ruta asignada y monitoreo GPS en vivo (conectados y última conexión).
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            className={`btn ${showLiveMap ? 'btn-secondary' : 'btn-outline'}`}
            onClick={() => setShowLiveMap(!showLiveMap)}
          >
            <Radio size={18} />
            <span>{showLiveMap ? 'Ocultar Mapa en Vivo' : 'Abrir Mapa en Vivo'}</span>
          </button>
          <button className="btn btn-primary" onClick={openCreateRecolector}>
            <UserPlus size={18} />
            <span>Nuevo Recolector</span>
          </button>
        </div>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      {showLiveMap && (
        <div className="card" style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div>
              <h3 style={{ margin: 0 }}>📡 Mapa en Vivo de Recolectores</h3>
              <small className="text-muted">
                Verde: Recolector conectado en vivo · Gris: Desconectado (muestra su última conexión registrada).
              </small>
            </div>
            <button className="btn btn-outline btn-sm" onClick={cargarDatos}>
              <RefreshCw size={15} /> Actualizar Posiciones
            </button>
          </div>
          <InteractiveMap
            height="340px"
            markers={recolectores
              .filter((r) => r.ultima_lat != null && r.ultima_lng != null)
              .map((r) => ({
                id: r.id,
                latitud: r.ultima_lat,
                longitud: r.ultima_lng,
                color: r.conectado ? '#10b981' : '#64748b',
                label: '🚛',
                popup: (
                  <div>
                    <strong>{r.nombre_completo}</strong>
                    <div>Patente: {r.vehiculo_patente || 'S/D'}</div>
                    <div>
                      Estado:{' '}
                      <strong style={{ color: r.conectado ? '#059669' : '#64748b' }}>
                        {r.conectado ? 'CONECTADO EN VIVO' : 'DESCONECTADO'}
                      </strong>
                    </div>
                    <div>
                      Última conexión:{' '}
                      {r.ultima_conexion_at
                        ? new Date(r.ultima_conexion_at).toLocaleString('es-AR')
                        : 'Sin registro'}
                    </div>
                  </div>
                ),
              }))}
          />
        </div>
      )}

      <div className="card">
        <div className="filter-bar">
          <div className="form-group inline">
            <label>Filtrar por Estado:</label>
            <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
              <option value="">Todos</option>
              <option value="true">Habilitados</option>
              <option value="false">Deshabilitados</option>
            </select>
          </div>
        </div>

        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Recolector</th>
                <th>Vehículo / Licencia</th>
                <th>Conexión en Vivo</th>
                <th>Ruta Actual Asignada</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="6" className="text-center">
                    Cargando recolectores...
                  </td>
                </tr>
              ) : (
                recolectores.map((r) => (
                  <tr key={r.id} className={!r.habilitado ? 'row-disabled' : ''}>
                    <td>
                      <strong>{r.nombre_completo}</strong>
                      <div className="subtext">
                        {r.email} · {r.telefono || 'Sin tel.'}
                      </div>
                    </td>
                    <td>
                      <div>
                        Patente: <strong>{r.vehiculo_patente || '—'}</strong>
                      </div>
                      <div className="subtext">Licencia: {r.licencia_conducir || '—'}</div>
                    </td>
                    <td>
                      {r.conectado ? (
                        <span className="status-pill status-active">🟢 En línea ahora</span>
                      ) : (
                        <div>
                          <span className="status-pill status-inactive">⚪ Desconectado</span>
                          <div className="subtext">
                            Últ. vez:{' '}
                            {r.ultima_conexion_at
                              ? new Date(r.ultima_conexion_at).toLocaleString('es-AR')
                              : 'Nunca'}
                          </div>
                        </div>
                      )}
                    </td>
                    <td>
                      {r.ruta_actual ? (
                        <div>
                          <strong>{r.ruta_actual.nombre}</strong>
                          <div className="subtext">
                            {(r.ruta_actual.puntos || []).length} puntos ·{' '}
                            {((r.ruta_actual.distancia_total_m || 0) / 1000).toFixed(1)} km
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted">Sin ruta asignada hoy</span>
                      )}
                    </td>
                    <td>
                      <span className={`status-pill ${r.habilitado ? 'status-active' : 'status-inactive'}`}>
                        {r.habilitado ? 'Habilitado' : 'Deshabilitado'}
                      </span>
                    </td>
                    <td>
                      <div className="action-btns">
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => openModificarRuta(r)}
                        >
                          <Route size={15} />
                          <span>Modificar Ruta</span>
                        </button>
                        <button className="btn btn-outline btn-sm" onClick={() => openEditRecolector(r)}>
                          <Edit3 size={15} />
                          <span>Editar</span>
                        </button>
                        <button
                          className={`btn btn-sm ${r.habilitado ? 'btn-danger-outline' : 'btn-secondary'}`}
                          onClick={() => handleToggleEstado(r)}
                        >
                          <Power size={15} />
                          <span>{r.habilitado ? 'Deshabilitar' : 'Habilitar'}</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Modificación de Ruta y Visualización en Mapa */}
      {rutaModalOpen && recParaRuta && (
        <div className="modal-backdrop">
          <div className="modal-card large">
            <h3>
              <Truck size={18} /> Modificar Ruta de {recParaRuta.nombre_completo}
            </h3>
            <p className="text-muted">
              Selecciona los puntos de recolección asignados a este recolector y genera la ruta optimizada en el mapa.
            </p>
            <form onSubmit={handleGuardarRutaRecolector}>
              <div className="form-group" style={{ maxWidth: '240px' }}>
                <label>Fecha de la Ruta</label>
                <input
                  type="date"
                  value={fechaRuta}
                  onChange={(e) => setFechaRuta(e.target.value)}
                />
              </div>

              <div className="checklist-box" style={{ marginBottom: '16px' }}>
                <label style={{ fontWeight: 600, display: 'block', marginBottom: '8px' }}>
                  Listado de Puntos de Recolección ({puntosSeleccionados.length} seleccionados):
                </label>
                <div className="points-checkbox-grid">
                  {puntos.map((pt) => (
                    <label
                      key={pt.id}
                      className={`point-check-card ${
                        puntosSeleccionados.includes(pt.id) ? 'checked' : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={puntosSeleccionados.includes(pt.id)}
                        onChange={() => togglePuntoRuta(pt.id)}
                      />
                      <div>
                        <strong>{pt.nombre}</strong>
                        <div className="subtext">
                          {pt.cliente_nombre} · {pt.direccion}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <InteractiveMap
                height="280px"
                polylineCoords={polylinePreview}
                markers={(rutaGeneradaPreview?.puntos || []).map((pt, idx) => ({
                  id: pt.punto_id || pt.id,
                  latitud: pt.latitud,
                  longitud: pt.longitud,
                  color: '#0284c7',
                  label: idx + 1,
                  popup: (
                    <div>
                      <strong>
                        #{idx + 1} - {pt.nombre}
                      </strong>
                      <div>{pt.direccion}</div>
                    </div>
                  ),
                }))}
              />

              <div className="modal-actions" style={{ marginTop: '16px' }}>
                <button type="button" className="btn btn-outline" onClick={() => setRutaModalOpen(false)}>
                  Cerrar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={guardandoRuta || puntosSeleccionados.length === 0}
                >
                  {guardandoRuta ? 'Generando recorrido en mapa...' : 'Asignar Puntos y Calcular Ruta en Mapa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Crear / Editar Recolector */}
      {editModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <h3>{editingRec ? 'Editar Recolector' : 'Nuevo Recolector'}</h3>
            <form onSubmit={handleSaveRecolector} className="auth-form">
              <div className="form-group">
                <label>Nombre Completo *</label>
                <input
                  type="text"
                  required
                  value={recForm.nombre_completo}
                  onChange={(e) => setRecForm({ ...recForm, nombre_completo: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Email *</label>
                <input
                  type="email"
                  required
                  value={recForm.email}
                  onChange={(e) => setRecForm({ ...recForm, email: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>{editingRec ? 'Nueva Contraseña (opcional)' : 'Contraseña *'}</label>
                <input
                  type="password"
                  required={!editingRec}
                  value={recForm.password}
                  onChange={(e) => setRecForm({ ...recForm, password: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Teléfono</label>
                <input
                  type="text"
                  value={recForm.telefono}
                  onChange={(e) => setRecForm({ ...recForm, telefono: e.target.value })}
                />
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Patente del Camión</label>
                  <input
                    type="text"
                    value={recForm.vehiculo_patente}
                    onChange={(e) => setRecForm({ ...recForm, vehiculo_patente: e.target.value })}
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Licencia</label>
                  <input
                    type="text"
                    value={recForm.licencia_conducir}
                    onChange={(e) => setRecForm({ ...recForm, licencia_conducir: e.target.value })}
                  />
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-outline" onClick={() => setEditModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  Guardar Recolector
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

