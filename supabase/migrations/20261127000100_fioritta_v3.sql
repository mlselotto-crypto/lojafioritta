begin;

create table public.products (
  id text primary key check (id ~ '^[A-Z0-9][A-Z0-9_-]{0,39}$'),
  name text not null check (length(btrim(name)) between 1 and 160),
  category text not null,
  description text not null default '',
  lead_time text not null default '',
  image_path text,
  illustrated boolean not null default false,
  active boolean not null default true
);

create table public.variants (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references public.products(id),
  sku text not null unique check (length(btrim(sku)) between 1 and 80),
  name text not null check (length(btrim(name)) between 1 and 160),
  price_cents integer check (price_cents >= 0),
  image_path text,
  active boolean not null default true
);

create table public.collections (
  id text primary key check (id ~ '^[A-Z0-9][A-Z0-9_-]{0,39}$'),
  name text not null check (length(btrim(name)) between 1 and 160),
  description text not null default '',
  image_path text,
  priority integer not null default 1 check (priority > 0),
  custom_quote boolean not null default false check (id <> 'FREE' or custom_quote),
  active boolean not null default true
);

create table public.designs (
  id text primary key check (id ~ '^[A-Z0-9][A-Z0-9_-]{0,39}$'),
  collection_id text not null references public.collections(id),
  name text not null check (length(btrim(name)) between 1 and 160),
  image_path text,
  active boolean not null default true
);

create table public.packaging (
  id text primary key,
  name text not null,
  price_cents integer check (price_cents >= 0),
  active boolean not null default true
);

create table public.store_settings (
  id boolean primary key default true check (id),
  whatsapp text not null check (whatsapp ~ '^[1-9][0-9]{10,14}$'),
  pickup_instructions text not null,
  production_notice text not null
);

create table public.customers (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  phone text not null default '' check (length(phone) <= 30),
  created_at timestamptz not null default now()
);

create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null default auth.uid() references public.customers(id) on delete cascade,
  label text not null check (length(btrim(label)) between 1 and 80),
  postal_code text not null check (postal_code ~ '^[0-9]{8}$'),
  street text not null check (length(btrim(street)) between 1 and 160),
  number text not null check (length(btrim(number)) between 1 and 20),
  complement text not null default '' check (length(complement) <= 100),
  district text not null check (length(btrim(district)) between 1 and 100),
  city text not null check (length(btrim(city)) between 1 and 100),
  state text not null check (state ~ '^[A-Z]{2}$')
);
create index addresses_customer_idx on public.addresses(customer_id);

create table public.customer_support (
  id uuid primary key references public.customers(id) on delete cascade,
  note text not null default '' check (length(note) <= 1600)
);

create table public.administrators (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create function public.fioritta_is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.administrators a join auth.users u on u.id = a.id
    where a.id = auth.uid() and u.email_confirmed_at is not null
  );
$$;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id),
  request_key uuid not null,
  unique (customer_id, request_key),
  status text not null default 'orcamento_solicitado'
    check (status in ('orcamento_solicitado','aguardando_pagamento','em_producao','pronto','concluido','cancelado')),
  total_cents integer check (total_cents > 0),
  production_due date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index orders_customer_idx on public.orders(customer_id, created_at desc);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  variant_id uuid not null references public.variants(id),
  collection_id text not null references public.collections(id),
  design_id text references public.designs(id),
  packaging_id text not null references public.packaging(id),
  product_name text not null,
  variant_name text not null,
  collection_name text not null,
  design_name text,
  packaging_name text not null,
  quantity integer not null check (quantity between 1 and 20)
);
create index order_items_order_idx on public.order_items(order_id);

create table public.personalizations (
  order_item_id uuid primary key references public.order_items(id),
  instructions text not null check (length(instructions) <= 1200),
  approval_status text not null default 'pendente'
    check (approval_status in ('pendente','enviada','aprovada','revisao')),
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  check ((approval_status = 'aprovada') = (approved_at is not null))
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  environment text not null check (environment in ('test','production')),
  provider_reference text not null,
  status text not null check (status in ('pendente','confirmado','recusado','estornado')),
  amount_cents integer not null check (amount_cents > 0),
  created_at timestamptz not null default now(),
  unique (environment, provider_reference)
);
create index payments_order_idx on public.payments(order_id);

