begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fioritta-catalogo', 'fioritta-catalogo', true, 6291456, array['image/jpeg','image/png','image/webp','image/avif']);

create policy fioritta_catalog_images_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'fioritta-catalogo' and (select public.fioritta_is_admin())
    and name ~ '^catalogo/[a-f0-9-]+\.(jpg|png|webp|avif)$');

create policy fioritta_catalog_images_read on storage.objects for select to authenticated
  using (bucket_id = 'fioritta-catalogo' and (select public.fioritta_is_admin()));

create policy fioritta_catalog_images_delete on storage.objects for delete to authenticated
  using (bucket_id = 'fioritta-catalogo' and (select public.fioritta_is_admin()));

commit;
