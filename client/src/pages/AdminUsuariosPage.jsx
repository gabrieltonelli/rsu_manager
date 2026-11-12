import React, { useState, useEffect, useCallback } from 'react';
import { UserPlus, Edit3, Power, Shield, KeyRound, CheckCircle } from 'lucide-react';
import { apiFetch } from '../api/http';

export default function AdminUsuariosPage() {
  const [usuarios, setUsuarios] = useState([]);
  const [roles, setRoles] = useState([]);
  const [filtroRol, setFiltroRol] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [form, setForm] = useState({
    nombre_completo: '',
    email: '',
    password: '',
    telefono: '',
    rol_codigo: 'cliente',
    habilitado: true,
    vehiculo_patente: '',
    licencia_conducir: '',
    capacidad_max_kg: 5000,
  });

  const cargarDatos = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (filtroRol) q.set('rol', filtroRol);
      if (filtroEstado !== '') q.set('habilitado', filtroEstado);
      const [uRes, rRes] = await Promise.all([
        apiFetch(`/admin/usuarios?${q.toString()}`),
        apiFetch('/admin/roles'),
      ]);
      setUsuarios(uRes.usuarios || []);
      setRoles(rRes.roles || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filtroRol, filtroEstado]);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  const openCreateModal = () => {
    setEditingUser(null);
    setForm({
      nombre_completo: '',
      email: '',
      password: '',
      telefono: '',
      rol_codigo: 'recolector',
      habilitado: true,
      vehiculo_patente: '',
      licencia_conducir: '',
      capacidad_max_kg: 5000,
    });
    setModalOpen(true);
  };

  const openEditModal = (u) => {
    setEditingUser(u);
    setForm({
      nombre_completo: u.nombre_completo || '',
      email: u.email || '',
      password: '',
      telefono: u.telefono || '',
      rol_codigo: u.rol_codigo || 'cliente',
      habilitado: u.habilitado,
      vehiculo_patente: u.vehiculo_patente || '',
      licencia_conducir: u.licencia_conducir || '',
      capacidad_max_kg: u.capacidad_max_kg || 5000,
    });
    setModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (editingUser) {
        await apiFetch(`/admin/usuarios/${editingUser.id}`, {
          method: 'PUT',
          body: JSON.stringify(form),
        });
      } else {
        await apiFetch('/admin/usuarios', {
          method: 'POST',
          body: JSON.stringify(form),
        });
      }
      setModalOpen(false);
      cargarDatos();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleToggleEstado = async (u) => {
    try {
      await apiFetch(`/admin/usuarios/${u.id}`, {
        method: 'PUT',
        body: JSON.stringify({ habilitado: !u.habilitado }),
      });
      cargarDatos();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleQuickApprove = async (u, nuevoRol) => {
    try {
      await apiFetch(`/admin/usuarios/${u.id}`, {
        method: 'PUT',
        body: JSON.stringify({ rol_codigo: nuevoRol, habilitado: true }),
      });
      cargarDatos();
    } catch (err) {
      setError(err.message);
    }
  };

  const pendientes = usuarios.filter((u) => u.rol_codigo === 'pendiente_aprobacion');

  return (
    <div className="page-section">
      <div className="section-header">
        <div>
          <h2>Gestión de Usuarios y Roles</h2>
          <p className="text-muted">
            Crear, editar, asignar roles, cambiar contraseña y habilitar/deshabilitar usuarios del sistema.
          </p>
        </div>
        <button className="btn btn-primary" onClick={openCreateModal}>
          <UserPlus size={18} />
          <span>Nuevo Usuario</span>
        </button>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      {pendientes.length > 0 && (
        <div className="card pending-banner">
          <h4>🔔 Usuarios Pendientes de Aprobación ({pendientes.length})</h4>
          <p className="text-muted">
            Estos usuarios ingresaron por primera vez con Google/OAuth y requieren asignación de rol por un Administrador:
          </p>
          <div className="pending-list">
            {pendientes.map((p) => (
              <div key={p.id} className="pending-item">
                <div>
                  <strong>{p.nombre_completo}</strong> · <span>{p.email}</span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => handleQuickApprove(p, 'cliente')}>
                    <CheckCircle size={15} /> Aprobar como Cliente
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={() => handleQuickApprove(p, 'recolector')}>
                    <CheckCircle size={15} /> Aprobar como Recolector
                  </button>
                  <button className="btn btn-outline btn-sm" onClick={() => handleQuickApprove(p, 'administrador')}>
                    Aprobar Admin
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div className="filter-bar">
          <div className="form-group inline">
            <label>Filtrar por Rol:</label>
            <select value={filtroRol} onChange={(e) => setFiltroRol(e.target.value)}>
              <option value="">Todos los roles</option>
              <option value="administrador">Administrador</option>
              <option value="recolector">Recolector</option>
              <option value="cliente">Cliente</option>
              <option value="pendiente_aprobacion">Pendiente de Aprobación</option>
            </select>
          </div>

          <div className="form-group inline">
            <label>Estado:</label>
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
                <th>Nombre Completo</th>
                <th>Correo Electrónico</th>
                <th>Rol Asignado</th>
                <th>Teléfono / Vehículo</th>
                <th>Estado</th>
                <th>Última Conexión</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="7" className="text-center">
                    Cargando usuarios...
                  </td>
                </tr>
              ) : usuarios.length === 0 ? (
                <tr>
                  <td colSpan="7" className="text-center">
                    No se encontraron usuarios con esos filtros.
                  </td>
                </tr>
              ) : (
                usuarios.map((u) => (
                  <tr key={u.id} className={!u.habilitado ? 'row-disabled' : ''}>
                    <td>
                      <strong>{u.nombre_completo}</strong>
                      {u.cliente_nombre && <div className="subtext">Cliente: {u.cliente_nombre}</div>}
                    </td>
                    <td>{u.email}</td>
                    <td>
                      <span className={`role-badge role-${u.rol_codigo}`}>{u.rol_nombre}</span>
                    </td>
                    <td>
                      <div>{u.telefono || '—'}</div>
                      {u.vehiculo_patente && <div className="subtext">Patente: {u.vehiculo_patente}</div>}
                    </td>
                    <td>
                      <span className={`status-pill ${u.habilitado ? 'status-active' : 'status-inactive'}`}>
                        {u.habilitado ? 'Habilitado' : 'Deshabilitado'}
                      </span>
                    </td>
                    <td>
                      {u.ultima_conexion_at
                        ? new Date(u.ultima_conexion_at).toLocaleString('es-AR')
                        : 'Sin ingreso registrado'}
                    </td>
                    <td>
                      <div className="action-btns">
                        <button className="btn btn-outline btn-sm" onClick={() => openEditModal(u)} title="Editar / Cambiar rol o contraseña">
                          <Edit3 size={15} />
                          <span>Editar</span>
                        </button>
                        <button
                          className={`btn btn-sm ${u.habilitado ? 'btn-danger-outline' : 'btn-secondary'}`}
                          onClick={() => handleToggleEstado(u)}
                        >
                          <Power size={15} />
                          <span>{u.habilitado ? 'Deshabilitar' : 'Habilitar'}</span>
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

      <div className="card" style={{ marginTop: '20px' }}>
        <h3>
          <Shield size={18} /> Matriz de Roles y Permisos Activos en Base de Datos
        </h3>
        <div className="roles-grid">
          {roles.map((r) => (
            <div key={r.id} className="role-card">
              <div className="role-card-header">
                <span className={`role-badge role-${r.codigo}`}>{r.nombre}</span>
                <small>Nivel {r.nivel_acceso}</small>
              </div>
              <p className="text-muted">{r.descripcion}</p>
              <div className="perm-tags">
                {(r.permisos || []).map((p) => (
                  <span key={p.id} className="perm-chip">
                    {p.codigo}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {modalOpen && (
        <div className="modal-backdrop">
          <div className="modal-card large">
            <h3>{editingUser ? `Editar Usuario: ${editingUser.nombre_completo}` : 'Crear Nuevo Usuario'}</h3>
            <form onSubmit={handleSave} className="grid-form">
              <div className="form-group">
                <label>Nombre Completo *</label>
                <input
                  type="text"
                  required
                  value={form.nombre_completo}
                  onChange={(e) => setForm({ ...form, nombre_completo: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Correo Electrónico *</label>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Rol del Sistema *</label>
                <select
                  value={form.rol_codigo}
                  onChange={(e) => setForm({ ...form, rol_codigo: e.target.value })}
                >
                  <option value="administrador">Administrador</option>
                  <option value="recolector">Recolector</option>
                  <option value="cliente">Cliente</option>
                  <option value="pendiente_aprobacion">Pendiente de Aprobación</option>
                </select>
              </div>

              <div className="form-group">
                <label>
                  <KeyRound size={14} /> {editingUser ? 'Nueva Contraseña (dejar vacío para no cambiar)' : 'Contraseña Inicial *'}
                </label>
                <input
                  type="password"
                  required={!editingUser}
                  placeholder={editingUser ? 'Sin cambios' : 'Mínimo 6 caracteres'}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
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
                <label>Estado del Usuario</label>
                <select
                  value={String(form.habilitado)}
                  onChange={(e) => setForm({ ...form, habilitado: e.target.value === 'true' })}
                >
                  <option value="true">Habilitado</option>
                  <option value="false">Deshabilitado</option>
                </select>
              </div>

              {form.rol_codigo === 'recolector' && (
                <>
                  <div className="form-group">
                    <label>Patente del Vehículo Asignado</label>
                    <input
                      type="text"
                      placeholder="Ej: AE 452 KL"
                      value={form.vehiculo_patente}
                      onChange={(e) => setForm({ ...form, vehiculo_patente: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Licencia Profesional</label>
                    <input
                      type="text"
                      placeholder="Ej: B2-C1-99812"
                      value={form.licencia_conducir}
                      onChange={(e) => setForm({ ...form, licencia_conducir: e.target.value })}
                    />
                  </div>
                </>
              )}

              <div className="modal-actions full-col">
                <button type="button" className="btn btn-outline" onClick={() => setModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingUser ? 'Guardar Cambios' : 'Crear Usuario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

