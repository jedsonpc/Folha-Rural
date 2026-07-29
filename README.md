# Folha Rural

Aplicação Next.js de gestão de folha rural, publicada na Vercel e integrada ao
Supabase para autenticação, dados e permissões.

## Desenvolvimento

Requisitos:

- Node.js 22 ou superior
- variáveis descritas em `.env.vercel.example`

Comandos:

```bash
npm ci
npm run dev
npm run build
npm test
```

## Produção

O repositório GitHub é a origem da implantação na Vercel. As variáveis de
produção devem ser configuradas no painel da Vercel e os scripts SQL ficam em
`supabase/migrations`.

O projeto não depende mais do ChatGPT Sites, Cloudflare Workers, Vinext,
Wrangler ou do antigo banco D1 para sua implantação em produção.
