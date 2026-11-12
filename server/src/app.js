const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');

const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const recolectorRoutes = require('./routes/recolectorRoutes');
const volquetesRoutes = require('./routes/volquetesRoutes');
const clienteRoutes = require('./routes/clienteRoutes');
const trazabilidadRoutes = require('./routes/trazabilidadRoutes');

const app = express();

app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);

const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin) || origin.startsWith('http://localhost:')) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

// Healthcheck
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'rsu-manager-server',
    tenant: process.env.DEFAULT_TENANT_CODE || 'RSU',
    timestamp: new Date().toISOString(),
  });
});

// Módulos de la API REST
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/recolector', recolectorRoutes);
app.use('/api/volquetes', volquetesRoutes);
app.use('/api/cliente', clienteRoutes);
app.use('/api/trazabilidad', trazabilidadRoutes);

// Manejador 404 para rutas API inexistentes
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: `Ruta API no encontrada: ${req.method} ${req.originalUrl}` });
});

module.exports = app;

