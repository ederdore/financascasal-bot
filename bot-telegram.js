// Éden Bot — Telegram webhook
// Deploy: Railway

'use strict'
const http  = require('http')
const https = require('https')
const { createClient } = require('@supabase/supabase-js')

// ── Captura global de erros ───────────────────────────
process.on('uncaughtException', (err) => {
  console.error('[FATAL] uncaughtException:', err.message)
  console.error(err.stack)
})
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] unhandledRejection:', reason)
})
process.on('exit', (code) => {
  console.error('[EXIT] processo saindo com código:', code)
  if (code === 0) {
    console.error('[EXIT] saída limpa detectada — isso não deveria acontecer')
  }
})
process.on('SIGTERM', () => {
  console.log('[SIGTERM] recebido — mantendo bot ativo')
})

process.on('SIGINT', () => {
  console.log('[SIGINT] recebido — mantendo bot ativo')
})

console.log('[STARTUP] iniciando processo...')
console.log('[STARTUP] TELEGRAM_TOKEN:', process.env.TELEGRAM_TOKEN ? 'ok' : 'FALTANDO')
console.log('[STARTUP] SUPABASE_URL:', process.env.SUPABASE_URL ? 'ok' : 'FALTANDO')
console.log('[STARTUP] SUPABASE_ANON:', process.env.SUPABASE_ANON ? 'ok' : 'FALTANDO')
console.log('[STARTUP] GROQ_API_KEY:', process.env.GROQ_API_KEY ? 'ok' : 'FALTANDO')
console.log('[STARTUP] ANTHROPIC_API_KEY:', process.env.ANTHROPIC_API_KEY ? 'ok' : 'FALTANDO')
console.log('[STARTUP] PORT:', process.env.PORT || 3000)

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN
const SUPABASE_URL   = process.env.SUPABASE_URL
const SUPABASE_ANON  = process.env.SUPABASE_ANON
const GROQ_API_KEY   = process.env.GROQ_API_KEY
const PORT           = process.env.PORT || 3000

const CARTAO_PRINCIPAL = {
  id:   process.env.CARTAO_PRINCIPAL_ID   || 'f3b9f1fa-2832-4f79-97c5-77473b182190',
  nome: process.env.CARTAO_PRINCIPAL_NOME || 'Cartão Inter',
}

if (!TELEGRAM_TOKEN) console.error('⚠️  TELEGRAM_TOKEN não configurado')
if (!SUPABASE_URL)   console.error('⚠️  SUPABASE_URL não configurado')
if (!GROQ_API_KEY)   console.error('⚠️  GROQ_API_KEY não configurado')

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON)

const rateMap = new Map()
function checkRate(userId) {
  const now = Date.now(), key = String(userId)
  const e = rateMap.get(key) || { count:0, reset:now+60000 }
  if (now > e.reset) { e.count=0; e.reset=now+60000 }
  e.count++; rateMap.set(key, e)
  return e.count <= 30
}

const ctxMap = new Map()

// ── HTTP helpers ──────────────────────────────────────
function httpsPost(hostname, path, body, headers = {}) {
  return new Promise((resolve) => {
    const buf = JSON.stringify(body)
    const req = https.request({
      hostname, path, method: 'POST',
      headers: { 'Content-Type':'application/json', 'Content-Length':Buffer.byteLength(buf), ...headers },
    }, (res) => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => { try { resolve(JSON.parse(data)) } catch { resolve({}) } })
    })
    req.on('error', () => resolve({}))
    req.write(buf); req.end()
  })
}

async function sendMessage(chatId, text, extra = {}) {
  return httpsPost('api.telegram.org', `/bot${TELEGRAM_TOKEN}/sendMessage`,
    { chat_id:chatId, text, parse_mode:'Markdown', ...extra })
}

async function sendMessageButtons(chatId, text, buttons) {
  return httpsPost('api.telegram.org', `/bot${TELEGRAM_TOKEN}/sendMessage`, {
    chat_id:chatId, text, parse_mode:'Markdown',
    reply_markup: { inline_keyboard: buttons },
  })
}

async function answerCallback(callbackQueryId, text = '') {
  return httpsPost('api.telegram.org', `/bot${TELEGRAM_TOKEN}/answerCallbackQuery`, {
    callback_query_id: callbackQueryId, text, show_alert: false,
  })
}

async function sendAction(chatId, action = 'typing') {
  return httpsPost('api.telegram.org', `/bot${TELEGRAM_TOKEN}/sendChatAction`,
    { chat_id:chatId, action })
}

async function setWebhook(url) {
  const r = await httpsPost('api.telegram.org', `/bot${TELEGRAM_TOKEN}/setWebhook`,
    { url, allowed_updates: ['message','callback_query'] })
  console.log('Webhook:', JSON.stringify(r))
}

// ── Menu de botões ────────────────────────────────────
function menuPrincipal() {
  return [
    [{ text:'💸 Lançar gasto',  callback_data:'menu_gasto'   },{ text:'💰 Ver saldo',    callback_data:'menu_saldo'   }],
    [{ text:'📊 Resumo do mês', callback_data:'menu_resumo'  },{ text:'💳 Fatura',        callback_data:'menu_fatura'  }],
    [{ text:'🎯 Metas',         callback_data:'menu_metas'   },{ text:'🛡 Reserva',       callback_data:'menu_reserva' }],
    [{ text:'📈 Jardim',        callback_data:'menu_jardim'  },{ text:'💡 Dica da IA',   callback_data:'menu_dica'    }],
    [{ text:'💸 Últimos gastos',callback_data:'menu_gastos'  },{ text:'❓ Ajuda',         callback_data:'menu_ajuda'   }],
  ]
}

// ── Formatação ────────────────────────────────────────
function fmt(n) {
  return 'R$ ' + Number(n||0).toLocaleString('pt-BR', { minimumFractionDigits:2, maximumFractionDigits:2 })
}

// Hora atual em BRT (UTC-3)
function horaBRT() {
  return (new Date().getUTCHours() - 3 + 24) % 24
}

function inicioDiaBRT() {
  // Retorna o início do dia atual no fuso BRT (UTC-3)
  const now = new Date()
  const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000)
  return new Date(brt.getFullYear(), brt.getMonth(), brt.getDate()).toISOString()
}

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const DIAS  = ['domingo','segunda','terça','quarta','quinta','sexta','sábado']
const CAT_ICONS = { Alimentação:'🛒',Moradia:'🏠',Transporte:'🚗',Saúde:'💊',Lazer:'🎉',Educação:'📚',Assinaturas:'📺',Investimento:'📈',Outros:'💸' }

// ── Groq ──────────────────────────────────────────────
async function chamarGroq(prompt) {
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer '+GROQ_API_KEY },
      body: JSON.stringify({
        model:'llama-3.3-70b-versatile', max_tokens:300, temperature:0.1,
        messages:[
          { role:'system', content:'Consultor financeiro para casais brasileiros. Responda em português, direto.' },
          { role:'user', content:prompt },
        ],
      }),
    })
    const data = await res.json()
    console.log('[Groq status]', res.status)
    if (!res.ok) { console.error('[Groq error]', JSON.stringify(data)); return '' }
    return data?.choices?.[0]?.message?.content || ''
  } catch(e) { console.error('[Groq fetch error]', e.message); return '' }
}

// ── Claude API ───────────────────────────────────────
async function chamarClaude(prompt, systemPrompt = '') {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 500,
        system: systemPrompt || 'Você é o Broto, consultor financeiro do Éden — app de finanças para casais brasileiros. Seja direto, caloroso e use metáforas de jardim. Responda em português.',
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    const data = await res.json()
    if (!res.ok) { console.error('[Claude error]', JSON.stringify(data)); return '' }
    return data?.content?.[0]?.text || ''
  } catch(e) { console.error('[Claude fetch error]', e.message); return '' }
}

async function interpretarMensagem(texto) {
  const prompt = `Analise: "${texto.substring(0,200)}"
Responda APENAS JSON válido:
{"tipo":"despesa"|"receita"|"saldo"|"ajuda"|"desconhecido","valor":número|null,"descricao":"texto"|null,"categoria":"Alimentação"|"Moradia"|"Transporte"|"Saúde"|"Lazer"|"Educação"|"Assinaturas"|"Outros"|null,"quem":"eu"|"ela"|"casal"|null}
Exemplos:
"gastei 45 mercado"→{"tipo":"despesa","valor":45,"descricao":"Supermercado","categoria":"Alimentação","quem":"eu"}
"recebi salário 8500"→{"tipo":"receita","valor":8500,"descricao":"Salário","categoria":null,"quem":"eu"}
"quanto tenho"→{"tipo":"saldo","valor":null,"descricao":null,"categoria":null,"quem":null}`
  try {
    const raw = await chamarGroq(prompt)
    return JSON.parse(raw.replace(/```json|```/g,'').trim())
  } catch { return { tipo:'desconhecido' } }
}

// ── Supabase helpers ──────────────────────────────────
async function getUser(telegramId) {
  const { data } = await supabase.from('profiles').select('*')
    .eq('telegram_id', String(telegramId)).maybeSingle()
  return data
}

async function getResumo(user, mes=null, ano=null) {
  const now = new Date()
  const m = mes !== null ? mes : now.getMonth()
  const a = ano !== null ? ano : now.getFullYear()
  const [d,r,b,res] = await Promise.all([
    supabase.from('despesas').select('valor,quem,categoria').eq('casal_code',user.casal_code).eq('mes',m).eq('ano',a),
    supabase.from('receitas').select('valor,quem').eq('casal_code',user.casal_code).eq('mes',m).eq('ano',a),
    supabase.from('contas_banco').select('banco,saldo,id').eq('casal_code',user.casal_code),
    supabase.from('reserva').select('atual,meta').eq('user_id',user.id).maybeSingle(),
  ])
  const totalRec  = (r.data||[]).reduce((s,x)=>s+x.valor,0)
  const totalDesp = (d.data||[]).reduce((s,x)=>s+x.valor,0)
  const saldoBancos = (b.data||[]).reduce((s,x)=>s+x.saldo,0)
  const bancoPrincipal = (b.data||[]).find(x=>x.id===user.banco_principal_id)||(b.data||[])[0]
  return { totalRec, totalDesp, saldo:totalRec-totalDesp, bancos:b.data||[], bancoPrincipal, reserva:res.data||{atual:0,meta:30000} }
}

async function lancarDespesa(user, valor, descricao, categoria, quem, pagamentoTipo='debito', cartaoId=null) {
  const now = new Date(), cc = user.casal_code||user.id
  const { data:bancos } = await supabase.from('contas_banco').select('*').eq('casal_code',cc)
  const banco = bancos?.find(b=>b.id===user.banco_principal_id)||bancos?.[0]

  if (pagamentoTipo==='cartao') {
    const cid = cartaoId||CARTAO_PRINCIPAL.id
    const { data:cartao } = await supabase.from('cartoes').select('*').eq('id',cid).maybeSingle()
    const novaFatura = (cartao?.fatura||0)+valor
    await supabase.from('despesas').insert({
      user_id:user.id, casal_code:cc, nome:descricao, valor, categoria:categoria||'Outros',
      quem:quem||user.papel, tipo:'variavel', pagamento_tipo:'cartao',
      cartao_id:cid, cartao_nome:cartao?.nome||CARTAO_PRINCIPAL.nome,
      mes:now.getMonth(), ano:now.getFullYear(),
    })
    await supabase.from('cartoes').update({ fatura:novaFatura }).eq('id',cid)
    return { tipo:'cartao', cartaoNome:cartao?.nome||CARTAO_PRINCIPAL.nome, novaFatura }
  }

  await supabase.from('despesas').insert({
    user_id:user.id, casal_code:cc, nome:descricao, valor, categoria:categoria||'Outros',
    quem:quem||user.papel, tipo:'variavel', pagamento_tipo:pagamentoTipo,
    banco_id:banco?.id||null, banco_nome:banco?.banco||'', mes:now.getMonth(), ano:now.getFullYear(),
  })
  if (banco) {
    const novoSaldo = (banco.saldo||0)-valor
    await supabase.from('contas_banco').update({ saldo:novoSaldo }).eq('id',banco.id)
    await supabase.from('extrato_banco').insert({
      user_id:user.id, casal_code:cc, banco_id:banco.id, banco_nome:banco.banco,
      tipo:'saida', descricao, categoria, valor, saldo_apos:novoSaldo,
      mes:now.getMonth(), ano:now.getFullYear(),
    })
    return { tipo:'debito', bancoNome:banco.banco, novoSaldo }
  }
  return null
}

async function lancarReceita(user, valor, descricao) {
  const now = new Date(), cc = user.casal_code||user.id
  const { data:bancos } = await supabase.from('contas_banco').select('*').eq('casal_code',cc)
  const banco = bancos?.find(b=>b.id===user.banco_principal_id)||bancos?.[0]
  await supabase.from('receitas').insert({
    user_id:user.id, casal_code:cc, tipo:'salario', valor, quem:user.papel,
    mes:now.getMonth(), ano:now.getFullYear(),
  })
  if (banco) {
    const novoSaldo = (banco.saldo||0)+valor
    await supabase.from('contas_banco').update({ saldo:novoSaldo }).eq('id',banco.id)
    await supabase.from('extrato_banco').insert({
      user_id:user.id, casal_code:cc, banco_id:banco.id, banco_nome:banco.banco,
      tipo:'entrada', descricao:descricao||'Receita', categoria:'salario',
      valor, saldo_apos:novoSaldo, mes:now.getMonth(), ano:now.getFullYear(),
    })
    return { ...banco, novoSaldo }
  }
  return null
}

async function auditLog(userId, acao, detalhes={}) {
  try {
    await supabase.from('audit_logs').insert({
      user_id:userId, acao, detalhes:JSON.stringify(detalhes),
      origem:'telegram', created_at:new Date().toISOString(),
    })
  } catch { }
}

// ── Contexto ──────────────────────────────────────────
async function salvarContexto(casalCode, tipo, conteudo, dados={}) {
  try {
    await supabase.from('bot_contextos').insert({ casal_code:casalCode, tipo, conteudo, dados })
  } catch(e) { console.warn('salvarContexto:', e.message) }
}

async function carregarContexto(casalCode, limite=20) {
  try {
    const { data } = await supabase.from('bot_contextos').select('tipo,conteudo,dados,created_at')
      .eq('casal_code',casalCode).order('created_at',{ascending:false}).limit(limite)
    return data||[]
  } catch { return [] }
}

async function dicaJaEnviada(casalCode, categoria) {
  try {
    const { data } = await supabase.from('bot_contextos').select('dados')
      .eq('casal_code',casalCode).eq('tipo','dica')
      .gte('created_at', new Date(Date.now()-7*24*60*60*1000).toISOString())
    return (data||[]).some(d => {
      try { const dados=typeof d.dados==='string'?JSON.parse(d.dados):d.dados; return dados?.categoria===categoria }
      catch { return false }
    })
  } catch { return false }
}

async function carregarPadraoRespostas(casalCode) {
  try {
    const { data } = await supabase.from('reflexoes_respondidas').select('resposta,padrao_id,created_at')
      .eq('casal_code',casalCode).order('created_at',{ascending:false}).limit(20)
    const contagem = { sim_guardei:0, vou_guardar:0, nao_desta_vez:0 }
    ;(data||[]).forEach(r => { if (contagem[r.resposta]!==undefined) contagem[r.resposta]++ })
    const total = Object.values(contagem).reduce((s,v)=>s+v,0)
    return {
      total,
      pctSim: total>0?Math.round((contagem.sim_guardei/total)*100):0,
      pctNao: total>0?Math.round((contagem.nao_desta_vez/total)*100):0,
      perfil: contagem.sim_guardei>contagem.nao_desta_vez?'disciplinado':'resistente',
    }
  } catch { return { total:0, pctSim:0, pctNao:0, perfil:'neutro' } }
}

