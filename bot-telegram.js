// Éden Bot — Telegram webhook
// Deploy: Railway

'use strict'
const http  = require('http')
const https = require('https')
const { createClient } = require('@supabase/supabase-js')

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

async function getResumo(user) {
  const now = new Date()
  const [d,r,b,res] = await Promise.all([
    supabase.from('despesas').select('valor,quem,categoria').eq('casal_code',user.casal_code).eq('mes',now.getMonth()).eq('ano',now.getFullYear()),
    supabase.from('receitas').select('valor,quem').eq('casal_code',user.casal_code).eq('mes',now.getMonth()).eq('ano',now.getFullYear()),
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
    const { saldo, bancos, reserva } = await getResumo(user)
    const pctRes = reserva.meta>0?((reserva.atual/reserva.meta)*100).toFixed(0):0
    let t = `🌿 *${user.nome}*\n\n📊 Saldo do mês: *${fmt(saldo)}*\n\n🏦 *Contas:*\n`
    bancos.forEach(b => {
      const isPrincipal = b.id===user.banco_principal_id
      t += `  ${isPrincipal?'⭐':'•'} ${b.banco}: *${fmt(b.saldo)}*\n`
    })
    t += `\n🛡 Reserva: *${fmt(reserva.atual)}* (${pctRes}%)`
    await sendMessageButtons(chatId, t, [[{ text:'🔙 Menu', callback_data:'menu_inicio' }]])
    return
  }

  if (callbackData === 'menu_resumo') {
    const { totalRec, totalDesp, saldo } = await getResumo(user)
    const m = now.getMonth()
    const msg = `📊 *Resumo de ${MESES[m]}*\n\n💰 Receitas: *${fmt(totalRec)}*\n💸 Gastos: *${fmt(totalDesp)}*\n${saldo>=0?'✅':'🔴'} Saldo: *${fmt(saldo)}*`
    await sendMessageButtons(chatId, msg, [[{ text:'🔙 Menu', callback_data:'menu_inicio' }]])
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
    const { data:metas } = await supabase.from('metas').select('nome,valor_alvo,valor_atual,atual').eq('casal_code',user.casal_code).eq('ativa',true).limit(5)
    if (!metas?.length) {
      await sendMessageButtons(chatId, '🎯 Nenhuma meta ativa.', [[{ text:'🔙 Menu', callback_data:'menu_inicio' }]])
      return
    }
    let msg = `🎯 *Suas metas:*\n\n`
    metas.forEach(m => {
      const atual = m.valor_atual||m.atual||0
      const pct = m.valor_alvo>0?Math.round((atual/m.valor_alvo)*100):0
      const falta = m.valor_alvo-atual
      const barra = '█'.repeat(Math.floor(pct/10))+'░'.repeat(10-Math.floor(pct/10))
      msg += `*${m.nome}*\n${barra} ${pct}%\n${fmt(atual)} de ${fmt(m.valor_alvo)} (falta ${fmt(falta)})\n\n`
    })
    await sendMessageButtons(chatId, msg, [[{ text:'🔙 Menu', callback_data:'menu_inicio' }]])
    return
  }

  if (callbackData === 'menu_reserva') {
    const { data:reserva } = await supabase.from('reserva').select('atual,meta').eq('user_id',user.id).maybeSingle()
    const r = reserva||{atual:0,meta:30000}
    const pct = r.meta>0?Math.round((r.atual/r.meta)*100):0
    const falta = r.meta-r.atual
    const barra = '█'.repeat(Math.floor(pct/10))+'░'.repeat(10-Math.floor(pct/10))
    const msg = `🛡 *Reserva de Emergência*\n\n${barra} ${pct}%\n\n💰 Atual: *${fmt(r.atual)}*\n🎯 Meta: *${fmt(r.meta)}*\n📉 Falta: *${fmt(falta)}*\n\n${pct>=100?'✅ Reserva completa! Jardim protegido.':pct>=50?'🌿 Mais da metade — continue!':'🌱 Em construção — cada aporte conta.'}`
    await sendMessageButtons(chatId, msg, [[{ text:'🔙 Menu', callback_data:'menu_inicio' }]])
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
    ctxMap.set(`planejado_${chatId}`, { item, pagTipo, expira: Date.now()+10*60*1000 })
    await sendMessageButtons(chatId, `Era uma compra planejada?`, [
      [{ text:'✅ Sim, estava no plano', callback_data:'plan_sim' }],
      [{ text:'🙈 Não, foi impulsiva',   callback_data:'plan_nao' }],
    ])
    return
  }

  // ── Callbacks de planejado ──
  if (callbackData === 'plan_sim' || callbackData === 'plan_nao') {
    const foiPlanejada = callbackData === 'plan_sim'
    // Look for context by chatId (DM = chatId equals userId)
    const ctxKey = `planejado_${chatId}`
    const foundCtx = ctxMap.get(ctxKey)
    if (foundCtx && Date.now() < foundCtx.expira) {
      ctxMap.delete(ctxKey)
      await processarPlanejado(foiPlanejada, foundCtx, user, chatId, chatId)
    } else {
      // Fallback — search all pending
      for (const [k,v] of ctxMap.entries()) {
        if (k.startsWith('planejado_') && v.item && Date.now() < v.expira) {
          ctxMap.delete(k)
          await processarPlanejado(foiPlanejada, v, user, chatId, chatId)
          break
        }
      }
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
    const now=new Date(), hora=now.getHours()
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
      const chaveHoje=`dia_sem_gasto_${user.casal_code}_${now.toISOString().split('T')[0]}`
      if (ctxMap.get(chaveHoje)) continue
      const mes=now.getMonth(), ano=now.getFullYear()
      const { data:gastosHoje } = await supabase.from('despesas').select('valor').eq('casal_code',user.casal_code).eq('mes',mes).eq('ano',ano).gte('created_at',new Date(now.getFullYear(),now.getMonth(),now.getDate()).toISOString())
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
        ctxMap.set(chaveHoje,true)
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
      ctxMap.set(`planejado_${fromId}`,{item,pagTipo,expira:Date.now()+10*60*1000})
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
  const ctxPlan=ctxMap.get(`planejado_${fromId}`)
  if (ctxPlan&&Date.now()<ctxPlan.expira&&(text.trim()==='1'||text.trim()==='2')) {
    await processarPlanejado(text.trim()==='1', ctxPlan, user, chatId, fromId)
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
  ctxMap.delete(`planejado_${fromId}`)
  ctxMap.delete(`planejado_${chatId}`) // cleanup both keys
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
Regras: NÃO mande parar de gastar. Se reserva < 50%: sugira aporte gentil. Se tem metas: mencione quanto falta. Máx 2 frases. Só a dica.`
      if (!jaEnviou||!foiPlanejada) {
        const dica=await chamarGroq(prompt)
        if (dica?.trim()) {
          await sendMessage(chatId,`💡 _${dica.trim()}_`)
          await salvarContexto(user.casal_code,'dica',dica.trim(),{categoria:item.categoria,valor:item.valor,planejada:foiPlanejada})
        }
      }
    } catch(e) { console.warn('dica planejado:',e.message) }
  })()
}

// ── Servidor HTTP ─────────────────────────────────────
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
  try { await verificarDiaSemGasto() } catch(e) { console.warn('cron diario:',e.message) }
  try { await enviarSaudesSemanal() } catch(e) { console.warn('cron semanal:',e.message) }
}, 60*60*1000) // a cada 1 hora

server.listen(PORT, async () => {
  console.log(`🌿 Éden Bot na porta ${PORT}`)
  const domain=process.env.RAILWAY_PUBLIC_DOMAIN||process.env.RAILWAY_STATIC_URL
  if (domain) {
    const webhookUrl=`https://${domain}/webhook`
    console.log(`📡 Registrando webhook: ${webhookUrl}`)
    await setWebhook(webhookUrl)
  } else {
    console.log('⚠️  RAILWAY_PUBLIC_DOMAIN não encontrado')
  }
  console.log('🌿 Bot pronto! Finanças a dois, sem segredos.')
})
