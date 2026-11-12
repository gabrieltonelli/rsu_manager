const express = require('express');
const { query, withAudit } = require('../config/db');
const { requireAuth, requireRole } = require('../middlewares/auth');
const { geocodeAddress } = require('../services/routingService');
const { sendPushToUser, sendPushToRole } = require('../services/pushService');

const router = express.Router();

function normalizeAddress(addr) {
  return String(addr || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function getDefaultInquilinoId() {
  const code = process.env.DEFAULT_TENANT_CODE || 'RSU';
  const r = await query(`SELECT id FROM public.inquilinos WHERE codigo = $1 LIMIT 1`, [code]);
  return r.rows[0]?.id;
}

// =============================================================================
// 1. VOLQUETES · SOLICITUD PÚBLICA (SIN LOGIN)
// =============================================================================

/**
 * GET /api/volquetes/publico/verificar?direccion=...
 * Verifica si existe una gestión activa en esa dirección.
 * Si existe, ofrece las opciones de solicitar retiro (cambio) o finalizar gestión.
 * Si no existe, ofrece la opción de solicitar un volquete nuevo.
 */
router.get('/publico/verificar', async (req, res) => {
  try {
    const { direccion } = req.query;
    if (!direccion || String(direccion).trim().length < 4) {
      return res.status(400).json({ error: 'Ingrese una dirección válida para consultar.' });
    }

    const norm = normalizeAddress(direccion);
    const inquilinoId = await getDefaultInquilinoId();

    const activeRes = await query(
      `SELECT
        id, codigo, direccion, estado, telefono_contacto, nombre_solicitante,
        cantidad_envios, cantidad_cambios, created_at, updated_at
       FROM public.volquetes_gestiones
       WHERE inquilino_id = $1
         AND direccion_normalizada = $2
         AND estado NOT IN ('finalizado', 'facturado')
       ORDER BY created_at DESC
       LIMIT 1`,
      [inquilinoId, norm]
    );

    const gestionActiva = activeRes.rows[0] || null;

    res.json({
      direccion_consultada: direccion,
      existe_gestion_activa: Boolean(gestionActiva),
      gestion_activa: gestionActiva,
      opciones_disponibles: gestionActiva
        ? [
            { codigo: 'solicitar_cambio', etiqueta: 'Solicitar retiro y recambio de volquete' },
            { codigo: 'finalizar_gestion', etiqueta: 'Finalizar gestión (retiro definitivo)' },
          ]
        : [{ codigo: 'solicitar_nuevo', etiqueta: 'Solicitar envío de un nuevo volquete' }],
    });
  } catch (err) {
    console.error('[GET /api/volquetes/publico/verificar Error]:', err);
    res.status(500).json({ error: 'Error al verificar la dirección solicitada.' });
  }
});

/**
 * POST /api/volquetes/publico/solicitar
 * Procesa el formulario público de solicitud/cambio/retiro de volquete.
 */
router.post('/publico/solicitar', async (req, res) => {
  try {
    const {
      direccion,
      telefono_contacto,
      nombre_solicitante = 'Solicitante Web',
      accion = 'solicitar_nuevo', // 'solicitar_nuevo' | 'solicitar_cambio' | 'finalizar_gestion' | 'otros'
      notas = '',
      latitud = null,
      longitud = null,
    } = req.body;

    if (!direccion || !telefono_contacto) {
      return res.status(400).json({
        error: 'La dirección y el número de teléfono de contacto son obligatorios.',
      });
    }

    const norm = normalizeAddress(direccion);
    const inquilinoId = await getDefaultInquilinoId();
    const tarifaBase = Number(process.env.DEFAULT_VOLQUETE_TARIFA || 45000);

    const resultado = await withAudit(
      {
        email: 'portal-publico@rsu.local',
        rol: 'publico',
        ip: req.ip,
        actionDesc: `Solicitud pública de volquete (${accion}) en dirección: ${direccion}`,
      },
      async (tx) => {
        const activeRes = await tx.query(
          `SELECT * FROM public.volquetes_gestiones
           WHERE inquilino_id = $1
             AND direccion_normalizada = $2
             AND estado NOT IN ('finalizado', 'facturado')
           ORDER BY created_at DESC
           LIMIT 1`,
          [inquilinoId, norm]
        );
        const activa = activeRes.rows[0] || null;

        if (!activa) {
          // Crear nueva solicitud de volquete
          let finalLat = latitud != null ? Number(latitud) : null;
          let finalLng = longitud != null ? Number(longitud) : null;

          if (finalLat == null || finalLng == null) {
            const geo = await geocodeAddress(direccion);
            finalLat = geo?.latitud || -34.6037;
            finalLng = geo?.longitud || -58.3816;
          }

          const codigo = `VOL-${Math.floor(1000 + Math.random() * 9000)}`;

          const ins = await tx.query(
            `INSERT INTO public.volquetes_gestiones (
              inquilino_id, codigo, direccion, direccion_normalizada,
              latitud, longitud, telefono_contacto, nombre_solicitante,
              origen, estado, accion_pendiente_recolector,
              tarifa_unitaria, monto_total, notas
            ) VALUES (
              $1, $2, $3, $4,
              $5, $6, $7, $8,
              'publico', 'solicitado', 'entregar',
              $9, $9, $10
            ) RETURNING *`,
            [
              inquilinoId,
              codigo,
              direccion.trim(),
              norm,
              finalLat,
              finalLng,
              telefono_contacto.trim(),
              nombre_solicitante.trim(),
              tarifaBase,
              notas,
            ]
          );
          const nueva = ins.rows[0];

          await tx.query(
            `INSERT INTO public.volquetes_movimientos (
              gestion_id, tipo_movimiento, origen, costo_movimiento, notas
            ) VALUES ($1, 'solicitud_inicial', 'publico', $2, $3)`,
            [nueva.id, tarifaBase, `Solicitud pública inicial (${accion}). Tel: ${telefono_contacto}. ${notas}`.trim()]
          );

          return { gestion: nueva, operacion: 'creada' };
        } else {
            [nueva.id, tarifaBase, `Solicitud pública inicial. Tel: ${telefono_contacto}. ${notas}`.trim()]
          );

          return { gestion: nueva, operacion: 'creada' };
        } else {
          // Ya existe gestión activa: procesar cambio o retiro final
          const esCambio = accion === 'solicitar_cambio';
          const nuevoEstado = esCambio ? 'cambio_solicitado' : 'retiro_solicitado';
          const accionRecolector = esCambio ? 'cambiar' : 'retirar';
          const tipoMov = esCambio ? 'solicitud_cambio' : 'solicitud_retiro';
          const costoAdicional = esCambio ? Number(activa.tarifa_unitaria || tarifaBase) : 0;

          const up = await tx.query(
            `UPDATE public.volquetes_gestiones
             SET estado = $2,
                 accion_pendiente_recolector = $3,
                 telefono_contacto = $4,
                 monto_total = monto_total + $5,
                 updated_at = NOW()
             WHERE id = $1
             RETURNING *`,
            [activa.id, nuevoEstado, accionRecolector, telefono_contacto.trim(), costoAdicional]
          );

          await tx.query(
            `INSERT INTO public.volquetes_movimientos (
              gestion_id, tipo_movimiento, recolector_id, origen, costo_movimiento, notas
            ) VALUES ($1, $2, $3, 'publico', $4, $5)`,
            [
              activa.id,
              tipoMov,
              activa.recolector_asignado_id,
              costoAdicional,
              `Solicitud pública (${esCambio ? 'Recambio de volquete' : 'Retiro definitivo'}). Tel: ${telefono_contacto}. ${notas}`.trim(),
            ]
          );

          return { gestion: up.rows[0], operacion: 'actualizada' };
        }
      }
    );

    // Notificar a Administradores y al recolector si ya estaba asignado
    sendPushToRole(inquilinoId, 'administrador', {
      title: 'Nueva solicitud pública de Volquete',
      body: `${resultado.gestion.codigo}: ${direccion} (${telefono_contacto})`,
      url: '/volquetes-admin',
    });

    if (resultado.gestion.recolector_asignado_id) {
      sendPushToUser(resultado.gestion.recolector_asignado_id, {
        title: 'Actualización de Volquete asignado',
        body: `Nueva orden en ${direccion} (${resultado.gestion.codigo})`,
        url: '/recolector',
      });
    }

    res.status(201).json({
      ...resultado,
      message:
        resultado.operacion === 'creada'
          ? `Solicitud de volquete registrada con código ${resultado.gestion.codigo}. Nos comunicaremos al ${telefono_contacto}.`
          : `Se registró su solicitud sobre el volquete activo (${resultado.gestion.codigo}) en ${direccion}.`,
    });
  } catch (err) {
    console.error('[POST /api/volquetes/publico/solicitar Error]:', err);
    res.status(500).json({ error: 'Error al procesar la solicitud de volquete.' });
  }
});

// =============================================================================
// 2. VOLQUETES · ADMINISTRACIÓN (PROTEGIDO PARA ADMINISTRADOR)
// =============================================================================

router.get('/admin', requireAuth, requireRole('administrador'), async (req, res) => {
  try {
    const gestionesRes = await query(
      `SELECT
        vg.*,
        u.nombre_completo AS recolector_nombre,
        u.vehiculo_patente AS recolector_patente,
        c.nombre AS cliente_nombre,
        COALESCE(
          json_agg(
            json_build_object(
              'id', vm.id,
              'tipo_movimiento', vm.tipo_movimiento,
              'origen', vm.origen,
              'costo_movimiento', vm.costo_movimiento,
              'notas', vm.notas,
              'created_at', vm.created_at
            ) ORDER BY vm.created_at ASC
          ) FILTER (WHERE vm.id IS NOT NULL),
          '[]'::json
        ) AS movimientos
       FROM public.volquetes_gestiones vg
       LEFT JOIN public.usuarios u ON u.id = vg.recolector_asignado_id
       LEFT JOIN public.clientes c ON c.id = vg.cliente_id
       LEFT JOIN public.volquetes_movimientos vm ON vm.gestion_id = vg.id
       WHERE vg.inquilino_id = $1
       GROUP BY vg.id, u.id, c.id
       ORDER BY
         CASE WHEN vg.estado = 'facturado' THEN 1 ELSE 0 END,
         vg.updated_at DESC`,
      [req.user.inquilino_id]
    );

    res.json({ volquetes: gestionesRes.rows });
  } catch (err) {
    console.error('[GET /api/volquetes/admin Error]:', err);
    res.status(500).json({ error: 'Error al obtener gestiones de volquetes.' });
  }
});

/**
 * POST /api/volquetes/admin
 * Registra solicitudes de volquetes de forma manual desde la administración (atención telefónica).
 */
router.post('/admin', requireAuth, requireRole('administrador'), async (req, res) => {
  try {
    const {
      direccion,
      telefono_contacto,
      nombre_solicitante,
      cliente_id,
      recolector_asignado_id,
      tarifa_unitaria,
      notas,
    } = req.body;

    if (!direccion || !telefono_contacto) {
      return res.status(400).json({ error: 'Dirección y teléfono de contacto son obligatorios.' });
    }

    const norm = normalizeAddress(direccion);
    const geo = await geocodeAddress(direccion);
    const tarifa = Number(tarifa_unitaria || process.env.DEFAULT_VOLQUETE_TARIFA || 45000);
    const codigo = `VOL-${Math.floor(1000 + Math.random() * 9000)}`;

    const nueva = await withAudit(
      {
        ...req,
        actionDesc: `Alta manual de solicitud de volquete ${codigo} en ${direccion}`,
      },
      async (tx) => {
        const ins = await tx.query(
          `INSERT INTO public.volquetes_gestiones (
            inquilino_id, codigo, direccion, direccion_normalizada,
            latitud, longitud, telefono_contacto, nombre_solicitante,
            cliente_id, recolector_asignado_id, origen, estado,
            accion_pendiente_recolector, tarifa_unitaria, monto_total, notas
          ) VALUES (
            $1, $2, $3, $4,
            $5, $6, $7, $8,
            $9, $10, 'administracion', 'solicitado',
            'entregar', $11, $11, $12
          ) RETURNING *`,
          [
            req.user.inquilino_id,
            codigo,
            direccion.trim(),
            norm,
            geo?.latitud || -34.6037,
            geo?.longitud || -58.3816,
            telefono_contacto.trim(),
            nombre_solicitante || 'Solicitud Telefónica',
            cliente_id || null,
            recolector_asignado_id || null,
            tarifa,
            notas || '',
          ]
        );
        const row = ins.rows[0];

        await tx.query(
          `INSERT INTO public.volquetes_movimientos (
            gestion_id, tipo_movimiento, recolector_id, registrado_por_id, origen, costo_movimiento, notas
          ) VALUES ($1, 'solicitud_inicial', $2, $3, 'administracion', $4, $5)`,
          [
            row.id,
            recolector_asignado_id || null,
            req.user.id,
            tarifa,
            notas || 'Alta telefónica registrada desde Administración.',
          ]
        );

        return row;
      }
    );

    if (recolector_asignado_id) {
      sendPushToUser(recolector_asignado_id, {
        title: 'Nuevo Volquete Asignado',
        body: `Se te asignó la entrega de ${codigo} en ${direccion}.`,
        url: '/recolector',
      });
    }

    res.status(201).json({ volquete: nueva, message: 'Solicitud de volquete creada correctamente.' });
  } catch (err) {
    console.error('[POST /api/volquetes/admin Error]:', err);
    res.status(500).json({ error: 'Error al registrar solicitud manual de volquete.' });
  }
});

/**
 * PUT /api/volquetes/admin/:id
 * Permite asignar el recolector encargado, registrar movimientos (envío, cambio, retiro final)
 * y cerrar la gestión en el estado final 'facturado'.
 */
router.put('/admin/:id', requireAuth, requireRole('administrador'), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      recolector_asignado_id,
      registrar_movimiento, // 'envio' | 'cambio' | 'retiro_final' | 'facturacion'
      accion_pendiente_recolector,
      notas_movimiento = '',
    } = req.body;

    const updated = await withAudit(
      {
        ...req,
        actionDesc: `Actualización administrativa de volquete ID ${id}${registrar_movimiento ? ` (${registrar_movimiento})` : ''}`,
      },
      async (tx) => {
        const gRes = await tx.query(
          `SELECT * FROM public.volquetes_gestiones WHERE id = $1 AND inquilino_id = $2`,
          [id, req.user.inquilino_id]
        );
        const actual = gRes.rows[0];
        if (!actual) throw new Error('Gestión de volquete no encontrada.');

        let nuevoEstado = actual.estado;
        let nuevaAccion =
          accion_pendiente_recolector !== undefined
            ? accion_pendiente_recolector
            : actual.accion_pendiente_recolector;
        let incEnvio = 0;
        let incCambio = 0;
        let incRetiro = 0;
        let costoAdicional = 0;
        const tarifa = Number(actual.tarifa_unitaria || 45000);

        if (registrar_movimiento === 'envio') {
          nuevoEstado = 'entregado';
          nuevaAccion = null;
          incEnvio = 1;
        } else if (registrar_movimiento === 'cambio') {
          nuevoEstado = 'entregado';
          nuevaAccion = null;
          incCambio = 1;
          costoAdicional = tarifa;
        } else if (registrar_movimiento === 'retiro_final') {
          nuevoEstado = 'finalizado';
          nuevaAccion = null;
          incRetiro = 1;
        } else if (registrar_movimiento === 'facturacion') {
          nuevoEstado = 'facturado';
          nuevaAccion = null;
        }

        const up = await tx.query(
          `UPDATE public.volquetes_gestiones
           SET recolector_asignado_id = COALESCE($2, recolector_asignado_id),
               estado = $3,
               accion_pendiente_recolector = $4,
               cantidad_envios = cantidad_envios + $5,
               cantidad_cambios = cantidad_cambios + $6,
               cantidad_retiros = cantidad_retiros + $7,
               monto_total = monto_total + $8,
               updated_at = NOW()
           WHERE id = $1
           RETURNING *`,
          [
            id,
            recolector_asignado_id !== undefined ? recolector_asignado_id : null,
            nuevoEstado,
            nuevaAccion,
            incEnvio,
            incCambio,
            incRetiro,
            costoAdicional,
          ]
        );

        if (registrar_movimiento) {
          await tx.query(
            `INSERT INTO public.volquetes_movimientos (
              gestion_id, tipo_movimiento, recolector_id, registrado_por_id, origen, costo_movimiento, notas
            ) VALUES ($1, $2, $3, $4, 'administracion', $5, $6)`,
            [
              id,
              registrar_movimiento,
              up.rows[0].recolector_asignado_id,
              req.user.id,
              costoAdicional,
              notas_movimiento || `Movimiento '${registrar_movimiento}' registrado desde Administración.`,
            ]
          );
        } else if (
          recolector_asignado_id &&
          recolector_asignado_id !== actual.recolector_asignado_id
        ) {
          await tx.query(
            `INSERT INTO public.volquetes_movimientos (
              gestion_id, tipo_movimiento, recolector_id, registrado_por_id, origen, costo_movimiento, notas
            ) VALUES ($1, 'asignacion_recolector', $2, $3, 'administracion', 0, $4)`,
            [
              id,
              recolector_asignado_id,
              req.user.id,
              notas_movimiento || 'Asignación de recolector responsable.',
            ]
          );
        }

        return up.rows[0];
      }
    );

    if (recolector_asignado_id) {
      sendPushToUser(recolector_asignado_id, {
        title: 'Gestión de Volquete Asignada',
        body: `Volquete ${updated.codigo} en ${updated.direccion} (${updated.estado})`,
        url: '/recolector',
      });
    }

    res.json({ volquete: updated, message: 'Gestión de volquete actualizada.' });
  } catch (err) {
    console.error('[PUT /api/volquetes/admin/:id Error]:', err);
    res.status(500).json({ error: err.message || 'Error al actualizar gestión de volquete.' });
  }
});

module.exports = router;