// ── Marcos de maturidade ──────────────────────────────
const MARCOS = [
  { lancamentos:1,   msg:`🫘 *Primeiro lançamento!*\n\nVocês deram o primeiro passo. A IA começa a aprender o perfil de vocês agora.\n\n_Quanto mais lançarem, mais personalizada ela fica._` },
  { lancamentos:10,  msg:`🌱 *IA evoluiu para Broto!*\n\nCom 10 lançamentos, já consigo identificar suas categorias de gasto preferidas e dar dicas mais personalizadas.\n\n_Continue lançando — em 30 lançamentos reconheço seus padrões semanais._` },
  { lancamentos:30,  msg:`🌿 *IA evoluiu para Crescendo!*\n\nCom 30 lançamentos, já sei em quais dias da semana vocês costumam gastar mais.\n\n_Próximo nível em 60 lançamentos: antecipação de comportamentos._` },
  { lancamentos:60,  msg:`🌳 *IA evoluiu para Florescendo!*\n\nIncrível! 60 lançamentos de histórico. Agora consigo antecipar padrões e alertar *antes* do gasto acontecer.\n\n_Faltam 40 lançamentos para o nível máximo._` },
  { lancamentos:100, msg:`🌟 *IA atingiu o nível Parceiro!*\n\n100 lançamentos. Agora sou um parceiro financeiro real do casal.\n\n_Finanças a dois, sem segredos. Não para controlar — para planejar juntos._ 🌿` },
]

async function verificarMarco(user, chatId) {
  try {
    const cc = user.casal_code
    const [d,r] = await Promise.all([
      supabase.from('despesas').select('id',{count:'exact',head:true}).eq('casal_code',cc),
      supabase.from('receitas').select('id',{count:'exact',head:true}).eq('casal_code',cc),
    ])
    const total = (d.count||0)+(r.count||0)
    for (const marco of MARCOS) {
      if (total===marco.lancamentos) {
        const chave = `marco_${user.id}_${marco.lancamentos}`
        if (ctxMap.get(chave)) return
        ctxMap.set(chave, true)
        await sendMessage(chatId, marco.msg)
        await salvarContexto(cc,'marco',`Marco ${marco.lancamentos} lançamentos`,{lancamentos:marco.lancamentos})
        return
      }
    }
  } catch(e) { console.warn('verificarMarco:', e.message) }
}

// ── Handlers de botões de menu ────────────────────────
async function handleMenuCallback(callbackData, user, chatId) {
  const now = new Date()

  if (callbackData === 'menu_saldo') {
    const { saldo, reserva } = await getResumo(user)
    const pctRes = reserva.meta>0?Math.round((reserva.atual/reserva.meta)*100):0
    const { data:bancosAll } = await supabase.from('contas_banco').select('*').eq('casal_code',user.casal_code)
    const bPrincipal  = (bancosAll||[]).filter(b=>!b.camada||b.camada==='principal')
    const bPatrimonio = (bancosAll||[]).filter(b=>b.camada==='patrimonio')
    const bReserva    = (bancosAll||[]).filter(b=>b.camada==='reserva')
    const totPrincipal  = bPrincipal.reduce((s,b)=>s+b.saldo,0)
    const totPatrimonio = bPatrimonio.reduce((s,b)=>s+b.saldo,0)
    let t = '🌿 *' + user.nome + '*\n\n'
    t += '💵 *Principal (fluxo do mês)*\n'
    bPrincipal.forEach(b => { t += '  • ' + b.banco + ': *' + fmt(b.saldo, b.moeda) + '*\n' })
    t += '  Total: *' + fmt(totPrincipal) + '*\n\n'
    if (bReserva.length > 0 || reserva.atual > 0) {
      t += '🛡 *Reserva de emergência*\n'
      bReserva.forEach(b => { t += '  • ' + b.banco + ': *' + fmt(b.saldo, b.moeda) + '*\n' })
      if (reserva.atual > 0) t += '  • Reserva: *' + fmt(reserva.atual) + '* (' + pctRes + '%)\n'
      t += '\n'
    }
    if (bPatrimonio.length > 0) {
      t += '📈 *Patrimônio investido*\n'
      bPatrimonio.forEach(b => { t += '  • ' + b.banco + ': *' + fmt(b.saldo, b.moeda) + '*\n' })
      t += '  Total: *' + fmt(totPatrimonio) + '*\n\n'
    }
    const totalGeral = totPrincipal + totPatrimonio + reserva.atual
    t += '💎 *Patrimônio total: ' + fmt(totalGeral) + '*'
    await sendMessageButtons(chatId, t, [[{ text:'🔙 Menu', callback_data:'menu_inicio' }]])
    return
  }

  if (callbackData === 'menu_resumo') {
    await sendAction(chatId, 'typing')
    let m = now.getMonth(), ano = now.getFullYear()
    // Se início do mês, verifica se há dados — senão mostra mês anterior
    let { totalRec, totalDesp, saldo, bancos, reserva } = await getResumo(user, m, ano)
    if (totalRec === 0 && totalDesp === 0 && now.getDate() <= 5) {
      m = m === 0 ? 11 : m - 1
      ano = m === 11 ? ano - 1 : ano
      const dadosAnt = await getResumo(user, m, ano)
      totalRec = dadosAnt.totalRec; totalDesp = dadosAnt.totalDesp
      saldo = dadosAnt.saldo; bancos = dadosAnt.bancos; reserva = dadosAnt.reserva
    }

    // Métricas base
    const taxaPoupanca = totalRec > 0 ? Math.round(((totalRec-totalDesp)/totalRec)*100) : 0
    const pctRes = reserva.meta > 0 ? Math.round((reserva.atual/reserva.meta)*100) : 0
    const saldoBancos = bancos.reduce((s,b)=>s+b.saldo,0)

    // Busca categorias do mês atual
    const { data:despsDetalhes } = await supabase.from('despesas')
      .select('valor,categoria,tipo_compra,nome')
      .eq('casal_code',user.casal_code).eq('mes',m).eq('ano',ano)

    // Top 5 categorias
    const catMap = {}
    ;(despsDetalhes||[]).forEach(d => {
      if (!catMap[d.categoria]) catMap[d.categoria] = { total:0, qtd:0 }
      catMap[d.categoria].total += d.valor
      catMap[d.categoria].qtd++
    })
    const top5 = Object.entries(catMap)
      .sort((a,b)=>b[1].total-a[1].total)
      .slice(0,5)

    // Gastos imprevistos
    const imprevistos = (despsDetalhes||[]).filter(d=>d.tipo_compra==='impulsiva')
    const totalImprevistos = imprevistos.reduce((s,d)=>s+d.valor,0)

    // Busca mês anterior para comparativo
    const mAnt = m === 0 ? 11 : m-1
    const aAnt = m === 0 ? ano-1 : ano
    const { data:despsAnt } = await supabase.from('despesas')
      .select('valor,categoria')
      .eq('casal_code',user.casal_code).eq('mes',mAnt).eq('ano',aAnt)

    const catMapAnt = {}
    ;(despsAnt||[]).forEach(d => {
      catMapAnt[d.categoria] = (catMapAnt[d.categoria]||0) + d.valor
    })
    const totalAnt = (despsAnt||[]).reduce((s,d)=>s+d.valor,0)

    // Busca metas
    const { data:metas } = await supabase.from('metas')
      .select('nome,valor_alvo,valor_atual,atual').eq('casal_code',user.casal_code).eq('ativa',true)

    // Monta mensagem base
    let msg = '📊 *Resumo de ' + MESES[m] + '*\n\n'
    msg += '💰 Receitas: *' + fmt(totalRec) + '*\n'
    msg += '💸 Gastos: *' + fmt(totalDesp) + '*'
    if (totalAnt > 0) { const diffAnt = totalDesp - totalAnt; msg += ' (' + (diffAnt>0?'+':'') + fmt(diffAnt) + ' vs ' + MESES[mAnt] + ')' }
    msg += '\n'
    msg += (saldo>=0?'✅':'🔴') + ' Saldo: *' + fmt(saldo) + '*\n\n'
    msg += '━━━━━━━━━━━━━━━━\n'
    msg += '📈 *Inteligencia financeira:*\n\n'
    const emojP = taxaPoupanca>=20?'🌟':taxaPoupanca>=10?'🌿':taxaPoupanca>=0?'🌱':'🔴'
    msg += emojP + ' Taxa de poupanca: *' + taxaPoupanca + '%*'
    if (taxaPoupanca>=20) msg += ' — excelente!\n'
    else if (taxaPoupanca>=10) msg += ' — bom caminho!\n'
    else if (taxaPoupanca>=0) msg += ' — pode melhorar\n'
    else msg += ' — mes no vermelho\n'
    const emojR = pctRes>=100?'🛡':pctRes>=50?'🌿':pctRes>0?'🌱':'⚠️'
    msg += emojR + ' Reserva: *' + pctRes + '%* de ' + fmt(reserva.meta) + '\n'
    msg += '🏦 Patrimonio: *' + fmt(saldoBancos + reserva.atual) + '*\n\n'
    msg += '━━━━━━━━━━━━━━━━\n'
    msg += '🔍 *Top 5 categorias:*\n'
    top5.forEach(([cat,dados],i) => {
      const pct = totalDesp > 0 ? Math.round((dados.total/totalDesp)*100) : 0
      const antVal = catMapAnt[cat] || 0
      const trend = antVal > 0 ? (dados.total > antVal*1.1 ? ' ↑' : dados.total < antVal*0.9 ? ' ↓' : '') : ''
      msg += (i+1) + '. ' + cat + ': *' + fmt(dados.total) + '* (' + pct + '%)' + trend + '\n'
    })
    if (totalImprevistos > 0) {
      const pctImp = totalDesp > 0 ? Math.round((totalImprevistos/totalDesp)*100) : 0
      msg += '\n\u26a1 Gastos imprevistos: *' + fmt(totalImprevistos) + '* (' + pctImp + '% do total)\n'
    }
    await sendMessage(user.telegram_id, msg)

    // Análise profunda com Claude
    await sendAction(chatId, 'typing')

    const ctxMetas = (metas||[]).map(mt => {
      const at = mt.valor_atual||mt.atual||0
      const pc = mt.valor_alvo>0?Math.round((at/mt.valor_alvo)*100):0
      return mt.nome + ': ' + pc + '%'
    }).join(', ')

    const ctxCats = top5.map(([cat,d]) => {
      const antVal = catMapAnt[cat] || 0
      const trend = antVal > 0 ? (d.total>antVal*1.1?'subiu '+(Math.round(((d.total-antVal)/antVal)*100))+'%':d.total<antVal*0.9?'caiu '+(Math.round(((antVal-d.total)/antVal)*100))+'%':'estável') : 'novo'
      return cat + ': R$' + d.total.toFixed(0) + ' (' + d.qtd + ' lançamentos, ' + trend + ')'
    }).join('\n')

    const promptClaude = 'Casal brasileiro com objetivo de ' + (user.objetivo||'liberdade financeira') + '.\n\n' +
      'DADOS DO MES (' + MESES[m] + '):\n' +
      'Receita: ' + fmt(totalRec) + '\n' +
      'Gastos: ' + fmt(totalDesp) + '\n' +
      'Saldo: ' + fmt(saldo) + '\n' +
      'Taxa poupanca: ' + taxaPoupanca + '%\n' +
      'Reserva emergencia: ' + pctRes + '% de ' + fmt(reserva.meta) + '\n' +
      'Gastos imprevistos: ' + fmt(totalImprevistos) + ' (' + imprevistos.length + ' ocorrencias)\n\n' +
      'TOP CATEGORIAS:\n' + ctxCats + '\n\n' +
      'METAS ATIVAS:\n' + (ctxMetas||'nenhuma') + '\n\n' +
      'Identifique 2-3 padroes preocupantes ou positivos. ' +
      'Faca uma projecao: se mantiverem esse ritmo, o que acontece em 3 meses? ' +
      'Sugira 1-2 ajustes concretos para o proximo mes. ' +
      'Use metaforas de jardim. Seja direto e especifico com numeros. Maximo 6 frases.'
    const analise = await chamarClaude(promptClaude)

    if (analise?.trim()) {
      await sendMessage(user.telegram_id, '🌱 *Broto analisa:*\n\n' + analise.trim())
    }

    // Planejamento do proximo mes
    await sendAction(chatId, 'typing')
    const promptPlan = 'Com base nos dados de ' + MESES[m] + ', sugira um PLANEJAMENTO CONCRETO para ' + MESES[(m+1)%12] + '.\n' +
      'Receita esperada: ' + fmt(totalRec) + '\n' +
      'Maior gasto: ' + (top5[0]?top5[0][0]+' R$'+top5[0][1].total.toFixed(0):'sem dados') + '\n' +
      'Objetivo: ' + (user.objetivo||'liberdade financeira') + '\n' +
      'Reserva atual: ' + pctRes + '%\n' +
      'De 3 metas numericas especificas para o proximo mes. Seja direto e pratico. Maximo 4 frases.'
    const plano = await chamarClaude(promptPlan)
    if (plano?.trim()) {
      await sendMessage(user.telegram_id, '🗓 *Planejamento para ' + MESES[(m+1)%12] + ':*\n\n' + plano.trim())
    }
    await sendMessageButtons(user.telegram_id, 'O que deseja fazer?', [
      [{ text:'🎯 Ver metas', callback_data:'menu_metas' },{ text:'🛡 Reserva', callback_data:'menu_reserva' }],
      [{ text:'🔙 Menu', callback_data:'menu_inicio' }],
    ])
    return
  }



  if (callbackData === 'menu_fatura') {
    const { data:cartoes } = await supabase.from('cartoes').select('nome,fatura').eq('casal_code',user.casal_code)
    if (!cartoes?.length) {
      await sendMessageButtons(chatId, '💳 Nenhum cartão cadastrado.', [[{ text:'🔙 Menu', callback_data:'menu_inicio' }]])
      return
    }
    let msg = `💳 *Faturas abertas:*\n\n`
    cartoes.forEach(c => { msg += `• ${c.nome}: *${fmt(c.fatura||0)}*\n` })
    const total = cartoes.reduce((s,c)=>s+(c.fatura||0),0)
    msg += `\n*Total: ${fmt(total)}*`
    await sendMessageButtons(chatId, msg, [[{ text:'🔙 Menu', callback_data:'menu_inicio' }]])
    return
  }

  if (callbackData === 'menu_metas') {
    const [metasRes, reservaRes] = await Promise.all([
      supabase.from('metas').select('nome,valor_alvo,valor_atual,atual').eq('casal_code',user.casal_code).eq('ativa',true),
      supabase.from('reserva').select('atual,meta').eq('user_id',user.id).maybeSingle(),
    ])
    const metas = metasRes.data || []
    const reserva = reservaRes.data || { atual:0, meta:30000 }
    const pctRes = reserva.meta > 0 ? Math.round((reserva.atual/reserva.meta)*100) : 0
    let msg = ''
    if (pctRes < 100) {
      const bRes = '█'.repeat(Math.floor(pctRes/10)) + '░'.repeat(10-Math.floor(pctRes/10))
      msg += '🛡 *FUNDAÇÃO — Prioridade máxima*\n'
      msg += bRes + ' ' + pctRes + '%\n'
      msg += fmt(reserva.atual) + ' de ' + fmt(reserva.meta) + ' (falta ' + fmt(reserva.meta - reserva.atual) + ')\n'
      msg += '_Proteja o jardim antes de plantar novas sementes._\n\n'
      msg += '────────────────\n'
    } else {
      msg += '🌳 *Fundação sólida! Jardim protegido.*\n_Agora foco total nas metas!_\n\n'
      msg += '────────────────\n'
    }
    if (!metas.length) {
      msg += '🎯 Nenhuma meta cadastrada ainda.'
      await sendMessageButtons(chatId, msg, [[{ text:'🔙 Menu', callback_data:'menu_inicio' }]])
      return
    }
    const metasComPct = metas.map(m => {
      const atual = m.valor_atual||m.atual||0
      const pct = m.valor_alvo>0?Math.round((atual/m.valor_alvo)*100):0
      return { ...m, atual, pct, falta: m.valor_alvo - atual }
    }).sort((a,b) => b.pct - a.pct)
    const proxima = metasComPct[0]
    const bProx = '█'.repeat(Math.floor(proxima.pct/10)) + '░'.repeat(10-Math.floor(proxima.pct/10))
    msg += '🎯 *PRÓXIMA META*\n'
    msg += '*' + proxima.nome + '*\n'
    msg += bProx + ' ' + proxima.pct + '%\n'
    msg += fmt(proxima.atual) + ' de ' + fmt(proxima.valor_alvo) + ' · falta ' + fmt(proxima.falta) + '\n'
    if (metasComPct.length > 1) {
      msg += '\n────────────────\n'
      msg += '📋 *OUTRAS METAS*\n'
      metasComPct.slice(1).forEach(m => {
        msg += '\u2022 ' + m.nome + ' — ' + m.pct + '% (' + fmt(m.atual) + ' de ' + fmt(m.valor_alvo) + ')\n'
      })
    }
    await sendMessageButtons(chatId, msg, [[{ text:'🔙 Menu', callback_data:'menu_inicio' }]])
    return
  }

  if (callbackData === 'menu_reserva') {
    const { data:reserva } = await supabase.from('reserva').select('atual,meta').eq('user_id',user.id).maybeSingle()
    const r = reserva||{atual:0,meta:30000}
    const pct = r.meta>0?Math.round((r.atual/r.meta)*100):0
    const falta = r.meta-r.atual
    const barra = '█'.repeat(Math.floor(pct/10))+'░'.repeat(10-Math.floor(pct/10))
    let msg = ''
    if (pct >= 100) {
      msg = '🌳 *Reserva completa! Jardim protegido.*\n\n' + barra + ' 100%\n'
      msg += '💰 ' + fmt(r.atual) + ' guardados\n\n_Base sólida — agora foco nas metas!_'
    } else {
      msg = '🛡 *Reserva de Emergência*\n\n' + barra + ' ' + pct + '%\n\n'
      msg += '💰 Atual: *' + fmt(r.atual) + '*\n'
      msg += '🎯 Meta: *' + fmt(r.meta) + '*\n'
      msg += '📉 Falta: *' + fmt(falta) + '*\n\n'
      if (pct < 20) msg += '_Prioridade máxima — essa é a fundação do jardim._'
      else if (pct < 50) msg += '🌱 _Crescendo! Continue aportando regularmente._'
      else msg += '🌿 _Mais da metade — o jardim está ficando sólido!_'
    }
    await sendMessageButtons(chatId, msg, [[{ text:'💰 Ver metas', callback_data:'menu_metas' },{ text:'🔙 Menu', callback_data:'menu_inicio' }]])
    return
  }
  if (callbackData === 'menu_jardim') {
    const { totalRec, totalDesp, saldo, reserva, bancos } = await getResumo(user)
    const pctRes = reserva.meta>0?Math.round((reserva.atual/reserva.meta)*100):0
    const saldoBancos = bancos.reduce((s,b)=>s+b.saldo,0)
    const patrimonio = saldoBancos+reserva.atual
    const poupanca = totalRec>0?Math.round(((totalRec-totalDesp)/totalRec)*100):0

    // Score simplificado
    let score = 30
    if (totalRec>0) score+=10
    if (saldo>=0) score+=15
    if (poupanca>=20) score+=15; else if (poupanca>=5) score+=8
    if (pctRes>=100) score+=20; else if (pctRes>=50) score+=10; else if (pctRes>0) score+=5
    score = Math.min(100, score)

    const fases = [{min:30,max:41,e:'🌱',n:'Broto'},{min:41,max:57,e:'🌿',n:'Crescimento'},{min:57,max:72,e:'🌳',n:'Árvore'},{min:72,max:87,e:'🌳🌳',n:'Jardim'},{min:87,max:101,e:'🌟',n:'Legado'}]
    const fase = fases.find(f=>score>=f.min&&score<f.max)||fases[4]

    const msg = `${fase.e} *Jardim Financeiro — ${fase.n}*\n\n🌡 Saúde: *${score}%*\n💎 Patrimônio: *${fmt(patrimonio)}*\n📊 Poupança este mês: *${poupanca}%*\n🛡 Reserva: *${pctRes}%*\n\n${saldo>=0?'✅ Mês no azul!':'🔴 Mês no vermelho — ajustem o jardim.'}`
    await sendMessageButtons(chatId, msg, [[{ text:'🔙 Menu', callback_data:'menu_inicio' }]])
    return
  }

  if (callbackData === 'menu_gastos') {
    const { data } = await supabase.from('despesas').select('*')
      .eq('casal_code',user.casal_code).eq('mes',now.getMonth()).eq('ano',now.getFullYear())
      .order('created_at',{ascending:false}).limit(7)
    if (!data?.length) {
      await sendMessageButtons(chatId, '💸 Nenhum gasto este mês ainda.', [[{ text:'🔙 Menu', callback_data:'menu_inicio' }]])
      return
    }
    let t = `💸 *Últimos gastos:*\n\n`
    data.forEach(d => { t += `${CAT_ICONS[d.categoria]||'💸'} *${d.nome}* — ${fmt(d.valor)}\n` })
    await sendMessageButtons(chatId, t, [[{ text:'🔙 Menu', callback_data:'menu_inicio' }]])
    return
  }

  if (callbackData === 'menu_dica') {
    await sendAction(chatId, 'typing')
    const { totalRec, totalDesp, reserva } = await getResumo(user)
    const pctRes = reserva.meta>0?Math.round((reserva.atual/reserva.meta)*100):0
    const { data:metas } = await supabase.from('metas').select('nome,valor_alvo,valor_atual,atual').eq('casal_code',user.casal_code).eq('ativa',true).limit(3)
    const ctxMetas = (metas||[]).map(m=>{
      const atual=m.valor_atual||m.atual||0; const falta=m.valor_alvo-atual
      return `${m.nome}: falta ${fmt(falta)}`
    }).join(', ')
    const prompt = `Consultor financeiro. Casal com objetivo: ${user.objetivo||'controle'}.
Receitas: R$${totalRec}, Despesas: R$${totalDesp}, Reserva: ${pctRes}%, Metas: ${ctxMetas||'nenhuma'}.
Dê UMA insight financeiro personalizado e motivador em 2-3 frases. Use metáforas de jardim. Seja direto e positivo.`
    const dica = await chamarGroq(prompt)
    await sendMessageButtons(chatId, `💡 *Broto diz:*\n\n_${dica||'Continue cultivando seu jardim financeiro! 🌿'}_`,
      [[{ text:'🔙 Menu', callback_data:'menu_inicio' }]])
    return
  }

  if (callbackData === 'menu_gasto') {
    await sendMessage(chatId, `💸 *Lançar gasto*\n\nDigite naturalmente:\n\n_"gastei 45 no mercado"_\n_"paguei 200 gasolina"_\n_"jantar casal 180"_`)
    return
  }

  if (callbackData === 'menu_ajuda') {
    await sendMessage(chatId, HELP)
    return
  }

  // Âncora semanal — categoria escolhida
  if (callbackData.startsWith('ancora_cat_')) {
    const cat = callbackData.replace('ancora_cat_', '')
    if (cat === 'outro') {
      await sendMessage(chatId, '📝 Me diga qual categoria querem focar esta semana:')
    } else {
      await salvarContexto(user.casal_code, 'ancora_foco', cat, { cat, semana: new Date().toISOString().split('T')[0] })
      await sendMessage(chatId, '🎯 Foco definido: *' + cat + '*\n\nNa proxima segunda vou reportar como foi. 🌿')
    }
    return
  }

  if (callbackData === 'menu_inicio') {
    await sendMessageButtons(chatId, `🌿 *Éden — o que deseja fazer?*`, menuPrincipal())
    return
  }

  // ── Callbacks de pagamento ──
  const pagMap = { 'pag_debito':'debito', 'pag_cartao':'cartao', 'pag_pix':'pix', 'pag_dinheiro':'dinheiro' }
  if (pagMap[callbackData]) {
    const pagTipo = pagMap[callbackData]
    const ctxPag = ctxMap.get(`pagamento_${user.id}`) || ctxMap.get(`pagamento_${chatId}`)
    // Find by iterating ctxMap for this user's pending payment
    let foundKey = null, foundCtx = null
    for (const [k,v] of ctxMap.entries()) {
      if (k.startsWith('pagamento_') && v.item && Date.now() < v.expira) {
        foundKey = k; foundCtx = v; break
      }
    }
    if (!foundCtx) { await sendMessage(chatId, '⏱ Tempo expirado. Digite o gasto novamente.'); return }
    ctxMap.delete(foundKey)
    const { item } = foundCtx
    const icon = CAT_ICONS[item.categoria] || '💸'
    const resultado = await lancarDespesa(user, item.valor, item.descricao, item.categoria, item.quem,
      pagTipo === 'pix' ? 'debito' : pagTipo,
      pagTipo === 'cartao' ? CARTAO_PRINCIPAL.id : null)
    let resp = `${icon} *${item.descricao}*
✅ ${fmt(item.valor)} lançado!
📂 ${item.categoria||'Outros'}
`
    if (pagTipo==='cartao'&&resultado) { resp+=`
💳 ${resultado.cartaoNome}
📊 Nova fatura: ${fmt(resultado.novaFatura)}

💡 _Lançado na fatura — banco não debitado ainda_` }
    else if (resultado?.novoSaldo!==undefined) { resp+=`
🏦 ${resultado.bancoNome}: ${fmt(resultado.novoSaldo)}` }
    else if (pagTipo==='dinheiro') { resp+=`
💵 _Pago em dinheiro — sem impacto no banco_` }
    await sendMessage(chatId, resp)
    await auditLog(user.id,'lancar_despesa',{valor:item.valor,descricao:item.descricao,pagamento:pagTipo})
    await verificarMarco(user, chatId)
    try { await supabase.from('eventos_usuario').insert({user_id:user.id,casal_code:user.casal_code,evento:'primeiro_telegram',dados:{canal:'telegram',tipo:pagTipo}}) } catch {}
    // Pergunta planejado
    // Find the fromId from the original message — use chatId as fallback for DM chats
    ctxMap.set('planejado_' + user.id, { item, pagTipo, expira: Date.now()+10*60*1000 })
    await sendMessageButtons(chatId, `Era uma compra planejada?`, [
      [{ text:'✅ Sim, estava no plano', callback_data:'plan_sim' }],
      [{ text:'🙈 Não, foi impulsiva',   callback_data:'plan_nao' }],
    ])
    return
  }

  // ── Callbacks de planejado ──
  if (callbackData === 'plan_sim' || callbackData === 'plan_nao') {
    const foiPlanejada = callbackData === 'plan_sim'
    const ctxKey = 'planejado_' + user.id
    const foundCtx = ctxMap.get(ctxKey)
    if (foundCtx && Date.now() < foundCtx.expira) {
      ctxMap.delete(ctxKey)
      await processarPlanejado(foiPlanejada, foundCtx, user, chatId, user.id)
    } else {
      await sendMessage(chatId, '⏱ Tempo expirado. Lance novamente e responda em até 10 minutos.')
    }
    return
  }
}

