-- Corrige referências ambíguas entre colunas do ranking e variáveis de retorno da função.

create or replace function campaign_gerentes_2026.get_campaign_ranking(p_metric_period date default null)
returns table (branch_id uuid, branch_name text, total_points numeric, updated_at timestamptz, rank_position bigint, periods_count bigint)
language plpgsql stable security definer set search_path = pg_catalog
as $$
begin
  if not campaign_gerentes_2026.has_campaign_profile() then raise exception 'Acesso não autorizado'; end if;
  if p_metric_period is not null and p_metric_period not in (
    date '2026-07-01', date '2026-08-01', date '2026-09-01', date '2026-10-01', date '2026-11-01', date '2026-12-01'
  ) then raise exception 'Período de campanha inválido'; end if;

  return query
  with aggregated as (
    select ms.branch_id, avg(ms.total_points) as operational_points, avg(ms.revenue_points) as revenue_points,
      avg(coalesce(ms.discount_points, ms.profitability_points)) as indicator_points, avg(ms.obz_points) as obz_points,
      max(ms.created_at) as updated_at, count(*) as periods_count
    from campaign_gerentes_2026.metric_submissions ms
    where p_metric_period is null or ms.metric_period = p_metric_period
    group by ms.branch_id
  ), scored as (
    select b.id as branch_id, b.name as branch_name,
      case when a.branch_id is null then null when p_metric_period is null then a.operational_points + coalesce(sd.development_points, 0) else a.operational_points end as total_points,
      case when p_metric_period is null then greatest(a.updated_at, sd.updated_at) else a.updated_at end as updated_at,
      a.periods_count, a.revenue_points, a.indicator_points, a.obz_points, b.display_order
    from campaign_gerentes_2026.branches b
    left join aggregated a on a.branch_id = b.id
    left join campaign_gerentes_2026.semester_development sd on sd.branch_id = b.id
    where b.is_active
  ), ranked as (
    select s.*, case when s.total_points is null then null else row_number() over (
      order by s.total_points desc, s.revenue_points desc, s.indicator_points desc, s.obz_points desc, s.updated_at asc, s.display_order asc
    ) end as rank_position
    from scored s
  )
  select r.branch_id, r.branch_name, r.total_points, r.updated_at, r.rank_position, coalesce(r.periods_count, 0)
  from ranked r
  order by r.rank_position asc nulls last, r.display_order asc;
end;
$$;

grant execute on function campaign_gerentes_2026.get_campaign_ranking(date) to authenticated;
