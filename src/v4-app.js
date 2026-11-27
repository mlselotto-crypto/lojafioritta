import { $, escape as e, money, date, statuses, approvals, notify, connect, data,
  image, options, whatsappLink, busy } from './shared.js';

const titles = { ESS:'Minimalista', BOT:'Floral', CEL:'Celebrações', PRO:'Fé & Gratidão', HER:'Vintage & Clássicos', DOL:'Pequenos Prazeres', VIV:'Cores & Alegria', LIB:'Universo Literário', AFF:'Amor & Afeto', VIA:'Viagens & Memórias', PFE:'Profissões', PIC:'Universo Infantil', FREE:'Criação Exclusiva' };
const collectionLabel = c => titles[c.id] || c.name;
let activeCategory = '';
let db;
let catalog;
let session;
let profile;
let addresses = [];
let authMode = 'login';
let loadingAccount = false;
let orderPage = 0;
let accountVersion = 0;
let cart = [];
let requestId;

try {
  const saved = JSON.parse(sessionStorage.getItem('fioritta-v3-cart') || '{}');
  if (Array.isArray(saved.lines)) cart = saved.lines.slice(0, 20);
  requestId = saved.requestId;
} catch {
  cart = [];
}

const accountMessage = message => notify('account-message', message);
const cartMessage = message => notify('cart-message', message);

function storeCart(renew = false) {
  if (renew || !requestId) requestId = crypto.randomUUID();
  try {
    sessionStorage.setItem('fioritta-v3-cart', JSON.stringify({ lines: cart, requestId }));
  } catch {
    // The current tab still retains the cart in memory.
  }
}

const orderColumns = 'id,status,total_cents,created_at,production_due,deliveries(method,pickup_at,tracking_code),payments(status,amount_cents,environment),order_items(product_name,variant_name,collection_name,design_name,packaging_name,quantity,personalizations(approval_status))';

async function loadCatalog() {
  const [products, variants, collections, designs, packaging, settings] = await Promise.all([
    data(db.from('products').select('*').eq('active', true).order('id')),
    data(db.from('variants').select('*').eq('active', true).order('sku')),
    data(db.from('collections').select('*').eq('active', true).order('priority').order('id')),
    data(db.from('designs').select('*').eq('active', true).order('id')),
    data(db.from('packaging').select('*').eq('active', true).order('id')),
    data(db.from('store_settings').select('*').single()),
  ]);
  catalog = { products, variants, collections, designs, packaging, settings };
  renderProducts();
  $('collections').innerHTML = collections.map(c => `
    <article class="card" id="colecao-${e(c.id)}">${image(c.image_path, collectionLabel(c))}
      <div class="card-body"><h3>${e(collectionLabel(c))}</h3><p class="signature">${e(c.name)}</p><p>${e(c.description)}</p>
      ${c.custom_quote ? '<p>Criação exclusiva sob orçamento.</p>' : ''}</div>
    </article>`).join('');
  renderCart();
}

function renderProducts() {
  const term = $('search').value.trim().toLocaleLowerCase('pt-BR');
  const products = catalog.products.filter(p =>
    (!activeCategory || p.category === activeCategory) && [p.name, p.category, p.description].join(' ').toLocaleLowerCase('pt-BR').includes(term));
  notify('catalog-status', products.length ? '' : 'Nenhum produto encontrado.');
  $('products').innerHTML = products.map(p => {
    const variants = catalog.variants.filter(v => v.product_id === p.id);
    const prices = variants.flatMap(v => v.price_cents == null ? [] : [v.price_cents]);
    return `<article class="card">${image(p.image_path, p.name)}<div class="card-body">
      <p class="muted">${e(p.category)}</p><h3>${e(p.name)}</h3><p>${e(p.description)}</p>
      <p>${variants.length ? (prices.length ? 'A partir de ' + money(Math.min(...prices)) : 'Sob orçamento') : 'Indisponível'}</p>
      <button type="button" data-product="${e(p.id)}" ${!variants.length || !catalog.collections.length || !catalog.packaging.length ? 'disabled' : ''}>Personalizar</button>
    </div></article>`;
  }).join('');
}