// ── Verificações proativas ────────────────────────────
async function verificarCategoriaAlta(user, chatId) {
  try {
    const now = new Date()
    const mes=now.getMonth(), ano=now.getFullYear()
    const mesAnt=mes===0?11:mes-1, anoAnt=mes===0?ano-1:ano
    const [atual,anterior] = await Promise.all([
      supabase.from('despesas').select('valor,categoria').eq('casal_code',user.casal_code).eq('mes',mes).eq('ano',ano),
      supabase.from('despesas').select('valor,categoria').eq('casal_code',user.casal_code).eq('mes',mesAnt).eq('ano',anoAnt),
    ])
    if (!atual.data?.length||!anterior.data?.length) return
    const catAtual={};(atual.data||[]).forEach(d=>{catAtual[d.categoria]=(catAtual[d.categoria]||0)+d.valor})
    const catAnt={};(anterior.data||[]).forEach(d=>{catAnt[d.categoria]=(catAnt[d.categoria]||0)+d.valor})
    let maiorCat=null,maiorDiff=0,maiorPct=0
    for (const [cat,val] of Object.entries(catAtual)) {
      const ant=catAnt[cat]||0; if (ant===0) continue
      const diff=val-ant, pct=(diff/ant)*100
      if (diff>50&&pct>20&&diff>maiorDiff) { maiorDiff=diff; maiorCat=cat; maiorPct=pct }
    }
    if (!maiorCat) return
    const chave=`cat_alta_${user.id}_${maiorCat}_${now.toISOString().split('T')[0]}`
    if (ctxMap.get(chave)) return
    ctxMap.set(chave,true)
    const { data:metaExist } = await supabase.from('metas').select('id').eq('casal_code',user.casal_code).ilike('nome',`%${maiorCat}%`).eq('ativa',true).maybeSingle()
    const valAtual=catAtual[maiorCat],valAnt=catAnt[maiorCat]
    let msg=`📊 *Alerta de categoria*\n\n${CAT_ICONS[maiorCat]||'💸'} *${maiorCat}* está +${maiorPct.toFixed(0)}% acima do mês passado\nMês passado: ${fmt(valAnt)} → Este mês: ${fmt(valAtual)}\n\n`
    if (!metaExist) {
      msg+=`Querem criar uma meta de orçamento para ${maiorCat}?\nSugestão: limitar em *${fmt(Math.round(valAnt*1.1))}*/mês\n\nResponda *sim* para criar a meta agora`
      ctxMap.set(`aguardando_meta_${user.id}`,{categoria:maiorCat,valorSugerido:Math.round(valAnt*1.1),expira:Date.now()+2*60*60*1000})
    } else {
      msg+=`💡 _Vocês já têm uma meta para ${maiorCat}. Verifiquem no app._`
    }
    await sendMessage(chatId,msg)
    await salvarContexto(user.casal_code,'alerta_categoria',msg,{categoria:maiorCat,diff:maiorDiff})
  } catch(e) { console.warn('verificarCategoriaAlta:',e.message) }
}

async function analisarPadroesUsuario(userId,cc) {
  try {
    const tresMeses=new Date(); tresMeses.setMonth(tresMeses.getMonth()-3)
    const { data:despesas } = await supabase.from('despesas').select('valor,categoria,created_at').eq('casal_code',cc).gte('created_at',tresMeses.toISOString())
    if (!despesas?.length) return
    const grupos={}
    despesas.forEach(d=>{
      const dia=new Date(d.created_at).getDay(), key=`${dia}_${d.categoria}`
      if (!grupos[key]) grupos[key]={dia,categoria:d.categoria,valores:[]}
      grupos[key].valores.push(d.valor)
    })
    for (const p of Object.values(grupos).filter(g=>g.valores.length>=2)) {
      const valorMedio=p.valores.reduce((s,v)=>s+v,0)/p.valores.length
      await supabase.from('padroes_gasto').upsert({
        casal_code:cc, user_id:userId, dia_semana:p.dia, categoria:p.categoria,
        valor_medio:Math.round(valorMedio*100)/100, ocorrencias:p.valores.length, ativo:true,
      },{onConflict:'casal_code,dia_semana,categoria'})
    }
  } catch(e) { console.warn('analisarPadroes:',e.message) }
}

async function verificarReflexao(user,chatId) {
  try {
    const now=new Date(), hora=horaBRT()
    if (hora<17||hora>21) return
    const hoje=now.getDay(), mes=now.getMonth(), ano=now.getFullYear()
    await analisarPadroesUsuario(user.id,user.casal_code)
    const { data:padroes } = await supabase.from('padroes_gasto').select('*').eq('casal_code',user.casal_code).eq('dia_semana',hoje).eq('ativo',true).gte('ocorrencias',2).order('valor_medio',{ascending:false}).limit(1)
    if (!padroes?.length) return
    const padrao=padroes[0]
    const chave=`reflexao_${user.id}_${padrao.id}_${now.toISOString().split('T')[0]}`
    if (ctxMap.get(chave)) return
    ctxMap.set(chave,true)
    const { data:jaRespondeu } = await supabase.from('reflexoes_respondidas').select('id').eq('casal_code',user.casal_code).eq('padrao_id',padrao.id).eq('mes',mes).eq('ano',ano).maybeSingle()
    if (jaRespondeu) return
    const { data:aportes } = await supabase.from('aportes_metas').select('valor').eq('casal_code',user.casal_code).eq('mes',mes).eq('ano',ano)
    const totalAportes=(aportes||[]).reduce((s,a)=>s+a.valor,0)
    const jaInvestiu=totalAportes>=padrao.valor_medio
    const dia=DIAS[hoje], valor=fmt(padrao.valor_medio), projecao=fmt(padrao.valor_medio*12), icon=CAT_ICONS[padrao.categoria]||'💸'
    let msg=`🌿 *Reflexão do Éden*\n\n${icon} Na ${dia} passada vocês gastaram *${valor}* em ${padrao.categoria}.\n\n`
    if (!jaInvestiu) {
      msg+=`Antes de repetir, vocês já guardaram pelo menos esse valor na reserva este mês?\n\n💡 _Repetindo 12x ao ano = ${projecao}_\n\nResponda:\n✅ *sim* — já guardei\n💰 *guardar* — vou guardar agora\n🙈 *não* — não desta vez`
      ctxMap.set(`aguardando_reflexao_${user.id}`,{padraoId:padrao.id,mes,ano,expira:Date.now()+4*60*60*1000})
    } else {
      msg+=`✅ Vocês já investiram *${fmt(totalAportes)}* este mês.\nO ${padrao.categoria} de hoje está coberto! Aproveitem com consciência. 🌿`
    }
    await sendMessage(chatId,msg)
  } catch(e) { console.warn('verificarReflexao:',e.message) }
}

