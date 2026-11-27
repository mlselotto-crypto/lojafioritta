-- Catálogo original Fioritta. Os preços demonstrativos são omitidos.
begin;

insert into public.products (id, name, category, description, lead_time, image_path, illustrated, active) values
  ('CAN-001', 'Caneca Clássica', 'Canecas', 'Branca · 325 ml', '1 a 2 dias úteis', '/assets/ESS-01.jpg', true, true),
  ('CAN-002', 'Color Bordeaux', 'Canecas', 'Alça e interior Bordeaux · 325 ml', '1 a 2 dias úteis', '/assets/bordeaux.jpg', true, true),
  ('CAN-003', 'Color Rosé', 'Canecas', 'Alça e interior rosé · 325 ml', '1 a 2 dias úteis', null, false, true),
  ('CAN-004', 'Color Noir', 'Canecas', 'Alça e interior preto · 325 ml', '1 a 2 dias úteis', null, false, true),
  ('NEC-001', 'Bella', 'Necessaires', '18 × 12 × 2 cm', '10 a 15 dias, sob confirmação', null, false, true),
  ('NEC-002', 'Mini Bella', 'Necessaires', '15 × 10 × 2 cm', '10 a 15 dias, sob confirmação', null, false, true),
  ('XIC-001', 'Dolce', 'Xícaras', 'Individual', '2 a 4 dias úteis, sob confirmação', null, false, true),
  ('XIC-002', 'Amore', 'Xícaras', 'Duo com suporte', '2 a 4 dias úteis, sob confirmação', null, false, true),
  ('XIC-003', 'Famiglia', 'Xícaras', 'Quarteto com suporte', 'Sob consulta', null, false, true),
  ('KIT-001', 'Bella Essenza', 'Kits', 'Clássica + Bella', 'Conforme componentes', null, false, true),
  ('KIT-002', 'Piccolo', 'Kits', 'Clássica + Mini Bella', 'Conforme componentes', null, false, true),
  ('KIT-003', 'Insieme', 'Kits', 'Duas canecas Clássica', 'Conforme componentes', null, false, true),
  ('KIT-004', 'Amore Speciale', 'Kits', 'Duo Amore + embalagem especial', 'Conforme componentes', null, false, true);

insert into public.variants (product_id, sku, name, image_path, active) values
  ('CAN-001', 'CAN-001-PADRAO', 'Padrão', '/assets/ESS-01.jpg', true),
  ('CAN-002', 'CAN-002-PADRAO', 'Padrão', '/assets/bordeaux.jpg', true),
  ('CAN-003', 'CAN-003-PADRAO', 'Padrão', null, true),
  ('CAN-004', 'CAN-004-PADRAO', 'Padrão', null, true),
  ('NEC-001', 'NEC-001-PADRAO', 'Padrão', null, true),
  ('NEC-002', 'NEC-002-PADRAO', 'Padrão', null, true),
  ('XIC-001', 'XIC-001-PADRAO', 'Padrão', null, true),
  ('XIC-002', 'XIC-002-PADRAO', 'Padrão', null, true),
  ('XIC-003', 'XIC-003-PADRAO', 'Padrão', null, true),
  ('KIT-001', 'KIT-001-PADRAO', 'Padrão', null, true),
  ('KIT-002', 'KIT-002-PADRAO', 'Padrão', null, true),
  ('KIT-003', 'KIT-003-PADRAO', 'Padrão', null, true),
  ('KIT-004', 'KIT-004-PADRAO', 'Padrão', null, true);

insert into public.collections (id, name, description, image_path, priority, custom_quote) values
  ('ESS', 'Essenziale', 'A beleza do simples', '/assets/ESS-01.jpg', 1, false),
  ('BOT', 'Botanica', 'Flores que contam histórias', '/assets/BOT-01.jpg', 1, false),
  ('CEL', 'Celebra', 'Momentos que permanecem', '/assets/CEL-01.jpg', 1, false),
  ('PRO', 'Promessa', 'Palavras que fortalecem', '/assets/PRO-01.jpg', 1, false),
  ('HER', 'Héritage', 'O charme de outras épocas', '/assets/HER.jpg', 2, false),
  ('DOL', 'Dolce Vita', 'Pequenos prazeres', '/assets/DOL.jpg', 2, false),
  ('VIV', 'Vivace', 'Uma rotina com mais cor', '/assets/VIV.jpg', 2, false),
  ('LIB', 'La Libreria', 'Para quem vive muitas histórias', '/assets/LIB.jpg', 2, false),
  ('AFF', 'Affetto', 'Vínculos que aquecem', '/assets/AFF.jpg', 3, false),
  ('VIA', 'Viaggio', 'Memórias de lugares especiais', '/assets/VIA.jpg', 3, false),
  ('PFE', 'Professione', 'Celebrando vocações', '/assets/PFE.jpg', 3, false),
  ('PIC', 'Piccoli', 'Pequenos grandes amores', '/assets/PIC.jpg', 3, false),
  ('FREE', 'Libera', 'Sua ideia. Nossa criação.', '/assets/hero.jpg', 1, true);

insert into public.designs (id, collection_id, name, image_path) values
  ('ESS-01', 'ESS', 'Monograma', '/assets/ESS-01.jpg'),
  ('ESS-02', 'ESS', 'Rituali', '/assets/ESS-02.jpg'),
  ('ESS-03', 'ESS', 'Natura', '/assets/ESS-03.jpg'),
  ('BOT-01', 'BOT', 'Hortênsia', '/assets/BOT-01.jpg'),
  ('BOT-02', 'BOT', 'Lavanda', '/assets/BOT-02.jpg'),
  ('BOT-03', 'BOT', 'Girassol', '/assets/BOT-03.jpg'),
  ('CEL-01', 'CEL', 'Eternità', '/assets/CEL-01.jpg'),
  ('CEL-02', 'CEL', 'Madrinha', '/assets/CEL-02.jpg'),
  ('CEL-03', 'CEL', 'Benvenuto', '/assets/CEL-03.jpg'),
  ('PRO-01', 'PRO', 'Pela Fé', '/assets/PRO-01.jpg'),
  ('PRO-02', 'PRO', 'Providência', '/assets/PRO-02.jpg'),
  ('PRO-03', 'PRO', 'Gratidão', '/assets/PRO-03.jpg');

insert into public.packaging (id, name) values
  ('essential', 'Essencial'),
  ('encanto', 'Encanto');

insert into public.store_settings (whatsapp, pickup_instructions, production_notice) values
  ('5511999854298', 'Retirada mediante agendamento pelo WhatsApp.', 'Produção após pagamento integral antecipado e aprovação da arte pelo WhatsApp.');

commit;
