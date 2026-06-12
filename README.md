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

### OAuth (Google / Apple)

Login social prin redirect, nu prin popup. Butoanele din `LoginForm.tsx` sunt simple link-uri către backend:

```
${PUBLIC_API_URL}/api/auth/google?redirect=<FE>/auth/callback
${PUBLIC_API_URL}/api/auth/apple?redirect=<FE>/auth/callback
```

Fluxul (handoff token, fără cookie):
1. Utilizatorul apasă „Continuă cu Google/Apple" → navigare full-page la backend.
2. Backendul autentifică la provider, apoi redirecționează la `<FE>/auth/callback#token=XXXX`.
3. Pagina **`src/pages/auth/callback.astro`** citește token-ul din fragment (`location.hash`), îl salvează în `localStorage` ca `fm_token`, apoi merge la `/app`. Fără token → `/login?error=oauth` (mesaj afișat de `LoginForm`).

Important: originea FE trebuie inclusă în `FRONTEND_ORIGINS` (sau în sufixul permis) pe backend, altfel handoff-ul de token e respins (`isAllowedFeRedirect`). Helper-ele `auth.googleUrl()` / `auth.appleUrl()` / `oauthUrl()` construiesc URL-urile corect.

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

Clientul acoperă acum **toate modulele backendului**, grupate pe domeniu:

```ts
import {
  auth, invoices, clients, products,            // facturare de bază
  tva, series, models, recurring,               // setări facturare
  efacturaSettings, reports,                     // e-Factura + rapoarte/declarații
  gestiune, cheltuieli, contabilitate, comenzi,  // stoc, cheltuieli, contabilitate, comenzi
  anaf, banca, pos, mijloaceFixe, settings,      // ANAF, bancă, POS, mijloace fixe, setări
  ron, money,                                    // formatare
} from '../lib/api';

// Exemple
await invoices.create({ clientExternalId, dueAt, sendEfactura, lines: [{ description, quantity, unitPriceCents, vatRate }] });
await invoices.efacturaStatus(id);
await invoices.chitanta(id, { amountCents: 121000, method: 'transfer' });
await invoices.storno(id);
const { url } = await invoices.share(id);        // link public
await invoices.pdfDownload(id, fullNumber);       // descarcă PDF (cu Bearer)

const { results } = await gestiune.stock();
await cheltuieli.ocr(file);                        // multipart, extrage câmpuri din bon/factură
const { rows } = await contabilitate.balance({ from, to });
await comenzi.sales.invoice(orderId);              // transformă comanda în factură
const data = await anaf.lookup('RO12345678');      // CUI public
await banca.transactions.import(accountId, file);  // import extras CSV/MT940
await reports.download(reports.saftD406Url(from, to), 'D406.xml'); // declarații (fișier)
```

Helperi suplimentari: `apiUpload()` (multipart cu Bearer), `downloadFile()` (descărcare autentificată ca blob), `downloadUrl()` (construiește URL-ul), `oauthUrl()`.

Tipuri exportate (proprii pentru entitățile importante): `Me`, `Invoice`, `InvoiceLine`, `InvoiceCreateInput`, `Client`, `Product`, `Expense`, `Supplier`, `Warehouse`, `StockLevel`, `JournalEntry`, `LedgerAccount`, `BankAccount`, `BankTransaction`, `FixedAsset`, `TvaRate`, `InvoiceSeries`, `Analytics`. Erorile sunt `ApiError` cu `.status` + `.message`.

Sumele sunt mereu în **bani (integer cents)**. Folosește `ron()` (RON) sau `money(cents, currency)` pentru afișare.

## Structură

```
src/
  lib/api.ts               # client API + tipuri + auth (PUNCTUL DE INTEGRARE — acoperă toate modulele)
  layouts/AppLayout.astro  # shell cu guard de auth + nav + logout
  components/              # React islands: LoginForm (+OAuth), Dashboard, ClientsList,
                           #   InvoiceForm (emite factură), InvoiceDetail
  pages/
    index.astro            # redirect /app sau /login
    login.astro            # + butoane Google/Apple
    auth/callback.astro    # handoff token OAuth (#token=... → localStorage → /app)
    app/index.astro        # dashboard (listă facturi + KPI + CTA „Emite factură")
    app/emite.astro        # ecran de emitere factură (exemplul de scriere)
    app/factura.astro      # detaliu factură, citește ?id= (acțiuni: PDF, share, e-Factura, storno)
    app/clienti.astro      # listă + adăugare clienți
openapi.yaml               # contract OpenAPI 3.1 (auth + module principale)
postman_collection.json    # colecție Postman v2.1 (login capturează {{token}})
```

Notă (output static): pentru detaliu factură nu există rută dinamică `[id]`. Pagina `app/factura.astro` citește `?id=` la runtime în island-ul `InvoiceDetail` (`client:only`). Linkurile sunt `/app/factura?id=<id>`.

## Ecrane noi (referință pentru designer)

- **Emite factură** (`/app/emite`): selector de client (cu „client nou" inline), editor de linii dinamic (descriere, cantitate, preț, TVA% — preumplute din `products.list()`), subtotal/TVA/total live calculat în bani, monedă, scadență, checkbox „Trimite la e-Factura". La submit cheamă `invoices.create(...)` și afișează numărul generat + link „Vezi factura". Este **pattern-ul de scriere** de copiat pentru restul formularelor.
- **Detaliu factură** (`/app/factura?id=`): header + linii + acțiuni (PDF, link public, trimite la e-Factura, storno).

## Contractul API (pentru designer)

Lista completă de endpoint-uri se descoperă fie citind repo-ul backend (`facturamea`, sub `src/pages/api/**`), fie din:

- **`openapi.yaml`** (rădăcina repo) — OpenAPI 3.1: auth + CRUD pentru invoices, clients, products, expenses, suppliers, gestiune, contabilitate, ANAF, bancă. Schema Bearer + serverul `https://facturamea.vercel.app`. Deschide-l în Swagger Editor / Stoplight.
- **`postman_collection.json`** (rădăcina repo) — colecție Postman v2.1 cu variabilele `{{baseUrl}}` și `{{token}}`. Rulează întâi **Auth > Login**: scriptul de test capturează automat token-ul în `{{token}}`, iar restul cererilor trimit `Authorization: Bearer {{token}}`.

## Cum adaugi un ecran nou

1. Creează un island în `src/components/` care folosește `lib/api.ts`.
2. Creează o pagină în `src/pages/app/` cu `AppLayout` + `<Componenta client:only="react" />`.
3. Adaugă un link în `src/layouts/AppLayout.astro` (nav).

Componentele care citesc date trebuie montate cu `client:only="react"` (token-ul e în localStorage, nu există la SSR).

## Endpoints disponibile pe backend

Pe lângă cele din client, backendul expune mult mai mult sub `/api/invoicing/*`, `/api/gestiune/*`, `/api/cheltuieli/*`, `/api/contabilitate/*`, `/api/comenzi/*`, `/api/anaf/*`, `/api/banca/*` etc. Toate acceptă `Authorization: Bearer <token>` și răspund JSON. Documentație publică: `https://facturamea.vercel.app/dezvoltatori`. Adaugă wrappere noi în `src/lib/api.ts` pe măsură ce ai nevoie.

## Deploy

`npm run build` → static, deploy pe Vercel. Setează `PUBLIC_API_URL` în env-ul proiectului Vercel. Originea FE trebuie adăugată în `FRONTEND_ORIGINS` pe backend (CORS).
