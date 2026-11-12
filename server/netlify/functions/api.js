const serverless = require('serverless-http');
const app = require('../../src/app');

const serverlessHandler = serverless(app);

module.exports.handler = async (event, context) => {
  // Asegurar que el contexto no espere el vaciado del event loop para responder
  context.callbackWaitsForEmptyEventLoop = false;

  // Normalizar el path si Netlify entrega la ruta con el prefijo /.netlify/functions/api
  if (event.path && event.path.startsWith('/.netlify/functions/api')) {
    event.path = event.path.replace('/.netlify/functions/api', '/api') || '/';
  }
  if (event.rawUrl) {
    event.rawUrl = event.rawUrl.replace('/.netlify/functions/api', '/api');
  }

  try {
    return await serverlessHandler(event, context);
  } catch (error) {
    console.error('[Netlify Function Crash]:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        error: error.message || 'Error interno en Netlify Function',
      }),
    };
  }
};
