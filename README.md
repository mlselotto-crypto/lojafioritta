# Fioritta V3

A loja V3 fica em `/v3/` e o Fioritta Studio em `/v3/studio/`. A loja V2 continua na raiz e o editor local V2 continua em `/admin.html`. O build copia os arquivos da V2 para a pasta publicada.

## Desenvolvimento

Use Node.js 22 e execute na raiz do checkout.

```sh
npm ci
npm test
npm run build
```

`npm test` aplica as migrations num PostgreSQL incorporado via PGlite, com as interfaces Auth e Storage representadas por tabelas de teste. Também executa a interface com jsdom e HTTP simulado. Para servir a aplicação com a função de configuração, use `netlify dev` com a CLI autenticada em um projeto de teste e com as variáveis públicas abaixo disponíveis no contexto local.

## Configurar o Supabase

1. Prefira um projeto Supabase de homologação e um deploy de revisão para o primeiro teste. Use o **SQL Editor** como proprietário do projeto. Esta instalação pressupõe que as tabelas públicas e o bucket da V3 ainda não existam.
2. Execute os arquivos completos abaixo, um de cada vez, na ordem indicada. Cada migration usa sua própria transação. Confira o resultado antes de avançar.
   - [20261127000100_fioritta_v3.sql](supabase/migrations/20261127000100_fioritta_v3.sql) cria o banco, as policies de RLS, as permissões, as operações transacionais e a auditoria.
   - [20261127000200_catalogo_original.sql](supabase/migrations/20261127000200_catalogo_original.sql) importa 13 produtos, incluindo os 4 kits, 13 coleções, 12 estampas e as embalagens. Os preços iniciais ficam vazios. O arquivo pode ser reproduzido com `node scripts/catalog-migration.mjs`.
   - [20261127000300_imagens_studio.sql](supabase/migrations/20261127000300_imagens_studio.sql) cria o bucket público de imagens do catálogo, com envio restrito ao Studio. Use esse bucket apenas para imagens comerciais públicas.
3. Em **Authentication → Providers → Email**, habilite cadastro por e-mail e **Confirm email**. Em **Authentication → URL Configuration**, configure a URL base do site para o ambiente que está preparando. Adicione as duas URLs exatas de retorno para cada domínio aprovado. Para o site informado, são:
   - `https://lojafioritta.netlify.app/v3/`
   - `https://lojafioritta.netlify.app/v3/?redefinir=1`

   Para revisar um Deploy Preview, use o hostname exato dele nas mesmas rotas. Se houver template de e-mail personalizado, verifique se confirmação e recuperação usam o link de confirmação do Supabase que respeita o redirecionamento solicitado. Configure SMTP para o envio no ambiente de implantação.
4. Cadastre a conta administrativa pela V3 e confirme o e-mail. Em **Authentication → Users**, localize a conta e copie seu **UUID**. Abra [autorizar.sql](supabase/admin/autorizar.sql) no SQL Editor, substitua o UUID de exemplo e execute. A confirmação é verificada pelo próprio script. Faça login em `/v3/studio/`. Para revogar o acesso, remova pelo SQL Editor a linha correspondente ao UUID em `public.administrators`. Não há promoção por cadastro, metadados ou formulário.

Se usar migrations versionadas pela CLI do Supabase, aplique os mesmos três arquivos pela CLI em um projeto inicializado e vinculado. Escolha o SQL Editor ou a CLI para aplicar a sequência pela primeira vez. Se já executou os arquivos manualmente e for adotar a CLI, reconcilie o histórico de migrations antes de fazer `db push`.

## Configuração do Netlify

Configure os valores nas configurações do deploy de revisão com escopo de **Functions**, usando os nomes exatos abaixo. O build usa `npm run build` e publica `dist`.

| Variável cadastrada | Uso |
| --- | --- |
| `SUPABASE_URL` | URL HTTPS do projeto Supabase. |
| `SUPABASE_PUBLISHABLE_KEY` | Chave pública com prefixo `sb_publishable_`. |
| `FiorittaNetlify` | Chave secreta do Supabase reservada. O runtime da V3 usa a sessão do usuário e RLS. |
| `MP_TEST_PUBLIC_KEY` | Reservada para uma futura integração de testes. |
| `MP_TEST_ACCESS_TOKEN` | Reservado para uma futura integração de testes no servidor. |

A função `fioritta-config` retorna somente a URL e a chave publicável. Mantenha credenciais privadas nas configurações protegidas do Netlify. Use o Supabase de homologação no contexto do deploy de revisão.

## Fluxo de homologação

1. Abra a V3 sem sessão e confira o catálogo, as imagens e a coleção Libera. Personalize um produto e confira se a solicitação pede cadastro ou login.
2. Use uma caixa de teste para confirmar o cadastro e testar recuperação de senha. Entre, salve o perfil, cadastre um endereço e solicite um orçamento. Confira o histórico e o link de atendimento e aprovação de arte pelo WhatsApp. Refaça o teste com retirada e com consulta de entrega.
3. Use uma segunda conta comum. Ela deve visualizar somente os próprios dados. Confira que a URL do Studio rejeita seu acesso. Com a conta promovida, edite um produto ou variante, envie uma imagem, consulte o pedido e registre uma alteração. Recarregue para confirmar a persistência. Alterações feitas no Studio aparecem na auditoria.
4. No Studio, registre o orçamento final e acompanhe a aprovação de arte e o agendamento de retirada. Esta versão registra solicitações e orçamentos sem iniciar cobranças. A transição para produção exige aprovação de todas as artes e um registro confiável de pagamento integral de produção. O Studio e a loja não criam registros de pagamento e pagamentos de teste não liberam produção.
