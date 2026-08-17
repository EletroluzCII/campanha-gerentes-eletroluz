-- Campanha de premiação dos gerentes Eletroluz.
-- Todos os objetos relacionais ficam isolados do sistema Morpheus.

create extension if not exists pgcrypto;
create schema if not exists campaign_gerentes_2026;

revoke all on schema campaign_gerentes_2026 from public, anon;
grant usage on schema campaign_gerentes_2026 to authenticated, service_role;

create table campaign_gerentes_2026.branches (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9_]+$'),
  name text not null unique,
  display_order smallint not null unique check (display_order between 1 and 99),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table campaign_gerentes_2026.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  branch_id uuid references campaign_gerentes_2026.branches(id) on delete restrict,
  role text not null check (role in ('manager', 'admin')),
  display_name text not null check (char_length(display_name) between 2 and 120),
  created_at timestamptz not null default now(),
  constraint profile_role_branch_check check (
    (role = 'manager' and branch_id is not null)
    or (role = 'admin' and branch_id is null)
  )
);

create unique index one_initial_manager_per_branch
  on campaign_gerentes_2026.profiles(branch_id)
  where role = 'manager';

create table campaign_gerentes_2026.metric_submissions (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references campaign_gerentes_2026.branches(id) on delete restrict,
  submitted_by uuid not null references auth.users(id) on delete restrict,
  obz_percentage numeric(6,2) not null check (obz_percentage between 0 and 999.99),
  obz_points numeric(5,2) not null check (obz_points between 0 and 20),
  revenue_percentage numeric(6,2) not null check (revenue_percentage between 0 and 999.99),
  revenue_points numeric(5,2) not null check (revenue_points between 0 and 40),
  discount_band text not null check (discount_band in ('A', 'B')),
  discount_percentage numeric(6,2) not null check (discount_percentage between 0 and 999.99),
  discount_points numeric(5,2) not null check (discount_points between 0 and 35),
  development_books boolean not null default false,
  development_courses boolean not null default false,
  development_certifications boolean not null default false,
  development_events boolean not null default false,
  development_points numeric(5,2) not null check (development_points between 0 and 5),
  total_points numeric(5,2) not null check (total_points between 0 and 100),
  created_at timestamptz not null default now()
);

create index metric_submissions_branch_created_idx
  on campaign_gerentes_2026.metric_submissions(branch_id, created_at desc, id desc);

insert into campaign_gerentes_2026.branches (slug, name, display_order) values
  ('matriz_maringa', 'Eletroluz Matriz Maringá', 1),
  ('express_maringa', 'Eletroluz Express Maringá', 2),
  ('sarandi', 'Eletroluz Sarandi', 3),
  ('campo_mourao', 'Eletroluz Campo Mourão', 4),
  ('apucarana', 'Eletroluz Apucarana', 5),
  ('cianorte', 'Eletroluz Cianorte', 6),
  ('umuarama', 'Eletroluz Umuarama', 7),
  ('londrina', 'Eletroluz Londrina', 8),
  ('ponta_grossa', 'Eletroluz Ponta Grossa', 9),
  ('presidente_prudente', 'Eletroluz Presidente Prudente', 10),
  ('exceleds', 'Exceleds Iluminação', 11),
  ('foco', 'FOCO Distribuidora', 12)
on conflict (slug) do update set
  name = excluded.name,
  display_order = excluded.display_order,
  is_active = true;

create or replace function campaign_gerentes_2026.is_campaign_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1 from campaign_gerentes_2026.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function campaign_gerentes_2026.has_campaign_profile()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1 from campaign_gerentes_2026.profiles where id = auth.uid()
  );
$$;

alter table campaign_gerentes_2026.branches enable row level security;
alter table campaign_gerentes_2026.profiles enable row level security;
alter table campaign_gerentes_2026.metric_submissions enable row level security;

create policy "campaign users read active branches"
  on campaign_gerentes_2026.branches for select to authenticated
  using (is_active and campaign_gerentes_2026.has_campaign_profile());

create policy "campaign users read own profile or admins read all"
  on campaign_gerentes_2026.profiles for select to authenticated
  using (id = auth.uid() or campaign_gerentes_2026.is_campaign_admin());

create policy "campaign managers read own history and admins read all"
  on campaign_gerentes_2026.metric_submissions for select to authenticated
  using (
    campaign_gerentes_2026.is_campaign_admin()
    or branch_id = (
      select p.branch_id
      from campaign_gerentes_2026.profiles p
      where p.id = auth.uid()
    )
  );

-- Não há policies de UPDATE ou DELETE. O histórico é imutável pela API.

create or replace function campaign_gerentes_2026.submit_metrics(
  p_obz_percentage numeric,
  p_revenue_percentage numeric,
  p_discount_band text,
  p_discount_percentage numeric,
  p_development_books boolean,
  p_development_courses boolean,
  p_development_certifications boolean,
  p_development_events boolean
)
returns campaign_gerentes_2026.metric_submissions
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_profile campaign_gerentes_2026.profiles;
  v_obz_points numeric(5,2);
  v_revenue_points numeric(5,2);
  v_discount_points numeric(5,2);
  v_development_points numeric(5,2);
  v_initiatives integer;
  v_submission campaign_gerentes_2026.metric_submissions;
