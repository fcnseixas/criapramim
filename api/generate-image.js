// Vercel Serverless Function — gera a imagem do post com a OpenAI (gpt-image-1).
// Retorna um data URL (base64). Se `face` vier, usa images/edits (mantém o rosto).
//
// COTA (opcional): se as env vars do Supabase estiverem configuradas, exige login e
// desconta 1 do saldo do usuário por imagem gerada. Sem elas, funciona livremente.

const clean = v => String(v || '').replace(/[^\x21-\x7E]/g, '');
const SUPA_URL = clean(process.env.SUPABASE_URL);
const SERVICE = clean(process.env.SUPABASE_SERVICE_ROLE);
const ANON = clean(process.env.SUPABASE_ANON_KEY);
const QUOTA_ON = !!(SUPA_URL && SERVICE);

async function sbUser(token) {
  if (!token) return null;
  const r = await fetch(`${SUPA_URL}/auth/v1/user`, { headers: { apikey: ANON || SERVICE, Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  return r.json();
}
async function sbProfile(uid) {
  const r = await fetch(`${SUPA_URL}/rest/v1/profiles?id=eq.${uid}&select=*`, { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } });
  const a = await r.json();
  return Array.isArray(a) ? a[0] : null;
}
async function sbPatch(uid, fields) {
  await fetch(`${SUPA_URL}/rest/v1/profiles?id=eq.${uid}`, {
    method: 'PATCH',
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(fields)
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  const key = process.env.OPENAI_API_KEY;
  if (!key) return res.status(500).json({ error: 'missing OPENAI_API_KEY' });

  const { prompt = '', quality = 'medium', face = null, charge = true } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'missing prompt' });

  // ---- Cota (server-side) ----
  let uid = null, prof = null, remaining = null;
  if (QUOTA_ON) {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const user = await sbUser(token);
    if (!user || !user.id) return res.status(401).json({ error: 'auth', message: 'Entre para gerar imagens.' });
    uid = user.id;
    prof = await sbProfile(uid);
    if (!prof) return res.status(403).json({ error: 'no_profile', message: 'Perfil não encontrado.' });
    // reset mensal (janela de 30 dias)
    const start = new Date(prof.period_start || Date.now()).getTime();
    if (Date.now() - start >= 30 * 864e5) { prof.credits_used = 0; await sbPatch(uid, { credits_used: 0, period_start: new Date().toISOString() }); }
    if (charge && (prof.credits_used || 0) >= (prof.credits_total || 0)) {
      return res.status(402).json({ error: 'quota', message: 'Sua cota de imagens acabou este mês.', remaining: 0 });
    }
  }

  try {
    let r;
    if (face) {
      const m = /^data:(image\/\w+);base64,(.*)$/.exec(face);
      const mime = m ? m[1] : 'image/png';
      const b64in = m ? m[2] : String(face).split(',').pop();
      const buf = Buffer.from(b64in, 'base64');
      const ext = mime.split('/')[1] || 'png';
      const form = new FormData();
      form.append('model', 'gpt-image-1');
      form.append('prompt', prompt);
      form.append('size', '1024x1024');
      form.append('quality', quality);
      form.append('input_fidelity', 'high');
      form.append('n', '1');
      form.append('image', new Blob([buf], { type: mime }), `face.${ext}`);
      r = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form });
    } else {
      r = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: 'gpt-image-1', prompt, size: '1024x1024', quality, n: 1 })
      });
    }

    if (!r.ok) return res.status(502).json({ error: 'openai', detail: await r.text() });
    const data = await r.json();
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) return res.status(502).json({ error: 'no image returned' });

    // desconta a cota só depois de gerar com sucesso — e só quando charge=true
    if (QUOTA_ON && uid) {
      if (charge) {
        const used = (prof.credits_used || 0) + 1;
        await sbPatch(uid, { credits_used: used });
        remaining = (prof.credits_total || 0) - used;
      } else {
        remaining = (prof.credits_total || 0) - (prof.credits_used || 0);
      }
    }

    return res.status(200).json({ dataUrl: `data:image/png;base64,${b64}`, remaining });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
};