function openProduct(id) {
  const product = catalog.products.find(p => p.id === id);
  const variants = catalog.variants.filter(v => v.product_id === id);
  $('product-details').innerHTML = `
    <form id="customize">
      <div class="actions"><h2 id="product-title">${e(product.name)}</h2><button type="button" class="secondary" id="close-product">Fechar</button></div>
      <div id="variant-preview"></div>
      <p class="muted">${e(product.lead_time)}</p>
      <div class="fields">
        <label>Variante<select name="variant_id">${options(variants.map(v => ({ ...v, name: v.name + ' · ' + money(v.price_cents) })))}</select></label>
        <label>Coleção<select name="collection_id">${options(catalog.collections.map(c=>({...c,name:collectionLabel(c)+' · '+c.name})))}</select></label>
        <label>Estampa<select name="design_id"></select></label>
        <label>Embalagem<select name="packaging_id">${options(catalog.packaging.map(p => ({ ...p, name: p.name + ' · ' + money(p.price_cents) })))}</select></label>
      </div>
      <div id="design-preview"></div>
      <div id="live-personalizer" hidden></div><label>Detalhes da personalização<textarea name="instructions" maxlength="1200" placeholder="Nome, frase ou ideia para a arte"></textarea></label>
      <label>Quantidade<input type="number" name="quantity" min="1" max="20" value="1" required></label>
      <button type="submit">Adicionar à sacola</button>
    </form>`;
  const form = $('customize');
  const live = $('live-personalizer');
  const inkOptions = {'bordeaux':'#610027','preto':'#252525','azul':'#48647E'};
  const fonts = {'classica':'Georgia, serif','moderna':'Arial, sans-serif'};
  live.innerHTML = '<div class="live-preview"><svg viewBox="0 0 320 235" role="img" aria-label="Simulação ilustrativa de caneca"><defs><linearGradient id="cup-shade"><stop stop-color="#ddd5ce"/><stop offset=".4" stop-color="#fff"/><stop offset="1" stop-color="#e3ded7"/></linearGradient></defs><ellipse cx="171" cy="217" rx="104" ry="11" fill="#d8c5b8"/><path id="cup-handle" d="M94 78 C23 43 18 180 94 176" fill="none" stroke="#fff" stroke-width="20"/><path d="M90 48 L90 190 Q90 213 175 213 Q260 213 260 190 L260 48Z" fill="url(#cup-shade)" stroke="#d5c9c2"/><ellipse cx="175" cy="48" rx="85" ry="18" fill="#fff" stroke="#d5c9c2"/><ellipse cx="175" cy="48" rx="73" ry="11" id="cup-inner" fill="#eee7df"/><text id="preview-name" x="175" y="135" text-anchor="middle" font-size="24" fill="#610027" font-family="Georgia,serif">Seu nome</text></svg><p>Simulação ilustrativa do nome; não representa a arte final aprovada.</p></div><div class="live-controls"><label>Nome para personalizar<input name="live_name" maxlength="22" placeholder="Digite seu nome"></label><div class="fields"><label>Fonte<select name="live_font"><option value="classica">Clássica</option><option value="moderna">Moderna</option></select></label><label>Cor<select name="live_color"><option value="bordeaux">Bordeaux</option><option value="preto">Preto</option><option value="azul">Azul</option></select></label></div></div>';
  function paintName() {
    const name = form.elements.live_name.value.trim();
    const node = $('preview-name');
    node.textContent = name || 'Seu nome';
    node.setAttribute('font-size', String(Math.min(25, 140 / Math.max(5, name.length) * 1.6)));
    node.setAttribute('font-family', fonts[form.elements.live_font.value]);
    node.setAttribute('fill', inkOptions[form.elements.live_color.value]);
    const handleColor = ({'CAN-002':'#610027','CAN-003':'#d7a0aa','CAN-004':'#292929'})[product.id] || '#fff';
    $('cup-handle').setAttribute('stroke',handleColor);
    $('cup-inner').setAttribute('fill',handleColor === '#fff' ? '#eee7df' : handleColor);
  }
  function togglePersonalizer() {
    const enabled = /^CAN-00[1-4]$/.test(product.id) && form.elements.design_id.value === 'ESS-01';
    live.hidden = !enabled;
    for (const key of ['live_name','live_font','live_color']) form.elements[key].disabled = !enabled;
    if (enabled) paintName();
  }
  live.addEventListener('input', paintName);
  live.addEventListener('change', paintName);
  function updatePreview() {
    const design = catalog.designs.find(d => d.id === form.elements.design_id.value);
    const collection = catalog.collections.find(c => c.id === form.elements.collection_id.value);
    togglePersonalizer();
    $('design-preview').innerHTML = image(design?.image_path || collection.image_path, design?.name || collection.name, 'preview') +
      (collection.custom_quote ? '<p>Descreva a sua ideia para receber um orçamento da coleção Libera.</p>' : '');
  }
  function updateCollection() {
    const collection = catalog.collections.find(c => c.id === form.elements.collection_id.value);
    form.elements.design_id.innerHTML = '<option value="">A definir</option>' +
      options(catalog.designs.filter(d => d.collection_id === collection.id));
    form.elements.instructions.required = collection.custom_quote;
    updatePreview();
  }
  function updateVariant() {
    const variant = variants.find(v => v.id === form.elements.variant_id.value);
    $('variant-preview').innerHTML = image(variant?.image_path || product.image_path, product.name, 'preview');
  }
  form.elements.variant_id.onchange = updateVariant;
  updateVariant();
  form.elements.collection_id.onchange = updateCollection;
  form.elements.design_id.onchange = updatePreview;
  $('close-product').onclick = () => $('product-dialog').close();
  updateCollection();
  $('product-dialog').showModal();
}

