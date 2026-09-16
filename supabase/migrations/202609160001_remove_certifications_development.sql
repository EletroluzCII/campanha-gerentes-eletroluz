-- Desenvolvimento pessoal passa a considerar somente livros, cursos e eventos.
-- Cada uma das três iniciativas vale 1,67 ponto, totalizando no máximo 5 pontos.

with removed as (
  delete from campaign_gerentes_2026.semester_development_evidence
  where category = 'certifications'
  returning storage_path
)
delete from storage.objects
where bucket_id = 'campaign-gerentes-2026-evidence'
  and name in (select storage_path from removed);

update campaign_gerentes_2026.semester_development
set development_certifications = false,
  development_points = least(
    5,
    round((
      coalesce(development_books, false)::int
      + coalesce(development_courses, false)::int
      + coalesce(development_events, false)::int
    )::numeric / 3 * 5, 2)
  ),
  updated_at = now();

alter function campaign_gerentes_2026.submit_semester_development(boolean, boolean, boolean, boolean, jsonb)
  rename to submit_semester_development_with_certifications;

revoke all on function campaign_gerentes_2026.submit_semester_development_with_certifications(boolean, boolean, boolean, boolean, jsonb) from public, anon, authenticated;

create function campaign_gerentes_2026.submit_semester_development(
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
begin
  if coalesce(p_development_certifications, false) then
    raise exception 'A opção de certificações não faz mais parte do indicador';
  end if;
  if p_evidence is null or jsonb_typeof(p_evidence) <> 'array' then
    raise exception 'Lista de comprovantes inválida';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_evidence) as evidence(item)
    where item->>'category' not in ('books', 'courses', 'events')
  ) then
    raise exception 'Categoria de comprovante inválida';
  end if;

  return campaign_gerentes_2026.submit_semester_development_with_certifications(
    p_development_books,
    p_development_courses,
    false,
    p_development_events,
    p_evidence
  );
end;
$$;

revoke all on function campaign_gerentes_2026.submit_semester_development(boolean, boolean, boolean, boolean, jsonb) from public, anon;
grant execute on function campaign_gerentes_2026.submit_semester_development(boolean, boolean, boolean, boolean, jsonb) to authenticated;
