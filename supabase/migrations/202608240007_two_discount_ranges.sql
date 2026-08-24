-- Duas faixas independentes para o indicador Controle de descontos.
alter table campaign_gerentes_2026.metric_submissions
  add column if not exists discount_under_500_percentage numeric(6,2) check (discount_under_500_percentage between 0 and 999.99),
  add column if not exists discount_under_500_points numeric(5,2) check (discount_under_500_points between 0 and 18),
  add column if not exists discount_501_to_2000_percentage numeric(6,2) check (discount_501_to_2000_percentage between 0 and 999.99),
  add column if not exists discount_501_to_2000_points numeric(5,2) check (discount_501_to_2000_points between 0 and 17);

-- Mantém a leitura dos dados antigos; o próximo salvamento os converte para as duas faixas.
update campaign_gerentes_2026.metric_submissions
set discount_under_500_percentage = case when discount_band = 'A' then discount_percentage else discount_under_500_percentage end,
    discount_501_to_2000_percentage = case when discount_band = 'B' then discount_percentage else discount_501_to_2000_percentage end
where metric_kind = 'discount'
  and (discount_under_500_percentage is null or discount_501_to_2000_percentage is null);

drop function campaign_gerentes_2026.submit_metrics(date, numeric, numeric, text, numeric, numeric, boolean, boolean, boolean, boolean, jsonb);
create function campaign_gerentes_2026.submit_metrics(
  p_metric_period date,
  p_obz_percentage numeric,
  p_revenue_percentage numeric,
  p_discount_under_500_percentage numeric,
  p_discount_501_to_2000_percentage numeric,
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
  v_discount_under_500_points numeric(5,2);
  v_discount_501_to_2000_points numeric(5,2);
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
      or p_discount_under_500_percentage is not null or p_discount_501_to_2000_percentage is not null then
      raise exception 'Valores de rentabilidade inválidos';
    end if;
  elsif p_discount_under_500_percentage is null or p_discount_under_500_percentage < 0 or p_discount_under_500_percentage > 999.99
    or p_discount_501_to_2000_percentage is null or p_discount_501_to_2000_percentage < 0 or p_discount_501_to_2000_percentage > 999.99
    or p_profitability_percentage is not null then
    raise exception 'Valores de desconto inválidos';
  end if;

  v_obz_points := case when p_obz_percentage < 95 then 0 else least(20, round((p_obz_percentage / 100 * 20)::numeric, 2)) end;
  v_revenue_points := least(40, round((p_revenue_percentage / 100 * 40)::numeric, 2));
  v_discount_under_500_points := case when p_discount_under_500_percentage <= 11.4 then 18 else 0 end;
  v_discount_501_to_2000_points := case when p_discount_501_to_2000_percentage <= 19.52 then 17 else 0 end;
  v_indicator_points := case
    when v_is_profitability then least(35, round((p_profitability_percentage / 100 * 35)::numeric, 2))
    else v_discount_under_500_points + v_discount_501_to_2000_points
  end;

  insert into campaign_gerentes_2026.metric_submissions (
    branch_id, submitted_by, metric_period, metric_kind, obz_percentage, obz_points, revenue_percentage, revenue_points,
    discount_band, discount_percentage, discount_under_500_percentage, discount_under_500_points,
    discount_501_to_2000_percentage, discount_501_to_2000_points, discount_points, profitability_percentage, profitability_points,
    development_books, development_courses, development_certifications, development_events, development_points, total_points
  ) values (
    v_profile.branch_id, auth.uid(), p_metric_period, case when v_is_profitability then 'profitability' else 'discount' end,
    round(p_obz_percentage, 2), v_obz_points, round(p_revenue_percentage, 2), v_revenue_points,
    null, null,
    case when v_is_profitability then null else round(p_discount_under_500_percentage, 2) end,
    case when v_is_profitability then null else v_discount_under_500_points end,
    case when v_is_profitability then null else round(p_discount_501_to_2000_percentage, 2) end,
    case when v_is_profitability then null else v_discount_501_to_2000_points end,
    case when v_is_profitability then null else v_indicator_points end,
    case when v_is_profitability then round(p_profitability_percentage, 2) else null end,
    case when v_is_profitability then v_indicator_points else null end,
    false, false, false, false, 0, round(v_obz_points + v_revenue_points + v_indicator_points, 2)
  ) on conflict (branch_id, metric_period) do update set
    submitted_by = auth.uid(), metric_kind = excluded.metric_kind,
    obz_percentage = excluded.obz_percentage, obz_points = excluded.obz_points,
    revenue_percentage = excluded.revenue_percentage, revenue_points = excluded.revenue_points,
    discount_band = null, discount_percentage = null,
    discount_under_500_percentage = excluded.discount_under_500_percentage,
    discount_under_500_points = excluded.discount_under_500_points,
    discount_501_to_2000_percentage = excluded.discount_501_to_2000_percentage,
    discount_501_to_2000_points = excluded.discount_501_to_2000_points,
    discount_points = excluded.discount_points,
    profitability_percentage = excluded.profitability_percentage, profitability_points = excluded.profitability_points,
    development_books = false, development_courses = false, development_certifications = false, development_events = false,
    development_points = 0, total_points = excluded.total_points, created_at = now()
  returning * into v_submission;
  return v_submission;
end;
$$;

drop function campaign_gerentes_2026.get_admin_latest_metrics(date);
create function campaign_gerentes_2026.get_admin_latest_metrics(p_metric_period date default null)
returns table (
  branch_id uuid, branch_name text, metric_kind text, obz_percentage numeric, revenue_percentage numeric,
  discount_under_500_percentage numeric, discount_under_500_points numeric,
  discount_501_to_2000_percentage numeric, discount_501_to_2000_points numeric,
  profitability_percentage numeric, development_points numeric, total_points numeric, updated_at timestamptz, periods_count bigint
)
language plpgsql stable security definer set search_path = pg_catalog
as $$
begin
  if not campaign_gerentes_2026.is_campaign_admin() then raise exception 'Acesso restrito ao administrador'; end if;
  if p_metric_period is not null and p_metric_period not in (date '2026-07-01', date '2026-08-01', date '2026-09-01', date '2026-10-01', date '2026-11-01', date '2026-12-01') then raise exception 'Período de campanha inválido'; end if;
  return query
  select ms.branch_id, b.name, max(ms.metric_kind), avg(ms.obz_percentage), avg(ms.revenue_percentage),
    avg(ms.discount_under_500_percentage), avg(ms.discount_under_500_points),
    avg(ms.discount_501_to_2000_percentage), avg(ms.discount_501_to_2000_points), avg(ms.profitability_percentage),
    case when p_metric_period is null then coalesce(max(sd.development_points), 0) else 0 end,
    avg(ms.total_points) + case when p_metric_period is null then coalesce(max(sd.development_points), 0) else 0 end,
    case when p_metric_period is null then greatest(max(ms.created_at), max(sd.updated_at)) else max(ms.created_at) end, count(*)
  from campaign_gerentes_2026.metric_submissions ms join campaign_gerentes_2026.branches b on b.id = ms.branch_id
    left join campaign_gerentes_2026.semester_development sd on sd.branch_id = ms.branch_id
  where p_metric_period is null or ms.metric_period = p_metric_period group by ms.branch_id, b.name order by b.name;
end;
$$;

revoke all on function campaign_gerentes_2026.submit_metrics(date, numeric, numeric, numeric, numeric, numeric, boolean, boolean, boolean, boolean, jsonb) from public, anon;
grant execute on function campaign_gerentes_2026.submit_metrics(date, numeric, numeric, numeric, numeric, numeric, boolean, boolean, boolean, boolean, jsonb) to authenticated;
grant execute on function campaign_gerentes_2026.get_admin_latest_metrics(date) to authenticated;
