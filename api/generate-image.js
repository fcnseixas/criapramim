// Vercel Serverless Function — gera a imagem do post com a OpenAI (gpt-image-1).
// Retorna um data URL (base64), o que evita problemas de CORS e permite download direto.
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  const key = process.env.OPENAI_API_KEY;
  if (!key) return res.status(500).json({ error: 'missing OPENAI_API_KEY' });

  try {
    const { prompt = '' } = req.body || {};
    if (!prompt) return res.status(400).json({ error: 'missing prompt' });

    const r = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: 'gpt-image-1',   // troque para 'dall-e-3' se sua conta ainda não tiver acesso ao gpt-image-1
        prompt,
        size: '1024x1024',
        n: 1
      })
    });

    if (!r.ok) return res.status(502).json({ error: 'openai', detail: await r.text() });
    const data = await r.json();
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) return res.status(502).json({ error: 'no image returned' });
    return res.status(200).json({ dataUrl: `data:image/png;base64,${b64}` });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
};
