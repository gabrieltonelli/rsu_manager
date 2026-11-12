const express = require('express');
const { query, withAudit } = require('../config/db');
const { requireAuth, requireRole } = require('../middlewares/auth');
const {
  vapidPublicKey,
  pushConfigured,
  sendPushToUser,
} = require('../services/pushService');

const router = express.Router();

/**
 * GET /api/trazabilidad
 * Reporte general con la misma información disponible para todos los perfiles operativos.
 * Cuenta con filtros por rango de fechas y por tipo de residuo, y presenta indicadores
 * y series para distintos tipos de gráficos.
 */
router.get(
  '/',
  requireAuth,
  requireRole('administrador', 'recolector', 'cliente'),
  async (req, res) => {
    try {
      const { desde, hasta, tipo_residuo_id } = req.query;
      const inquilinoId = req.user.inquilino_id;

      const params = [inquilinoId];
      const whereRec = ['r.inquilino_id = $1'];

      if (desde) {
        params.push(`${desde}T00:00:00.000Z`);
        whereRec.push(`r.fecha_recoleccion >= $${params.length}::timestamptz`);
      }
      if (hasta) {
        params.push(`${hasta}T23:59:59.999Z`);
        whereRec.push(`r.fecha_recoleccion <= $${params.length}::timestamptz`);
      }

      let residuoFilterJoin = '';
      if (tipo_residuo_id) {
        params.push(tipo_residuo_id);
        residuoFilterJoin = `AND rd.tipo_residuo_id = $${params.length}`;
      }

      // 1. Distribución por Tipo de Residuo (Torta / Dona / Barras)
      const porTipoRes = await query(
        `SELECT
          tr.id AS tipo_residuo_id,
          tr.codigo,
          tr.nombre,
          tr.color_hex,
          COALESCE(SUM(rd.peso_kg), 0)::numeric(12,2) AS total_kg,
          COUNT(DISTINCT r.id)::int AS cantidad_recolecciones
         FROM public.tipos_residuo tr
         LEFT JOIN public.recoleccion_detalles rd ON rd.tipo_residuo_id = tr.id
         LEFT JOIN public.recolecciones r
           ON r.id = rd.recoleccion_id
           AND ${whereRec.join(' AND ')}
         WHERE tr.inquilino_id = $1
           ${tipo_residuo_id ? `AND tr.id = $${params.length}` : ''}
         GROUP BY tr.id
         ORDER BY total_kg DESC`,
        params
      );

      // 2. Evolución por Semana ISO (Gráfico de líneas / barras apiladas)
      const porSemanaRes = await query(
        `SELECT
          r.semana_iso,
          COALESCE(SUM(rd.peso_kg), 0)::numeric(12,2) AS total_kg,
          COUNT(DISTINCT r.id)::int AS recolecciones
         FROM public.recolecciones r
         INNER JOIN public.recoleccion_detalles rd ON rd.recoleccion_id = r.id
         WHERE ${whereRec.join(' AND ')} ${residuoFilterJoin}
         GROUP BY r.semana_iso
         ORDER BY r.semana_iso ASC`,
        params
      );

      // 3. Volumen recolectado por Punto y Cliente (Gráfico de barras comparativo)
      const porPuntoRes = await query(
        `SELECT
          p.id AS punto_id,
          p.nombre AS punto_nombre,
          c.nombre AS cliente_nombre,
          COALESCE(SUM(rd.peso_kg), 0)::numeric(12,2) AS total_kg,
          COUNT(DISTINCT r.id)::int AS recolecciones
         FROM public.puntos_recoleccion p
         INNER JOIN public.clientes c ON c.id = p.cliente_id
         LEFT JOIN public.recolecciones r
           ON r.punto_id = p.id
           AND ${whereRec.join(' AND ')}
         LEFT JOIN public.recoleccion_detalles rd
           ON rd.recoleccion_id = r.id
           ${residuoFilterJoin}
         WHERE p.inquilino_id = $1
         GROUP BY p.id, c.id
         ORDER BY total_kg DESC`,
        params
      );

      // 4. Desempeño por Recolector
      const porRecolectorRes = await query(
        `SELECT
          COALESCE(u.nombre_completo, 'Carga Manual Admin') AS recolector_nombre,
          COALESCE(SUM(rd.peso_kg), 0)::numeric(12,2) AS total_kg,
          COUNT(DISTINCT r.id)::int AS recolecciones
         FROM public.recolecciones r
         LEFT JOIN public.usuarios u ON u.id = r.recolector_id
         INNER JOIN public.recoleccion_detalles rd ON rd.recoleccion_id = r.id
         WHERE ${whereRec.join(' AND ')} ${residuoFilterJoin}
         GROUP BY u.nombre_completo
         ORDER BY total_kg DESC`,
        params
      );

      // 5. Resumen de Volquetes por Estado
      const volquetesResumenRes = await query(
        `SELECT
          estado,
          COUNT(*)::int AS cantidad,
          COALESCE(SUM(monto_total), 0)::numeric(12,2) AS facturacion_estimada
         FROM public.volquetes_gestiones
         WHERE inquilino_id = $1
         GROUP BY estado`,
        [inquilinoId]
      );

      // 6. Listado detallado de recolecciones trazables
      const detalleRecoleccionesRes = await query(
        `SELECT
          r.id,
          r.fecha_recoleccion,
          r.semana_iso,
          r.peso_total_kg,
          r.modo_calculo,
          r.es_manual_admin,
          p.nombre AS punto_nombre,
          c.nombre AS cliente_nombre,
          COALESCE(u.nombre_completo, 'Administración') AS recolector_nombre,
          COALESCE(
            json_agg(
              json_build_object(
                'tipo_residuo_id', tr.id,
                'nombre', tr.nombre,
                'color_hex', tr.color_hex,
                'peso_kg', rd.peso_kg
              )
            ) FILTER (WHERE tr.id IS NOT NULL),
            '[]'::json
          ) AS desglose
         FROM public.recolecciones r
         INNER JOIN public.puntos_recoleccion p ON p.id = r.punto_id
         INNER JOIN public.clientes c ON c.id = r.cliente_id
         LEFT JOIN public.usuarios u ON u.id = r.recolector_id
         INNER JOIN public.recoleccion_detalles rd ON rd.recoleccion_id = r.id
         INNER JOIN public.tipos_residuo tr ON tr.id = rd.tipo_residuo_id
         WHERE ${whereRec.join(' AND ')} ${residuoFilterJoin}
         GROUP BY r.id, p.id, c.id, u.id
         ORDER BY r.fecha_recoleccion DESC
         LIMIT 50`,
        params
      );

      const tiposCatalogoRes = await query(
        `SELECT id, codigo, nombre, color_hex FROM public.tipos_residuo WHERE inquilino_id = $1 ORDER BY nombre ASC`,
        [inquilinoId]
      );

      const totalKgPeriodo = porTipoRes.rows.reduce((acc, r) => acc + Number(r.total_kg), 0);
      const totalEventos = detalleRecoleccionesRes.rows.length;

      res.json({
        kpis: {
          total_kg_recolectados: Number(totalKgPeriodo.toFixed(2)),
          total_operaciones: totalEventos,
          promedio_kg_por_recoleccion:
            totalEventos > 0 ? Number((totalKgPeriodo / totalEventos).toFixed(2)) : 0,
        },
        por_tipo_residuo: porTipoRes.rows,
        por_semana: porSemanaRes.rows,
        por_punto: porPuntoRes.rows,
        por_recolector: porRecolectorRes.rows,
        volquetes_por_estado: volquetesResumenRes.rows,
        recolecciones_detalle: detalleRecoleccionesRes.rows,
        tipos_residuo_catalogo: tiposCatalogoRes.rows,
      });
    } catch (err) {
      console.error('[GET /api/trazabilidad Error]:', err);
      res.status(500).json({ error: 'Error al generar el reporte de trazabilidad.' });
    }
  }
);

