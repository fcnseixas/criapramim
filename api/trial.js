// Inicia (ou recupera) um teste grátis a partir do e-mail. Captura e-mail + IP + navegador.
const clean = v => String(v || '').replace(/[^\x21-\x7E]/g, '');
const SUPA_URL = clean(process.env.SUPABASE_URL);
const SERVICE = clean(process.env.SUPABASE_SERVICE_ROLE);
const TRIAL_LIMIT = 3;
const IP_MAX_TRIALS = 6;

function ipOf(req) {
  const f = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return f || req.headers['x-real-ip'] || '';
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
    if (!SUPA_URL || !SERVICE) return res.status(500).json({ error: 'config', message: 'Supabase não configurado.' });
    const email = ((req.body || {}).email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'email', message: 'E-mail inválido.' });
    const ip = ipOf(req);
    const ua = (req.headers['user-agent'] || '').slice(0, 300);
    const H = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };

    // já existe teste para este e-mail? devolve o mesmo (não reseta)
    const r = await fetch(`${SUPA_URL}/rest/v1/trials?email=eq.${encodeURIComponent(email)}&select=id,used`, { headers: H });
    const a = await r.json();
    if (Array.isArray(a) && a[0]) return res.status(200).json({ trial_id: a[0].id, used: a[0].used, limit: TRIAL_LIMIT });

    // teto leniente por IP (bloqueia só abuso óbvio)
    if (ip) {
      const c = await fetch(`${SUPA_URL}/rest/v1/trials?ip=eq.${encodeURIComponent(ip)}&select=id`, { headers: { ...H, Prefer: 'count=exact' } });
      const cnt = parseInt((c.headers.get('content-range') || '0/0').split('/')[1] || '0', 10);
      if (cnt >= IP_MAX_TRIALS) return res.status(429).json({ error: 'ip', message: 'Muitos testes deste dispositivo. Fale com a gente pra ter acesso completo.' });
    }

    const ins = await fetch(`${SUPA_URL}/rest/v1/trials`, {
      method: 'POST',
      headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ email, ip, user_agent: ua })
    });
    const rows = await ins.json();
    if (!ins.ok || !Array.isArray(rows) || !rows[0]) return res.status(502).json({ error: 'insert', message: JSON.stringify(rows) });
    return res.status(200).json({ trial_id: rows[0].id, used: 0, limit: TRIAL_LIMIT });
  } catch (e) {
    return res.status(500).json({ error: 'server', message: String((e && e.message) || e) });
  }
};
