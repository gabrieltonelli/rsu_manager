-- =============================================================================
-- RSU MANAGER - ESQUEMA INTEGRAL DE BASE DE DATOS (SUPABASE POSTGRESQL)
-- Incluye: Arquitectura Multi-Inquilino, RBAC, Módulos Operativos, RLS,
-- Índices en Claves Foráneas y Auditoría Automática mediante Triggers PL/pgSQL.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1. TABLA DE AUDITORÍA Y FUNCIÓN TRIGGER PL/pgSQL
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.auditoria (
    id BIGSERIAL PRIMARY KEY,
    inquilino_id UUID,
    tabla_afectada VARCHAR(100) NOT NULL,
    operacion VARCHAR(20) NOT NULL CHECK (operacion IN ('INSERT', 'UPDATE', 'DELETE')),
    registro_id VARCHAR(100),
    usuario_id UUID,
    usuario_email VARCHAR(255),
    usuario_rol VARCHAR(50),
    ip_origen VARCHAR(64),
    accion_descripcion TEXT,
    datos_anteriores JSONB,
    datos_nuevos JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auditoria_tabla ON public.auditoria(tabla_afectada);
CREATE INDEX IF NOT EXISTS idx_auditoria_usuario ON public.auditoria(usuario_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_inquilino ON public.auditoria(inquilino_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_fecha ON public.auditoria(created_at DESC);

CREATE OR REPLACE FUNCTION public.fn_registrar_auditoria()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_usuario_id UUID;
    v_usuario_email VARCHAR(255);
    v_usuario_rol VARCHAR(50);
    v_ip_origen VARCHAR(64);
    v_accion_desc TEXT;
    v_registro_id VARCHAR(100);
    v_inquilino_id UUID;
    v_old_json JSONB := NULL;
    v_new_json JSONB := NULL;
BEGIN
    -- Leer contexto del usuario inyectado por el backend en la transacción (SET LOCAL)
    BEGIN
        v_usuario_id := NULLIF(current_setting('app.current_user_id', true), '')::UUID;
    EXCEPTION WHEN OTHERS THEN
        v_usuario_id := NULL;
    END;

    v_usuario_email := COALESCE(NULLIF(current_setting('app.current_user_email', true), ''), 'sistema@rsu.local');
    v_usuario_rol   := COALESCE(NULLIF(current_setting('app.current_user_rol', true), ''), 'sistema');
    v_ip_origen     := COALESCE(NULLIF(current_setting('app.current_user_ip', true), ''), '127.0.0.1');
    v_accion_desc   := NULLIF(current_setting('app.current_action_desc', true), '');

    IF (TG_OP = 'INSERT') THEN
        v_new_json := to_jsonb(NEW) - 'password_hash';
        v_registro_id := COALESCE(v_new_json->>'id', '');
        BEGIN
            v_inquilino_id := NULLIF(v_new_json->>'inquilino_id', '')::UUID;
        EXCEPTION WHEN OTHERS THEN
            v_inquilino_id := NULL;
        END;
    ELSIF (TG_OP = 'UPDATE') THEN
        v_old_json := to_jsonb(OLD) - 'password_hash';
        v_new_json := to_jsonb(NEW) - 'password_hash';
        v_registro_id := COALESCE(v_new_json->>'id', '');
        BEGIN
            v_inquilino_id := NULLIF(v_new_json->>'inquilino_id', '')::UUID;
        EXCEPTION WHEN OTHERS THEN
            v_inquilino_id := NULL;
        END;
    ELSIF (TG_OP = 'DELETE') THEN
        v_old_json := to_jsonb(OLD) - 'password_hash';
        v_registro_id := COALESCE(v_old_json->>'id', '');
        BEGIN
            v_inquilino_id := NULLIF(v_old_json->>'inquilino_id', '')::UUID;
        EXCEPTION WHEN OTHERS THEN
            v_inquilino_id := NULL;
        END;
    END IF;

    INSERT INTO public.auditoria (
        inquilino_id,
        tabla_afectada,
        operacion,
        registro_id,
        usuario_id,
        usuario_email,
        usuario_rol,
        ip_origen,
        accion_descripcion,
        datos_anteriores,
        datos_nuevos
    ) VALUES (
        v_inquilino_id,
        TG_TABLE_NAME,
        TG_OP,
        v_registro_id,
        v_usuario_id,
        v_usuario_email,
        v_usuario_rol,
        v_ip_origen,
        COALESCE(v_accion_desc, TG_OP || ' en tabla ' || TG_TABLE_NAME),
        v_old_json,
        v_new_json
    );

    IF (TG_OP = 'DELETE') THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_registrar_auditoria() FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. INQUILINOS (SOPORTE MULTI-TENANT ARQUITECTÓNICO)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inquilinos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo VARCHAR(50) UNIQUE NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    cuit VARCHAR(30),
    configuracion JSONB NOT NULL DEFAULT '{}'::jsonb,
    habilitado BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 3. ROLES Y PERMISOS (RBAC)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo VARCHAR(50) UNIQUE NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    descripcion TEXT,
    nivel_acceso INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.permisos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo VARCHAR(100) UNIQUE NOT NULL,
    modulo VARCHAR(60) NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    descripcion TEXT
);

CREATE TABLE IF NOT EXISTS public.rol_permisos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rol_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
    permiso_id UUID NOT NULL REFERENCES public.permisos(id) ON DELETE CASCADE,
    UNIQUE(rol_id, permiso_id)
);

CREATE INDEX IF NOT EXISTS idx_rol_permisos_rol ON public.rol_permisos(rol_id);
CREATE INDEX IF NOT EXISTS idx_rol_permisos_permiso ON public.rol_permisos(permiso_id);

-- -----------------------------------------------------------------------------
-- 4. USUARIOS (ADMINISTRADORES, RECOLECTORES, CLIENTES, PENDIENTES)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.usuarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inquilino_id UUID NOT NULL REFERENCES public.inquilinos(id),
    supabase_uid UUID UNIQUE,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    nombre_completo VARCHAR(150) NOT NULL,
    telefono VARCHAR(50),
    avatar_url TEXT,
    proveedor_auth VARCHAR(30) NOT NULL DEFAULT 'email',
    rol_id UUID NOT NULL REFERENCES public.roles(id),
    habilitado BOOLEAN NOT NULL DEFAULT TRUE,
    vehiculo_patente VARCHAR(50),
    licencia_conducir VARCHAR(80),
    capacidad_max_kg NUMERIC(10,2) DEFAULT 5000,
    conectado BOOLEAN NOT NULL DEFAULT FALSE,
    ultima_lat DOUBLE PRECISION,
    ultima_lng DOUBLE PRECISION,
    ultima_conexion_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usuarios_rol ON public.usuarios(rol_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_inquilino ON public.usuarios(inquilino_id);

-- -----------------------------------------------------------------------------
-- 5. TIPOS DE RESIDUO
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tipos_residuo (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inquilino_id UUID NOT NULL REFERENCES public.inquilinos(id),
    codigo VARCHAR(40) NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    descripcion TEXT,
    color_hex VARCHAR(20) NOT NULL DEFAULT '#10b981',
    unidad VARCHAR(20) NOT NULL DEFAULT 'kg',
    habilitado BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(inquilino_id, codigo)
);

CREATE INDEX IF NOT EXISTS idx_tipos_residuo_inquilino ON public.tipos_residuo(inquilino_id);

-- -----------------------------------------------------------------------------
-- 6. CLIENTES
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.clientes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inquilino_id UUID NOT NULL REFERENCES public.inquilinos(id),
    usuario_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
    nombre VARCHAR(150) NOT NULL,
    razon_social VARCHAR(180),
    cuit_dni VARCHAR(40),
    direccion VARCHAR(255),
    telefono VARCHAR(60),
    email_contacto VARCHAR(255),
    notas TEXT,
    habilitado BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clientes_inquilino ON public.clientes(inquilino_id);
CREATE INDEX IF NOT EXISTS idx_clientes_usuario ON public.clientes(usuario_id);

-- -----------------------------------------------------------------------------
-- 7. PUNTOS DE RECOLECCIÓN Y COMPOSICIÓN PORCENTUAL DE RESIDUOS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.puntos_recoleccion (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inquilino_id UUID NOT NULL REFERENCES public.inquilinos(id),
    cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,
    nombre VARCHAR(150) NOT NULL,
    direccion VARCHAR(255) NOT NULL,
    latitud DOUBLE PRECISION NOT NULL,
    longitud DOUBLE PRECISION NOT NULL,
    frecuencia_semanal INT NOT NULL DEFAULT 3,
    dias_preferidos VARCHAR(100) DEFAULT 'Lun,Mié,Vie',
    habilitado BOOLEAN NOT NULL DEFAULT TRUE,
    ultima_recoleccion_at TIMESTAMPTZ,
    ultimo_peso_kg NUMERIC(10,2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_puntos_inquilino ON public.puntos_recoleccion(inquilino_id);
CREATE INDEX IF NOT EXISTS idx_puntos_cliente ON public.puntos_recoleccion(cliente_id);

CREATE TABLE IF NOT EXISTS public.punto_residuo_porcentajes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    punto_id UUID NOT NULL REFERENCES public.puntos_recoleccion(id) ON DELETE CASCADE,
    tipo_residuo_id UUID NOT NULL REFERENCES public.tipos_residuo(id) ON DELETE RESTRICT,
    porcentaje NUMERIC(5,2) NOT NULL CHECK (porcentaje >= 0 AND porcentaje <= 100),
    UNIQUE(punto_id, tipo_residuo_id)
);

CREATE INDEX IF NOT EXISTS idx_punto_porcentajes_punto ON public.punto_residuo_porcentajes(punto_id);
CREATE INDEX IF NOT EXISTS idx_punto_porcentajes_residuo ON public.punto_residuo_porcentajes(tipo_residuo_id);

-- -----------------------------------------------------------------------------
-- 8. PETICIONES DE RECOLECCIÓN (SOLICITADAS POR CLIENTES)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.peticiones_recoleccion (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inquilino_id UUID NOT NULL REFERENCES public.inquilinos(id),
    cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
    punto_id UUID NOT NULL REFERENCES public.puntos_recoleccion(id) ON DELETE CASCADE,
    solicitado_por_usuario_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
    fecha_solicitada DATE NOT NULL DEFAULT CURRENT_DATE,
    prioridad VARCHAR(20) NOT NULL DEFAULT 'normal',
    observaciones TEXT,
    estado VARCHAR(30) NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'programada', 'completada', 'cancelada')),
    ruta_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_peticiones_inquilino ON public.peticiones_recoleccion(inquilino_id);
CREATE INDEX IF NOT EXISTS idx_peticiones_cliente ON public.peticiones_recoleccion(cliente_id);
CREATE INDEX IF NOT EXISTS idx_peticiones_punto ON public.peticiones_recoleccion(punto_id);
CREATE INDEX IF NOT EXISTS idx_peticiones_usuario ON public.peticiones_recoleccion(solicitado_por_usuario_id);

-- -----------------------------------------------------------------------------
-- 9. RUTAS DE RECOLECCIÓN Y PUNTOS ASIGNADOS A CADA RUTA
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rutas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inquilino_id UUID NOT NULL REFERENCES public.inquilinos(id),
    codigo VARCHAR(50),
    nombre VARCHAR(150),
    recolector_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
    fecha DATE NOT NULL,
    estado VARCHAR(30) NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'en_curso', 'completada', 'cancelada')),
    modo_generacion VARCHAR(30) NOT NULL DEFAULT 'algoritmo',
    distancia_total_m DOUBLE PRECISION DEFAULT 0,
    duracion_estimada_s DOUBLE PRECISION DEFAULT 0,
    geometria_geojson JSONB,
    notas TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rutas_inquilino ON public.rutas(inquilino_id);