// =============================================================================
// NOTIFICACIONES WEB PUSH (VAPID)
// =============================================================================

router.get('/push/vapid-public-key', requireAuth, (req, res) => {
  res.json({
    publicKey: vapidPublicKey || null,
    configured: pushConfigured,
  });
});

router.post('/push/subscribe', requireAuth, async (req, res) => {
  try {
    const { subscription } = req.body;
    if (!subscription || !subscription.endpoint || !subscription.keys) {
      return res.status(400).json({ error: 'Objeto de suscripción Web Push inválido.' });
    }

    await query(
      `INSERT INTO public.push_subscriptions (usuario_id, endpoint, p256dh, auth, user_agent)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (endpoint) DO UPDATE
       SET usuario_id = EXCLUDED.usuario_id,
           p256dh = EXCLUDED.p256dh,
           auth = EXCLUDED.auth`,
      [
        req.user.id,
        subscription.endpoint,
        subscription.keys.p256dh,
        subscription.keys.auth,
        req.headers['user-agent'] || 'WebBrowser',
      ]
    );

    res.json({ ok: true, message: 'Suscripción a notificaciones Push activada.' });
  } catch (err) {
    console.error('[POST /api/trazabilidad/push/subscribe Error]:', err);
    res.status(500).json({ error: 'Error al registrar suscripción Push.' });
  }
});

router.post('/push/test', requireAuth, async (req, res) => {
  try {
    const result = await sendPushToUser(req.user.id, {
      title: 'Notificación Push RSU Manager',
      body: `Hola ${req.user.nombre_completo}, las alertas en tiempo real están operativas en tu dispositivo.`,
      url: '/',
    });
    res.json({
      ok: true,
      sent: result.sent,
      message:
        result.sent > 0
          ? 'Notificación Push enviada a tu navegador.'
          : 'Suscripción registrada (activa los permisos del navegador para recibir alertas).',
    });
  } catch (err) {
    res.status(500).json({ error: 'Error al enviar notificación de prueba.' });
  }
});

module.exports = router;

