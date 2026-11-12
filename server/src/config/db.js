const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === 'true',
  },
  max: 15,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
});

pool.on('error', (err) => {
  console.error('[PostgreSQL Pool Error]:', err.message);
});

/**
 * Ejecuta una consulta directa (lecturas o consultas sin contexto de transacción).
 */
async function query(text, params = []) {
  return pool.query(text, params);
}

/**
 * Ejecuta un bloque de operaciones dentro de una transacción PostgreSQL
 * inyectando las variables locales de sesión (`app.current_user_*`)
 * para que los triggers `trg_auditoria_*` registren automáticamente
 * el autor, rol, IP y descripción de la acción en la tabla `auditoria`.
 *
 * @param {Object} context - Objeto `req` de Express o diccionario `{ userId, email, rol, ip, actionDesc }`
 * @param {Function} callback - Función asíncrona `(client) => ...`
 */
async function withAudit(context, callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let userId = '';
    let email = 'sistema@rsu.local';
    let rol = 'sistema';
    let ip = '127.0.0.1';
    let actionDesc = '';

    if (context) {
      if (context.user) {
        // Es un objeto `req` de Express con usuario autenticado
        userId = context.user.id || '';
        email = context.user.email || 'usuario@rsu.local';
        rol = context.user.rol_codigo || 'autenticado';
      } else if (context.userId || context.email) {
        userId = context.userId || '';
        email = context.email || 'sistema@rsu.local';
        rol = context.rol || 'sistema';
      }

      if (context.headers) {
        const forwarded = context.headers['x-forwarded-for'];
        ip = (forwarded ? String(forwarded).split(',')[0].trim() : context.ip) || '127.0.0.1';
      } else if (context.ip) {
        ip = context.ip;
      }

      if (context.actionDesc) {
        actionDesc = context.actionDesc;
      } else if (context.method && context.originalUrl) {
        actionDesc = `${context.method} ${context.originalUrl}`;
      }
    }

    await client.query(
      `SELECT
        set_config('app.current_user_id', $1, true),
        set_config('app.current_user_email', $2, true),
        set_config('app.current_user_rol', $3, true),
        set_config('app.current_user_ip', $4, true),
        set_config('app.current_action_desc', $5, true)`,
      [String(userId), String(email), String(rol), String(ip), String(actionDesc)]
    );

    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  query,
  withAudit,
};