CREATE INDEX IF NOT EXISTS idx_rutas_recolector_fecha ON public.rutas(recolector_id, fecha);

CREATE TABLE IF NOT EXISTS public.ruta_puntos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ruta_id UUID NOT NULL REFERENCES public.rutas(id) ON DELETE CASCADE,
    punto_id UUID NOT NULL REFERENCES public.puntos_recoleccion(id) ON DELETE RESTRICT,
    orden INT NOT NULL,
    estado VARCHAR(30) NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'recolectado', 'omitido')),
    recoleccion_id UUID,
    recolectado_at TIMESTAMPTZ,
    UNIQUE(ruta_id, punto_id)
);

CREATE INDEX IF NOT EXISTS idx_ruta_puntos_ruta ON public.ruta_puntos(ruta_id);
CREATE INDEX IF NOT EXISTS idx_ruta_puntos_punto ON public.ruta_puntos(punto_id);

-- -----------------------------------------------------------------------------
-- 10. RECOLECCIONES Y DETALLE DE PESOS POR TIPO DE RESIDUO
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.recolecciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inquilino_id UUID NOT NULL REFERENCES public.inquilinos(id),
    punto_id UUID NOT NULL REFERENCES public.puntos_recoleccion(id) ON DELETE RESTRICT,
    cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,
    ruta_id UUID REFERENCES public.rutas(id) ON DELETE SET NULL,
    recolector_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
    registrado_por_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
    es_manual_admin BOOLEAN NOT NULL DEFAULT FALSE,
    modo_calculo VARCHAR(20) NOT NULL DEFAULT 'automatico' CHECK (modo_calculo IN ('automatico', 'manual')),
    peso_total_kg NUMERIC(10,2) NOT NULL CHECK (peso_total_kg >= 0),
    lat_recolector DOUBLE PRECISION,
    lng_recolector DOUBLE PRECISION,
    distancia_punto_m DOUBLE PRECISION,
    geolocalizacion_validada BOOLEAN NOT NULL DEFAULT TRUE,
    observaciones TEXT,
    fecha_recoleccion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    semana_iso VARCHAR(15) NOT NULL DEFAULT to_char(NOW(), 'IYYY-"W"IW'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recolecciones_inquilino ON public.recolecciones(inquilino_id);
CREATE INDEX IF NOT EXISTS idx_recolecciones_punto ON public.recolecciones(punto_id);
CREATE INDEX IF NOT EXISTS idx_recolecciones_cliente ON public.recolecciones(cliente_id);
CREATE INDEX IF NOT EXISTS idx_recolecciones_ruta ON public.recolecciones(ruta_id);
CREATE INDEX IF NOT EXISTS idx_recolecciones_recolector ON public.recolecciones(recolector_id);
CREATE INDEX IF NOT EXISTS idx_recolecciones_registrado_por ON public.recolecciones(registrado_por_id);
CREATE INDEX IF NOT EXISTS idx_recolecciones_fecha ON public.recolecciones(fecha_recoleccion DESC);

CREATE TABLE IF NOT EXISTS public.recoleccion_detalles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recoleccion_id UUID NOT NULL REFERENCES public.recolecciones(id) ON DELETE CASCADE,
    tipo_residuo_id UUID NOT NULL REFERENCES public.tipos_residuo(id) ON DELETE RESTRICT,
    porcentaje_aplicado NUMERIC(5,2),
    peso_kg NUMERIC(10,2) NOT NULL CHECK (peso_kg >= 0)
);

