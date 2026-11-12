import React, { useState, useEffect, useCallback } from 'react';
import { MapPin, Send, Calendar, CheckCircle2 } from 'lucide-react';
import { apiFetch } from '../api/http';
import InteractiveMap from '../components/InteractiveMap';

export default function ClienteDashboardPage() {
  const [cliente, setCliente] = useState(null);
  const [puntos, setPuntos] = useState([]);
  const [peticiones, setPeticiones] = useState([]);
  const [recolecciones, setRecolecciones] = useState([]);
  const [puntoFiltroId, setPuntoFiltroId] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [peticionForm, setPeticionForm] = useState({
    punto_id: '',
    fecha_solicitada: new Date().toISOString().slice(0, 10),
    prioridad: 'normal',
    observaciones: '',
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const cargarDashboard = useCallback(async (ptId = puntoFiltroId) => {
    setLoading(true);
    try {
      const q = ptId ? `?punto_id=${ptId}` : '';
      const data = await apiFetch(`/cliente/dashboard${q}`);
      setCliente(data.cliente || null);
      setPuntos(data.puntos || []);
      setPeticiones(data.peticiones || []);
      setRecolecciones(data.recolecciones || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [puntoFiltroId]);

  useEffect(() => {
    cargarDashboard();
  }, [cargarDashboard]);

  const handleSolicitarPeticion = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res = await apiFetch('/cliente/peticiones', {
        method: 'POST',
        body: JSON.stringify(peticionForm),
      });
      setModalOpen(false);
      setSuccessMsg(res.message);
      setTimeout(() => setSuccessMsg(''), 4000);
      cargarDashboard(puntoFiltroId);
    } catch (err) {
      setError(err.message);
    }
  };

  // Agrupar historial por semana ISO
  const historialPorSemana = recolecciones.reduce((acc, r) => {
    const sem = r.semana_iso || 'Semana Actual';
    if (!acc[sem]) acc[sem] = [];
    acc[sem].push(r);
    return acc;
  }, {});

  return (
    <div className="page-section">
      <div className="section-header">
        <div>
          <h2>Dashboard de Cliente {cliente ? `— ${cliente.nombre}` : ''}</h2>
          <p className="text-muted">
            Visualiza tus puntos de recolección asignados, solicita peticiones de retiro y consulta el historial separado por semana.
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => {
            setPeticionForm({
              punto_id: puntos[0]?.id || '',
              fecha_solicitada: new Date().toISOString().slice(0, 10),
              prioridad: 'normal',
              observaciones: '',
            });
            setModalOpen(true);
          }}
        >
          <Send size={18} />
          <span>Solicitar Petición de Recolección</span>
        </button>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}
      {successMsg && (
        <div className="alert alert-success">
          <CheckCircle2 size={18} />
          <span>{successMsg}</span>
        </div>
      )}

      <div className="two-col-layout" style={{ marginBottom: '20px' }}>
        <div className="card">
          <h3>
            <MapPin size={18} /> Mis Puntos de Recolección ({puntos.length})
          </h3>
          <div className="ordered-route-list">
            {puntos.map((pt) => (
              <div
                key={pt.id}
                className={`ordered-route-item ${puntoFiltroId === pt.id ? 'selected-row' : ''}`}
                style={{ cursor: 'pointer' }}
                onClick={() => setPuntoFiltroId(puntoFiltroId === pt.id ? '' : pt.id)}
              >
                <div style={{ flex: 1 }}>
                  <strong>{pt.nombre}</strong>
                  <div className="subtext">
                    {pt.direccion} · Frecuencia: {pt.frecuencia_semanal}x/semana ({pt.dias_preferidos})
                  </div>
                  <div className="perm-tags" style={{ marginTop: '4px' }}>
                    {(pt.composicion || []).map((c) => (
                      <span
                        key={c.tipo_residuo_id}
                        className="perm-chip"
                        style={{ borderLeft: `3px solid ${c.color_hex}` }}
                      >
                        {c.nombre}: {c.porcentaje}%
                      </span>
                    ))}
                  </div>
                </div>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPuntoFiltroId(pt.id);
                  }}
                >
                  Ver Historial
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <InteractiveMap
            height="300px"
            markers={puntos.map((p, idx) => ({
              id: p.id,
              latitud: p.latitud,
              longitud: p.longitud,
              color: '#059669',
              label: idx + 1,
              popup: (
                <div>
                  <strong>{p.nombre}</strong>
                  <div>{p.direccion}</div>
                </div>
              ),
            }))}
          />
        </div>
      </div>

      {/* Historial de Recolección separado por Semana */}
      <div className="card">
        <div className="filter-bar">
          <h3 style={{ margin: 0 }}>
            <Calendar size={18} /> Historial de Recolección Separado por Semana
          </h3>
          <div className="form-group inline">
            <label>Filtrar por Punto Seleccionado:</label>
            <select
              value={puntoFiltroId}
              onChange={(e) => setPuntoFiltroId(e.target.value)}
            >
              <option value="">Todos mis puntos asignados</option>
              {puntos.map((pt) => (
                <option key={pt.id} value={pt.id}>
                  {pt.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <p>Cargando historial...</p>
        ) : Object.keys(historialPorSemana).length === 0 ? (
          <p className="text-muted">No hay recolecciones registradas para el filtro seleccionado.</p>
        ) : (
          Object.entries(historialPorSemana).map(([semana, lista]) => (
            <div key={semana} className="week-group-card">
              <div className="week-group-header">
                <strong>📅 Semana {semana}</strong>
                <span>
                  Total retirado en la semana:{' '}
                  <strong>
                    {lista.reduce((acc, r) => acc + Number(r.peso_total_kg), 0).toFixed(1)} kg
                  </strong>
                </span>
              </div>
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Fecha y Hora</th>
                      <th>Punto de Recolección</th>
                      <th>Recolector</th>
                      <th>Peso Total</th>
                      <th>Composición Retirada</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lista.map((r) => (
                      <tr key={r.id}>
                        <td>{new Date(r.fecha_recoleccion).toLocaleString('es-AR')}</td>
                        <td>
                          <strong>{r.punto_nombre}</strong>
                        </td>
                        <td>{r.recolector_nombre || 'Administración'}</td>
                        <td>
                          <strong>{r.peso_total_kg} kg</strong>
                        </td>
                        <td>
                          <div className="perm-tags">
                            {(r.detalles || []).map((d, i) => (
                              <span
                                key={i}
                                className="perm-chip"
                                style={{ borderLeft: `3px solid ${d.color_hex}` }}
                              >
                                {d.nombre}: {d.peso_kg} kg
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal Solicitar Petición de Recolección */}
      {modalOpen && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <h3>Solicitar Petición de Recolección</h3>
            <form onSubmit={handleSolicitarPeticion} className="auth-form">
              <div className="form-group">
                <label>Seleccionar Punto de Recolección *</label>
                <select
                  required
                  value={peticionForm.punto_id}
                  onChange={(e) => setPeticionForm({ ...peticionForm, punto_id: e.target.value })}
                >
                  {puntos.map((pt) => (
                    <option key={pt.id} value={pt.id}>
                      {pt.nombre} ({pt.direccion})
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Fecha Solicitada</label>
                <input
                  type="date"
                  value={peticionForm.fecha_solicitada}
                  onChange={(e) =>
                    setPeticionForm({ ...peticionForm, fecha_solicitada: e.target.value })
                  }
                />
              </div>
              <div className="form-group">
                <label>Prioridad</label>
                <select
                  value={peticionForm.prioridad}
                  onChange={(e) => setPeticionForm({ ...peticionForm, prioridad: e.target.value })}
                >
                  <option value="normal">Normal</option>
                  <option value="alta">Alta</option>
                  <option value="urgente">Urgente (Acopio completo)</option>
                </select>
              </div>
              <div className="form-group">
                <label>Observaciones</label>
                <input
                  type="text"
                  placeholder="Ej: Contenedores de cartón completos en dársena."
                  value={peticionForm.observaciones}
                  onChange={(e) =>
                    setPeticionForm({ ...peticionForm, observaciones: e.target.value })
                  }
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-outline" onClick={() => setModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  Enviar Solicitud
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

