// Vercel Serverless Function — gera os textos (posts individuais ou carrossel) com a OpenAI.
// A chave fica em process.env.OPENAI_API_KEY (nunca exposta no navegador).
// Acesso: logado (token Supabase) OU teste grátis (trial_id, limitado a 3 gerações).
const clean = v => String(v || '').replace(/[^\x21-\x7E]/g, '');
const SUPA_URL = clean(process.env.SUPABASE_URL);
const SERVICE = clean(process.env.SUPABASE_SERVICE_ROLE);
const ANON = clean(process.env.SUPABASE_ANON_KEY);
const GATE_ON = !!(SUPA_URL && SERVICE);
const TRIAL_LIMIT = 3;

async function sbUser(token) {
  if (!token) return null;
  const r = await fetch(`${SUPA_URL}/auth/v1/user`, { headers: { apikey: ANON || SERVICE, Authorization: `Bearer ${token}` } });
  return r.ok ? r.json() : null;
}
async function trialConsume(id) {
  const H = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };
  const r = await fetch(`${SUPA_URL}/rest/v1/trials?id=eq.${id}&select=used`, { headers: H });
  const a = await r.json(); const row = Array.isArray(a) && a[0];
  if (!row) return false;
  if ((row.used || 0) >= TRIAL_LIMIT) return false;
  await fetch(`${SUPA_URL}/rest/v1/trials?id=eq.${id}`, { method: 'PATCH', headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ used: (row.used || 0) + 1 }) });
  return true;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  const key = process.env.OPENAI_API_KEY;
  if (!key) return res.status(500).json({ error: 'missing OPENAI_API_KEY' });

  try {
    const body = req.body || {};

    // controle de acesso (logado ou teste)
    if (GATE_ON) {
      const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      const user = token ? await sbUser(token) : null;
      if (!user || !user.id) {
        if (!body.trial_id) return res.status(401).json({ error: 'trial', message: 'Cadastre seu e-mail pra testar grátis.' });
        if (!(await trialConsume(body.trial_id))) return res.status(402).json({ error: 'trial_over', message: 'Seu teste grátis acabou.' });
      }
    }

    const { name = 'a marca', tone = 'minimalista', mode = 'individual' } = body;
    const system = 'Você é um estrategista de conteúdo para Instagram no Brasil. Escreve títulos curtos e fortes e legendas envolventes, sempre em português do Brasil, com naturalidade e sem clichês de IA.';

    let user;
    if (mode === 'carousel') {
      const title = body.title || 'meu carrossel';
      const context = body.context || '';
      const slides = Math.max(2, Math.min(10, body.slides || 5));
      user =
`Marca: "${name}". Tom de voz: ${tone}.
Crie um CARROSSEL de Instagram com ${slides} slides sobre: "${title}".
Contexto / história: ${context || '(use o título como base)'}
Regras:
- O slide 1 é a CAPA: um título que fisga e dá vontade de arrastar.
- Os slides seguintes contam a história em sequência lógica, um ponto por slide, com progressão.
- O último slide fecha com um convite/CTA.
Para cada slide gere:
- "titulo": texto curtíssimo que aparece SOBRE a imagem (no máximo 6 palavras, sem hashtag e sem emoji);
- "texto": uma frase curta de apoio (pode ser vazia em slides muito visuais).
Gere também UMA legenda única para a publicação inteira ("legenda"), com 2 a 4 frases, chamada para ação e 3 hashtags no fim.
Responda um objeto JSON no formato {"slides":[{"titulo":"","texto":""}],"legenda":""}.`;
    } else if (mode === 'caption') {
      const title = body.title || '';
      const context = body.context || '';
      const points = (body.points || []).filter(Boolean);
      user =
`Marca: "${name}". Tom de voz: ${tone}.
Escreva UMA legenda de Instagram para a publicação sobre "${title}".${context ? ' Contexto: ' + context + '.' : ''}${points.length ? ' Pontos abordados: ' + points.join('; ') + '.' : ''}
A legenda deve ter 2 a 5 frases, envolvente, terminar com uma chamada para ação e 3 hashtags no fim.
Responda um objeto JSON no formato {"legenda":""}.`;
    } else {
      const qty = body.qty || 6;
      const themes = body.themes || [];
      const list = [];
      for (let i = 0; i < qty; i++) list.push(themes[i % (themes.length || 1)] || 'conteúdo');
      user =
`Marca: "${name}". Tom de voz: ${tone}.
Crie ${qty} posts, um para cada tema na ordem indicada. Para cada post gere:
- "titulo": chamada curta e forte (no máximo 7 palavras, sem hashtag e sem emoji);
- "legenda": 2 a 4 frases envolventes terminando com uma chamada para ação;
- "hashtags": 3 hashtags relevantes separadas por espaço.
Temas na ordem: ${list.map((x, i) => `${i + 1}) ${x}`).join('; ')}.
Responda um objeto JSON no formato {"posts":[{"titulo":"","legenda":"","hashtags":""}]}.`;
    }

    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.8,
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }]
      })
    });

    if (!r.ok) return res.status(502).json({ error: 'openai', detail: await r.text() });
    const data = await r.json();
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}');
    if (mode === 'carousel') return res.status(200).json({ slides: parsed.slides || [], legenda: parsed.legenda || '' });
    if (mode === 'caption') return res.status(200).json({ legenda: parsed.legenda || '' });
    return res.status(200).json({ posts: parsed.posts || [] });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
};