CREATE INDEX IF NOT EXISTS idx_recoleccion_detalles_recoleccion ON public.recoleccion_detalles(recoleccion_id);
CREATE INDEX IF NOT EXISTS idx_recoleccion_detalles_residuo ON public.recoleccion_detalles(tipo_residuo_id);

-- -----------------------------------------------------------------------------
-- 11. GESTIÓN DE VOLQUETES Y MOVIMIENTOS (PÚBLICO, ADMIN Y RECOLECTOR)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.volquetes_gestiones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inquilino_id UUID NOT NULL REFERENCES public.inquilinos(id),
    codigo VARCHAR(40) NOT NULL,
    direccion VARCHAR(255) NOT NULL,
    direccion_normalizada VARCHAR(255) NOT NULL,
    latitud DOUBLE PRECISION,
    longitud DOUBLE PRECISION,
    telefono_contacto VARCHAR(60) NOT NULL,
    nombre_solicitante VARCHAR(150),
    cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
    recolector_asignado_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
    origen VARCHAR(30) NOT NULL DEFAULT 'publico' CHECK (origen IN ('publico', 'administracion')),
    estado VARCHAR(40) NOT NULL DEFAULT 'solicitado' CHECK (estado IN ('solicitado', 'entregado', 'cambio_solicitado', 'retiro_solicitado', 'finalizado', 'facturado')),
    accion_pendiente_recolector VARCHAR(40),
    cantidad_envios INT NOT NULL DEFAULT 0,
    cantidad_cambios INT NOT NULL DEFAULT 0,
    cantidad_retiros INT NOT NULL DEFAULT 0,
    tarifa_unitaria NUMERIC(12,2) NOT NULL DEFAULT 45000.00,
    monto_total NUMERIC(12,2) NOT NULL DEFAULT 45000.00,
    notas TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_volquetes_inquilino ON public.volquetes_gestiones(inquilino_id);
