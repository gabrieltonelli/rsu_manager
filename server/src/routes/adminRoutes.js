const express = require('express');
const bcrypt = require('bcryptjs');
const { query, withAudit } = require('../config/db');
const { supabaseAdmin } = require('../config/supabase');
const { requireAuth, requireRole } = require('../middlewares/auth');
const {
  optimizePointsOrderTSP,
  fetchOsrmRouteGeometry,
  distributePointsBalancedKMeans,
} = require('../services/routingService');
const { sendPushToUser } = require('../services/pushService');

const router = express.Router();

// Todas las rutas administrativas exigen autenticación y rol 'administrador' en BD
router.use(requireAuth, requireRole('administrador'));

// =============================================================================
// 1. GESTIÓN DE USUARIOS Y ROLES
// =============================================================================

router.get('/roles', async (req, res) => {
  try {
    const result = await query(
      `SELECT
        r.id, r.codigo, r.nombre, r.descripcion, r.nivel_acceso,
        COALESCE(
          json_agg(
            json_build_object('id', p.id, 'codigo', p.codigo, 'modulo', p.modulo, 'nombre', p.nombre)
          ) FILTER (WHERE p.id IS NOT NULL),
          '[]'::json
        ) AS permisos
       FROM public.roles r
       LEFT JOIN public.rol_permisos rp ON rp.rol_id = r.id
       LEFT JOIN public.permisos p ON p.id = rp.permiso_id
       GROUP BY r.id
       ORDER BY r.nivel_acceso DESC`
    );
    res.json({ roles: result.rows });
  } catch (err) {
    console.error('[GET /api/admin/roles Error]:', err);
    res.status(500).json({ error: 'Error al obtener roles y permisos.' });
  }
});

router.get('/usuarios', async (req, res) => {
  try {
    const { rol, habilitado } = req.query;
    const params = [req.user.inquilino_id];
    const whereClauses = ['u.inquilino_id = $1'];

    if (rol) {
      params.push(rol);
      whereClauses.push(`r.codigo = $${params.length}`);
    }
    if (habilitado !== undefined && habilitado !== '') {
      params.push(habilitado === 'true');
      whereClauses.push(`u.habilitado = $${params.length}`);
    }

    const result = await query(
      `SELECT
        u.id, u.email, u.nombre_completo, u.telefono, u.avatar_url,
        u.proveedor_auth, u.habilitado, u.vehiculo_patente, u.licencia_conducir,
        u.capacidad_max_kg, u.conectado, u.ultima_lat, u.ultima_lng,
        u.ultima_conexion_at, u.created_at,
        r.id AS rol_id, r.codigo AS rol_codigo, r.nombre AS rol_nombre,
        c.id AS cliente_id, c.nombre AS cliente_nombre
       FROM public.usuarios u
       INNER JOIN public.roles r ON r.id = u.rol_id
       LEFT JOIN public.clientes c ON c.usuario_id = u.id
       WHERE ${whereClauses.join(' AND ')}
       ORDER BY
         CASE WHEN r.codigo = 'pendiente_aprobacion' THEN 0 ELSE 1 END,
         u.created_at DESC`,
      params
    );

    res.json({ usuarios: result.rows });
  } catch (err) {
    console.error('[GET /api/admin/usuarios Error]:', err);
    res.status(500).json({ error: 'Error al listar usuarios.' });
  }
});