async function verificarRetrospectiva(user,chatId) {
  try {
    const now=new Date(); if (now.getDate()!==1) return
    const mes=now.getMonth(), ano=now.getFullYear()
    const mesAnt=mes===0?11:mes-1, anoAnt=mes===0?ano-1:ano
    const chave=`retro_${user.id}_${mes}_${ano}`
    if (ctxMap.get(chave)) return
    ctxMap.set(chave,true)
    const [dAtual,rAtual,dAnt,rAnt] = await Promise.all([
      supabase.from('despesas').select('valor,categoria').eq('casal_code',user.casal_code).eq('mes',mes).eq('ano',ano),
      supabase.from('receitas').select('valor').eq('casal_code',user.casal_code).eq('mes',mes).eq('ano',ano),
      supabase.from('despesas').select('valor,categoria').eq('casal_code',user.casal_code).eq('mes',mesAnt).eq('ano',anoAnt),
      supabase.from('receitas').select('valor').eq('casal_code',user.casal_code).eq('mes',mesAnt).eq('ano',anoAnt),
    ])
    const totalDesp=(dAtual.data||[]).reduce((s,d)=>s+d.valor,0)
    const totalRec=(rAtual.data||[]).reduce((s,r)=>s+r.valor,0)
    const totalDespAnt=(dAnt.data||[]).reduce((s,d)=>s+d.valor,0)
    const totalRecAnt=(rAnt.data||[]).reduce((s,r)=>s+r.valor,0)
    const saldo=totalRec-totalDesp, saldoAnt=totalRecAnt-totalDespAnt, diff=saldo-saldoAnt
    const catsAtual={};(dAtual.data||[]).forEach(d=>{catsAtual[d.categoria]=(catsAtual[d.categoria]||0)+d.valor})
    const catsAnt={};(dAnt.data||[]).forEach(d=>{catsAnt[d.categoria]=(catsAnt[d.categoria]||0)+d.valor})
    let maiorCat=null,maiorDiff=0
    for (const [cat,val] of Object.entries(catsAtual)) { const d=val-(catsAnt[cat]||0); if (d>maiorDiff){maiorDiff=d;maiorCat=cat} }
    const emoji=saldo>=0?'✅':'🔴', tendencia=diff>=0?`↑ melhorou ${fmt(Math.abs(diff))}`:`↓ piorou ${fmt(Math.abs(diff))}`
    let msg=`🌿 *Retrospectiva de ${MESES[mesAnt]}*\n\n${emoji} Saldo: *${fmt(saldo)}* (${tendencia} vs mês anterior)\n💰 Receitas: *${fmt(totalRec)}*\n💸 Despesas: *${fmt(totalDesp)}*\n`
    if (maiorCat) msg+=`\n📈 Maior aumento: *${maiorCat}* (+${fmt(maiorDiff)})\n`
    msg+=`\n💡 _Como foi o mês para vocês?_`
    await sendMessage(chatId,msg)
  } catch(e) { console.warn('retrospectiva:',e.message) }
}

// ── Verificação noturna ───────────────────────────────
async function verificarDiaSemGasto() {
  try {
    const now=new Date(), hora=now.getHours()
    if (hora<21||hora>23) return
    const { data:usuarios } = await supabase.from('profiles').select('id,nome,casal_code,telegram_id,objetivo').not('telegram_id','is',null)
    if (!usuarios?.length) return
    const casaisVistos=new Set()
    for (const user of usuarios) {
      if (!user.casal_code||casaisVistos.has(user.casal_code)) continue
      casaisVistos.add(user.casal_code)
      const chatId=user.telegram_id; if (!chatId) continue
      // Verifica no banco se já enviou hoje
      const { data:jaEnviouHoje } = await supabase.from('bot_contextos').select('id').eq('casal_code',user.casal_code).eq('tipo','nudge_dia').gte('created_at',inicioDiaBRT()).maybeSingle()
      if (jaEnviouHoje) continue
      const { data:gastosHoje } = await supabase.from('despesas').select('valor').eq('casal_code',user.casal_code).eq('mes',mes).eq('ano',ano).gte('created_at',inicioDiaBRT())
      const totalHoje=(gastosHoje||[]).reduce((s,d)=>s+d.valor,0)
      const { data:gastosUltimos30 } = await supabase.from('despesas').select('valor').eq('casal_code',user.casal_code).gte('created_at',new Date(Date.now()-30*24*60*60*1000).toISOString())
      const totalUltimos30=(gastosUltimos30||[]).reduce((s,d)=>s+d.valor,0)
      const mediaDiaria=totalUltimos30/30
      let diasSemGasto=0
      for (let i=1;i<=7;i++) {
        const dia=new Date(Date.now()-i*24*60*60*1000)
        const { data:gastosDia } = await supabase.from('despesas').select('id',{count:'exact',head:true}).eq('casal_code',user.casal_code).gte('created_at',new Date(dia.getFullYear(),dia.getMonth(),dia.getDate()).toISOString()).lt('created_at',new Date(dia.getFullYear(),dia.getMonth(),dia.getDate()+1).toISOString())
        if ((gastosDia?.length||0)===0) diasSemGasto++; else break
      }
      let msg=null
      if (totalHoje===0&&mediaDiaria>0) {
        const economizado=Math.round(mediaDiaria)
        msg=`🌿 *Dia sem gastos!*\n\nA média diária de vocês é ${fmt(economizado)}.\n`
        if (diasSemGasto>=2) { msg+=`\n🏆 *${diasSemGasto+1} dias consecutivos sem gastar!*\n`; if (diasSemGasto>=3) msg+=`Querem tentar chegar a ${diasSemGasto+2} dias? 💪\n` }
        const { data:reserva } = await supabase.from('reserva').select('atual,meta').eq('user_id',user.id).maybeSingle()
        if (reserva&&reserva.atual<reserva.meta) {
          const pct=Math.round((reserva.atual/reserva.meta)*100)
          const sugestao=Math.min(Math.round(economizado*0.5),reserva.meta-reserva.atual)
          msg+=`\n🛡 Sua reserva está em ${pct}%. Que tal guardar ${fmt(sugestao)} hoje?\n_Pequenos aportes constroem jardins sólidos._`
        } else { msg+=`\n_Cada dia sem gasto é uma semente plantada no jardim._ 🌱` }
      } else if (totalHoje>0&&mediaDiaria>0&&totalHoje<mediaDiaria*0.3) {
        const economia=Math.round(mediaDiaria-totalHoje)
        msg=`✨ *Dia econômico!*\n\nGastaram ${fmt(totalHoje)} hoje — ${Math.round((totalHoje/mediaDiaria)*100)}% da média diária.\nUma diferença de ${fmt(economia)} em relação ao dia típico. 🌿`
      }
      if (msg) {
      // (persistido via bot_contextos)
        await sendMessage(chatId,msg)
        await salvarContexto(user.casal_code,'nudge_dia',msg,{totalHoje,mediaDiaria:Math.round(mediaDiaria),diasSemGasto})
      }
    }
  } catch(e) { console.warn('verificarDiaSemGasto:',e.message) }
}

// ── Texto de ajuda ────────────────────────────────────
const HELP = `🌿 *Éden — Finanças a dois, sem segredos*

Diga naturalmente:
💸 "gastei 45 no mercado"
💸 "paguei 200 gasolina ela"
💸 "jantar casal 180"
💰 "recebi salário 8500"
📊 "quanto tenho?"

Comandos:
/menu — menu com botões
/saldo — saldo e bancos
/resumo — resumo do mês
/gastos — últimos lançamentos
/vincular CODIGO — vincular conta
/desvincular — remover vinculação
/ajuda — esta mensagem`

// ── Processador de updates ────────────────────────────
async function processUpdate(update) {
  // ── Callback de botão ──
  if (update.callback_query) {
    const cb = update.callback_query
    const fromId = cb.from.id
    const chatId = cb.message.chat.id
    await answerCallback(cb.id)
    if (!checkRate(fromId)) return
    const user = await getUser(fromId)
    if (!user) { await sendMessage(chatId, '⚠️ Use /vincular primeiro.'); return }
    await handleMenuCallback(cb.data, user, chatId)
    return
  }

  const msg = update.message||update.edited_message
  if (!msg?.text) return

  const chatId=msg.chat.id, text=msg.text.trim()
  const fromId=msg.from.id, username=msg.from.username||msg.from.first_name||'usuário'

  console.log(`[${new Date().toISOString()}] ${fromId} (${username}): ${text}`)

  if (!checkRate(fromId)) { await sendMessage(chatId,'⚠️ Muitas mensagens. Aguarde 1 minuto.'); return }

  // ── /start ──
  if (text==='/start'||text.startsWith('/start ')) {
    const user=await getUser(fromId)
    if (user) {
      await sendMessageButtons(chatId,`Olá, *${user.nome}*! 🌿\n\n_Finanças a dois, sem segredos._\nO que deseja fazer?`, menuPrincipal())
    } else {
      await sendMessage(chatId,`Olá! 🌿 Bem-vindo ao *Éden*!\n\n_Finanças a dois, sem segredos._\n_Não para controlar — para planejar juntos._\n\nPara começar, vincule sua conta:\n\n/vincular *seucodigodocasal*\n\nO código está no app em *Configurações → Casal*`)
    }
    return
  }

  // ── /menu ──
  if (text==='/menu') {
    const user=await getUser(fromId)
    if (!user) { await sendMessage(chatId,'⚠️ Use /vincular primeiro.'); return }
    await sendMessageButtons(chatId,`🌿 *${user.nome}* — o que deseja fazer?`, menuPrincipal())
    return
  }

  // ── /ajuda ──
  if (text==='/ajuda'||text==='/help') { await sendMessage(chatId,HELP); return }

  // ── /vincular ──
  if (text.startsWith('/vincular')) {
    const codigo=text.split(' ')[1]?.trim().toLowerCase()
    if (!codigo) { await sendMessage(chatId,'🌿 Use: /vincular *seucodigo*\n\nO código está em *Configurações → Casal* no app.'); return }
    const { data:profile } = await supabase.from('profiles').select('*').eq('casal_code',codigo).maybeSingle()
    if (!profile) { await sendMessage(chatId,`❌ Código *${codigo}* não encontrado.\n\nVerifique em *Configurações → Casal* no app.`); return }
    if (profile.telegram_id&&profile.telegram_id!==String(fromId)) { await sendMessage(chatId,'⚠️ Este código já está vinculado a outro Telegram.'); return }
    await supabase.from('profiles').update({ telegram_id:String(fromId) }).eq('id',profile.id)
    await auditLog(profile.id,'vincular_telegram',{telegram_id:fromId})

    // ── Mensagem de onboarding rica ──
    await sendMessage(chatId, `🌿 *Bem-vindo ao Éden, ${profile.nome}!*

Sou o *Broto* — seu consultor financeiro familiar.

Estou aqui para ajudar vocês a:
🌱 Registrar gastos sem esforço
📊 Entender para onde o dinheiro vai
🎯 Acompanhar metas e reserva
💡 Receber insights personalizados

Quanto mais interagirem, mais aprendo sobre o perfil financeiro do casal.

_Finanças a dois, sem segredos._
_Não para controlar — para planejar juntos._ 🌿`)

    await new Promise(r => setTimeout(r, 800))
    await sendMessageButtons(chatId, `Para começar, diga o que gastaram ou escolha uma opção:`, menuPrincipal())

    // Follow-up 24h se não lançar nada
    setTimeout(async () => {
      try {
        const userAtual = await getUser(fromId)
        if (!userAtual || userAtual.notif_onboarding === false) return
        const { data: lancs } = await supabase.from('despesas')
          .select('id', { count:'exact', head:true })
          .eq('casal_code', profile.casal_code)
          .gte('created_at', new Date(Date.now()-24*60*60*1000).toISOString())
        if (!lancs?.length) {
          await sendMessage(chatId, `🌱 *Oi, ${profile.nome}!*

Ainda não registraram nenhum gasto hoje.

Sabia que casais que registram gastos diariamente têm 3x mais clareza financeira?

Tente agora:
_"gastei 50 no mercado"_
_"paguei 120 gasolina"_`)
          await sendMessageButtons(chatId, `Como posso ajudar?`, [
            [{ text:'📈 Ver meu jardim', callback_data:'menu_jardim' },{ text:'💸 Lançar gasto', callback_data:'menu_gasto' }],
          ])
        }
      } catch(e) { console.warn('followup onboarding:', e.message) }
    }, 24*60*60*1000)

    return
  }

  // ── /desvincular ──
  if (text==='/desvincular') {
    const user=await getUser(fromId)
    if (!user) { await sendMessage(chatId,'Nenhuma conta vinculada.'); return }
    await supabase.from('profiles').update({ telegram_id:null }).eq('id',user.id)
    await sendMessage(chatId,'✅ Conta desvinculada. Use /vincular para reconectar.')
    return
  }

  // ── /saldo ──
  if (text==='/saldo') {
    const user=await getUser(fromId)
    if (!user) { await sendMessage(chatId,'⚠️ Use /vincular primeiro.'); return }
    await handleMenuCallback('menu_saldo', user, chatId); return
  }

  // ── /resumo ──
  if (text==='/resumo') {
    const user=await getUser(fromId)
    if (!user) { await sendMessage(chatId,'⚠️ Use /vincular primeiro.'); return }
    await handleMenuCallback('menu_resumo', user, chatId); return
  }

  // ── /gastos ──
  if (text==='/gastos') {
    const user=await getUser(fromId)
    if (!user) { await sendMessage(chatId,'⚠️ Use /vincular primeiro.'); return }
    await handleMenuCallback('menu_gastos', user, chatId); return
  }

  if (text.startsWith('/')) { await sendMessage(chatId,'Comando não reconhecido. Use /ajuda ou /menu'); return }

  const user=await getUser(fromId)
  if (!user) {
    await sendMessage(chatId,'⚠️ Conta não vinculada.\n\nUse: /vincular *seucodigo*\n\nO código está no app em *Configurações → Casal*')
    return
  }

  // ── Resposta a forma de pagamento ──
  const ctxPag=ctxMap.get(`pagamento_${fromId}`)
  if (ctxPag&&Date.now()<ctxPag.expira) {
    const opcoes={'1':'debito','2':'cartao','3':'pix','4':'dinheiro'}
    const pagTipo=opcoes[text.trim()]
    if (pagTipo) {
      ctxMap.delete(`pagamento_${fromId}`)
      const { item }=ctxPag
      const icon=CAT_ICONS[item.categoria]||'💸'
      const resultado=await lancarDespesa(user,item.valor,item.descricao,item.categoria,item.quem,pagTipo==='pix'?'debito':pagTipo,pagTipo==='cartao'?CARTAO_PRINCIPAL.id:null)
      let resp=`${icon} *${item.descricao}*\n✅ ${fmt(item.valor)} lançado!\n📂 ${item.categoria||'Outros'}\n`
      if (pagTipo==='cartao'&&resultado) { resp+=`\n💳 ${resultado.cartaoNome}\n📊 Nova fatura: ${fmt(resultado.novaFatura)}\n\n💡 _Lançado na fatura — banco não debitado ainda_` }
      else if (resultado?.novoSaldo!==undefined) { resp+=`\n🏦 ${resultado.bancoNome}: ${fmt(resultado.novoSaldo)}` }
      else if (pagTipo==='dinheiro') { resp+=`\n💵 _Pago em dinheiro — sem impacto no banco_` }
      await sendMessage(chatId,resp)
      await auditLog(user.id,'lancar_despesa',{valor:item.valor,descricao:item.descricao,pagamento:pagTipo})
      await verificarMarco(user,chatId)
      try { await supabase.from('eventos_usuario').insert({user_id:user.id,casal_code:user.casal_code,evento:'primeiro_telegram',dados:{canal:'telegram',tipo:pagTipo}}) } catch {}
      // Pergunta se foi planejado
      ctxMap.set('planejado_' + user.id,{item,pagTipo,expira:Date.now()+10*60*1000})
      await sendMessageButtons(chatId,`Era uma compra planejada?`,[
        [{ text:'✅ Sim, estava no plano', callback_data:'plan_sim' }],
        [{ text:'🙈 Não, foi impulsiva',   callback_data:'plan_nao' }],
      ])
      return
    } else {
      await sendMessage(chatId,'Responda com 1, 2, 3 ou 4 para confirmar o pagamento.')
      ctxMap.delete(`pagamento_${fromId}`)
    }
  }

  // ── Resposta planejado via texto ──
  const ctxPlan=ctxMap.get('planejado_' + user.id)
  if (ctxPlan&&Date.now()<ctxPlan.expira&&(text.trim()==='1'||text.trim()==='2')) {
    await processarPlanejado(text.trim()==='1', ctxPlan, user, chatId, chatId)
    return
  }

  // ── Resposta a criação de meta ──
  const ctxMeta=ctxMap.get(`aguardando_meta_${fromId}`)
  if (ctxMeta&&Date.now()<ctxMeta.expira&&text.toLowerCase().trim()==='sim') {
    try {
      await supabase.from('metas').insert({
        user_id:user.id, casal_code:user.casal_code,
        nome:`Orçamento ${ctxMeta.categoria}`, descricao:`Meta criada pelo bot`,
        valor_alvo:ctxMeta.valorSugerido, valor_atual:0, atual:0,
        categoria:ctxMeta.categoria, dono:'casal', ativa:true, origem:'bot',
      })
      ctxMap.delete(`aguardando_meta_${fromId}`)
      await sendMessage(chatId,`✅ Meta criada!\n\n🎯 *Orçamento ${ctxMeta.categoria}*\nLimite: *${fmt(ctxMeta.valorSugerido)}/mês*\n\nAcompanhe no app em *Metas*. 🌿`)
      await salvarContexto(user.casal_code,'meta_criada',`Meta ${ctxMeta.categoria}`,{valor:ctxMeta.valorSugerido})
    } catch(e) { await sendMessage(chatId,'❌ Erro ao criar meta: '+e.message) }
    return
  }

  // ── Resposta a reflexão ──
  const ctxReflexao=ctxMap.get(`aguardando_reflexao_${fromId}`)
  if (ctxReflexao&&Date.now()<ctxReflexao.expira) {
    const respostas={'sim':'sim_guardei','já guardei':'sim_guardei','já':'sim_guardei','guardar':'vou_guardar','vou guardar':'vou_guardar','vou':'vou_guardar','não':'nao_desta_vez','nao':'nao_desta_vez','não desta vez':'nao_desta_vez'}
    const resposta=respostas[text.toLowerCase().trim()]
    if (resposta) {
      await supabase.from('reflexoes_respondidas').insert({casal_code:user.casal_code,user_id:user.id,padrao_id:ctxReflexao.padraoId,resposta,mes:ctxReflexao.mes,ano:ctxReflexao.ano})
      ctxMap.delete(`aguardando_reflexao_${fromId}`)
      const msgs={'sim_guardei':'🌿 Parabéns! Vocês estão praticando a educação financeira de verdade.','vou_guardar':'💰 Ótima decisão! Abram o app → Metas e façam o aporte agora.','nao_desta_vez':'🌱 Tudo bem! A consciência já é o primeiro passo do jardim.'}
      await sendMessage(chatId,msgs[resposta])
      return
    }
  }

  // ── Verificações proativas ──
  await verificarRetrospectiva(user,chatId)
  await verificarReflexao(user,chatId)
  await verificarCategoriaAlta(user,chatId)

  // ── Mensagem livre ──
  await sendAction(chatId,'typing')
  try {
    const item=await interpretarMensagem(text)
    console.log(`Interpretado: ${JSON.stringify(item)}`)

    if (item.tipo==='saldo'||item.tipo==='resumo') {
      await handleMenuCallback('menu_saldo',user,chatId); return
    }
    if (item.tipo==='ajuda') { await sendMessage(chatId,HELP); return }

    if (item.tipo==='despesa'&&item.valor&&item.valor>0) {
      const chavePag=`pagamento_${fromId}`
      ctxMap.set(chavePag,{item,expira:Date.now()+5*60*1000})
      const icon=CAT_ICONS[item.categoria]||'💸'
      const msg=`${icon} *${item.descricao||text}*\n💰 ${fmt(item.valor)} · ${item.categoria||'Outros'}\n\nComo foi pago?`
      await sendMessageButtons(chatId,msg,[
        [{ text:'🏦 Débito',       callback_data:'pag_debito'   },{ text:'💳 Cartão Inter', callback_data:'pag_cartao'  }],
        [{ text:'📱 PIX',          callback_data:'pag_pix'      },{ text:'💵 Dinheiro',     callback_data:'pag_dinheiro'}],
      ])
      return
    }

    if (item.tipo==='receita'&&item.valor&&item.valor>0) {
      const banco=await lancarReceita(user,item.valor,item.descricao)
      let resp=`💰 *${item.descricao||'Receita'}*\n✅ ${fmt(item.valor)} registrado!\n`
      if (banco) resp+=`\n🏦 ${banco.banco}: ${fmt(banco.novoSaldo)}`
      await sendMessage(chatId,resp)
      await auditLog(user.id,'lancar_receita',{valor:item.valor})
      await verificarMarco(user,chatId)
      return
    }

    await sendMessageButtons(chatId,`Não entendi 😅\n\nTente:\n"gastei *45* no mercado"\n"recebi *8500* salário"`,[[{ text:'📋 Ver menu', callback_data:'menu_inicio' }]])
  } catch(err) {
    console.error('Erro ao processar:',err)
    await sendMessage(chatId,'❌ Erro interno. Tente novamente.')
  }
}

