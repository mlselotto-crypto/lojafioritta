import { $, escape as e, date, money, statuses, approvals, notify, connect, data,
  image, imagePath, options, busy } from './shared.js';

let db;
let signedInUser;
let allowed = false;
let sessionRevision = 0;
let viewRevision = 0;
let tab = 'dashboard';
let page = 0;

const message = value => notify('studio-message', value);
const root = $('studio');
const tabs = {
  dashboard: 'Dashboard', products: 'Produtos', variants: 'Variantes', collections: 'Coleções',
  designs: 'Estampas', packaging: 'Embalagens', customers: 'Clientes', orders: 'Pedidos',
  settings: 'Configurações', history: 'Histórico',
};
const imageTypes = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif' };
const imageBucket = 'fioritta-catalogo';
const pageSize = 25;

function input(name, label, value, attrs = '') {
  return `<label>${label}<input name="${name}" value="${e(value)}" ${attrs}></label>`;
}
function textarea(name, label, value, attrs = '') {
  return `<label>${label}<textarea name="${name}" ${attrs}>${e(value)}</textarea></label>`;
}
function select(name, label, rows, value) {
  return `<label>${label}<select name="${name}" required>${options(rows, value)}</select></label>`;
}
function selectLabels(name, label, rows, value) {
  return select(name, label, Object.entries(rows).map(([id, name]) => ({ id, name })), value);
}
function checkbox(name, label, value = true) {
  return `<label class="check"><input type="checkbox" name="${name}" ${value ? 'checked' : ''}> ${label}</label>`;
}
const active = row => checkbox('active', 'Disponível no catálogo', row.active);
const price = (row, name = 'price_cents', label = 'Preço em reais (ex.: 79,90)') =>
  input(name, label, row[name] == null ? '' : (row[name] / 100).toFixed(2).replace('.', ','), 'inputmode="decimal" maxlength="12"');
const identifier = (row, label = 'Código') => input('id', label, row.id,
  'required maxlength="40" pattern="[A-Z0-9][A-Z0-9_\\x2d]{0,39}"' + (row.id ? ' readonly' : ''));
const nameField = row => input('name', 'Nome', row.name, 'required maxlength="160"');
const imageFields = row => `
  ${row.image_path ? image(row.image_path, '', 'preview') : ''}
  <div class="fields">
    ${input('image_path', 'Caminho /assets/… ou URL HTTPS', row.image_path, 'maxlength="1024"')}
    <label>Enviar imagem (até 6 MB)<input type="file" name="image_upload" accept="image/jpeg,image/png,image/webp,image/avif"></label>
  </div>`;

const catalogEditors = {
  products: {
    one: 'produto',
    edit: row => identifier(row) + nameField(row) + input('category', 'Categoria', row.category, 'required maxlength="100"') +
      input('lead_time', 'Prazo de produção', row.lead_time, 'maxlength="160"') +
      textarea('description', 'Descrição', row.description, 'maxlength="1500"') +
      imageFields(row) + checkbox('illustrated', 'Imagem ilustrativa disponível', row.illustrated ?? false) + active(row),
  },
  variants: {
    one: 'variante', parent: 'products',
    edit: (row, parents) => select('product_id', 'Produto', parents, row.product_id) +
      input('sku', 'SKU', row.sku, 'required maxlength="80"') + nameField(row) + price(row) + imageFields(row) + active(row),
  },
  collections: {
    one: 'coleção',
    edit: row => identifier(row) + nameField(row) + textarea('description', 'Descrição', row.description, 'maxlength="1500"') +
      input('priority', 'Ordem de exibição', row.priority ?? 1, 'type="number" min="1" max="9999" required') + imageFields(row) +
      checkbox('custom_quote', 'Exigir detalhes da criação exclusiva', row.custom_quote ?? false) + active(row),
  },
  designs: {
    one: 'estampa', parent: 'collections',
    edit: (row, parents) => identifier(row) + select('collection_id', 'Coleção', parents, row.collection_id) +
      nameField(row) + imageFields(row) + active(row),
  },
  packaging: {
    one: 'embalagem',
    edit: row => input('id', 'Código', row.id,
      'required maxlength="40" pattern="[a-z0-9][a-z0-9_\\x2d]{0,39}"' + (row.id ? ' readonly' : '')) + nameField(row) + price(row) + active(row),
  },
};

