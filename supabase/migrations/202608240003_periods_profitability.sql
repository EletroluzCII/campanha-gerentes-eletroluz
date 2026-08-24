-- Lançamentos mensais (julho a dezembro de 2026) e rentabilidade para Exceleds/FOCO.

alter table campaign_gerentes_2026.metric_submissions
  add column metric_period date;

-- A campanha ainda não possui lançamentos em produção. O preenchimento abaixo mantém
-- a migration segura caso um ambiente de teste contenha registros anteriores.
update campaign_gerentes_2026.metric_submissions
set metric_period = date '2026-07-01'
where metric_period is null;

alter table campaign_gerentes_2026.metric_submissions
  alter column metric_period set not null,
  add constraint metric_submissions_period_check check (
    metric_period in (
      date '2026-07-01', date '2026-08-01', date '2026-09-01',
      date '2026-10-01', date '2026-11-01', date '2026-12-01'
    )
  ),
  add constraint metric_submissions_branch_period_key unique (branch_id, metric_period),
  add column metric_kind text not null default 'discount' check (metric_kind in ('discount', 'profitability')),
  add column profitability_percentage numeric(6,2),
  add column profitability_points numeric(5,2);

alter table campaign_gerentes_2026.metric_submissions
  alter column discount_band drop not null,
  alter column discount_percentage drop not null,
  alter column discount_points drop not null;

alter table campaign_gerentes_2026.metric_submissions
  add constraint metric_submissions_indicator_check check (
    (metric_kind = 'discount'
      and discount_band in ('A', 'B')
      and discount_percentage is not null
      and discount_points is not null
      and profitability_percentage is null
      and profitability_points is null)
    or
    (metric_kind = 'profitability'
      and discount_band is null
      and discount_percentage is null
      and discount_points is null
      and profitability_percentage between 0 and 999.99
      and profitability_points between 0 and 35)
  );

create index metric_submissions_period_idx
  on campaign_gerentes_2026.metric_submissions(metric_period, branch_id);

drop function campaign_gerentes_2026.submit_metrics(
  numeric, numeric, text, numeric, boolean, boolean, boolean, boolean, jsonb
);

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
  v_existing campaign_gerentes_2026.metric_submissions;
  v_submission campaign_gerentes_2026.metric_submissions;
  v_is_profitability boolean;
  v_obz_points numeric(5,2);
  v_revenue_points numeric(5,2);
  v_indicator_points numeric(5,2);
  v_development_points numeric(5,2);
  v_initiatives integer := 0;
  v_item jsonb;
  v_category text;
  v_path text;
  v_original_name text;
  v_mime_type text;
  v_size_bytes bigint;
  v_batch_id text := null;
  v_categories text[] := array[]::text[];
  v_paths text[] := array[]::text[];
  v_object_metadata jsonb;
  v_books boolean := false;
  v_courses boolean := false;
  v_certifications boolean := false;
  v_events boolean := false;