// ── Processar resposta planejado/impulsivo ────────────
async function processarPlanejado(foiPlanejada, ctxPlan, user, chatId, fromId) {
  ctxMap.delete('planejado_' + (fromId || chatId))
  const { item, pagTipo } = ctxPlan
  await salvarContexto(user.casal_code,'comportamento',foiPlanejada?'planejada':'impulsiva',{categoria:item.categoria,valor:item.valor,descricao:item.descricao})
  ;(async () => {
    try {
      const jaEnviou=await dicaJaEnviada(user.casal_code,item.categoria)
      const [ctx,padrao,metasData,reservaData] = await Promise.all([
        carregarContexto(user.casal_code,15),
        carregarPadraoRespostas(user.casal_code),
        supabase.from('metas').select('nome,valor_alvo,valor_atual,atual').eq('casal_code',user.casal_code).eq('ativa',true).limit(3),
        supabase.from('reserva').select('atual,meta').eq('user_id',user.id).maybeSingle(),
      ])
      const metas=metasData.data||[], reserva=reservaData.data
      const pctReserva=reserva?.meta>0?Math.round((reserva.atual/reserva.meta)*100):0
      const ctxMetas=metas.map(m=>{const atual=m.valor_atual||m.atual||0;return `${m.nome}: falta ${fmt(m.valor_alvo-atual)}`}).join(', ')
      const comprasImpulsivas=ctx.filter(c=>c.tipo==='comportamento'&&c.conteudo==='impulsiva').length
      const totalCompras=ctx.filter(c=>c.tipo==='comportamento').length
      const pctImpulsivo=totalCompras>0?Math.round((comprasImpulsivas/totalCompras)*100):0
      const dicasAnteriores=ctx.filter(c=>c.tipo==='dica').map(c=>c.conteudo).slice(0,3).join(' | ')
      const perfilTexto=padrao.perfil==='disciplinado'?`Casal disciplinado (${padrao.pctSim}% investe)`:` Casal em desenvolvimento`
      const prompt=`Consultor financeiro para casais brasileiros.
Perfil: ${perfilTexto}
Compra: "${item.descricao}" R$${item.valor} em ${item.categoria} via ${pagTipo}
Foi planejada: ${foiPlanejada?'SIM':'NÃO — foi impulsiva'}
${pctImpulsivo>0?`Histórico: ${pctImpulsivo}% das compras recentes foram impulsivas`:''}
Reserva de emergência: ${pctReserva}% completa${pctReserva<50?' (abaixo do ideal)':''}
Metas ativas: ${ctxMetas||'nenhuma cadastrada'}
Objetivo do casal: ${user.objetivo||'controle'}
${dicasAnteriores?'Dicas recentes (NÃO repita): '+dicasAnteriores:''}
Regras:
- NÃO mande parar de gastar
- Se reserva < 100%: foque APENAS na reserva — ela é a prioridade máxima, não mencione metas
- Se reserva = 100%: mencione apenas a meta mais próxima de concluir
- Máx 2 frases curtas e diretas. Só a dica, sem titulo.`
      if (!jaEnviou||!foiPlanejada) {
        const dica=await chamarGroq(prompt)
        if (dica?.trim()) {
          await sendMessage(chatId,`💡 _${dica.trim()}_`)
          await salvarContexto(user.casal_code,'dica',dica.trim(),{categoria:item.categoria,valor:item.valor,planejada:foiPlanejada})
        }
      }
    } catch(e) { console.warn('dica planejado:',e.message) }
  })()
  // Encerramento — bot volta ao zero
  setTimeout(async () => {
    try {
      await sendMessageButtons(chatId,
        '✅ Tudo registrado! O jardim est\u00e1 atualizado.\n\n_Pode me dizer o pr\u00f3ximo gasto:_',
        [
          [{ text:'Novo gasto', callback_data:'menu_gasto' },{ text:'Resumo', callback_data:'menu_resumo' }],
          [{ text:'Ver jardim', callback_data:'menu_jardim' },{ text:'Menu', callback_data:'menu_inicio' }],
        ]
      )
    } catch(e) { console.warn('encerramento:', e.message) }
  }, 2500)
}

// ── Servidor HTTP ─────────────────────────────────────

// ── Saúde semanal — toda segunda-feira ───────────────
async function enviarSaudesSemanal() {
  try {
    const now = new Date()
    if (now.getDay() !== 1 || horaBRT() < 8 || horaBRT() > 10) return
    const { data:usuarios } = await supabase.from('profiles')
      .select('id,nome,casal_code,telegram_id,objetivo,notif_semanal')
      .not('telegram_id','is',null)
    if (!usuarios?.length) return
    const casaisVistos = new Set()
    for (const user of usuarios) {
      if (!user.casal_code || casaisVistos.has(user.casal_code)) continue
      if (user.notif_semanal === false) continue
      casaisVistos.add(user.casal_code)
      const chatId = user.telegram_id
      const { data:jaEnviouSemanal } = await supabase.from('bot_contextos').select('id').eq('casal_code',user.casal_code).eq('tipo','saude_semanal').gte('created_at',inicioDiaBRT()).maybeSingle()
      if (jaEnviouSemanal) continue
      const now7 = new Date(Date.now()-7*24*60*60*1000)
      const mes = now.getMonth(), ano = now.getFullYear()
      const [desps,recs,reserva,metas] = await Promise.all([
        supabase.from('despesas').select('valor,categoria').eq('casal_code',user.casal_code).gte('created_at',now7.toISOString()),
        supabase.from('receitas').select('valor').eq('casal_code',user.casal_code).eq('mes',mes).eq('ano',ano),
        supabase.from('reserva').select('atual,meta').eq('user_id',user.id).maybeSingle(),
        supabase.from('metas').select('nome,valor_alvo,valor_atual,atual').eq('casal_code',user.casal_code).eq('ativa',true).limit(3),
      ])
      const totalDesp=(desps.data||[]).reduce((s,d)=>s+d.valor,0)
      const totalRec=(recs.data||[]).reduce((s,r)=>s+r.valor,0)
      const saldo=totalRec-totalDesp
      const reservaD=reserva.data||{atual:0,meta:30000}
      const pctRes=reservaD.meta>0?Math.round((reservaD.atual/reservaD.meta)*100):0
      const cats={}
      ;(desps.data||[]).forEach(d=>{cats[d.categoria]=(cats[d.categoria]||0)+d.valor})
      const top3=Object.entries(cats).sort((a,b)=>b[1]-a[1]).slice(0,3)
      let score=30
      if (totalRec>0) score+=10
      if (saldo>=0) score+=20
      if (pctRes>=50) score+=20; else if (pctRes>0) score+=10
      if ((metas.data||[]).length>0) score+=10
      score=Math.min(100,score)
      const fases=[{min:30,max:41,e:'🌱',n:'Broto'},{min:41,max:57,e:'🌿',n:'Crescimento'},{min:57,max:72,e:'🌳',n:'Árvore'},{min:72,max:87,e:'🌳🌳',n:'Jardim'},{min:87,max:101,e:'🌟',n:'Legado'}]
      const fase=fases.find(f=>score>=f.min&&score<f.max)||fases[4]
      const prompt=`Consultor financeiro para casais brasileiros. Semana: gastaram ${fmt(totalDesp)}, receitas ${fmt(totalRec)}, saldo ${fmt(saldo)}. Top categorias: ${top3.map(([c,v])=>`${c}: ${fmt(v)}`).join(', ')}. Reserva: ${pctRes}%. Objetivo: ${user.objetivo||'controle'}. Gere UMA mensagem motivadora de no máximo 2 frases sobre o jardim financeiro. Use metáforas de jardim.`
      const dica=await chamarGroq(prompt)
      let msg = fase.e + ' *Como está seu jardim esta semana?*\n\n'
      msg += '\U0001f321 Saúde: *' + score + '%* — ' + fase.nome + '\n\n'
      msg += '📊 *Resumo da semana:*\n'
      msg += '💰 Receitas: ' + fmt(totalRec) + '\n'
      msg += '💸 Gastos: ' + fmt(totalDesp) + '\n'
      msg += (saldo>=0 ? '✅' : '🔴') + ' Saldo: *' + fmt(saldo) + '*\n\n'
      if (top3.length > 0) {
        msg += '\U0001f3c6 *Top 3 gastos:*\n'
        top3.forEach(([cat,val],i) => { msg += (i+1) + '. ' + (CAT_ICONS[cat]||'💸') + ' ' + cat + ': ' + fmt(val) + '\n' })
        msg += '\n'
      }
      msg += '🛡 Reserva: ' + fmt(reservaD.atual) + ' (' + pctRes + '%)\n\n'
      if (dica && dica.trim()) msg += '\U0001f4a1 *Broto diz:*\n_' + dica.trim() + '_'
      await sendMessage(chatId, msg)
      await sendMessageButtons(chatId, `O que quer fazer hoje?`,[
        [{text:'📈 Ver jardim',callback_data:'menu_jardim'},{text:'💸 Lançar gasto',callback_data:'menu_gasto'}],
        [{text:'🎯 Metas',callback_data:'menu_metas'},{text:'🛡 Reserva',callback_data:'menu_reserva'}],
      ])
      await salvarContexto(user.casal_code,'saude_semanal',`Score: ${score}%`,{score,totalDesp,totalRec,saldo,pctRes})
    }
  } catch(e) { console.warn('enviarSaudesSemanal:',e.message) }
}

