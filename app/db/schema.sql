-- Esquema del backend real (login Google + pago + métricas para el artículo).
-- Se aplica una sola vez al iniciar el contenedor de Postgres (docker-entrypoint-initdb.d).
-- Sin ORM: el backend habla con esto directo por `pg`, con SQL parametrizado.

create extension if not exists pgcrypto; -- para gen_random_uuid()

create table usuarios (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text not null unique,
  email text not null,
  nombre text,
  rol text not null default 'paciente' check (rol in ('paciente', 'admin')),
  consentimiento_app_en timestamptz,
  consentimiento_app_version text,
  consentimiento_investigacion_en timestamptz,
  consentimiento_investigacion_version text,
  creado_en timestamptz not null default now()
);

-- Un informe completo (el JSON del contrato tal cual lo produce validate.mjs::sellar()).
create table informes (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios(id) on delete cascade,
  caso_id text not null,
  contrato jsonb not null,
  modo text,
  oreja text,
  modelo_ia text,
  creado_en timestamptz not null default now()
);
create index informes_usuario_idx on informes(usuario_id);
create index informes_caso_id_idx on informes(caso_id);

-- Derivada de evaluacion_protocolo.puntos[] -- responde "puntos más propuestos/observados".
create table informes_puntos (
  id bigserial primary key,
  informe_id uuid not null references informes(id) on delete cascade,
  orden integer,
  nombre text not null,
  codigo_za text,
  categoria text,
  estado text check (estado in ('observado', 'propuesto')),
  sistema text
);
create index informes_puntos_informe_idx on informes_puntos(informe_id);
create index informes_puntos_sistema_idx on informes_puntos(sistema);
create index informes_puntos_nombre_idx on informes_puntos(nombre);

-- Derivada de hipotesis_diagnostica.sistemas[] -- "sistemas implicados" / "desequilibrio".
create table informes_sistemas (
  id bigserial primary key,
  informe_id uuid not null references informes(id) on delete cascade,
  sistema text not null,
  titulo text,
  confianza text
);
create index informes_sistemas_informe_idx on informes_sistemas(informe_id);
create index informes_sistemas_sistema_idx on informes_sistemas(sistema);

-- Foto original y PDF generado, ambos en OSS -- aquí solo se guarda la referencia (oss_key).
create table archivos (
  id bigserial primary key,
  informe_id uuid not null references informes(id) on delete cascade,
  tipo text not null check (tipo in ('foto', 'pdf')),
  oss_key text not null,
  creado_en timestamptz not null default now()
);
create index archivos_informe_idx on archivos(informe_id);

-- Estado del pago que desbloquea la descarga del PDF de un informe.
create table pagos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios(id) on delete cascade,
  informe_id uuid not null references informes(id) on delete cascade,
  proveedor text not null default 'wompi',
  referencia text not null unique,
  transaccion_id text,
  monto_centavos integer not null,
  moneda text not null default 'COP',
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aprobado', 'rechazado')),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index pagos_informe_idx on pagos(informe_id);
create index pagos_referencia_idx on pagos(referencia);
