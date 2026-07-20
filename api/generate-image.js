// Vercel Serverless Function — gera a imagem do post com a OpenAI (gpt-image-1).
// Retorna um data URL (base64), o que evita problemas de CORS e permite download direto.
// Se `face` (data URL) vier no corpo, usa o endpoint de EDIÇÃO com a foto de referência
// e fidelidade facial alta — as imagens saem com o rosto da pessoa.
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  const key = process.env.OPENAI_API_KEY;
  if (!key) return res.status(500).json({ error: 'missing OPENAI_API_KEY' });

  try {
    const { prompt = '', quality = 'medium', face = null } = req.body || {};
    if (!prompt) return res.status(400).json({ error: 'missing prompt' });

    let r;
    if (face) {
      // ---- Com rosto: images/edits + foto de referência ----
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
      form.append('input_fidelity', 'high'); // esforço máximo para manter o rosto/identidade
      form.append('n', '1');
      form.append('image', new Blob([buf], { type: mime }), `face.${ext}`);

      r = await fetch('https://api.openai.com/v1/images/edits', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}` }, // NÃO setar Content-Type: o fetch define o boundary
        body: form
      });
    } else {
      // ---- Sem rosto: geração normal ----
      r = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: 'gpt-image-1', // troque para 'dall-e-3' se sua conta ainda não tiver acesso ao gpt-image-1
          prompt,
          size: '1024x1024',
          quality, // 'low' = rápido/barato · 'medium' = equilíbrio · 'high' = melhor qualidade
          n: 1
        })
      });
    }

    if (!r.ok) return res.status(502).json({ error: 'openai', detail: await r.text() });
    const data = await r.json();
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) return res.status(502).json({ error: 'no image returned' });
    return res.status(200).json({ dataUrl: `data:image/png;base64,${b64}` });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
};
