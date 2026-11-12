import React, { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, RefreshCw, Eye } from 'lucide-react';
import { apiFetch } from '../api/http';

export default function AdminAuditoriaPage() {
  const [registros, setRegistros] = useState([]);
  const [tabla, setTabla] = useState('');
  const [operacion, setOperacion] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedRow, setSelectedRow] = useState(null);

  const cargarAuditoria = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (tabla) q.set('tabla', tabla);
      if (operacion) q.set('operacion', operacion);
      const data = await apiFetch(`/admin/auditoria?${q.toString()}`);
      setRegistros(data.registros || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [tabla, operacion]);

  useEffect(() => {
    cargarAuditoria();
  }, [cargarAuditoria]);

  return (
    <div className="page-section">
      <div className="section-header">
        <div>
          <h2>
            <ShieldCheck size={22} /> Tabla de Auditoría (Triggers PostgreSQL en Tiempo Real)
          </h2>
          <p className="text-muted">
            Registro inmutable generado automáticamente mediante triggers PL/pgSQL (<code>fn_registrar_auditoria</code>) en cada INSERT, UPDATE o DELETE.
          </p>
        </div>
        <button className="btn btn-outline" onClick={cargarAuditoria}>
          <RefreshCw size={16} />
          <span>Actualizar Registros</span>
        </button>
      </div>

      <div className="card">
        <div className="filter-bar">
          <div className="form-group inline">
            <label>Tabla Afectada:</label>
            <select value={tabla} onChange={(e) => setTabla(e.target.value)}>
              <option value="">Todas las tablas</option>
              <option value="usuarios">usuarios</option>
              <option value="tipos_residuo">tipos_residuo</option>
              <option value="puntos_recoleccion">puntos_recoleccion</option>
              <option value="punto_residuo_porcentajes">punto_residuo_porcentajes</option>
              <option value="clientes">clientes</option>
              <option value="rutas">rutas</option>
              <option value="ruta_puntos">ruta_puntos</option>
              <option value="recolecciones">recolecciones</option>
              <option value="recoleccion_detalles">recoleccion_detalles</option>
              <option value="volquetes_gestiones">volquetes_gestiones</option>
              <option value="volquetes_movimientos">volquetes_movimientos</option>
            </select>
          </div>

          <div className="form-group inline">
            <label>Operación SQL Trigger:</label>
            <select value={operacion} onChange={(e) => setOperacion(e.target.value)}>
              <option value="">Todas (INSERT / UPDATE / DELETE)</option>
              <option value="INSERT">INSERT</option>
              <option value="UPDATE">UPDATE</option>
              <option value="DELETE">DELETE</option>
            </select>
          </div>
        </div>

        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Fecha y Hora</th>
                <th>Usuario Ejecutor</th>
                <th>Rol / IP</th>
                <th>Tabla</th>
                <th>Operación</th>
                <th>Descripción de la Acción</th>
                <th>Detalle JSONB</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="8" className="text-center">
                    Consultando tabla public.auditoria...
                  </td>
                </tr>
              ) : (
                registros.map((r) => (
                  <tr key={r.id}>
                    <td>#{r.id}</td>
                    <td>{new Date(r.created_at).toLocaleString('es-AR')}</td>
                    <td>
                      <strong>{r.usuario_email}</strong>
                    </td>
                    <td>
                      <span className="perm-chip">{r.usuario_rol}</span>
                      <div className="subtext">{r.ip_origen}</div>
                    </td>
                    <td>
                      <code>{r.tabla_afectada}</code>
                    </td>
                    <td>
                      <span
                        className={`status-pill ${
                          r.operacion === 'INSERT'
                            ? 'status-active'
                            : r.operacion === 'UPDATE'
                            ? 'status-pending'
                            : 'status-inactive'
                        }`}
                      >
                        {r.operacion}
                      </span>
                    </td>
                    <td>{r.accion_descripcion}</td>
                    <td>
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={() => setSelectedRow(r)}
                      >
                        <Eye size={14} /> Ver JSON
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedRow && (
        <div className="modal-backdrop">
          <div className="modal-card large">
            <h3>
              Detalle de Auditoría #{selectedRow.id} ({selectedRow.operacion} en{' '}
              <code>{selectedRow.tabla_afectada}</code>)
            </h3>
            <p className="text-muted">
              Ejecutado por <strong>{selectedRow.usuario_email}</strong> ({selectedRow.usuario_rol}) el{' '}
              {new Date(selectedRow.created_at).toLocaleString('es-AR')}
            </p>
            <div className="two-col-layout">
              <div>
                <h4>Datos Anteriores (OLD)</h4>
                <pre className="json-viewer">
                  {selectedRow.datos_anteriores
                    ? JSON.stringify(selectedRow.datos_anteriores, null, 2)
                    : 'null (Registro nuevo)'}
                </pre>
              </div>
              <div>
                <h4>Datos Nuevos (NEW)</h4>
                <pre className="json-viewer">
                  {selectedRow.datos_nuevos
                    ? JSON.stringify(selectedRow.datos_nuevos, null, 2)
                    : 'null (Registro eliminado)'}
                </pre>
              </div>
            </div>
            <div className="modal-actions" style={{ marginTop: '14px' }}>
              <button className="btn btn-outline" onClick={() => setSelectedRow(null)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

