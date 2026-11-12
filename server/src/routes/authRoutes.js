const express = require('express');
const bcrypt = require('bcryptjs');
const { query, withAudit } = require('../config/db');
const { supabasePublic, supabaseAdmin } = require('../config/supabase');
const {
  setSessionCookie,
  clearSessionCookie,
  fetchUserWithRoleAndPermissions,
  requireAuth,
} = require('../middlewares/auth');

const router = express.Router();

/**
 * Obtiene el ID del inquilino principal por defecto ('RSU') y el rol 'pendiente_aprobacion'.
 */
async function getDefaultTenantAndPendingRole(clientOrPool) {
  const tenantCode = process.env.DEFAULT_TENANT_CODE || 'RSU';
  const tRes = await clientOrPool.query(`SELECT id FROM public.inquilinos WHERE codigo = $1 LIMIT 1`, [tenantCode]);
  const rRes = await clientOrPool.query(`SELECT id FROM public.roles WHERE codigo = 'pendiente_aprobacion' LIMIT 1`);
  return {
    inquilinoId: tRes.rows[0]?.id,
    pendingRolId: rRes.rows[0]?.id,
  };
}

/**
 * POST /api/auth/login
 * Autenticación mediante correo y contraseña (integrado con Supabase Auth + PostgreSQL).
 * Emite Cookie HttpOnly firmada sin exponer credenciales ni tokens en el DOM/localStorage.
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Debe ingresar correo electrónico y contraseña.' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    // 1. Buscar usuario en nuestra tabla public.usuarios
    const userRes = await query(
      `SELECT u.*, r.codigo AS rol_codigo
       FROM public.usuarios u
       INNER JOIN public.roles r ON r.id = u.rol_id
       WHERE LOWER(u.email) = $1
       LIMIT 1`,
      [normalizedEmail]
    );
    let dbUser = userRes.rows[0] || null;

    let authenticatedViaSupabase = false;
    let supabaseUid = dbUser?.supabase_uid || null;

    // 2. Intentar autenticar contra Supabase Auth si está configurado
    if (supabasePublic) {
      try {
        const { data, error } = await supabasePublic.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });
        if (!error && data?.user) {
          authenticatedViaSupabase = true;
          supabaseUid = data.user.id;
        }
      } catch (supaErr) {
        // Continuar a verificación de hash local
      }
    }

    // 3. Si no autenticó por Supabase Auth, validar contra password_hash en PostgreSQL
    if (!authenticatedViaSupabase) {
      if (!dbUser || !dbUser.password_hash) {
        return res.status(401).json({ error: 'Credenciales inválidas. Verifique su correo y contraseña.' });
      }
      const isValid = await bcrypt.compare(String(password), dbUser.password_hash);
      if (!isValid) {
        return res.status(401).json({ error: 'Credenciales inválidas. Verifique su correo y contraseña.' });
      }

      // Sincronizar transparente con Supabase Auth en segundo plano si tenemos supabaseAdmin
      if (supabaseAdmin && !dbUser.supabase_uid) {
        try {
          const { data: created } = await supabaseAdmin.auth.admin.createUser({
            email: normalizedEmail,
            password: String(password),
            email_confirm: true,
            user_metadata: { nombre_completo: dbUser.nombre_completo },
          });
          if (created?.user?.id) {
            supabaseUid = created.user.id;
          }
        } catch (syncErr) {
          // Ya existe o no requiere bloqueo
        }
      }
    }

    // 4. Si autenticó en Supabase Auth pero aún no existe en public.usuarios, crearlo como 'pendiente_aprobacion'
    if (!dbUser && authenticatedViaSupabase) {
      dbUser = await withAudit(
        {
          email: normalizedEmail,
          rol: 'pendiente_aprobacion',
          ip: req.ip,
          actionDesc: 'Alta automática en estado pendiente_aprobacion tras login en Supabase Auth',
        },
        async (tx) => {
          const { inquilinoId, pendingRolId } = await getDefaultTenantAndPendingRole(tx);
          const ins = await tx.query(
            `INSERT INTO public.usuarios (
              inquilino_id, supabase_uid, email, nombre_completo, proveedor_auth, rol_id, habilitado, conectado, ultima_conexion_at
            ) VALUES ($1, $2, $3, $4, 'email', $5, TRUE, TRUE, NOW())
            RETURNING *`,
            [inquilinoId, supabaseUid, normalizedEmail, normalizedEmail.split('@')[0], pendingRolId]
          );
          return ins.rows[0];
        }
      );
    }

    if (!dbUser.habilitado) {
      return res.status(403).json({
        error: 'Su usuario se encuentra deshabilitado. Contacte al Administrador del sistema.',
      });
    }

    // 5. Actualizar estado de conexión y registrar en auditoría
    await withAudit(
      {
        userId: dbUser.id,
        email: dbUser.email,
        rol: dbUser.rol_codigo,
        ip: req.ip,
        actionDesc: 'Inicio de sesión exitoso (Email/Contraseña)',
      },
      async (tx) => {
        await tx.query(
          `UPDATE public.usuarios
           SET conectado = TRUE,
               ultima_conexion_at = NOW(),
               supabase_uid = COALESCE(supabase_uid, $2),
               updated_at = NOW()
           WHERE id = $1`,
          [dbUser.id, supabaseUid]
        );
      }
    );

    const fullUser = await fetchUserWithRoleAndPermissions(dbUser.id);
    setSessionCookie(res, fullUser.id, fullUser.inquilino_id);

    res.json({
      user: fullUser,
      message: 'Sesión iniciada correctamente.',
    });
  } catch (err) {
    console.error('[POST /api/auth/login Error]:', err);
    res.status(500).json({ error: 'Error interno al procesar el inicio de sesión.' });
  }
});

/**
 * GET /api/auth/google
 * Inicia el flujo OAuth con Google a través de Supabase Auth desde el Backend.
 * Ninguna credencial de Supabase se expone en el cliente.
 */
