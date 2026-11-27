import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const context = { window: {} };
runInNewContext(readFileSync(new URL('../public/catalog-data.js', import.meta.url), 'utf8'), context);
const catalog = context.window.CATALOG;
const image = id => id ? `/assets/${id}.jpg` : null;
const sql = value => typeof value === 'string' ? "'" + value.replaceAll("'", "''") + "'" : String(value);
const insert = (table, columns, rows) =>
  `insert into public.${table} (${columns.join(', ')}) values\n${rows.map(row => '  (' + row.map(sql).join(', ') + ')').join(',\n')};`;

const statements = [
  insert('products', ['id', 'name', 'category', 'description', 'lead_time', 'image_path', 'illustrated', 'active'],
    catalog.products.map(p => [p.id, p.name, p.category, p.description, p.lead, image(p.image), !!p.illustrated, !p.hidden])),
  insert('variants', ['product_id', 'sku', 'name', 'image_path', 'active'],
    catalog.products.map(p => [p.id, p.id + '-PADRAO', 'Padrão', image(p.image), !p.hidden])),
  insert('collections', ['id', 'name', 'description', 'image_path', 'priority', 'custom_quote'],
    catalog.collections.map(c => [c.id, c.name, c.description, image(c.image), c.priority, c.id === 'FREE'])),
  insert('designs', ['id', 'collection_id', 'name', 'image_path'],
    catalog.designs.map(d => [d.id, d.collection, d.name, image(d.image)])),
  insert('packaging', ['id', 'name'], catalog.packaging.map(p => [p.id, p.name])),
  insert('store_settings', ['whatsapp', 'pickup_instructions', 'production_notice'], [[
    catalog.whatsapp, 'Retirada mediante agendamento pelo WhatsApp.', 'Produção após pagamento integral antecipado e aprovação da arte pelo WhatsApp.',
  ]]),
];

process.stdout.write('-- Catálogo original Fioritta. Os preços demonstrativos são omitidos.\nbegin;\n\n' +
  statements.join('\n\n') + '\n\ncommit;\n');
