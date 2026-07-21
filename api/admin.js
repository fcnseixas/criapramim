// Vercel Serverless Function — backoffice (só para admin).
// Verifica o token do chamador, confirma role='admin' e executa ações com a service role.
// Sempre responde JSON (inclusive nos erros), pra facilitar o diagnóstico.
// limpa espaços, quebras e qualquer caractere não-ASCII colado por engano
const clean = v => String(v || '').replace(/[^\x21-\x7E]/g, '');
const SUPA_URL = clean(process.env.SUPABASE_URL);
const SERVICE = clean(process.env.SUPABASE_SERVICE_ROLE);
const ANON = clean(process.env.SUPABASE_ANON_KEY);

async function getUser(token) {
  if (!token) return null;
  const r = await fetch(`${SUPA_URL}/auth/v1/user`, { headers: { apikey: ANON || SERVICE, Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  return r.json();
}
async function getRole(uid) {
  const r = await fetch(`${SUPA_URL}/rest/v1/profiles?id=eq.${uid}&select=role`, { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } });
  const a = await r.json();
  if (!Array.isArray(a)) throw new Error('profiles read failed: ' + JSON.stringify(a));
  return a[0] ? a[0].role : null;
}
function svc(path, opts) {
  opts = opts || {};
  return fetch(`${SUPA_URL}${path}`, { ...opts, headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', ...(opts.headers || {}) } });
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
    if (!SUPA_URL) return res.status(500).json({ error: 'config', message: 'Falta a env var SUPABASE_URL na Vercel.' });
    if (!SERVICE) return res.status(500).json({ error: 'config', message: 'Falta a env var SUPABASE_SERVICE_ROLE na Vercel.' });

    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const user = await getUser(token);
    if (!user || !user.id) return res.status(401).json({ error: 'auth', message: 'Token inválido ou ausente.' });
    const role = await getRole(user.id);
    if (role !== 'admin') return res.status(403).json({ error: 'forbidden', message: 'Sua conta não é admin (role=' + role + ').' });

    const { action, ...p } = req.body || {};

    if (action === 'list') {
      const r = await svc(`/rest/v1/profiles?select=*&order=created_at.desc`);
      const data = await r.json();
      if (!r.ok) return res.status(502).json({ error: 'list', message: JSON.stringify(data) });
      return res.status(200).json({ users: Array.isArray(data) ? data : [] });
    }
    if (action === 'create') {
      if (!p.email || !p.password) return res.status(400).json({ error: 'validação', message: 'E-mail e senha são obrigatórios.' });
      const cr = await svc(`/auth/v1/admin/users`, { method: 'POST', body: JSON.stringify({ email: p.email, password: p.password, email_confirm: true }) });
      const u = await cr.json();
      if (!cr.ok) return res.status(400).json({ error: 'create', message: (u && (u.msg || u.message || u.error_description)) || JSON.stringify(u) });
      const pr = await svc(`/rest/v1/profiles?on_conflict=id`, { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ id: u.id, email: p.email, role: p.role || 'user', credits_total: p.credits_total != null ? p.credits_total : 40 }) });
      if (!pr.ok) { const pd = await pr.json().catch(() => ({})); return res.status(502).json({ error: 'profile', message: JSON.stringify(pd) }); }
      return res.status(200).json({ ok: true, id: u.id });
    }
    if (action === 'update') {
      const f = {};
      ['credits_total', 'credits_used', 'role', 'plan'].forEach(k => { if (p[k] != null) f[k] = p[k]; });
      const r = await svc(`/rest/v1/profiles?id=eq.${p.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(f) });
      if (!r.ok) return res.status(502).json({ error: 'update', message: await r.text() });
      return res.status(200).json({ ok: true });
    }
    if (action === 'resetUsage') {
      const r = await svc(`/rest/v1/profiles?id=eq.${p.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ credits_used: 0, period_start: new Date().toISOString() }) });
      if (!r.ok) return res.status(502).json({ error: 'reset', message: await r.text() });
      return res.status(200).json({ ok: true });
    }
    if (action === 'delete') {
      const r = await svc(`/auth/v1/admin/users/${p.id}`, { method: 'DELETE' });
      if (!r.ok) return res.status(502).json({ error: 'delete', message: await r.text() });
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ error: 'unknown action' });
  } catch (e) {
    return res.status(500).json({ error: 'server', message: String((e && e.message) || e) });
  }
};