create table public.deliveries (
  order_id uuid primary key references public.orders(id),
  method text not null check (method in ('retirada','entrega')),
  address_snapshot jsonb,
  pickup_at timestamptz,
  tracking_code text check (length(tracking_code) <= 120),
  check ((method = 'entrega') = (address_snapshot is not null)),
  check (pickup_at is null or method = 'retirada'),
  check (tracking_code is null or method = 'entrega')
);

create table public.change_history (
  id bigint generated always as identity primary key,
  actor_id uuid,
  table_name text not null,
  row_key text,
  operation text not null,
  changed_fields text[] not null,
  created_at timestamptz not null default now()
);

create function public.fioritta_audit()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  previous jsonb;
  current_row jsonb;
  row_data jsonb;
begin
  previous := case when tg_op <> 'INSERT' then to_jsonb(old) else '{}'::jsonb end;
  current_row := case when tg_op <> 'DELETE' then to_jsonb(new) else '{}'::jsonb end;
  row_data := previous || current_row;
  insert into public.change_history(actor_id, table_name, row_key, operation, changed_fields)
  values (auth.uid(), tg_table_name, coalesce(row_data->>'id', row_data->>'order_item_id', row_data->>'order_id'),
    tg_op, array(select key from jsonb_object_keys(row_data) as k(key)
                 where previous->key is distinct from current_row->key order by key));
  return null;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array['products','variants','collections','designs','packaging','store_settings',
    'customers','addresses','customer_support','administrators','orders','order_items','personalizations','payments','deliveries','change_history']
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated, service_role', table_name);
    if table_name <> 'change_history' then
      execute format('create trigger fioritta_audit after insert or update or delete on public.%I
        for each row execute function public.fioritta_audit()', table_name);
    end if;
  end loop;
end;
$$;

revoke all on function public.fioritta_is_admin(), public.fioritta_audit()
  from public, anon, authenticated, service_role;
grant execute on function public.fioritta_is_admin() to authenticated;
revoke all on sequence public.change_history_id_seq from public, anon, authenticated, service_role;

grant select on public.products, public.variants, public.collections, public.designs,
  public.packaging, public.store_settings to anon, authenticated;
grant insert, update on public.products, public.variants, public.collections, public.designs,
  public.packaging, public.store_settings to authenticated;
grant select, insert, update on public.customer_support to authenticated;
grant select on public.customers, public.addresses, public.orders, public.order_items,
  public.personalizations, public.payments, public.deliveries, public.change_history to authenticated;
grant insert (id, name, phone), update (name, phone) on public.customers to authenticated;
grant insert (customer_id, label, postal_code, street, number, complement, district, city, state),
  update (label, postal_code, street, number, complement, district, city, state), delete
  on public.addresses to authenticated;

create policy products_public on public.products for select to anon, authenticated using (active);
create policy variants_public on public.variants for select to anon, authenticated
  using (active and exists (select 1 from public.products p where p.id = product_id and p.active));
create policy collections_public on public.collections for select to anon, authenticated using (active);
create policy designs_public on public.designs for select to anon, authenticated
  using (active and exists (select 1 from public.collections c where c.id = collection_id and c.active));
create policy packaging_public on public.packaging for select to anon, authenticated using (active);
create policy settings_public on public.store_settings for select to anon, authenticated using (true);

do $$
declare table_name text;
begin
  foreach table_name in array array['products','variants','collections','designs','packaging','store_settings']
  loop
    execute format('create policy studio_catalog on public.%I for all to authenticated
      using ((select public.fioritta_is_admin())) with check ((select public.fioritta_is_admin()))', table_name);
  end loop;
end;
$$;

create policy customers_read on public.customers for select to authenticated
  using (id = (select auth.uid()) or (select public.fioritta_is_admin()));
create policy customers_insert on public.customers for insert to authenticated with check (id = (select auth.uid()));
create policy customers_update on public.customers for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy support_studio on public.customer_support for all to authenticated
  using ((select public.fioritta_is_admin())) with check ((select public.fioritta_is_admin()));
create policy addresses_read on public.addresses for select to authenticated
  using (customer_id = (select auth.uid()) or (select public.fioritta_is_admin()));
create policy addresses_insert on public.addresses for insert to authenticated with check (customer_id = (select auth.uid()));
create policy addresses_update on public.addresses for update to authenticated
  using (customer_id = (select auth.uid())) with check (customer_id = (select auth.uid()));
create policy addresses_delete on public.addresses for delete to authenticated using (customer_id = (select auth.uid()));
create policy orders_read on public.orders for select to authenticated
  using (customer_id = (select auth.uid()) or (select public.fioritta_is_admin()));
create policy items_read on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));
create policy personalizations_read on public.personalizations for select to authenticated
  using (exists (select 1 from public.order_items i where i.id = order_item_id));
