import { createClient } from '@supabase/supabase-js';

export const $ = id => document.getElementById(id);
export const escape = value => String(value ?? '').replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
export const money = cents => cents == null ? 'Sob orçamento' :
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const date = value => value ? new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short', timeZone: 'America/Sao_Paulo',
}).format(new Date(value.length === 10 ? value + 'T12:00:00-03:00' : value)) : 'A definir';

export const statuses = {
  orcamento_solicitado: 'Orçamento solicitado', aguardando_pagamento: 'Aguardando pagamento',
  em_producao: 'Em produção', pronto: 'Pronto', concluido: 'Concluído', cancelado: 'Cancelado',
};
export const approvals = { pendente: 'Pendente', enviada: 'Enviada pelo WhatsApp', aprovada: 'Aprovada', revisao: 'Em revisão' };

export function notify(id, message) {
  const node = $(id);
  node.textContent = message;
  node.hidden = !message;
}

export async function connect() {
  const response = await fetch('/.netlify/functions/fioritta-config');
  if (!response.ok) throw new Error('A conexão com a loja está indisponível.');
  const config = await response.json();
  if (!config.url || !config.publishableKey) throw new Error('Configuração incompleta da loja.');
  return createClient(config.url, config.publishableKey);
}

export async function data(request) {
  const result = await request;
  if (result.error) throw result.error;
  return result.data;
}

export function imagePath(value) {
  if (!value) return '';
  if (/^\/assets\/[A-Za-z0-9_.-]+$/.test(value)) return value;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && !url.username && !url.password) return url.href;
  } catch {
    return '';
  }
  return '';
}

export function image(path, alt, className = '') {
  const src = imagePath(path);
  return src ? `<img src="${escape(src)}" alt="${escape(alt)}" class="${className}" loading="lazy" referrerpolicy="no-referrer">` :
    '<div aria-hidden="true" class="image-placeholder"></div>';
}

export function options(rows, selected) {
  return rows.map(row => `<option value="${escape(row.id)}"${row.id === selected ? ' selected' : ''}>${escape(row.name)}</option>`).join('');
}

export function whatsappLink(number, message) {
  return /^[1-9][0-9]{10,14}$/.test(number ?? '') ?
    `https://wa.me/${number}?text=${encodeURIComponent(message)}` : '';
}

export function fields(form) {
  return Object.fromEntries(new FormData(form));
}

export async function busy(form, task, report) {
  const button = form.querySelector('button[type=submit]');
  if (button?.disabled) return;
  if (button) button.disabled = true;
  try {
    await task(fields(form));
  } catch (error) {
    report(error.message || 'Não foi possível concluir a operação.');
  } finally {
    if (button) button.disabled = false;
  }
}
