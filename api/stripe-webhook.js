// Webhook do Stripe: ativa plano/cota no pagamento, renova a cada mês e trata cancelamento.
// Precisa do corpo BRUTO (por isso lemos o stream) para validar a assinatura.
const Stripe = require('stripe');
const clean = v => String(v || '').replace(/[^\x21-\x7E]/g, '');
const SUPA_URL = clean(process.env.SUPABASE_URL);
const SERVICE = clean(process.env.SUPABASE_SERVICE_ROLE);

const PLAN_CREDITS = { inicio: 8, criador: 30, pro: 80 };

async function sbProfile(uid) {
  const r = await fetch(`${SUPA_URL}/rest/v1/profiles?id=eq.${uid}&select=*`, { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } });
  const a = await r.json(); return Array.isArray(a) ? a[0] : null;
}
async function sbPatch(uid, fields) {
  await fetch(`${SUPA_URL}/rest/v1/profiles?id=eq.${uid}`, { method: 'PATCH', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(fields) });
}
async function rawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  const key = clean(process.env.STRIPE_SECRET_KEY);
  const wh = clean(process.env.STRIPE_WEBHOOK_SECRET);
  if (!key || !wh) return res.status(500).json({ error: 'Falta STRIPE_SECRET_KEY ou STRIPE_WEBHOOK_SECRET.' });
  const stripe = Stripe(key);

  let event;
  try {
    const buf = await rawBody(req);
    event = stripe.webhooks.constructEvent(buf, req.headers['stripe-signature'], wh);
  } catch (e) {
    return res.status(400).json({ error: 'signature', message: String((e && e.message) || e) });
  }

  const now = new Date().toISOString();
  try {
    const o = event.data.object;
    if (event.type === 'checkout.session.completed') {
      const uid = o.metadata && o.metadata.uid;
      const plan = o.metadata && o.metadata.plan;
      if (uid && o.mode === 'subscription' && PLAN_CREDITS[plan] != null) {
        await sbPatch(uid, { plan, credits_total: PLAN_CREDITS[plan], credits_used: 0, period_start: now, stripe_subscription_id: o.subscription, stripe_customer_id: o.customer });
      } else if (uid && o.mode === 'payment' && plan === 'pack') {
        const prof = await sbProfile(uid);
        await sbPatch(uid, { credits_total: ((prof && prof.credits_total) || 0) + 10 });
      }
    } else if (event.type === 'invoice.paid' && o.subscription) {
      const sub = await stripe.subscriptions.retrieve(o.subscription);
      const uid = sub.metadata && sub.metadata.uid;
      const plan = sub.metadata && sub.metadata.plan;
      if (uid && PLAN_CREDITS[plan] != null) {
        await sbPatch(uid, { plan, credits_total: PLAN_CREDITS[plan], credits_used: 0, period_start: now });
      }
    } else if (event.type === 'customer.subscription.deleted') {
      const uid = o.metadata && o.metadata.uid;
      if (uid) await sbPatch(uid, { plan: 'cancelado', credits_total: 0 });
    }
    return res.status(200).json({ received: true });
  } catch (e) {
    return res.status(500).json({ error: 'handler', message: String((e && e.message) || e) });
  }
};

// Vercel: não fazer parse do corpo (precisamos do raw para a assinatura)
module.exports.config = { api: { bodyParser: false } };
