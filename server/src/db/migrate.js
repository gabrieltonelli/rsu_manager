const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { pool, withAudit } = require('../config/db');

async function runMigrations() {
  console.log('🚀 Conectando a Supabase PostgreSQL e iniciando migración...');
  const schemaPath = path.resolve(__dirname, 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');

  const client = await pool.connect();
  try {
    await client.query(schemaSql);
    console.log('✅ Esquema de tablas y triggers de auditoría aplicados correctamente.');
  } finally {
    client.release();
  }

  // Sembrar datos iniciales dentro del contexto transaccional con auditoría
  await withAudit(
    {
      email: 'setup@rsu.com.ar',
      rol: 'administrador',
      ip: '127.0.0.1',
      actionDesc: 'Seed inicial de inquilino, roles, permisos y datos maestros RSU',
    },
    async (tx) => {
      // 1. Inquilino principal (Multi-tenant)
      const tenantCode = process.env.DEFAULT_TENANT_CODE || 'RSU';
      const tenantName = process.env.DEFAULT_TENANT_NAME || 'RSU Gestión Ambiental';

      const tenantRes = await tx.query(
        `INSERT INTO public.inquilinos (codigo, nombre, cuit, configuracion)
         VALUES ($1, $2, '30-71589421-9', '{"moneda": "ARS", "pais": "AR"}'::jsonb)
         ON CONFLICT (codigo) DO UPDATE SET nombre = EXCLUDED.nombre
         RETURNING id`,
        [tenantCode, tenantName]
      );
      const inquilinoId = tenantRes.rows[0].id;

      // 2. Roles del sistema
      const rolesData = [
        {
          codigo: 'administrador',
          nombre: 'Administrador',
          descripcion: 'Acceso total a usuarios, residuos, clientes, puntos, recolectores, rutas, volquetes, trazabilidad y auditoría.',
          nivel_acceso: 100,
        },
        {
          codigo: 'recolector',
          nombre: 'Recolector',
          descripcion: 'Acceso a ruta asignada del día y semanal, registro de recolecciones con GPS, gestión de volquetes en calle y trazabilidad.',
          nivel_acceso: 50,
        },
        {
          codigo: 'cliente',
          nombre: 'Cliente',
          descripcion: 'Acceso a su dashboard de puntos de recolección, solicitud de retiro, historial semanal y trazabilidad.',
          nivel_acceso: 20,
        },
        {
          codigo: 'pendiente_aprobacion',
          nombre: 'Pendiente de Aprobación',
          descripcion: 'Usuario autenticado en espera de que un Administrador le asigne un rol operativo y lo habilite.',
          nivel_acceso: 0,
        },
      ];

      const roleMap = {};
      for (const r of rolesData) {
        const res = await tx.query(
          `INSERT INTO public.roles (codigo, nombre, descripcion, nivel_acceso)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (codigo) DO UPDATE
           SET nombre = EXCLUDED.nombre, descripcion = EXCLUDED.descripcion, nivel_acceso = EXCLUDED.nivel_acceso
           RETURNING id, codigo`,
          [r.codigo, r.nombre, r.descripcion, r.nivel_acceso]
        );
        roleMap[r.codigo] = res.rows[0].id;
      }

      // 3. Permisos granulares por módulo
      const permisosData = [
        { codigo: 'usuarios:gestionar', modulo: 'Usuarios', nombre: 'Gestionar usuarios y roles' },
        { codigo: 'residuos:gestionar', modulo: 'Tipos de Residuo', nombre: 'Crear, editar y deshabilitar tipos de residuo' },
        { codigo: 'puntos:gestionar', modulo: 'Puntos de Recolección', nombre: 'Crear, editar y deshabilitar puntos de recolección' },
        { codigo: 'puntos:recoleccion_manual', modulo: 'Puntos de Recolección', nombre: 'Registrar recolección manual desde administración' },
        { codigo: 'recolectores:gestionar', modulo: 'Recolectores', nombre: 'Administrar recolectores y modificar sus rutas' },
        { codigo: 'recolectores:mapa_vivo', modulo: 'Recolectores', nombre: 'Visualizar mapa en vivo de recolectores' },
        { codigo: 'rutas:generar', modulo: 'Rutas', nombre: 'Generar rutas y repartir puntos automáticamente' },
        { codigo: 'rutas:mi_ruta', modulo: 'Home Recolector', nombre: 'Ver ruta propia del día y rutas de la semana' },
        { codigo: 'recolecciones:registrar', modulo: 'Nueva Recolección', nombre: 'Registrar recolección en punto validando GPS' },
        { codigo: 'volquetes:administrar', modulo: 'Volquetes', nombre: 'Administrar solicitudes, movimientos y facturación de volquetes' },
        { codigo: 'volquetes:recolector', modulo: 'Volquetes Recolector', nombre: 'Ver y gestionar entregas/retiros de volquetes asignados' },
        { codigo: 'clientes:gestionar', modulo: 'Clientes', nombre: 'Administrar clientes, puntos y porcentajes de residuos' },
        { codigo: 'clientes:dashboard', modulo: 'Dashboard Cliente', nombre: 'Ver puntos asignados, historial semanal y pedir recolecciones' },
        { codigo: 'trazabilidad:ver', modulo: 'Trazabilidad', nombre: 'Consultar reporte general y gráficos de trazabilidad' },
        { codigo: 'auditoria:ver', modulo: 'Auditoría', nombre: 'Consultar registros inmutables de auditoría por usuario' },
      ];

      const permisoMap = {};
      for (const p of permisosData) {
        const res = await tx.query(
          `INSERT INTO public.permisos (codigo, modulo, nombre, descripcion)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (codigo) DO UPDATE SET modulo = EXCLUDED.modulo, nombre = EXCLUDED.nombre
           RETURNING id, codigo`,
          [p.codigo, p.modulo, p.nombre, p.nombre]
        );
        permisoMap[p.codigo] = res.rows[0].id;
      }

      // Asignación de permisos por rol
      const asignaciones = {
        administrador: Object.keys(permisoMap),
        recolector: ['rutas:mi_ruta', 'recolecciones:registrar', 'volquetes:recolector', 'trazabilidad:ver'],
        cliente: ['clientes:dashboard', 'trazabilidad:ver'],
        pendiente_aprobacion: [],
      };

      for (const [rolCodigo, listaPermisos] of Object.entries(asignaciones)) {
        const rolId = roleMap[rolCodigo];
        for (const permCodigo of listaPermisos) {
          await tx.query(
            `INSERT INTO public.rol_permisos (rol_id, permiso_id)
             VALUES ($1, $2)
             ON CONFLICT (rol_id, permiso_id) DO NOTHING`,
            [rolId, permisoMap[permCodigo]]
          );
        }
      }

      // 4. Usuarios iniciales (si no existen)
      const adminPass = await bcrypt.hash('AdminRSU2026!', 10);
      const recolectorPass = await bcrypt.hash('Recolector2026!', 10);
      const clientePass = await bcrypt.hash('Cliente2026!', 10);

      const adminUserRes = await tx.query(
        `INSERT INTO public.usuarios (
          inquilino_id, email, password_hash, nombre_completo, telefono, rol_id, habilitado, conectado, ultima_conexion_at
        ) VALUES ($1, 'admin@rsu.com.ar', $2, 'Martín Pereyra (Admin RSU)', '+54 11 4580-1000', $3, TRUE, TRUE, NOW())
        ON CONFLICT (email) DO UPDATE SET rol_id = EXCLUDED.rol_id
        RETURNING id`,
        [inquilinoId, adminPass, roleMap.administrador]
      );
      const adminUserId = adminUserRes.rows[0].id;

      const rec1Res = await tx.query(
        `INSERT INTO public.usuarios (
          inquilino_id, email, password_hash, nombre_completo, telefono, rol_id, habilitado,
          vehiculo_patente, licencia_conducir, capacidad_max_kg, conectado, ultima_lat, ultima_lng, ultima_conexion_at
        ) VALUES (
          $1, 'recolector1@rsu.com.ar', $2, 'Carlos Gómez', '+54 9 11 5123-4401', $3, TRUE,
          'AE 452 KL', 'B2-C1-99812', 6000, TRUE, -34.6037, -58.3816, NOW()
        )
        ON CONFLICT (email) DO UPDATE SET rol_id = EXCLUDED.rol_id
        RETURNING id`,
        [inquilinoId, recolectorPass, roleMap.recolector]
      );
      const rec1Id = rec1Res.rows[0].id;

      const rec2Res = await tx.query(
        `INSERT INTO public.usuarios (
          inquilino_id, email, password_hash, nombre_completo, telefono, rol_id, habilitado,
          vehiculo_patente, licencia_conducir, capacidad_max_kg, conectado, ultima_lat, ultima_lng, ultima_conexion_at
        ) VALUES (
          $1, 'recolector2@rsu.com.ar', $2, 'Lucía Fernández', '+54 9 11 5890-7721', $3, TRUE,
          'AF 891 ZP', 'B2-C1-77410', 5500, FALSE, -34.5885, -58.4105, NOW() - INTERVAL '2 hours'
        )
        ON CONFLICT (email) DO UPDATE SET rol_id = EXCLUDED.rol_id
        RETURNING id`,
        [inquilinoId, recolectorPass, roleMap.recolector]
      );
      const rec2Id = rec2Res.rows[0].id;

      const cli1UserRes = await tx.query(
        `INSERT INTO public.usuarios (
          inquilino_id, email, password_hash, nombre_completo, telefono, rol_id, habilitado
        ) VALUES ($1, 'cliente@ecopack.com.ar', $2, 'Sofía Alarcón (EcoPack)', '+54 11 4300-2200', $3, TRUE)
        ON CONFLICT (email) DO UPDATE SET rol_id = EXCLUDED.rol_id
        RETURNING id`,
        [inquilinoId, clientePass, roleMap.cliente]
      );
      const cli1UserId = cli1UserRes.rows[0].id;

      const cli2UserRes = await tx.query(
        `INSERT INTO public.usuarios (
          inquilino_id, email, password_hash, nombre_completo, telefono, rol_id, habilitado
        ) VALUES ($1, 'logistica@supermercadosur.com.ar', $2, 'Diego Maidana (Supermercados del Sur)', '+54 11 4910-8800', $3, TRUE)
        ON CONFLICT (email) DO UPDATE SET rol_id = EXCLUDED.rol_id
        RETURNING id`,
        [inquilinoId, clientePass, roleMap.cliente]
      );
      const cli2UserId = cli2UserRes.rows[0].id;

      // 5. Tipos de residuo iniciales
      const residuosSeed = [
        { codigo: 'CARTON', nombre: 'Cartón y Papel', descripcion: 'Cajas corrugadas, papel blanco y envases celulósicos.', color_hex: '#f59e0b' },
        { codigo: 'PLASTICO_PET', nombre: 'Plástico PET / PEAD', descripcion: 'Botellas plásticas, film stretch y envases soplados.', color_hex: '#3b82f6' },
        { codigo: 'VIDRIO', nombre: 'Vidrio Reciclable', descripcion: 'Envases de vidrio transparente y color sin contaminantes.', color_hex: '#10b981' },
        { codigo: 'METALES', nombre: 'Metales y Aluminio', descripcion: 'Latas de aluminio, hojalata y recortes ferrosos livianos.', color_hex: '#6366f1' },
        { codigo: 'ORGANICO', nombre: 'Orgánico Valorizable', descripcion: 'Residuos orgánicos vegetales aptos para compostaje industrial.', color_hex: '#84cc16' },
      ];

      const residuoMap = {};
      for (const tr of residuosSeed) {
        const res = await tx.query(
          `INSERT INTO public.tipos_residuo (inquilino_id, codigo, nombre, descripcion, color_hex, unidad, habilitado)
           VALUES ($1, $2, $3, $4, $5, 'kg', TRUE)
           ON CONFLICT (inquilino_id, codigo) DO UPDATE
           SET nombre = EXCLUDED.nombre, color_hex = EXCLUDED.color_hex
           RETURNING id, codigo`,
          [inquilinoId, tr.codigo, tr.nombre, tr.descripcion, tr.color_hex]
        );
        residuoMap[tr.codigo] = res.rows[0].id;
      }

      // 6. Verificar si ya hay clientes cargados antes de insertar datos operativos de ejemplo
      const existingClientes = await tx.query(`SELECT COUNT(*)::int AS total FROM public.clientes WHERE inquilino_id = $1`, [inquilinoId]);
      if (existingClientes.rows[0].total === 0) {
        const c1Res = await tx.query(
          `INSERT INTO public.clientes (inquilino_id, usuario_id, nombre, razon_social, cuit_dni, direccion, telefono, email_contacto, notas, habilitado)
           VALUES ($1, $2, 'EcoPack Industrial', 'EcoPack Industrial S.A.', '30-70918273-4', 'Av. Paseo Colón 850, CABA', '+54 11 4300-2200', 'cliente@ecopack.com.ar', 'Planta de envases sustentables y centro de distribución.', TRUE)
           RETURNING id`,
          [inquilinoId, cli1UserId]
        );
        const cliente1Id = c1Res.rows[0].id;

        const c2Res = await tx.query(
          `INSERT INTO public.clientes (inquilino_id, usuario_id, nombre, razon_social, cuit_dni, direccion, telefono, email_contacto, notas, habilitado)
           VALUES ($1, $2, 'Supermercados del Sur', 'Supermercados del Sur S.R.L.', '30-68112390-1', 'Av. Rivadavia 4950, CABA', '+54 11 4910-8800', 'logistica@supermercadosur.com.ar', 'Cadena minorista con separación en origen.', TRUE)
           RETURNING id`,
          [inquilinoId, cli2UserId]
        );
        const cliente2Id = c2Res.rows[0].id;

        // 7. Puntos de recolección
        const puntosSeed = [
          {
            cliente_id: cliente1Id,
            nombre: 'EcoPack - Planta San Telmo',
            direccion: 'Av. Paseo Colón 850, CABA',
            latitud: -34.6176,
            longitud: -58.3688,
            frecuencia_semanal: 4,
            dias_preferidos: 'Lun,Mar,Jue,Vie',
            composicion: [
              { codigo: 'CARTON', porcentaje: 55 },
              { codigo: 'PLASTICO_PET', porcentaje: 35 },
              { codigo: 'METALES', porcentaje: 10 },
            ],
          },
          {
            cliente_id: cliente1Id,
            nombre: 'EcoPack - Centro Logístico Retiro',
            direccion: 'Av. Antártida Argentina 1200, CABA',
            latitud: -34.5892,
            longitud: -58.3704,
            frecuencia_semanal: 3,
            dias_preferidos: 'Lun,Mié,Vie',
            composicion: [
              { codigo: 'CARTON', porcentaje: 70 },
              { codigo: 'PLASTICO_PET', porcentaje: 20 },
              { codigo: 'VIDRIO', porcentaje: 10 },
            ],
          },
          {
            cliente_id: cliente2Id,
            nombre: 'Sucursal Caballito Centro',
            direccion: 'Av. Rivadavia 4950, CABA',
            latitud: -34.6184,
            longitud: -58.4362,
            frecuencia_semanal: 5,
            dias_preferidos: 'Lun,Mar,Mié,Jue,Vie',
            composicion: [
              { codigo: 'ORGANICO', porcentaje: 40 },
              { codigo: 'CARTON', porcentaje: 35 },
              { codigo: 'PLASTICO_PET', porcentaje: 15 },
              { codigo: 'VIDRIO', porcentaje: 10 },
            ],
          },
          {
            cliente_id: cliente2Id,
            nombre: 'Sucursal Palermo Soho',
            direccion: 'Av. Santa Fe 3900, CABA',
            latitud: -34.5835,
            longitud: -58.4192,
            frecuencia_semanal: 3,
            dias_preferidos: 'Mar,Jue,Sáb',
            composicion: [
              { codigo: 'CARTON', porcentaje: 45 },
              { codigo: 'PLASTICO_PET', porcentaje: 30 },
              { codigo: 'VIDRIO', porcentaje: 25 },
            ],
          },
          {
            cliente_id: cliente2Id,
            nombre: 'Depósito Central Almagro',
            direccion: 'Av. Corrientes 3800, CABA',
            latitud: -34.6041,
            longitud: -58.4185,
            frecuencia_semanal: 3,
            dias_preferidos: 'Lun,Mié,Vie',
            composicion: [
              { codigo: 'CARTON', porcentaje: 60 },
              { codigo: 'PLASTICO_PET', porcentaje: 25 },
              { codigo: 'METALES', porcentaje: 15 },
            ],
          },
        ];

        const puntosCreados = [];
        for (const p of puntosSeed) {
          const pRes = await tx.query(
            `INSERT INTO public.puntos_recoleccion (
              inquilino_id, cliente_id, nombre, direccion, latitud, longitud, frecuencia_semanal, dias_preferidos, habilitado
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)
            RETURNING *`,
            [inquilinoId, p.cliente_id, p.nombre, p.direccion, p.latitud, p.longitud, p.frecuencia_semanal, p.dias_preferidos]
          );
          const punto = pRes.rows[0];
          puntosCreados.push({ ...punto, composicion: p.composicion });

          for (const comp of p.composicion) {
            await tx.query(
              `INSERT INTO public.punto_residuo_porcentajes (punto_id, tipo_residuo_id, porcentaje)
               VALUES ($1, $2, $3)`,
              [punto.id, residuoMap[comp.codigo], comp.porcentaje]
            );
          }
        }

        // 8. Historial de recolecciones en las últimas 3 semanas para trazabilidad e historial por semana
        const histSemanas = [
          { diasAtras: 14, pesoBase: 320 },
          { diasAtras: 7, pesoBase: 410 },
          { diasAtras: 2, pesoBase: 385 },
        ];

        for (const h of histSemanas) {
          for (let idx = 0; idx < puntosCreados.length; idx++) {
            const pt = puntosCreados[idx];
            const pesoTotal = h.pesoBase + idx * 45;
            const recRes = await tx.query(
              `INSERT INTO public.recolecciones (
                inquilino_id, punto_id, cliente_id, recolector_id, registrado_por_id,
                es_manual_admin, modo_calculo, peso_total_kg, lat_recolector, lng_recolector,
                distancia_punto_m, geolocalizacion_validada, observaciones,
                fecha_recoleccion, semana_iso
              ) VALUES (
                $1, $2, $3, $4, $4,
                FALSE, 'automatico', $5, $6, $7,
                14.5, TRUE, 'Recolección regular verificada por GPS.',
                NOW() - ($8 || ' days')::interval,
                to_char(NOW() - ($8 || ' days')::interval, 'IYYY-"W"IW')
              ) RETURNING id, fecha_recoleccion`,
              [inquilinoId, pt.id, pt.cliente_id, idx % 2 === 0 ? rec1Id : rec2Id, pesoTotal, pt.latitud, pt.longitud, String(h.diasAtras)]
            );
            const recId = recRes.rows[0].id;

            for (const comp of pt.composicion) {
              const pesoResiduo = Number(((pesoTotal * comp.porcentaje) / 100).toFixed(2));
              await tx.query(
                `INSERT INTO public.recoleccion_detalles (recoleccion_id, tipo_residuo_id, porcentaje_aplicado, peso_kg)
                 VALUES ($1, $2, $3, $4)`,
                [recId, residuoMap[comp.codigo], comp.porcentaje, pesoResiduo]
              );
            }

            await tx.query(
              `UPDATE public.puntos_recoleccion
               SET ultima_recoleccion_at = $2, ultimo_peso_kg = $3
               WHERE id = $1`,
              [pt.id, recRes.rows[0].fecha_recoleccion, pesoTotal]
            );
          }
        }

        // 9. Crear una ruta activa para HOY para Carlos Gómez (recolector1)
        const rutaHoyRes = await tx.query(
          `INSERT INTO public.rutas (
            inquilino_id, codigo, nombre, recolector_id, fecha, estado, modo_generacion, distancia_total_m, duracion_estimada_s, notas
          ) VALUES (
            $1, 'RUTA-HOY-01', 'Recorrido CABA Centro-Sur', $2, CURRENT_DATE, 'en_curso', 'algoritmo', 9450, 1680, 'Ruta optimizada automáticamente para el turno mañana.'
          ) RETURNING id`,
          [inquilinoId, rec1Id]
        );
        const rutaHoyId = rutaHoyRes.rows[0].id;

        for (let i = 0; i < 3; i++) {
          await tx.query(
            `INSERT INTO public.ruta_puntos (ruta_id, punto_id, orden, estado)
             VALUES ($1, $2, $3, 'pendiente')`,
            [rutaHoyId, puntosCreados[i].id, i + 1]
          );
        }

        // 10. Crear gestiones de volquetes de ejemplo
        const vol1Res = await tx.query(
          `INSERT INTO public.volquetes_gestiones (
            inquilino_id, codigo, direccion, direccion_normalizada, latitud, longitud,
            telefono_contacto, nombre_solicitante, cliente_id, recolector_asignado_id,
            origen, estado, accion_pendiente_recolector, cantidad_envios, cantidad_cambios, cantidad_retiros,
            tarifa_unitaria, monto_total, notas
          ) VALUES (
            $1, 'VOL-1001', 'Av. Paseo Colón 850, CABA', 'av paseo colon 850 caba', -34.6176, -58.3688,
            '+54 11 4300-2200', 'EcoPack Industrial S.A.', $2, $3,
            'administracion', 'entregado', NULL, 1, 0, 0,
            45000, 45000, 'Volquete de 5m3 entregado en dársena lateral.'
          ) RETURNING id`,
          [inquilinoId, cliente1Id, rec1Id]
        );
        await tx.query(
          `INSERT INTO public.volquetes_movimientos (gestion_id, tipo_movimiento, recolector_id, registrado_por_id, origen, costo_movimiento, notas)
           VALUES
           ($1, 'solicitud_inicial', $2, $3, 'administracion', 0, 'Solicitud telefónica registrada por administración.'),
           ($1, 'envio', $2, $3, 'recolector', 45000, 'Entrega inicial de volquete en dirección.')`,
          [vol1Res.rows[0].id, rec1Id, adminUserId]
        );

        const vol2Res = await tx.query(
          `INSERT INTO public.volquetes_gestiones (
            inquilino_id, codigo, direccion, direccion_normalizada, latitud, longitud,
            telefono_contacto, nombre_solicitante, recolector_asignado_id,
            origen, estado, accion_pendiente_recolector, cantidad_envios, cantidad_cambios, cantidad_retiros,
            tarifa_unitaria, monto_total, notas
          ) VALUES (
            $1, 'VOL-1002', 'Av. Independencia 1850, CABA', 'av independencia 1850 caba', -34.6179, -58.3924,
            '+54 9 11 6554-1122', 'Obra Civil San Cristóbal', $2,
            'publico', 'solicitado', 'entregar', 0, 0, 0,
            45000, 45000, 'Solicitud ingresada desde el formulario público web.'
          ) RETURNING id`,
          [inquilinoId, rec1Id]
        );
        await tx.query(
          `INSERT INTO public.volquetes_movimientos (gestion_id, tipo_movimiento, recolector_id, origen, costo_movimiento, notas)
           VALUES ($1, 'solicitud_inicial', $2, 'publico', 45000, 'Solicitud de volquete nuevo desde portal público.')`,
          [vol2Res.rows[0].id, rec1Id]
        );
      }
    }
  );

  console.log('🎉 Datos semilla y configuración de auditoría completados con éxito.');
}

if (require.main === module) {
  runMigrations()
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Error ejecutando migración:', err);
      process.exit(1);
    });
}

module.exports = { runMigrations };