CREATE INDEX IF NOT EXISTS idx_volquetes_dir_norm ON public.volquetes_gestiones(direccion_normalizada);
CREATE INDEX IF NOT EXISTS idx_volquetes_cliente ON public.volquetes_gestiones(cliente_id);
CREATE INDEX IF NOT EXISTS idx_volquetes_recolector ON public.volquetes_gestiones(recolector_asignado_id);

CREATE TABLE IF NOT EXISTS public.volquetes_movimientos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gestion_id UUID NOT NULL REFERENCES public.volquetes_gestiones(id) ON DELETE CASCADE,
    tipo_movimiento VARCHAR(40) NOT NULL CHECK (tipo_movimiento IN ('solicitud_inicial', 'envio', 'solicitud_cambio', 'cambio', 'solicitud_retiro', 'retiro_final', 'facturacion', 'asignacion_recolector')),
    recolector_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
    registrado_por_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
    origen VARCHAR(30) NOT NULL DEFAULT 'sistema',
    costo_movimiento NUMERIC(12,2) NOT NULL DEFAULT 0,
    notas TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_volquetes_mov_gestion ON public.volquetes_movimientos(gestion_id);
CREATE INDEX IF NOT EXISTS idx_volquetes_mov_recolector ON public.volquetes_movimientos(recolector_id);
CREATE INDEX IF NOT EXISTS idx_volquetes_mov_registrado ON public.volquetes_movimientos(registrado_por_id);

