import { useState } from 'react';
import { auth } from '../lib/api';

export default function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(''); setLoading(true);
    try {
      await auth.login(email.trim(), password);
      location.href = '/app';
    } catch (e: any) {
      setErr(e?.message || 'Email sau parolă incorectă');
    } finally { setLoading(false); }
  };

  const input = 'w-full px-4 py-3 bg-white border border-[#E8E8E4] rounded-xl text-[16px] focus:border-[#0A0A0A] focus:outline-none';

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="block text-[13px] font-medium mb-1.5">Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" className={input} placeholder="nume@firma.ro" />
      </div>
      <div>
        <label className="block text-[13px] font-medium mb-1.5">Parolă</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" className={input} placeholder="parola" />
      </div>
      {err && <p className="text-[14px] text-[#B91C1C]">{err}</p>}
      <button type="submit" disabled={loading} className="w-full py-3 bg-[#FF5C00] hover:bg-[#E04E00] disabled:opacity-60 text-white font-semibold rounded-xl text-[15px]">
        {loading ? 'Se conectează…' : 'Autentificare'}
      </button>
    </form>
  );
}
