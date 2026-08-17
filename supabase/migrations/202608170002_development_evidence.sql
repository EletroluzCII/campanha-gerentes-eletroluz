-- Comprovantes privados do indicador de desenvolvimento pessoal.

insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
) values (
  'campaign-gerentes-2026-evidence',
  'campaign-gerentes-2026-evidence',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table campaign_gerentes_2026.submission_evidence (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references campaign_gerentes_2026.metric_submissions(id) on delete restrict,
  branch_id uuid not null references campaign_gerentes_2026.branches(id) on delete restrict,
  category text not null check (category in ('books', 'courses', 'certifications', 'events')),
  storage_path text not null unique check (char_length(storage_path) between 20 and 500),
  original_name text not null check (char_length(original_name) between 1 and 255),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  created_at timestamptz not null default now(),
  unique (submission_id, category)
);

create index submission_evidence_submission_idx
  on campaign_gerentes_2026.submission_evidence(submission_id, category);

create index submission_evidence_branch_idx
  on campaign_gerentes_2026.submission_evidence(branch_id, created_at desc);

alter table campaign_gerentes_2026.submission_evidence enable row level security;

create policy "campaign managers read own evidence metadata and admins read all"
  on campaign_gerentes_2026.submission_evidence for select to authenticated
  using (
    campaign_gerentes_2026.is_campaign_admin()
    or branch_id = (
      select p.branch_id
      from campaign_gerentes_2026.profiles p
      where p.id = auth.uid()
    )
  );

revoke all on campaign_gerentes_2026.submission_evidence from public, anon;
revoke insert, update, delete, truncate, references, trigger
  on campaign_gerentes_2026.submission_evidence from authenticated;
grant select on campaign_gerentes_2026.submission_evidence to authenticated;
grant all on campaign_gerentes_2026.submission_evidence to service_role;

create policy "campaign managers upload evidence to their own prefix"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'campaign-gerentes-2026-evidence'
    and split_part(name, '/', 1) = auth.uid()::text
    and exists (
      select 1 from campaign_gerentes_2026.profiles p
      where p.id = auth.uid() and p.role = 'manager'
    )
  );

create policy "campaign owners and admins read development evidence"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'campaign-gerentes-2026-evidence'
    and (
      split_part(name, '/', 1) = auth.uid()::text
      or campaign_gerentes_2026.is_campaign_admin()
    )
  );

create policy "campaign managers delete only unlinked evidence"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'campaign-gerentes-2026-evidence'
    and split_part(name, '/', 1) = auth.uid()::text
    and not exists (
      select 1 from campaign_gerentes_2026.submission_evidence se
      where se.storage_path = storage.objects.name
    )
  );

-- A assinatura antiga não valida comprovantes e deixa de existir.
drop function campaign_gerentes_2026.submit_metrics(
  numeric, numeric, text, numeric, boolean, boolean, boolean, boolean
);

create or replace function campaign_gerentes_2026.submit_metrics(
  p_obz_percentage numeric,
  p_revenue_percentage numeric,
  p_discount_band text,
  p_discount_percentage numeric,
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
  v_obz_points numeric(5,2);
  v_revenue_points numeric(5,2);
  v_discount_points numeric(5,2);
  v_development_points numeric(5,2);
  v_initiatives integer := 0;
  v_submission campaign_gerentes_2026.metric_submissions;
  v_item jsonb;
  v_category text;
  v_path text;
  v_original_name text;
  v_mime_type text;
  v_size_bytes bigint;
  v_batch_id text := null;
  v_categories text[] := array[]::text[];
  v_object_metadata jsonb;
  v_books boolean := false;
  v_courses boolean := false;
  v_certifications boolean := false;
  v_events boolean := false;
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

  if p_evidence is null or jsonb_typeof(p_evidence) <> 'array' or jsonb_array_length(p_evidence) > 4 then
    raise exception 'Lista de comprovantes inválida';
  end if;

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

    if v_batch_id is null then
      v_batch_id := split_part(v_path, '/', 2);
    elsif v_batch_id <> split_part(v_path, '/', 2) then
      raise exception 'Os comprovantes devem pertencer ao mesmo lote';
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
    ) then
      raise exception 'Comprovante já utilizado em outro lançamento';
    end if;

    v_categories := array_append(v_categories, v_category);
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
    round(p_discount_percentage, 2), v_discount_points, v_books, v_courses,
    v_certifications, v_events, v_development_points,
    round(v_obz_points + v_revenue_points + v_discount_points + v_development_points, 2)
  ) returning * into v_submission;

  for v_item in select value from jsonb_array_elements(p_evidence)
  loop
    insert into campaign_gerentes_2026.submission_evidence (
      submission_id, branch_id, category, storage_path,
      original_name, mime_type, size_bytes
    ) values (
      v_submission.id,
      v_profile.branch_id,
      v_item->>'category',
      v_item->>'storage_path',
      left(regexp_replace(v_item->>'original_name', '[[:cntrl:]/\\]', '_', 'g'), 255),
      v_item->>'mime_type',
      (v_item->>'size_bytes')::bigint
    );
  end loop;

  return v_submission;
end;
$$;

revoke all on function campaign_gerentes_2026.submit_metrics(
  numeric, numeric, text, numeric, boolean, boolean, boolean, boolean, jsonb
) from public, anon;

grant execute on function campaign_gerentes_2026.submit_metrics(
  numeric, numeric, text, numeric, boolean, boolean, boolean, boolean, jsonb
) to authenticated;