router.get('/google', async (req, res) => {
  try {
    if (!supabasePublic) {
      return res.status(503).json({ error: 'Supabase Auth no está configurado en el servidor.' });
    }

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const redirectTo = `${clientUrl}/oauth-callback`;

    const { data, error } = await supabasePublic.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });

    if (error || !data?.url) {
      return res.status(400).json({
        error: error?.message || 'No se pudo iniciar Google OAuth en Supabase.',
      });
    }

    res.json({ url: data.url });
  } catch (err) {
    console.error('[GET /api/auth/google Error]:', err);
    res.status(500).json({ error: 'Error al generar URL de autenticación con Google.' });
  }
});

/**
 * POST /api/auth/oauth-exchange
 * Recibe el access_token devuelto por el flujo OAuth de Supabase/Google,
 * lo verifica en el backend contra Supabase, crea el usuario en estado
 * 'pendiente_aprobacion' si es nuevo, y establece la Cookie HttpOnly.
 */
router.post('/oauth-exchange', async (req, res) => {
  try {
    const { access_token } = req.body;
    if (!access_token || !supabaseAdmin) {
      return res.status(400).json({ error: 'Token OAuth faltante o servidor no configurado.' });
    }

    const { data, error } = await supabaseAdmin.auth.getUser(access_token);
    if (error || !data?.user) {
      return res.status(401).json({ error: 'Token de Google OAuth inválido o expirado.' });
    }

    const supaUser = data.user;
    const email = String(supaUser.email).trim().toLowerCase();
    const nombre =
      supaUser.user_metadata?.full_name ||
      supaUser.user_metadata?.name ||
      email.split('@')[0];
    const avatarUrl = supaUser.user_metadata?.avatar_url || null;

    const existingRes = await query(
      `SELECT u.*, r.codigo AS rol_codigo
       FROM public.usuarios u
       INNER JOIN public.roles r ON r.id = u.rol_id
       WHERE LOWER(u.email) = $1 OR u.supabase_uid = $2
       LIMIT 1`,
      [email, supaUser.id]
    );

    let dbUser = existingRes.rows[0] || null;

    if (!dbUser) {
      // Crear en estado 'pendiente_aprobacion' como indicó el usuario
      dbUser = await withAudit(
        {
          email,
          rol: 'pendiente_aprobacion',
          ip: req.ip,
          actionDesc: 'Registro inicial con Google OAuth en estado pendiente_aprobacion',
        },
        async (tx) => {
          const { inquilinoId, pendingRolId } = await getDefaultTenantAndPendingRole(tx);
          const ins = await tx.query(
            `INSERT INTO public.usuarios (
              inquilino_id, supabase_uid, email, nombre_completo, avatar_url,
              proveedor_auth, rol_id, habilitado, conectado, ultima_conexion_at
            ) VALUES ($1, $2, $3, $4, $5, 'google', $6, TRUE, TRUE, NOW())
            RETURNING *`,
            [inquilinoId, supaUser.id, email, nombre, avatarUrl, pendingRolId]
          );
          return ins.rows[0];
        }
      );
    } else {
      if (!dbUser.habilitado) {
        return res.status(403).json({
          error: 'Su cuenta se encuentra deshabilitada por un Administrador.',
        });
      }

      await withAudit(
        {
          userId: dbUser.id,
          email: dbUser.email,
          rol: dbUser.rol_codigo,
          ip: req.ip,
          actionDesc: 'Inicio de sesión exitoso con Google OAuth',
        },
        async (tx) => {
          await tx.query(
            `UPDATE public.usuarios
             SET supabase_uid = COALESCE(supabase_uid, $2),
                 avatar_url = COALESCE($3, avatar_url),
                 conectado = TRUE,
                 ultima_conexion_at = NOW(),
                 updated_at = NOW()
             WHERE id = $1`,
            [dbUser.id, supaUser.id, avatarUrl]
          );
        }
      );
    }

    const fullUser = await fetchUserWithRoleAndPermissions(dbUser.id);
    setSessionCookie(res, fullUser.id, fullUser.inquilino_id);

    res.json({ user: fullUser });
  } catch (err) {
    console.error('[POST /api/auth/oauth-exchange Error]:', err);
    res.status(500).json({ error: 'Error al validar sesión de Google OAuth.' });
  }
});