router.post('/usuarios', async (req, res) => {
  try {
    const {
      email,
      password,
      nombre_completo,
      telefono,
      rol_codigo,
      habilitado = true,
      vehiculo_patente,
      licencia_conducir,
      capacidad_max_kg,
    } = req.body;

    if (!email || !nombre_completo || !rol_codigo) {
      return res.status(400).json({ error: 'Nombre completo, email y rol son obligatorios.' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const passHash = password ? await bcrypt.hash(String(password), 10) : null;

    // Sincronizar con Supabase Auth si se proveyó contraseña
    let supabaseUid = null;
    if (supabaseAdmin && password) {
      try {
        const { data: supaCreated } = await supabaseAdmin.auth.admin.createUser({
          email: normalizedEmail,
          password: String(password),
          email_confirm: true,
          user_metadata: { nombre_completo },
        });
        if (supaCreated?.user?.id) {
          supabaseUid = supaCreated.user.id;
        }
      } catch (e) {
        // Ignorar si ya existe en Supabase Auth
      }
    }

    const createdUser = await withAudit(
      {
        ...req,
        actionDesc: `Creación de usuario ${normalizedEmail} con rol ${rol_codigo}`,
      },
      async (tx) => {
        const rolRes = await tx.query(`SELECT id FROM public.roles WHERE codigo = $1 LIMIT 1`, [rol_codigo]);
        if (!rolRes.rows[0]) {
          throw new Error('El rol especificado no existe.');
        }

        const ins = await tx.query(
          `INSERT INTO public.usuarios (
            inquilino_id, supabase_uid, email, password_hash, nombre_completo,
            telefono, rol_id, habilitado, vehiculo_patente, licencia_conducir, capacidad_max_kg
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          RETURNING id, email, nombre_completo, telefono, habilitado, vehiculo_patente, licencia_conducir`,
          [
            req.user.inquilino_id,
            supabaseUid,
            normalizedEmail,
            passHash,
            String(nombre_completo).trim(),
            telefono || null,
            rolRes.rows[0].id,
            Boolean(habilitado),
            vehiculo_patente || null,
            licencia_conducir || null,
            capacidad_max_kg ? Number(capacidad_max_kg) : 5000,
          ]
        );
        return ins.rows[0];
      }
    );

    res.status(201).json({ usuario: createdUser, message: 'Usuario creado exitosamente.' });
  } catch (err) {
    console.error('[POST /api/admin/usuarios Error]:', err);
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ya existe un usuario registrado con ese correo electrónico.' });
    }
    res.status(500).json({ error: err.message || 'Error al crear usuario.' });
  }
});

router.put('/usuarios/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      nombre_completo,
      email,
      telefono,
      rol_codigo,
      password,
      habilitado,
      vehiculo_patente,
      licencia_conducir,
      capacidad_max_kg,
    } = req.body;

    const passHash = password && String(password).trim() !== '' ? await bcrypt.hash(String(password), 10) : null;

    const updated = await withAudit(
      {
        ...req,
        actionDesc: `Actualización de usuario ID ${id}${rol_codigo ? ` (rol: ${rol_codigo})` : ''}`,
      },
      async (tx) => {
        let rolId = null;
        if (rol_codigo) {
          const rRes = await tx.query(`SELECT id FROM public.roles WHERE codigo = $1 LIMIT 1`, [rol_codigo]);
          rolId = rRes.rows[0]?.id || null;
        }

        const upRes = await tx.query(
          `UPDATE public.usuarios
           SET nombre_completo = COALESCE($2, nombre_completo),
               email = COALESCE($3, email),
               telefono = COALESCE($4, telefono),
               rol_id = COALESCE($5, rol_id),
               password_hash = COALESCE($6, password_hash),
               habilitado = COALESCE($7, habilitado),
               vehiculo_patente = COALESCE($8, vehiculo_patente),
               licencia_conducir = COALESCE($9, licencia_conducir),
               capacidad_max_kg = COALESCE($10, capacidad_max_kg),
               updated_at = NOW()
           WHERE id = $1 AND inquilino_id = $11
           RETURNING id, supabase_uid, email, nombre_completo, habilitado`,
          [
            id,
            nombre_completo || null,
            email ? String(email).trim().toLowerCase() : null,
            telefono !== undefined ? telefono : null,
            rolId,
            passHash,
            habilitado !== undefined ? Boolean(habilitado) : null,
            vehiculo_patente !== undefined ? vehiculo_patente : null,
            licencia_conducir !== undefined ? licencia_conducir : null,
            capacidad_max_kg !== undefined ? Number(capacidad_max_kg) : null,
            req.user.inquilino_id,
          ]
        );
        return upRes.rows[0];
      }
    );

    if (!updated) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    if (supabaseAdmin && updated.supabase_uid && password && String(password).trim() !== '') {
      try {
        await supabaseAdmin.auth.admin.updateUserById(updated.supabase_uid, {
          password: String(password),
        });
      } catch (e) {
        // No bloquear si el usuario no está en Supabase Auth
      }
    }

    if (rol_codigo && rol_codigo !== 'pendiente_aprobacion') {
      sendPushToUser(updated.id, {
        title: 'Perfil RSU actualizado',
        body: `Un administrador te asignó el rol ${rol_codigo.toUpperCase()} en RSU Manager.`,
        url: '/',
      });
    }

    res.json({ usuario: updated, message: 'Usuario actualizado correctamente.' });
  } catch (err) {
    console.error('[PUT /api/admin/usuarios/:id Error]:', err);
    res.status(500).json({ error: 'Error al actualizar el usuario.' });
  }
});

// =============================================================================
// 2. TIPOS DE RESIDUO
// =============================================================================

