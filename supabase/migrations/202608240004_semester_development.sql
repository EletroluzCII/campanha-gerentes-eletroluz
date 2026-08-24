-- Desenvolvimento pessoal passa a ser um indicador único do segundo semestre.

create table campaign_gerentes_2026.semester_development (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null unique references campaign_gerentes_2026.branches(id) on delete restrict,
  submitted_by uuid not null references auth.users(id) on delete restrict,
  development_books boolean not null default false,
  development_courses boolean not null default false,
  development_certifications boolean not null default false,
  development_events boolean not null default false,
  development_points numeric(5,2) not null default 0 check (development_points between 0 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table campaign_gerentes_2026.semester_development_evidence (
  id uuid primary key default gen_random_uuid(),
  development_id uuid not null references campaign_gerentes_2026.semester_development(id) on delete restrict,
  branch_id uuid not null references campaign_gerentes_2026.branches(id) on delete restrict,
  category text not null check (category in ('books', 'courses', 'certifications', 'events')),
  storage_path text not null unique check (char_length(storage_path) between 20 and 500),
  original_name text not null check (char_length(original_name) between 1 and 255),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  created_at timestamptz not null default now(),
  unique (development_id, category)
);

create index semester_development_evidence_development_idx
  on campaign_gerentes_2026.semester_development_evidence(development_id, category);

alter table campaign_gerentes_2026.semester_development enable row level security;
alter table campaign_gerentes_2026.semester_development_evidence enable row level security;

create policy "campaign managers read own semester development and admins read all"
  on campaign_gerentes_2026.semester_development for select to authenticated
  using (
    campaign_gerentes_2026.is_campaign_admin()
    or branch_id = (select branch_id from campaign_gerentes_2026.profiles where id = auth.uid())
  );

create policy "campaign managers read own semester evidence and admins read all"
  on campaign_gerentes_2026.semester_development_evidence for select to authenticated
  using (
    campaign_gerentes_2026.is_campaign_admin()
    or branch_id = (select branch_id from campaign_gerentes_2026.profiles where id = auth.uid())
  );

revoke all on campaign_gerentes_2026.semester_development from public, anon;
revoke all on campaign_gerentes_2026.semester_development_evidence from public, anon;
grant select on campaign_gerentes_2026.semester_development to authenticated;
grant select on campaign_gerentes_2026.semester_development_evidence to authenticated;
grant all on campaign_gerentes_2026.semester_development, campaign_gerentes_2026.semester_development_evidence to service_role;

-- Lançamentos existentes continuam íntegros, mas Desenvolvimento deixa de compor cada mês.
update campaign_gerentes_2026.metric_submissions
set development_books = false,
  development_courses = false,
  development_certifications = false,
  development_events = false,
  development_points = 0,
  total_points = round(obz_points + revenue_points + coalesce(discount_points, profitability_points), 2);

create or replace function campaign_gerentes_2026.submit_metrics(
  p_metric_period date,
  p_obz_percentage numeric,
  p_revenue_percentage numeric,
  p_discount_band text,
  p_discount_percentage numeric,
  p_profitability_percentage numeric,
  p_development_books boolean,
  p_development_courses boolean,
  p_development_certifications boolean,
  p_development_events boolean,
  p_evidence jsonb
)
returns campaign_gerentes_2026.metric_submissions
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_profile campaign_gerentes_2026.profiles;
  v_branch campaign_gerentes_2026.branches;
  v_submission campaign_gerentes_2026.metric_submissions;
  v_is_profitability boolean;
  v_obz_points numeric(5,2);
  v_revenue_points numeric(5,2);
  v_indicator_points numeric(5,2);
begin
  select * into v_profile from campaign_gerentes_2026.profiles where id = auth.uid();
  select * into v_branch from campaign_gerentes_2026.branches where id = v_profile.branch_id;

  if v_profile.id is null or v_profile.role <> 'manager' or v_profile.branch_id is null then
    raise exception 'Conta sem permissão para enviar métricas';
  end if;
  if p_metric_period is null or p_metric_period not in (
    date '2026-07-01', date '2026-08-01', date '2026-09-01', date '2026-10-01', date '2026-11-01', date '2026-12-01'
  ) then raise exception 'Período de campanha inválido'; end if;
  if p_obz_percentage is null or p_obz_percentage < 0 or p_obz_percentage > 999.99
    or p_revenue_percentage is null or p_revenue_percentage < 0 or p_revenue_percentage > 999.99 then
    raise exception 'Valores de métricas inválidos';
  end if;
  if coalesce(p_development_books, false) or coalesce(p_development_courses, false)
    or coalesce(p_development_certifications, false) or coalesce(p_development_events, false)
    or p_evidence is null or jsonb_typeof(p_evidence) <> 'array' or jsonb_array_length(p_evidence) <> 0 then
    raise exception 'Desenvolvimento pessoal deve ser enviado no indicador semestral';
  end if;

  v_is_profitability := v_branch.slug in ('exceleds', 'foco');
  if v_is_profitability then
    if p_profitability_percentage is null or p_profitability_percentage < 0 or p_profitability_percentage > 999.99
      or p_discount_band is not null or p_discount_percentage is not null then raise exception 'Valores de rentabilidade inválidos'; end if;
  elsif p_discount_percentage is null or p_discount_percentage < 0 or p_discount_percentage > 999.99
    or p_discount_band not in ('A', 'B') or p_profitability_percentage is not null then
    raise exception 'Valores de desconto inválidos';
  end if;

  v_obz_points := case when p_obz_percentage < 95 then 0 else least(20, round((p_obz_percentage / 100 * 20)::numeric, 2)) end;
  v_revenue_points := least(40, round((p_revenue_percentage / 100 * 40)::numeric, 2));
  v_indicator_points := case
    when v_is_profitability then least(35, round((p_profitability_percentage / 100 * 35)::numeric, 2))
    when p_discount_band = 'A' and p_discount_percentage <= 11.4 then 35
    when p_discount_band = 'B' and p_discount_percentage <= 19.52 then 35
    else 0
  end;

  insert into campaign_gerentes_2026.metric_submissions (
    branch_id, submitted_by, metric_period, metric_kind, obz_percentage, obz_points, revenue_percentage, revenue_points,
    discount_band, discount_percentage, discount_points, profitability_percentage, profitability_points,
    development_books, development_courses, development_certifications, development_events, development_points, total_points
  ) values (
    v_profile.branch_id, auth.uid(), p_metric_period, case when v_is_profitability then 'profitability' else 'discount' end,
    round(p_obz_percentage, 2), v_obz_points, round(p_revenue_percentage, 2), v_revenue_points,
    case when v_is_profitability then null else p_discount_band end,
    case when v_is_profitability then null else round(p_discount_percentage, 2) end,
    case when v_is_profitability then null else v_indicator_points end,
    case when v_is_profitability then round(p_profitability_percentage, 2) else null end,
    case when v_is_profitability then v_indicator_points else null end,
    false, false, false, false, 0, round(v_obz_points + v_revenue_points + v_indicator_points, 2)
  ) on conflict (branch_id, metric_period) do update set
    submitted_by = auth.uid(), metric_kind = excluded.metric_kind,
    obz_percentage = excluded.obz_percentage, obz_points = excluded.obz_points,
    revenue_percentage = excluded.revenue_percentage, revenue_points = excluded.revenue_points,
    discount_band = excluded.discount_band, discount_percentage = excluded.discount_percentage, discount_points = excluded.discount_points,
    profitability_percentage = excluded.profitability_percentage, profitability_points = excluded.profitability_points,
    development_books = false, development_courses = false, development_certifications = false, development_events = false,
    development_points = 0, total_points = excluded.total_points, created_at = now()
  returning * into v_submission;
  return v_submission;
end;
$$;

create or replace function campaign_gerentes_2026.submit_semester_development(
  p_development_books boolean,
  p_development_courses boolean,
  p_development_certifications boolean,
  p_development_events boolean,
  p_evidence jsonb
)
returns campaign_gerentes_2026.semester_development
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_profile campaign_gerentes_2026.profiles;
  v_existing campaign_gerentes_2026.semester_development;
  v_development campaign_gerentes_2026.semester_development;
  v_item jsonb;
  v_category text;
  v_path text;
  v_original_name text;
  v_mime_type text;
  v_size_bytes bigint;
  v_new_batch_id text;
  v_categories text[] := array[]::text[];
  v_paths text[] := array[]::text[];
  v_books boolean := false;
  v_courses boolean := false;
  v_certifications boolean := false;
  v_events boolean := false;
  v_object_metadata jsonb;
begin
  select * into v_profile from campaign_gerentes_2026.profiles where id = auth.uid();
  if v_profile.id is null or v_profile.role <> 'manager' or v_profile.branch_id is null then
    raise exception 'Conta sem permissão para registrar desenvolvimento';
  end if;
  if p_evidence is null or jsonb_typeof(p_evidence) <> 'array' or jsonb_array_length(p_evidence) > 4 then
    raise exception 'Lista de comprovantes inválida';
  end if;
  select * into v_existing from campaign_gerentes_2026.semester_development where branch_id = v_profile.branch_id for update;

  for v_item in select value from jsonb_array_elements(p_evidence) loop
    v_category := v_item->>'category';
    v_path := v_item->>'storage_path';
    v_original_name := left(regexp_replace(coalesce(v_item->>'original_name', ''), '[[:cntrl:]/\\]', '_', 'g'), 255);
    v_mime_type := v_item->>'mime_type';
    v_size_bytes := coalesce((v_item->>'size_bytes')::bigint, 0);
    if v_category not in ('books', 'courses', 'certifications', 'events') or v_category = any(v_categories) then raise exception 'Categoria de comprovante inválida ou duplicada'; end if;
    if v_path is null or split_part(v_path, '/', 1) <> auth.uid()::text or split_part(v_path, '/', 2) = ''
      or split_part(v_path, '/', 3) <> 'semester-development' or split_part(v_path, '/', 4) <> v_category then raise exception 'Caminho de comprovante inválido'; end if;
    if v_original_name = '' or v_mime_type not in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf') or v_size_bytes < 1 or v_size_bytes > 10485760 then raise exception 'Metadados do comprovante inválidos'; end if;
    select o.metadata into v_object_metadata from storage.objects o where o.bucket_id = 'campaign-gerentes-2026-evidence' and o.name = v_path;
    if v_object_metadata is null or coalesce(v_object_metadata->>'mimetype', v_mime_type) <> v_mime_type or coalesce((v_object_metadata->>'size')::bigint, v_size_bytes) <> v_size_bytes then raise exception 'O arquivo armazenado não corresponde aos metadados enviados'; end if;
    if not exists (select 1 from campaign_gerentes_2026.semester_development_evidence se where se.development_id = v_existing.id and se.storage_path = v_path) then
      if v_new_batch_id is null then v_new_batch_id := split_part(v_path, '/', 2);
      elsif v_new_batch_id <> split_part(v_path, '/', 2) then raise exception 'Os novos comprovantes devem pertencer ao mesmo lote'; end if;
    end if;
    if exists (select 1 from campaign_gerentes_2026.semester_development_evidence se where se.storage_path = v_path and (v_existing.id is null or se.development_id <> v_existing.id)) then raise exception 'Comprovante já utilizado em outro registro'; end if;
    v_categories := array_append(v_categories, v_category);
    v_paths := array_append(v_paths, v_path);
    v_books := v_books or v_category = 'books'; v_courses := v_courses or v_category = 'courses';
    v_certifications := v_certifications or v_category = 'certifications'; v_events := v_events or v_category = 'events';
  end loop;
  if coalesce(p_development_books, false) <> v_books or coalesce(p_development_courses, false) <> v_courses
    or coalesce(p_development_certifications, false) <> v_certifications or coalesce(p_development_events, false) <> v_events then raise exception 'Toda iniciativa selecionada precisa de um comprovante'; end if;

  insert into campaign_gerentes_2026.semester_development (
    branch_id, submitted_by, development_books, development_courses, development_certifications, development_events, development_points
  ) values (
    v_profile.branch_id, auth.uid(), v_books, v_courses, v_certifications, v_events, least(5, round(cardinality(v_categories)::numeric / 3 * 5, 2))
  ) on conflict (branch_id) do update set
    submitted_by = auth.uid(), development_books = excluded.development_books, development_courses = excluded.development_courses,
    development_certifications = excluded.development_certifications, development_events = excluded.development_events,
    development_points = excluded.development_points, updated_at = now()
  returning * into v_development;

  if v_existing.id is not null then
    with removed as (
      delete from campaign_gerentes_2026.semester_development_evidence
      where development_id = v_existing.id and not (storage_path = any(v_paths)) returning storage_path
    ) delete from storage.objects where bucket_id = 'campaign-gerentes-2026-evidence' and name in (select storage_path from removed);
  end if;
  for v_item in select value from jsonb_array_elements(p_evidence) loop
    insert into campaign_gerentes_2026.semester_development_evidence (
      development_id, branch_id, category, storage_path, original_name, mime_type, size_bytes
    ) values (
      v_development.id, v_profile.branch_id, v_item->>'category', v_item->>'storage_path',
      left(regexp_replace(v_item->>'original_name', '[[:cntrl:]/\\]', '_', 'g'), 255), v_item->>'mime_type', (v_item->>'size_bytes')::bigint
    ) on conflict (development_id, category) do update set storage_path = excluded.storage_path, original_name = excluded.original_name,
      mime_type = excluded.mime_type, size_bytes = excluded.size_bytes, created_at = now();
  end loop;
  return v_development;
end;
$$;

create or replace function campaign_gerentes_2026.get_campaign_ranking(p_metric_period date default null)
returns table (branch_id uuid, branch_name text, total_points numeric, updated_at timestamptz, rank_position bigint, periods_count bigint)
language plpgsql stable security definer set search_path = pg_catalog
as $$
begin
  if not campaign_gerentes_2026.has_campaign_profile() then raise exception 'Acesso não autorizado'; end if;
  if p_metric_period is not null and p_metric_period not in (date '2026-07-01', date '2026-08-01', date '2026-09-01', date '2026-10-01', date '2026-11-01', date '2026-12-01') then raise exception 'Período de campanha inválido'; end if;
  return query
  with aggregated as (
    select ms.branch_id, avg(ms.total_points) as operational_points, avg(ms.revenue_points) as revenue_points,
      avg(coalesce(ms.discount_points, ms.profitability_points)) as indicator_points, avg(ms.obz_points) as obz_points,
      max(ms.created_at) as updated_at, count(*) as periods_count
    from campaign_gerentes_2026.metric_submissions ms where p_metric_period is null or ms.metric_period = p_metric_period group by ms.branch_id
  ), scored as (
    select b.id as branch_id, b.name as branch_name,
      case when a.branch_id is null then null when p_metric_period is null then a.operational_points + coalesce(sd.development_points, 0) else a.operational_points end as total_points,
      case when p_metric_period is null then greatest(a.updated_at, sd.updated_at) else a.updated_at end as updated_at,
      a.periods_count, a.revenue_points, a.indicator_points, a.obz_points, b.display_order
    from campaign_gerentes_2026.branches b left join aggregated a on a.branch_id = b.id
      left join campaign_gerentes_2026.semester_development sd on sd.branch_id = b.id where b.is_active
  ), ranked as (
    select *, case when total_points is null then null else row_number() over (order by total_points desc, revenue_points desc, indicator_points desc, obz_points desc, updated_at asc, display_order asc) end as rank_position from scored
  ) select branch_id, branch_name, total_points, updated_at, rank_position, coalesce(periods_count, 0) from ranked order by rank_position asc nulls last, display_order asc;
end;
$$;

drop function campaign_gerentes_2026.get_admin_latest_metrics(date);
create function campaign_gerentes_2026.get_admin_latest_metrics(p_metric_period date default null)
returns table (branch_id uuid, branch_name text, metric_kind text, obz_percentage numeric, revenue_percentage numeric, discount_band text, discount_percentage numeric, profitability_percentage numeric, development_points numeric, total_points numeric, updated_at timestamptz, periods_count bigint)
language plpgsql stable security definer set search_path = pg_catalog
as $$
begin
  if not campaign_gerentes_2026.is_campaign_admin() then raise exception 'Acesso restrito ao administrador'; end if;
  if p_metric_period is not null and p_metric_period not in (date '2026-07-01', date '2026-08-01', date '2026-09-01', date '2026-10-01', date '2026-11-01', date '2026-12-01') then raise exception 'Período de campanha inválido'; end if;
  return query
  select ms.branch_id, b.name, max(ms.metric_kind), avg(ms.obz_percentage), avg(ms.revenue_percentage), max(ms.discount_band), avg(ms.discount_percentage), avg(ms.profitability_percentage),
    case when p_metric_period is null then coalesce(max(sd.development_points), 0) else 0 end,
    avg(ms.total_points) + case when p_metric_period is null then coalesce(max(sd.development_points), 0) else 0 end,
    case when p_metric_period is null then greatest(max(ms.created_at), max(sd.updated_at)) else max(ms.created_at) end, count(*)
  from campaign_gerentes_2026.metric_submissions ms join campaign_gerentes_2026.branches b on b.id = ms.branch_id
    left join campaign_gerentes_2026.semester_development sd on sd.branch_id = ms.branch_id
  where p_metric_period is null or ms.metric_period = p_metric_period group by ms.branch_id, b.name order by b.name;
end;
$$;

create or replace function campaign_gerentes_2026.get_admin_semester_development()
returns table (development_id uuid, branch_id uuid, branch_name text, development_points numeric, initiatives bigint, evidence_count bigint, updated_at timestamptz)
language plpgsql stable security definer set search_path = pg_catalog
as $$
begin
  if not campaign_gerentes_2026.is_campaign_admin() then raise exception 'Acesso restrito ao administrador'; end if;
  return query select sd.id, b.id, b.name, sd.development_points,
    (coalesce(sd.development_books, false)::int + coalesce(sd.development_courses, false)::int + coalesce(sd.development_certifications, false)::int + coalesce(sd.development_events, false)::int)::bigint,
    count(sde.id), sd.updated_at
  from campaign_gerentes_2026.branches b left join campaign_gerentes_2026.semester_development sd on sd.branch_id = b.id
    left join campaign_gerentes_2026.semester_development_evidence sde on sde.development_id = sd.id
  where b.is_active group by b.id, b.name, b.display_order, sd.id order by b.display_order;
end;
$$;

revoke all on function campaign_gerentes_2026.submit_semester_development(boolean, boolean, boolean, boolean, jsonb) from public, anon;
grant execute on function campaign_gerentes_2026.submit_semester_development(boolean, boolean, boolean, boolean, jsonb) to authenticated;
grant execute on function campaign_gerentes_2026.get_campaign_ranking(date), campaign_gerentes_2026.get_admin_latest_metrics(date), campaign_gerentes_2026.get_admin_semester_development() to authenticated;
