import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';
import config from '../netlify/functions/fioritta-config.mjs';

const origin = 'https://fioritta.example.test';
const backend = 'https://database.example.test';
const key = 'sb_publishable_fixture';
const user = {
  id: '10000000-0000-4000-8000-000000000001',
  aud: 'authenticated', email: 'cliente@example.test', email_confirmed_at: '2026-11-01T00:00:00Z',
  user_metadata: { name: 'Cliente' }, app_metadata: {}, created_at: '2026-11-01T00:00:00Z',
};
const authResponse = { access_token: 'fixture-token', refresh_token: 'fixture-refresh-token',
  expires_in: 3600, token_type: 'bearer', user };
const initialProducts = [{ id: 'CAN-001', name: 'Caneca Clássica', description: 'Porcelana', category: 'Canecas', lead_time: '2 dias úteis' }];
const variants = [{ id: '10000000-0000-4000-8000-000000000002', product_id: 'CAN-001', sku: 'CAN-001-PADRAO', name: 'Padrão' }];
const collections = [{ id: 'ESS', name: 'Essenziale' }, { id: 'FREE', name: 'Libera', custom_quote: true }];
const designs = [{ id: 'ESS-01', collection_id: 'ESS', name: 'Monograma' }];
const packaging = [{ id: 'essential', name: 'Essencial' }];
const settings = { whatsapp: '5511000000000', pickup_instructions: 'Agende pelo WhatsApp.',
  production_notice: 'Pagamento integral antecipado.' };

async function browser(t, { studio = false, admin = false, recovery = false } = {}) {
  const entry = studio ? 'studio-entry' : 'app';
  const { outputFiles } = await build({ entryPoints: ['src/' + entry + '.js'], bundle: true, format: 'iife', write: false });
  const html = readFileSync(studio ? 'public/v3/studio/index.html' : 'public/v3/index.html', 'utf8');
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error));
  const url = origin + (studio ? '/v3/studio/' : '/v3/' + (recovery ? '?redefinir=1' : ''));
  const { window } = new JSDOM(html, { url, virtualConsole, runScripts: 'outside-only' });
  const { document } = window;
  // JSDOM does not implement modal display. Keep the DOM open state available to the application.
  window.HTMLDialogElement.prototype.showModal ??= function () { this.open = true; };
  window.HTMLDialogElement.prototype.close ??= function () { this.open = false; };
  const requests = [];
  const products = structuredClone(initialProducts);
  const tables = { products, variants, collections, designs, packaging, store_settings: settings };
  let profile;
  let signedIn = recovery;
  const orders = [];
  window.Response = Response;
  window.Request = Request;
  window.Headers = Headers;
  if (recovery) {
    window.localStorage.setItem('sb-database-auth-token', JSON.stringify({
      ...authResponse, expires_at: Math.floor(Date.now() / 1000) + 3600,
    }));
  }
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url || input.href, origin);
    const method = init.method || 'GET';
    const body = init.body ? JSON.parse(init.body) : null;
    requests.push({ url, method, body });
    if (url.pathname === '/.netlify/functions/fioritta-config') return Response.json({ url: backend, publishableKey: key });
    if (url.pathname === '/auth/v1/token') {
      signedIn = true;
      return Response.json(authResponse);
    }
    if (url.pathname === '/auth/v1/logout') {
      signedIn = false;
      return new Response(null, { status: 204 });
    }
    if (url.pathname === '/auth/v1/user') return Response.json(user);
    if (url.pathname === '/auth/v1/signup') return Response.json(user);
    if (url.pathname === '/auth/v1/recover') return Response.json({});
    const resource = url.pathname.split('/').at(-1);
    if (resource === 'fioritta_is_admin') return Response.json(signedIn && admin);
    if (method === 'HEAD') return new Response(null, { headers: { 'Content-Range': '0-0/1' } });
    if (resource === 'fioritta_request_order' && signedIn && profile) {
      const id = '10000000-0000-4000-8000-000000000003';
      const line = body.items[0];
      orders.push({ id, status: 'orcamento_solicitado', total_cents: null, created_at: user.created_at,
        deliveries: { method: body.fulfillment }, payments: [],
        order_items: [{ product_name: products[0].name, variant_name: 'Padrão',
          collection_name: 'Essenziale', packaging_name: 'Essencial', quantity: line.quantity,
          personalizations: { approval_status: 'pendente' } }] });
      return Response.json(id);
    }
    if (resource === 'customers' && signedIn) {
      if (method === 'POST' || method === 'PATCH') {
        profile = body;
        return new Response(null, { status: 204 });
      }
      return Response.json(profile ? [profile] : []);
    }
    if (resource === 'addresses' && signedIn) return Response.json([]);
    if (resource === 'orders' && signedIn) return Response.json(orders);
    if (resource === 'products' && method === 'PATCH' && signedIn && admin) {
      products[0] = { ...products[0], ...body };
      return Response.json({ id: products[0].id });
    }
    if (Object.hasOwn(tables, resource)) return Response.json(tables[resource]);
    return Response.json({ message: 'Endpoint inesperado: ' + url.pathname }, { status: 500 });
  };
  window.eval(outputFiles[0].text);
  t.after(() => {
    window.close();
    assert.deepEqual(errors, []);
  });

  const find = selector => document.querySelector(selector);
  const waitFor = async (condition, label) => {
    for (let count = 0; count < 180; count++) {
      const result = condition();
      if (result) return result;
      await delay(10);
    }
    assert.fail('A interface não chegou ao estado: ' + label + '. ' + document.body.textContent.trim().slice(-550));
  };
  const wait = selector => waitFor(() => find(selector), selector);
  const form = (selector, values) => {
    const form = find(selector);
    for (const [name, value] of Object.entries(values)) form.elements[name].value = value;
    form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  };
  return { window, find, wait, waitFor, form, requests };
}

