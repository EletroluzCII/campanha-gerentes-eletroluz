-- Permite vários comprovantes para cada iniciativa semestral.
-- A pontuação continua baseada somente na quantidade de categorias distintas.

alter table campaign_gerentes_2026.semester_development_evidence
  drop constraint if exists semester_development_evidence_development_id_category_key;

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
  v_paths text[] := array[]::text[];
  v_books boolean := false;
  v_courses boolean := false;
  v_certifications boolean := false;
  v_events boolean := false;
  v_object_metadata jsonb;
  v_initiatives integer;
begin
  select * into v_profile from campaign_gerentes_2026.profiles where id = auth.uid();
  if v_profile.id is null or v_profile.role <> 'manager' or v_profile.branch_id is null then
    raise exception 'Conta sem permissão para registrar desenvolvimento';
  end if;
  if p_evidence is null or jsonb_typeof(p_evidence) <> 'array' then
    raise exception 'Lista de comprovantes inválida';
  end if;

  select * into v_existing
  from campaign_gerentes_2026.semester_development
  where branch_id = v_profile.branch_id
  for update;

  for v_item in select value from jsonb_array_elements(p_evidence) loop
    v_category := v_item->>'category';
    v_path := v_item->>'storage_path';
    v_original_name := left(regexp_replace(coalesce(v_item->>'original_name', ''), '[[:cntrl:]/\\]', '_', 'g'), 255);
    v_mime_type := v_item->>'mime_type';
    v_size_bytes := coalesce((v_item->>'size_bytes')::bigint, 0);

    if v_category not in ('books', 'courses', 'certifications', 'events') then
      raise exception 'Categoria de comprovante inválida';
    end if;
    if v_path = any(v_paths) then
      raise exception 'O mesmo comprovante foi informado mais de uma vez';
    end if;
    if v_path is null or split_part(v_path, '/', 1) <> auth.uid()::text or split_part(v_path, '/', 2) = ''
      or split_part(v_path, '/', 3) <> 'semester-development' or split_part(v_path, '/', 4) <> v_category then
      raise exception 'Caminho de comprovante inválido';
    end if;
    if v_original_name = '' or v_mime_type not in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf') or v_size_bytes < 1 or v_size_bytes > 10485760 then
      raise exception 'Metadados do comprovante inválidos';
    end if;

    select o.metadata into v_object_metadata
    from storage.objects o
    where o.bucket_id = 'campaign-gerentes-2026-evidence' and o.name = v_path;
    if v_object_metadata is null
      or coalesce(v_object_metadata->>'mimetype', v_mime_type) <> v_mime_type
      or coalesce((v_object_metadata->>'size')::bigint, v_size_bytes) <> v_size_bytes then
      raise exception 'O arquivo armazenado não corresponde aos metadados enviados';
    end if;

    if not exists (
      select 1 from campaign_gerentes_2026.semester_development_evidence se
      where se.development_id = v_existing.id and se.storage_path = v_path
    ) then
      if v_new_batch_id is null then
        v_new_batch_id := split_part(v_path, '/', 2);
      elsif v_new_batch_id <> split_part(v_path, '/', 2) then
        raise exception 'Os novos comprovantes devem pertencer ao mesmo lote';
      end if;
    end if;
    if exists (
      select 1 from campaign_gerentes_2026.semester_development_evidence se
      where se.storage_path = v_path and (v_existing.id is null or se.development_id <> v_existing.id)
    ) then
      raise exception 'Comprovante já utilizado em outro registro';
    end if;

    v_paths := array_append(v_paths, v_path);
    v_books := v_books or v_category = 'books';
    v_courses := v_courses or v_category = 'courses';
    v_certifications := v_certifications or v_category = 'certifications';
    v_events := v_events or v_category = 'events';
  end loop;

  if coalesce(p_development_books, false) <> v_books or coalesce(p_development_courses, false) <> v_courses
    or coalesce(p_development_certifications, false) <> v_certifications or coalesce(p_development_events, false) <> v_events then
    raise exception 'Toda iniciativa selecionada precisa de ao menos um comprovante';
  end if;

  v_initiatives := v_books::int + v_courses::int + v_certifications::int + v_events::int;
  insert into campaign_gerentes_2026.semester_development (
    branch_id, submitted_by, development_books, development_courses, development_certifications, development_events, development_points
  ) values (
    v_profile.branch_id, auth.uid(), v_books, v_courses, v_certifications, v_events,
    least(5, round(v_initiatives::numeric / 3 * 5, 2))
  ) on conflict (branch_id) do update set
    submitted_by = excluded.submitted_by,
    development_books = excluded.development_books,
    development_courses = excluded.development_courses,
    development_certifications = excluded.development_certifications,
    development_events = excluded.development_events,
    development_points = excluded.development_points,
    updated_at = now()
  returning * into v_development;

  if v_existing.id is not null then
    with removed as (
      delete from campaign_gerentes_2026.semester_development_evidence
      where development_id = v_existing.id and not (storage_path = any(v_paths))
      returning storage_path
    )
    delete from storage.objects
    where bucket_id = 'campaign-gerentes-2026-evidence'
      and name in (select storage_path from removed);
  end if;

  for v_item in select value from jsonb_array_elements(p_evidence) loop
    if not exists (
      select 1 from campaign_gerentes_2026.semester_development_evidence se
      where se.development_id = v_development.id and se.storage_path = v_item->>'storage_path'
    ) then
      insert into campaign_gerentes_2026.semester_development_evidence (
        development_id, branch_id, category, storage_path, original_name, mime_type, size_bytes
      ) values (
        v_development.id, v_profile.branch_id, v_item->>'category', v_item->>'storage_path',
        left(regexp_replace(v_item->>'original_name', '[[:cntrl:]/\\]', '_', 'g'), 255),
        v_item->>'mime_type', (v_item->>'size_bytes')::bigint
      );
    end if;
  end loop;

  return v_development;
end;
$$;