function renderGate(state) {
  const signedIn = ['pending', 'denied', 'error'].includes(state);
  const signOut = '<button type="button" class="secondary" data-signout>Sair</button>';
  root.innerHTML = signedIn ? (state === 'pending' ? '' : `<div class="actions">${signOut}<a href="/v3/#conta">Minha conta</a></div>`) : `
    <form class="panel" id="studio-login">
      <label>E-mail<input name="email" type="email" autocomplete="email" required></label>
      <label>Senha<input name="password" type="password" autocomplete="current-password" required></label>
      <button type="submit">Entrar</button><a href="/v3/#conta">Cadastro e recuperação de senha</a>
    </form>`;
}

function paging(hasMore) {
  return `<div class="actions">${page ? '<button type="button" class="secondary" data-paging="-1">Anteriores</button>' : ''}
    ${hasMore ? '<button type="button" class="secondary" data-paging="1">Próximos</button>' : ''}</div>`;
}

function studioView(body) {
  root.innerHTML = `<nav class="studio-nav" aria-label="Administração">
    ${Object.entries(tabs).map(([key, name]) => `<button type="button" data-tab="${key}" class="${tab === key ? '' : 'secondary'}"
    aria-pressed="${tab === key}">${name}</button>`).join('')}
    <button type="button" class="secondary" data-signout>Sair</button>
  </nav><section id="studio-content"><h2>${tabs[tab]}</h2>${body}</section>`;
}

function pageRange(query) {
  return query.range(page * pageSize, page * pageSize + pageSize);
}

async function count(query) {
  const result = await query;
  if (result.error) throw result.error;
  return result.count;
}

async function dashboard() {
  const [products, customers, quotes, production] = await Promise.all([
    count(db.from('products').select('id', { count: 'exact', head: true }).eq('active', true)),
    count(db.from('customers').select('id', { count: 'exact', head: true })),
    count(db.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'orcamento_solicitado')),
    count(db.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'em_producao')),
  ]);
  return `<div class="stats">${[
    [products, 'Produtos disponíveis'], [customers, 'Clientes cadastrados'],
    [quotes, 'Orçamentos solicitados'], [production, 'Pedidos em produção'],
  ].map(([value, label]) => `<article class="panel"><strong>${value}</strong>${label}</article>`).join('')}</div>`;
}

async function catalogBody(table, openId) {
  const editor = catalogEditors[table];
  const [rows, parents] = await Promise.all([
    data(pageRange(db.from(table).select('*').order('name').order('id'))),
    editor.parent ? data(db.from(editor.parent).select('id,name').order('name')) : [],
  ]);
  const form = row => `<form data-table="${table}" data-row="${e(row.id)}">
    ${editor.edit(row, parents)}<button type="submit">Salvar ${editor.one}</button>
  </form>`;
  return `<div class="stack">
    ${!editor.parent || parents.length ? `<details><summary>Adicionar ${editor.one}</summary>${form({})}</details>` : '<p>Cadastre o item relacionado antes de continuar.</p>'}
    ${rows.slice(0, pageSize).map(row => `<details ${row.id === openId ? 'open' : ''}><summary>${e(row.name)} · ${e(row.sku || row.id)}${row.active ? '' : ' · Indisponível'}</summary>${form(row)}</details>`).join('')}
    ${paging(rows.length > pageSize)}
  </div>`;
}

async function customersBody(openId) {
  const rows = await data(db.rpc('fioritta_studio_customers', { page_offset: page * pageSize }));
  return `<div class="stack">${rows.slice(0, pageSize).map(row => `<details ${row.id === openId ? 'open' : ''}>
    <summary>${e(row.name)} · ${e(row.email)}</summary>
    <div class="stack">
      <p>Cadastro em ${e(date(row.created_at))}${row.phone ? ' · Telefone ' + e(row.phone) : ''}</p>
      <form data-customer-support="${e(row.id)}">
        ${textarea('note', 'Anotação interna de atendimento', row.support_note, 'maxlength="1600"')}
        <div class="actions">
          <button type="submit">Salvar anotação</button>
          <button type="button" class="secondary" data-customer-orders="${e(row.id)}">Ver pedidos</button>
        </div>
      </form>
    </div>
  </details>`).join('') || '<p>Nenhum cliente nesta página.</p>'}${paging(rows.length > pageSize)}</div>`;
}

