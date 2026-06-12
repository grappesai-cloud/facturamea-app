// facturamea API client (token Bearer auth).
// All calls go to PUBLIC_API_URL. The token (returned by login) is stored in
// localStorage and sent as `Authorization: Bearer <token>` on every request.
//
// Usage:
//   import { auth, invoices, clients, products } from '../lib/api';
//   await auth.login(email, password);
//   const { results } = await invoices.list({ kind: 'factura' });
//
// All money is INTEGER cents. Use ron() for display.
// The full endpoint surface lives in the backend repo (facturamea) and in the
// repo-root openapi.yaml. Add wrappers here as new screens need them.

export const API_URL = (import.meta.env.PUBLIC_API_URL || 'https://facturamea.vercel.app').replace(/\/$/, '');
const TOKEN_KEY = 'fm_token';

export function getToken(): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(t: string) { localStorage.setItem(TOKEN_KEY, t); }
export function clearToken() { localStorage.removeItem(TOKEN_KEY); }
export function isAuthed(): boolean { return !!getToken(); }

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

type Query = Record<string, string | number | boolean | undefined | null>;
type Opts = { method?: string; body?: unknown; query?: Query };

function buildUrl(path: string, query?: Query): string {
  const url = new URL(API_URL + path);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

function on401() {
  clearToken();
  if (typeof window !== 'undefined' && !location.pathname.startsWith('/login')) {
    location.href = '/login';
  }
}

export async function api<T = any>(path: string, opts: Opts = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(buildUrl(path, opts.query), {
    method: opts.method || 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  // Auto-logout on 401 (token expired/invalid).
  if (res.status === 401) {
    on401();
    throw new ApiError(401, 'Neautorizat');
  }

  let data: any = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) throw new ApiError(res.status, data?.error || `Eroare ${res.status}`);
  return data as T;
}

// Multipart upload helper (OCR, bank statement import). Does NOT set
// Content-Type so the browser adds the multipart boundary.
export async function apiUpload<T = any>(path: string, form: FormData): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(buildUrl(path), { method: 'POST', headers, body: form });
  if (res.status === 401) { on401(); throw new ApiError(401, 'Neautorizat'); }
  let data: any = null;
  try { data = await res.json(); } catch { /* empty */ }
  if (!res.ok) throw new ApiError(res.status, data?.error || `Eroare ${res.status}`);
  return data as T;
}

// Build an authenticated download URL (server returns a file: PDF/XML/CSV).
// Note: a plain anchor cannot send the Bearer header — use downloadFile() to
// fetch with auth and trigger a browser download from a blob.
export function downloadUrl(path: string, query?: Query): string {
  return buildUrl(path, query);
}

// Fetch a file with the Bearer header and trigger a download in the browser.
export async function downloadFile(path: string, filename: string, query?: Query): Promise<void> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(buildUrl(path, query), { headers });
  if (res.status === 401) { on401(); throw new ApiError(401, 'Neautorizat'); }
  if (!res.ok) {
    let msg = `Eroare ${res.status}`;
    try { const j = await res.json(); msg = j?.error || msg; } catch {}
    throw new ApiError(res.status, msg);
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
}

// ─── OAuth ──────────────────────────────────────────────────────────────
// Full-page redirect to the backend OAuth start endpoint. After the provider
// authenticates, the BE hands the token back to `${origin}/auth/callback`
// via the URL fragment (#token=...). See src/pages/auth/callback.astro.
export function oauthUrl(provider: 'google' | 'apple', origin?: string): string {
  const o = origin || (typeof location !== 'undefined' ? location.origin : '');
  const redirect = encodeURIComponent(`${o}/auth/callback`);
  return `${API_URL}/api/auth/${provider}?redirect=${redirect}`;
}

// ─── Types (mirror the backend) ─────────────────────────────────────────
export type Me = {
  user: { id: string; name: string; email: string; platformId: string; isAdmin: boolean };
  company: { id: string; name: string; subscriptionTier?: string; role?: string } | null;
  license: { plan: 'trial' | 'lifetime'; status: string; active: boolean; trialDaysLeft: number } | null;
  anafConnected: boolean;
};

export type InvoiceKind = 'factura' | 'proforma' | 'aviz' | 'chitanta' | 'storno';
export type InvoiceStatus = 'draft' | 'issued' | 'sent' | 'partial' | 'paid' | 'overdue' | 'voided' | 'disputed';

export type Invoice = {
  id: string;
  fullNumber: string;
  kind: InvoiceKind;
  clientNameSnap: string;
  clientTaxIdSnap?: string | null;
  clientAddressSnap?: string | null;
  currency: string;
  subtotalCents: number;
  vatCents: number;
  totalCents: number;
  paidCents: number;
  status: InvoiceStatus;
  issuedAt?: string | null;
  dueAt?: string | null;
  efacturaStatus?: string | null;
  efacturaError?: string | null;
  shareToken?: string | null;
  createdAt?: string;
};

export type InvoiceLine = {
  id?: string;
  position?: number;
  code?: string | null;
  description: string;
  quantity: number;
  unit?: string;
  unitPriceCents: number;
  vatRate: number;
  lineTotalCents?: number;
};

// Input for creating an invoice line. Money in cents.
export type InvoiceLineInput = {
  description: string;
  quantity: number;
  unitPriceCents: number;
  vatRate: number;
  unit?: string;
  code?: string;
};

export type InvoiceCreateInput = {
  clientExternalId?: string;
  clientCompanyId?: string;
  clientName?: string;
  clientTaxId?: string;
  clientAddress?: string;
  kind?: InvoiceKind;
  currency?: string;
  dueAt?: string;          // ISO date
  sendEfactura?: boolean;
  seriesId?: string;
  modelId?: string;
  vatRegime?: string;
  vatAtCollection?: boolean;
  language?: 'ro' | 'en';
  precision?: 0 | 2 | 3 | 4;
  issueImmediately?: boolean;
  notes?: string;
  lines: InvoiceLineInput[];
};

export type Client = {
  id: string;
  name: string;
  taxId?: string | null;
  isVatPayer?: boolean;
  registryNumber?: string | null;
  country?: string | null;
  county?: string | null;
  city?: string | null;
  address?: string | null;
  postalCode?: string | null;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  iban?: string | null;
  bank?: string | null;
  notes?: string | null;
};

export type Product = {
  id: string;
  code?: string | null;
  name: string;
  description?: string | null;
  defaultUnitPriceCents?: number | null;
  defaultCurrency?: string | null;
  defaultUm?: string | null;
  defaultVatRate?: number | null;
  productType?: string | null;
  isActive?: boolean;
};

export type TvaRate = {
  id: string;
  name: string;
  percent: number;
  regime: string;
  description?: string | null;
  isDefault?: boolean;
  isActive?: boolean;
  position?: number;
};

export type InvoiceSeries = {
  id: string;
  name: string;
  prefix: string;
  kind: 'factura' | 'proforma' | 'storno' | 'chitanta' | 'comanda';
  nextNumber: number;
  isDefault?: boolean;
  scope?: 'platform' | 'external' | null;
};

export type Supplier = {
  id: string;
  name: string;
  cui?: string | null;
  regCom?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  iban?: string | null;
  email?: string | null;
  phone?: string | null;
  isActive?: boolean;
};

export type Expense = {
  id: string;
  supplierId?: string | null;
  supplierName?: string | null;
  supplierNameSnap?: string | null;
  category?: string | null;
  documentType: 'factura' | 'bon' | 'chitanta' | 'extras';
  documentNumber?: string | null;
  issueDate?: string | null;
  dueDate?: string | null;
  currency: string;
  netCents: number;
  vatCents: number;
  totalCents: number;
  paidCents: number;
  status: 'unpaid' | 'partial' | 'paid';
  deductible?: boolean;
  notes?: string | null;
  createdAt?: string;
};

export type Warehouse = {
  id: string;
  name: string;
  code?: string | null;
  type: 'depozit' | 'magazin' | 'custodie';
  address?: string | null;
  managementType: 'cantitativ_valoric' | 'global_valoric';
  isDefault?: boolean;
  isActive?: boolean;
};

export type StockLevel = {
  id: string;
  warehouseId: string;
  warehouseName?: string | null;
  productId: string;
  productName?: string | null;
  productCode?: string | null;
  um?: string | null;
  quantity: number;
  avgCostCents: number;
  minQuantity?: number | null;
  updatedAt?: string;
};

export type JournalEntry = {
  id: string;
  entryNumber?: number;
  entryDate: string;
  description?: string | null;
  source?: string;
  lines: { accountCode: string; debitCents: number; creditCents: number; note?: string | null }[];
};

export type LedgerAccount = {
  id: string;
  code: string;
  name: string;
  type: 'A' | 'P' | 'B' | 'V' | 'C';
  parentCode?: string | null;
  isActive?: boolean;
};

export type BankAccount = {
  id: string;
  name: string;
  iban?: string | null;
  bank?: string | null;
  currency: string;
  balanceCents: number;
  isActive?: boolean;
  unreconciledCount?: number;
};

export type BankTransaction = {
  id: string;
  accountId: string;
  bookingDate?: string | null;
  amountCents: number;
  currency: string;
  description?: string | null;
  counterparty?: string | null;
  counterpartyIban?: string | null;
  reference?: string | null;
  reconciled: boolean;
  matchedType?: 'invoice' | 'expense' | null;
  matchedId?: string | null;
  externalId?: string | null;
};

export type FixedAsset = {
  id: string;
  name: string;
  inventoryNumber?: string | null;
  category?: string | null;
  acquisitionDate?: string | null;
  valueCents: number;
  usefulLifeMonths: number;
  method: 'liniara' | 'degresiva' | 'accelerata';
  accumulatedCents: number;
  status: string;
};

export type AnafLookup = {
  found?: boolean;
  cui?: string;
  name?: string;
  address?: string;
  vatPayer?: boolean;
  [k: string]: any;
};

// ─── Auth ───────────────────────────────────────────────────────────────
export const auth = {
  async login(email: string, password: string) {
    const data = await api<{ token: string; user: Me['user']; company: Me['company'] }>('/api/auth/token', {
      method: 'POST', body: { email, password },
    });
    setToken(data.token);
    return data;
  },
  async me() { return api<Me>('/api/auth/me'); },
  async logout() {
    try { await api('/api/auth/token', { method: 'DELETE' }); } catch {}
    clearToken();
  },
  // OAuth start URLs (full-page navigation). See oauthUrl().
  googleUrl: (origin?: string) => oauthUrl('google', origin),
  appleUrl: (origin?: string) => oauthUrl('apple', origin),
};

// ─── Invoices ─────────────────────────────────────────────────────────────
export const invoices = {
  list(query: { kind?: string; status?: string; q?: string; from?: string } = {}) {
    return api<{ results: Invoice[] }>('/api/invoicing/invoices', { query });
  },
  get(id: string) {
    return api<{ invoice: Invoice; lines: InvoiceLine[] }>(`/api/invoicing/invoices/${id}`);
  },
  create(body: InvoiceCreateInput) {
    // `kind` is required by the API; default to 'factura' for ergonomics.
    return api<{ id: string; fullNumber: string; totalCents: number; efactura?: { sent: boolean; ok?: boolean; error?: string } }>(
      '/api/invoicing/invoices', { method: 'POST', body: { kind: 'factura', ...body } },
    );
  },
  // Submit to ANAF SPV (e-Factura).
  sendEfactura(id: string) { return api(`/api/invoicing/invoices/${id}/efactura`, { method: 'POST' }); },
  // Re-check SPV processing status; updates efacturaStatus when ANAF finalizes.
  efacturaStatus(id: string) {
    return api<{ ok: boolean; status?: string | null; processing?: boolean; error?: string }>(
      `/api/invoicing/invoices/${id}/efactura-status`, { method: 'POST' },
    );
  },
  // Record a payment + emit a chitanță. body in cents.
  chitanta(id: string, body: { amountCents: number; method?: 'cash' | 'card' | 'transfer'; reference?: string }) {
    return api<{ id: string; fullNumber: string }>(`/api/invoicing/invoices/${id}/chitanta`, { method: 'POST', body });
  },
  // Create a storno (negative mirror) and void the parent.
  storno(id: string) {
    return api<{ id: string; fullNumber: string }>(`/api/invoicing/invoices/${id}/storno`, { method: 'POST' });
  },
  // Public read-only share link.
  share(id: string) {
    return api<{ token: string; url: string }>(`/api/invoicing/invoices/${id}/share`, { method: 'POST' });
  },
  revokeShare(id: string) { return api(`/api/invoicing/invoices/${id}/share`, { method: 'DELETE' }); },
  // Stripe payment link.
  paymentLink(id: string) { return api<{ url: string }>(`/api/invoicing/invoices/${id}/payment-link`, { method: 'POST' }); },
  // Server-rendered PDF. Authenticated URL; use pdfDownload() to save it.
  pdfUrl(id: string) { return downloadUrl(`/api/invoicing/invoices/${id}/pdf`); },
  pdfDownload(id: string, fullNumber: string) { return downloadFile(`/api/invoicing/invoices/${id}/pdf`, `${fullNumber}.pdf`); },
  send(id: string, body?: { email?: string }) { return api(`/api/invoicing/invoices/${id}/send`, { method: 'POST', body }); },
};

export const clients = {
  list(q?: string) { return api<{ results: Client[] }>('/api/invoicing/clients', { query: { q } }); },
  create(body: Partial<Client> & { name: string }) {
    return api<{ id: string }>('/api/invoicing/clients', { method: 'POST', body });
  },
  update(body: Partial<Client> & { id: string }) {
    return api<{ ok: true }>('/api/invoicing/clients', { method: 'PATCH', body });
  },
  remove(id: string) { return api<{ ok: true }>('/api/invoicing/clients', { method: 'DELETE', query: { id } }); },
};

export const products = {
  list(q?: string) { return api<{ results: Product[] }>('/api/invoicing/products', { query: { q } }); },
  create(body: { name: string; defaultUnitPriceCents?: number; defaultVatRate?: number; defaultUm?: string; defaultCurrency?: string; code?: string; description?: string; productType?: string }) {
    return api<{ id: string }>('/api/invoicing/products', { method: 'POST', body });
  },
  update(body: { id: string } & Record<string, unknown>) {
    return api<{ ok: true }>('/api/invoicing/products', { method: 'PATCH', body });
  },
  remove(id: string) { return api<{ ok: true }>('/api/invoicing/products', { method: 'DELETE', query: { id } }); },
};

// VAT-rate catalogue (cote TVA).
export const tva = {
  list() { return api<{ results: TvaRate[] }>('/api/invoicing/tva'); },
  create(body: { name: string; percent: number; regime?: string; description?: string; isDefault?: boolean; isActive?: boolean }) {
    return api<{ id: string }>('/api/invoicing/tva', { method: 'POST', body });
  },
  update(body: { id: string } & Partial<TvaRate>) { return api<{ ok: true }>('/api/invoicing/tva', { method: 'PATCH', body }); },
  remove(id: string) { return api<{ ok: true }>('/api/invoicing/tva', { method: 'DELETE', query: { id } }); },
};

export const series = {
  list() { return api<{ results: InvoiceSeries[] }>('/api/invoicing/series'); },
  create(body: { name: string; prefix: string; kind: InvoiceSeries['kind']; nextNumber?: number; isDefault?: boolean; scope?: 'platform' | 'external' | null }) {
    return api<{ id: string }>('/api/invoicing/series', { method: 'POST', body });
  },
  update(body: { id: string } & Partial<InvoiceSeries>) { return api<{ ok: true }>('/api/invoicing/series', { method: 'PATCH', body }); },
  remove(id: string) { return api<{ ok: true }>('/api/invoicing/series', { method: 'DELETE', query: { id } }); },
};

// Invoice layout/branding models.
export const models = {
  list() { return api<{ results: any[] }>('/api/invoicing/models'); },
  create(body: { name: string; layoutKey?: 'classic' | 'accent'; brandColor?: string; logoUrl?: string; footerText?: string; showQr?: boolean; showShipping?: boolean; isDefault?: boolean }) {
    return api<{ id: string }>('/api/invoicing/models', { method: 'POST', body });
  },
  update(body: { id: string } & Record<string, unknown>) { return api<{ ok: true }>('/api/invoicing/models', { method: 'PATCH', body }); },
  remove(id: string) { return api<{ ok: true }>('/api/invoicing/models', { method: 'DELETE', query: { id } }); },
};

// Recurring invoice schedules.
export const recurring = {
  list() { return api<{ results: any[] }>('/api/invoicing/recurring'); },
  create(body: {
    name: string;
    frequency: 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';
    startAt: string;                  // YYYY-MM-DD
    lines: InvoiceLineInput[];
    clientExternalId?: string;
    clientCompanyId?: string;
    endAt?: string;
    seriesId?: string;
    currency?: string;
    paymentTermDays?: number;
    sendEmail?: boolean;
    recipientEmail?: string;
    notes?: string;
    maxRuns?: number;
  }) {
    return api<{ id: string }>('/api/invoicing/recurring', { method: 'POST', body });
  },
  update(body: { id: string } & Record<string, unknown>) { return api<{ ok: true }>('/api/invoicing/recurring', { method: 'PATCH', body }); },
  remove(id: string) { return api<{ ok: true }>('/api/invoicing/recurring', { method: 'DELETE', query: { id } }); },
};

// Company-wide e-Factura auto-send preference.
export const efacturaSettings = {
  get() { return api<{ autoSend: boolean }>('/api/invoicing/efactura-settings'); },
  set(autoSend: boolean) { return api<{ ok: boolean; autoSend: boolean }>('/api/invoicing/efactura-settings', { method: 'POST', body: { autoSend } }); },
};

export type Analytics = {
  period: { from: string; to: string };
  monthlyInvoiced: { month: string; cents: number }[];
  monthlyCollected: { month: string; cents: number }[];
  topClients: { name: string; cents: number }[];
  topProducts: { name: string; cents: number }[];
  byStatus: { status: string; count: number; cents: number }[];
  grossMargin: { revenueCents: number; costCents: number; marginCents: number; marginPct: number };
};

// Reports + fiscal declarations. analytics() returns JSON; the rest are file
// downloads (XML/CSV) — use the *Url helper with downloadFile().
export const reports = {
  analytics(query: { from?: string; to?: string } = {}) {
    return api<Analytics>('/api/invoicing/reports/analytics', { query });
  },
  saftD406Url(from: string, to: string, type: 'L' | 'T' | 'A' | 'C' = 'L') {
    return downloadUrl('/api/invoicing/reports/saft-d406', { from, to, type });
  },
  d394Url(from: string, to: string) { return downloadUrl('/api/invoicing/reports/d394', { from, to }); },
  d300Url(from: string, to: string) { return downloadUrl('/api/invoicing/reports/d300', { from, to }); },
  d390Url(from: string, to: string) { return downloadUrl('/api/invoicing/reports/d390', { from, to }); },
  agingUrl() { return downloadUrl('/api/invoicing/reports/aging'); },
  exportUrl(query: { from?: string; to?: string } = {}) { return downloadUrl('/api/invoicing/reports/export', query); },
  download(path: string, filename: string) { return downloadFile(path, filename); },
};

// ─── Gestiune (inventory / warehouses) ──────────────────────────────────
export const gestiune = {
  warehouses: {
    list() { return api<{ results: Warehouse[] }>('/api/gestiune/warehouses'); },
    create(body: { name: string; code?: string; type?: Warehouse['type']; address?: string; managementType?: Warehouse['managementType']; isDefault?: boolean }) {
      return api<{ id: string }>('/api/gestiune/warehouses', { method: 'POST', body });
    },
  },
  stock(query: { warehouseId?: string } = {}) { return api<{ results: StockLevel[] }>('/api/gestiune/stock', { query }); },
  movements(query: { productId?: string } = {}) { return api<{ results: any[] }>('/api/gestiune/movements', { query }); },
  receptions: {
    list() { return api<{ results: any[] }>('/api/gestiune/receptions'); },
    create(body: {
      warehouseId: string; nirNumber: string; supplierId?: string;
      supplierInvoiceNumber?: string; receptionDate?: string; status?: 'draft' | 'posted'; notes?: string;
      lines: { productId?: string; name: string; um?: string; quantity: number; unitCostCents: number; vatRate?: number }[];
    }) {
      return api<{ id: string }>('/api/gestiune/receptions', { method: 'POST', body });
    },
  },
  counts: {
    list(query: { warehouseId?: string } = {}) { return api<{ results: any[] }>('/api/gestiune/counts', { query }); },
    create(body: { warehouseId: string; number?: string; countDate?: string; notes?: string }) {
      return api<{ id: string; number: string }>('/api/gestiune/counts', { method: 'POST', body });
    },
  },
  transfer(body: { fromWarehouseId: string; toWarehouseId: string; productId: string; quantity: number }) {
    return api<{ ok: true }>('/api/gestiune/transfer', { method: 'POST', body });
  },
  lots: {
    list(query: { productId?: string; warehouseId?: string } = {}) { return api<{ results: any[] }>('/api/gestiune/lots', { query }); },
    create(body: { productId: string; lotCode: string; warehouseId?: string; expiryDate?: string; quantity?: number; unitCostCents?: number }) {
      return api<{ id: string }>('/api/gestiune/lots', { method: 'POST', body });
    },
  },
};

// ─── Cheltuieli (expenses + suppliers + OCR) ─────────────────────────────
export const cheltuieli = {
  expenses: {
    list(query: { status?: 'unpaid' | 'partial' | 'paid'; category?: string } = {}) {
      return api<{ results: Expense[] }>('/api/cheltuieli/expenses', { query });
    },
    create(body: {
      supplierId?: string; supplierNameSnap?: string; category?: string;
      documentType?: Expense['documentType']; documentNumber?: string; issueDate?: string; dueDate?: string;
      currency?: string; netCents?: number; vatCents?: number; totalCents?: number; paidCents?: number;
      deductible?: boolean; attachmentUrl?: string; attachmentName?: string; notes?: string;
    }) {
      return api<{ id: string }>('/api/cheltuieli/expenses', { method: 'POST', body });
    },
    update(id: string, body: { paidCents?: number; markPaid?: boolean; status?: Expense['status']; category?: string; notes?: string; deductible?: boolean }) {
      return api<{ ok: true }>(`/api/cheltuieli/expenses/${id}`, { method: 'PATCH', body });
    },
    remove(id: string) { return api<{ ok: true }>(`/api/cheltuieli/expenses/${id}`, { method: 'DELETE' }); },
  },
  suppliers: {
    list(q?: string) { return api<{ results: Supplier[] }>('/api/cheltuieli/suppliers', { query: { q } }); },
    create(body: Partial<Supplier> & { name: string }) {
      return api<{ id: string }>('/api/cheltuieli/suppliers', { method: 'POST', body });
    },
    update(id: string, body: Partial<Supplier>) { return api<{ ok: true }>(`/api/cheltuieli/suppliers/${id}`, { method: 'PATCH', body }); },
    remove(id: string) { return api<{ ok: true }>(`/api/cheltuieli/suppliers/${id}`, { method: 'DELETE' }); },
  },
  // Extract fields from a receipt/invoice image or PDF (multipart, field `file`).
  ocr(file: File) {
    const fd = new FormData();
    fd.append('file', file);
    return apiUpload<{ ok: boolean; fields?: Record<string, any>; error?: string }>('/api/cheltuieli/ocr', fd);
  },
};

// ─── Contabilitate (accounting) ──────────────────────────────────────────
export const contabilitate = {
  // Initialize the Romanian chart of accounts.
  setup() { return api<{ ok: boolean; created: number }>('/api/contabilitate/setup', { method: 'POST' }); },
  // Auto-generate journal entries from unposted docs (idempotent).
  autoPost() { return api<{ ok: boolean } & Record<string, any>>('/api/contabilitate/auto-post', { method: 'POST' }); },
  entries: {
    list(query: { from?: string; to?: string } = {}) { return api<{ results: JournalEntry[] }>('/api/contabilitate/entries', { query }); },
    create(body: { entryDate?: string; description?: string; lines: { accountCode: string; debitCents: number; creditCents: number; note?: string }[] }) {
      return api<{ ok: boolean; entryId: string; entryNumber: number }>('/api/contabilitate/entries', { method: 'POST', body });
    },
  },
  accounts: {
    list() { return api<{ results: LedgerAccount[] }>('/api/contabilitate/accounts'); },
    create(body: { code: string; name: string; type: LedgerAccount['type']; parentCode?: string; isActive?: boolean }) {
      return api<{ ok: boolean; id: string }>('/api/contabilitate/accounts', { method: 'POST', body });
    },
    update(body: { id: string } & Partial<LedgerAccount>) { return api<{ ok: true }>('/api/contabilitate/accounts', { method: 'PATCH', body }); },
  },
  // Balanță de verificare (trial balance).
  balance(query: { from?: string; to?: string } = {}) { return api<{ rows: any[]; from: string; to: string }>('/api/contabilitate/balance', { query }); },
  // Fișa contului (account ledger with running balance).
  ledger(query: { code: string; from?: string; to?: string }) { return api<{ code: string; name: string; lines: any[]; opening: number }>('/api/contabilitate/ledger', { query }); },
};

// ─── Comenzi (sales + purchase orders) ───────────────────────────────────
export const comenzi = {
  sales: {
    list(query: { status?: string } = {}) { return api<{ results: any[] }>('/api/comenzi/sales', { query }); },
    create(body: {
      clientExternalId?: string; clientName?: string; orderDate?: string; currency?: string;
      number?: string; status?: string; notes?: string;
      lines: { productId?: string; name: string; quantity: number; unitPriceCents: number; vatRate?: number }[];
    }) {
      return api<{ id: string; number: string }>('/api/comenzi/sales', { method: 'POST', body });
    },
    get(id: string) { return api<{ order: any; lines: any[] }>(`/api/comenzi/sales/${id}`); },
    // Turn the order into a factură.
    invoice(id: string) { return api<{ ok: boolean; invoiceId: string; fullNumber: string; totalCents: number }>(`/api/comenzi/sales/${id}`, { method: 'PATCH', body: { action: 'invoice' } }); },
    setStatus(id: string, status: string) { return api<{ ok: boolean; status: string }>(`/api/comenzi/sales/${id}`, { method: 'PATCH', body: { status } }); },
    remove(id: string) { return api<{ ok: true }>(`/api/comenzi/sales/${id}`, { method: 'DELETE' }); },
  },
  purchase: {
    list(query: { status?: string } = {}) { return api<{ results: any[] }>('/api/comenzi/purchase', { query }); },
    create(body: {
      supplierId?: string; supplierName?: string; orderDate?: string; expectedDate?: string; currency?: string;
      number?: string; status?: string; notes?: string;
      lines: { productId?: string; name: string; quantity: number; unitPriceCents: number; vatRate?: number }[];
    }) {
      return api<{ id: string; number: string }>('/api/comenzi/purchase', { method: 'POST', body });
    },
    get(id: string) { return api<{ order: any; lines: any[] }>(`/api/comenzi/purchase/${id}`); },
    // Receive into a warehouse (posts stock IN).
    receive(id: string, warehouseId: string) { return api<{ ok: boolean; status: string }>(`/api/comenzi/purchase/${id}`, { method: 'PATCH', body: { action: 'receive', warehouseId } }); },
    setStatus(id: string, status: string) { return api<{ ok: boolean; status: string }>(`/api/comenzi/purchase/${id}`, { method: 'PATCH', body: { status } }); },
    remove(id: string) { return api<{ ok: true }>(`/api/comenzi/purchase/${id}`, { method: 'DELETE' }); },
  },
};

// ─── ANAF (e-Factura inbox, e-Transport, CUI lookup) ─────────────────────
export const anaf = {
  inbox: {
    list() { return api<{ ok: boolean; rows: any[] }>('/api/anaf/inbox'); },
    sync() { return api<{ ok: boolean; synced?: number; total?: number; error?: string }>('/api/anaf/inbox/sync', { method: 'POST' }); },
    import(id: string) { return api<{ ok: boolean; expenseId?: string; error?: string }>(`/api/anaf/inbox/${id}/import`, { method: 'POST' }); },
  },
  etransport: {
    list() { return api<{ ok: boolean; rows: any[] }>('/api/anaf/etransport'); },
    create(body: {
      operationType: string; vehiclePlate: string;
      senderName?: string; recipientName?: string; loadingAddress?: string; unloadingAddress?: string;
      goods: { name?: string; qty?: number | string; value?: number | string; ncCode?: string; unit?: string; grossWeightKg?: number | string }[];
    }) {
      return api<{ ok: boolean; id?: string; status?: string; uit?: string | null; note?: string; error?: string }>('/api/anaf/etransport', { method: 'POST', body });
    },
    get(id: string) { return api<{ ok: boolean; row?: any }>(`/api/anaf/etransport/${id}`); },
  },
  // Public CUI lookup (no auth needed, rate-limited per IP).
  lookup(cui: string) { return api<AnafLookup>('/api/anaf/lookup', { query: { cui } }); },
};

// ─── Bancă (accounts, transactions, reconciliation) ──────────────────────
export const banca = {
  accounts: {
    list() { return api<{ accounts: BankAccount[] }>('/api/banca/accounts'); },
    create(body: { name: string; iban?: string; bank?: string; currency?: string }) {
      return api<{ id: string }>('/api/banca/accounts', { method: 'POST', body });
    },
  },
  transactions: {
    list(query: { accountId?: string; reconciled?: boolean } = {}) {
      return api<{ transactions: BankTransaction[] }>('/api/banca/transactions', { query });
    },
    // Import a statement (CSV/MT940). multipart: accountId + file.
    import(accountId: string, file: File) {
      const fd = new FormData();
      fd.append('accountId', accountId);
      fd.append('file', file);
      return apiUpload<{ imported: number; skipped: number; total: number; format?: string; warnings?: string[]; error?: string }>('/api/banca/transactions/import', fd);
    },
    // Transaction + suggested matches.
    get(id: string) { return api<{ transaction: BankTransaction | null; suggestions: any[] }>(`/api/banca/transactions/${id}`); },
    reconcile(id: string, body: { matchType: 'invoice' | 'expense'; matchId: string }) {
      return api<{ ok: true }>(`/api/banca/transactions/${id}`, { method: 'POST', body });
    },
    unreconcile(id: string) { return api<{ ok: true }>(`/api/banca/transactions/${id}`, { method: 'PATCH', body: { reconciled: false } }); },
  },
};

// ─── POS (point of sale) ─────────────────────────────────────────────────
export const pos = {
  products(q?: string) { return api<{ results: Product[] }>('/api/pos/products', { query: { q } }); },
  sales: {
    list() { return api<{ results: any[] }>('/api/pos/sales'); },
    // Prices are VAT-inclusive at POS.
    create(body: {
      paymentMethod?: 'cash' | 'card' | 'mixed'; cashReceivedCents?: number; warehouseId?: string;
      lines: { productId?: string; name: string; quantity: number; unitPriceCents: number; vatRate?: number }[];
    }) {
      return api<{ id: string; receiptNumber: string; subtotalCents: number; vatCents: number; totalCents: number; changeCents: number }>('/api/pos/sales', { method: 'POST', body });
    },
  },
};

// ─── Mijloace fixe (fixed assets) ────────────────────────────────────────
export const mijloaceFixe = {
  list() { return api<{ results: FixedAsset[] }>('/api/mijloace-fixe'); },
  create(body: { name: string; valueCents: number; usefulLifeMonths?: number; method?: FixedAsset['method']; inventoryNumber?: string; category?: string; acquisitionDate?: string }) {
    return api<{ id: string }>('/api/mijloace-fixe', { method: 'POST', body });
  },
  get(id: string) { return api<{ asset: FixedAsset } | any>(`/api/mijloace-fixe/${id}`); },
  update(id: string, body: Partial<FixedAsset>) { return api<{ ok: true }>(`/api/mijloace-fixe/${id}`, { method: 'PATCH', body }); },
  remove(id: string) { return api<{ ok: true }>(`/api/mijloace-fixe/${id}`, { method: 'DELETE' }); },
  runDepreciation(period?: string) { return api<{ ok: boolean } & Record<string, any>>('/api/mijloace-fixe/run-depreciation', { method: 'POST', body: { period } }); },
};

// ─── Settings (team, dunning, API keys) ──────────────────────────────────
export const settings = {
  team: {
    list() { return api<{ members: any[] }>('/api/settings/team'); },
    add(body: { name: string; email: string; role: string }) { return api<{ ok: boolean; userId: string; platformId: string }>('/api/settings/team', { method: 'POST', body }); },
    update(id: string, body: Record<string, unknown>) { return api<{ ok: true }>(`/api/settings/team/${id}`, { method: 'PATCH', body }); },
    remove(id: string) { return api<{ ok: true }>(`/api/settings/team/${id}`, { method: 'DELETE' }); },
  },
  dunning: {
    get() { return api<{ enabled: boolean }>('/api/settings/dunning'); },
    set(enabled: boolean) { return api<{ ok: boolean; enabled: boolean }>('/api/settings/dunning', { method: 'POST', body: { enabled } }); },
    runNow() { return api<{ ok: boolean; sent: number; summary?: any }>('/api/settings/dunning', { method: 'POST', body: { runNow: true } }); },
  },
  apiKeys: {
    list() { return api<{ keys: any[] }>('/api/settings/api-keys'); },
    // Returns the raw key value ONCE in `key`.
    create(body: { name: string; mode?: 'live' | 'test' }) { return api<{ id: string; name: string; prefix: string; mode: string; key: string }>('/api/settings/api-keys', { method: 'POST', body }); },
    remove(id: string) { return api<{ ok: true }>(`/api/settings/api-keys/${id}`, { method: 'DELETE' }); },
  },
};

// ─── Helpers ────────────────────────────────────────────────────────────
export const ron = (cents: number) =>
  new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'RON' }).format((cents || 0) / 100);

// Format any currency by ISO code (BE keeps all amounts in cents).
export const money = (cents: number, currency = 'RON') =>
  new Intl.NumberFormat('ro-RO', { style: 'currency', currency }).format((cents || 0) / 100);
