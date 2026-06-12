import { useEffect, useState } from 'react';
import { clients, type Client } from '../lib/api';

export default function ClientsList() {
  const [list, setList] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try { const r = await clients.list(); setList(r.results || []); } catch {} finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try { await clients.create({ name: name.trim(), taxId: taxId.trim() || undefined }); setName(''); setTaxId(''); await load(); }
    catch {} finally { setSaving(false); }
  };

  const input = 'px-3 py-2.5 bg-white border border-[#E8E8E4] rounded-xl text-[15px] focus:border-[#0A0A0A] focus:outline-none';

  return (
    <div>
      <h1 className="text-[26px] font-bold tracking-[-0.02em] mb-5">Clienți</h1>

      <form onSubmit={add} className="flex flex-wrap gap-2 mb-5">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Denumire client" className={input + ' flex-1 min-w-[200px]'} />
        <input value={taxId} onChange={(e) => setTaxId(e.target.value)} placeholder="CUI" className={input + ' w-[160px]'} />
        <button disabled={saving} className="px-5 py-2.5 bg-[#FF5C00] hover:bg-[#E04E00] disabled:opacity-60 text-white font-semibold rounded-xl text-[15px]">Adaugă</button>
      </form>

      {loading ? <p className="text-[15px] text-[#6B6B68]">Se încarcă…</p> : (
        <div className="bg-white border border-[#E8E8E4] rounded-2xl divide-y divide-[#F6F6F2]">
          {list.length === 0 ? <p className="px-5 py-10 text-center text-[15px] text-[#6B6B68]">Niciun client.</p> :
            list.map((c) => (
              <div key={c.id} className="flex items-center gap-4 px-5 py-3.5">
                <span className="flex-1 font-medium text-[15px]">{c.name}</span>
                <span className="text-[14px] text-[#6B6B68] font-mono">{c.taxId || ''}</span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