begin
  select * into v_profile
  from campaign_gerentes_2026.profiles
  where id = auth.uid();

  select * into v_branch
  from campaign_gerentes_2026.branches
  where id = v_profile.branch_id;

  if v_profile.id is null or v_profile.role <> 'manager' or v_profile.branch_id is null then
    raise exception 'Conta sem permissão para enviar métricas';
  end if;

  if p_metric_period is null or p_metric_period not in (
    date '2026-07-01', date '2026-08-01', date '2026-09-01',
    date '2026-10-01', date '2026-11-01', date '2026-12-01'
  ) then
    raise exception 'Período de campanha inválido';
  end if;

  if p_obz_percentage is null or p_obz_percentage < 0 or p_obz_percentage > 999.99
    or p_revenue_percentage is null or p_revenue_percentage < 0 or p_revenue_percentage > 999.99 then
    raise exception 'Valores de métricas inválidos';
  end if;

  v_is_profitability := v_branch.slug in ('exceleds', 'foco');
  if v_is_profitability then
    if p_profitability_percentage is null or p_profitability_percentage < 0 or p_profitability_percentage > 999.99
      or p_discount_band is not null or p_discount_percentage is not null then
      raise exception 'Valores de rentabilidade inválidos';
    end if;
  elsif p_discount_percentage is null or p_discount_percentage < 0 or p_discount_percentage > 999.99
    or p_discount_band not in ('A', 'B') or p_profitability_percentage is not null then
    raise exception 'Valores de desconto inválidos';
  end if;

  if p_evidence is null or jsonb_typeof(p_evidence) <> 'array' or jsonb_array_length(p_evidence) > 4 then
    raise exception 'Lista de comprovantes inválida';
  end if;

  select * into v_existing
  from campaign_gerentes_2026.metric_submissions
  where branch_id = v_profile.branch_id and metric_period = p_metric_period
  for update;

  for v_item in select value from jsonb_array_elements(p_evidence)
  loop
    v_category := v_item->>'category';
    v_path := v_item->>'storage_path';
    v_original_name := left(regexp_replace(coalesce(v_item->>'original_name', ''), '[[:cntrl:]/\\]', '_', 'g'), 255);
    v_mime_type := v_item->>'mime_type';
    v_size_bytes := coalesce((v_item->>'size_bytes')::bigint, 0);

    if v_category not in ('books', 'courses', 'certifications', 'events')
      or v_category = any(v_categories) then
      raise exception 'Categoria de comprovante inválida ou duplicada';
    end if;

    if v_path is null
      or split_part(v_path, '/', 1) <> auth.uid()::text
      or split_part(v_path, '/', 2) = ''
      or split_part(v_path, '/', 3) <> v_category then
      raise exception 'Caminho de comprovante inválido';
    end if;

    if not exists (
      select 1 from campaign_gerentes_2026.submission_evidence se
      where se.submission_id = v_existing.id and se.storage_path = v_path
    ) then
      if v_batch_id is null then
        v_batch_id := split_part(v_path, '/', 2);
      elsif v_batch_id <> split_part(v_path, '/', 2) then
        raise exception 'Os novos comprovantes devem pertencer ao mesmo lote';
      end if;
    end if;

    if v_original_name = ''
      or v_mime_type not in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
      or v_size_bytes < 1 or v_size_bytes > 10485760 then
      raise exception 'Metadados do comprovante inválidos';
    end if;

    select o.metadata into v_object_metadata
    from storage.objects o
    where o.bucket_id = 'campaign-gerentes-2026-evidence' and o.name = v_path;

    if v_object_metadata is null then
      raise exception 'Comprovante não encontrado no armazenamento';
    end if;

    if coalesce(v_object_metadata->>'mimetype', v_mime_type) <> v_mime_type
      or coalesce((v_object_metadata->>'size')::bigint, v_size_bytes) <> v_size_bytes then
      raise exception 'O arquivo armazenado não corresponde aos metadados enviados';
    end if;

    if exists (
      select 1 from campaign_gerentes_2026.submission_evidence se
      where se.storage_path = v_path
        and (v_existing.id is null or se.submission_id <> v_existing.id)
    ) then
      raise exception 'Comprovante já utilizado em outro lançamento';
    end if;

    v_categories := array_append(v_categories, v_category);
    v_paths := array_append(v_paths, v_path);
    v_books := v_books or v_category = 'books';
    v_courses := v_courses or v_category = 'courses';
    v_certifications := v_certifications or v_category = 'certifications';
    v_events := v_events or v_category = 'events';
  end loop;

  if coalesce(p_development_books, false) <> v_books
    or coalesce(p_development_courses, false) <> v_courses
    or coalesce(p_development_certifications, false) <> v_certifications
    or coalesce(p_development_events, false) <> v_events then
    raise exception 'Toda iniciativa selecionada precisa de um comprovante';
  end if;

  v_initiatives := cardinality(v_categories);
  v_obz_points := case when p_obz_percentage < 95 then 0 else least(20, round((p_obz_percentage / 100 * 20)::numeric, 2)) end;
  v_revenue_points := least(40, round((p_revenue_percentage / 100 * 40)::numeric, 2));
  v_indicator_points := case
    when v_is_profitability then least(35, round((p_profitability_percentage / 100 * 35)::numeric, 2))
    when p_discount_band = 'A' and p_discount_percentage <= 11.4 then 35
    when p_discount_band = 'B' and p_discount_percentage <= 19.52 then 35
    else 0
  end;
  v_development_points := least(5, round((v_initiatives::numeric / 3 * 5), 2));

  if v_existing.id is null then
    insert into campaign_gerentes_2026.metric_submissions (
      branch_id, submitted_by, metric_period, metric_kind,
      obz_percentage, obz_points, revenue_percentage, revenue_points,
      discount_band, discount_percentage, discount_points,
      profitability_percentage, profitability_points,
      development_books, development_courses, development_certifications, development_events,
      development_points, total_points
    ) values (
      v_profile.branch_id, auth.uid(), p_metric_period,
      case when v_is_profitability then 'profitability' else 'discount' end,
      round(p_obz_percentage, 2), v_obz_points, round(p_revenue_percentage, 2), v_revenue_points,
      case when v_is_profitability then null else p_discount_band end,
      case when v_is_profitability then null else round(p_discount_percentage, 2) end,
      case when v_is_profitability then null else v_indicator_points end,
      case when v_is_profitability then round(p_profitability_percentage, 2) else null end,
      case when v_is_profitability then v_indicator_points else null end,
      v_books, v_courses, v_certifications, v_events, v_development_points,
      round(v_obz_points + v_revenue_points + v_indicator_points + v_development_points, 2)
    ) returning * into v_submission;
  else
    with removed as (
      delete from campaign_gerentes_2026.submission_evidence
      where submission_id = v_existing.id
        and not (storage_path = any(v_paths))
      returning storage_path
    )
    delete from storage.objects
    where bucket_id = 'campaign-gerentes-2026-evidence'
      and name in (select storage_path from removed);

    update campaign_gerentes_2026.metric_submissions
    set submitted_by = auth.uid(), metric_kind = case when v_is_profitability then 'profitability' else 'discount' end,
      obz_percentage = round(p_obz_percentage, 2), obz_points = v_obz_points,
      revenue_percentage = round(p_revenue_percentage, 2), revenue_points = v_revenue_points,
      discount_band = case when v_is_profitability then null else p_discount_band end,
      discount_percentage = case when v_is_profitability then null else round(p_discount_percentage, 2) end,
      discount_points = case when v_is_profitability then null else v_indicator_points end,
      profitability_percentage = case when v_is_profitability then round(p_profitability_percentage, 2) else null end,
      profitability_points = case when v_is_profitability then v_indicator_points else null end,
      development_books = v_books, development_courses = v_courses,
      development_certifications = v_certifications, development_events = v_events,
      development_points = v_development_points,
      total_points = round(v_obz_points + v_revenue_points + v_indicator_points + v_development_points, 2),
      created_at = now()
    where id = v_existing.id
    returning * into v_submission;
  end if;

  for v_item in select value from jsonb_array_elements(p_evidence)
  loop
    insert into campaign_gerentes_2026.submission_evidence (
      submission_id, branch_id, category, storage_path, original_name, mime_type, size_bytes
    ) values (
      v_submission.id, v_profile.branch_id, v_item->>'category', v_item->>'storage_path',
      left(regexp_replace(v_item->>'original_name', '[[:cntrl:]/\\]', '_', 'g'), 255),
      v_item->>'mime_type', (v_item->>'size_bytes')::bigint
    ) on conflict (submission_id, category) do update set
      storage_path = excluded.storage_path,
      original_name = excluded.original_name,
      mime_type = excluded.mime_type,
      size_bytes = excluded.size_bytes,
      created_at = now();
  end loop;

  return v_submission;
