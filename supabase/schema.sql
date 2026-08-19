-- TAI Tests — esquema Supabase (PostgreSQL)
-- Ejecutar en Supabase Studio → SQL Editor → New query → Run.
-- Es idempotente: se puede volver a lanzar tras actualizar contenidos sin perder progreso.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- temas
create table if not exists public.temas (
  id          text primary key,
  nombre      text not null,
  descripcion text not null default '',
  orden       int  not null default 0,
  creado      timestamptz not null default now()
);

-- ------------------------------------------------------------ preguntas
-- El id es determinista (hash del enunciado) para que reimportar un pack
-- actualice la pregunta en vez de duplicarla, conservando el progreso.
create table if not exists public.preguntas (
  id          text primary key,
  tema_id     text not null references public.temas(id) on delete cascade,
  enunciado   text not null,
  opciones    jsonb not null,
  correcta    smallint not null check (correcta between 0 and 3),
  explicacion text not null default '',
  fuente      text not null default '',
  creado      timestamptz not null default now(),
  constraint opciones_son_cuatro check (jsonb_array_length(opciones) = 4)
);

create index if not exists preguntas_tema_idx on public.preguntas (tema_id);

-- ------------------------------------------------------------- progreso
create table if not exists public.progreso (
  user_id          uuid not null references auth.users(id) on delete cascade,
  pregunta_id      text not null references public.preguntas(id) on delete cascade,
  aciertos         int  not null default 0,
  fallos           int  not null default 0,
  nivel            int  not null default 0,
  ultimo_resultado boolean,
  proxima_revision date not null default current_date,
  actualizado      timestamptz not null default now(),
  primary key (user_id, pregunta_id)
);

create index if not exists progreso_revision_idx
  on public.progreso (user_id, proxima_revision);

-- -------------------------------------------------------------- sesiones
create table if not exists public.sesiones (
  user_id     uuid not null references auth.users(id) on delete cascade,
  fecha       date not null default current_date,
  segundos    int  not null default 0,
  respondidas int  not null default 0,
  aciertos    int  not null default 0,
  primary key (user_id, fecha)
);

-- ------------------------------------------------------------------ RLS
alter table public.temas     enable row level security;
alter table public.preguntas enable row level security;
alter table public.progreso  enable row level security;
alter table public.sesiones  enable row level security;

-- Catálogo compartido: cualquier usuario autenticado lee y aporta contenido.
drop policy if exists temas_rw on public.temas;
create policy temas_rw on public.temas
  for all to authenticated using (true) with check (true);

drop policy if exists preguntas_rw on public.preguntas;
create policy preguntas_rw on public.preguntas
  for all to authenticated using (true) with check (true);

-- Progreso y sesiones: estrictamente privados por usuario.
drop policy if exists progreso_propio on public.progreso;
create policy progreso_propio on public.progreso
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists sesiones_propias on public.sesiones;
create policy sesiones_propias on public.sesiones
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
