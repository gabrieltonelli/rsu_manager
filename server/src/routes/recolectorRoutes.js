const express = require('express');
const { query, withAudit } = require('../config/db');
const { requireAuth, requireRole } = require('../middlewares/auth');
const {
  haversineDistanceMeters,
  fetchOsrmRouteGeometry,
} = require('../services/routingService');
const { sendPushToUser } = require('../services/pushService');

const router = express.Router();

// Acceso para rol 'recolector' o 'administrador'
router.use(requireAuth, requireRole('recolector', 'administrador'));

/**
 * GET /api/recolector/home
 * Devuelve la ruta actual a seguir por el recolector, las rutas configuradas en la semana,
 * el catálogo de tipos de residuo y el cálculo hacia el siguiente punto más cercano.
 */
router.get('/home', async (req, res) => {
  try {
    const recolectorId = req.query.recolector_id && req.user.rol_codigo === 'administrador'
      ? req.query.recolector_id
      : req.user.id;

    // 1. Obtener todas las rutas de la semana actual (desde hace 2 días hasta +7 días)
    const rutasRes = await query(
      `SELECT
        rt.*,
        COALESCE(
          json_agg(
            json_build_object(
              'ruta_punto_id', rp.id,
              'orden', rp.orden,
              'estado', rp.estado,
              'recolectado_at', rp.recolectado_at,
              'recoleccion_id', rp.recoleccion_id,
              'punto_id', p.id,
              'nombre', p.nombre,
              'direccion', p.direccion,
              'latitud', p.latitud,
              'longitud', p.longitud,
              'frecuencia_semanal', p.frecuencia_semanal,
              'cliente_id', c.id,
              'cliente_nombre', c.nombre
            ) ORDER BY rp.orden ASC
          ) FILTER (WHERE p.id IS NOT NULL),
          '[]'::json
        ) AS puntos
       FROM public.rutas rt
       LEFT JOIN public.ruta_puntos rp ON rp.ruta_id = rt.id
       LEFT JOIN public.puntos_recoleccion p ON p.id = rp.punto_id
       LEFT JOIN public.clientes c ON c.id = p.cliente_id
       WHERE rt.inquilino_id = $1
         AND rt.recolector_id = $2
         AND rt.fecha BETWEEN (CURRENT_DATE - INTERVAL '2 days') AND (CURRENT_DATE + INTERVAL '7 days')
       GROUP BY rt.id
       ORDER BY
         CASE WHEN rt.fecha = CURRENT_DATE THEN 0 ELSE 1 END,
         rt.fecha ASC,
         rt.created_at DESC`,
      [req.user.inquilino_id, recolectorId]
    );

    // 2. Cargar porcentajes configurados para todos los puntos del inquilino
    const compRes = await query(
      `SELECT
        prp.punto_id,
        tr.id AS tipo_residuo_id,
        tr.codigo,
        tr.nombre,
        tr.color_hex,
        prp.porcentaje
       FROM public.punto_residuo_porcentajes prp
       INNER JOIN public.tipos_residuo tr ON tr.id = prp.tipo_residuo_id
       WHERE tr.inquilino_id = $1
       ORDER BY prp.porcentaje DESC`,
      [req.user.inquilino_id]
    );

    const compPorPunto = {};
    for (const row of compRes.rows) {
      if (!compPorPunto[row.punto_id]) compPorPunto[row.punto_id] = [];
      compPorPunto[row.punto_id].push(row);
    }

    const rutas = rutasRes.rows.map((rt) => ({
      ...rt,
      puntos: (rt.puntos || []).map((pt) => ({
        ...pt,
        composicion: compPorPunto[pt.punto_id] || [],
      })),
    }));

    // Seleccionar ruta actual del día (o primera pendiente/en_curso)
    const todayStr = new Date().toISOString().slice(0, 10);
    let rutaActual =
      rutas.find((r) => String(r.fecha).slice(0, 10) === todayStr && r.estado !== 'completada') ||
      rutas.find((r) => String(r.fecha).slice(0, 10) === todayStr) ||
      rutas.find((r) => r.estado !== 'completada') ||
      rutas[0] ||
      null;

    // 3. Calcular punto pendiente más cercano desde la ubicación actual del recolector
    const userLat = req.query.lat != null ? Number(req.query.lat) : req.user.ultima_lat;
    const userLng = req.query.lng != null ? Number(req.query.lng) : req.user.ultima_lng;
    const geofenceRadius = Number(process.env.GEOFENCE_RADIUS_METERS || 250);

    let siguientePunto = null;
    let siguienteTramo = null;

    if (rutaActual && Array.isArray(rutaActual.puntos)) {
      const pendientes = rutaActual.puntos.filter((p) => p.estado !== 'recolectado');
      if (pendientes.length > 0) {
        if (userLat != null && userLng != null) {
          const conDistancia = pendientes.map((p) => ({
            ...p,
            distancia_actual_m: haversineDistanceMeters(userLat, userLng, p.latitud, p.longitud),
          }));
          conDistancia.sort((a, b) => a.distancia_actual_m - b.distancia_actual_m);
          siguientePunto = conDistancia[0];

          // Generar ruta desde ubicación actual hasta el siguiente punto más cercano
          siguienteTramo = await fetchOsrmRouteGeometry([siguientePunto], {
            latitud: userLat,
            longitud: userLng,
          });
        } else {
          siguientePunto = pendientes[0];
        }
      }
    }

    const tiposResiduoRes = await query(
      `SELECT id, codigo, nombre, color_hex, unidad
       FROM public.tipos_residuo
       WHERE inquilino_id = $1 AND habilitado = TRUE
       ORDER BY nombre ASC`,
      [req.user.inquilino_id]
    );

    res.json({
      ruta_actual: rutaActual,
      rutas_semana: rutas,
      siguiente_punto: siguientePunto,
      siguiente_tramo: siguienteTramo,
      tipos_residuo: tiposResiduoRes.rows,
      geofence_radius_m: geofenceRadius,
    });
  } catch (err) {
    console.error('[GET /api/recolector/home Error]:', err);
    res.status(500).json({ error: 'Error al cargar datos del Home del Recolector.' });
  }
});