router.get('/tipos-residuo', async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM public.tipos_residuo
       WHERE inquilino_id = $1
       ORDER BY habilitado DESC, nombre ASC`,
      [req.user.inquilino_id]
    );
    res.json({ tipos_residuo: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener tipos de residuo.' });
  }
});

router.post('/tipos-residuo', async (req, res) => {
  try {
    const { codigo, nombre, descripcion, color_hex, unidad = 'kg' } = req.body;
    if (!nombre) {
      return res.status(400).json({ error: 'El nombre del tipo de residuo es obligatorio.' });
    }
    const cleanCode = (codigo || nombre)
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_|_$/g, '');

    const created = await withAudit(
      { ...req, actionDesc: `Creación de tipo de residuo: ${nombre}` },
      async (tx) => {
        const ins = await tx.query(
          `INSERT INTO public.tipos_residuo (inquilino_id, codigo, nombre, descripcion, color_hex, unidad, habilitado)
           VALUES ($1, $2, $3, $4, $5, $6, TRUE)
           RETURNING *`,
          [req.user.inquilino_id, cleanCode, nombre.trim(), descripcion || '', color_hex || '#10b981', unidad]
        );
        return ins.rows[0];
      }
    );
    res.status(201).json({ tipo_residuo: created });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ya existe un tipo de residuo con ese código o nombre.' });
    }
    res.status(500).json({ error: 'Error al crear tipo de residuo.' });
  }
});

router.put('/tipos-residuo/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, descripcion, color_hex, unidad, habilitado } = req.body;

    const updated = await withAudit(
      { ...req, actionDesc: `Edición de tipo de residuo ID ${id}` },
      async (tx) => {
        const up = await tx.query(
          `UPDATE public.tipos_residuo
           SET nombre = COALESCE($2, nombre),
               descripcion = COALESCE($3, descripcion),
               color_hex = COALESCE($4, color_hex),
               unidad = COALESCE($5, unidad),
               habilitado = COALESCE($6, habilitado),
               updated_at = NOW()
           WHERE id = $1 AND inquilino_id = $7
           RETURNING *`,
          [
            id,
            nombre || null,
            descripcion !== undefined ? descripcion : null,
            color_hex || null,
            unidad || null,
            habilitado !== undefined ? Boolean(habilitado) : null,
            req.user.inquilino_id,
          ]
        );
        return up.rows[0];
      }
    );
    res.json({ tipo_residuo: updated });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar tipo de residuo.' });
  }
});

// =============================================================================
// 3. PUNTOS DE RECOLECCIÓN Y RECOLECCIÓN MANUAL DESDE ADMINISTRACIÓN
// =============================================================================

router.get('/puntos', async (req, res) => {
  try {
    const { habilitado, cliente_id } = req.query;
    const params = [req.user.inquilino_id];
    const where = ['p.inquilino_id = $1'];

    if (habilitado !== undefined && habilitado !== '') {
      params.push(habilitado === 'true');
      where.push(`p.habilitado = $${params.length}`);
    }
    if (cliente_id) {
      params.push(cliente_id);
      where.push(`p.cliente_id = $${params.length}`);
    }

    const result = await query(
      `SELECT
        p.*,
        c.nombre AS cliente_nombre,
        c.razon_social AS cliente_razon_social,
        COALESCE(
          json_agg(
            json_build_object(
              'tipo_residuo_id', tr.id,
              'codigo', tr.codigo,
              'nombre', tr.nombre,
              'color_hex', tr.color_hex,
              'porcentaje', prp.porcentaje
            )
          ) FILTER (WHERE tr.id IS NOT NULL),
          '[]'::json
        ) AS composicion
       FROM public.puntos_recoleccion p
       INNER JOIN public.clientes c ON c.id = p.cliente_id
       LEFT JOIN public.punto_residuo_porcentajes prp ON prp.punto_id = p.id
       LEFT JOIN public.tipos_residuo tr ON tr.id = prp.tipo_residuo_id
       WHERE ${where.join(' AND ')}
       GROUP BY p.id, c.id
       ORDER BY p.habilitado DESC, p.nombre ASC`,
      params
    );

    res.json({ puntos: result.rows });
  } catch (err) {
    console.error('[GET /api/admin/puntos Error]:', err);
    res.status(500).json({ error: 'Error al obtener puntos de recolección.' });
  }
});

router.post('/puntos', async (req, res) => {
  try {
    const {
      cliente_id,
      nombre,
      direccion,
      latitud,
      longitud,
      frecuencia_semanal = 3,
      dias_preferidos = 'Lun,Mié,Vie',
      composicion = [],
    } = req.body;

    if (!cliente_id || !nombre || !direccion || latitud == null || longitud == null) {
      return res.status(400).json({
        error: 'Nombre, cliente, dirección y coordenadas en el mapa son obligatorios.',
      });
    }

    const created = await withAudit(
      { ...req, actionDesc: `Alta de punto de recolección: ${nombre}` },
      async (tx) => {
        const ins = await tx.query(
          `INSERT INTO public.puntos_recoleccion (
            inquilino_id, cliente_id, nombre, direccion, latitud, longitud, frecuencia_semanal, dias_preferidos, habilitado
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)
          RETURNING *`,
          [
            req.user.inquilino_id,
            cliente_id,
            nombre.trim(),
            direccion.trim(),
            Number(latitud),
            Number(longitud),
            Number(frecuencia_semanal),
            dias_preferidos,
          ]
        );
        const punto = ins.rows[0];

        if (Array.isArray(composicion) && composicion.length > 0) {
          for (const item of composicion) {
            if (Number(item.porcentaje) > 0) {
              await tx.query(
                `INSERT INTO public.punto_residuo_porcentajes (punto_id, tipo_residuo_id, porcentaje)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (punto_id, tipo_residuo_id) DO UPDATE SET porcentaje = EXCLUDED.porcentaje`,
                [punto.id, item.tipo_residuo_id, Number(item.porcentaje)]
              );
            }
          }
        }
        return punto;
      }
    );

    res.status(201).json({ punto: created, message: 'Punto de recolección registrado.' });
  } catch (err) {
    console.error('[POST /api/admin/puntos Error]:', err);
    res.status(500).json({ error: 'Error al registrar el punto de recolección.' });
  }
});

router.put('/puntos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      cliente_id,
      nombre,
      direccion,
      latitud,
      longitud,
      frecuencia_semanal,
      dias_preferidos,
      habilitado,
      composicion,
    } = req.body;

    const updated = await withAudit(
      { ...req, actionDesc: `Actualización de punto de recolección ID ${id}` },
      async (tx) => {
        const up = await tx.query(
          `UPDATE public.puntos_recoleccion
           SET cliente_id = COALESCE($2, cliente_id),
               nombre = COALESCE($3, nombre),
               direccion = COALESCE($4, direccion),
               latitud = COALESCE($5, latitud),
               longitud = COALESCE($6, longitud),
               frecuencia_semanal = COALESCE($7, frecuencia_semanal),
               dias_preferidos = COALESCE($8, dias_preferidos),
               habilitado = COALESCE($9, habilitado),
               updated_at = NOW()
           WHERE id = $1 AND inquilino_id = $10
           RETURNING *`,
          [
            id,
            cliente_id || null,
            nombre || null,
            direccion || null,
            latitud != null ? Number(latitud) : null,
            longitud != null ? Number(longitud) : null,
            frecuencia_semanal != null ? Number(frecuencia_semanal) : null,
            dias_preferidos || null,
            habilitado !== undefined ? Boolean(habilitado) : null,
            req.user.inquilino_id,
          ]
        );

        const punto = up.rows[0];
        if (punto && Array.isArray(composicion)) {
          await tx.query(`DELETE FROM public.punto_residuo_porcentajes WHERE punto_id = $1`, [punto.id]);
          for (const item of composicion) {
            if (Number(item.porcentaje) > 0) {
              await tx.query(
                `INSERT INTO public.punto_residuo_porcentajes (punto_id, tipo_residuo_id, porcentaje)
                 VALUES ($1, $2, $3)`,
                [punto.id, item.tipo_residuo_id, Number(item.porcentaje)]
              );
            }
          }
        }
        return punto;
      }
    );

    res.json({ punto: updated });
  } catch (err) {
    console.error('[PUT /api/admin/puntos/:id Error]:', err);
    res.status(500).json({ error: 'Error al actualizar el punto de recolección.' });
  }
});

/**
 * POST /api/admin/puntos/:id/recoleccion-manual
 * Genera una recolección manual de un punto desde la administración,
 * para los casos que no se registren desde la aplicación del recolector.
 */
router.post('/puntos/:id/recoleccion-manual', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      peso_total_kg,
      modo_calculo = 'automatico',
      detalles_manuales = [],
      observaciones = 'Recolección manual registrada desde Administración.',
      fecha_recoleccion,
    } = req.body;

    if (!peso_total_kg || Number(peso_total_kg) <= 0) {
      return res.status(400).json({ error: 'Debe ingresar un peso total válido mayor a 0 kg.' });
    }

    const recoleccion = await withAudit(
      { ...req, actionDesc: `Recolección manual de punto ID ${id} (${peso_total_kg} kg)` },
      async (tx) => {
        const ptRes = await tx.query(
          `SELECT p.*, c.usuario_id AS cliente_usuario_id
           FROM public.puntos_recoleccion p
           INNER JOIN public.clientes c ON c.id = p.cliente_id
           WHERE p.id = $1 AND p.inquilino_id = $2`,
          [id, req.user.inquilino_id]
        );
        const punto = ptRes.rows[0];
        if (!punto) {
          throw new Error('Punto de recolección no encontrado.');
        }

        const fechaRec = fecha_recoleccion ? new Date(fecha_recoleccion) : new Date();
        const recIns = await tx.query(
          `INSERT INTO public.recolecciones (
            inquilino_id, punto_id, cliente_id, registrado_por_id,
            es_manual_admin, modo_calculo, peso_total_kg,
            lat_recolector, lng_recolector, distancia_punto_m, geolocalizacion_validada,
            observaciones, fecha_recoleccion, semana_iso
          ) VALUES (
            $1, $2, $3, $4,
            TRUE, $5, $6,
            $7, $8, 0, TRUE,
            $9, $10, to_char($10::timestamptz, 'IYYY-"W"IW')
          ) RETURNING *`,
          [
            req.user.inquilino_id,
            punto.id,
            punto.cliente_id,
            req.user.id,
            modo_calculo,
            Number(peso_total_kg),
            punto.latitud,
            punto.longitud,
            observaciones,
            fechaRec.toISOString(),
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
          // Cálculo automático según porcentajes configurados en el punto
          const compRes = await tx.query(
            `SELECT tipo_residuo_id, porcentaje FROM public.punto_residuo_porcentajes WHERE punto_id = $1`,
            [punto.id]
          );
          if (compRes.rows.length > 0) {
            for (const comp of compRes.rows) {
              const pesoResiduo = Number(((Number(peso_total_kg) * Number(comp.porcentaje)) / 100).toFixed(2));
              await tx.query(
                `INSERT INTO public.recoleccion_detalles (recoleccion_id, tipo_residuo_id, porcentaje_aplicado, peso_kg)
                 VALUES ($1, $2, $3, $4)`,
                [rec.id, comp.tipo_residuo_id, comp.porcentaje, pesoResiduo]
              );
            }
          }
        }

        await tx.query(
          `UPDATE public.puntos_recoleccion
           SET ultima_recoleccion_at = $2,
               ultimo_peso_kg = $3,
               updated_at = NOW()
           WHERE id = $1`,
          [punto.id, rec.fecha_recoleccion, Number(peso_total_kg)]
        );

        if (punto.cliente_usuario_id) {
          sendPushToUser(punto.cliente_usuario_id, {
            title: 'Recolección registrada',
            body: `Se registró una recolección de ${peso_total_kg} kg en el punto "${punto.nombre}".`,
            url: '/mi-dashboard',
          });
        }

        return rec;
      }
    );

    res.status(201).json({
      recoleccion,
      message: 'Recolección manual registrada correctamente.',
    });
  } catch (err) {
    console.error('[POST /api/admin/puntos/:id/recoleccion-manual Error]:', err);
    res.status(500).json({ error: err.message || 'Error al registrar la recolección manual.' });
  }
});

// =============================================================================
// 4. CLIENTES Y CONFIGURACIÓN DE PUNTOS / HISTORIAL SEMANAL
// =============================================================================

router.get('/clientes', async (req, res) => {
  try {
    const { habilitado } = req.query;
    const params = [req.user.inquilino_id];
    const where = ['c.inquilino_id = $1'];

    if (habilitado !== undefined && habilitado !== '') {
      params.push(habilitado === 'true');
      where.push(`c.habilitado = $${params.length}`);
    }

    const clientesRes = await query(
      `SELECT
        c.*,
        u.email AS usuario_email,
        u.nombre_completo AS usuario_nombre
       FROM public.clientes c
       LEFT JOIN public.usuarios u ON u.id = c.usuario_id
       WHERE ${where.join(' AND ')}
       ORDER BY c.habilitado DESC, c.nombre ASC`,
      params
    );

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
       WHERE p.inquilino_id = $1
       GROUP BY p.id
       ORDER BY p.nombre ASC`,
      [req.user.inquilino_id]
    );

    const puntosPorCliente = {};
    for (const pt of puntosRes.rows) {
      if (!puntosPorCliente[pt.cliente_id]) puntosPorCliente[pt.cliente_id] = [];
      puntosPorCliente[pt.cliente_id].push(pt);
    }

    const clientes = clientesRes.rows.map((c) => ({
      ...c,
      puntos: puntosPorCliente[c.id] || [],
    }));

    res.json({ clientes });
  } catch (err) {
    console.error('[GET /api/admin/clientes Error]:', err);
    res.status(500).json({ error: 'Error al obtener listado de clientes.' });
  }
});

