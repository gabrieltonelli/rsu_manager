const jwt = require('jsonwebtoken');
const { query } = require('../config/db');

const COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'rsu_session';
const JWT_SECRET = process.env.SESSION_JWT_SECRET || 'rsu_super_secret_jwt_signing_key_2026';
const MAX_AGE_MS = Number(process.env.SESSION_MAX_AGE_MS || 604800000);

function getCookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'strict' : 'lax',
    maxAge: MAX_AGE_MS,
    path: '/',
  };
}

/**
 * Emite una cookie HttpOnly firmada que contiene únicamente el ID interno del usuario.
 * El rol y los permisos NUNCA se guardan ni se confían desde cookies ni desde el cliente;
 * se consultan en tiempo real contra PostgreSQL en cada petición.
 */
function setSessionCookie(res, userId, inquilinoId) {
  const token = jwt.sign(
    {
      sub: userId,
      tid: inquilinoId,
    },
    JWT_SECRET,
    { expiresIn: Math.floor(MAX_AGE_MS / 1000) }
  );
  res.cookie(COOKIE_NAME, token, getCookieOptions());
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    path: '/',
  });
}

/**
 * Obtiene el usuario completo, su rol actual y la lista de permisos desde PostgreSQL.
 */
async function fetchUserWithRoleAndPermissions(userId) {
  const res = await query(
    `SELECT
      u.id,
      u.inquilino_id,
      i.codigo AS inquilino_codigo,
      i.nombre AS inquilino_nombre,
      u.email,
      u.nombre_completo,
      u.telefono,
      u.avatar_url,
      u.proveedor_auth,
      u.habilitado,
      u.vehiculo_patente,
      u.licencia_conducir,
      u.capacidad_max_kg,
      u.conectado,
      u.ultima_lat,
      u.ultima_lng,
      u.ultima_conexion_at,
      r.id AS rol_id,
      r.codigo AS rol_codigo,
      r.nombre AS rol_nombre,
      r.nivel_acceso,
      c.id AS cliente_id,
      c.nombre AS cliente_nombre,
      COALESCE(
        ARRAY_AGG(p.codigo) FILTER (WHERE p.codigo IS NOT NULL),
        ARRAY[]::VARCHAR[]
      ) AS permisos
    FROM public.usuarios u
    INNER JOIN public.inquilinos i ON i.id = u.inquilino_id
    INNER JOIN public.roles r ON r.id = u.rol_id
    LEFT JOIN public.rol_permisos rp ON rp.rol_id = r.id
    LEFT JOIN public.permisos p ON p.id = rp.permiso_id
    LEFT JOIN public.clientes c ON c.usuario_id = u.id
    WHERE u.id = $1
    GROUP BY u.id, i.id, r.id, c.id`,
    [userId]
  );
  return res.rows[0] || null;
}

/**
 * Middleware que verifica la cookie HttpOnly y carga el usuario y su rol real desde la BD.
 */
async function requireAuth(req, res, next) {
  try {
    const token = req.cookies ? req.cookies[COOKIE_NAME] : null;
    if (!token) {
      return res.status(401).json({ error: 'No autenticado. Inicie sesión para continuar.' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      clearSessionCookie(res);
      return res.status(401).json({ error: 'Sesión expirada o inválida.' });
    }

    const user = await fetchUserWithRoleAndPermissions(decoded.sub);
    if (!user) {
      clearSessionCookie(res);
      return res.status(401).json({ error: 'Usuario no encontrado.' });
    }

    if (!user.habilitado) {
      clearSessionCookie(res);
      return res.status(403).json({
        error: 'Su cuenta se encuentra deshabilitada por un Administrador.',
        code: 'USER_DISABLED',
      });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error('[Auth Middleware Error]:', err);
    res.status(500).json({ error: 'Error interno al verificar sesión.' });
  }
}

/**
 * Middleware que exige que el usuario tenga uno de los roles permitidos (validado en BD).
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'No autenticado.' });
    }
    if (req.user.rol_codigo === 'pendiente_aprobacion') {
      return res.status(403).json({
        error: 'Su cuenta está pendiente de aprobación y asignación de rol por un Administrador.',
        code: 'PENDING_APPROVAL',
      });
    }
    if (!allowedRoles.includes(req.user.rol_codigo)) {
      return res.status(403).json({
        error: `Acceso denegado. Se requiere rol: ${allowedRoles.join(' o ')}.`,
      });
    }
    next();
  };
}

/**
 * Middleware que exige un permiso específico dentro de la matriz RBAC.
 */
function requirePermission(permisoCodigo) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'No autenticado.' });
    }
    if (req.user.rol_codigo === 'administrador') {
      return next();
    }
    if (!Array.isArray(req.user.permisos) || !req.user.permisos.includes(permisoCodigo)) {
      return res.status(403).json({
        error: `No posee el permiso requerido (${permisoCodigo}) para realizar esta acción.`,
      });
    }
    next();
  };
}

module.exports = {
  COOKIE_NAME,
  setSessionCookie,
  clearSessionCookie,
  fetchUserWithRoleAndPermissions,
  requireAuth,
  requireRole,
  requirePermission,
};

