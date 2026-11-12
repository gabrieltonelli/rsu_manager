const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');

// Polyfill de WebSocket para runtimes Node.js anteriores a v22 (Netlify Functions)
if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = ws;
}

const supabaseUrl = process.env.SUPABASE_URL;
const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

/**
 * Cliente Supabase Público (solo instanciado en el Backend para flujos de Auth de usuario).
 * Ninguna llave sale al navegador.
 */
const supabasePublic = supabaseUrl && supabasePublishableKey
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      realtime: {
        transport: ws,
      },
    })
  : null;

/**
 * Cliente Administrativo de Supabase (usa SUPABASE_SECRET_KEY exclusivamente en Backend).
 */
const supabaseAdmin = supabaseUrl && supabaseSecretKey
  ? createClient(supabaseUrl, supabaseSecretKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      realtime: {
        transport: ws,
      },
    })
  : null;

module.exports = {
  supabasePublic,
  supabaseAdmin,
};

