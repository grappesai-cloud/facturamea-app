// facturamea API client (token Bearer auth).
// All calls go to PUBLIC_API_URL. The token (returned by login) is stored in
// localStorage and sent as `Authorization: Bearer <token>` on every request.
//
// Usage:
//   import { auth, invoices, clients, products } from '../lib/api';
//   await auth.login(email, password);
//   const { results } = await invoices.list({ kind: 'factura' });

const API_URL = (import.meta.env.PUBLIC_API_URL || 'https://facturamea.vercel.app').replace(/\/$/, '');
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

type Opts = { method?: string; body?: unknown; query?: Record<string, string | number | undefined> };

export async function api<T = any>(path: string, opts: Opts = {}): Promise<T> {
  const url = new URL(API_URL + path);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
  }
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url.toString(), {
    method: opts.method || 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  // Auto-logout on 401 (token expired/invalid).
  if (res.status === 401) {
    clearToken();
    if (typeof window !== 'undefined' && !location.pathname.startsWith('/login')) {
      location.href = '/login';
    }
    throw new ApiError(401, 'Neautorizat');
  }

  let data: any = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) throw new ApiError(res.status, data?.error || `Eroare ${res.status}`);
  return data as T;
}

// ─── Types (mirror the backend) ─────────────────────────────────────────
export type Me = {
  user: { id: string; name: string; email: string; platformId: string; isAdmin: boolean };
  company: { id: string; name: string; subscriptionTier?: string; role?: string } | null;
  license: { plan: 'trial' | 'lifetime'; status: string; active: boolean; trialDaysLeft: number } | null;
  anafConnected: boolean;
};

export type Invoice = {
  id: string;
  fullNumber: string;
  kind: 'factura' | 'proforma' | 'aviz' | 'chitanta' | 'storno';
  clientNameSnap: string;
  clientTaxIdSnap?: string | null;
  currency: string;
  subtotalCents: number;
  vatCents: number;
  totalCents: number;
  paidCents: number;
  status: 'draft' | 'issued' | 'sent' | 'partial' | 'paid' | 'overdue' | 'voided' | 'disputed';
  issuedAt?: string | null;
  dueAt?: string | null;
  efacturaStatus?: string | null;
  createdAt?: string;
};

export type Client = {
  id: string;
  name: string;
  taxId?: string | null;
  isVatPayer?: boolean;
  city?: string | null;
  address?: string | null;
  email?: string | null;
  phone?: string | null;
};

export type Product = {
  id: string;
  code?: string | null;
  name: string;
  defaultUnitPriceCents?: number | null;
  defaultUm?: string | null;
  defaultVatRate?: number | null;
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
};

// ─── Resources ──────────────────────────────────────────────────────────
export const invoices = {
  list(query: { kind?: string; status?: string; q?: string } = {}) {
    return api<{ results: Invoice[] }>('/api/invoicing/invoices', { query });
  },
  get(id: string) { return api<Invoice>(`/api/invoicing/invoices/${id}`); },
  create(body: {
    clientExternalId?: string;
    clientCompanyId?: string;
    kind?: string;
    currency?: string;
    dueAt?: string;
    sendEfactura?: boolean;
    lines: { description: string; quantity: number; unitPriceCents: number; vatRate: number; code?: string }[];
  }) {
    return api<{ id: string; fullNumber: string; totalCents: number }>('/api/invoicing/invoices', { method: 'POST', body });
  },
  sendEfactura(id: string) { return api(`/api/invoicing/invoices/${id}/efactura`, { method: 'POST' }); },
  paymentLink(id: string) { return api<{ url: string }>(`/api/invoicing/invoices/${id}/payment-link`, { method: 'POST' }); },
};

export const clients = {
  list(q?: string) { return api<{ results: Client[] }>('/api/invoicing/clients', { query: { q } }); },
  create(body: Partial<Client> & { name: string }) {
    return api<{ id: string }>('/api/invoicing/clients', { method: 'POST', body });
  },
};

export const products = {
  list(q?: string) { return api<{ results: Product[] }>('/api/invoicing/products', { query: { q } }); },
  create(body: { name: string; defaultUnitPriceCents?: number; defaultVatRate?: number; defaultUm?: string; code?: string }) {
    return api<{ id: string }>('/api/invoicing/products', { method: 'POST', body });
  },
};

// ─── Helpers ────────────────────────────────────────────────────────────
export const ron = (cents: number) =>
  new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'RON' }).format((cents || 0) / 100);
