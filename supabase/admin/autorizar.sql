-- Execute como proprietário no SQL Editor. Substitua apenas o UUID.
-- A conta deve ter se cadastrado e confirmado o e-mail.
do $$
declare account_id uuid := '00000000-0000-0000-0000-000000000000';
begin
  if not exists (select 1 from auth.users where id = account_id and email_confirmed_at is not null) then
    raise exception 'Informe o UUID de uma conta existente com e-mail confirmado.';
  end if;
  insert into public.administrators(id) values (account_id) on conflict (id) do nothing;
end;
$$;