function cartLine(line, index) {
  return `<div class="panel actions"><div><strong>${e(line.label)}</strong>
    <div>${e(line.collection)} · ${e(line.quantity)} un.</div></div>
    <button type="button" class="secondary" data-remove="${index}">Remover</button></div>`;
}

function renderCart() {
  $('cart-count').textContent = cart.reduce((sum, line) => sum + Number(line.quantity || 0), 0);
  if (!cart.length) {
    $('cart').innerHTML = '<p>Sua sacola está vazia.</p>';
    return;
  }
  const controls = loadingAccount ? '<p>Verificando conta…</p>' : !session ? '<p><a href="#conta">Entre ou crie sua conta</a> para solicitar o orçamento.</p>' :
    !profile ? '<p>Complete <a href="#conta">seu perfil</a> para continuar.</p>' : `
    <form class="panel" id="checkout">
      <p>${e(catalog?.settings.production_notice)} Nenhuma cobrança é iniciada nesta etapa.</p>
      <label>Recebimento<select name="fulfillment"><option value="retirada">Retirada agendada</option><option value="entrega">Consultar entrega</option></select></label>
      <p id="pickup-note">${e(catalog?.settings.pickup_instructions)}</p>
      <label id="checkout-address" hidden>Endereço
        <select name="selected_address" disabled>${options(addresses)}</select>
      </label>
      <p id="address-help" hidden><a href="#conta">Cadastre um endereço</a> para consultar a entrega.</p>
      <button type="submit" ${catalog ? '' : 'disabled'}>Solicitar orçamento</button>
    </form>`;
  $('cart').innerHTML = `<div class="stack">${cart.map(cartLine).join('')}${controls}</div>`;
  const form = $('checkout');
  if (form) {
    form.elements.fulfillment.onchange = () => {
      const delivery = form.elements.fulfillment.value === 'entrega';
      $('pickup-note').hidden = delivery;
      $('checkout-address').hidden = $('checkout-address').querySelector('select').disabled = !delivery || !addresses.length;
      $('address-help').hidden = !delivery || !!addresses.length;
      form.querySelector('button[type=submit]').disabled = !catalog || (delivery && !addresses.length);
    };
  }
}

function renderAuth() {
  const recovery = authMode === 'new-password';
  const titles = {
    login: 'Entrar', signup: 'Criar conta', recovery: 'Enviar link de recuperação', 'new-password': 'Salvar nova senha',
  };
  $('account').innerHTML = `<div class="panel stack">
    ${recovery ? '' : `<nav aria-label="Acesso à conta">
      <button class="secondary" type="button" data-mode="login">Entrar</button>
      <button class="secondary" type="button" data-mode="signup">Criar conta</button>
      <button class="secondary" type="button" data-mode="recovery">Esqueci minha senha</button>
    </nav>`}
    <form id="auth-form">
      ${authMode === 'signup' ? '<label>Nome<input name="name" autocomplete="name" maxlength="120" required></label>' : ''}
      ${recovery ? '' : '<label>E-mail<input type="email" name="email" autocomplete="email" required></label>'}
      ${authMode === 'recovery' ? '' : `<label>${recovery ? 'Nova senha' : 'Senha'}<input type="password" name="password" required
        ${authMode === 'login' ? '' : 'minlength="8"'} autocomplete="${authMode === 'login' ? 'current-password' : 'new-password'}"></label>`}
      <button type="submit">${titles[authMode]}</button>
    </form>
  </div>`;
}

