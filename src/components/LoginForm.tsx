import { useEffect, useState } from 'react';
import { auth } from '../lib/api';

export default function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  // Surface OAuth handoff failures (?error=oauth from /auth/callback).
  useEffect(() => {
    if (typeof location === 'undefined') return;
    const e = new URLSearchParams(location.search).get('error');
    if (e === 'oauth') setErr('Autentificarea cu contul extern a eșuat. Încearcă din nou.');
  }, []);

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
  // Full-page navigation to the backend OAuth start endpoint. After the
  // provider authenticates, the BE redirects back to /auth/callback#token=...
  const origin = typeof location !== 'undefined' ? location.origin : '';
  const oauthBtn = 'w-full py-3 inline-flex items-center justify-center gap-2.5 bg-white border border-[#E8E8E4] hover:bg-[#FAFAF8] font-semibold rounded-xl text-[15px]';

  return (
    <div className="space-y-4">
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

      <div className="flex items-center gap-3 py-1">
        <span className="flex-1 h-px bg-[#E8E8E4]" />
        <span className="text-[13px] text-[#9A9A95]">sau</span>
        <span className="flex-1 h-px bg-[#E8E8E4]" />
      </div>

      <a href={auth.googleUrl(origin)} className={oauthBtn}>
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
          <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.49h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.63z" />
          <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
          <path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33z" />
          <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
        </svg>
        Continuă cu Google
      </a>

      <a href={auth.appleUrl(origin)} className={oauthBtn}>
        <svg width="16" height="18" viewBox="0 0 16 18" aria-hidden="true" fill="#0A0A0A">
          <path d="M11 1.8c.8-1 1.4-2.3 1.2-3.6-1.2.05-2.6.8-3.4 1.8-.8.9-1.5 2.3-1.3 3.6 1.3.1 2.7-.7 3.5-1.8zM13.6 9.5c0-2.1 1.7-3.1 1.8-3.2-1-1.4-2.5-1.6-3-1.6-1.3-.1-2.5.8-3.1.8-.6 0-1.6-.7-2.7-.7-1.4 0-2.7.8-3.4 2.1-1.5 2.5-.4 6.3 1 8.4.7 1 1.5 2.2 2.6 2.1 1-.04 1.4-.7 2.7-.7s1.6.7 2.7.6c1.1-.02 1.8-1 2.5-2 .8-1.2 1.1-2.3 1.1-2.4-.02-.01-2.2-.85-2.2-3.3z" />
        </svg>
        Continuă cu Apple
      </a>
    </div>
  );
}
