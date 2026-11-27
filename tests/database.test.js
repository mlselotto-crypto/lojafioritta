import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const migration = file => readFileSync(new URL('../supabase/migrations/' + file, import.meta.url), 'utf8');
const ids = {
  alice: '10000000-0000-4000-8000-000000000001',
  bob: '10000000-0000-4000-8000-000000000002',
  studio: '10000000-0000-4000-8000-000000000003',
  unconfirmed: '10000000-0000-4000-8000-000000000004',
  request: '10000000-0000-4000-8000-000000000101',
  invalidRequest: '10000000-0000-4000-8000-000000000102',
};

test('migrations, RLS, persistent checkout, Studio permissions and storage policies', async t => {
  const pg = await PGlite.create();
  t.after(() => pg.close());
  await pg.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema auth;
    create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (bucket_id text references storage.buckets(id), name text);
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated;
    grant select, insert, delete on storage.objects to authenticated;
    -- Simulate Supabase's broad default grants and confirm the migration revokes them.
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  `);
  await pg.exec(migration('20261127000100_fioritta_v3.sql'));
  await pg.exec(migration('20261127000200_catalogo_original.sql'));
  await pg.exec(migration('20261127000300_imagens_studio.sql'));
  for (const [key, id] of Object.entries(ids).slice(0, 4)) {
    await pg.query('insert into auth.users values ($1, $2, $3)', [
      id, key + '@example.test', key === 'unconfirmed' ? null : '2026-11-01T00:00:00Z',
    ]);
  }
  const promote = readFileSync(new URL('../supabase/admin/autorizar.sql', import.meta.url), 'utf8');
  await assert.rejects(pg.exec(promote.replace('00000000-0000-0000-0000-000000000000', ids.unconfirmed)), /e-mail confirmado/);
  await pg.exec(promote.replace('00000000-0000-0000-0000-000000000000', ids.studio));
  const as = async (role, id = '') => {
    await pg.exec('reset role');
    await pg.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
    await pg.exec('set role ' + role);
  };
  const rows = async (sql, params) => (await pg.query(sql, params)).rows;
  const first = async (sql, params) => (await rows(sql, params))[0];
  let variant;
  await t.test('anonymous catalog and original data, with no prices copied', async () => {
    await as('anon');
    assert.equal((await rows('select id from products')).length, 13);
    assert.equal((await rows('select id from collections')).length, 13);
    assert.equal((await rows('select id from designs')).length, 12);
    assert.equal((await rows("select id from products where category ilike '%kit%'")).length, 4);
    assert.equal((await first("select custom_quote from collections where id = 'FREE'")).custom_quote, true);
    assert.equal((await rows('select id from variants where price_cents is not null')).length, 0);
    assert.equal((await rows('select id from packaging where price_cents is not null')).length, 0);
    variant = (await first("select id from variants where product_id = 'CAN-001'")).id;
    await assert.rejects(pg.query('select * from orders'), /permission denied/);
    await assert.rejects(pg.query("select fioritta_request_order('[]', 'retirada', $1)", [ids.request]), /permission denied/);
  });

  const line = extra => ({ variant_id: variant, collection_id: 'ESS', design_id: 'ESS-01',
    packaging_id: 'essential', quantity: 2, instructions: 'Personalizar para teste', ...extra });
  const request = (items, address = null, key = ids.request) => first(
    'select fioritta_request_order($1, $2, $3, $4) as id',
    [JSON.stringify(items), address ? 'entrega' : 'retirada', key, address],
  );
  let order;
  let itemId;
  let address;
  await t.test('verified identities, owned addresses, atomic writes and retry safety', async () => {
    await as('authenticated', ids.unconfirmed);
    await pg.query("insert into customers(id,name) values ($1,'Sem confirmação')", [ids.unconfirmed]);
    await assert.rejects(request([line()]), /Confirme o e-mail/);
    await as('authenticated', ids.bob);
    await pg.query("insert into customers(id,name) values ($1,'Bob')", [ids.bob]);
    address = (await first(`insert into addresses(label,postal_code,street,number,district,city,state)
      values ('Casa','12345678','Rua de teste','1','Centro','São Paulo','SP') returning id`)).id;
    await as('authenticated', ids.alice);
    await assert.rejects(request([line()]), /complete o perfil/);
    await pg.query("insert into customers(id,name) values ($1,'Alice')", [ids.alice]);
    await assert.rejects(request([line()], address), /endereço cadastrado/);
    await assert.rejects(request([line(), line({ collection_id: 'BOT' })]), /não pertence/);
    await assert.rejects(request([line({ collection_id: 'FREE', design_id: null, instructions: '  ' })]), /criação exclusiva/);
    assert.equal((await rows('select * from orders')).length, 0);
    order = (await request([line({ total_cents: 100, status: 'em_producao' })])).id;
    assert.equal((await request([line()])).id, order);
    const saved = await first('select status,total_cents from orders where id = $1', [order]);
    assert.deepEqual(saved, { status: 'orcamento_solicitado', total_cents: null });
    itemId = (await first('select id from order_items where order_id = $1', [order])).id;
    assert.equal((await first('select instructions from personalizations where order_item_id = $1', [itemId])).instructions, 'Personalizar para teste');
  });

  await t.test('cross-account reads, writes and Studio functions are blocked', async () => {
    await as('authenticated', ids.bob);
    for (const table of ['orders', 'order_items', 'personalizations', 'payments', 'deliveries', 'change_history', 'customer_support']) {
      assert.equal((await rows('select * from ' + table)).length, 0, table);
    }
    assert.deepEqual(await rows('select id from customers'), [{ id: ids.bob }]);
    assert.equal((await first('select fioritta_is_admin() as allowed')).allowed, false);
    await assert.rejects(pg.query('insert into administrators(id) values ($1)', [ids.bob]), /permission denied/);
    await assert.rejects(pg.query("update orders set total_cents = 100 where id = $1", [order]), /permission denied/);
    await assert.rejects(pg.query("insert into customer_support values ($1, 'Indevida')", [ids.bob]), /row-level security/);
    await assert.rejects(pg.query('select * from fioritta_studio_customers()'), /Acesso restrito/);
    await assert.rejects(pg.query("select fioritta_studio_approval($1,'aprovada')", [itemId]), /Acesso restrito/);
    await assert.rejects(pg.query("select fioritta_studio_order($1,'aguardando_pagamento',100,null,null,null)", [order]), /Acesso restrito/);
    assert.equal((await rows("update products set name = 'Indevido' where id = 'CAN-001' returning id")).length, 0);
    await assert.rejects(pg.query("insert into storage.objects values ('fioritta-catalogo','catalogo/abc.jpg')"), /row-level security/);
  });

  await t.test('admin writes persist, audit records changes and production gates enforce approval and full payment', async () => {
    await as('authenticated', ids.studio);
    assert.equal((await first('select fioritta_is_admin() as allowed')).allowed, true);
    assert.equal((await rows('select * from fioritta_studio_customers()')).length, 3);
    await pg.query("insert into customer_support values ($1, 'Acompanhar retirada')", [ids.alice]);
    assert.equal((await first('select support_note from fioritta_studio_customers() where id = $1', [ids.alice])).support_note, 'Acompanhar retirada');
    await pg.query("update variants set price_cents = 7990, active = false where id = $1", [variant]);
    await pg.query("update products set lead_time = 'Quatro dias úteis' where id = 'CAN-001'");
    await pg.query("insert into storage.objects values ('fioritta-catalogo','catalogo/abc.jpg')");
    assert.equal((await rows('select name from storage.objects')).length, 1);
    await assert.rejects(pg.query("insert into storage.objects values ('fioritta-catalogo','catalogo/abc.svg')"), /row-level security/);
    await pg.query("select fioritta_studio_order($1,'aguardando_pagamento',15980,'2027-01-01',null,null)", [order]);
    await assert.rejects(pg.query("select fioritta_studio_order($1,'em_producao',15980,null,null,null)", [order]), /pagamento integral/);
    await pg.query("select fioritta_studio_approval($1,'aprovada')", [itemId]);
    await pg.exec('reset role');
    await pg.query("insert into payments(order_id,environment,provider_reference,status,amount_cents) values ($1,'test','test-only','confirmado',15980)", [order]);
    await as('authenticated', ids.studio);
    await assert.rejects(pg.query("select fioritta_studio_order($1,'em_producao',15980,null,null,null)", [order]), /pagamento integral/);
    assert((await rows("select id from change_history where table_name = 'variants' and actor_id = $1 and 'price_cents' = any(changed_fields)", [ids.studio])).length);
    await as('anon');
    assert.equal((await rows('select id from variants where id = $1', [variant])).length, 0);
    assert.equal((await first("select lead_time from products where id = 'CAN-001'")).lead_time, 'Quatro dias úteis');
    await as('authenticated', ids.alice);
    assert.equal((await rows('select * from customer_support')).length, 0);
    assert.equal((await first('select total_cents from orders where id = $1', [order])).total_cents, 15980);
    assert.equal((await first('select approval_status from personalizations where order_item_id = $1', [itemId])).approval_status, 'aprovada');
    await assert.rejects(request([line()], null, ids.invalidRequest), /deixou de estar disponível/);
  });
});