// ── Reflexão proativa para todos os usuários ─────────
async function verificarReflexaoGlobal() {
  try {
    const now = new Date()
    const hora = horaBRT()
    if (hora < 17 || hora > 21) return
    const { data:usuarios } = await supabase.from('profiles')
      .select('id,nome,casal_code,telegram_id,objetivo,banco_principal_id')
      .not('telegram_id','is',null)
    if (!usuarios?.length) return
    const casaisVistos = new Set()
    for (const user of usuarios) {
      if (!user.casal_code || casaisVistos.has(user.casal_code)) continue
      casaisVistos.add(user.casal_code)
      const chatId = user.telegram_id
      if (!chatId) continue
      await verificarReflexaoVariada(user, chatId)
      await verificarCategoriaAlta(user, chatId)
    }
  } catch(e) { console.warn('verificarReflexaoGlobal:',e.message) }
}


// ── Alertas de contas vencendo hoje ──────────────────
async function alertaContasHoje() {
  try {
    const now = new Date()
    if (horaBRT() !== 9) return
    const hoje = now.getDate()
    const { data:usuarios } = await supabase.from('profiles')
      .select('id,nome,casal_code,telegram_id,notif_semanal')
      .not('telegram_id','is',null)
    if (!usuarios?.length) return
    const casaisVistos = new Set()
    for (const user of usuarios) {
      if (!user.casal_code || casaisVistos.has(user.casal_code)) continue
      if (user.notif_semanal === false) continue
      casaisVistos.add(user.casal_code)
      const { data:jaEnviouContas } = await supabase.from('bot_contextos')
        .select('id').eq('casal_code', user.casal_code).eq('tipo', 'alerta_vencimento_hoje')
        .gte('created_at', inicioDiaBRT())
        .maybeSingle()
      if (jaEnviouContas) continue
      const [contasHoje, cartoes] = await Promise.all([
        supabase.from('contas_fixas').select('*').eq('casal_code',user.casal_code).eq('dia_vencimento',hoje),
        supabase.from('cartoes').select('*').eq('casal_code',user.casal_code).gt('fatura',0),
      ])
      const contasVencemHoje = contasHoje.data || []
      const cartoesVencemHoje = (cartoes.data||[]).filter(c => c.dia_vencimento === hoje)
      if (!contasVencemHoje.length && !cartoesVencemHoje.length) continue
      let msg = '⏰ *Vence hoje!*\n\n'
      contasVencemHoje.forEach(c => { msg += '\u{1F4CB} ' + c.nome + ': *' + fmt(c.valor) + '*\n' })
      cartoesVencemHoje.forEach(c => { msg += '\u{1F4B3} Fatura ' + c.nome + ': *' + fmt(c.fatura) + '*\n' })
      const total = contasVencemHoje.reduce((s,c)=>s+c.valor,0) + cartoesVencemHoje.reduce((s,c)=>s+(c.fatura||0),0)
      msg += '\n\u{1F4B0} Total de hoje: *' + fmt(total) + '*'
      await sendMessageButtons(user.telegram_id, msg, [
        [{text:'Ver fatura',callback_data:'menu_fatura'},{text:'Ver resumo',callback_data:'menu_resumo'}],
      ])
      await salvarContexto(user.casal_code,'alerta_vencimento_hoje',msg,{total,data:hoje})
    }
  } catch(e) { console.warn('alertaContasHoje:',e.message) }
}
async function alertaContasSemana() {
  try {
    const now = new Date()
    if (now.getDay() !== 1 || horaBRT() !== 8) return
    const hoje = now.getDate()
    const { data:usuarios } = await supabase.from('profiles')
      .select('id,nome,casal_code,telegram_id,notif_semanal')
      .not('telegram_id','is',null)
    if (!usuarios?.length) return
    const casaisVistos = new Set()
    for (const user of usuarios) {
      if (!user.casal_code || casaisVistos.has(user.casal_code)) continue
      if (user.notif_semanal === false) continue
      casaisVistos.add(user.casal_code)
      const chave = 'contas_semana_' + user.casal_code + '_' + now.toISOString().split('T')[0]
      if (ctxMap.get(chave)) continue
      const [contas, cartoes, bancos] = await Promise.all([
        supabase.from('contas_fixas').select('*').eq('casal_code',user.casal_code),
        supabase.from('cartoes').select('*').eq('casal_code',user.casal_code).gt('fatura',0),
        supabase.from('contas_banco').select('banco,saldo').eq('casal_code',user.casal_code),
      ])
      const proximos7 = (contas.data||[]).filter(c => {
        const diff = c.dia_vencimento - hoje
        return diff >= 0 && diff <= 7
      }).sort((a,b) => a.dia_vencimento - b.dia_vencimento)
      const cartoesProximos = (cartoes.data||[]).filter(c => {
        const diff = c.dia_vencimento - hoje
        return diff >= 0 && diff <= 7
      })
      if (!proximos7.length && !cartoesProximos.length) continue
      ctxMap.set(chave, true)
      const totalSaldo = (bancos.data||[]).reduce((s,b)=>s+b.saldo,0)
      const totalVence = proximos7.reduce((s,c)=>s+c.valor,0) + cartoesProximos.reduce((s,c)=>s+(c.fatura||0),0)
      let msg = 'Contas da semana:\n\n'
      proximos7.forEach(c => { msg += '- ' + c.nome + ' - *' + fmt(c.valor) + '* (dia ' + c.dia_vencimento + ')\n' })
      cartoesProximos.forEach(c => { msg += '- Fatura ' + c.nome + ' - *' + fmt(c.fatura) + '* (dia ' + c.dia_vencimento + ')\n' })
      const saldoApos = totalSaldo - totalVence
      msg += '\nTotal a pagar: *' + fmt(totalVence) + '*\n'
      msg += 'Saldo disponivel: *' + fmt(totalSaldo) + '*\n'
      msg += (saldoApos >= 0 ? 'Saldo OK: ' : 'Atencao, saldo insuficiente: ') + '*' + fmt(saldoApos) + '*'
      await sendMessageButtons(user.telegram_id, msg, [
        [{text:'📊 Ver resumo completo',callback_data:'menu_resumo'}],
      ])
      await salvarContexto(user.casal_code,'alerta_semana',msg,{totalVence,totalSaldo})
    }
  } catch(e) { console.warn('alertaContasSemana:',e.message) }
}
async function alertaSaldoBaixo() {
  try {
    const now = new Date()
    if (horaBRT() !== 21) return
    const { data:usuarios } = await supabase.from('profiles')
      .select('id,nome,casal_code,telegram_id,banco_principal_id,saldo_minimo_alerta,notif_dia')
      .not('telegram_id','is',null)
    if (!usuarios?.length) return
    for (const user of usuarios) {
      if (user.notif_dia === false) continue
      const { data:jaEnviouSaldo } = await supabase.from('bot_contextos').select('id').eq('casal_code',user.casal_code).eq('tipo','alerta_saldo_baixo').gte('created_at',inicioDiaBRT()).maybeSingle()
      if (jaEnviouSaldo) continue
      const { data:banco } = await supabase.from('contas_banco').select('banco,saldo')
        .eq('id', user.banco_principal_id).maybeSingle()
      if (!banco) continue
      const limite = user.saldo_minimo_alerta || 500
      if (banco.saldo < limite) {
        const msg = `⚠️ *Saldo baixo!*

🏦 ${banco.banco}: *${fmt(banco.saldo)}*
Abaixo do limite configurado de *${fmt(limite)}*

_Considere transferir para cobrir as próximas contas._`
        await sendMessage(user.telegram_id, msg)
        await salvarContexto(user.casal_code,'alerta_saldo_baixo',msg,{saldo:banco.saldo,limite})
      }
    }
  } catch(e) { console.warn('alertaSaldoBaixo:',e.message) }
}

// ── Alerta churn — sem lançamentos há 3+ dias ─────────
async function alertaChurn() {
  try {
    const now = new Date()
    if (horaBRT() !== 21) return
    const { data:usuarios } = await supabase.from('profiles')
      .select('id,nome,casal_code,telegram_id,notif_dia')
      .not('telegram_id','is',null)
    if (!usuarios?.length) return
    const casaisVistos = new Set()
    for (const user of usuarios) {
      if (!user.casal_code || casaisVistos.has(user.casal_code)) continue
      if (user.notif_dia === false) continue
      casaisVistos.add(user.casal_code)
      const { data:jaEnviouChurn } = await supabase.from('bot_contextos').select('id').eq('casal_code',user.casal_code).eq('tipo','alerta_churn').gte('created_at',inicioDiaBRT()).maybeSingle()
      if (jaEnviouChurn) continue
      const { data:ultimos } = await supabase.from('despesas').select('created_at')
        .eq('casal_code',user.casal_code)
        .order('created_at',{ascending:false}).limit(1)
      if (!ultimos?.length) continue
      const ultimoLanc = new Date(ultimos[0].created_at)
      const diasSem = Math.floor((now - ultimoLanc) / (24*60*60*1000))
      if (diasSem >= 3) {
        const msg = `🌱 *${user.nome}, seu jardim está esperando!*

Faz *${diasSem} dias* sem novos lançamentos.

Manter o registro ativo ajuda o Broto a aprender e dar dicas mais precisas.

_Pequenos registros constroem grandes jardins._ 🌿`
        await sendMessageButtons(user.telegram_id, msg, [
          [{text:'💸 Lançar agora',callback_data:'menu_gasto'},{text:'📊 Ver resumo',callback_data:'menu_resumo'}],
        ])
        await salvarContexto(user.casal_code,'alerta_churn',msg,{diasSem})
        // Registra no banco para admin monitorar
        try {
          await supabase.from('eventos_usuario').insert({
            user_id:user.id, casal_code:user.casal_code,
            evento:'risco_churn', dados:{diasSem, ultimoLanc:ultimoLanc.toISOString()},
          })
        } catch {}
      }
    }
  } catch(e) { console.warn('alertaChurn:',e.message) }
}

// ── Alerta meta parada — dia 15 ───────────────────────
async function alertaMetaParada() {
  try {
    const now = new Date()
    if (now.getDate() !== 15 || horaBRT() !== 9) return
    const { data:usuarios } = await supabase.from('profiles')
      .select('id,nome,casal_code,telegram_id,notif_semanal')
      .not('telegram_id','is',null)
    if (!usuarios?.length) return
    const casaisVistos = new Set()
    for (const user of usuarios) {
      if (!user.casal_code || casaisVistos.has(user.casal_code)) continue
      if (user.notif_semanal === false) continue
      casaisVistos.add(user.casal_code)
      const chave = `meta_parada_${user.casal_code}_${now.getMonth()}_${now.getFullYear()}`
      if (ctxMap.get(chave)) continue
      const trintaDias = new Date(Date.now()-30*24*60*60*1000)
      const { data:aportes } = await supabase.from('aportes_metas').select('meta_id')
        .eq('casal_code',user.casal_code).gte('created_at',trintaDias.toISOString())
      const metasComAporte = new Set((aportes||[]).map(a=>a.meta_id))
      const { data:metas } = await supabase.from('metas').select('id,nome,valor_alvo,valor_atual,atual')
        .eq('casal_code',user.casal_code).eq('ativa',true)
      const metasParadas = (metas||[]).filter(m => !metasComAporte.has(m.id))
      if (!metasParadas.length) continue
      ctxMap.set(chave, true)
      let msg = 'Metas sem aporte este mes:\n\n'
      metasParadas.forEach(m => {
        const atual = m.valor_atual||m.atual||0
        const pct = m.valor_alvo>0?Math.round((atual/m.valor_alvo)*100):0
        msg += '- ' + m.nome + ': ' + pct + '% (' + fmt(atual) + ' de ' + fmt(m.valor_alvo) + ')\n'
      })
      msg += '\nPequenos aportes constantes chegam mais longe do que um grande esforco eventual.'
      await sendMessageButtons(user.telegram_id, msg, [
        [{text:'🎯 Ver metas',callback_data:'menu_metas'}],
      ])
      await salvarContexto(user.casal_code,'alerta_meta_parada',msg,{qtd:metasParadas.length})
    }
  } catch(e) { console.warn('alertaMetaParada:',e.message) }
}

// ── Aprendizado comportamental ────────────────────────
async function aprendizadoComportamental() {
  try {
    const now = new Date()
    if (horaBRT() !== 22) return
    const { data:usuarios } = await supabase.from('profiles')
      .select('id,nome,casal_code,telegram_id,notif_dia,objetivo')
      .not('telegram_id','is',null)
    if (!usuarios?.length) return
    const casaisVistos = new Set()
    for (const user of usuarios) {
      if (!user.casal_code || casaisVistos.has(user.casal_code)) continue
      if (user.notif_dia === false) continue
      casaisVistos.add(user.casal_code)
      const { data:jaEnviouComp } = await supabase.from('bot_contextos').select('id').eq('casal_code',user.casal_code).in('tipo',['comportamento_dia_sem_gasto','comportamento_fim_dia']).gte('created_at',inicioDiaBRT()).maybeSingle()
      if (jaEnviouComp) continue
      const inicioDia = inicioDiaBRT()
      const { data:gastosHoje } = await supabase.from('despesas').select('valor,categoria,nome')
        .eq('casal_code',user.casal_code).gte('created_at',inicioDia)
      const totalHoje = (gastosHoje||[]).reduce((s,d)=>s+d.valor,0)
      // Busca histórico do mesmo dia da semana nos últimos 90 dias
      const diaSemana = now.getDay()
      const noventaDias = new Date(Date.now()-90*24*60*60*1000)
      const { data:historico } = await supabase.from('despesas').select('valor,created_at')
        .eq('casal_code',user.casal_code).gte('created_at',noventaDias.toISOString())
      // Filtra pelo mesmo dia da semana
      const mesmodia = (historico||[]).filter(d => new Date(d.created_at).getDay() === diaSemana)
      const mediaHistorica = mesmodia.length > 0 ? mesmodia.reduce((s,d)=>s+d.valor,0)/mesmodia.length : 0
      if (totalHoje === 0 && mediaHistorica > 0) {
        // Dia sem gasto — parabeniza com contexto histórico
        const economia = Math.round(mediaHistorica)
        const diasSemGasto = mesmodia.filter(d=>d.valor===0).length
        const prompt = `Casal economizou hoje. Média histórica nas ${DIAS[diaSemana]}s: R$${economia}. Total de dias sem gasto recentes: ${diasSemGasto}. Objetivo: ${user.objetivo||'controle'}. Parabenize em 1-2 frases usando metáforas de jardim. Seja caloroso e específico.`
        const dica = await chamarGroq(prompt)
        let msg = 'Parabens pelo dia de hoje!\n\n'
        msg += 'Nas ultimas semanas, ' + DIAS[diaSemana] + ' costuma ter gastos de *' + fmt(economia) + '* em media.\n'
        msg += 'Hoje voces ficaram com o jardim protegido!\n\n'
        if (dica && dica.trim()) msg += '_' + dica.trim() + '_'
        await sendMessage(user.telegram_id, msg)
        await salvarContexto(user.casal_code,'comportamento_dia_sem_gasto',msg,{totalHoje,mediaHistorica:economia})
      } else if (totalHoje > 0 && mediaHistorica > 0) {
        // Teve gastos — compara com histórico
        const diff = totalHoje - mediaHistorica
        const pct = Math.abs(Math.round((diff/mediaHistorica)*100))
        const acimaDaMedia = diff > mediaHistorica * 0.2
        const { data:comportamentos } = await supabase.from('bot_contextos').select('conteudo')
          .eq('casal_code',user.casal_code).eq('tipo','comportamento')
          .gte('created_at',new Date(Date.now()-30*24*60*60*1000).toISOString())
        const totalComp = comportamentos?.length || 0
        const impulsivas = (comportamentos||[]).filter(c=>c.conteudo==='impulsiva').length
        const pctImpulsivo = totalComp > 0 ? Math.round((impulsivas/totalComp)*100) : 0
        const promptComp = 'Casal gastou ' + fmt(totalHoje) + ' hoje. Media historica nas ' + DIAS[diaSemana] + 's: ' + fmt(mediaHistorica) + '. ' + (acimaDaMedia?'Acima':'Abaixo') + ' da media em ' + pct + '%. ' + pctImpulsivo + '% das compras recentes foram impulsivas. De 1 insight comportamental em 2 frases usando metaforas de jardim.'
        const dicaComp = await chamarGroq(promptComp)
        let msg2 = 'Resumo do dia:\n\n'
        msg2 += 'Hoje: *' + fmt(totalHoje) + '* ' + (acimaDaMedia ? '+' + pct + '% acima da media' : pct + '% abaixo da media') + '\n'
        msg2 += 'Media das ' + DIAS[diaSemana] + 's: *' + fmt(mediaHistorica) + '*\n\n'
        if (pctImpulsivo > 0) msg2 += pctImpulsivo + '% das compras recentes foram impulsivas\n\n'
        if (dicaComp && dicaComp.trim()) msg2 += '_' + dicaComp.trim() + '_'
        await sendMessage(user.telegram_id, msg2)
        await salvarContexto(user.casal_code,'comportamento_fim_dia',msg2,{totalHoje,mediaHistorica,pctImpulsivo})
      }
    }
  } catch(e) { console.warn('aprendizadoComportamental:',e.message) }
}

