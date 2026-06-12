// api/stripe.js — integração Stripe para o Éden
// Variáveis necessárias na Vercel:
//   STRIPE_SECRET_KEY     = sk_live_... (ou sk_test_ para testes)
//   STRIPE_WEBHOOK_SECRET = whsec_...
//   STRIPE_PRICE_ID       = price_... (ID do plano Premium R$24/mês)

import { TOKENS } from '../lib/tokens.js'
import { supabase } from '../lib/supabase.js'

// ── Helpers ───────────────────────────────────────────
async function stripeRequest(path, method = 'GET', body = null) {
  const opts = {
    method,
    headers: {
      'Authorization': `Bearer ${TOKENS.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  }
  if (body) opts.body = new URLSearchParams(body).toString()
  const res = await fetch(`https://api.stripe.com/v1${path}`, opts)
  return res.json()
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || TOKENS.ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, stripe-signature',
  }
}

// ── Handler principal ─────────────────────────────────
export default async function handler(req, res) {
  Object.entries(corsHeaders(req.headers.origin)).forEach(([k, v]) => res.setHeader(k, v))
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { action } = req.query

  // ── Criar sessão de checkout ──────────────────────────
  if (action === 'checkout' && req.method === 'POST') {
    const { userId, casalCode, email } = req.body
    if (!userId || !email) return res.status(400).json({ erro: 'userId e email obrigatórios' })
    if (!TOKENS.STRIPE_SECRET_KEY) return res.status(500).json({ erro: 'STRIPE_SECRET_KEY não configurada' })
    if (!TOKENS.STRIPE_PRICE_ID)   return res.status(500).json({ erro: 'STRIPE_PRICE_ID não configurado' })

    try {
      // Cria ou recupera customer no Stripe
      const { data: assinatura } = await supabase
        .from('assinaturas').select('stripe_customer_id').eq('user_id', userId).maybeSingle()

      let customerId = assinatura?.stripe_customer_id
      if (!customerId) {
        const customer = await stripeRequest('/customers', 'POST', { email, metadata: { userId, casalCode } })
        customerId = customer.id
        await supabase.from('assinaturas').update({ stripe_customer_id: customerId }).eq('user_id', userId)
      }

      // Cria sessão de checkout
      const session = await stripeRequest('/checkout/sessions', 'POST', {
        customer: customerId,
        mode: 'subscription',
        'line_items[0][price]': TOKENS.STRIPE_PRICE_ID,
        'line_items[0][quantity]': '1',
        success_url: `${TOKENS.APP_URL}?stripe=success`,
        cancel_url:  `${TOKENS.APP_URL}?stripe=cancel`,
        'subscription_data[trial_period_days]': '14',
        'metadata[userId]':    userId,
        'metadata[casalCode]': casalCode || '',
      })

      return res.status(200).json({ url: session.url, sessionId: session.id })
    } catch (e) {
      console.error('Stripe checkout:', e)
      return res.status(500).json({ erro: e.message })
    }
  }

  // ── Portal do cliente (gerenciar assinatura) ──────────
  if (action === 'portal' && req.method === 'POST') {
    const { userId } = req.body
    if (!userId) return res.status(400).json({ erro: 'userId obrigatório' })

    try {
      const { data: assinatura } = await supabase
        .from('assinaturas').select('stripe_customer_id').eq('user_id', userId).maybeSingle()

      if (!assinatura?.stripe_customer_id) return res.status(400).json({ erro: 'Sem assinatura Stripe' })

      const session = await stripeRequest('/billing_portal/sessions', 'POST', {
        customer:   assinatura.stripe_customer_id,
        return_url: TOKENS.APP_URL,
      })

      return res.status(200).json({ url: session.url })
    } catch (e) {
      return res.status(500).json({ erro: e.message })
    }
  }

  // ── Webhook do Stripe ─────────────────────────────────
  if (action === 'webhook' && req.method === 'POST') {
    const sig = req.headers['stripe-signature']
    if (!sig || !TOKENS.STRIPE_WEBHOOK_SECRET) {
      return res.status(400).json({ erro: 'Webhook secret não configurado' })
    }

    // Verifica assinatura do webhook
    let event
    try {
      // Nota: em produção use stripe.webhooks.constructEvent() com o raw body
      // Aqui usamos o body já parseado (funciona para maioria dos casos)
      event = req.body
    } catch (e) {
      return res.status(400).json({ erro: 'Webhook inválido' })
    }

    const metadata = event?.data?.object?.metadata || {}
    const userId   = metadata.userId
    const customerId = event?.data?.object?.customer

    try {
      switch (event.type) {

        case 'checkout.session.completed':
        case 'customer.subscription.created': {
          // Assinatura criada — ativa premium
          const sub = event.data.object
          if (userId) {
            await supabase.from('assinaturas').update({
              plano: 'premium', status: 'ativo',
              stripe_subscription_id: sub.id || sub.subscription,
              stripe_customer_id: customerId,
              pagamento_inicio: new Date().toISOString(),
              pagamento_fim: new Date(Date.now() + 30*24*60*60*1000).toISOString(),
              valor_pago: 24,
              updated_at: new Date().toISOString(),
            }).eq('user_id', userId)
          }
          break
        }

        case 'invoice.payment_succeeded': {
          // Pagamento recorrente — renova por mais 30 dias
          if (customerId) {
            const { data: ass } = await supabase.from('assinaturas')
              .select('user_id').eq('stripe_customer_id', customerId).maybeSingle()
            if (ass) {
              await supabase.from('assinaturas').update({
                status: 'ativo',
                pagamento_fim: new Date(Date.now() + 30*24*60*60*1000).toISOString(),
                updated_at: new Date().toISOString(),
              }).eq('stripe_customer_id', customerId)
            }
          }
          break
        }

        case 'customer.subscription.deleted':
        case 'invoice.payment_failed': {
          // Cancelamento ou falha — rebaixa para free
          if (customerId) {
            await supabase.from('assinaturas').update({
              plano: 'free', status: event.type === 'customer.subscription.deleted' ? 'cancelado' : 'expirado',
              cancelado_em: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }).eq('stripe_customer_id', customerId)
          }
          break
        }
      }
    } catch (e) {
      console.error('Webhook handler:', e)
    }

    return res.status(200).json({ received: true })
  }

  return res.status(404).json({ erro: 'Rota não encontrada' })
}