begin
  select * into v_profile
  from campaign_gerentes_2026.profiles
  where id = auth.uid();

  if v_profile.id is null or v_profile.role <> 'manager' or v_profile.branch_id is null then
    raise exception 'Conta sem permissão para enviar métricas';
  end if;

  if p_obz_percentage is null or p_obz_percentage < 0 or p_obz_percentage > 999.99
    or p_revenue_percentage is null or p_revenue_percentage < 0 or p_revenue_percentage > 999.99
    or p_discount_percentage is null or p_discount_percentage < 0 or p_discount_percentage > 999.99
    or p_discount_band not in ('A', 'B') then
    raise exception 'Valores de métricas inválidos';
  end if;

  v_obz_points := case
    when p_obz_percentage < 95 then 0
    else least(20, round((p_obz_percentage / 100 * 20)::numeric, 2))
  end;
  v_revenue_points := least(40, round((p_revenue_percentage / 100 * 40)::numeric, 2));
  v_discount_points := case
    when p_discount_band = 'A' and p_discount_percentage <= 11.4 then 35
    when p_discount_band = 'B' and p_discount_percentage <= 19.52 then 35
    else 0
  end;
  v_initiatives :=
    p_development_books::integer
    + p_development_courses::integer
    + p_development_certifications::integer
    + p_development_events::integer;
  v_development_points := least(5, round((v_initiatives::numeric / 3 * 5), 2));

  insert into campaign_gerentes_2026.metric_submissions (
    branch_id, submitted_by, obz_percentage, obz_points,
    revenue_percentage, revenue_points, discount_band,
    discount_percentage, discount_points, development_books,
    development_courses, development_certifications, development_events,
    development_points, total_points
  ) values (
    v_profile.branch_id, auth.uid(), round(p_obz_percentage, 2), v_obz_points,
    round(p_revenue_percentage, 2), v_revenue_points, p_discount_band,
    round(p_discount_percentage, 2), v_discount_points, p_development_books,
    p_development_courses, p_development_certifications, p_development_events,
    v_development_points,
    round(v_obz_points + v_revenue_points + v_discount_points + v_development_points, 2)
  ) returning * into v_submission;

  return v_submission;
end;
$$;

create or replace function campaign_gerentes_2026.get_campaign_ranking()
returns table (
  branch_id uuid,
  branch_name text,
  total_points numeric,
  updated_at timestamptz,
  rank_position bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
begin
  if not campaign_gerentes_2026.has_campaign_profile() then
    raise exception 'Acesso não autorizado';
  end if;

  return query
  with latest as (
    select distinct on (ms.branch_id)
      ms.branch_id, ms.total_points, ms.revenue_points,
      ms.discount_points, ms.obz_points, ms.created_at, ms.id
    from campaign_gerentes_2026.metric_submissions ms
    order by ms.branch_id, ms.created_at desc, ms.id desc
  ), ranked as (
    select
      b.id as branch_id,
      b.name as branch_name,
      l.total_points,
      l.created_at as updated_at,
      case when l.id is null then null else
        row_number() over (
          order by l.total_points desc nulls last,
            l.revenue_points desc nulls last,
            l.discount_points desc nulls last,
            l.obz_points desc nulls last,
            l.created_at asc nulls last,
            b.display_order asc
        )
      end as rank_position,
      b.display_order
    from campaign_gerentes_2026.branches b
    left join latest l on l.branch_id = b.id
    where b.is_active
  )
  select r.branch_id, r.branch_name, r.total_points, r.updated_at, r.rank_position
  from ranked r
  order by r.rank_position asc nulls last, r.display_order asc;
end;
$$;

create or replace function campaign_gerentes_2026.get_admin_latest_metrics()
returns table (
  branch_id uuid,
  branch_name text,
  obz_percentage numeric,
  revenue_percentage numeric,
  discount_band text,
  discount_percentage numeric,
  development_points numeric,
  total_points numeric,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
begin
  if not campaign_gerentes_2026.is_campaign_admin() then
    raise exception 'Acesso restrito ao administrador';
  end if;

  return query
  select distinct on (ms.branch_id)
    ms.branch_id, b.name, ms.obz_percentage, ms.revenue_percentage,
    ms.discount_band, ms.discount_percentage, ms.development_points,
    ms.total_points, ms.created_at
  from campaign_gerentes_2026.metric_submissions ms
  join campaign_gerentes_2026.branches b on b.id = ms.branch_id
  order by ms.branch_id, ms.created_at desc, ms.id desc;
end;
$$;

revoke all on all tables in schema campaign_gerentes_2026 from public, anon;
revoke insert, update, delete, truncate, references, trigger
  on all tables in schema campaign_gerentes_2026 from authenticated;
grant select on all tables in schema campaign_gerentes_2026 to authenticated;
grant all on all tables in schema campaign_gerentes_2026 to service_role;

revoke all on function campaign_gerentes_2026.is_campaign_admin() from public, anon;
revoke all on function campaign_gerentes_2026.has_campaign_profile() from public, anon;
revoke all on function campaign_gerentes_2026.submit_metrics(numeric, numeric, text, numeric, boolean, boolean, boolean, boolean) from public, anon;
revoke all on function campaign_gerentes_2026.get_campaign_ranking() from public, anon;
revoke all on function campaign_gerentes_2026.get_admin_latest_metrics() from public, anon;

grant execute on function campaign_gerentes_2026.is_campaign_admin() to authenticated;
grant execute on function campaign_gerentes_2026.has_campaign_profile() to authenticated;
grant execute on function campaign_gerentes_2026.submit_metrics(numeric, numeric, text, numeric, boolean, boolean, boolean, boolean) to authenticated;
grant execute on function campaign_gerentes_2026.get_campaign_ranking() to authenticated;
grant execute on function campaign_gerentes_2026.get_admin_latest_metrics() to authenticated;
