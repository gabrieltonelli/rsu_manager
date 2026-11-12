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
    const response = await serverlessHandler(event, context);
    return response;
  } catch (error) {
    console.error('[Netlify Function Handler Error]:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        error: error.message || 'Error interno en la ejecución de la función.',
      }),
    };
  }
};
