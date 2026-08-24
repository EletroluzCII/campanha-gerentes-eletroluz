-- Remove o único lançamento de teste confirmado para a FOCO (julho de 2026).

delete from campaign_gerentes_2026.metric_submissions ms
using campaign_gerentes_2026.branches b
where ms.branch_id = b.id
  and b.slug = 'foco'
  and ms.metric_period = date '2026-07-01';