test('catálogo público, Libera, cadastro, login, perfil, checkout e histórico', async t => {
  const ui = await browser(t);
  (await ui.wait('[data-product="CAN-001"]')).click();
  const customize = ui.find('#customize');
  customize.elements.collection_id.value = 'FREE';
  customize.elements.collection_id.dispatchEvent(new ui.window.Event('change'));
  assert.equal(customize.elements.instructions.required, true);
  customize.elements.collection_id.value = 'ESS';
  customize.elements.collection_id.dispatchEvent(new ui.window.Event('change'));
  assert.equal(customize.elements.instructions.required, false);
  ui.form('#customize', { quantity: '2', instructions: 'Arte para teste' });
  await ui.waitFor(() => ui.find('#cart-count').textContent === '2', 'item na sacola');
  assert.equal(ui.find('#checkout'), null);
  await ui.wait('[data-mode="signup"]').then(button => button.click());
  ui.form('#auth-form', { name: 'Cliente', email: user.email, password: 'fixture-password' });
  await ui.waitFor(() => ui.find('#account-message').textContent.includes('confirmação'), 'confirmação de cadastro');
  const signup = ui.requests.find(request => request.url.pathname.endsWith('/signup'));
  assert.equal(signup.url.searchParams.get('redirect_to'), origin + '/v3/');
  ui.find('[data-mode="login"]').click();
  ui.form('#auth-form', { email: user.email, password: 'fixture-password' });
  await ui.wait('#profile-form');
  assert.equal(ui.find('#checkout'), null);
  ui.form('#profile-form', { name: 'Cliente', phone: '' });
  await ui.wait('#checkout');
  ui.form('#checkout', { fulfillment: 'retirada' });
  await ui.waitFor(() => ui.find('#cart-message').textContent.includes('Solicitação registrada'), 'checkout persistido');
  await ui.waitFor(() => ui.find('#account').textContent.includes('Orçamento solicitado'), 'histórico atualizado');
  assert.equal(ui.requests.find(r => r.url.pathname.endsWith('/fioritta_request_order')).body.items[0].quantity, 2);
  ui.find('#sign-out').click();
  await ui.wait('#auth-form');
  assert.equal(ui.find('#account').textContent.includes('Orçamento solicitado'), false);
});

