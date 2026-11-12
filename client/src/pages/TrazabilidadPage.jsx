import React, { useState, useEffect, useCallback } from 'react';
import { BarChart3, Filter, Scale, Recycle, TrendingUp, Award } from 'lucide-react';
import { apiFetch } from '../api/http';

export default function TrazabilidadPage() {
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [tipoResiduoId, setTipoResiduoId] = useState('');

  const [reporte, setReporte] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const cargarReporte = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const q = new URLSearchParams();
      if (desde) q.set('desde', desde);
      if (hasta) q.set('hasta', hasta);
      if (tipoResiduoId) q.set('tipo_residuo_id', tipoResiduoId);

      const data = await apiFetch(`/trazabilidad?${q.toString()}`);
      setReporte(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [desde, hasta, tipoResiduoId]);

  useEffect(() => {
    cargarReporte();
  }, [cargarReporte]);

  const porTipo = reporte?.por_tipo_residuo || [];
  const porSemana = reporte?.por_semana || [];
  const porPunto = reporte?.por_punto || [];
  const porRecolector = reporte?.por_recolector || [];
  const totalKg = Number(reporte?.kpis?.total_kg_recolectados || 0);

  // Cálculo de segmentos para gráfico de dona SVG
  let accumulatedPercent = 0;
  const donutSegments = porTipo
    .filter((item) => Number(item.total_kg) > 0)
    .map((item) => {
      const pct = totalKg > 0 ? (Number(item.total_kg) / totalKg) * 100 : 0;
      const start = accumulatedPercent;
      accumulatedPercent += pct;
      return {
        ...item,
        pct: Number(pct.toFixed(1)),
        dashArray: `${pct} ${100 - pct}`,
        dashOffset: 100 - start + 25,
      };
    });

  const maxSemanaKg = Math.max(...porSemana.map((s) => Number(s.total_kg)), 1);
  const maxPuntoKg = Math.max(...porPunto.map((p) => Number(p.total_kg)), 1);

  return (
    <div className="page-section">
      <div className="section-header">
        <div>
          <h2>Reporte General de Trazabilidad</h2>
          <p className="text-muted">
            Indicadores ambientales y operativos disponibles para todos los perfiles, con filtros por rango de fechas y tipo de residuo.
          </p>
        </div>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="filter-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
            <Filter size={18} />
            <span>Filtros de Trazabilidad:</span>
          </div>

          <div className="form-group inline">
            <label>Desde:</label>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>

          <div className="form-group inline">
            <label>Hasta:</label>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </div>

          <div className="form-group inline">
            <label>Tipo de Residuo:</label>
            <select value={tipoResiduoId} onChange={(e) => setTipoResiduoId(e.target.value)}>
              <option value="">Todos los tipos de residuo</option>
              {(reporte?.tipos_residuo_catalogo || []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </select>
          </div>

          <button
            className="btn btn-outline btn-sm"
            onClick={() => {
              setDesde('');
              setHasta('');
              setTipoResiduoId('');
            }}
          >
            Limpiar Filtros
          </button>
        </div>
      </div>

      {/* KPIs principales */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-icon" style={{ background: '#dcfce7', color: '#059669' }}>
            <Scale size={24} />
          </div>
          <div>
            <div className="kpi-label">Volumen Total Recolectado</div>
            <div className="kpi-value">{totalKg.toLocaleString('es-AR')} kg</div>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon" style={{ background: '#e0f2fe', color: '#0284c7' }}>
            <Recycle size={24} />
          </div>
          <div>
            <div className="kpi-label">Operaciones de Recolección</div>
            <div className="kpi-value">{reporte?.kpis?.total_operaciones || 0}</div>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon" style={{ background: '#fef3c7', color: '#d97706' }}>
            <TrendingUp size={24} />
          </div>
          <div>
            <div className="kpi-label">Promedio por Recolección</div>
            <div className="kpi-value">
              {Number(reporte?.kpis?.promedio_kg_por_recoleccion || 0).toLocaleString('es-AR')} kg
            </div>
          </div>
        </div>
      </div>

      {/* Gráficos */}
      <div className="two-col-layout" style={{ marginTop: '20px' }}>
        {/* Gráfico 1: Dona de Distribución por Tipo de Residuo */}
        <div className="card">
          <h3>
            <BarChart3 size={18} /> 1. Composición por Tipo de Residuo (Gráfico de Anillo)
          </h3>
          <div className="donut-chart-layout">
            <svg viewBox="0 0 42 42" className="donut-svg">
              <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="#f1f5f9" strokeWidth="6" />
              {donutSegments.map((seg) => (
                <circle
                  key={seg.tipo_residuo_id}
                  cx="21"
                  cy="21"
                  r="15.915"
                  fill="transparent"
                  stroke={seg.color_hex}
                  strokeWidth="6"
                  strokeDasharray={seg.dashArray}
                  strokeDashoffset={seg.dashOffset}
                />
              ))}
              <text x="21" y="20" textAnchor="middle" fontSize="4.2" fontWeight="700" fill="#0f172a">
                {totalKg.toFixed(0)} kg
              </text>
              <text x="21" y="24.5" textAnchor="middle" fontSize="2.5" fill="#64748b">
                Total Reciclado
              </text>
            </svg>

            <div className="donut-legend">
              {porTipo.map((item) => {
                const pct = totalKg > 0 ? ((Number(item.total_kg) / totalKg) * 100).toFixed(1) : '0.0';
                return (
                  <div key={item.tipo_residuo_id} className="legend-row">
                    <span className="legend-dot" style={{ background: item.color_hex }} />
                    <span style={{ flex: 1 }}>{item.nombre}</span>
                    <strong>{Number(item.total_kg).toLocaleString('es-AR')} kg</strong>
                    <span className="perm-chip">{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Gráfico 2: Evolución por Semana (Columnas Verticales) */}
        <div className="card">
          <h3>
            <TrendingUp size={18} /> 2. Evolución Semanal de Recolección (kg por Semana ISO)
          </h3>
          {porSemana.length === 0 ? (
            <p className="text-muted">Sin datos en el período seleccionado.</p>
          ) : (
            <div className="vertical-bars-chart">
              {porSemana.map((sem) => {
                const heightPct = Math.max((Number(sem.total_kg) / maxSemanaKg) * 100, 8);
                return (
                  <div key={sem.semana_iso} className="v-bar-col">
                    <div className="v-bar-value">{Number(sem.total_kg).toFixed(0)} kg</div>
                    <div className="v-bar-track">
                      <div
                        className="v-bar-fill"
                        style={{ height: `${heightPct}%`, background: '#059669' }}
                      />
                    </div>
                    <div className="v-bar-label">{sem.semana_iso}</div>
                    <small className="text-muted">{sem.recolecciones} retiros</small>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="two-col-layout" style={{ marginTop: '20px' }}>
        {/* Gráfico 3: Barras Horizontales por Punto de Recolección */}
        <div className="card">
          <h3>
            <Award size={18} /> 3. Volumen Recolectado por Punto y Cliente
          </h3>
          <div className="h-bars-list">
            {porPunto.map((pt) => {
              const widthPct = Math.max((Number(pt.total_kg) / maxPuntoKg) * 100, 4);
              return (
                <div key={pt.punto_id} className="h-bar-item">
                  <div className="h-bar-header">
                    <span>
                      <strong>{pt.punto_nombre}</strong> <small>({pt.cliente_nombre})</small>
                    </span>
                    <strong>{Number(pt.total_kg).toLocaleString('es-AR')} kg</strong>
                  </div>
                  <div className="h-bar-track">
                    <div
                      className="h-bar-fill"
                      style={{ width: `${widthPct}%`, background: '#0284c7' }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Gráfico 4: Rendimiento por Recolector y Estado de Volquetes */}
        <div className="card">
          <h3>4. Trazabilidad por Recolector y Circuito de Volquetes</h3>
          <div className="h-bars-list" style={{ marginBottom: '18px' }}>
            {porRecolector.map((rec, i) => (
              <div key={i} className="legend-row">
                <span>🚛 {rec.recolector_nombre}</span>
                <span>{rec.recolecciones} operaciones</span>
                <strong>{Number(rec.total_kg).toLocaleString('es-AR')} kg</strong>
              </div>
            ))}
          </div>

          <h4>Estado del Circuito de Volquetes</h4>
          <div className="perm-tags">
            {(reporte?.volquetes_por_estado || []).map((v) => (
              <div key={v.estado} className="role-card" style={{ flex: 1, minWidth: '140px' }}>
                <div className="subtext">{v.estado.toUpperCase()}</div>
                <strong style={{ fontSize: '18px' }}>{v.cantidad} volquetes</strong>
                <div className="subtext">
                  ${Number(v.facturacion_estimada || 0).toLocaleString('es-AR')}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tabla detallada de Trazabilidad */}
      <div className="card" style={{ marginTop: '20px' }}>
        <h3>Detalle Trazable de Operaciones de Recolección</h3>
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Fecha / Semana</th>
                <th>Punto de Recolección</th>
                <th>Cliente</th>
                <th>Recolector</th>
                <th>Peso Total</th>
                <th>Desglose por Tipo de Residuo</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="6" className="text-center">
                    Generando reporte de trazabilidad...
                  </td>
                </tr>
              ) : (
                (reporte?.recolecciones_detalle || []).map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div>{new Date(r.fecha_recoleccion).toLocaleString('es-AR')}</div>
                      <small className="text-muted">{r.semana_iso}</small>
                    </td>
                    <td>
                      <strong>{r.punto_nombre}</strong>
                    </td>
                    <td>{r.cliente_nombre}</td>
                    <td>{r.recolector_nombre}</td>
                    <td>
                      <strong>{r.peso_total_kg} kg</strong>
                    </td>
                    <td>
                      <div className="perm-tags">
                        {(r.desglose || []).map((d, idx) => (
                          <span
                            key={idx}
                            className="perm-chip"
                            style={{ borderLeft: `3px solid ${d.color_hex}` }}
                          >
                            {d.nombre}: {d.peso_kg} kg
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