function addressFields(address = {}) {
  return [
    ['label', 'Identificação', 80], ['postal_code', 'CEP (8 dígitos)', 8, ' inputmode="numeric" pattern="[0-9]{8}"'],
    ['street', 'Rua', 160], ['number', 'Número', 20], ['complement', 'Complemento', 100],
    ['district', 'Bairro', 100], ['city', 'Cidade', 100],
    ['state', 'UF', 2, ' pattern="[A-Za-z]{2}"'],
  ].map(([key, label, max, extra]) => `<label>${label}<input name="${key}" maxlength="${max}" value="${e(address[key])}"
    ${key === 'complement' ? '' : 'required'}${extra || ''}></label>`).join('');
}

function orderCard(order) {
  const delivery = order.deliveries;
  const link = whatsappLink(catalog?.settings.whatsapp, 'Olá! Gostaria de acompanhar o pedido Fioritta ' + order.id + '.');
  return `<details><summary>${e(date(order.created_at))} · ${e(statuses[order.status])} · ${money(order.total_cents)}</summary>
    <p>Pedido ${e(order.id)}</p>
    <ul>${order.order_items.map(i => `<li>${e(i.quantity)} × ${e(i.product_name)} · ${e(i.variant_name)} · ${e(i.collection_name)}
      ${i.design_name ? ' · ' + e(i.design_name) : ''} · ${e(i.packaging_name)}
      · Arte: ${e(approvals[i.personalizations?.approval_status])}</li>`).join('')}</ul>
    <p>Prazo de produção: ${e(date(order.production_due))}</p>
    <p>${delivery?.method === 'retirada' ? 'Retirada: ' + (delivery.pickup_at ? new Date(delivery.pickup_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'a agendar') :
      'Entrega: ' + e(delivery?.tracking_code || 'a combinar')}</p>
    ${order.payments.filter(p => p.environment === 'production' && p.status === 'confirmado').map(p => '<p>Pagamento confirmado: ' + money(p.amount_cents) + '</p>').join('')}
    ${link ? `<a href="${e(link)}" target="_blank" rel="noopener noreferrer">Atendimento e aprovação de arte pelo WhatsApp</a>` : ''}
  </details>`;
}

async function loadAccount() {
  if (!session || authMode === 'new-password') {
    renderAuth();
    renderCart();
    return;
  }
  const version = ++accountVersion;
  const user = session.user;
  const offset = orderPage * 20;
  const [customer, entries, orders] = await Promise.all([
    data(db.from('customers').select('id,name,phone').eq('id', user.id).maybeSingle()),
    data(db.from('addresses').select('*').eq('customer_id', user.id).order('label')),
    data(db.from('orders').select(orderColumns).eq('customer_id', user.id).order('created_at', { ascending: false }).order('id')
      .range(offset, offset + 20)),
  ]);
  if (version !== accountVersion || session?.user.id !== user.id) return;
  profile = customer;
  addresses = entries.map(a => ({ ...a, name: a.label + ' · ' + a.city }));
  loadingAccount = false;
  $('account').innerHTML = `<div class="stack">
    <div class="actions"><p>${e(user.email)} ${user.email_confirmed_at ? '' : '· Aguardando confirmação'}</p>
      <button id="sign-out" type="button" class="secondary">Sair</button></div>
    <form class="panel" id="profile-form"><h3>Perfil</h3>
      <label>Nome<input name="name" autocomplete="name" maxlength="120" value="${e(customer?.name || user.user_metadata?.name)}" required></label>
      <label>Telefone<input name="phone" type="tel" autocomplete="tel" maxlength="30" value="${e(customer?.phone)}"></label>
      <button type="submit">Salvar perfil</button>
    </form>
    ${customer ? `<h3>Endereços</h3>
      ${addresses.map(a => `<details><summary>${e(a.name)}</summary><form class="address-form" data-id="${e(a.id)}">
        <div class="fields">${addressFields(a)}</div><div class="actions"><button type="submit">Salvar endereço</button>
        <button type="button" class="secondary" data-delete-address="${e(a.id)}">Excluir</button></div></form></details>`).join('')}
      <details><summary>Adicionar endereço</summary><form class="address-form"><div class="fields">${addressFields()}</div>
        <button type="submit">Cadastrar endereço</button></form></details>` : ''}
    <h3>Histórico de pedidos</h3>${orders.length ? orders.slice(0, 20).map(orderCard).join('') : '<p>Nenhum pedido nesta página.</p>'}
    <div class="actions">${orderPage ? '<button type="button" class="secondary" data-page="-1">Anteriores</button>' : ''}
      ${orders.length > 20 ? '<button type="button" class="secondary" data-page="1">Próximos</button>' : ''}</div>
  </div>`;
  renderCart();
}

