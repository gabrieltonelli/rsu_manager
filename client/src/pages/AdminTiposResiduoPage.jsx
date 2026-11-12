import React, { useState, useEffect } from 'react';
import { PlusCircle, Edit3, Power, Recycle } from 'lucide-react';
import { apiFetch } from '../api/http';

export default function AdminTiposResiduoPage() {
  const [tipos, setTipos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    nombre: '',
    codigo: '',
    descripcion: '',
    color_hex: '#10b981',
    unidad: 'kg',
  });

  const cargarTipos = async () => {
    setLoading(true);
    try {
      const data = await apiFetch('/admin/tipos-residuo');
      setTipos(data.tipos_residuo || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarTipos();
  }, []);

  const openNew = () => {
    setEditing(null);
    setForm({ nombre: '', codigo: '', descripcion: '', color_hex: '#10b981', unidad: 'kg' });
    setModalOpen(true);
  };

  const openEdit = (t) => {
    setEditing(t);
    setForm({
      nombre: t.nombre,
      codigo: t.codigo,
      descripcion: t.descripcion || '',
      color_hex: t.color_hex || '#10b981',
      unidad: t.unidad || 'kg',
    });
    setModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (editing) {
        await apiFetch(`/admin/tipos-residuo/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify(form),
        });
      } else {
        await apiFetch('/admin/tipos-residuo', {
          method: 'POST',
          body: JSON.stringify(form),
        });
      }
      setModalOpen(false);
      cargarTipos();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleToggle = async (t) => {
    try {
      await apiFetch(`/admin/tipos-residuo/${t.id}`, {
        method: 'PUT',
        body: JSON.stringify({ habilitado: !t.habilitado }),
      });
      cargarTipos();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="page-section">
      <div className="section-header">
        <div>
          <h2>Tipos de Residuo</h2>
          <p className="text-muted">
            Catálogo de materiales reciclables y valorizables utilizados en los puntos de recolección y reportes de trazabilidad.
          </p>
        </div>
        <button className="btn btn-primary" onClick={openNew}>
          <PlusCircle size={18} />
          <span>Crear Tipo de Residuo</span>
        </button>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      <div className="card">
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Color / Código</th>
                <th>Nombre del Residuo</th>
                <th>Descripción</th>
                <th>Unidad</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="6" className="text-center">
                    Cargando tipos de residuo...
                  </td>
                </tr>
              ) : (
                tipos.map((t) => (
                  <tr key={t.id} className={!t.habilitado ? 'row-disabled' : ''}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span
                          style={{
                            width: '18px',
                            height: '18px',
                            borderRadius: '50%',
                            background: t.color_hex,
                            display: 'inline-block',
                          }}
                        />
                        <code>{t.codigo}</code>
                      </div>
                    </td>
                    <td>
                      <strong>{t.nombre}</strong>
                    </td>
                    <td>{t.descripcion || '—'}</td>
                    <td>{t.unidad}</td>
                    <td>
                      <span className={`status-pill ${t.habilitado ? 'status-active' : 'status-inactive'}`}>
                        {t.habilitado ? 'Habilitado' : 'Deshabilitado'}
                      </span>
                    </td>
                    <td>
                      <div className="action-btns">
                        <button className="btn btn-outline btn-sm" onClick={() => openEdit(t)}>
                          <Edit3 size={15} />
                          <span>Editar</span>
                        </button>
                        <button
                          className={`btn btn-sm ${t.habilitado ? 'btn-danger-outline' : 'btn-secondary'}`}
                          onClick={() => handleToggle(t)}
                        >
                          <Power size={15} />
                          <span>{t.habilitado ? 'Deshabilitar' : 'Habilitar'}</span>
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

      {modalOpen && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <h3>
              <Recycle size={18} /> {editing ? 'Editar Tipo de Residuo' : 'Nuevo Tipo de Residuo'}
            </h3>
            <form onSubmit={handleSave} className="auth-form">
              <div className="form-group">
                <label>Nombre del Tipo de Residuo *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Papel Blanco / Cartón / Aluminio"
                  value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Descripción</label>
                <input
                  type="text"
                  placeholder="Detalle de materiales incluidos..."
                  value={form.descripcion}
                  onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', gap: '14px' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Color Identificatorio (Gráficos)</label>
                  <input
                    type="color"
                    value={form.color_hex}
                    onChange={(e) => setForm({ ...form, color_hex: e.target.value })}
                    style={{ height: '42px', padding: '4px' }}
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Unidad de Medida</label>
                  <input
                    type="text"
                    value={form.unidad}
                    onChange={(e) => setForm({ ...form, unidad: e.target.value })}
                  />
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-outline" onClick={() => setModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