test('recuperação solicita retorno e a sessão recuperada pode alterar a senha', async t => {
  const original = await browser(t);
  (await original.wait('[data-mode="recovery"]')).click();
  original.form('#auth-form', { email: user.email });
  await original.waitFor(() => original.requests.some(r => r.url.pathname.endsWith('/recover')), 'requisição de recuperação');
  assert.equal(original.requests.find(r => r.url.pathname.endsWith('/recover')).url.searchParams.get('redirect_to'),
    origin + '/v3/?redefinir=1');
  const recovered = await browser(t, { recovery: true });
  await recovered.wait('#auth-form input[name="password"]');
  assert(recovered.find('#auth-form').textContent.includes('Nova senha'));
  recovered.form('#auth-form', { password: 'rotated-fixture-password' });
  await recovered.waitFor(() => recovered.find('#account-message').textContent.includes('Senha atualizada'), 'senha alterada');
  assert.equal(recovered.requests.find(r => r.method === 'PUT' && r.url.pathname.endsWith('/user')).body.password,
    'rotated-fixture-password');
});

test('Studio rejeita clientes; administração navega e salva produto persistente', async t => {
  const unauthorized = await browser(t, { studio: true });
  await unauthorized.wait('#studio-login');
  unauthorized.form('#studio-login', { email: user.email, password: 'fixture-password' });
  await unauthorized.waitFor(() => unauthorized.find('#studio-message').textContent.includes('não tem acesso'), 'acesso negado');
  assert.equal(unauthorized.find('[data-tab]'), null);
  assert.equal(unauthorized.requests.some(r => r.url.pathname.startsWith('/rest/v1/') && !r.url.pathname.includes('/rpc/')), false);

  const admin = await browser(t, { studio: true, admin: true });
  await admin.wait('#studio-login');
  admin.form('#studio-login', { email: user.email, password: 'fixture-password' });
  await admin.wait('.stats');
  admin.find('[data-tab="products"]').click();
  await admin.wait('form[data-row="CAN-001"]');
  admin.form('form[data-row="CAN-001"]', { name: 'Caneca Clássica editada' });
  await admin.waitFor(() => admin.find('form[data-row="CAN-001"] input[name="name"]')?.value === 'Caneca Clássica editada'
    && admin.find('#studio-message').textContent.includes('salvas'), 'edição persistente');
  admin.find('[data-signout]').click();
  await admin.wait('#studio-login');
  assert.equal(admin.find('[data-tab]'), null);
});

test('a função Netlify devolve exclusivamente configuração pública e rejeita chaves indevidas', async t => {
  const fixture = { SUPABASE_URL: backend, SUPABASE_PUBLISHABLE_KEY: key,
    FiorittaNetlify: 'fixture-private', MP_TEST_PUBLIC_KEY: 'fixture-mp-public', MP_TEST_ACCESS_TOKEN: 'fixture-mp-private' };
  const old = Object.fromEntries(Object.keys(fixture).map(name => [name, process.env[name]]));
  Object.assign(process.env, fixture);
  t.after(() => {
    for (const [name, value] of Object.entries(old)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
  const request = new Request(origin + '/.netlify/functions/fioritta-config');
  const response = await config(request);
  assert.deepEqual(await response.json(), { url: backend, publishableKey: key });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await config(new Request(request, { method: 'POST' }))).status, 405);
  process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_secret_fixture';
  const invalid = await config(request);
  assert.equal(invalid.status, 503);
  assert.equal((await invalid.text()).includes('sb_secret_fixture'), false);
});