let customerFilter;
const studioOrderColumns = 'id,status,total_cents,created_at,production_due,customers(name,phone),deliveries(method,address_snapshot,pickup_at,tracking_code),payments(status,amount_cents,environment),order_items(id,product_name,variant_name,collection_name,design_name,packaging_name,quantity,personalizations(instructions,approval_status,approved_at))';
const fulfillmentLabels = { retirada: 'Retirada agendada', entrega: 'Entrega sob consulta' };
const transitions = {
  orcamento_solicitado: ['aguardando_pagamento', 'cancelado'],
  aguardando_pagamento: ['em_producao', 'cancelado'],
  em_producao: ['pronto'], pronto: ['concluido'], concluido: [], cancelado: [],
};
function localPickup(value) {
  if (!value) return '';
  const format = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const parts = Object.fromEntries(format.formatToParts(new Date(value)).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function displayAddress(address) {
  if (!address) return '';
  return `<p>${e(address.street)}, ${e(address.number)} ${e(address.complement)} · ${e(address.district)}
    · ${e(address.city)}/${e(address.state)} · CEP ${e(address.postal_code)}</p>`;
}

function studioOrder(order, openId) {
  const delivery = order.deliveries;
  const editableApproval = ['orcamento_solicitado', 'aguardando_pagamento'].includes(order.status);
  const validStatuses = Object.fromEntries([order.status, ...transitions[order.status]].map(s => [s, statuses[s]]));
  return `<details ${order.id === openId ? 'open' : ''}><summary>${e(order.customers?.name)} · ${e(date(order.created_at))}
    · ${e(statuses[order.status])} · ${money(order.total_cents)}</summary>
    <div class="stack">
      <p>Pedido ${e(order.id)} ${order.customers?.phone ? '· Telefone ' + e(order.customers.phone) : ''}</p>
      ${order.order_items.map(item => `<article class="panel stack">
        <strong>${item.quantity} × ${e(item.product_name)} · ${e(item.variant_name)} · ${e(item.collection_name)}
        ${item.design_name ? ' · ' + e(item.design_name) : ''} · ${e(item.packaging_name)}</strong>
        <p>${e(item.personalizations?.instructions || 'Sem instruções adicionais.')}</p>
        ${editableApproval ? `<form data-approval="${e(item.id)}" data-order-id="${e(order.id)}">
          ${selectLabels('approval', 'Aprovação da arte pelo WhatsApp', approvals, item.personalizations?.approval_status)}
          <button type="submit">Registrar aprovação</button></form>` :
          '<p>Arte: ' + e(approvals[item.personalizations?.approval_status]) + '</p>'}
      </article>`).join('')}
      <div><strong>${e(fulfillmentLabels[delivery?.method])}</strong>${displayAddress(delivery?.address_snapshot)}</div>
      <div><strong>Pagamentos</strong>
        ${order.payments.length ? '<ul>' + order.payments.map(p =>
          `<li>${money(p.amount_cents)} · ${e(p.status)}${p.environment === 'test' ? ' · Teste' : ''}</li>`).join('') + '</ul>' : '<p>Nenhum registro.</p>'}
      </div>
      <form data-order="${e(order.id)}">
        <div class="fields">
          ${selectLabels('next_status', 'Status', validStatuses, order.status)}
          ${price(order, 'total_cents', 'Valor final em reais') }
          ${input('production_due', 'Prazo de produção', order.production_due, 'type="date"')}
          ${delivery?.method === 'retirada' ?
            input('pickup_at', 'Retirada (horário de São Paulo)', localPickup(delivery.pickup_at), 'type="datetime-local"') :
            input('tracking_code', 'Código de rastreio', delivery?.tracking_code, 'maxlength="120"')}
        </div>
        <button type="submit">Salvar pedido</button>
      </form>
    </div>
  </details>`;
}

async function ordersBody(openId) {
  let query = db.from('orders').select(studioOrderColumns).order('created_at', { ascending: false }).order('id');
  if (customerFilter) query = query.eq('customer_id', customerFilter);
  const rows = await data(pageRange(query));
  return `<div class="stack">${customerFilter ? '<button type="button" class="secondary" data-clear-filter>Mostrar todos os pedidos</button>' : ''}
    ${rows.slice(0, pageSize).map(order => studioOrder(order, openId)).join('') || '<p>Nenhum pedido nesta página.</p>'}
    ${paging(rows.length > pageSize)}</div>`;
}

async function settingsBody() {
  const row = await data(db.from('store_settings').select('*').single());
  return `<form class="panel" id="commercial-settings">
    ${input('whatsapp', 'WhatsApp com DDI e DDD (somente números)', row.whatsapp, 'required inputmode="numeric" pattern="[1-9][0-9]{10,14}"')}
    ${textarea('pickup_instructions', 'Instruções de retirada', row.pickup_instructions, 'required maxlength="1500"')}
    ${textarea('production_notice', 'Política de produção e pagamento', row.production_notice, 'required maxlength="1500"')}
    <button type="submit">Salvar configurações</button>
  </form>`;
}

async function historyBody() {
  const rows = await data(pageRange(db.from('change_history').select('created_at,table_name,row_key,operation,changed_fields,actor_id')
    .order('id', { ascending: false })));
  return `<div class="stack">${rows.slice(0, pageSize).map(row => `<article class="panel">
    <strong>${e(({ INSERT: 'Criação', UPDATE: 'Edição', DELETE: 'Remoção' })[row.operation])} · ${e(row.table_name)}</strong>
    <p>${e(row.row_key)} · ${e(date(row.created_at))}</p><p>Campos: ${e(row.changed_fields.join(', '))}</p>
    <p>Conta responsável: ${e(row.actor_id || 'Sistema')}</p>
  </article>`).join('') || '<p>Nenhuma alteração registrada.</p>'}${paging(rows.length > pageSize)}</div>`;
}

async function render(openId) {
  if (!allowed) return;
  const revision = ++viewRevision;
  studioView('<p>Carregando…</p>');
  let html;
  switch (tab) {
    case 'dashboard': html = await dashboard(); break;
    case 'customers': html = await customersBody(openId); break;
    case 'orders': html = await ordersBody(openId); break;
    case 'settings': html = await settingsBody(); break;
    case 'history': html = await historyBody(); break;
    default: html = await catalogBody(tab, openId);
  }
  if (allowed && revision === viewRevision) studioView(html);
}

function cents(value) {
  if (!value?.trim()) return null;
  if (!/^\d{1,8}(?:[,.]\d{1,2})?$/.test(value.trim())) throw new Error('Informe um valor em reais, como 79,90.');
  const [whole, fraction = ''] = value.trim().split(/[,.]/);
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (result > 2147483647) throw new Error('O valor informado excede o limite.');
  return result;
}

async function saveCatalog(form, values) {
  const table = form.dataset.table;
  const existing = form.dataset.row;
  const file = values.image_upload;
  delete values.image_upload;
  for (const [key, value] of Object.entries(values)) values[key] = value.trim();
  if ('price_cents' in values) values.price_cents = cents(values.price_cents);
  if ('priority' in values) values.priority = Number(values.priority);
  for (const key of ['active', 'illustrated', 'custom_quote']) {
    if (form.elements[key]) values[key] = form.elements[key].checked;
  }
  if (values.image_path && !imagePath(values.image_path) && !file?.size) {
    throw new Error('Use um caminho em /assets/ ou uma URL HTTPS para a imagem.');
  }
  let uploaded;
  if (file?.size) {
    const extension = imageTypes[file.type];
    if (!extension || file.size > 6291456) throw new Error('Selecione uma imagem JPEG, PNG, WebP ou AVIF de até 6 MB.');
    uploaded = 'catalogo/' + crypto.randomUUID() + '.' + extension;
    await data(db.storage.from(imageBucket).upload(uploaded, file, { contentType: file.type }));
    values.image_path = db.storage.from(imageBucket).getPublicUrl(uploaded).data.publicUrl;
  } else if ('image_path' in values) {
    values.image_path = imagePath(values.image_path) || null;
  }

  let row;
  try {
    if (existing) delete values.id;
    row = await data((existing ? db.from(table).update(values).eq('id', existing) :
      db.from(table).insert(values)).select('id').single());
  } catch (error) {
    // Only clean up after a definitive database rejection. A transport
    // failure may have occurred after the row was committed.
    if (uploaded && /^[0-9A-Z]{5}$/.test(error.code ?? '')) {
      await db.storage.from(imageBucket).remove([uploaded]);
    }
    throw error;
  }
  return row.id;
}

document.addEventListener('submit', event => {
  if (!db) return;
  event.preventDefault();
  const form = event.target;
  if (form.id === 'studio-login') {
    void busy(form, async values => {
      await data(db.auth.signInWithPassword(values));
    }, message);
    return;
  }
  if (!allowed) return;
  void busy(form, async values => {
    if (form.dataset.table) {
      await render(await saveCatalog(form, values));
    } else if (form.dataset.customerSupport) {
      const id = form.dataset.customerSupport;
      await data(db.from('customer_support').upsert({ id, note: values.note.trim() }));
      await render(id);
    } else if (form.dataset.order) {
      await data(db.rpc('fioritta_studio_order', {
        target_order: form.dataset.order, next_status: values.next_status, quoted_cents: cents(values.total_cents),
        due_on: values.production_due || null, pickup_on: values.pickup_at ? values.pickup_at + ':00-03:00' : null,
        tracking: values.tracking_code || null,
      }));
      await render(form.dataset.order);
    } else if (form.dataset.approval) {
      await data(db.rpc('fioritta_studio_approval', { target_item: form.dataset.approval, next_approval: values.approval }));
      await render(form.dataset.orderId);
    } else if (form.id === 'commercial-settings') {
      await data(db.from('store_settings').update(values).eq('id', true).select('id').single());
      await render();
    }
    if (allowed) message('Alterações salvas.');
  }, message);
});

document.addEventListener('click', async event => {
  const button = event.target.closest('button');
  if (!button || !db) return;
  try {
    if (button.hasAttribute('data-signout')) {
      await data(db.auth.signOut({ scope: 'local' }));
      return;
    }
    if (!allowed) return;
    if (button.dataset.tab) {
      tab = button.dataset.tab;
      customerFilter = undefined;
      page = 0;
    } else if (button.dataset.paging) {
      page += Number(button.dataset.paging);
    } else if (button.dataset.customerOrders || button.hasAttribute('data-clear-filter')) {
      tab = 'orders';
      customerFilter = button.dataset.customerOrders;
      page = 0;
    } else {
      return;
    }
    message('');
    await render();
  } catch (error) {
    message(error.message);
  }
});

async function initialize() {
  db = await connect();
  db.auth.onAuthStateChange((event, session) => {
    if (event === 'TOKEN_REFRESHED' || (event === 'SIGNED_IN' && signedInUser && signedInUser === session?.user.id)) return;
    signedInUser = session?.user.id;
    const revision = ++sessionRevision;
    allowed = false;
    ++viewRevision;
    if (!session) {
      tab = 'dashboard';
      page = 0;
      customerFilter = undefined;
      message('Entre com uma conta administrativa autorizada.');
      renderGate('login');
      return;
    }
    message('Verificando acesso…');
    renderGate('pending');
    setTimeout(async () => {
      try {
        const isAdmin = await data(db.rpc('fioritta_is_admin'));
        if (revision !== sessionRevision) return;
        allowed = isAdmin === true;
        if (!allowed) {
          message('Esta conta não tem acesso ao Fioritta Studio.');
          renderGate('denied');
          return;
        }
        message('');
        await render();
      } catch (error) {
        if (revision !== sessionRevision) return;
        message(error.message);
        if (!allowed) renderGate('error');
      }
    }, 0);
  });
}

void initialize().catch(error => message(error.message));
