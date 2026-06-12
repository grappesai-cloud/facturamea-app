import { useEffect, useState } from 'react';
import { auth, invoices, ron, type Me, type Invoice } from '../lib/api';

const STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Ciornă', cls: 'bg-[#F0F0EC] text-[#6B6B68]' },
  issued: { label: 'Emisă', cls: 'bg-[#EAF2FF] text-[#1D4ED8]' },
  sent: { label: 'Trimisă', cls: 'bg-[#EAF2FF] text-[#1D4ED8]' },
  partial: { label: 'Parțial', cls: 'bg-[#FFF7E6] text-[#B45309]' },
  paid: { label: 'Încasată', cls: 'bg-[#E7F7EC] text-[#15803D]' },
  overdue: { label: 'Restantă', cls: 'bg-[#FDECEC] text-[#B91C1C]' },
  voided: { label: 'Anulată', cls: 'bg-[#F0F0EC] text-[#9A9A95]' },
};

export default function Dashboard() {
  const [me, setMe] = useState<Me | null>(null);
  const [list, setList] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const m = await auth.me();
        setMe(m);
        const inv = await invoices.list({ kind: 'factura' });
        setList(inv.results || []);
      } catch { /* api() redirects to /login on 401 */ }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <p className="text-[15px] text-[#6B6B68]">Se încarcă…</p>;

  const invoiced = list.reduce((s, i) => s + (i.totalCents || 0), 0);
  const collected = list.reduce((s, i) => s + (i.paidCents || 0), 0);
  const outstanding = invoiced - collected;

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold tracking-[-0.02em]">Bună, {me?.user.name?.split(' ')[0] || ''} 👋</h1>
          <p className="text-[15px] text-[#6B6B68] mt-1">{me?.company?.name || ''}</p>
        </div>
        <a href="/app/emite" className="shrink-0 px-5 py-2.5 bg-[#FF5C00] hover:bg-[#E04E00] text-white font-semibold rounded-xl text-[15px]">+ Emite factură</a>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        {[
          { label: 'Facturat', value: ron(invoiced), cls: 'text-[#0A0A0A]' },
          { label: 'Încasat', value: ron(collected), cls: 'text-[#15803D]' },
          { label: 'De încasat', value: ron(outstanding), cls: 'text-[#0A0A0A]' },
        ].map((c) => (
          <div key={c.label} className="bg-white border border-[#E8E8E4] rounded-2xl p-5">
            <p className="text-[14px] text-[#6B6B68]">{c.label}</p>
            <p className={`text-[26px] font-bold mt-1 ${c.cls}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white border border-[#E8E8E4] rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#F0F0EC] font-semibold text-[16px]">Facturi</div>
        {list.length === 0 ? (
          <p className="px-5 py-10 text-center text-[15px] text-[#6B6B68]">Nicio factură.</p>
        ) : (
          <div className="divide-y divide-[#F6F6F2]">
            {list.map((inv) => {
              const st = STATUS[inv.status] || STATUS.draft;
              return (
                <a key={inv.id} href={`/app/factura?id=${inv.id}`} className="flex items-center gap-4 px-5 py-3.5 hover:bg-[#FAFAF8]">
                  <span className="font-mono font-semibold text-[15px] w-[120px]">{inv.fullNumber}</span>
                  <span className="flex-1 truncate text-[15px] text-[#3D3D3A]">{inv.clientNameSnap}</span>
                  <span className="font-bold tabular-nums text-[15px]">{ron(inv.totalCents)}</span>
                  <span className={`px-2.5 py-1 rounded-lg text-[13px] font-medium ${st.cls}`}>{st.label}</span>
                </a>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