end;
$$;

drop function campaign_gerentes_2026.get_campaign_ranking();

create or replace function campaign_gerentes_2026.get_campaign_ranking(p_metric_period date default null)
returns table (
  branch_id uuid,
  branch_name text,
  total_points numeric,
  updated_at timestamptz,
  rank_position bigint,
  periods_count bigint
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

  if p_metric_period is not null and p_metric_period not in (
    date '2026-07-01', date '2026-08-01', date '2026-09-01',
    date '2026-10-01', date '2026-11-01', date '2026-12-01'
  ) then
    raise exception 'Período de campanha inválido';
  end if;

  return query
  with aggregated as (
    select ms.branch_id, avg(ms.total_points) as total_points,
      avg(ms.revenue_points) as revenue_points,
      avg(coalesce(ms.discount_points, ms.profitability_points)) as indicator_points,
      avg(ms.obz_points) as obz_points, max(ms.created_at) as updated_at, count(*) as periods_count
    from campaign_gerentes_2026.metric_submissions ms
    where p_metric_period is null or ms.metric_period = p_metric_period
    group by ms.branch_id
  ), ranked as (
    select b.id as branch_id, b.name as branch_name, a.total_points, a.updated_at, a.periods_count,
      case when a.branch_id is null then null else row_number() over (
        order by a.total_points desc, a.revenue_points desc, a.indicator_points desc,
          a.obz_points desc, a.updated_at asc, b.display_order asc
      ) end as rank_position,
      b.display_order
    from campaign_gerentes_2026.branches b
    left join aggregated a on a.branch_id = b.id
    where b.is_active
  )
  select r.branch_id, r.branch_name, r.total_points, r.updated_at, r.rank_position, coalesce(r.periods_count, 0)
  from ranked r
  order by r.rank_position asc nulls last, r.display_order asc;
end;
$$;

drop function campaign_gerentes_2026.get_admin_latest_metrics();

create or replace function campaign_gerentes_2026.get_admin_latest_metrics(p_metric_period date default null)
returns table (
  branch_id uuid,
  branch_name text,
  metric_kind text,
  obz_percentage numeric,
  revenue_percentage numeric,
  discount_band text,
  discount_percentage numeric,
  profitability_percentage numeric,
  development_points numeric,
  total_points numeric,
  updated_at timestamptz,
  periods_count bigint
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

  if p_metric_period is not null and p_metric_period not in (
    date '2026-07-01', date '2026-08-01', date '2026-09-01',
    date '2026-10-01', date '2026-11-01', date '2026-12-01'
  ) then
    raise exception 'Período de campanha inválido';
  end if;

  return query
  select ms.branch_id, b.name, max(ms.metric_kind), avg(ms.obz_percentage), avg(ms.revenue_percentage),
    max(ms.discount_band), avg(ms.discount_percentage), avg(ms.profitability_percentage),
    avg(ms.development_points), avg(ms.total_points), max(ms.created_at), count(*)
  from campaign_gerentes_2026.metric_submissions ms
  join campaign_gerentes_2026.branches b on b.id = ms.branch_id
  where p_metric_period is null or ms.metric_period = p_metric_period
  group by ms.branch_id, b.name
  order by b.name;
end;
$$;

revoke all on function campaign_gerentes_2026.submit_metrics(
  date, numeric, numeric, text, numeric, numeric, boolean, boolean, boolean, boolean, jsonb
) from public, anon;
grant execute on function campaign_gerentes_2026.submit_metrics(
  date, numeric, numeric, text, numeric, numeric, boolean, boolean, boolean, boolean, jsonb
) to authenticated;
grant execute on function campaign_gerentes_2026.get_campaign_ranking(date) to authenticated;
grant execute on function campaign_gerentes_2026.get_admin_latest_metrics(date) to authenticated;