router.post('/clientes', async (req, res) => {
  try {
    const {
      nombre,
      razon_social,
      cuit_dni,
      direccion,
      telefono,
      email_contacto,
      usuario_id,
      notas,
      configuracion_puntos = [],
    } = req.body;

    if (!nombre) {
      return res.status(400).json({ error: 'El nombre del cliente es obligatorio.' });
    }

    const cliente = await withAudit(
      { ...req, actionDesc: `Creación de cliente: ${nombre}` },
      async (tx) => {
        const ins = await tx.query(
          `INSERT INTO public.clientes (
            inquilino_id, usuario_id, nombre, razon_social, cuit_dni, direccion, telefono, email_contacto, notas, habilitado
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE)
          RETURNING *`,
          [
            req.user.inquilino_id,
            usuario_id || null,
            nombre.trim(),
            razon_social || nombre.trim(),
            cuit_dni || null,
            direccion || null,
            telefono || null,
            email_contacto || null,
            notas || null,
          ]
        );
        const nuevoCliente = ins.rows[0];

        if (Array.isArray(configuracion_puntos)) {
          for (const cfg of configuracion_puntos) {
            if (cfg.punto_id) {
              await tx.query(
                `UPDATE public.puntos_recoleccion
                 SET cliente_id = $2,
                     frecuencia_semanal = COALESCE($3, frecuencia_semanal),
                     updated_at = NOW()
                 WHERE id = $1 AND inquilino_id = $4`,
                [cfg.punto_id, nuevoCliente.id, cfg.frecuencia_semanal || 3, req.user.inquilino_id]
              );
              if (Array.isArray(cfg.composicion)) {
                await tx.query(`DELETE FROM public.punto_residuo_porcentajes WHERE punto_id = $1`, [cfg.punto_id]);
                for (const item of cfg.composicion) {
                  if (Number(item.porcentaje) > 0) {
                    await tx.query(
                      `INSERT INTO public.punto_residuo_porcentajes (punto_id, tipo_residuo_id, porcentaje)
                       VALUES ($1, $2, $3)`,
                      [cfg.punto_id, item.tipo_residuo_id, Number(item.porcentaje)]
                    );
                  }
                }
              }
            }
          }
        }
        return nuevoCliente;
      }
    );

    res.status(201).json({ cliente });
  } catch (err) {
    console.error('[POST /api/admin/clientes Error]:', err);
    res.status(500).json({ error: 'Error al crear el cliente.' });
  }
});