// ── Reflexão com variação (evita repetição) ───────────
async function verificarReflexaoVariada(user, chatId) {
  try {
    const now = new Date()
    const hora = horaBRT()
    if (hora < 17 || hora > 21) return
    const hoje = now.getDay(), mes = now.getMonth(), ano = now.getFullYear()
    await analisarPadroesUsuario(user.id, user.casal_code)
    const { data:padroes } = await supabase.from('padroes_gasto').select('*')
      .eq('casal_code',user.casal_code).eq('dia_semana',hoje).eq('ativo',true)
      .gte('ocorrencias',2).order('valor_medio',{ascending:false}).limit(3)
    if (!padroes?.length) return
    // Seleciona padrão diferente do último enviado
    const { data:ultimaReflexao } = await supabase.from('bot_contextos').select('dados')
      .eq('casal_code',user.casal_code).eq('tipo','reflexao_variada')
      .order('created_at',{ascending:false}).limit(1).maybeSingle()
    const ultimoPadraoId = ultimaReflexao?.dados?.padraoId
    const padrao = padroes.find(p => p.id !== ultimoPadraoId) || padroes[0]
    const chave = `reflexao_var_${user.id}_${padrao.id}_${now.toISOString().split('T')[0]}`
    if (ctxMap.get(chave)) return
    ctxMap.set(chave, true)
    const { data:jaRespondeu } = await supabase.from('reflexoes_respondidas').select('id')
      .eq('casal_code',user.casal_code).eq('padrao_id',padrao.id).eq('mes',mes).eq('ano',ano).maybeSingle()
    if (jaRespondeu) return
    const { data:aportes } = await supabase.from('aportes_metas').select('valor')
      .eq('casal_code',user.casal_code).eq('mes',mes).eq('ano',ano)
    const totalAportes = (aportes||[]).reduce((s,a)=>s+a.valor,0)
    const jaInvestiu = totalAportes >= padrao.valor_medio
    const dia = DIAS[hoje], valor = fmt(padrao.valor_medio), projecao = fmt(padrao.valor_medio*12)
    const icon = CAT_ICONS[padrao.categoria]||'💸'
    // Varia a mensagem com IA
    const prompt = `Reflexão financeira para casal brasileiro. Hoje é ${dia}. Padrão identificado: gastam ${valor} em ${padrao.categoria} nas ${dia}s. Projeção anual: ${projecao}. ${jaInvestiu?'Já investiram este mês — parabenize e encoraje.':'Ainda não investiram este mês — faça uma reflexão gentil de 2 frases sobre consciência financeira sem ser moralista. Use metáfora de jardim diferente das anteriores.'}`
    const reflexao = await chamarGroq(prompt)
    let msg = `🌿 *Reflexão do Éden*

${icon} ${reflexao||`Nas ${dia}s vocês costumam gastar *${valor}* em ${padrao.categoria}.`}

`
    if (!jaInvestiu) {
      msg += `💡 _Repetindo 12x ao ano = ${projecao}_

Responda:
✅ *sim* — já guardei
💰 *guardar* — vou guardar agora
🙈 *não* — não desta vez`
      ctxMap.set(`aguardando_reflexao_${user.id}`,{padraoId:padrao.id,mes,ano,expira:Date.now()+4*60*60*1000})
    } else {
      msg += `✅ Vocês já investiram *${fmt(totalAportes)}* este mês. Aproveitem com consciência! 🌿`
    }
    await sendMessage(chatId, msg)
    await salvarContexto(user.casal_code,'reflexao_variada',msg,{padraoId:padrao.id,categoria:padrao.categoria})
  } catch(e) { console.warn('verificarReflexaoVariada:',e.message) }
}


// ── 1. Fechamento mensal enriquecido (dia 1) ─────────
async function fechamentoMensal() {
  try {
    const now = new Date()
    if (now.getDate() !== 1 || horaBRT() !== 8) return
    const mes = now.getMonth() === 0 ? 11 : now.getMonth() - 1
    const ano = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()

    const { data: usuarios } = await supabase.from('profiles')
      .select('id,nome,casal_code,telegram_id,notif_semanal,objetivo')
      .not('telegram_id','is',null)
    if (!usuarios?.length) return
    const casaisVistos = new Set()

    for (const user of usuarios) {
      if (!user.casal_code || casaisVistos.has(user.casal_code)) continue
      if (user.notif_semanal === false) continue
      casaisVistos.add(user.casal_code)
      const chave = 'fechamento_' + user.casal_code + '_' + mes + '_' + ano
      const { data: jaEnviou } = await supabase.from('bot_contextos').select('id')
        .eq('casal_code', user.casal_code).eq('tipo', 'fechamento_mensal')
        .gte('created_at', new Date(now.getFullYear(), now.getMonth(), 1).toISOString())
        .maybeSingle()
      if (jaEnviou) continue

      const [desps, recs, despMesAnt, recMesAnt] = await Promise.all([
        supabase.from('despesas').select('valor,categoria,quem').eq('casal_code',user.casal_code).eq('mes',mes).eq('ano',ano),
        supabase.from('receitas').select('valor,quem').eq('casal_code',user.casal_code).eq('mes',mes).eq('ano',ano),
        supabase.from('despesas').select('valor,categoria').eq('casal_code',user.casal_code).eq('mes',mes===0?11:mes-1).eq('ano',mes===0?ano-1:ano),
        supabase.from('receitas').select('valor').eq('casal_code',user.casal_code).eq('mes',mes===0?11:mes-1).eq('ano',mes===0?ano-1:ano),
      ])

      const totalDesp = (desps.data||[]).reduce((s,d)=>s+d.valor,0)
      const totalRec = (recs.data||[]).reduce((s,r)=>s+r.valor,0)
      const totalDespAnt = (despMesAnt.data||[]).reduce((s,d)=>s+d.valor,0)
      const totalRecAnt = (recMesAnt.data||[]).reduce((s,r)=>s+r.valor,0)
      const saldo = totalRec - totalDesp
      const poupanca = totalRec > 0 ? Math.round(((totalRec-totalDesp)/totalRec)*100) : 0

      // Divisão EU vs ELA
      const despEu  = (desps.data||[]).filter(d=>d.quem==='eu').reduce((s,d)=>s+d.valor,0)
      const despEla = (desps.data||[]).filter(d=>d.quem==='ela').reduce((s,d)=>s+d.valor,0)
      const recEu   = (recs.data||[]).filter(r=>r.quem==='eu').reduce((s,r)=>s+r.valor,0)
      const recEla  = (recs.data||[]).filter(r=>r.quem==='ela').reduce((s,r)=>s+r.valor,0)

      // Top categoria
      const cats = {}
      ;(desps.data||[]).forEach(d => { cats[d.categoria]=(cats[d.categoria]||0)+d.valor })
      const topCat = Object.entries(cats).sort((a,b)=>b[1]-a[1])[0]

      // Comparativo mês anterior
      const diffDesp = totalDesp - totalDespAnt
      const tendencia = diffDesp > 0 ? '+' + fmt(diffDesp) + ' vs mês anterior' : fmt(Math.abs(diffDesp)) + ' a menos que mês anterior'

      const emoji = saldo >= 0 ? '✅' : '🔴'
      let msg = '🌿 *Fechamento de ' + MESES[mes] + '*\n\n'
      msg += emoji + ' Saldo: *' + fmt(saldo) + '*\n'
      msg += '💰 Receitas: ' + fmt(totalRec) + '\n'
      msg += '💸 Gastos: ' + fmt(totalDesp) + ' (' + tendencia + ')\n'
      msg += '📈 Poupanca: *' + poupanca + '%*\n\n'
      if (topCat) msg += '🏆 Maior gasto: ' + topCat[0] + ' (' + fmt(topCat[1]) + ')\n\n'
      if (despEu > 0 || despEla > 0) {
        msg += '👫 *Divisao do casal:*\n'
        msg += '- EU: ' + fmt(despEu) + ' gastos / ' + fmt(recEu) + ' receitas\n'
        msg += '- ELA: ' + fmt(despEla) + ' gastos / ' + fmt(recEla) + ' receitas\n\n'
      }
      msg += saldo >= 0 ? 'Jardim fechou no azul! Continue assim.' : 'Jardim fechou no vermelho. Vamos replanejar.'
      await sendMessage(user.telegram_id, msg)
      await salvarContexto(user.casal_code, 'fechamento_mensal', msg, { mes, ano, saldo, poupanca })
    }
  } catch(e) { console.warn('fechamentoMensal:', e.message) }
}

// ── 2. Projeção do mês ────────────────────────────────
async function projecaoMes() {
  try {
    const now = new Date()
    const dia = now.getDate()
    const hora = horaBRT()
    // Roda nos dias 15 e 20 às 9h
    if ((dia !== 15 && dia !== 20) || hora !== 9) return

    const { data: usuarios } = await supabase.from('profiles')
      .select('id,nome,casal_code,telegram_id,notif_semanal')
      .not('telegram_id','is',null)
    if (!usuarios?.length) return
    const casaisVistos = new Set()

    for (const user of usuarios) {
      if (!user.casal_code || casaisVistos.has(user.casal_code)) continue
      if (user.notif_semanal === false) continue
      casaisVistos.add(user.casal_code)

      const chave = 'projecao_' + user.casal_code + '_' + now.toISOString().split('T')[0]
      const { data: jaEnviou } = await supabase.from('bot_contextos').select('id')
        .eq('casal_code', user.casal_code).eq('tipo', 'projecao_mes')
        .gte('created_at', new Date(now.getFullYear(), now.getMonth(), dia).toISOString())
        .maybeSingle()
      if (jaEnviou) continue

      const mes = now.getMonth(), ano = now.getFullYear()
      const diasNoMes = new Date(ano, mes+1, 0).getDate()
      const diasRestantes = diasNoMes - dia

      const [desps, recs] = await Promise.all([
        supabase.from('despesas').select('valor').eq('casal_code',user.casal_code).eq('mes',mes).eq('ano',ano),
        supabase.from('receitas').select('valor').eq('casal_code',user.casal_code).eq('mes',mes).eq('ano',ano),
      ])

      const totalDesp = (desps.data||[]).reduce((s,d)=>s+d.valor,0)
      const totalRec  = (recs.data||[]).reduce((s,r)=>s+r.valor,0)
      const mediaDiaria = totalDesp / dia
      const projecaoFim = totalDesp + (mediaDiaria * diasRestantes)
      const projecaoSaldo = totalRec - projecaoFim
      const pctUsado = totalRec > 0 ? Math.round((totalDesp/totalRec)*100) : 0

      if (pctUsado < 60) continue // só avisa se já usou mais de 60% da renda

      const emoji = projecaoSaldo >= 0 ? '🟡' : '🔴'
      const emojiP = projecaoSaldo >= 0 ? '🟡' : '🔴'
      let msg = emojiP + ' *Projecao do mes*\n\n'
      msg += 'Dia ' + dia + ' de ' + diasNoMes + ' - ' + diasRestantes + ' dias restantes\n\n'
      msg += '💸 Gastos ate agora: *' + fmt(totalDesp) + '* (' + pctUsado + '% da renda)\n'
      msg += '📊 Ritmo diario: ' + fmt(mediaDiaria) + '/dia\n'
      msg += '🔮 Projecao fim do mes: *' + fmt(projecaoFim) + '*\n\n'
      if (projecaoSaldo < 0) {
        msg += '⚠️ No ritmo atual, deficit de *' + fmt(Math.abs(projecaoSaldo)) + '*\n'
        msg += '_Reduzir ' + fmt(mediaDiaria * 0.2) + '/dia equilibra o orcamento._'
      } else {
        msg += '✅ Projecao de *' + fmt(projecaoSaldo) + '* de saldo\n'
        msg += '_Bom ritmo! Mantenham o controle._'
      }

      await sendMessage(user.telegram_id, msg)
      await salvarContexto(user.casal_code, 'projecao_mes', msg, { dia, projecaoFim, projecaoSaldo })
    }
  } catch(e) { console.warn('projecaoMes:', e.message) }
}

// ── 3. Celebração de conquistas financeiras ───────────
async function celebrarConquistas() {
  try {
    const now = new Date()
    if (horaBRT() !== 20) return
    const mes = now.getMonth(), ano = now.getFullYear()

    const { data: usuarios } = await supabase.from('profiles')
      .select('id,nome,casal_code,telegram_id,notif_dia')
      .not('telegram_id','is',null)
    if (!usuarios?.length) return
    const casaisVistos = new Set()

    for (const user of usuarios) {
      if (!user.casal_code || casaisVistos.has(user.casal_code)) continue
      if (user.notif_dia === false) continue
      casaisVistos.add(user.casal_code)

      const [desps, recs, reserva, metas] = await Promise.all([
        supabase.from('despesas').select('valor').eq('casal_code',user.casal_code).eq('mes',mes).eq('ano',ano),
        supabase.from('receitas').select('valor').eq('casal_code',user.casal_code).eq('mes',mes).eq('ano',ano),
        supabase.from('reserva').select('atual,meta').eq('user_id',user.id).maybeSingle(),
        supabase.from('metas').select('nome,valor_alvo,valor_atual,atual').eq('casal_code',user.casal_code).eq('ativa',true),
      ])

      const totalDesp = (desps.data||[]).reduce((s,d)=>s+d.valor,0)
      const totalRec  = (recs.data||[]).reduce((s,r)=>s+r.valor,0)
      const saldo = totalRec - totalDesp
      const r = reserva.data || { atual:0, meta:30000 }
      const pctRes = r.meta > 0 ? Math.round((r.atual/r.meta)*100) : 0
      const conquistas = []

      // Primeiro mês no azul
      const chaveAzul = 'conquista_azul_' + user.casal_code + '_' + mes + '_' + ano
      const { data: jaAzul } = await supabase.from('bot_contextos').select('id')
        .eq('casal_code',user.casal_code).eq('tipo','conquista_azul')
        .gte('created_at', new Date(ano, mes, 1).toISOString()).maybeSingle()
      if (saldo > 0 && !jaAzul) conquistas.push({ emoji:'💚', msg:'Mês no azul! Saldo positivo de ' + fmt(saldo), tipo:'conquista_azul' })

      // Marcos da reserva
      for (const marco of [25, 50, 75, 100]) {
        if (pctRes >= marco) {
          const { data: jaMarco } = await supabase.from('bot_contextos').select('id')
            .eq('casal_code',user.casal_code).eq('tipo','conquista_reserva_'+marco).maybeSingle()
          if (!jaMarco) conquistas.push({ emoji:'🛡', msg:'Reserva atingiu ' + marco + '%! (' + fmt(r.atual) + ')', tipo:'conquista_reserva_'+marco })
        }
      }

      // Meta concluída
      for (const meta of (metas.data||[])) {
        const atual = meta.valor_atual||meta.atual||0
        if (atual >= meta.valor_alvo) {
          const { data: jaMeta } = await supabase.from('bot_contextos').select('id')
            .eq('casal_code',user.casal_code).eq('tipo','conquista_meta_'+meta.nome).maybeSingle()
          if (!jaMeta) conquistas.push({ emoji:'🎯', msg:'Meta "' + meta.nome + '" concluída! 🎉', tipo:'conquista_meta_'+meta.nome })
        }
      }

      if (!conquistas.length) continue

      let msg = '🌟 *Conquistas do jardim!*\n\n'
      conquistas.forEach(c => { msg += c.emoji + ' ' + c.msg + '\n' })
      msg += '\nCada conquista e uma semente do legado de voces. 🌿'
      await sendMessage(user.telegram_id, msg)
      for (const c of conquistas) {
        await salvarContexto(user.casal_code, c.tipo, msg, { mes, ano })
      }
    }
  } catch(e) { console.warn('celebrarConquistas:', e.message) }
}

