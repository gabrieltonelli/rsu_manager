const app = require('./app');

const PORT = Number(process.env.PORT || 4000);

app.listen(PORT, () => {
  console.log(`=================================================================`);
  console.log(`🌿 RSU Manager - Backend ejecutándose en http://localhost:${PORT}`);
  console.log(`🔒 Sesiones protegidas con Cookie HttpOnly y RBAC en Supabase PG`);
  console.log(`📋 Triggers de Auditoría activos en esquema public`);
  console.log(`=================================================================`);
});