async function handleAuth(values) {
  const redirect = new URL('/v3/', location.origin);
  switch (authMode) {
    case 'signup':
      await data(db.auth.signUp({
        email: values.email, password: values.password,
        options: { emailRedirectTo: redirect.href, data: { name: values.name.trim() } },
      }));
      accountMessage('Se o cadastro estiver disponível, você receberá um e-mail de confirmação.');
      break;
    case 'recovery':
      redirect.searchParams.set('redefinir', '1');
      await data(db.auth.resetPasswordForEmail(values.email, { redirectTo: redirect.href }));
      accountMessage('Se houver uma conta com esse e-mail, você receberá um link de recuperação.');
      break;
    case 'new-password':
      await data(db.auth.updateUser({ password: values.password }));
      authMode = 'login';
      history.replaceState(null, '', '/v3/#conta');
      await loadAccount();
      accountMessage('Senha atualizada.');
      break;
    default:
      await data(db.auth.signInWithPassword({ email: values.email, password: values.password }));
      accountMessage('');
  }
}

document.addEventListener('submit', event => {
  const form = event.target;
  if (!db) return;
  event.preventDefault();
  if (form.id === 'customize') {
    void busy(form, values => {
      if (cart.length === 20) throw new Error('A sacola aceita até 20 itens.');
      const variant = catalog.variants.find(v => v.id === values.variant_id);
      const product = catalog.products.find(p => p.id === variant.product_id);
      const collection = catalog.collections.find(c => c.id === values.collection_id);
      if (collection.custom_quote && !values.instructions.trim()) throw new Error('Descreva a sua ideia para a criação exclusiva.');
      const name = (values.live_name || '').trim();
      const font = ({classica:'Clássica',moderna:'Moderna'})[values.live_font];
      const color = ({bordeaux:'Bordeaux',preto:'Preto',azul:'Azul'})[values.live_color];
      const instructions = [name && font && color ? 'Nome: '+name+' | Fonte: '+font+' | Cor: '+color : '', values.instructions].filter(Boolean).join('\n');
      if (instructions.length > 1200) throw new Error('Reduza os detalhes da personalização para até 1200 caracteres.');
      cart.push({ ...values, instructions, quantity: Number(values.quantity), label: product.name + ' · ' + variant.name, collection: collectionLabel(collection) });
      storeCart(true);
      $('product-dialog').close();
      renderCart();
      cartMessage('Item adicionado à sacola.');
    }, message => {
      let notice = form.querySelector('[role="status"]');
      if (!notice) {
        notice = document.createElement('p');
        notice.setAttribute('role', 'status');
        form.append(notice);
      }
      notice.textContent = message;
    });
  } else if (form.id === 'checkout') {
    void busy(form, async values => {
      cartMessage('');
      storeCart();
      const order = await data(db.rpc('fioritta_request_order', {
        items: cart.map(({ variant_id, collection_id, design_id, packaging_id, quantity, instructions }) =>
          ({ variant_id, collection_id, design_id, packaging_id, quantity, instructions })),
        fulfillment: values.fulfillment, request_id: requestId, selected_address: values.selected_address || null,
      }));
      cart = [];
      storeCart(true);
      renderCart();
      cartMessage('Solicitação registrada. Acompanhe em Minha conta. Pedido ' + order + '.');
      orderPage = 0;
      void loadAccount().catch(error => accountMessage(error.message));
    }, cartMessage);
  } else if (form.id === 'auth-form') {
    void busy(form, handleAuth, accountMessage);
  } else if (form.id === 'profile-form') {
    void busy(form, async values => {
      const fields = { name: values.name.trim(), phone: values.phone.trim() };
      await data(profile ? db.from('customers').update(fields).eq('id', session.user.id) :
        db.from('customers').insert({ ...fields, id: session.user.id }));
      await loadAccount();
      accountMessage('Perfil salvo.');
    }, accountMessage);
  } else if (form.classList.contains('address-form')) {
    void busy(form, async values => {
      const fields = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value.trim()]));
      fields.state = fields.state.toUpperCase();
      await data(form.dataset.id ? db.from('addresses').update(fields).eq('id', form.dataset.id) :
        db.from('addresses').insert(fields));
      await loadAccount();
      accountMessage('Endereço salvo.');
    }, accountMessage);
  }
});

