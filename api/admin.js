// Vercel Serverless Function — backoffice (só para admin).
// Verifica o token do chamador, confirma role='admin' e executa ações com a service role.
const SUPA_URL = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE;
const ANON = process.env.SUPABASE_ANON_KEY;

async function getUser(token) {
  if (!token) return null;
  const r = await fetch(`${SUPA_URL}/auth/v1/user`, { headers: { apikey: ANON || SERVICE, Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  return r.json();
}
async function getRole(uid) {
  const r = await fetch(`${SUPA_URL}/rest/v1/profiles?id=eq.${uid}&select=role`, { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } });
  const a = await r.json();
  return Array.isArray(a) && a[0] ? a[0].role : null;
}
function svc(path, opts) {
  opts = opts || {};
  return fetch(`${SUPA_URL}${path}`, { ...opts, headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', ...(opts.headers || {}) } });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  if (!SUPA_URL || !SERVICE) return res.status(500).json({ error: 'supabase not configured' });

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const user = await getUser(token);
  if (!user || !user.id) return res.status(401).json({ error: 'auth' });
  if ((await getRole(user.id)) !== 'admin') return res.status(403).json({ error: 'forbidden' });

  const { action, ...p } = req.body || {};
  try {
    if (action === 'list') {
      const r = await svc(`/rest/v1/profiles?select=*&order=created_at.desc`);
      return res.status(200).json({ users: await r.json() });
    }
    if (action === 'create') {
      if (!p.email || !p.password) return res.status(400).json({ error: 'email e senha obrigatórios' });
      const cr = await svc(`/auth/v1/admin/users`, { method: 'POST', body: JSON.stringify({ email: p.email, password: p.password, email_confirm: true }) });
      const u = await cr.json();
      if (!cr.ok) return res.status(400).json({ error: 'create', detail: u });
      await svc(`/rest/v1/profiles?on_conflict=id`, { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ id: u.id, email: p.email, role: p.role || 'user', credits_total: p.credits_total != null ? p.credits_total : 40 }) });
      return res.status(200).json({ ok: true, id: u.id });
    }
    if (action === 'update') {
      const f = {};
      ['credits_total', 'credits_used', 'role', 'plan'].forEach(k => { if (p[k] != null) f[k] = p[k]; });
      await svc(`/rest/v1/profiles?id=eq.${p.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(f) });
      return res.status(200).json({ ok: true });
    }
    if (action === 'resetUsage') {
      await svc(`/rest/v1/profiles?id=eq.${p.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ credits_used: 0, period_start: new Date().toISOString() }) });
      return res.status(200).json({ ok: true });
    }
    if (action === 'delete') {
      await svc(`/auth/v1/admin/users/${p.id}`, { method: 'DELETE' });
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ error: 'unknown action' });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
};
