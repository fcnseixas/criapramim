// Cria uma sessão de Checkout do Stripe (assinatura de plano ou pacote avulso de imagens).
const Stripe = require('stripe');
const clean = v => String(v || '').replace(/[^\x21-\x7E]/g, '');
const SUPA_URL = clean(process.env.SUPABASE_URL);
const SERVICE = clean(process.env.SUPABASE_SERVICE_ROLE);
const ANON = clean(process.env.SUPABASE_ANON_KEY);

const PRICE = {
  inicio: clean(process.env.STRIPE_PRICE_INICIO),
  criador: clean(process.env.STRIPE_PRICE_CRIADOR),
  pro: clean(process.env.STRIPE_PRICE_PRO),
  pack: clean(process.env.STRIPE_PRICE_PACK)
};

async function sbUser(token) {
  if (!token) return null;
  const r = await fetch(`${SUPA_URL}/auth/v1/user`, { headers: { apikey: ANON || SERVICE, Authorization: `Bearer ${token}` } });
  return r.ok ? r.json() : null;
}
async function sbProfile(uid) {
  const r = await fetch(`${SUPA_URL}/rest/v1/profiles?id=eq.${uid}&select=*`, { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } });
  const a = await r.json(); return Array.isArray(a) ? a[0] : null;
}
async function sbPatch(uid, fields) {
  await fetch(`${SUPA_URL}/rest/v1/profiles?id=eq.${uid}`, { method: 'PATCH', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(fields) });
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
    const key = clean(process.env.STRIPE_SECRET_KEY);
    if (!key) return res.status(500).json({ error: 'config', message: 'Falta STRIPE_SECRET_KEY na Vercel.' });
    const stripe = Stripe(key);

    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const user = await sbUser(token);
    if (!user || !user.id) return res.status(401).json({ error: 'auth', message: 'Entre para assinar.' });

    const { plan } = req.body || {};
    const priceId = PRICE[plan];
    if (!priceId) return res.status(400).json({ error: 'plan', message: 'Plano inválido ou preço não configurado (env STRIPE_PRICE_...).' });

    // cliente Stripe vinculado ao usuário
    const prof = await sbProfile(user.id);
    let customer = prof && prof.stripe_customer_id;
    if (!customer) {
      const c = await stripe.customers.create({ email: user.email, metadata: { uid: user.id } });
      customer = c.id;
      await sbPatch(user.id, { stripe_customer_id: customer });
    }

    const origin = req.headers.origin || `https://${req.headers.host}`;
    const isPack = plan === 'pack';
    const session = await stripe.checkout.sessions.create({
      mode: isPack ? 'payment' : 'subscription',
      customer,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/app.html?billing=ok`,
      cancel_url: `${origin}/app.html?billing=cancel`,
      allow_promotion_codes: true,
      metadata: { uid: user.id, plan },
      ...(isPack ? {} : { subscription_data: { metadata: { uid: user.id, plan } } })
    });
    return res.status(200).json({ url: session.url });
  } catch (e) {
    return res.status(500).json({ error: 'server', message: String((e && e.message) || e) });
  }
};