document.addEventListener('click', async event => {
  const button = event.target.closest('button');
  if (!button || !db) return;
  try {
    if (button.dataset.product) openProduct(button.dataset.product);
    if (button.dataset.remove != null) {
      cart.splice(Number(button.dataset.remove), 1);
      storeCart(true);
      renderCart();
      cartMessage('');
    }
    if (button.dataset.mode) {
      authMode = button.dataset.mode;
      accountMessage('');
      renderAuth();
    }
    if (button.id === 'sign-out') await data(db.auth.signOut({ scope: 'local' }));
    if (button.dataset.page) {
      orderPage += Number(button.dataset.page);
      await loadAccount();
    }
    if (button.dataset.deleteAddress && confirm('Excluir este endereço da sua conta?')) {
      await data(db.from('addresses').delete().eq('id', button.dataset.deleteAddress));
      await loadAccount();
      accountMessage('Endereço excluído.');
    }
  } catch (error) {
    accountMessage(error.message);
  }
});

async function initialize() {
  renderCart();
  db = await connect();
  $('search').oninput = () => { if (catalog) renderProducts(); };
  document.querySelectorAll('[data-category]').forEach(button=>button.addEventListener('click',()=>{
    activeCategory=button.dataset.category;
    document.querySelectorAll('[data-category]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
    if(catalog)renderProducts();
  }));
  const catalogReady = loadCatalog().catch(() => notify('catalog-status', 'Não foi possível carregar o catálogo. Tente atualizar a página.'));
  db.auth.onAuthStateChange((event, nextSession) => {
    if (event === 'TOKEN_REFRESHED' ||
        (event === 'SIGNED_IN' && session && session.user.id === nextSession?.user.id)) {
      session = nextSession;
      return;
    }
    if (session?.user.id && session.user.id !== nextSession?.user.id) {
      cart = [];
      storeCart(true);
    }
    session = nextSession;
    ++accountVersion;
    profile = null;
    addresses = [];
    orderPage = 0;
    loadingAccount = !!session;
    if (event === 'PASSWORD_RECOVERY' ||
        (session && new URLSearchParams(location.search).has('redefinir'))) {
      authMode = 'new-password';
      location.hash = 'conta';
    }
    if (!session && authMode === 'new-password') authMode = 'recovery';
    if (!session || authMode === 'new-password') {
      renderAuth();
    } else {
      $('account').textContent = 'Carregando sua conta…';
    }
    renderCart();
    setTimeout(() => {
      void catalogReady.then(loadAccount).catch(error => {
        loadingAccount = false;
        renderCart();
        accountMessage(error.message);
      });
    }, 0);
  });
}

void initialize().catch(error => {
  notify('connection', error.message);
  notify('catalog-status', '');
});

const slides=[...document.querySelectorAll('[data-slide]')];
let currentSlide=0;
let paused=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;
const pauseButton=$('pause-slide');
function showSlide(index){
 currentSlide=(index+slides.length)%slides.length;
 slides.forEach((slide,i)=>slide.hidden=i!==currentSlide);
 $('slide-count').textContent=(currentSlide+1)+' / '+slides.length;
}
function syncPause(){pauseButton.textContent=paused?'Reproduzir':'Pausar';}
$('previous-slide').onclick=()=>{paused=true;syncPause();showSlide(currentSlide-1);};
$('next-slide').onclick=()=>{paused=true;syncPause();showSlide(currentSlide+1);};
pauseButton.onclick=()=>{paused=!paused;syncPause();};
syncPause();
setInterval(()=>{if(!paused&&!document.hidden&&!document.querySelector('.campaign')?.matches(':hover,:focus-within'))showSlide(currentSlide+1);},6500);
