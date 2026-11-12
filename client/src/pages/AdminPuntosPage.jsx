import React, { useState, useEffect, useCallback } from 'react';
import { MapPin, PlusCircle, Edit3, Power, Scale, CheckCircle2 } from 'lucide-react';
import { apiFetch } from '../api/http';
import InteractiveMap from '../components/InteractiveMap';

export default function AdminPuntosPage() {
  const [puntos, setPuntos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [tiposResiduo, setTiposResiduo] = useState([]);
  const [filtroEstado, setFiltroEstado] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Modal de Crear / Editar Punto
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPunto, setEditingPunto] = useState(null);
  const [form, setForm] = useState({
    nombre: '',
    cliente_id: '',
    direccion: '',
    latitud: -34.6037,
    longitud: -58.3816,
    frecuencia_semanal: 3,
    dias_preferidos: 'Lun,Mié,Vie',
    composicion: [],
  });

  // Modal de Recolección Manual desde Administración
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [puntoManual, setPuntoManual] = useState(null);
  const [manualForm, setManualForm] = useState({
    peso_total_kg: '',
    modo_calculo: 'automatico',
    observaciones: 'Recolección manual cargada desde Administración.',
    detalles_manuales: {},
  });

  const cargarTodo = useCallback(async () => {
    setLoading(true);
    try {
      const q = filtroEstado !== '' ? `?habilitado=${filtroEstado}` : '';
      const [pRes, cRes, tRes] = await Promise.all([
        apiFetch(`/admin/puntos${q}`),
        apiFetch('/admin/clientes?habilitado=true'),
        apiFetch('/admin/tipos-residuo'),
      ]);
      setPuntos(pRes.puntos || []);
      setClientes(cRes.clientes || []);
      setTiposResiduo((tRes.tipos_residuo || []).filter((t) => t.habilitado));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filtroEstado]);

  useEffect(() => {
    cargarTodo();
  }, [cargarTodo]);

  const openNuevoPunto = () => {
    setEditingPunto(null);
    setForm({
      nombre: '',
      cliente_id: clientes[0]?.id || '',
      direccion: '',
      latitud: -34.6037,
      longitud: -58.3816,
      frecuencia_semanal: 3,
      dias_preferidos: 'Lun,Mié,Vie',
      composicion: tiposResiduo.map((t, idx) => ({
        tipo_residuo_id: t.id,
        nombre: t.nombre,
        porcentaje: idx === 0 ? 100 : 0,
      })),
    });
    setModalOpen(true);
  };

  const openEditarPunto = (pt) => {
    setEditingPunto(pt);
    const mapComp = Object.fromEntries((pt.composicion || []).map((c) => [c.tipo_residuo_id, c.porcentaje]));
    setForm({
      nombre: pt.nombre,
      cliente_id: pt.cliente_id,
      direccion: pt.direccion,
      latitud: pt.latitud,
      longitud: pt.longitud,
      frecuencia_semanal: pt.frecuencia_semanal || 3,
      dias_preferidos: pt.dias_preferidos || 'Lun,Mié,Vie',
      composicion: tiposResiduo.map((t) => ({
        tipo_residuo_id: t.id,
        nombre: t.nombre,
        porcentaje: mapComp[t.id] || 0,
      })),
    });
    setModalOpen(true);
  };

  const handleSavePunto = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (editingPunto) {
        await apiFetch(`/admin/puntos/${editingPunto.id}`, {
          method: 'PUT',
          body: JSON.stringify(form),
        });
      } else {
        await apiFetch('/admin/puntos', {
          method: 'POST',
          body: JSON.stringify(form),
        });
      }
      setModalOpen(false);
      cargarTodo();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleToggleEstado = async (pt) => {
    try {
      await apiFetch(`/admin/puntos/${pt.id}`, {
        method: 'PUT',
        body: JSON.stringify({ habilitado: !pt.habilitado }),
      });
      cargarTodo();
    } catch (err) {
      setError(err.message);
    }
  };

  const openRecoleccionManual = (pt) => {
    setPuntoManual(pt);
    const initDetalles = {};
    for (const t of tiposResiduo) {
      initDetalles[t.id] = '';
    }
    setManualForm({
      peso_total_kg: '',
      modo_calculo: 'automatico',
      observaciones: 'Recolección manual registrada desde Administración.',
      detalles_manuales: initDetalles,
    });
    setManualModalOpen(true);
  };

  const handleSubmitManual = async (e) => {
    e.preventDefault();
    setError('');
    try {
      let pesoTotal = Number(manualForm.peso_total_kg);
      const detallesArray = Object.entries(manualForm.detalles_manuales)
        .filter(([, val]) => Number(val) > 0)
        .map(([tipo_residuo_id, val]) => ({
          tipo_residuo_id,
          peso_kg: Number(val),
        }));

      if (manualForm.modo_calculo === 'manual' && detallesArray.length > 0) {
        const sumaManual = detallesArray.reduce((acc, d) => acc + d.peso_kg, 0);
        if (!pesoTotal) pesoTotal = sumaManual;
      }

      await apiFetch(`/admin/puntos/${puntoManual.id}/recoleccion-manual`, {
        method: 'POST',
        body: JSON.stringify({
          peso_total_kg: pesoTotal,
          modo_calculo: manualForm.modo_calculo,
          detalles_manuales: detallesArray,
          observaciones: manualForm.observaciones,
        }),
      });
      setManualModalOpen(false);
      setSuccessMsg(`Se registró la recolección manual para "${puntoManual.nombre}" (${pesoTotal} kg).`);
      setTimeout(() => setSuccessMsg(''), 4000);
      cargarTodo();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="page-section">
      <div className="section-header">
        <div>
          <h2>Puntos de Recolección</h2>
          <p className="text-muted">
            Registro de puntos con ubicación en el mapa, asociación a clientes, última fecha de recolección y carga manual administrativa.
          </p>
        </div>
        <button className="btn btn-primary" onClick={openNuevoPunto}>
          <PlusCircle size={18} />
          <span>Nuevo Punto de Recolección</span>
        </button>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}
      {successMsg && (
        <div className="alert alert-success">
          <CheckCircle2 size={18} />
          <span>{successMsg}</span>
        </div>
      )}

      <div className="card" style={{ marginBottom: '20px' }}>
        <InteractiveMap
          height="320px"
          markers={puntos.map((p, i) => ({
            id: p.id,
            latitud: p.latitud,
            longitud: p.longitud,
            color: p.habilitado ? '#059669' : '#94a3b8',
            label: i + 1,
            popup: (
              <div>
                <strong>{p.nombre}</strong>
                <div>Cliente: {p.cliente_nombre}</div>
                <div>{p.direccion}</div>
                <div>
                  Última recolección:{' '}
                  {p.ultima_recoleccion_at
                    ? new Date(p.ultima_recoleccion_at).toLocaleString('es-AR')
                    : 'Sin registros'}
                </div>
              </div>
            ),
          }))}
        />
      </div>

      <div className="card">
        <div className="filter-bar">
          <div className="form-group inline">
            <label>Filtrar por Estado:</label>
            <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
              <option value="">Todos (Habilitados y Deshabilitados)</option>
              <option value="true">Solo Habilitados</option>
              <option value="false">Solo Deshabilitados</option>
            </select>
          </div>
        </div>

        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Punto de Recolección</th>
                <th>Cliente Asociado</th>
                <th>Frecuencia y Composición</th>
                <th>Última Recolección</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="6" className="text-center">
                    Cargando puntos de recolección...
                  </td>
                </tr>
              ) : (
                puntos.map((pt) => (
                  <tr key={pt.id} className={!pt.habilitado ? 'row-disabled' : ''}>
                    <td>
                      <strong>{pt.nombre}</strong>
                      <div className="subtext">
                        <MapPin size={12} /> {pt.direccion} ({Number(pt.latitud).toFixed(4)},{' '}
                        {Number(pt.longitud).toFixed(4)})
                      </div>
                    </td>
                    <td>{pt.cliente_nombre}</td>
                    <td>
                      <div>
                        <strong>{pt.frecuencia_semanal}x/semana</strong> ({pt.dias_preferidos})
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
                    </td>
                    <td>
                      {pt.ultima_recoleccion_at ? (
                        <div>
                          <strong>{new Date(pt.ultima_recoleccion_at).toLocaleString('es-AR')}</strong>
                          {pt.ultimo_peso_kg && <div className="subtext">Último retiro: {pt.ultimo_peso_kg} kg</div>}
                        </div>
                      ) : (
                        <span className="text-muted">Sin recolecciones aún</span>
                      )}
                    </td>
                    <td>
                      <span className={`status-pill ${pt.habilitado ? 'status-active' : 'status-inactive'}`}>
                        {pt.habilitado ? 'Habilitado' : 'Deshabilitado'}
                      </span>
                    </td>
                    <td>
                      <div className="action-btns">
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => openRecoleccionManual(pt)}
                          title="Generar recolección manual desde administración"
                        >
                          <Scale size={15} />
                          <span>Recolección Manual</span>
                        </button>
                        <button className="btn btn-outline btn-sm" onClick={() => openEditarPunto(pt)}>
                          <Edit3 size={15} />
                          <span>Editar</span>
                        </button>
                        <button
                          className={`btn btn-sm ${pt.habilitado ? 'btn-danger-outline' : 'btn-secondary'}`}
                          onClick={() => handleToggleEstado(pt)}
                        >
                          <Power size={15} />
                          <span>{pt.habilitado ? 'Deshabilitar' : 'Habilitar'}</span>
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

      {/* Modal Nuevo / Editar Punto de Recolección */}
      {modalOpen && (
        <div className="modal-backdrop">
          <div className="modal-card large">
            <h3>{editingPunto ? `Editar Punto: ${editingPunto.nombre}` : 'Nuevo Punto de Recolección'}</h3>
            <form onSubmit={handleSavePunto} className="grid-form">
              <div className="form-group">
                <label>Nombre del Punto *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Planta Industrial Sur - Dársena 2"
                  value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Cliente Asociado *</label>
                <select
                  required
                  value={form.cliente_id}
                  onChange={(e) => setForm({ ...form, cliente_id: e.target.value })}
                >
                  <option value="">Seleccione cliente...</option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre} ({c.razon_social})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Dirección *</label>
                <input
                  type="text"
                  required
                  placeholder="Calle, Altura y Localidad"
                  value={form.direccion}
                  onChange={(e) => setForm({ ...form, direccion: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Frecuencia Semanal (recolecciones/semana)</label>
                <input
                  type="number"
                  min="1"
                  max="14"
                  value={form.frecuencia_semanal}
                  onChange={(e) => setForm({ ...form, frecuencia_semanal: Number(e.target.value) })}
                />
              </div>

              <div className="full-col">
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600 }}>
                  Ubicación en el Mapa (Haz clic sobre el mapa para posicionar el punto): Lat {form.latitud}, Lng{' '}
                  {form.longitud}
                </label>
                <InteractiveMap
                  height="250px"
                  center={[form.latitud, form.longitud]}
                  onMapClick={(coords) =>
                    setForm({ ...form, latitud: coords.latitud, longitud: coords.longitud })
                  }
                  markers={[
                    {
                      id: 'selected-pt',
                      latitud: form.latitud,
                      longitud: form.longitud,
                      color: '#0284c7',
                      label: 'P',
                    },
                  ]}
                />
              </div>

              <div className="full-col">
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>
                  Porcentaje esperado por Tipo de Residuo (para cálculo automático):
                </label>
                <div className="residuo-pct-grid">
                  {form.composicion.map((comp, idx) => (
                    <div key={comp.tipo_residuo_id} className="pct-item">
                      <span>{comp.nombre}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={comp.porcentaje}
                          onChange={(e) => {
                            const next = [...form.composicion];
                            next[idx] = { ...next[idx], porcentaje: Number(e.target.value) };
                            setForm({ ...form, composicion: next });
                          }}
                        />
                        <span>%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="modal-actions full-col">
                <button type="button" className="btn btn-outline" onClick={() => setModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingPunto ? 'Guardar Cambios' : 'Registrar Punto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Recolección Manual desde Administración */}
      {manualModalOpen && puntoManual && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <h3>
              <Scale size={18} /> Recolección Manual: {puntoManual.nombre}
            </h3>
            <p className="text-muted">
              Registra una recolección desde Administración cuando no haya sido ingresada desde la app del recolector.
            </p>
            <form onSubmit={handleSubmitManual} className="auth-form">
              <div className="form-group">
                <label>Modo de Cálculo de Residuos</label>
                <select
                  value={manualForm.modo_calculo}
                  onChange={(e) => setManualForm({ ...manualForm, modo_calculo: e.target.value })}
                >
                  <option value="automatico">
                    Cálculo automático según porcentajes configurados en el punto
                  </option>
                  <option value="manual">Ingresar manualmente el peso para cada tipo de residuo</option>
                </select>
              </div>

              <div className="form-group">
                <label>Peso Total Recolectado (kg) *</label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  required={manualForm.modo_calculo === 'automatico'}
                  placeholder="Ej: 420"
                  value={manualForm.peso_total_kg}
                  onChange={(e) => setManualForm({ ...manualForm, peso_total_kg: e.target.value })}
                />
              </div>

              {manualForm.modo_calculo === 'manual' && (
                <div className="residuo-pct-grid" style={{ marginBottom: '12px' }}>
                  {tiposResiduo.map((t) => (
                    <div key={t.id} className="pct-item">
                      <span>{t.nombre} (kg)</span>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        placeholder="0 kg"
                        value={manualForm.detalles_manuales[t.id] || ''}
                        onChange={(e) =>
                          setManualForm({
                            ...manualForm,
                            detalles_manuales: {
                              ...manualForm.detalles_manuales,
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
                <label>Observaciones</label>
                <input
                  type="text"
                  value={manualForm.observaciones}
                  onChange={(e) => setManualForm({ ...manualForm, observaciones: e.target.value })}
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-outline" onClick={() => setManualModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  Confirmar Recolección Manual
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

