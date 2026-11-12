import React, { useState, useEffect } from 'react';
import { Container, PlusCircle, Truck, DollarSign, History, CheckCircle2 } from 'lucide-react';
import { apiFetch } from '../api/http';

export default function AdminVolquetesPage() {
  const [volquetes, setVolquetes] = useState([]);
  const [recolectores, setRecolectores] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modal de Alta Manual (Línea Telefónica)
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [form, setForm] = useState({
    direccion: '',
    telefono_contacto: '',
    nombre_solicitante: '',
    cliente_id: '',
    recolector_asignado_id: '',
    tarifa_unitaria: 45000,
    notas: '',
  });

  // Modal de Historial de Movimientos y Facturación
  const [detalleVolquete, setDetalleVolquete] = useState(null);

  const cargarDatos = async () => {
    setLoading(true);
    try {
      const [vRes, rRes, cRes] = await Promise.all([
        apiFetch('/volquetes/admin'),
        apiFetch('/admin/recolectores?habilitado=true'),
        apiFetch('/admin/clientes?habilitado=true'),
      ]);
      setVolquetes(vRes.volquetes || []);
      setRecolectores(rRes.recolectores || []);
      setClientes(cRes.clientes || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarDatos();
  }, []);

  const handleCrearManual = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await apiFetch('/volquetes/admin', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setNewModalOpen(false);
      cargarDatos();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleAsignarRecolector = async (volqueteId, recolectorId) => {
    try {
      await apiFetch(`/volquetes/admin/${volqueteId}`, {
        method: 'PUT',
        body: JSON.stringify({ recolector_asignado_id: recolectorId || null }),
      });
      cargarDatos();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRegistrarMovimiento = async (volqueteId, tipoMovimiento) => {
    try {
      await apiFetch(`/volquetes/admin/${volqueteId}`, {
        method: 'PUT',
        body: JSON.stringify({ registrar_movimiento: tipoMovimiento }),
      });
      setDetalleVolquete(null);
      cargarDatos();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="page-section">
      <div className="section-header">
        <div>
          <h2>Volquetes · Administración</h2>
          <p className="text-muted">
            Registro manual de solicitudes telefónicas, asignación de recolector, historial de movimientos (envío, cambio, retiro final) y cierre a Facturado.
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => {
            setForm({
              direccion: '',
              telefono_contacto: '',
              nombre_solicitante: '',
              cliente_id: '',
              recolector_asignado_id: recolectores[0]?.id || '',
              tarifa_unitaria: 45000,
              notas: '',
            });
            setNewModalOpen(true);
          }}
        >
          <PlusCircle size={18} />
          <span>Registrar Solicitud Telefónica / Manual</span>
        </button>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      <div className="card">
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Código / Origen</th>
                <th>Dirección y Solicitante</th>
                <th>Recolector Asignado</th>
                <th>Movimientos (Env / Cam / Ret)</th>
                <th>Total a Cobrar</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="7" className="text-center">
                    Cargando gestiones de volquetes...
                  </td>
                </tr>
              ) : (
                volquetes.map((v) => (
                  <tr key={v.id}>
                    <td>
                      <strong>{v.codigo}</strong>
                      <div className="subtext">
                        Vía: {v.origen === 'publico' ? '🌐 Web Pública' : '📞 Administración'}
                      </div>
                    </td>
                    <td>
                      <strong>{v.direccion}</strong>
                      <div className="subtext">
                        {v.nombre_solicitante} · Tel: {v.telefono_contacto}
                      </div>
                    </td>
                    <td>
                      <select
                        value={v.recolector_asignado_id || ''}
                        disabled={v.estado === 'facturado'}
                        onChange={(e) => handleAsignarRecolector(v.id, e.target.value)}
                      >
                        <option value="">Sin asignar...</option>
                        {recolectores.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.nombre_completo}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <span className="perm-chip">Envíos: {v.cantidad_envios}</span>{' '}
                      <span className="perm-chip">Cambios: {v.cantidad_cambios}</span>{' '}
                      <span className="perm-chip">Retiros: {v.cantidad_retiros}</span>
                    </td>
                    <td>
                      <strong>
                        ${Number(v.monto_total || 0).toLocaleString('es-AR')}
                      </strong>
                    </td>
                    <td>
                      <span
                        className={`status-pill ${
                          v.estado === 'facturado'
                            ? 'status-active'
                            : v.estado === 'finalizado'
                            ? 'status-pending'
                            : 'role-recolector'
                        }`}
                      >
                        {v.estado.toUpperCase()}
                      </span>
                    </td>
                    <td>
                      <div className="action-btns">
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => setDetalleVolquete(v)}
                        >
                          <History size={15} />
                          <span>Movimientos y Cobro</span>
                        </button>
                        {v.estado !== 'facturado' && (
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleRegistrarMovimiento(v.id, 'facturacion')}
                          >
                            <DollarSign size={15} />
                            <span>Marcar Facturado</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Alta Manual Telefónica */}
      {newModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <h3>
              <Container size={18} /> Registrar Solicitud Manual de Volquete
            </h3>
            <form onSubmit={handleCrearManual} className="auth-form">
              <div className="form-group">
                <label>Dirección de Entrega *</label>
                <input
                  type="text"
                  required
                  placeholder="Calle, Altura y Localidad"
                  value={form.direccion}
                  onChange={(e) => setForm({ ...form, direccion: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Teléfono de Contacto *</label>
                <input
                  type="text"
                  required
                  placeholder="+54 11 ..."
                  value={form.telefono_contacto}
                  onChange={(e) => setForm({ ...form, telefono_contacto: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Nombre del Solicitante / Cliente</label>
                <input
                  type="text"
                  value={form.nombre_solicitante}
                  onChange={(e) => setForm({ ...form, nombre_solicitante: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Asignar Recolector Encargado</label>
                <select
                  value={form.recolector_asignado_id}
                  onChange={(e) => setForm({ ...form, recolector_asignado_id: e.target.value })}
                >
                  <option value="">Asignar luego...</option>
                  {recolectores.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nombre_completo} ({r.vehiculo_patente})
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Tarifa Unitaria Base ($ ARS)</label>
                <input
                  type="number"
                  value={form.tarifa_unitaria}
                  onChange={(e) => setForm({ ...form, tarifa_unitaria: Number(e.target.value) })}
                />
              </div>
              <div className="form-group">
                <label>Notas</label>
                <input
                  type="text"
                  value={form.notas}
                  onChange={(e) => setForm({ ...form, notas: e.target.value })}
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-outline" onClick={() => setNewModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  Registrar Solicitud
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Historial de Movimientos y Liquidación */}
      {detalleVolquete && (
        <div className="modal-backdrop">
          <div className="modal-card large">
            <h3>
              Historial de Movimientos — {detalleVolquete.codigo} ({detalleVolquete.direccion})
            </h3>
            <p className="text-muted">
              Solicitante: {detalleVolquete.nombre_solicitante} · Tel: {detalleVolquete.telefono_contacto} · Total acumulado:{' '}
              <strong>${Number(detalleVolquete.monto_total || 0).toLocaleString('es-AR')}</strong>
            </p>

            {detalleVolquete.estado !== 'facturado' && (
              <div className="filter-bar" style={{ marginBottom: '16px' }}>
                <span>Registrar nuevo movimiento:</span>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => handleRegistrarMovimiento(detalleVolquete.id, 'envio')}
                >
                  <Truck size={14} /> Registrar Envío (Entrega)
                </button>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => handleRegistrarMovimiento(detalleVolquete.id, 'cambio')}
                >
                  <Truck size={14} /> Registrar Cambio (+${Number(detalleVolquete.tarifa_unitaria).toLocaleString('es-AR')})
                </button>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => handleRegistrarMovimiento(detalleVolquete.id, 'retiro_final')}
                >
                  <CheckCircle2 size={14} /> Registrar Retiro Final
                </button>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => handleRegistrarMovimiento(detalleVolquete.id, 'facturacion')}
                >
                  <DollarSign size={14} /> Pasar a Estado Final: FACTURADO
                </button>
              </div>
            )}

            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Fecha y Hora</th>
                    <th>Tipo de Movimiento</th>
                    <th>Origen</th>
                    <th>Cargo Asociado</th>
                    <th>Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {(detalleVolquete.movimientos || []).map((m) => (
                    <tr key={m.id}>
                      <td>{new Date(m.created_at).toLocaleString('es-AR')}</td>
                      <td>
                        <strong>{m.tipo_movimiento.toUpperCase()}</strong>
                      </td>
                      <td>{m.origen}</td>
                      <td>${Number(m.costo_movimiento || 0).toLocaleString('es-AR')}</td>
                      <td>{m.notas}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="modal-actions" style={{ marginTop: '16px' }}>
              <button className="btn btn-outline" onClick={() => setDetalleVolquete(null)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

