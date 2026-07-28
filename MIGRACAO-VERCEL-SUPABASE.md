# Migração segura para Vercel e Supabase

## Objetivo

Migrar o Folha Rural de vinext/Cloudflare D1 para Next.js na Vercel com
PostgreSQL, autenticação e políticas de acesso no Supabase, sem interromper ou
apagar a versão atual.

## Referência adotada

O App Imobiliária usa Vite, Vercel, Supabase Auth, Realtime, cache local e
publicação automatizada. No Folha Rural serão reaproveitados:

- Vercel como ambiente de produção;
- Supabase Auth para login;
- Supabase PostgreSQL como fonte principal;
- RLS para isolamento dos dados por organização;
- variáveis de ambiente fora do código;
- implantação automática a partir do Git;
- manutenção da versão anterior durante a homologação.

O armazenamento de todo o sistema em uma única linha JSON, usado no Imobiliária,
não será repetido. A folha possui relações e cálculos que exigem tabelas,
restrições, transações e histórico auditável.

## Estratégia sem interrupção

1. **Congelar o esquema D1**, mantendo a versão atual operacional.
2. **Criar o projeto Supabase de homologação** e aplicar, em ordem, as migrações
   `202607200001` e `202607280002`.
3. **Converter a camada de dados** das rotas `/api` para um repositório
   PostgreSQL/Supabase, sem alterar a interface.
4. **Trocar a autenticação local** por Supabase Auth e memberships de
   organização.
5. **Exportar o D1 em modo somente leitura**, importar no Supabase e comparar
   contagens, totais e vínculos.
6. **Publicar uma Preview na Vercel**, usando exclusivamente o banco de
   homologação.
7. **Executar homologação funcional**: empresas, colaboradores, funções/CBO,
   apontamentos, salários, férias e fechamento.
8. **Realizar sincronização final**, bloquear gravações no D1 por poucos minutos
   e promover a Vercel para produção.
9. **Manter a publicação anterior disponível para rollback**, sem apagar banco
   ou projeto por pelo menos 30 dias.

## Variáveis da Vercel

Criar somente no painel da Vercel:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_ORGANIZATION_ID
```

`SUPABASE_SERVICE_ROLE_KEY` é segredo exclusivo do servidor e nunca pode ser
exposto em componentes do navegador ou arquivos versionados.

## Critérios antes da virada

- build Next/Vercel concluído;
- RLS ativa em todas as tabelas da organização;
- nenhuma chave secreta no Git;
- contagens D1 e Supabase idênticas;
- totais de uma competência de teste idênticos;
- login, logout e permissões testados;
- exportação final armazenada como backup;
- rollback documentado e testado.

## Estado atual

- esquema Supabase de homologação criado e preservado;
- dados do D1 importados e conferidos nas 22 tabelas;
- camada segura de conexão do servidor preparada;
- perfis de usuário, permissões e RLS do Supabase Auth aplicados;
- rota `/api/migration-status` preparada para a futura Preview da Vercel;
- versão Cloudflare/Sites continua sendo a produção segura;
- nenhuma alteração destrutiva foi aplicada ao D1 ou ao Supabase.
- módulo Empresas convertido para leitura e gravação no Supabase, incluindo
  isolamento por organização, empresas permitidas, validação de documento e
  proteção de histórico;
- migração aditiva `202607280005` aplicada na homologação para os campos
  completos de Empresas;
- módulo Colaboradores convertido para leitura no Supabase e gravação
  transacional de pessoa, contrato, matrícula, mapa legado e dependentes;
- função transacional `folha_save_worker` instalada pela migração
  `202607280006`, com permissão exclusiva do servidor;
- Funções/CBO convertidas para Supabase com contagem de vínculos limitada às
  empresas autorizadas do usuário;
- Serviços convertidos para Supabase, incluindo incidências, natureza,
  fórmula, DSR, unidade, grupo e proteção contra exclusão com lançamentos;
- migração aditiva `202607280007` aplicada para os campos completos de
  Serviços;
- Apontamentos convertidos para leitura no Supabase e gravação transacional,
  incluindo lançamento individual, lançamento em lote, exclusão, feriados e
  clonagem de dia;
- função transacional `folha_save_launches` instalada pela migração
  `202607280008`, com validação da empresa, contrato e serviço;
- Fechamento convertido para cálculo no Supabase, com prévia e confirmação
  consistentes para Adiantamento e Fechamento Mensal;
- função transacional `folha_save_payroll_closing` instalada pela migração
  `202607280009`, preservando a memória de cálculo por empresa e competência;
- Tabelas Oficiais convertidas para Supabase e conferidas nas fontes do INSS e
  da Receita Federal, com 4 faixas de INSS, 5 de IRRF e 1 de salário-família
  vigentes desde janeiro de 2026;
- função transacional `folha_sync_tax_brackets` instalada pela migração
  `202607280010`, aceitando somente fontes oficiais em `gov.br`;
- Sindicatos convertidos para Supabase, incluindo cadastro completo, histórico
  de contribuições, validação de duplicidade e vínculo com colaboradores;
- função transacional `folha_save_union` instalada pela migração
  `202607280011`, com proteção dos descontos processados e dos fechamentos
  legados antes de qualquer exclusão;
- Evolução Salarial, Reajuste Salarial e Férias convertidos para Supabase,
  incluindo salário individual, histórico, referências, reajuste em lote,
  desfazimento e períodos aquisitivos/concessivos;
- função transacional `folha_save_hr` instalada pela migração `202607280012`,
  limitando consultas e alterações às empresas autorizadas de cada usuário;
- Centros de Custo, EPI e Ferramentas convertidos para Supabase, incluindo
  fornecimentos aos colaboradores, quantidades, devolução e confirmação;
- migração `202607280013` preserva códigos legados dos centros e instala
  `folha_save_auxiliary_hr`, protegendo centros e itens que possuam vínculos;
- seletor de funções do reajuste corrigido para os identificadores do Supabase;
- convites preparados para usar a URL da Vercel em vez de endereço fixo.

## Próximo marco

Converter as rotas operacionais restantes e executar a homologação integrada.
A Preview da Vercel só será liberada quando todas as rotas operacionais
deixarem de depender do D1.
