const express = require('express');
const { query, withAudit } = require('../config/db');
const { requireAuth, requireRole } = require('../middlewares/auth');
const { sendPushToRole } = require('../services/pushService');

const router = express.Router();

router.use(requireAuth, requireRole('cliente', 'administrador'));

/**
 * GET /api/cliente/dashboard
 * Permite que el cliente visualice sus puntos de recolección, sus peticiones activas
 * y el historial separado por semana con la información del punto seleccionado.
 */
router.get('/dashboard', async (req, res) => {
  try {
    let clienteId = req.user.cliente_id;

    // Si es administrador o un usuario cliente aún sin vínculo directo, tomar el cliente indicado o el primero
    if (req.query.cliente_id && req.user.rol_codigo === 'administrador') {
      clienteId = req.query.cliente_id;
    }
    if (!clienteId) {
      const fallbackCli = await query(
        `SELECT id FROM public.clientes WHERE inquilino_id = $1 ORDER BY created_at ASC LIMIT 1`,
        [req.user.inquilino_id]
      );
      clienteId = fallbackCli.rows[0]?.id;
    }

    if (!clienteId) {
      return res.json({
        cliente: null,
        puntos: [],
        peticiones: [],
        recolecciones: [],
      });
    }

    const cliRes = await query(`SELECT * FROM public.clientes WHERE id = $1`, [clienteId]);
    const puntosRes = await query(
      `SELECT
        p.*,
        COALESCE(
          json_agg(
            json_build_object(
              'tipo_residuo_id', tr.id,
              'nombre', tr.nombre,
              'color_hex', tr.color_hex,
              'porcentaje', prp.porcentaje
            )
          ) FILTER (WHERE tr.id IS NOT NULL),
          '[]'::json
        ) AS composicion
       FROM public.puntos_recoleccion p
       LEFT JOIN public.punto_residuo_porcentajes prp ON prp.punto_id = p.id
       LEFT JOIN public.tipos_residuo tr ON tr.id = prp.tipo_residuo_id
       WHERE p.cliente_id = $1 AND p.inquilino_id = $2
       GROUP BY p.id
       ORDER BY p.nombre ASC`,
      [clienteId, req.user.inquilino_id]
    );

    const peticionesRes = await query(
      `SELECT
        pr.*,
        p.nombre AS punto_nombre,
        p.direccion AS punto_direccion
       FROM public.peticiones_recoleccion pr
       INNER JOIN public.puntos_recoleccion p ON p.id = pr.punto_id
       WHERE pr.cliente_id = $1
       ORDER BY pr.created_at DESC
       LIMIT 30`,
      [clienteId]
    );

    const { punto_id } = req.query;
    const histParams = [req.user.inquilino_id, clienteId];
    let puntoFilter = '';
    if (punto_id) {
      histParams.push(punto_id);
      puntoFilter = 'AND r.punto_id = $3';
    }

    const recoleccionesRes = await query(
      `SELECT
        r.id,
        r.punto_id,
        p.nombre AS punto_nombre,
        p.direccion AS punto_direccion,
        r.semana_iso,
        r.fecha_recoleccion,
        r.peso_total_kg,
        r.modo_calculo,
        r.observaciones,
        u.nombre_completo AS recolector_nombre,
        COALESCE(
          json_agg(
            json_build_object(
              'tipo_residuo_id', tr.id,
              'nombre', tr.nombre,
              'color_hex', tr.color_hex,
              'porcentaje_aplicado', rd.porcentaje_aplicado,
              'peso_kg', rd.peso_kg
            )
          ) FILTER (WHERE tr.id IS NOT NULL),
          '[]'::json
        ) AS detalles
       FROM public.recolecciones r
       INNER JOIN public.puntos_recoleccion p ON p.id = r.punto_id
       LEFT JOIN public.usuarios u ON u.id = r.recolector_id
       LEFT JOIN public.recoleccion_detalles rd ON rd.recoleccion_id = r.id
       LEFT JOIN public.tipos_residuo tr ON tr.id = rd.tipo_residuo_id
       WHERE r.inquilino_id = $1 AND r.cliente_id = $2 ${puntoFilter}
       GROUP BY r.id, p.id, u.id
       ORDER BY r.semana_iso DESC, r.fecha_recoleccion DESC`,
      histParams
    );

    res.json({
      cliente: cliRes.rows[0] || null,
      puntos: puntosRes.rows,
      peticiones: peticionesRes.rows,
      recolecciones: recoleccionesRes.rows,
    });
  } catch (err) {
    console.error('[GET /api/cliente/dashboard Error]:', err);
    res.status(500).json({ error: 'Error al cargar el Dashboard del Cliente.' });
  }
});

/**
 * POST /api/cliente/peticiones
 * Permite al cliente solicitar una petición de recolección para uno de sus puntos.
 */
router.post('/peticiones', async (req, res) => {
  try {
    const {
      punto_id,
      fecha_solicitada = new Date().toISOString().slice(0, 10),
      prioridad = 'normal',
      observaciones = '',
    } = req.body;

    if (!punto_id) {
      return res.status(400).json({ error: 'Debe seleccionar el punto de recolección.' });
    }

    const created = await withAudit(
      {
        ...req,
        actionDesc: `Cliente solicitó recolección en punto ID ${punto_id} para fecha ${fecha_solicitada}`,
      },
      async (tx) => {
        const ptRes = await tx.query(
          `SELECT id, nombre, cliente_id FROM public.puntos_recoleccion WHERE id = $1 AND inquilino_id = $2`,
          [punto_id, req.user.inquilino_id]
        );
        const punto = ptRes.rows[0];
        if (!punto) throw new Error('Punto de recolección no encontrado.');

        const ins = await tx.query(
          `INSERT INTO public.peticiones_recoleccion (
            inquilino_id, cliente_id, punto_id, solicitado_por_usuario_id,
            fecha_solicitada, prioridad, observaciones, estado
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pendiente')
          RETURNING *`,
          [
            req.user.inquilino_id,
            punto.cliente_id,
            punto.id,
            req.user.id,
            fecha_solicitada,
            prioridad,
            observaciones,
          ]
        );

        return { peticion: ins.rows[0], punto_nombre: punto.nombre };
      }
    );

    sendPushToRole(req.user.inquilino_id, 'administrador', {
      title: 'Nueva petición de recolección de Cliente',
      body: `Punto: ${created.punto_nombre} (Prioridad: ${prioridad.toUpperCase()})`,
      url: '/rutas',
    });

    res.status(201).json({
      peticion: created.peticion,
      message: 'Petición de recolección enviada correctamente.',
    });
  } catch (err) {
    console.error('[POST /api/cliente/peticiones Error]:', err);
    res.status(500).json({ error: err.message || 'Error al registrar petición de recolección.' });
  }
});

module.exports = router;