router.put('/clientes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      nombre,
      razon_social,
      cuit_dni,
      direccion,
      telefono,
      email_contacto,
      usuario_id,
      notas,
      habilitado,
      configuracion_puntos,
    } = req.body;

    const updated = await withAudit(
      { ...req, actionDesc: `Actualización de cliente ID ${id}` },
      async (tx) => {
        const up = await tx.query(
          `UPDATE public.clientes
           SET nombre = COALESCE($2, nombre),
               razon_social = COALESCE($3, razon_social),
               cuit_dni = COALESCE($4, cuit_dni),
               direccion = COALESCE($5, direccion),
               telefono = COALESCE($6, telefono),
               email_contacto = COALESCE($7, email_contacto),
               usuario_id = $8,
               notas = COALESCE($9, notas),
               habilitado = COALESCE($10, habilitado),
               updated_at = NOW()
           WHERE id = $1 AND inquilino_id = $11
           RETURNING *`,
          [
            id,
            nombre || null,
            razon_social || null,
            cuit_dni !== undefined ? cuit_dni : null,
            direccion !== undefined ? direccion : null,
            telefono !== undefined ? telefono : null,
            email_contacto !== undefined ? email_contacto : null,
            usuario_id || null,
            notas !== undefined ? notas : null,
            habilitado !== undefined ? Boolean(habilitado) : null,
            req.user.inquilino_id,
          ]
        );
        const cli = up.rows[0];

        if (cli && Array.isArray(configuracion_puntos)) {
          for (const cfg of configuracion_puntos) {
            if (cfg.punto_id) {
              await tx.query(
                `UPDATE public.puntos_recoleccion
                 SET frecuencia_semanal = COALESCE($2, frecuencia_semanal),
                     dias_preferidos = COALESCE($3, dias_preferidos),
                     updated_at = NOW()
                 WHERE id = $1 AND cliente_id = $4`,
                [cfg.punto_id, cfg.frecuencia_semanal, cfg.dias_preferidos || null, cli.id]
              );
              if (Array.isArray(cfg.composicion)) {
                await tx.query(`DELETE FROM public.punto_residuo_porcentajes WHERE punto_id = $1`, [cfg.punto_id]);
                for (const item of cfg.composicion) {
                  if (Number(item.porcentaje) > 0) {
                    await tx.query(
                      `INSERT INTO public.punto_residuo_porcentajes (punto_id, tipo_residuo_id, porcentaje)
                       VALUES ($1, $2, $3)`,
                      [cfg.punto_id, item.tipo_residuo_id, Number(item.porcentaje)]
                    );
                  }
                }
              }
            }
          }
        }
        return cli;
      }
    );

    res.json({ cliente: updated });
  } catch (err) {
    console.error('[PUT /api/admin/clientes/:id Error]:', err);
    res.status(500).json({ error: 'Error al actualizar el cliente.' });
  }
});

/**
 * GET /api/admin/clientes/:id/historial
 * Muestra el historial de recolección de cada punto asignado a ese cliente,
 * separado por semana, con la información de recolección del punto seleccionado.
 */
