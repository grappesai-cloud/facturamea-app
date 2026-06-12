# facturamea-app (frontend)

Frontend pentru **facturamea**, construit separat de backend. Consumă API-ul (headless) prin token Bearer.

- **Stack:** Astro 6 + React 19 (islands) + Tailwind CSS v4. Output static, deploy pe Vercel.
- **Backend (API):** repo `facturamea` (Astro), live la `https://facturamea.vercel.app`.

## Pornire rapidă

```bash
npm install
cp .env.example .env        # PUBLIC_API_URL = adresa backendului
npm run dev                 # http://localhost:4321
```

Cont de test: **demo@facturamea.com / Demo1234!**

`PUBLIC_API_URL` = baza API-ului. Implicit `https://facturamea.vercel.app`. Pentru BE local: `http://localhost:4321` (backendul rulează tot pe 4321, deci pornește FE pe alt port: `npm run dev -- --port 4322`).

## Cum funcționează autentificarea

Token Bearer, fără cookie:
1. `POST /api/auth/token { email, password }` → `{ token, user, company }`. Token-ul se salvează în `localStorage` (`fm_token`).
2. Fiecare request trimite `Authorization: Bearer <token>`.
3. `GET /api/auth/me` → user + company + licență (bootstrap la încărcare).
4. La `401`, clientul șterge token-ul și redirecționează la `/login`.

Toată logica e în **`src/lib/api.ts`** (client tipat). Nu apela `fetch` direct, folosește clientul.

## Clientul API (`src/lib/api.ts`)

```ts
import { auth, invoices, clients, products, ron } from '../lib/api';

await auth.login(email, password);     // salvează token
const me = await auth.me();            // { user, company, license, anafConnected }
await auth.logout();

const { results } = await invoices.list({ kind: 'factura', status: 'overdue' });
const inv = await invoices.get(id);
await invoices.create({ clientExternalId, lines: [{ description, quantity, unitPriceCents, vatRate }] });
await invoices.sendEfactura(id);
const { url } = await invoices.paymentLink(id);   // link Stripe

const cs = await clients.list();
await clients.create({ name, taxId });

const ps = await products.list();

ron(508200); // "5.082,00 RON"
```

Tipuri exportate: `Me`, `Invoice`, `Client`, `Product`. Erorile sunt `ApiError` cu `.status` + `.message`.

Sumele sunt mereu în **bani (integer cents)**. Folosește `ron()` pentru afișare.

## Structură

```
src/
  lib/api.ts            # client API + tipuri + auth (PUNCTUL DE INTEGRARE)
  layouts/AppLayout.astro  # shell cu guard de auth + nav + logout
  components/           # React islands: LoginForm, Dashboard, ClientsList
  pages/
    index.astro         # redirect /app sau /login
    login.astro
    app/index.astro     # dashboard (exemplu: listă facturi + KPI)
    app/clienti.astro   # exemplu: listă + adăugare clienți
```

## Cum adaugi un ecran nou

1. Creează un island în `src/components/` care folosește `lib/api.ts`.
2. Creează o pagină în `src/pages/app/` cu `AppLayout` + `<Componenta client:only="react" />`.
3. Adaugă un link în `src/layouts/AppLayout.astro` (nav).

Componentele care citesc date trebuie montate cu `client:only="react"` (token-ul e în localStorage, nu există la SSR).

## Endpoints disponibile pe backend

Pe lângă cele din client, backendul expune mult mai mult sub `/api/invoicing/*`, `/api/gestiune/*`, `/api/cheltuieli/*`, `/api/contabilitate/*`, `/api/comenzi/*`, `/api/anaf/*`, `/api/banca/*` etc. Toate acceptă `Authorization: Bearer <token>` și răspund JSON. Documentație publică: `https://facturamea.vercel.app/dezvoltatori`. Adaugă wrappere noi în `src/lib/api.ts` pe măsură ce ai nevoie.

## Deploy

`npm run build` → static, deploy pe Vercel. Setează `PUBLIC_API_URL` în env-ul proiectului Vercel. Originea FE trebuie adăugată în `FRONTEND_ORIGINS` pe backend (CORS).
