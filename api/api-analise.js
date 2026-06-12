// api/analise.js
// Backend Vercel — FinançasCasal IA Dual
// Plano Premium → Claude (Anthropic) | Plano Free/Trial → Groq (gratuito)
//
// Variáveis de ambiente na Vercel:
//   GROQ_API_KEY       = gsk_...          (obrigatório)
//   ANTHROPIC_API_KEY  = sk-ant-...       (opcional — só para premium)
//   ALLOWED_ORIGIN     = https://seu-app.vercel.app

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' })

  const { prompt, plano } = req.body
  if (!prompt) return res.status(400).json({ erro: 'Prompt obrigatório' })

  // Decide qual provider usar baseado no plano
  const usarClaude = plano === 'premium' && !!process.env.ANTHROPIC_API_KEY

  try {
    let resultado = ''

    if (usarClaude) {
      // ── CLAUDE (Premium) ─────────────────────────────
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: 'Você é um consultor financeiro especializado para casais brasileiros. Responda sempre em português do Brasil, de forma direta e prática.',
          messages: [{ role: 'user', content: prompt }],
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error?.message || 'Erro Anthropic')
      resultado = data.content?.map(i => i.text || '').join('') || ''

    } else {
      // ── GROQ (Free/Trial) ─────────────────────────────
      const apiKey = process.env.GROQ_API_KEY
      if (!apiKey) return res.status(500).json({ erro: 'GROQ_API_KEY não configurada' })

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          max_tokens: 1000,
          temperature: 0.3,
          messages: [
            {
              role: 'system',
              content: 'Você é um consultor financeiro especializado para casais brasileiros. Responda sempre em português do Brasil, de forma direta e prática.',
            },
            { role: 'user', content: prompt },
          ],
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error?.message || 'Erro Groq')
      resultado = data.choices?.[0]?.message?.content || ''
    }

    return res.status(200).json({
      resultado,
      provider: usarClaude ? 'claude' : 'groq',
      modelo: usarClaude ? 'claude-sonnet-4-20250514' : 'llama-3.3-70b-versatile',
    })

  } catch (err) {
    console.error('Erro IA:', err)
    return res.status(500).json({ erro: err.message })
  }
}