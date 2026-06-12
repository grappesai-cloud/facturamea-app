import { useEffect, useMemo, useState } from 'react';
import {
  clients, products, invoices, ron,
  type Client, type Product, type InvoiceLineInput,
} from '../lib/api';

// One editable line in the form. Prices are entered in RON (major units) and
// converted to integer cents on submit — the BE is authoritative on totals.
type Line = {
  description: string;
  quantity: number;
  unitPrice: number; // RON, major units (UI only)
  vatRate: number;
  code?: string;
};

const VAT_RATES = [21, 11, 9, 5, 0];
const CURRENCIES = ['RON', 'EUR', 'USD'];

const input =
  'px-3 py-2.5 bg-white border border-[#E8E8E4] rounded-xl text-[15px] focus:border-[#0A0A0A] focus:outline-none';
const label = 'block text-[13px] font-medium mb-1.5 text-[#3D3D3A]';

const emptyLine = (): Line => ({ description: '', quantity: 1, unitPrice: 0, vatRate: 21 });

export default function InvoiceForm() {
  const [clientList, setClientList] = useState<Client[]>([]);
  const [productList, setProductList] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const [clientId, setClientId] = useState('');
  const [currency, setCurrency] = useState('RON');
  const [dueAt, setDueAt] = useState('');
  const [sendEfactura, setSendEfactura] = useState(false);
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([emptyLine()]);

  // Inline "client nou".
  const [newClientOpen, setNewClientOpen] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newClientTaxId, setNewClientTaxId] = useState('');
  const [savingClient, setSavingClient] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');
  const [created, setCreated] = useState<{ id: string; fullNumber: string; efactura?: { sent: boolean; ok?: boolean; error?: string } } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [c, p] = await Promise.all([clients.list(), products.list()]);
        setClientList(c.results || []);
        setProductList(p.results || []);
      } catch { /* api() handles 401 */ }
      finally { setLoading(false); }
    })();
  }, []);

  // ── Totals (computed in cents to match the BE) ──
  const totals = useMemo(() => {
    let subtotalCents = 0;
    let vatCents = 0;
    for (const l of lines) {
      const upCents = Math.round((Number(l.unitPrice) || 0) * 100);
      const lineSub = Math.round((Number(l.quantity) || 0) * upCents);
      subtotalCents += lineSub;
      vatCents += Math.round((lineSub * (Number(l.vatRate) || 0)) / 100);
    }
    return { subtotalCents, vatCents, totalCents: subtotalCents + vatCents };
  }, [lines]);

  const setLine = (i: number, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const addLine = () => setLines((prev) => [...prev, emptyLine()]);
  const removeLine = (i: number) => setLines((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));

  // Prefill a line from a product in the catalog.
  const pickProduct = (i: number, productId: string) => {
    const p = productList.find((x) => x.id === productId);
    if (!p) return;
    setLine(i, {
      description: p.name,
      unitPrice: (p.defaultUnitPriceCents ?? 0) / 100,
      vatRate: p.defaultVatRate ?? 21,
      code: p.code || undefined,
    });
  };

  const saveNewClient = async () => {
    if (!newClientName.trim()) return;
    setSavingClient(true); setErr('');
    try {
      const { id } = await clients.create({ name: newClientName.trim(), taxId: newClientTaxId.trim() || undefined });
      const refreshed = await clients.list();
      setClientList(refreshed.results || []);
      setClientId(id);
      setNewClientOpen(false);
      setNewClientName(''); setNewClientTaxId('');
    } catch (e: any) {
      setErr(e?.message || 'Nu am putut salva clientul.');
    } finally { setSavingClient(false); }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    if (!clientId) { setErr('Alege un client.'); return; }
    const cleanLines: InvoiceLineInput[] = lines
      .filter((l) => l.description.trim() && Number(l.quantity) > 0)
      .map((l) => ({
        description: l.description.trim(),
        quantity: Number(l.quantity),
        unitPriceCents: Math.round((Number(l.unitPrice) || 0) * 100),
        vatRate: Number(l.vatRate) || 0,
        code: l.code?.trim() || undefined,
      }));
    if (cleanLines.length === 0) { setErr('Adaugă cel puțin o linie validă.'); return; }

    setSubmitting(true);
    try {
      const res = await invoices.create({
        clientExternalId: clientId,
        currency,
        dueAt: dueAt || undefined,
        sendEfactura,
        notes: notes.trim() || undefined,
        lines: cleanLines,
      });
      setCreated(res);
    } catch (e: any) {
      setErr(e?.message || 'Nu am putut emite factura.');
    } finally { setSubmitting(false); }
  };

  if (loading) return <p className="text-[15px] text-[#6B6B68]">Se încarcă…</p>;

  // ── Success state ──
  if (created) {
    const ef = created.efactura;
    return (
      <div className="max-w-[560px]">
        <div className="bg-white border border-[#E8E8E4] rounded-2xl p-6 text-center">
          <div className="w-12 h-12 rounded-full bg-[#E7F7EC] text-[#15803D] flex items-center justify-center mx-auto mb-3 text-[22px]">✓</div>
          <h2 className="text-[20px] font-bold tracking-[-0.02em]">Factură emisă</h2>
          <p className="text-[15px] text-[#6B6B68] mt-1">
            Numărul facturii: <span className="font-mono font-semibold text-[#0A0A0A]">{created.fullNumber}</span>
          </p>
          {ef?.sent && (
            <p className={`text-[14px] mt-3 ${ef.ok === false ? 'text-[#B91C1C]' : 'text-[#15803D]'}`}>
              {ef.ok === false ? `e-Factura: trimitere eșuată (${ef.error || 'eroare'})` : 'Trimisă la e-Factura (ANAF).'}
            </p>
          )}
          <div className="flex items-center justify-center gap-2 mt-5">
            <a href={`/app/factura?id=${created.id}`} className="px-5 py-2.5 bg-[#FF5C00] hover:bg-[#E04E00] text-white font-semibold rounded-xl text-[15px]">Vezi factura</a>
            <button
              onClick={() => { setCreated(null); setLines([emptyLine()]); setClientId(''); setNotes(''); setSendEfactura(false); }}
              className="px-5 py-2.5 border border-[#E8E8E4] hover:bg-[#F0F0EC] font-semibold rounded-xl text-[15px]"
            >
              Emite alta
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="max-w-[820px]">
      <h1 className="text-[26px] font-bold tracking-[-0.02em] mb-5">Emite factură</h1>

      {/* Client + header */}
      <div className="bg-white border border-[#E8E8E4] rounded-2xl p-5 mb-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className={label}>Client</label>
            <div className="flex gap-2">
              <select value={clientId} onChange={(e) => setClientId(e.target.value)} className={input + ' flex-1'}>
                <option value="">Alege clientul…</option>
                {clientList.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}{c.taxId ? ` · ${c.taxId}` : ''}</option>
                ))}
              </select>
              <button type="button" onClick={() => setNewClientOpen((v) => !v)} className="px-3 py-2.5 border border-[#E8E8E4] hover:bg-[#F0F0EC] rounded-xl text-[14px] font-medium whitespace-nowrap">
                + Client nou
              </button>
            </div>
            {newClientOpen && (
              <div className="mt-3 p-3 bg-[#FAFAF8] border border-[#E8E8E4] rounded-xl space-y-2">
                <input value={newClientName} onChange={(e) => setNewClientName(e.target.value)} placeholder="Denumire client" className={input + ' w-full'} />
                <input value={newClientTaxId} onChange={(e) => setNewClientTaxId(e.target.value)} placeholder="CUI (opțional)" className={input + ' w-full'} />
                <button type="button" disabled={savingClient || !newClientName.trim()} onClick={saveNewClient} className="px-4 py-2 bg-[#0A0A0A] hover:bg-[#222] disabled:opacity-50 text-white font-medium rounded-xl text-[14px]">
                  {savingClient ? 'Se salvează…' : 'Salvează clientul'}
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Monedă</label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={input + ' w-full'}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Scadență</label>
              <input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className={input + ' w-full'} />
            </div>
          </div>
        </div>
      </div>

      {/* Lines */}
      <div className="bg-white border border-[#E8E8E4] rounded-2xl overflow-hidden mb-4">
        <div className="px-5 py-3.5 border-b border-[#F0F0EC] font-semibold text-[16px]">Produse / servicii</div>
        <div className="p-4 space-y-3">
          {lines.map((l, i) => {
            const upCents = Math.round((Number(l.unitPrice) || 0) * 100);
            const lineSub = Math.round((Number(l.quantity) || 0) * upCents);
            const lineTotal = lineSub + Math.round((lineSub * (Number(l.vatRate) || 0)) / 100);
            return (
              <div key={i} className="border border-[#F0F0EC] rounded-xl p-3">
                <div className="flex flex-wrap gap-2 items-end">
                  <div className="flex-1 min-w-[220px]">
                    <label className={label}>Descriere</label>
                    <input value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} placeholder="Descriere linie" className={input + ' w-full'} />
                    {productList.length > 0 && (
                      <select
                        value=""
                        onChange={(e) => { if (e.target.value) pickProduct(i, e.target.value); }}
                        className="mt-1.5 text-[13px] text-[#6B6B68] bg-transparent border-0 focus:outline-none cursor-pointer"
                      >
                        <option value="">↳ alege din nomenclator…</option>
                        {productList.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    )}
                  </div>
                  <div className="w-[80px]">
                    <label className={label}>Cant.</label>
                    <input type="number" min="0" step="any" value={l.quantity} onChange={(e) => setLine(i, { quantity: Number(e.target.value) })} className={input + ' w-full'} />
                  </div>
                  <div className="w-[120px]">
                    <label className={label}>Preț ({currency})</label>
                    <input type="number" min="0" step="0.01" value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: Number(e.target.value) })} className={input + ' w-full'} />
                  </div>
                  <div className="w-[90px]">
                    <label className={label}>TVA %</label>
                    <select value={l.vatRate} onChange={(e) => setLine(i, { vatRate: Number(e.target.value) })} className={input + ' w-full'}>
                      {VAT_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
                    </select>
                  </div>
                  <button type="button" onClick={() => removeLine(i)} disabled={lines.length === 1} className="h-[42px] px-3 text-[#B91C1C] hover:bg-[#FFF5F5] disabled:opacity-30 rounded-xl text-[14px] font-medium">
                    Șterge
                  </button>
                </div>
                <p className="text-[13px] text-[#6B6B68] mt-2 text-right">Total linie: <span className="font-semibold tabular-nums text-[#0A0A0A]">{ron(lineTotal)}</span></p>
              </div>
            );
          })}
          <button type="button" onClick={addLine} className="text-[14px] font-medium text-[#FF5C00] hover:text-[#E04E00]">+ Adaugă linie</button>
        </div>
      </div>

      {/* Notes + e-Factura */}
      <div className="bg-white border border-[#E8E8E4] rounded-2xl p-5 mb-4">
        <label className={label}>Note (opțional)</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Mențiuni pe factură…" className={input + ' w-full resize-y'} />
        <label className="flex items-center gap-2.5 mt-4 cursor-pointer select-none">
          <input type="checkbox" checked={sendEfactura} onChange={(e) => setSendEfactura(e.target.checked)} className="w-[18px] h-[18px] accent-[#FF5C00]" />
          <span className="text-[15px]">Trimite la e-Factura (ANAF) după emitere</span>
        </label>
      </div>

      {/* Totals + submit */}
      <div className="bg-white border border-[#E8E8E4] rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1 text-[15px]">
          <div className="flex justify-between gap-8"><span className="text-[#6B6B68]">Subtotal</span><span className="tabular-nums font-medium">{ron(totals.subtotalCents)}</span></div>
          <div className="flex justify-between gap-8"><span className="text-[#6B6B68]">TVA</span><span className="tabular-nums font-medium">{ron(totals.vatCents)}</span></div>
          <div className="flex justify-between gap-8 text-[18px] font-bold pt-1 border-t border-[#F0F0EC]"><span>Total</span><span className="tabular-nums">{ron(totals.totalCents)}</span></div>
        </div>
        <div className="text-right">
          {err && <p className="text-[14px] text-[#B91C1C] mb-2">{err}</p>}
          <button type="submit" disabled={submitting} className="px-6 py-3 bg-[#FF5C00] hover:bg-[#E04E00] disabled:opacity-60 text-white font-semibold rounded-xl text-[15px]">
            {submitting ? 'Se emite…' : 'Emite factura'}
          </button>
        </div>
      </div>
    </form>
  );
}
