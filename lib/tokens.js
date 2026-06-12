// lib/tokens.js — ponto único de configuração
export const TOKENS = {
  SUPABASE_URL:         process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY:    process.env.SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,
  GROQ_API_KEY:         process.env.GROQ_API_KEY,
  ANTHROPIC_API_KEY:    process.env.ANTHROPIC_API_KEY,
  TELEGRAM_TOKEN:       process.env.TELEGRAM_TOKEN,
  WHATSAPP_TOKEN:       process.env.WHATSAPP_TOKEN,
  WHATSAPP_PHONE_ID:    process.env.WHATSAPP_PHONE_ID,
  VAPID_PUBLIC_KEY:     process.env.VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY:    process.env.VAPID_PRIVATE_KEY,
  ALLOWED_ORIGIN:       process.env.ALLOWED_ORIGIN || '*',
  APP_URL:              process.env.APP_URL || 'https://financascasal-web.vercel.app',
}

export function validarTokens(obrigatorios = []) {
  const faltando = obrigatorios.filter(k => !TOKENS[k])
  if (faltando.length > 0) throw new Error(`Variáveis faltando: ${faltando.join(', ')}`)
}

export default TOKENS