// ── 4. Âncora semanal de comprometimento ─────────────
async function ancoraSemanaldal() {
  try {
    const now = new Date()
    // Envia na sexta-feira às 18h — para o casal pensar no fim de semana
    if (now.getDay() !== 5 || horaBRT() !== 18) return

    const { data: usuarios } = await supabase.from('profiles')
      .select('id,nome,casal_code,telegram_id,notif_semanal')
      .not('telegram_id','is',null)
    if (!usuarios?.length) return
    const casaisVistos = new Set()

    for (const user of usuarios) {
      if (!user.casal_code || casaisVistos.has(user.casal_code)) continue
      if (user.notif_semanal === false) continue
      casaisVistos.add(user.casal_code)

      const chave = 'ancora_' + user.casal_code + '_' + now.toISOString().split('T')[0]
      const { data: jaEnviou } = await supabase.from('bot_contextos').select('id')
        .eq('casal_code',user.casal_code).eq('tipo','ancora_semanal')
        .gte('created_at', inicioDiaBRT())
        .maybeSingle()
      if (jaEnviou) continue

      // Busca top 3 categorias do mês
      const mes = now.getMonth(), ano = now.getFullYear()
      const { data: desps } = await supabase.from('despesas').select('valor,categoria')
        .eq('casal_code',user.casal_code).eq('mes',mes).eq('ano',ano)
      const cats = {}
      ;(desps||[]).forEach(d => { cats[d.categoria]=(cats[d.categoria]||0)+d.valor })
      const top3 = Object.entries(cats).sort((a,b)=>b[1]-a[1]).slice(0,3)

      let msg = '🎯 *Foco da semana*\n\n'
      msg += 'Em qual categoria querem economizar esta semana?\n\n'
      if (top3.length) {
        msg += '📊 Maiores gastos do mes:\n'
        top3.forEach(([cat,val],idx) => { msg += (idx+1) + '. ' + cat + ': ' + fmt(val) + '\n' })
        msg += '\n'
      }
      msg += '_Escolham uma categoria e o Broto vai monitorar._'

      const buttons = top3.map(([cat]) => [{ text: cat, callback_data: 'ancora_cat_' + cat }])
      buttons.push([{ text: 'Outra categoria', callback_data: 'ancora_cat_outro' }])

      await sendMessageButtons(user.telegram_id, msg, buttons)
      await salvarContexto(user.casal_code, 'ancora_semanal', msg, { mes, ano, top3: top3.map(([c])=>c) })
    }
  } catch(e) { console.warn('ancoraSemanaldal:', e.message) }
}


// ── Celebrações — vida vivida com consciência ─────────
async function verificarCelebracoes() {
  try {
    const now = new Date()
    if (horaBRT() !== 20) return
    const mes = now.getMonth(), ano = now.getFullYear()
    const { data:usuarios } = await supabase.from('profiles')
      .select('id,nome,casal_code,telegram_id,notif_dia')
      .not('telegram_id','is',null)
    if (!usuarios?.length) return
    const casaisVistos = new Set()

    for (const user of usuarios) {
      if (!user.casal_code || casaisVistos.has(user.casal_code)) continue
      if (user.notif_dia === false) continue
      casaisVistos.add(user.casal_code)

      // Busca parceiro do casal para personalizar
      const { data:parceiro } = await supabase.from('profiles')
        .select('nome').eq('casal_code', user.casal_code)
        .neq('id', user.id).maybeSingle()
      const nomeParceiro = parceiro?.nome?.split(' ')[0] || ''
      const nomesDupla = nomeParceiro ? user.nome.split(' ')[0] + ' & ' + nomeParceiro : user.nome.split(' ')[0]

      // Busca dados do mês
      const semanaAtras = new Date(Date.now() - 7*24*60*60*1000).toISOString()
      const [despsHoje, despsSemana, despsAntSemana, reserva] = await Promise.all([
        supabase.from('despesas').select('valor,categoria,tipo_compra').eq('casal_code',user.casal_code)
          .gte('created_at', inicioDiaBRT()),
        supabase.from('despesas').select('valor,categoria').eq('casal_code',user.casal_code)
          .gte('created_at', semanaAtras),
        supabase.from('despesas').select('valor,categoria').eq('casal_code',user.casal_code)
          .gte('created_at', new Date(Date.now()-14*24*60*60*1000).toISOString())
          .lte('created_at', semanaAtras),
        supabase.from('reserva').select('atual,meta').eq('user_id',user.id).maybeSingle(),
      ])

      const celebracoes = []

      // 1. Reduziu categoria esta semana vs semana passada
      const catsSemana = {}
      const catsAnt = {}
      ;(despsSemana.data||[]).forEach(d => { catsSemana[d.categoria]=(catsSemana[d.categoria]||0)+d.valor })
      ;(despsAntSemana.data||[]).forEach(d => { catsAnt[d.categoria]=(catsAnt[d.categoria]||0)+d.valor })

      for (const [cat, val] of Object.entries(catsSemana)) {
        const valAnt = catsAnt[cat] || 0
        const reducao = valAnt - val
        const pct = valAnt > 0 ? Math.round((reducao/valAnt)*100) : 0
        if (reducao >= 50 && pct >= 20) {
          const chaveRed = 'celebracao_reducao_' + cat + '_' + user.casal_code + '_' + now.toISOString().split('T')[0]
          const { data:jaRed } = await supabase.from('bot_contextos').select('id')
            .eq('casal_code',user.casal_code).eq('tipo','celebracao_reducao_'+cat)
            .gte('created_at', new Date(now.getFullYear(),now.getMonth(),now.getDate()-7).toISOString())
            .maybeSingle()
          if (!jaRed) {
            // Usa Claude para sugerir celebração personalizada
            const promptCelebr = 'Casal brasileiro chamado ' + nomesDupla + ' reduziu gastos em ' + cat + ' em ' + pct + '% esta semana (economizaram ' + fmt(reducao) + '). Sugira uma celebração romântica e acessível para eles aproveitarem parte dessa economia juntos. Máximo 2 frases, caloroso, use a metáfora do jardim. Não mencione valores.'
            const dicaCelebr = await chamarClaude(promptCelebr)
            celebracoes.push({
              tipo: 'celebracao_reducao_' + cat,
              msg: '🎉 *' + nomesDupla + ', voces reduziram ' + cat + ' em ' + pct + '%!*\n\nEconomizaram *' + fmt(reducao) + '* essa semana.\n\n' + (dicaCelebr || 'Que tal celebrar com um programa especial juntos? Voces merecem!'),
            })
          }
        }
      }

      // 2. Semana sem compras impulsivas
      const impulsivas = (despsSemana.data||[]).filter(d=>d.tipo_compra==='impulsiva')
      if (impulsivas.length === 0 && (despsSemana.data||[]).length >= 3) {
        const { data:jaImp } = await supabase.from('bot_contextos').select('id')
          .eq('casal_code',user.casal_code).eq('tipo','celebracao_sem_impulsiva')
          .gte('created_at', new Date(now.getFullYear(),now.getMonth(),now.getDate()-7).toISOString())
          .maybeSingle()
        if (!jaImp) {
          celebracoes.push({
            tipo: 'celebracao_sem_impulsiva',
            msg: '🌟 *Uma semana de decisoes conscientes!*\n\n' + nomesDupla + ', toda compra desta semana foi planejada.\n\nIsso e raro e merece ser celebrado. 🌿\n\n_Escolham um programa juntos esse fim de semana._',
          })
        }
      }

      // 3. Marcos da reserva com celebracao
      const r = reserva.data || { atual:0, meta:30000 }
      const pctRes = r.meta > 0 ? Math.round((r.atual/r.meta)*100) : 0
      for (const marco of [25, 50, 75, 100]) {
        if (pctRes >= marco) {
          const { data:jaMarco } = await supabase.from('bot_contextos').select('id')
            .eq('casal_code',user.casal_code).eq('tipo','celebracao_reserva_'+marco).maybeSingle()
          if (!jaMarco) {
            const msgs = {
              25:  '🛡 *25% da reserva!*\n\n' + nomesDupla + ', o primeiro escudo esta plantado.\n\n_Comemorem com algo simples — um jantar em casa com velas. 🕯️_',
              50:  '🛡 *Metade da reserva!*\n\n' + nomesDupla + ', isso e uma conquista real.\n\n_Que tal aquele restaurante que voces queriam? Voces merecem. 🍷_',
              75:  '🛡 *75% da reserva!*\n\nO jardim de ' + nomesDupla + ' esta protegido.\n\n_Planejem uma saida juntos — celebrar o caminho e tao importante quanto chegar. 🌹_',
              100: '🌳 *Reserva completa!*\n\n' + nomesDupla + ', isso e liberdade.\n\nVoces construiram a fundacao que a maioria dos casais nunca tem.\n\n_Celebrem de verdade — um jantar especial, uma viagem. 🥂_',
            }
            celebracoes.push({ tipo: 'celebracao_reserva_'+marco, msg: msgs[marco] })
          }
        }
      }

      // Envia celebrações
      for (const c of celebracoes) {
        await sendMessage(user.telegram_id, c.msg)
        await salvarContexto(user.casal_code, c.tipo, c.msg, { mes, ano })
        await new Promise(r => setTimeout(r, 1500))
      }
    }
  } catch(e) { console.warn('verificarCelebracoes:', e.message) }
}

// ── Mensagem de fim de semana ─────────────────────────
async function mensagemFimDeSemana() {
  try {
    const now = new Date()
    if (now.getDay() !== 5 || horaBRT() !== 19) return

    const { data:usuarios } = await supabase.from('profiles')
      .select('id,nome,casal_code,telegram_id,notif_dia')
      .not('telegram_id','is',null)
    if (!usuarios?.length) return
    const casaisVistos = new Set()

    for (const user of usuarios) {
      if (!user.casal_code || casaisVistos.has(user.casal_code)) continue
      if (user.notif_dia === false) continue
      casaisVistos.add(user.casal_code)

      const { data:jaEnviou } = await supabase.from('bot_contextos').select('id')
        .eq('casal_code',user.casal_code).eq('tipo','fim_de_semana')
        .gte('created_at', inicioDiaBRT())
        .maybeSingle()
      if (jaEnviou) continue

      const { data:parceiro } = await supabase.from('profiles')
        .select('nome').eq('casal_code',user.casal_code).neq('id',user.id).maybeSingle()
      const nomeParceiro = parceiro?.nome?.split(' ')[0] || ''
      const nomesDupla = nomeParceiro ? user.nome.split(' ')[0] + ' & ' + nomeParceiro : user.nome.split(' ')[0]

      // Saldo da semana
      const { data:desps } = await supabase.from('despesas').select('valor')
        .eq('casal_code',user.casal_code)
        .gte('created_at', new Date(Date.now()-7*24*60*60*1000).toISOString())
      const totalSemana = (desps||[]).reduce((s,d)=>s+d.valor,0)

      const prompt = 'Casal brasileiro chamado ' + nomesDupla + ' gastou ' + fmt(totalSemana) + ' essa semana. É sexta-feira. Sugira algo especial e acessível para eles aproveitarem o fim de semana juntos — pode ser um programa em casa, ao ar livre ou um programa simples. Seja caloroso, celebre que eles terminaram mais uma semana. Use metáfora do jardim. Máximo 3 frases.'
      const dica = await chamarClaude(prompt)

      const msg = '🌅 *Boa sexta-feira, ' + nomesDupla + '!*\n\nA semana passou e o jardim continua crescendo.\n\n' + (dica || 'Aproveitem o fim de semana juntos. 🌹')
      await sendMessage(user.telegram_id, msg)
      await salvarContexto(user.casal_code, 'fim_de_semana', msg, { totalSemana })
    }
  } catch(e) { console.warn('mensagemFimDeSemana:', e.message) }
}

const server = require('http').createServer((req,res) => {
  if (req.method==='POST'&&req.url==='/webhook') {
    let body=''
    req.on('data',c=>body+=c)
    req.on('end', async () => {
      try { await processUpdate(JSON.parse(body)) } catch(e) { console.error('Parse error:',e.message) }
      res.writeHead(200); res.end('OK')
    })
    return
  }
  res.writeHead(200,{'Content-Type':'application/json'})
  res.end(JSON.stringify({status:'ok',bot:'Éden',tagline:'Finanças a dois, sem segredos.',ts:new Date().toISOString()}))
})

// Callback de botão — planejado
// (processado em processUpdate via callback_query)
// Handler adicional para callbacks de pagamento e planejado inline
const _origProcess = processUpdate
// já integrado acima

// Verificação noturna + saúde semanal
setInterval(async () => {
  const brt = horaBRT()
  console.log('[CRON] rodando - hora BRT:', brt)
  try { await verificarDiaSemGasto() } catch(e) { console.warn('cron diario:',e.message) }
  try { await verificarReflexaoGlobal() } catch(e) { console.warn('cron reflexao:',e.message) }
  try { await enviarSaudesSemanal() } catch(e) { console.warn('cron semanal:',e.message) }
  try { await alertaContasHoje() } catch(e) { console.warn('cron contas hoje:',e.message) }
  try { await alertaContasSemana() } catch(e) { console.warn('cron contas semana:',e.message) }
  try { await alertaSaldoBaixo() } catch(e) { console.warn('cron saldo baixo:',e.message) }
  try { await alertaChurn() } catch(e) { console.warn('cron churn:',e.message) }
  try { await alertaMetaParada() } catch(e) { console.warn('cron meta parada:',e.message) }
  try { await aprendizadoComportamental() } catch(e) { console.warn('cron comportamento:',e.message) }
  try { await fechamentoMensal() } catch(e) { console.warn('cron fechamento:',e.message) }
  try { await projecaoMes() } catch(e) { console.warn('cron projecao:',e.message) }
  try { await celebrarConquistas() } catch(e) { console.warn('cron conquistas:',e.message) }
  try { await ancoraSemanaldal() } catch(e) { console.warn('cron ancora:',e.message) }
  try { await verificarCelebracoes() } catch(e) { console.warn('cron celebracoes:',e.message) }
  try { await mensagemFimDeSemana() } catch(e) { console.warn('cron fimdesemana:',e.message) }
}, 60*60*1000) // a cada 1 hora

// Keep-alive — ping no próprio health check a cada 4 minutos
setInterval(() => {
  const domain = process.env.RAILWAY_PUBLIC_DOMAIN || process.env.RAILWAY_STATIC_URL
  if (!domain) return
  const https = require('https')
  https.get('https://' + domain + '/health', (res) => {
    console.log('[KEEP-ALIVE] ping ok:', res.statusCode)
  }).on('error', (e) => {
    console.warn('[KEEP-ALIVE] erro:', e.message)
  })
}, 4 * 60 * 1000)

// Log imediato ao iniciar para confirmar que o cron está ativo
console.log('[BOT] Iniciado. Hora BRT:', horaBRT(), '| Inicio dia BRT:', inicioDiaBRT())

server.on('error', (e) => console.error('[SERVER ERROR]', e.message))
server.listen(PORT, () => {
  console.log('🌿 Éden Bot na porta ' + PORT)
  console.log('[HEALTH] servidor pronto para health checks em /health')
  // Registra webhook após servidor estar pronto
  setTimeout(async () => {
    try {
      const domain = process.env.RAILWAY_PUBLIC_DOMAIN || process.env.RAILWAY_STATIC_URL
      if (domain) {
        const webhookUrl = 'https://' + domain + '/webhook'
        console.log('📡 Registrando webhook: ' + webhookUrl)
        await setWebhook(webhookUrl)
      } else {
        console.log('⚠️  RAILWAY_PUBLIC_DOMAIN não encontrado')
      }
      console.log('🌿 Bot pronto! Finanças a dois, sem segredos.')
    } catch(e) {
      console.error('[WEBHOOK ERROR]', e.message)
    }
  }, 2000) // aguarda 2s para garantir que health check já passou
})