router.get('/clientes/:id/historial', async (req, res) => {
  try {
    const { id } = req.params;
    const { punto_id } = req.query;

    const params = [req.user.inquilino_id, id];
    let puntoFilter = '';
    if (punto_id) {
      params.push(punto_id);
      puntoFilter = `AND r.punto_id = $3`;
    }

    const result = await query(
      `SELECT
        r.id,
        r.punto_id,
        p.nombre AS punto_nombre,
        p.direccion AS punto_direccion,
        r.semana_iso,
        r.fecha_recoleccion,
        r.peso_total_kg,
        r.modo_calculo,
        r.es_manual_admin,
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
      params
    );

    res.json({ recolecciones: result.rows });
  } catch (err) {
    console.error('[GET /api/admin/clientes/:id/historial Error]:', err);
    res.status(500).json({ error: 'Error al obtener historial del cliente.' });
  }
});

// =============================================================================
// 5. RECOLECTORES, MAPA EN VIVO Y MODIFICACIÓN DE RUTA
// =============================================================================

router.get('/recolectores', async (req, res) => {
  try {
    const { habilitado } = req.query;
    const params = [req.user.inquilino_id];
    const where = [`u.inquilino_id = $1`, `r.codigo = 'recolector'`];

    if (habilitado !== undefined && habilitado !== '') {
      params.push(habilitado === 'true');
      where.push(`u.habilitado = $${params.length}`);
    }

    const recRes = await query(
      `SELECT
        u.id, u.email, u.nombre_completo, u.telefono, u.habilitado,
        u.vehiculo_patente, u.licencia_conducir, u.capacidad_max_kg,
        u.conectado, u.ultima_lat, u.ultima_lng, u.ultima_conexion_at
       FROM public.usuarios u
       INNER JOIN public.roles r ON r.id = u.rol_id
       WHERE ${where.join(' AND ')}
       ORDER BY u.conectado DESC, u.nombre_completo ASC`,
      params
    );

    // Traer rutas activas de hoy o última ruta configurada de cada recolector
    const rutasRes = await query(
      `SELECT
        rt.*,
        COALESCE(
          json_agg(
            json_build_object(
              'orden', rp.orden,
              'estado', rp.estado,
              'punto_id', p.id,
              'nombre', p.nombre,
              'direccion', p.direccion,
              'latitud', p.latitud,
              'longitud', p.longitud
            ) ORDER BY rp.orden ASC
          ) FILTER (WHERE p.id IS NOT NULL),
          '[]'::json
        ) AS puntos
       FROM public.rutas rt
       LEFT JOIN public.ruta_puntos rp ON rp.ruta_id = rt.id
       LEFT JOIN public.puntos_recoleccion p ON p.id = rp.punto_id
       WHERE rt.inquilino_id = $1 AND rt.fecha >= CURRENT_DATE - INTERVAL '1 day'
       GROUP BY rt.id
       ORDER BY rt.fecha DESC, rt.created_at DESC`,
      [req.user.inquilino_id]
    );

    const rutaPorRecolector = {};
    for (const rt of rutasRes.rows) {
      if (!rutaPorRecolector[rt.recolector_id]) {
        rutaPorRecolector[rt.recolector_id] = rt;
      }
    }

    const recolectores = recRes.rows.map((rec) => ({
      ...rec,
      ruta_actual: rutaPorRecolector[rec.id] || null,
    }));

    res.json({ recolectores });
  } catch (err) {
    console.error('[GET /api/admin/recolectores Error]:', err);
    res.status(500).json({ error: 'Error al obtener listado de recolectores.' });
  }
});

/**
 * PUT /api/admin/recolectores/:id/ruta
 * Modifica la ruta de un recolector asignando el listado de puntos de recolección
 * y genera/actualiza el recorrido óptimo en el mapa.
 */
router.put('/recolectores/:id/ruta', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      fecha = new Date().toISOString().slice(0, 10),
      puntos_ids = [],
      nombre = 'Ruta Asignada Manualmente',
      optimizar_orden = true,
    } = req.body;

    if (!Array.isArray(puntos_ids) || puntos_ids.length === 0) {
      return res.status(400).json({ error: 'Debe seleccionar al menos un punto de recolección.' });
    }

    const ptsRes = await query(
      `SELECT id, nombre, direccion, latitud, longitud
       FROM public.puntos_recoleccion
       WHERE inquilino_id = $1 AND id = ANY($2::uuid[])`,
      [req.user.inquilino_id, puntos_ids]
    );

    const recRes = await query(`SELECT id, nombre_completo, ultima_lat, ultima_lng FROM public.usuarios WHERE id = $1`, [id]);
    const recolector = recRes.rows[0];
    if (!recolector) {
      return res.status(404).json({ error: 'Recolector no encontrado.' });
    }

    // Respetar orden enviado o aplicar TSP si optimizar_orden === true
    let orderedPoints = [];
    if (optimizar_orden) {
      const startCoords =
        recolector.ultima_lat != null && recolector.ultima_lng != null
          ? { latitud: recolector.ultima_lat, longitud: recolector.ultima_lng }
          : null;
      orderedPoints = optimizePointsOrderTSP(ptsRes.rows, startCoords);
    } else {
      const mapById = Object.fromEntries(ptsRes.rows.map((p) => [p.id, p]));
      orderedPoints = puntos_ids.map((pid) => mapById[pid]).filter(Boolean);
    }

    const routeMeta = await fetchOsrmRouteGeometry(orderedPoints, {
      latitud: recolector.ultima_lat,
      longitud: recolector.ultima_lng,
    });

    const savedRuta = await withAudit(
      {
        ...req,
        actionDesc: `Modificación de ruta del recolector ${recolector.nombre_completo} para fecha ${fecha}`,
      },
      async (tx) => {
        // Verificar si ya tenía una ruta pendiente/en_curso en esa fecha para actualizarla
        const exRes = await tx.query(
          `SELECT id FROM public.rutas
           WHERE inquilino_id = $1 AND recolector_id = $2 AND fecha = $3
           ORDER BY created_at DESC LIMIT 1`,
          [req.user.inquilino_id, id, fecha]
        );

        let rutaId;
        if (exRes.rows[0]) {
          rutaId = exRes.rows[0].id;
          await tx.query(
            `UPDATE public.rutas
             SET nombre = $2,
                 distancia_total_m = $3,
                 duracion_estimada_s = $4,
                 geometria_geojson = $5,
                 updated_at = NOW()
             WHERE id = $1`,
            [
              rutaId,
              nombre,
              routeMeta.distancia_total_m,
              routeMeta.duracion_estimada_s,
              JSON.stringify(routeMeta.geometria_geojson),
            ]
          );
          await tx.query(`DELETE FROM public.ruta_puntos WHERE ruta_id = $1`, [rutaId]);
        } else {
          const code = `RUTA-${fecha.replace(/-/g, '')}-${Math.floor(100 + Math.random() * 900)}`;
          const ins = await tx.query(
            `INSERT INTO public.rutas (
              inquilino_id, codigo, nombre, recolector_id, fecha, estado,
              modo_generacion, distancia_total_m, duracion_estimada_s, geometria_geojson
            ) VALUES ($1, $2, $3, $4, $5, 'pendiente', 'algoritmo', $6, $7, $8)
            RETURNING id`,
            [
              req.user.inquilino_id,
              code,
              nombre,
              id,
              fecha,
              routeMeta.distancia_total_m,
              routeMeta.duracion_estimada_s,
              JSON.stringify(routeMeta.geometria_geojson),
            ]
          );
          rutaId = ins.rows[0].id;
        }

        for (let idx = 0; idx < orderedPoints.length; idx++) {
          await tx.query(
            `INSERT INTO public.ruta_puntos (ruta_id, punto_id, orden, estado)
             VALUES ($1, $2, $3, 'pendiente')`,
            [rutaId, orderedPoints[idx].id, idx + 1]
          );
        }

        return {
          id: rutaId,
          recolector_id: id,
          fecha,
          puntos: orderedPoints,
          ...routeMeta,
        };
      }
    );

    sendPushToUser(id, {
      title: 'Ruta actualizada',
      body: `Se te asignó una ruta con ${orderedPoints.length} puntos para el ${fecha}.`,
      url: '/recolector',
    });

    res.json({
      ruta: savedRuta,
      message: 'Ruta asignada y optimizada correctamente.',
    });
  } catch (err) {
    console.error('[PUT /api/admin/recolectores/:id/ruta Error]:', err);
    res.status(500).json({ error: 'Error al asignar ruta al recolector.' });
  }
});

// =============================================================================
// 6. GENERACIÓN DE RUTAS Y REPARTO AUTOMÁTICO ENTRE RECOLECTORES
// =============================================================================

router.get('/rutas', async (req, res) => {
  try {
    const { fecha, recolector_id } = req.query;
    const params = [req.user.inquilino_id];
    const where = ['rt.inquilino_id = $1'];

    if (fecha) {
      params.push(fecha);
      where.push(`rt.fecha = $${params.length}`);
    }
    if (recolector_id) {
      params.push(recolector_id);
      where.push(`rt.recolector_id = $${params.length}`);
    }

    const result = await query(
      `SELECT
        rt.*,
        u.nombre_completo AS recolector_nombre,
        u.vehiculo_patente AS recolector_patente,
        COALESCE(
          json_agg(
            json_build_object(
              'id', rp.id,
              'orden', rp.orden,
              'estado', rp.estado,
              'recolectado_at', rp.recolectado_at,
              'punto_id', p.id,
              'nombre', p.nombre,
              'direccion', p.direccion,
              'latitud', p.latitud,
              'longitud', p.longitud,
              'cliente_nombre', c.nombre
            ) ORDER BY rp.orden ASC
          ) FILTER (WHERE p.id IS NOT NULL),
          '[]'::json
        ) AS puntos
       FROM public.rutas rt
       INNER JOIN public.usuarios u ON u.id = rt.recolector_id
       LEFT JOIN public.ruta_puntos rp ON rp.ruta_id = rt.id
       LEFT JOIN public.puntos_recoleccion p ON p.id = rp.punto_id
       LEFT JOIN public.clientes c ON c.id = p.cliente_id
       WHERE ${where.join(' AND ')}
       GROUP BY rt.id, u.id
       ORDER BY rt.fecha DESC, rt.created_at DESC`,
      params
    );

    res.json({ rutas: result.rows });
  } catch (err) {
    console.error('[GET /api/admin/rutas Error]:', err);
    res.status(500).json({ error: 'Error al obtener rutas.' });
  }
});

/**
 * POST /api/admin/rutas/generar
 * Genera rutas mediante algoritmo TSP + OSRM para una fecha determinada.
 * Soporta reparto automático de puntos entre múltiples recolectores (K-Means balanceado)
 * o generación para un recolector específico.
 */
router.post('/rutas/generar', async (req, res) => {
  try {
    const {
      fecha = new Date().toISOString().slice(0, 10),
      puntos_ids = [],
      modo = 'reparto_automatico', // 'reparto_automatico' | 'unico_recolector'
      recolector_id,
      recolectores_ids = [],
    } = req.body;

    if (!Array.isArray(puntos_ids) || puntos_ids.length === 0) {
      return res.status(400).json({ error: 'Seleccione al menos un punto de recolección para generar la ruta.' });
    }

    const ptsRes = await query(
      `SELECT p.*, c.nombre AS cliente_nombre
       FROM public.puntos_recoleccion p
       INNER JOIN public.clientes c ON c.id = p.cliente_id
       WHERE p.inquilino_id = $1 AND p.id = ANY($2::uuid[])`,
      [req.user.inquilino_id, puntos_ids]
    );
    const points = ptsRes.rows;

    let targetCollectors = [];
    if (modo === 'unico_recolector' && recolector_id) {
      const cRes = await query(
        `SELECT u.id, u.nombre_completo, u.vehiculo_patente, u.ultima_lat, u.ultima_lng
         FROM public.usuarios u
         WHERE u.id = $1 AND u.inquilino_id = $2`,
        [recolector_id, req.user.inquilino_id]
      );
      targetCollectors = cRes.rows;
    } else {
      const filterIds = Array.isArray(recolectores_ids) && recolectores_ids.length > 0;
      const cRes = await query(
        `SELECT u.id, u.nombre_completo, u.vehiculo_patente, u.ultima_lat, u.ultima_lng
         FROM public.usuarios u
         INNER JOIN public.roles r ON r.id = u.rol_id
         WHERE u.inquilino_id = $1 AND r.codigo = 'recolector' AND u.habilitado = TRUE
         ${filterIds ? 'AND u.id = ANY($2::uuid[])' : ''}
         ORDER BY u.conectado DESC, u.nombre_completo ASC`,
        filterIds ? [req.user.inquilino_id, recolectores_ids] : [req.user.inquilino_id]
      );
      targetCollectors = cRes.rows;
    }

    if (targetCollectors.length === 0) {
      return res.status(400).json({ error: 'No hay recolectores habilitados seleccionados para asignar la ruta.' });
    }

    const distributed = await distributePointsBalancedKMeans(points, targetCollectors);

    const createdRutas = await withAudit(
      {
        ...req,
        actionDesc: `Generación automática de ${distributed.length} ruta(s) para fecha ${fecha} (${points.length} puntos)`,
      },
      async (tx) => {
        const resultList = [];
        for (let i = 0; i < distributed.length; i++) {
          const item = distributed[i];
          const code = `RUTA-${fecha.replace(/-/g, '')}-${i + 1}-${Math.floor(10 + Math.random() * 89)}`;
          const rutaNombre =
            distributed.length > 1
              ? `Zona ${i + 1} - ${item.recolector.nombre_completo}`
              : `Recorrido Optimizado - ${item.recolector.nombre_completo}`;

          const ins = await tx.query(
            `INSERT INTO public.rutas (
              inquilino_id, codigo, nombre, recolector_id, fecha, estado,
              modo_generacion, distancia_total_m, duracion_estimada_s, geometria_geojson
            ) VALUES ($1, $2, $3, $4, $5, 'pendiente', $6, $7, $8, $9)
            RETURNING *`,
            [
              req.user.inquilino_id,
              code,
              rutaNombre,
              item.recolector.id,
              fecha,
              modo,
              item.distancia_total_m,
              item.duracion_estimada_s,
              JSON.stringify(item.geometria_geojson),
            ]
          );
          const rutaRow = ins.rows[0];

          for (let pIdx = 0; pIdx < item.puntos.length; pIdx++) {
            await tx.query(
              `INSERT INTO public.ruta_puntos (ruta_id, punto_id, orden, estado)
               VALUES ($1, $2, $3, 'pendiente')`,
              [rutaRow.id, item.puntos[pIdx].id, pIdx + 1]
            );
          }

          // Marcar peticiones de clientes asociadas a esos puntos como programadas
          await tx.query(
            `UPDATE public.peticiones_recoleccion
             SET estado = 'programada', ruta_id = $1, updated_at = NOW()
             WHERE punto_id = ANY($2::uuid[]) AND estado = 'pendiente'`,
            [rutaRow.id, item.puntos.map((p) => p.id)]
          );

          resultList.push({
            ...rutaRow,
            recolector_nombre: item.recolector.nombre_completo,
            puntos: item.puntos.map((pt, idx) => ({
              ...pt,
              punto_id: pt.id,
              orden: idx + 1,
              estado: 'pendiente',
            })),
          });
        }
        return resultList;
      }
    );

    // Disparar notificaciones push a cada recolector asignado
    for (const r of createdRutas) {
      sendPushToUser(r.recolector_id, {
        title: 'Nueva ruta asignada',
        body: `Tienes una ruta optimizada con ${r.puntos.length} puntos para el ${fecha}.`,
        url: '/recolector',
      });
    }

    res.status(201).json({
      rutas: createdRutas,
      message: `Se generaron y optimizaron ${createdRutas.length} ruta(s) correctamente.`,
    });
  } catch (err) {
    console.error('[POST /api/admin/rutas/generar Error]:', err);
    res.status(500).json({ error: err.message || 'Error al generar rutas.' });
  }
});

// =============================================================================
// 7. PETICIONES DE CLIENTES Y AUDITORÍA
// =============================================================================

router.get('/peticiones', async (req, res) => {
  try {
    const result = await query(
      `SELECT
        pr.*,
        c.nombre AS cliente_nombre,
        p.nombre AS punto_nombre,
        p.direccion AS punto_direccion
       FROM public.peticiones_recoleccion pr
       INNER JOIN public.clientes c ON c.id = pr.cliente_id
       INNER JOIN public.puntos_recoleccion p ON p.id = pr.punto_id
       WHERE pr.inquilino_id = $1
       ORDER BY
         CASE WHEN pr.estado = 'pendiente' THEN 0 ELSE 1 END,
         pr.created_at DESC`,
      [req.user.inquilino_id]
    );
    res.json({ peticiones: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener peticiones de clientes.' });
  }
});

router.get('/auditoria', async (req, res) => {
  try {
    const { tabla, operacion, limit = 120 } = req.query;
    const params = [];
    const where = [];

    if (tabla) {
      params.push(tabla);
      where.push(`a.tabla_afectada = $${params.length}`);
    }
    if (operacion) {
      params.push(operacion);
      where.push(`a.operacion = $${params.length}`);
    }

    params.push(Math.min(Number(limit) || 120, 500));

    const result = await query(
      `SELECT
        a.id,
        a.tabla_afectada,
        a.operacion,
        a.registro_id,
        a.usuario_id,
        a.usuario_email,
        a.usuario_rol,
        a.ip_origen,
        a.accion_descripcion,
        a.datos_anteriores,
        a.datos_nuevos,
        a.created_at
       FROM public.auditoria a
       ${where.length > 0 ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT $${params.length}`,
      params
    );

    res.json({ registros: result.rows });
  } catch (err) {
    console.error('[GET /api/admin/auditoria Error]:', err);
    res.status(500).json({ error: 'Error al consultar la tabla de auditoría.' });
  }
});

module.exports = router;

