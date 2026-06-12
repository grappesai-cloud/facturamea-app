import { useEffect, useState } from 'react';
import { invoices, ron, money, type Invoice, type InvoiceLine } from '../lib/api';

const STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Ciornă', cls: 'bg-[#F0F0EC] text-[#6B6B68]' },
  issued: { label: 'Emisă', cls: 'bg-[#EAF2FF] text-[#1D4ED8]' },
  sent: { label: 'Trimisă', cls: 'bg-[#EAF2FF] text-[#1D4ED8]' },
  partial: { label: 'Parțial', cls: 'bg-[#FFF7E6] text-[#B45309]' },
  paid: { label: 'Încasată', cls: 'bg-[#E7F7EC] text-[#15803D]' },
  overdue: { label: 'Restantă', cls: 'bg-[#FDECEC] text-[#B91C1C]' },
  voided: { label: 'Anulată', cls: 'bg-[#F0F0EC] text-[#9A9A95]' },
};

// Minimal invoice detail. Reads ?id= from the URL (static output → no dynamic
// route param). Shows header, lines and the document actions wired to the API.
export default function InvoiceDetail() {
  const [inv, setInv] = useState<Invoice | null>(null);
  const [lines, setLines] = useState<InvoiceLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const [share, setShare] = useState<string | null>(null);

  const id = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('id') || '' : '';

  const load = async () => {
    if (!id) { setErr('Lipsește id-ul facturii.'); setLoading(false); return; }
    try {
      const r = await invoices.get(id);
      setInv(r.invoice);
      setLines(r.lines || []);
    } catch (e: any) { setErr(e?.message || 'Factura nu a putut fi încărcată.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const doShare = async () => {
    setBusy('share');
    try { const r = await invoices.share(id); setShare(r.url); } catch (e: any) { setErr(e?.message || 'Eroare'); } finally { setBusy(''); }
  };
  const doPdf = async () => {
    setBusy('pdf');
    try { await invoices.pdfDownload(id, inv?.fullNumber || 'factura'); } catch (e: any) { setErr(e?.message || 'Eroare'); } finally { setBusy(''); }
  };
  const doEfactura = async () => {
    setBusy('efactura');
    try { await invoices.sendEfactura(id); await load(); } catch (e: any) { setErr(e?.message || 'Eroare'); } finally { setBusy(''); }
  };
  const doStorno = async () => {
    if (!confirm('Stornezi această factură? Se va emite o factură de storno și factura curentă va fi anulată.')) return;
    setBusy('storno');
    try { const r = await invoices.storno(id); location.href = `/app/factura?id=${r.id}`; } catch (e: any) { setErr(e?.message || 'Eroare'); } finally { setBusy(''); }
  };

  if (loading) return <p className="text-[15px] text-[#6B6B68]">Se încarcă…</p>;
  if (err && !inv) return <p className="text-[15px] text-[#B91C1C]">{err}</p>;
  if (!inv) return null;

  const st = STATUS[inv.status] || STATUS.draft;
  const cur = inv.currency || 'RON';
  const fmt = (c: number) => (cur === 'RON' ? ron(c) : money(c, cur));

  return (
    <div className="max-w-[820px]">
      <a href="/app" className="text-[14px] text-[#6B6B68] hover:text-[#0A0A0A]">← Înapoi</a>

      <div className="flex flex-wrap items-center gap-3 mt-3 mb-5">
        <h1 className="text-[26px] font-bold tracking-[-0.02em] font-mono">{inv.fullNumber}</h1>
        <span className={`px-2.5 py-1 rounded-lg text-[13px] font-medium ${st.cls}`}>{st.label}</span>
        {inv.efacturaStatus && <span className="px-2.5 py-1 rounded-lg text-[13px] font-medium bg-[#F0F0EC] text-[#6B6B68]">e-Factura: {inv.efacturaStatus}</span>}
      </div>

      <div className="bg-white border border-[#E8E8E4] rounded-2xl p-5 mb-4">
        <p className="text-[15px] font-semibold">{inv.clientNameSnap}</p>
        {inv.clientTaxIdSnap && <p className="text-[14px] text-[#6B6B68] font-mono">{inv.clientTaxIdSnap}</p>}
        {inv.clientAddressSnap && <p className="text-[14px] text-[#6B6B68]">{inv.clientAddressSnap}</p>}
        <div className="flex gap-6 mt-3 text-[14px] text-[#6B6B68]">
          {inv.issuedAt && <span>Emisă: {inv.issuedAt.slice(0, 10)}</span>}
          {inv.dueAt && <span>Scadență: {inv.dueAt.slice(0, 10)}</span>}
        </div>
      </div>

      <div className="bg-white border border-[#E8E8E4] rounded-2xl overflow-hidden mb-4">
        <div className="divide-y divide-[#F6F6F2]">
          {lines.map((l, i) => (
            <div key={l.id || i} className="flex items-center gap-4 px-5 py-3">
              <span className="flex-1 text-[15px]">{l.description}</span>
              <span className="text-[14px] text-[#6B6B68] tabular-nums">{l.quantity} × {fmt(l.unitPriceCents)}</span>
              <span className="text-[13px] text-[#6B6B68] w-[52px] text-right">{l.vatRate}%</span>
              <span className="font-semibold tabular-nums text-[15px] w-[120px] text-right">{fmt(l.lineTotalCents ?? 0)}</span>
            </div>
          ))}
        </div>
        <div className="px-5 py-4 border-t border-[#F0F0EC] space-y-1 text-[15px]">
          <div className="flex justify-end gap-8"><span className="text-[#6B6B68]">Subtotal</span><span className="tabular-nums w-[120px] text-right">{fmt(inv.subtotalCents)}</span></div>
          <div className="flex justify-end gap-8"><span className="text-[#6B6B68]">TVA</span><span className="tabular-nums w-[120px] text-right">{fmt(inv.vatCents)}</span></div>
          <div className="flex justify-end gap-8 text-[18px] font-bold"><span>Total</span><span className="tabular-nums w-[120px] text-right">{fmt(inv.totalCents)}</span></div>
        </div>
      </div>

      {err && <p className="text-[14px] text-[#B91C1C] mb-3">{err}</p>}
      {share && (
        <p className="text-[14px] mb-3">Link public: <a href={share} target="_blank" rel="noreferrer" className="text-[#FF5C00] break-all">{share}</a></p>
      )}

      <div className="flex flex-wrap gap-2">
        <button onClick={doPdf} disabled={!!busy} className="px-4 py-2.5 border border-[#E8E8E4] hover:bg-[#F0F0EC] disabled:opacity-50 rounded-xl text-[14px] font-medium">{busy === 'pdf' ? 'Se generează…' : 'Descarcă PDF'}</button>
        <button onClick={doShare} disabled={!!busy} className="px-4 py-2.5 border border-[#E8E8E4] hover:bg-[#F0F0EC] disabled:opacity-50 rounded-xl text-[14px] font-medium">{busy === 'share' ? '…' : 'Link public'}</button>
        {inv.kind === 'factura' && (
          <>
            <button onClick={doEfactura} disabled={!!busy} className="px-4 py-2.5 border border-[#E8E8E4] hover:bg-[#F0F0EC] disabled:opacity-50 rounded-xl text-[14px] font-medium">{busy === 'efactura' ? 'Se trimite…' : 'Trimite la e-Factura'}</button>
            {inv.status !== 'voided' && (
              <button onClick={doStorno} disabled={!!busy} className="px-4 py-2.5 border border-[#E8E8E4] hover:bg-[#FFF5F5] text-[#B91C1C] disabled:opacity-50 rounded-xl text-[14px] font-medium">{busy === 'storno' ? '…' : 'Stornează'}</button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
