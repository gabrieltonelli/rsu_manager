import React, { useState, useEffect, useCallback } from 'react';
import { Building2, PlusCircle, Edit3, Power, Calendar, MapPin } from 'lucide-react';
import { apiFetch } from '../api/http';

export default function AdminClientesPage() {
  const [clientes, setClientes] = useState([]);
  const [usuariosCliente, setUsuariosCliente] = useState([]);
  const [tiposResiduo, setTiposResiduo] = useState([]);
  const [filtroEstado, setFiltroEstado] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modal Crear / Editar Cliente + Configuración de sus puntos (porcentajes y frecuencia)
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCliente, setEditingCliente] = useState(null);
  const [form, setForm] = useState({
    nombre: '',
    razon_social: '',
    cuit_dni: '',
    direccion: '',
    telefono: '',
    email_contacto: '',
    usuario_id: '',
    notas: '',
    configuracion_puntos: [],
  });

  // Modal Historial de Recolección por Punto y Semana
  const [historialOpen, setHistorialOpen] = useState(false);
  const [clienteHistorial, setClienteHistorial] = useState(null);
  const [puntoHistorialId, setPuntoHistorialId] = useState('');
  const [recoleccionesHistorial, setRecoleccionesHistorial] = useState([]);

  const cargarTodo = useCallback(async () => {
    setLoading(true);
    try {
      const q = filtroEstado !== '' ? `?habilitado=${filtroEstado}` : '';
      const [cRes, uRes, tRes] = await Promise.all([
        apiFetch(`/admin/clientes${q}`),
        apiFetch('/admin/usuarios?rol=cliente'),
        apiFetch('/admin/tipos-residuo'),
      ]);
      setClientes(cRes.clientes || []);
      setUsuariosCliente(uRes.usuarios || []);
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

  const openNuevoCliente = () => {
    setEditingCliente(null);
    setForm({
      nombre: '',
      razon_social: '',
      cuit_dni: '',
      direccion: '',
      telefono: '',
      email_contacto: '',
      usuario_id: '',
      notas: '',
      configuracion_puntos: [],
    });
    setModalOpen(true);
  };

  const openEditarCliente = (cli) => {
    setEditingCliente(cli);
    const cfgs = (cli.puntos || []).map((pt) => {
      const mapComp = Object.fromEntries(
        (pt.composicion || []).map((c) => [c.tipo_residuo_id, c.porcentaje])
      );
      return {
        punto_id: pt.id,
        nombre: pt.nombre,
        frecuencia_semanal: pt.frecuencia_semanal || 3,
        dias_preferidos: pt.dias_preferidos || 'Lun,Mié,Vie',
        composicion: tiposResiduo.map((t) => ({
          tipo_residuo_id: t.id,
          nombre: t.nombre,
          porcentaje: mapComp[t.id] || 0,
        })),
      };
    });

    setForm({
      nombre: cli.nombre,
      razon_social: cli.razon_social || '',
      cuit_dni: cli.cuit_dni || '',
      direccion: cli.direccion || '',
      telefono: cli.telefono || '',
      email_contacto: cli.email_contacto || '',
      usuario_id: cli.usuario_id || '',
      notas: cli.notas || '',
      configuracion_puntos: cfgs,
    });
    setModalOpen(true);
  };

  const handleSaveCliente = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (editingCliente) {
        await apiFetch(`/admin/clientes/${editingCliente.id}`, {
          method: 'PUT',
          body: JSON.stringify(form),
        });
      } else {
        await apiFetch('/admin/clientes', {
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

  const handleToggleEstado = async (cli) => {
    try {
      await apiFetch(`/admin/clientes/${cli.id}`, {
        method: 'PUT',
        body: JSON.stringify({ habilitado: !cli.habilitado }),
      });
      cargarTodo();
    } catch (err) {
      setError(err.message);
    }
  };

  const cargarHistorialCliente = async (clienteId, puntoId = '') => {
    try {
      const q = puntoId ? `?punto_id=${puntoId}` : '';
      const res = await apiFetch(`/admin/clientes/${clienteId}/historial${q}`);
      setRecoleccionesHistorial(res.recolecciones || []);
    } catch (err) {
      setError(err.message);
    }
  };

  const openVerHistorial = (cli) => {
    setClienteHistorial(cli);
    const primerPunto = cli.puntos?.[0]?.id || '';
    setPuntoHistorialId(primerPunto);
    setHistorialOpen(true);
    cargarHistorialCliente(cli.id, primerPunto);
  };

  // Agrupar recolecciones por semana ISO
  const recoleccionesPorSemana = recoleccionesHistorial.reduce((acc, r) => {
    const sem = r.semana_iso || 'Semana Actual';
    if (!acc[sem]) acc[sem] = [];
    acc[sem].push(r);
    return acc;
  }, {});

  return (
    <div className="page-section">
      <div className="section-header">
        <div>
          <h2>Clientes y Configuración de Puntos</h2>
          <p className="text-muted">
            Administración de clientes, porcentajes esperados de cada tipo de residuo, frecuencia semanal e historial separado por semana.
          </p>
        </div>
        <button className="btn btn-primary" onClick={openNuevoCliente}>
          <PlusCircle size={18} />
          <span>Nuevo Cliente</span>
        </button>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

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
                <th>Cliente / Razón Social</th>
                <th>Contacto y Usuario Asociado</th>
                <th>Puntos Asignados y Configuración</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="5" className="text-center">
                    Cargando clientes...
                  </td>
                </tr>
              ) : (
                clientes.map((c) => (
                  <tr key={c.id} className={!c.habilitado ? 'row-disabled' : ''}>
                    <td>
                      <strong>{c.nombre}</strong>
                      <div className="subtext">
                        {c.razon_social} · CUIT: {c.cuit_dni || '—'}
                      </div>
                    </td>
                    <td>
                      <div>{c.email_contacto || '—'}</div>
                      <div className="subtext">
                        Tel: {c.telefono || '—'}
                        {c.usuario_email ? ` · Acceso: ${c.usuario_email}` : ''}
                      </div>
                    </td>
                    <td>
                      {(c.puntos || []).length === 0 ? (
                        <span className="text-muted">Sin puntos asignados</span>
                      ) : (
                        (c.puntos || []).map((pt) => (
                          <div key={pt.id} style={{ marginBottom: '6px' }}>
                            <strong>
                              <MapPin size={12} /> {pt.nombre}
                            </strong>{' '}
                            <span className="perm-chip">{pt.frecuencia_semanal}x/sem</span>
                            <div className="perm-tags" style={{ marginTop: '2px' }}>
                              {(pt.composicion || []).map((comp) => (
                                <span
                                  key={comp.tipo_residuo_id}
                                  className="perm-chip"
                                  style={{ borderLeft: `3px solid ${comp.color_hex}` }}
                                >
                                  {comp.nombre}: {comp.porcentaje}%
                                </span>
                              ))}
                            </div>
                          </div>
                        ))
                      )}
                    </td>
                    <td>
                      <span className={`status-pill ${c.habilitado ? 'status-active' : 'status-inactive'}`}>
                        {c.habilitado ? 'Habilitado' : 'Deshabilitado'}
                      </span>
                    </td>
                    <td>
                      <div className="action-btns">
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => openVerHistorial(c)}
                        >
                          <Calendar size={15} />
                          <span>Historial Semanal</span>
                        </button>
                        <button className="btn btn-outline btn-sm" onClick={() => openEditarCliente(c)}>
                          <Edit3 size={15} />
                          <span>Editar y Configurar Puntos</span>
                        </button>
                        <button
                          className={`btn btn-sm ${c.habilitado ? 'btn-danger-outline' : 'btn-secondary'}`}
                          onClick={() => handleToggleEstado(c)}
                        >
                          <Power size={15} />
                          <span>{c.habilitado ? 'Deshabilitar' : 'Habilitar'}</span>
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

      {/* Modal Crear / Editar Cliente y Configuración de Puntos */}
      {modalOpen && (
        <div className="modal-backdrop">
          <div className="modal-card large">
            <h3>
              <Building2 size={18} />{' '}
              {editingCliente ? `Editar Cliente: ${editingCliente.nombre}` : 'Crear Nuevo Cliente'}
            </h3>
            <form onSubmit={handleSaveCliente} className="grid-form">
              <div className="form-group">
                <label>Nombre Comercial *</label>
                <input
                  type="text"
                  required
                  value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Razón Social</label>
                <input
                  type="text"
                  value={form.razon_social}
                  onChange={(e) => setForm({ ...form, razon_social: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>CUIT / DNI</label>
                <input
                  type="text"
                  value={form.cuit_dni}
                  onChange={(e) => setForm({ ...form, cuit_dni: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Teléfono</label>
                <input
                  type="text"
                  value={form.telefono}
                  onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Email de Contacto</label>
                <input
                  type="email"
                  value={form.email_contacto}
                  onChange={(e) => setForm({ ...form, email_contacto: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Vincular a Usuario con Rol Cliente</label>
                <select
                  value={form.usuario_id}
                  onChange={(e) => setForm({ ...form, usuario_id: e.target.value })}
                >
                  <option value="">Sin usuario vinculado</option>
                  {usuariosCliente.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nombre_completo} ({u.email})
                    </option>
                  ))}
                </select>
              </div>

              {form.configuracion_puntos.length > 0 && (
                <div className="full-col">
                  <h4>Configuración de Puntos Asignados (Frecuencia Semanal y % de Residuos)</h4>
                  {form.configuracion_puntos.map((ptCfg, ptIdx) => (
                    <div key={ptCfg.punto_id} className="point-config-box">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <strong>📍 {ptCfg.nombre}</strong>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <label style={{ margin: 0 }}>Frecuencia (veces por semana):</label>
                          <input
                            type="number"
                            min="1"
                            max="14"
                            style={{ width: '75px' }}
                            value={ptCfg.frecuencia_semanal}
                            onChange={(e) => {
                              const next = [...form.configuracion_puntos];
                              next[ptIdx] = {
                                ...next[ptIdx],
                                frecuencia_semanal: Number(e.target.value),
                              };
                              setForm({ ...form, configuracion_puntos: next });
                            }}
                          />
                        </div>
                      </div>
                      <div className="residuo-pct-grid">
                        {ptCfg.composicion.map((comp, cIdx) => (
                          <div key={comp.tipo_residuo_id} className="pct-item">
                            <span>{comp.nombre}</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <input
                                type="number"
                                min="0"
                                max="100"
                                value={comp.porcentaje}
                                onChange={(e) => {
                                  const next = [...form.configuracion_puntos];
                                  const nextComp = [...next[ptIdx].composicion];
                                  nextComp[cIdx] = {
                                    ...nextComp[cIdx],
                                    porcentaje: Number(e.target.value),
                                  };
                                  next[ptIdx] = { ...next[ptIdx], composicion: nextComp };
                                  setForm({ ...form, configuracion_puntos: next });
                                }}
                              />
                              <span>%</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="modal-actions full-col">
                <button type="button" className="btn btn-outline" onClick={() => setModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  Guardar Cliente y Configuración
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Historial de Recolección Separado por Semana y Punto */}
      {historialOpen && clienteHistorial && (
        <div className="modal-backdrop">
          <div className="modal-card large">
            <h3>
              <Calendar size={18} /> Historial de Recolección — {clienteHistorial.nombre}
            </h3>
            <div className="filter-bar" style={{ marginBottom: '16px' }}>
              <div className="form-group inline">
                <label>Seleccionar Punto Asignado:</label>
                <select
                  value={puntoHistorialId}
                  onChange={(e) => {
                    setPuntoHistorialId(e.target.value);
                    cargarHistorialCliente(clienteHistorial.id, e.target.value);
                  }}
                >
                  <option value="">Todos los puntos del cliente</option>
                  {(clienteHistorial.puntos || []).map((pt) => (
                    <option key={pt.id} value={pt.id}>
                      {pt.nombre} ({pt.direccion})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {Object.keys(recoleccionesPorSemana).length === 0 ? (
              <p className="text-muted">No hay recolecciones registradas para el punto seleccionado.</p>
            ) : (
              Object.entries(recoleccionesPorSemana).map(([semana, items]) => (
                <div key={semana} className="week-group-card">
                  <div className="week-group-header">
                    <strong>📅 Semana {semana}</strong>
                    <span>
                      Total recolectado en la semana:{' '}
                      <strong>
                        {items.reduce((acc, r) => acc + Number(r.peso_total_kg), 0).toFixed(1)} kg
                      </strong>
                    </span>
                  </div>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Fecha y Hora</th>
                        <th>Punto</th>
                        <th>Recolector</th>
                        <th>Peso Total</th>
                        <th>Desglose por Tipo de Residuo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((r) => (
                        <tr key={r.id}>
                          <td>{new Date(r.fecha_recoleccion).toLocaleString('es-AR')}</td>
                          <td>{r.punto_nombre}</td>
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
              ))
            )}

            <div className="modal-actions" style={{ marginTop: '16px' }}>
              <button className="btn btn-outline" onClick={() => setHistorialOpen(false)}>
                Cerrar Historial
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

