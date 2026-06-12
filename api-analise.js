// api/analise.js
// Backend Vercel para análise IA do FinançasCasal
// Deploy: vercel.com → New Project → cole este arquivo em /api/analise.js
// Variáveis de ambiente necessárias no painel da Vercel:
//   ANTHROPIC_API_KEY = sua chave da Anthropic
//   ALLOWED_ORIGIN = URL do seu app (ou * para qualquer origem)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });

  const { prompt, userId } = req.body;
  if (!prompt) return res.status(400).json({ erro: 'Prompt obrigatório' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ erro: 'ANTHROPIC_API_KEY não configurada' });

  try {
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
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || 'Erro na API Anthropic');

    const resultado = data.content?.map(i => i.text || '').join('') || '';
    return res.status(200).json({ resultado });
  } catch (err) {
    console.error('Erro IA:', err);
    return res.status(500).json({ erro: err.message });
  }
}
