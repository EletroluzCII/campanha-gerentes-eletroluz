-- Metas de rentabilidade específicas para Exceleds e FOCO.
update campaign_gerentes_2026.metric_submissions ms
set profitability_points = case
      when ms.profitability_percentage < case when b.slug = 'exceleds' then 71.9 * 0.95 else 38 * 0.95 end then 0
      else least(35, round((ms.profitability_percentage / case when b.slug = 'exceleds' then 71.9 else 38 end * 35)::numeric, 2))
    end,
    total_points = round(ms.obz_points + ms.revenue_points + case
      when ms.profitability_percentage < case when b.slug = 'exceleds' then 71.9 * 0.95 else 38 * 0.95 end then 0
      else least(35, round((ms.profitability_percentage / case when b.slug = 'exceleds' then 71.9 else 38 end * 35)::numeric, 2))
    end, 2)
from campaign_gerentes_2026.branches b
where b.id = ms.branch_id
  and ms.metric_kind = 'profitability'
  and b.slug in ('exceleds', 'foco');

create or replace function campaign_gerentes_2026.submit_metrics(
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
  v_profitability_target numeric(6,2);
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
  v_profitability_target := case v_branch.slug when 'exceleds' then 71.9 when 'foco' then 38 else null end;
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
    when v_is_profitability and p_profitability_percentage < v_profitability_target * 0.95 then 0
    when v_is_profitability then least(35, round((p_profitability_percentage / v_profitability_target * 35)::numeric, 2))
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