create policy payments_read on public.payments for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));
create policy deliveries_read on public.deliveries for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));
create policy history_read on public.change_history for select to authenticated
  using ((select public.fioritta_is_admin()));

create function public.fioritta_request_order(items jsonb, fulfillment text, request_id uuid, selected_address uuid default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  customer uuid := auth.uid();
  new_order uuid;
  line jsonb;
  quantity integer;
  variant_record record;
  collection_record public.collections;
  design_record public.designs;
  package_record public.packaging;
  address_data jsonb;
  new_item uuid;
  instructions text;
begin
  if customer is null or not exists (
    select 1 from auth.users u join public.customers c on c.id = u.id
    where u.id = customer and u.email_confirmed_at is not null
  ) then
    raise exception 'Confirme o e-mail e complete o perfil antes de solicitar um pedido.' using errcode = '42501';
  end if;

  if jsonb_typeof(items) is distinct from 'array' then
    raise exception 'A sacola está inválida.' using errcode = '22023';
  end if;
  if jsonb_array_length(items) not between 1 and 20 or fulfillment is null or
     fulfillment not in ('retirada', 'entrega') then
    raise exception 'Confira a sacola e a forma de entrega.' using errcode = '22023';
  end if;
  if request_id is null then
    raise exception 'Identificador de solicitação inválido.' using errcode = '22023';
  end if;
  select id into new_order from public.orders where customer_id = customer and request_key = request_id;
  if found then
    return new_order;
  end if;
  if fulfillment = 'entrega' then
    select to_jsonb(a) - 'customer_id' - 'id' into address_data
    from public.addresses a where a.id = selected_address and a.customer_id = customer;
    if address_data is null then
      raise exception 'Selecione um endereço cadastrado na sua conta.' using errcode = '22023';
    end if;
  end if;

  insert into public.orders(customer_id, request_key) values (customer, request_id)
    on conflict (customer_id, request_key) do nothing returning id into new_order;
  if not found then
    select id into strict new_order from public.orders where customer_id = customer and request_key = request_id;
    return new_order;
  end if;
  insert into public.deliveries(order_id, method, address_snapshot) values (new_order, fulfillment, address_data);

  for line in select value from jsonb_array_elements(items)
  loop
    if jsonb_typeof(line) <> 'object' or coalesce(line->>'quantity', '') !~ '^([1-9]|1[0-9]|20)$' then
      raise exception 'Cada item deve ter de 1 a 20 unidades.' using errcode = '22023';
    end if;
    quantity := (line->>'quantity')::integer;
    instructions := btrim(coalesce(line->>'instructions', ''));
    select v.id, v.name as variant_name, p.name as product_name into variant_record
      from public.variants v join public.products p on p.id = v.product_id
      where v.id = (line->>'variant_id')::uuid and v.active and p.active;
    if not found then
      raise exception 'Uma variante da sacola deixou de estar disponível.' using errcode = '22023';
    end if;
    select * into collection_record from public.collections where id = line->>'collection_id' and active;
    if not found then
      raise exception 'Uma coleção da sacola deixou de estar disponível.' using errcode = '22023';
    end if;
    select * into package_record from public.packaging where id = line->>'packaging_id' and active;
    if not found then
      raise exception 'Uma embalagem da sacola deixou de estar disponível.' using errcode = '22023';
    end if;
    select * into design_record from public.designs
      where id = nullif(line->>'design_id', '') and collection_id = collection_record.id and active;
    if nullif(line->>'design_id', '') is not null and not found then
      raise exception 'A estampa selecionada não pertence à coleção ou está indisponível.' using errcode = '22023';
    end if;
    if length(instructions) > 1200 or (collection_record.custom_quote and instructions = '') then
      raise exception 'Informe os detalhes da criação exclusiva (até 1200 caracteres).' using errcode = '22023';
    end if;

    insert into public.order_items(order_id, variant_id, collection_id, design_id, packaging_id,
      product_name, variant_name, collection_name, design_name, packaging_name, quantity)
    values (new_order, variant_record.id, collection_record.id, design_record.id, package_record.id,
      variant_record.product_name, variant_record.variant_name, collection_record.name, design_record.name,
      package_record.name, quantity) returning id into new_item;
    insert into public.personalizations(order_item_id, instructions) values (new_item, instructions);
  end loop;
  return new_order;
end;
$$;

create function public.fioritta_studio_customers(page_offset integer default 0)
returns table (id uuid, name text, phone text, email text, created_at timestamptz, support_note text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.fioritta_is_admin() then
    raise exception 'Acesso restrito ao Fioritta Studio.' using errcode = '42501';
  end if;
  return query
    select c.id, c.name, c.phone, u.email::text, c.created_at, s.note
    from public.customers c join auth.users u on u.id = c.id
    left join public.customer_support s on s.id = c.id
    order by c.created_at desc, c.id limit 26 offset greatest(page_offset, 0);
end;
$$;

create function public.fioritta_studio_order(
  target_order uuid, next_status text, quoted_cents integer, due_on date,
  pickup_on timestamptz, tracking text
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  current_order public.orders;
  delivery_method text;
begin
  if not public.fioritta_is_admin() then
    raise exception 'Acesso restrito ao Fioritta Studio.' using errcode = '42501';
  end if;
  select * into strict current_order from public.orders where id = target_order for update;
  select method into strict delivery_method from public.deliveries where order_id = target_order;

  if next_status is null or not (
    next_status = current_order.status or
    (current_order.status = 'orcamento_solicitado' and next_status in ('aguardando_pagamento','cancelado')) or
    (current_order.status = 'aguardando_pagamento' and next_status in ('em_producao','cancelado')) or
    (current_order.status = 'em_producao' and next_status = 'pronto') or
    (current_order.status = 'pronto' and next_status = 'concluido')
  ) then
    raise exception 'Esta transição de status não é permitida.' using errcode = '22023';
  end if;

  if current_order.status in ('em_producao','pronto','concluido','cancelado')
     and quoted_cents is distinct from current_order.total_cents then
    raise exception 'O valor deste pedido está bloqueado.' using errcode = '22023';
  end if;
  if next_status = 'aguardando_pagamento' and (quoted_cents is null or quoted_cents <= 0) then
    raise exception 'Informe o valor final aprovado para fechar o orçamento.' using errcode = '22023';
  end if;
  if current_order.status = 'aguardando_pagamento' and next_status = 'em_producao' and (
    quoted_cents is distinct from current_order.total_cents or
    not exists (select 1 from public.payments where order_id = target_order and environment = 'production'
      and status = 'confirmado' and amount_cents = current_order.total_cents) or
    exists (select 1 from public.order_items i join public.personalizations p on p.order_item_id = i.id
      where i.order_id = target_order and p.approval_status <> 'aprovada')
  ) then
    raise exception 'A produção exige pagamento integral confirmado e aprovação de todas as artes.' using errcode = '22023';
  end if;
  if next_status = 'concluido' and delivery_method = 'retirada' and pickup_on is null then
    raise exception 'Agende a retirada antes de concluir.' using errcode = '22023';
  end if;

  update public.orders set status = next_status, total_cents = quoted_cents,
    production_due = due_on, updated_at = now() where id = target_order;
  update public.deliveries set pickup_at = pickup_on, tracking_code = nullif(btrim(tracking), '')
    where order_id = target_order;
end;
$$;

create function public.fioritta_studio_approval(target_item uuid, next_approval text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  current_status text;
begin
  if not public.fioritta_is_admin() then
    raise exception 'Acesso restrito ao Fioritta Studio.' using errcode = '42501';
  end if;
  select o.status into strict current_status from public.orders o
    join public.order_items i on i.order_id = o.id where i.id = target_item for update of o;
  if current_status not in ('orcamento_solicitado','aguardando_pagamento') then
    raise exception 'O registro de aprovação está bloqueado para este pedido.' using errcode = '22023';
  end if;
  update public.personalizations set approval_status = next_approval,
    approved_at = case when next_approval = 'aprovada' then now() end,
    approved_by = case when next_approval = 'aprovada' then auth.uid() end
  where order_item_id = target_item and approval_status is distinct from next_approval;
end;
$$;

revoke all on function public.fioritta_request_order(jsonb,text,uuid,uuid),
  public.fioritta_studio_customers(integer), public.fioritta_studio_order(uuid,text,integer,date,timestamptz,text),
  public.fioritta_studio_approval(uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.fioritta_request_order(jsonb,text,uuid,uuid),
  public.fioritta_studio_customers(integer), public.fioritta_studio_order(uuid,text,integer,date,timestamptz,text),
  public.fioritta_studio_approval(uuid,text) to authenticated;

commit;