/**
 * POST /api/auth/google-register-request
 * Permite registrar/vincular una cuenta Google en estado 'pendiente_aprobacion'
 * si el proveedor OAuth de Google aún no tiene credenciales de Google Cloud cargadas en Supabase.
 */
router.post('/google-register-request', async (req, res) => {
  try {
    const { email, nombre_completo } = req.body;
    if (!email || !nombre_completo) {
      return res.status(400).json({ error: 'Ingrese su correo de Google y nombre completo.' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existingRes = await query(
      `SELECT u.*, r.codigo AS rol_codigo
       FROM public.usuarios u
       INNER JOIN public.roles r ON r.id = u.rol_id
       WHERE LOWER(u.email) = $1
       LIMIT 1`,
      [normalizedEmail]
    );

    let dbUser = existingRes.rows[0] || null;
    if (!dbUser) {
      dbUser = await withAudit(
        {
          email: normalizedEmail,
          rol: 'pendiente_aprobacion',
          ip: req.ip,
          actionDesc: 'Alta de cuenta Google en estado pendiente_aprobacion',
        },
        async (tx) => {
          const { inquilinoId, pendingRolId } = await getDefaultTenantAndPendingRole(tx);
          const ins = await tx.query(
            `INSERT INTO public.usuarios (
              inquilino_id, email, nombre_completo, proveedor_auth, rol_id, habilitado, conectado, ultima_conexion_at
            ) VALUES ($1, $2, $3, 'google', $4, TRUE, TRUE, NOW())
            RETURNING *`,
            [inquilinoId, normalizedEmail, String(nombre_completo).trim(), pendingRolId]
          );
          return ins.rows[0];
        }
      );
    } else if (!dbUser.habilitado) {
      return res.status(403).json({
        error: 'Su cuenta se encuentra deshabilitada por un Administrador.',
      });
    }

    const fullUser = await fetchUserWithRoleAndPermissions(dbUser.id);
    setSessionCookie(res, fullUser.id, fullUser.inquilino_id);

    res.json({ user: fullUser });
  } catch (err) {
    console.error('[POST /api/auth/google-register-request Error]:', err);
    res.status(500).json({ error: 'Error al procesar ingreso con cuenta de Google.' });
  }
});

/**
 * GET /api/auth/me
 * Devuelve el usuario actual validado contra la BD desde la cookie HttpOnly.
 */
router.get('/me', requireAuth, async (req, res) => {
  res.json({
    user: req.user,
    config: {
      geofenceRadiusMeters: Number(process.env.GEOFENCE_RADIUS_METERS || 250),
    },
  });
});

/**
 * POST /api/auth/logout
 * Cierra la sesión actual, marca al usuario como desconectado y elimina la cookie HttpOnly.
 */
router.post('/logout', requireAuth, async (req, res) => {
  try {
    await withAudit(
      {
        ...req,
        actionDesc: 'Cierre de sesión (Logout)',
      },
      async (tx) => {
        await tx.query(
          `UPDATE public.usuarios
           SET conectado = FALSE,
               ultima_conexion_at = NOW(),
               updated_at = NOW()
           WHERE id = $1`,
          [req.user.id]
        );
      }
    );
  } catch (err) {
    // Continuar con limpieza de cookie
  }
  clearSessionCookie(res);
  res.json({ message: 'Sesión cerrada correctamente.' });
});

module.exports = router;