-- -----------------------------------------------------------------------------
-- 12. SUSCRIPCIONES A NOTIFICACIONES WEB PUSH
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_usuario ON public.push_subscriptions(usuario_id);

-- -----------------------------------------------------------------------------
-- 13. CREACIÓN DE TRIGGERS DE AUDITORÍA Y RLS EN TODAS LAS TABLAS
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    t TEXT;
    tablas_auditadas TEXT[] := ARRAY[
        'inquilinos',
        'roles',
        'usuarios',
        'tipos_residuo',
        'clientes',
        'puntos_recoleccion',
        'punto_residuo_porcentajes',
        'peticiones_recoleccion',
        'rutas',
        'ruta_puntos',
        'recolecciones',
        'recoleccion_detalles',
        'volquetes_gestiones',
        'volquetes_movimientos'
    ];
    todas_las_tablas TEXT[] := ARRAY[
        'auditoria',
        'inquilinos',
        'roles',
        'permisos',
        'rol_permisos',
        'usuarios',
        'tipos_residuo',
        'clientes',
        'puntos_recoleccion',
        'punto_residuo_porcentajes',
        'peticiones_recoleccion',
        'rutas',
        'ruta_puntos',
        'recolecciones',
        'recoleccion_detalles',
        'volquetes_gestiones',
        'volquetes_movimientos',
        'push_subscriptions'
    ];
BEGIN
    FOREACH t IN ARRAY tablas_auditadas LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_auditoria_%I ON public.%I;', t, t);
        EXECUTE format(
            'CREATE TRIGGER trg_auditoria_%I
             AFTER INSERT OR UPDATE OR DELETE ON public.%I
             FOR EACH ROW EXECUTE FUNCTION public.fn_registrar_auditoria();',
            t, t
        );
    END LOOP;

    -- Habilitar RLS en todas las tablas del esquema public para bloquear acceso directo desde el navegador
    FOREACH t IN ARRAY todas_las_tablas LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname = 'public' AND tablename = t AND policyname = 'backend_only_access'
        ) THEN
            EXECUTE format(
                'CREATE POLICY "backend_only_access" ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true);',
                t
            );
        END IF;
    END LOOP;
END;
$$;