/**
 * POST /api/recolector/ubicacion
 * Reporta la ubicación GPS actual del recolector en vivo.
 */
router.post('/ubicacion', async (req, res) => {
  try {
    const { latitud, longitud } = req.body;
    if (latitud == null || longitud == null) {
      return res.status(400).json({ error: 'Coordenadas latitud y longitud requeridas.' });
    }

    await query(
      `UPDATE public.usuarios
       SET ultima_lat = $2,
           ultima_lng = $3,
           conectado = TRUE,
           ultima_conexion_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [req.user.id, Number(latitud), Number(longitud)]
    );

    res.json({
      ok: true,
      latitud: Number(latitud),
      longitud: Number(longitud),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar ubicación en vivo.' });
  }
});

/**
 * POST /api/recolector/nueva-recoleccion
 * Registra una nueva recolección desde el móvil/dashboard del recolector.
 * Valida coherencia de geolocalización contra el punto, calcula los pesos por tipo
 * de residuo (automático o manual), marca el punto como recolectado y devuelve la siguiente ruta.
 */
router.post('/nueva-recoleccion', async (req, res) => {
  try {
    const {
      ruta_id,
      punto_id,
      peso_total_kg,
      modo_calculo = 'automatico', // 'automatico' | 'manual'
      detalles_manuales = [],
      lat_recolector,
      lng_recolector,
      observaciones = '',
    } = req.body;

    if (!punto_id || !peso_total_kg || Number(peso_total_kg) <= 0) {
      return res.status(400).json({ error: 'Punto de recolección y peso total mayor a 0 kg son obligatorios.' });
    }

    if (lat_recolector == null || lng_recolector == null) {
      return res.status(400).json({
        error: 'Se requiere su ubicación GPS actual para validar que se encuentra en el punto de recolección.',
      });
    }

    const ptRes = await query(
      `SELECT p.*, c.usuario_id AS cliente_usuario_id
       FROM public.puntos_recoleccion p
       INNER JOIN public.clientes c ON c.id = p.cliente_id
       WHERE p.id = $1 AND p.inquilino_id = $2`,
      [punto_id, req.user.inquilino_id]
    );
    const punto = ptRes.rows[0];
    if (!punto) {
      return res.status(404).json({ error: 'Punto de recolección no encontrado.' });
    }

    const distanciaMetros = haversineDistanceMeters(
      Number(lat_recolector),
      Number(lng_recolector),
      Number(punto.latitud),
      Number(punto.longitud)
    );
    const maxRadioMetros = Number(process.env.GEOFENCE_RADIUS_METERS || 250);

    if (distanciaMetros > maxRadioMetros) {
      return res.status(422).json({
        error: `Geolocalización fuera de rango: te encuentras a ${Math.round(distanciaMetros)} m del punto "${punto.nombre}" (radio máximo permitido: ${maxRadioMetros} m). Acércate al punto para registrar la recolección.`,
        code: 'GEOFENCE_OUT_OF_RANGE',
        distancia_actual_m: distanciaMetros,
        radio_maximo_m: maxRadioMetros,
      });
    }

    const resultado = await withAudit(
      {
        ...req,
        actionDesc: `Nueva recolección registrada en punto "${punto.nombre}" (${peso_total_kg} kg, modo ${modo_calculo})`,
      },
      async (tx) => {
        const recIns = await tx.query(
          `INSERT INTO public.recolecciones (
            inquilino_id, punto_id, cliente_id, ruta_id, recolector_id, registrado_por_id,
            es_manual_admin, modo_calculo, peso_total_kg,
            lat_recolector, lng_recolector, distancia_punto_m, geolocalizacion_validada,
            observaciones, fecha_recoleccion, semana_iso
          ) VALUES (
            $1, $2, $3, $4, $5, $5,
            FALSE, $6, $7,
            $8, $9, $10, TRUE,
            $11, NOW(), to_char(NOW(), 'IYYY-"W"IW')
          ) RETURNING *`,
          [
            req.user.inquilino_id,
            punto.id,
            punto.cliente_id,
            ruta_id || null,
            req.user.id,
            modo_calculo,
            Number(peso_total_kg),
            Number(lat_recolector),
            Number(lng_recolector),
            distanciaMetros,
            observaciones,
          ]
        );
        const rec = recIns.rows[0];

        if (modo_calculo === 'manual' && Array.isArray(detalles_manuales) && detalles_manuales.length > 0) {
          for (const d of detalles_manuales) {
            if (Number(d.peso_kg) > 0) {
              const pct = Number(((Number(d.peso_kg) / Number(peso_total_kg)) * 100).toFixed(2));
              await tx.query(
                `INSERT INTO public.recoleccion_detalles (recoleccion_id, tipo_residuo_id, porcentaje_aplicado, peso_kg)
                 VALUES ($1, $2, $3, $4)`,
                [rec.id, d.tipo_residuo_id, pct, Number(d.peso_kg)]
              );
            }
          }
        } else {
          // Cálculo automático según configuración porcentual del punto
          const compRes = await tx.query(
            `SELECT tipo_residuo_id, porcentaje FROM public.punto_residuo_porcentajes WHERE punto_id = $1`,
            [punto.id]
          );
          for (const comp of compRes.rows) {
            const pesoResiduo = Number(((Number(peso_total_kg) * Number(comp.porcentaje)) / 100).toFixed(2));
            await tx.query(
              `INSERT INTO public.recoleccion_detalles (recoleccion_id, tipo_residuo_id, porcentaje_aplicado, peso_kg)
               VALUES ($1, $2, $3, $4)`,
              [rec.id, comp.tipo_residuo_id, comp.porcentaje, pesoResiduo]
            );
          }
        }

        // Actualizar punto de recolección
        await tx.query(
          `UPDATE public.puntos_recoleccion
           SET ultima_recoleccion_at = NOW(),
               ultimo_peso_kg = $2,
               updated_at = NOW()
           WHERE id = $1`,
          [punto.id, Number(peso_total_kg)]
        );

        // Actualizar posición del recolector
        await tx.query(
          `UPDATE public.usuarios
           SET ultima_lat = $2,
               ultima_lng = $3,
               conectado = TRUE,
               ultima_conexion_at = NOW()
           WHERE id = $1`,
          [req.user.id, Number(lat_recolector), Number(lng_recolector)]
        );

        // Si pertenece a una ruta, marcar el punto como recolectado y revisar estado de la ruta
        if (ruta_id) {
          await tx.query(
            `UPDATE public.ruta_puntos
             SET estado = 'recolectado',
                 recoleccion_id = $3,
                 recolectado_at = NOW()
             WHERE ruta_id = $1 AND punto_id = $2`,
            [ruta_id, punto.id, rec.id]
          );

          const pendRes = await tx.query(
            `SELECT COUNT(*)::int AS pendientes
             FROM public.ruta_puntos
             WHERE ruta_id = $1 AND estado != 'recolectado'`,
            [ruta_id]
          );
          const nuevoEstadoRuta = pendRes.rows[0].pendientes === 0 ? 'completada' : 'en_curso';
          await tx.query(
            `UPDATE public.rutas SET estado = $2, updated_at = NOW() WHERE id = $1`,
            [ruta_id, nuevoEstadoRuta]
          );
        }

        // Marcar peticiones pendientes de ese punto como completadas
        await tx.query(
          `UPDATE public.peticiones_recoleccion
           SET estado = 'completada', updated_at = NOW()
           WHERE punto_id = $1 AND estado IN ('pendiente', 'programada')`,
          [punto.id]
        );

        return rec;
      }
    );

    if (punto.cliente_usuario_id) {
      sendPushToUser(punto.cliente_usuario_id, {
        title: 'Punto recolectado',
        body: `El recolector ${req.user.nombre_completo} retiró ${peso_total_kg} kg en "${punto.nombre}".`,
        url: '/mi-dashboard',
      });
    }

    res.status(201).json({
      recoleccion: resultado,
      distancia_validada_m: distanciaMetros,
      message: 'Recolección registrada con éxito. Calculando ruta al siguiente punto.',
    });
  } catch (err) {
    console.error('[POST /api/recolector/nueva-recoleccion Error]:', err);
    res.status(500).json({ error: 'Error al registrar la recolección.' });
  }
});

/**
 * GET /api/recolector/volquetes
 * Pestaña Volquetes en el dashboard de los recolectores que los tengan asignados,
 * con el listado de direcciones de entrega o recolección.
 */
router.get('/volquetes', async (req, res) => {
  try {
    const recolectorId = req.query.recolector_id && req.user.rol_codigo === 'administrador'
      ? req.query.recolector_id
      : req.user.id;

    const result = await query(
      `SELECT
        vg.*,
        c.nombre AS cliente_nombre
       FROM public.volquetes_gestiones vg
       LEFT JOIN public.clientes c ON c.id = vg.cliente_id
       WHERE vg.inquilino_id = $1
         AND vg.recolector_asignado_id = $2
         AND vg.estado NOT IN ('facturado')
       ORDER BY
         CASE WHEN vg.accion_pendiente_recolector IS NOT NULL THEN 0 ELSE 1 END,
         vg.updated_at DESC`,
      [req.user.inquilino_id, recolectorId]
    );

    res.json({ volquetes: result.rows });
  } catch (err) {
    console.error('[GET /api/recolector/volquetes Error]:', err);
    res.status(500).json({ error: 'Error al obtener volquetes asignados al recolector.' });
  }
});

/**
 * POST /api/recolector/volquetes/:id/completar-movimiento
 * Permite al recolector confirmar que completó el envío, cambio o retiro final de un volquete asignado.
 */
router.post('/volquetes/:id/completar-movimiento', async (req, res) => {
  try {
    const { id } = req.params;
    const { tipo_movimiento, notas = '' } = req.body; // 'envio' | 'cambio' | 'retiro_final'

    if (!['envio', 'cambio', 'retiro_final'].includes(tipo_movimiento)) {
      return res.status(400).json({ error: 'Tipo de movimiento inválido.' });
    }

    const updated = await withAudit(
      {
        ...req,
        actionDesc: `Recolector registró movimiento '${tipo_movimiento}' en volquete ID ${id}`,
      },
      async (tx) => {
        const gRes = await tx.query(
          `SELECT * FROM public.volquetes_gestiones WHERE id = $1 AND inquilino_id = $2`,
          [id, req.user.inquilino_id]
        );
        const gestion = gRes.rows[0];
        if (!gestion) throw new Error('Gestión de volquete no encontrada.');

        const tarifa = Number(gestion.tarifa_unitaria || process.env.DEFAULT_VOLQUETE_TARIFA || 45000);
        const costoMov = tipo_movimiento === 'cambio' ? tarifa : tipo_movimiento === 'envio' && gestion.cantidad_envios === 0 ? 0 : 0;

        let nuevoEstado = gestion.estado;
        let incEnvio = 0;
        let incCambio = 0;
        let incRetiro = 0;

        if (tipo_movimiento === 'envio') {
          nuevoEstado = 'entregado';
          incEnvio = 1;
        } else if (tipo_movimiento === 'cambio') {
          nuevoEstado = 'entregado';
          incCambio = 1;
        } else if (tipo_movimiento === 'retiro_final') {
          nuevoEstado = 'finalizado';
          incRetiro = 1;
        }

        const up = await tx.query(
          `UPDATE public.volquetes_gestiones
           SET estado = $2,
               accion_pendiente_recolector = NULL,
               cantidad_envios = cantidad_envios + $3,
               cantidad_cambios = cantidad_cambios + $4,
               cantidad_retiros = cantidad_retiros + $5,
               monto_total = monto_total + $6,
               updated_at = NOW()
           WHERE id = $1
           RETURNING *`,
          [id, nuevoEstado, incEnvio, incCambio, incRetiro, costoMov]
        );

        await tx.query(
          `INSERT INTO public.volquetes_movimientos (
            gestion_id, tipo_movimiento, recolector_id, registrado_por_id, origen, costo_movimiento, notas
          ) VALUES ($1, $2, $3, $3, 'recolector', $4, $5)`,
          [id, tipo_movimiento, req.user.id, costoMov, notas || `Movimiento ${tipo_movimiento} ejecutado en calle.`]
        );

        return up.rows[0];
      }
    );

    res.json({ volquete: updated, message: 'Movimiento de volquete registrado.' });
  } catch (err) {
    console.error('[POST /api/recolector/volquetes/:id/completar-movimiento Error]:', err);
    res.status(500).json({ error: err.message || 'Error al registrar movimiento de volquete.' });
  }
});

module.exports = router;

