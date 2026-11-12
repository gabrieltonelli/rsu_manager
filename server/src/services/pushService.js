const webPush = require('web-push');
const { query } = require('../config/db');

const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:notificaciones@rsu-ambiental.com.ar';
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

let pushConfigured = false;
if (vapidPublicKey && vapidPrivateKey) {
  try {
    webPush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
    pushConfigured = true;
  } catch (err) {
    console.warn('[WebPush] No se pudo inicializar VAPID:', err.message);
  }
}

/**
 * Envía una notificación Web Push a todas las suscripciones activas de un usuario.
 */
async function sendPushToUser(userId, payload) {
  if (!pushConfigured || !userId) return { sent: 0 };

  try {
    const subsRes = await query(
      `SELECT id, endpoint, p256dh, auth FROM public.push_subscriptions WHERE usuario_id = $1`,
      [userId]
    );

    const notificationPayload = JSON.stringify({
      title: payload.title || 'RSU Manager',
      body: payload.body || 'Tienes una nueva actualización en el sistema.',
      url: payload.url || '/',
      tag: payload.tag || 'rsu-notification',
      timestamp: Date.now(),
    });

    let sent = 0;
    for (const sub of subsRes.rows) {
      try {
        await webPush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          notificationPayload
        );
        sent++;
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await query(`DELETE FROM public.push_subscriptions WHERE id = $1`, [sub.id]);
        }
      }
    }
    return { sent };
  } catch (err) {
    console.error('[WebPush Error]:', err.message);
    return { sent: 0 };
  }
}

/**
 * Envía una notificación Web Push a todos los usuarios habilitados de un rol específico.
 */
async function sendPushToRole(inquilinoId, rolCodigo, payload) {
  if (!pushConfigured) return { sent: 0 };

  try {
    const usersRes = await query(
      `SELECT u.id
       FROM public.usuarios u
       INNER JOIN public.roles r ON r.id = u.rol_id
       WHERE u.inquilino_id = $1 AND r.codigo = $2 AND u.habilitado = TRUE`,
      [inquilinoId, rolCodigo]
    );

    let totalSent = 0;
    for (const u of usersRes.rows) {
      const res = await sendPushToUser(u.id, payload);
      totalSent += res.sent;
    }
    return { sent: totalSent };
  } catch (err) {
    console.error('[WebPush Role Error]:', err.message);
    return { sent: 0 };
  }
}

module.exports = {
  vapidPublicKey,
  pushConfigured,
  sendPushToUser,
  sendPushToRole,
};

