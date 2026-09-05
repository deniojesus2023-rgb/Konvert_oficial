# Deploy no Railway

## 1. Banco de dados

Crie um banco MySQL-compatible com TLS (obrigatório — o driver já força `ssl:{}` por padrão):

- **TiDB Cloud Serverless** (grátis pra começar) ou
- **PlanetScale**

Guarde a connection string completa (`mysql://user:pass@host:porta/db`).

## 2. Criar o serviço no Railway

1. New Project → Deploy from GitHub repo → selecione este repositório.
2. Railway detecta o `Dockerfile` na raiz automaticamente (builder já fixado em `railway.json`).
3. Em **Variables**, configure:

| Variável | Valor |
|---|---|
| `DATABASE_URL` | connection string do TiDB/PlanetScale |
| `DATABASE_SSL` | `true` (ou omita — é o default) |
| `JWT_SECRET` | string aleatória longa (ex: `openssl rand -hex 32`) |
| `JWT_EXPIRES_IN` | `7d` (opcional) |
| `WHATSAPP_PROVIDER` | `none` até plugar um provider real |

Não defina `PORT` — o Railway injeta a própria porta e `env.ts` já lê `process.env.PORT`.

4. Deploy. O `CMD` da imagem roda `npm run db:migrate && npm start`: as migrations do Drizzle aplicam automaticamente a cada boot (idempotente — só aplica o que ainda não rodou).

## 3. Domínio

Railway já dá um domínio `*.up.railway.app` público por padrão. Para usar subdomínios reais por loja (`pizzaria.konvert.app`), depois:
1. Adicione seu domínio próprio no serviço (Settings → Networking → Custom Domain).
2. Configure um wildcard DNS (`*.konvert.app` → CNAME do Railway).
3. A resolução de loja por subdomínio (`resolveStoreFromHost`) já funciona sozinha assim que o Host header chegar correto — nenhuma mudança de código necessária.

## 4. Primeiro acesso

Depois do deploy, crie a primeira conta via API (ainda não existe tela de signup no frontend):

```bash
curl -s https://SEU-APP.up.railway.app/trpc/auth.signup -X POST -H "Content-Type: application/json" \
  -d '{"accountName":"Minha Pizzaria","storeName":"Minha Pizzaria","adminName":"Você","email":"voce@dominio.com","password":"senha-forte-aqui"}'
```

Painel da loja: `/admin/login`. Painel super-admin: `/platform/login` (promova um usuário existente a `platform_admin` direto no banco — não há fluxo de criação pela API por design).
