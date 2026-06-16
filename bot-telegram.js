// Éden Bot — Telegram webhook
// Deploy: Railway
// Variáveis de ambiente necessárias:
//   TELEGRAM_TOKEN  = token do @BotFather
//   SUPABASE_URL    = https://xxx.supabase.co
//   SUPABASE_ANON   = eyJ...
//   GROQ_API_KEY    = gsk_...

'use strict'
const http  = require('http')
const https = require('https')
const { createClient } = require('@supabase/supabase-js')

// ── Config via env ────────────────────────────────────
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN
const SUPABASE_URL   = process.env.SUPABASE_URL
const SUPABASE_ANON  = process.env.SUPABASE_ANON
const GROQ_API_KEY   = process.env.GROQ_API_KEY
const PORT           = process.env.PORT || 3000

// Cartão e banco principal do casal
const CARTAO_PRINCIPAL = {
  id:   process.env.CARTAO_PRINCIPAL_ID   || 'f3b9f1fa-2832-4f79-97c5-77473b182190',
  nome: process.env.CARTAO_PRINCIPAL_NOME || 'Cartão Inter',
}

if (!TELEGRAM_TOKEN) console.error('⚠️  TELEGRAM_TOKEN não configurado')
if (!SUPABASE_URL)   console.error('⚠️  SUPABASE_URL não configurado')
if (!GROQ_API_KEY)   console.error('⚠️  GROQ_API_KEY não configurado')

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON)

// ── Rate limiting ─────────────────────────────────────
const rateMap = new Map()

function checkRate(userId) {
  const now  = Date.now()
  const key  = String(userId)
  const e    = rateMap.get(key) || { count: 0, reset: now + 60000 }
  if (now > e.reset) { e.count = 0; e.reset = now + 60000 }
  e.count++
  rateMap.set(key, e)
  return e.count <= 30
}

// Contexto de respostas pendentes (vincular, reflexão)
const ctxMap = new Map()

// ── HTTP helpers ──────────────────────────────────────
function httpsPost(hostname, path, body, headers = {}) {
  return new Promise((resolve) => {
    const buf = JSON.stringify(body)
    const req = https.request({
      hostname, path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(buf), ...headers },
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
  return httpsPost('api.telegram.org',
    `/bot${TELEGRAM_TOKEN}/sendMessage`,
    { chat_id: chatId, text, parse_mode: 'Markdown', ...extra }
  )
}

async function sendAction(chatId, action = 'typing') {
  return httpsPost('api.telegram.org',
    `/bot${TELEGRAM_TOKEN}/sendChatAction`,
    { chat_id: chatId, action }
  )
}

async function setWebhook(url) {
  const r = await httpsPost('api.telegram.org',
    `/bot${TELEGRAM_TOKEN}/setWebhook`,
    { url, allowed_updates: ['message'] }
  )
  console.log('Webhook:', JSON.stringify(r))
}

// ── Formatação ────────────────────────────────────────
function fmt(n) {
  return 'R$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const MESES     = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const DIAS      = ['domingo','segunda','terça','quarta','quinta','sexta','sábado']
const CAT_ICONS = { Alimentação:'🛒', Moradia:'🏠', Transporte:'🚗', Saúde:'💊', Lazer:'🎉', Educação:'📚', Assinaturas:'📺', Investimento:'📈', Outros:'💸' }

// ── Groq ──────────────────────────────────────────────
async function chamarGroq(prompt) {
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + GROQ_API_KEY,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 300,
        temperature: 0.1,
        messages: [
          { role: 'system', content: 'Consultor financeiro para casais brasileiros. Responda em português, direto.' },
          { role: 'user', content: prompt },
        ],
      }),
    })
    const data = await res.json()
    console.log('[Groq status]', res.status)
    if (!res.ok) { console.error('[Groq error]', JSON.stringify(data)); return '' }
    return data?.choices?.[0]?.message?.content || ''
  } catch(e) {
    console.error('[Groq fetch error]', e.message)
    return ''
  }
}

async function interpretarMensagem(texto) {
  const prompt = `Analise: "${texto.substring(0, 200)}"
Responda APENAS JSON válido:
{"tipo":"despesa"|"receita"|"saldo"|"ajuda"|"desconhecido","valor":número|null,"descricao":"texto"|null,"categoria":"Alimentação"|"Moradia"|"Transporte"|"Saúde"|"Lazer"|"Educação"|"Assinaturas"|"Outros"|null,"quem":"eu"|"ela"|"casal"|null}
Exemplos:
"gastei 45 mercado"→{"tipo":"despesa","valor":45,"descricao":"Supermercado","categoria":"Alimentação","quem":"eu"}
"recebi salário 8500"→{"tipo":"receita","valor":8500,"descricao":"Salário","categoria":null,"quem":"eu"}
"quanto tenho"→{"tipo":"saldo","valor":null,"descricao":null,"categoria":null,"quem":null}`
  try {
    const raw = await chamarGroq(prompt)
    return JSON.parse(raw.replace(/```json|```/g, '').trim())
  } catch { return { tipo: 'desconhecido' } }
}

// ── Supabase helpers ──────────────────────────────────
async function getUser(telegramId) {
  const { data } = await supabase.from('profiles').select('*')
    .eq('telegram_id', String(telegramId)).maybeSingle()
  return data
}

async function getResumo(user) {
  const now = new Date()
  const [d, r, b, res] = await Promise.all([
    supabase.from('despesas').select('valor,quem,categoria').eq('casal_code', user.casal_code)
      .eq('mes', now.getMonth()).eq('ano', now.getFullYear()),
    supabase.from('receitas').select('valor,quem').eq('casal_code', user.casal_code)
      .eq('mes', now.getMonth()).eq('ano', now.getFullYear()),
    supabase.from('contas_banco').select('banco,saldo,id').eq('casal_code', user.casal_code),
    supabase.from('reserva').select('atual,meta').eq('user_id', user.id).maybeSingle(),
  ])
  const totalRec  = (r.data||[]).reduce((s,x) => s + x.valor, 0)
  const totalDesp = (d.data||[]).reduce((s,x) => s + x.valor, 0)
  const saldoBancos = (b.data||[]).reduce((s,x) => s + x.saldo, 0)
  const bancoPrincipal = (b.data||[]).find(x => x.id === user.banco_principal_id) || (b.data||[])[0]
  return {
    totalRec, totalDesp, saldo: totalRec - totalDesp,
    bancos: b.data || [],
    bancoPrincipal,
    reserva: res.data || { atual: 0, meta: 30000 },
  }
}

async function lancarDespesa(user, valor, descricao, categoria, quem, pagamentoTipo = 'debito', cartaoId = null) {
  const now = new Date()
  const cc  = user.casal_code || user.id
  const { data: bancos } = await supabase.from('contas_banco').select('*').eq('casal_code', cc)
  const banco = bancos?.find(b => b.id === user.banco_principal_id) || bancos?.[0]

  // Cartão de crédito — aumenta fatura, NÃO debita banco
  if (pagamentoTipo === 'cartao') {
    const cid = cartaoId || CARTAO_PRINCIPAL.id
    const { data: cartao } = await supabase.from('cartoes').select('*').eq('id', cid).maybeSingle()
    const novaFatura = (cartao?.fatura || 0) + valor

    await supabase.from('despesas').insert({
      user_id: user.id, casal_code: cc,
      nome: descricao, valor, categoria: categoria || 'Outros',
      quem: quem || user.papel, tipo: 'variavel', pagamento_tipo: 'cartao',
      cartao_id: cid, cartao_nome: cartao?.nome || CARTAO_PRINCIPAL.nome,
      mes: now.getMonth(), ano: now.getFullYear(),
    })

    await supabase.from('cartoes').update({ fatura: novaFatura }).eq('id', cid)
    return { tipo: 'cartao', cartaoNome: cartao?.nome || CARTAO_PRINCIPAL.nome, novaFatura }
  }

  // Débito/PIX — debita banco imediatamente
  await supabase.from('despesas').insert({
    user_id: user.id, casal_code: cc,
    nome: descricao, valor, categoria: categoria || 'Outros',
    quem: quem || user.papel, tipo: 'variavel', pagamento_tipo: pagamentoTipo,
    banco_id: banco?.id || null, banco_nome: banco?.banco || '',
    mes: now.getMonth(), ano: now.getFullYear(),
  })

  if (banco) {
    const novoSaldo = (banco.saldo || 0) - valor
    await supabase.from('contas_banco').update({ saldo: novoSaldo }).eq('id', banco.id)
    await supabase.from('extrato_banco').insert({
      user_id: user.id, casal_code: cc,
      banco_id: banco.id, banco_nome: banco.banco,
      tipo: 'saida', descricao, categoria, valor,
      saldo_apos: novoSaldo,
      mes: now.getMonth(), ano: now.getFullYear(),
    })
    return { tipo: 'debito', bancoNome: banco.banco, novoSaldo }
  }
  return null
}

async function lancarReceita(user, valor, descricao) {
  const now = new Date()
  const cc  = user.casal_code || user.id
  const { data: bancos } = await supabase.from('contas_banco').select('*').eq('casal_code', cc)
  const banco = bancos?.find(b => b.id === user.banco_principal_id) || bancos?.[0]

  await supabase.from('receitas').insert({
    user_id: user.id, casal_code: cc,
    tipo: 'salario', valor, quem: user.papel,
    mes: now.getMonth(), ano: now.getFullYear(),
  })

  if (banco) {
    const novoSaldo = (banco.saldo || 0) + valor
    await supabase.from('contas_banco').update({ saldo: novoSaldo }).eq('id', banco.id)
    await supabase.from('extrato_banco').insert({
      user_id: user.id, casal_code: cc,
      banco_id: banco.id, banco_nome: banco.banco,
      tipo: 'entrada', descricao: descricao || 'Receita', categoria: 'salario',
      valor, saldo_apos: novoSaldo,
      mes: now.getMonth(), ano: now.getFullYear(),
    })
    return { ...banco, novoSaldo }
  }
  return null
}

async function auditLog(userId, acao, detalhes = {}) {
  try {
    await supabase.from('audit_logs').insert({
      user_id: userId, acao,
      detalhes: JSON.stringify(detalhes),
      origem: 'telegram',
      created_at: new Date().toISOString(),
    })
  } catch { /* silencioso */ }
}

// ── Contexto do bot ───────────────────────────────────
async function salvarContexto(casalCode, tipo, conteudo, dados = {}) {
  try {
    await supabase.from('bot_contextos').insert({
      casal_code: casalCode, tipo, conteudo,
      dados: dados,
    })
  } catch(e) { console.warn('salvarContexto:', e.message) }
}

// ── Marcos de maturidade ─────────────────────────────
const MARCOS = [
  {
    lancamentos: 1,
    msg: `🫘 *Primeiro lançamento!*

Vocês deram o primeiro passo. A IA começa a aprender o perfil de vocês agora.

_Quanto mais lançarem, mais personalizada ela fica._`,
  },
  {
    lancamentos: 10,
    msg: `🌱 *IA evoluiu para Broto!*

Com 10 lançamentos, já consigo identificar suas categorias de gasto preferidas e dar dicas mais personalizadas.

_Continue lançando — em 30 lançamentos reconheço seus padrões semanais._`,
  },
  {
    lancamentos: 30,
    msg: `🌿 *IA evoluiu para Crescendo!*

Com 30 lançamentos, já sei em quais dias da semana vocês costumam gastar mais e em quê.

Agora envio reflexões proativas no momento certo — antes de vocês gastarem.

_Próximo nível em 60 lançamentos: antecipação de comportamentos._`,
  },
  {
    lancamentos: 60,
    msg: `🌳 *IA evoluiu para Florescendo!*

Incrível! 60 lançamentos de histórico. Agora consigo antecipar padrões de comportamento e alertar *antes* do gasto acontecer.

As reflexões ficam cada vez mais precisas e personalizadas para o perfil de vocês.

_Faltam 40 lançamentos para o nível máximo._`,
  },
  {
    lancamentos: 100,
    msg: `🌟 *IA atingiu o nível Parceiro!*

100 lançamentos. Agora sou um parceiro financeiro real do casal.

Conheço seus padrões, antecipo comportamentos, personalizo cada reflexão e análise para o jeito único de vocês lidarem com dinheiro.

_Finanças a dois, sem segredos. Não para controlar — para planejar juntos._ 🌿`,
  },
]

async function verificarMarco(user, chatId) {
  try {
    const cc = user.casal_code
    // Conta total de lançamentos
    const [d, r] = await Promise.all([
      supabase.from('despesas').select('id', { count: 'exact', head: true }).eq('casal_code', cc),
      supabase.from('receitas').select('id', { count: 'exact', head: true }).eq('casal_code', cc),
    ])
    const total = (d.count || 0) + (r.count || 0)

    // Verifica se algum marco foi atingido
    for (const marco of MARCOS) {
      if (total === marco.lancamentos) {
        // Verifica se já enviou esse marco
        const chave = `marco_${user.id}_${marco.lancamentos}`
        if (ctxMap.get(chave)) return
        ctxMap.set(chave, true)

        await sendMessage(chatId, marco.msg)
        await salvarContexto(cc, 'marco', `Marco ${marco.lancamentos} lançamentos`, { lancamentos: marco.lancamentos })
        return
      }
    }
  } catch(e) { console.warn('verificarMarco:', e.message) }
}

async function carregarContexto(casalCode, limite = 20) {
  try {
    const { data } = await supabase.from('bot_contextos')
      .select('tipo, conteudo, dados, created_at')
      .eq('casal_code', casalCode)
      .order('created_at', { ascending: false })
      .limit(limite)
    return data || []
  } catch { return [] }
}

// Verifica se uma dica da mesma categoria já foi enviada recentemente
async function dicaJaEnviada(casalCode, categoria) {
  try {
    const { data } = await supabase.from('bot_contextos')
      .select('dados')
      .eq('casal_code', casalCode)
      .eq('tipo', 'dica')
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
    // Verifica se alguma dica recente é da mesma categoria
    return (data || []).some(d => {
      try {
        const dados = typeof d.dados === 'string' ? JSON.parse(d.dados) : d.dados
        return dados?.categoria === categoria
      } catch { return false }
    })
  } catch { return false }
}

// Busca respostas às reflexões para entender padrão de comportamento
async function carregarPadraoRespostas(casalCode) {
  try {
    const { data } = await supabase.from('reflexoes_respondidas')
      .select('resposta, padrao_id, created_at')
      .eq('casal_code', casalCode)
      .order('created_at', { ascending: false })
      .limit(20)

    const contagem = { sim_guardei: 0, vou_guardar: 0, nao_desta_vez: 0 }
    ;(data || []).forEach(r => { if (contagem[r.resposta] !== undefined) contagem[r.resposta]++ })
    const total = Object.values(contagem).reduce((s, v) => s + v, 0)

    return {
      total,
      pctSim: total > 0 ? Math.round((contagem.sim_guardei / total) * 100) : 0,
      pctNao: total > 0 ? Math.round((contagem.nao_desta_vez / total) * 100) : 0,
      perfil: contagem.sim_guardei > contagem.nao_desta_vez ? 'disciplinado' : 'resistente',
    }
  } catch { return { total: 0, pctSim: 0, pctNao: 0, perfil: 'neutro' } }
}

// Verifica categorias acima da média e sugere meta
async function verificarCategoriaAlta(user, chatId) {
  try {
    const now = new Date()
    const mes = now.getMonth()
    const ano = now.getFullYear()
    const mesAnt = mes === 0 ? 11 : mes - 1
    const anoAnt = mes === 0 ? ano - 1 : ano

    const [atual, anterior] = await Promise.all([
      supabase.from('despesas').select('valor,categoria').eq('casal_code', user.casal_code).eq('mes', mes).eq('ano', ano),
      supabase.from('despesas').select('valor,categoria').eq('casal_code', user.casal_code).eq('mes', mesAnt).eq('ano', anoAnt),
    ])

    if (!atual.data?.length || !anterior.data?.length) return

    // Agrupa por categoria
    const catAtual = {}; (atual.data||[]).forEach(d => { catAtual[d.categoria] = (catAtual[d.categoria]||0) + d.valor })
    const catAnt   = {}; (anterior.data||[]).forEach(d => { catAnt[d.categoria] = (catAnt[d.categoria]||0) + d.valor })

    // Encontra categoria com maior aumento percentual
    let maiorCat = null; let maiorDiff = 0; let maiorPct = 0
    for (const [cat, val] of Object.entries(catAtual)) {
      const ant = catAnt[cat] || 0
      if (ant === 0) continue
      const diff = val - ant
      const pct  = (diff / ant) * 100
      if (diff > 50 && pct > 20 && diff > maiorDiff) {
        maiorDiff = diff; maiorCat = cat; maiorPct = pct
      }
    }

    if (!maiorCat) return

    // Verifica se já avisou hoje
    const chave = `cat_alta_${user.id}_${maiorCat}_${now.toISOString().split('T')[0]}`
    if (ctxMap.get(chave)) return
    ctxMap.set(chave, true)

    // Verifica se já tem meta para essa categoria
    const { data: metaExist } = await supabase.from('metas')
      .select('id').eq('casal_code', user.casal_code)
      .ilike('nome', `%${maiorCat}%`).eq('ativa', true).maybeSingle()

    const valAtual = catAtual[maiorCat]
    const valAnt   = catAnt[maiorCat]

    let msg = `📊 *Alerta de categoria*

`
    msg += `${CAT_ICONS[maiorCat]||'💸'} *${maiorCat}* está +${maiorPct.toFixed(0)}% acima do mês passado
`
    msg += `Mês passado: ${fmt(valAnt)} → Este mês: ${fmt(valAtual)}

`

    if (!metaExist) {
      msg += `Querem criar uma meta de orçamento para ${maiorCat}?
`
      msg += `Sugestão: limitar em *${fmt(Math.round(valAnt * 1.1))}*/mês

`
      msg += `Responda *sim* para criar a meta agora`
      ctxMap.set(`aguardando_meta_${user.id}`, {
        categoria: maiorCat,
        valorSugerido: Math.round(valAnt * 1.1),
        expira: Date.now() + 2 * 60 * 60 * 1000,
      })
    } else {
      msg += `💡 _Vocês já têm uma meta para ${maiorCat}. Verifiquem no app._`
    }

    await sendMessage(chatId, msg)
    await salvarContexto(user.casal_code, 'alerta_categoria', msg, { categoria: maiorCat, diff: maiorDiff })
  } catch(e) { console.warn('verificarCategoriaAlta:', e.message) }
}

// ── Reflexão proativa ─────────────────────────────────
async function analisarPadroesUsuario(userId, cc) {
  try {
    const tresMeses = new Date()
    tresMeses.setMonth(tresMeses.getMonth() - 3)
    const { data: despesas } = await supabase.from('despesas')
      .select('valor,categoria,created_at')
      .eq('casal_code', cc)
      .gte('created_at', tresMeses.toISOString())
    if (!despesas?.length) return

    const grupos = {}
    despesas.forEach(d => {
      const dia = new Date(d.created_at).getDay()
      const key = `${dia}_${d.categoria}`
      if (!grupos[key]) grupos[key] = { dia, categoria: d.categoria, valores: [] }
      grupos[key].valores.push(d.valor)
    })

    for (const p of Object.values(grupos).filter(g => g.valores.length >= 2)) {
      const valorMedio = p.valores.reduce((s, v) => s + v, 0) / p.valores.length
      await supabase.from('padroes_gasto').upsert({
        casal_code: cc, user_id: userId,
        dia_semana: p.dia, categoria: p.categoria,
        valor_medio: Math.round(valorMedio * 100) / 100,
        ocorrencias: p.valores.length,
        ativo: true,
      }, { onConflict: 'casal_code,dia_semana,categoria' })
    }
  } catch(e) { console.warn('analisarPadroes:', e.message) }
}

async function verificarReflexao(user, chatId) {
  try {
    const now  = new Date()
    const hora = now.getHours()
    if (hora < 17 || hora > 21) return // Só entre 17h-21h

    const hoje = now.getDay()
    const mes  = now.getMonth()
    const ano  = now.getFullYear()

    // Analisa padrões
    await analisarPadroesUsuario(user.id, user.casal_code)

    // Busca padrão do dia
    const { data: padroes } = await supabase.from('padroes_gasto')
      .select('*').eq('casal_code', user.casal_code)
      .eq('dia_semana', hoje).eq('ativo', true)
      .gte('ocorrencias', 2)
      .order('valor_medio', { ascending: false }).limit(1)

    if (!padroes?.length) return

    const padrao = padroes[0]

    // Verifica se já enviou hoje
    const chave = `reflexao_${user.id}_${padrao.id}_${now.toISOString().split('T')[0]}`
    if (ctxMap.get(chave)) return
    ctxMap.set(chave, true)

    // Verifica se já respondeu este mês
    const { data: jaRespondeu } = await supabase.from('reflexoes_respondidas')
      .select('id').eq('casal_code', user.casal_code)
      .eq('padrao_id', padrao.id).eq('mes', mes).eq('ano', ano).maybeSingle()
    if (jaRespondeu) return

    // Verifica contrapartida
    const { data: aportes } = await supabase.from('aportes_metas')
      .select('valor').eq('casal_code', user.casal_code).eq('mes', mes).eq('ano', ano)
    const totalAportes = (aportes||[]).reduce((s,a) => s + a.valor, 0)
    const jaInvestiu   = totalAportes >= padrao.valor_medio

    const dia      = DIAS[hoje]
    const valor    = fmt(padrao.valor_medio)
    const projecao = fmt(padrao.valor_medio * 12)
    const icon     = CAT_ICONS[padrao.categoria] || '💸'

    let msg = `🌿 *Reflexão do Éden*\n\n`
    msg += `${icon} Na ${dia} passada vocês gastaram *${valor}* em ${padrao.categoria}.\n\n`

    if (!jaInvestiu) {
      msg += `Antes de repetir, vocês já guardaram pelo menos esse valor na reserva este mês?\n\n`
      msg += `💡 _Repetindo 12x ao ano = ${projecao}_\n\n`
      msg += `Responda:\n✅ *sim* — já guardei\n💰 *guardar* — vou guardar agora\n🙈 *não* — não desta vez`

      // Salva contexto aguardando resposta (válido por 4 horas)
      ctxMap.set(`aguardando_reflexao_${user.id}`, {
        padraoId: padrao.id, mes, ano,
        expira: Date.now() + 4 * 60 * 60 * 1000,
      })
    } else {
      msg += `✅ Vocês já investiram *${fmt(totalAportes)}* este mês.\n`
      msg += `O ${padrao.categoria} de hoje está coberto! Aproveitem com consciência. 🌿`
    }

    await sendMessage(chatId, msg)
  } catch(e) { console.warn('verificarReflexao:', e.message) }
}

// ── Retrospectiva mensal ──────────────────────────────
async function verificarRetrospectiva(user, chatId) {
  try {
    const now = new Date()
    if (now.getDate() !== 1) return

    const mes    = now.getMonth()
    const ano    = now.getFullYear()
    const mesAnt = mes === 0 ? 11 : mes - 1
    const anoAnt = mes === 0 ? ano - 1 : ano

    // Evita enviar 2x no mesmo dia
    const chave = `retro_${user.id}_${mes}_${ano}`
    if (ctxMap.get(chave)) return
    ctxMap.set(chave, true)

    const [dAtual, rAtual, dAnt, rAnt] = await Promise.all([
      supabase.from('despesas').select('valor,categoria').eq('casal_code', user.casal_code).eq('mes', mes).eq('ano', ano),
      supabase.from('receitas').select('valor').eq('casal_code', user.casal_code).eq('mes', mes).eq('ano', ano),
      supabase.from('despesas').select('valor,categoria').eq('casal_code', user.casal_code).eq('mes', mesAnt).eq('ano', anoAnt),
      supabase.from('receitas').select('valor').eq('casal_code', user.casal_code).eq('mes', mesAnt).eq('ano', anoAnt),
    ])

    const totalDesp    = (dAtual.data||[]).reduce((s,d) => s+d.valor, 0)
    const totalRec     = (rAtual.data||[]).reduce((s,r) => s+r.valor, 0)
    const totalDespAnt = (dAnt.data||[]).reduce((s,d) => s+d.valor, 0)
    const totalRecAnt  = (rAnt.data||[]).reduce((s,r) => s+r.valor, 0)
    const saldo        = totalRec - totalDesp
    const saldoAnt     = totalRecAnt - totalDespAnt
    const diff         = saldo - saldoAnt

    // Categoria que mais cresceu
    const catsAtual = {}; (dAtual.data||[]).forEach(d => { catsAtual[d.categoria] = (catsAtual[d.categoria]||0) + d.valor })
    const catsAnt   = {}; (dAnt.data||[]).forEach(d => { catsAnt[d.categoria] = (catsAnt[d.categoria]||0) + d.valor })
    let maiorCat = null, maiorDiff = 0
    for (const [cat, val] of Object.entries(catsAtual)) {
      const d = val - (catsAnt[cat] || 0)
      if (d > maiorDiff) { maiorDiff = d; maiorCat = cat }
    }

    const emoji    = saldo >= 0 ? '✅' : '🔴'
    const tendencia = diff >= 0 ? `↑ melhorou ${fmt(Math.abs(diff))}` : `↓ piorou ${fmt(Math.abs(diff))}`

    let msg = `🌿 *Retrospectiva de ${MESES[mesAnt]}*\n\n`
    msg += `${emoji} Saldo: *${fmt(saldo)}* (${tendencia} vs mês anterior)\n`
    msg += `💰 Receitas: *${fmt(totalRec)}*\n`
    msg += `💸 Despesas: *${fmt(totalDesp)}*\n`
    if (maiorCat) msg += `\n📈 Maior aumento: *${maiorCat}* (+${fmt(maiorDiff)})\n`
    msg += `\n💡 _Como foi o mês para vocês? Algo que querem mudar?_`

    await sendMessage(chatId, msg)
  } catch(e) { console.warn('retrospectiva:', e.message) }
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
/saldo — saldo e bancos
/resumo — resumo do mês
/gastos — últimos lançamentos
/vincular CODIGO — vincular conta
/desvincular — remover vinculação
/ajuda — esta mensagem`

// ── Processador de updates ────────────────────────────
async function processUpdate(update) {
  const msg = update.message || update.edited_message
  if (!msg?.text) return

  const chatId   = msg.chat.id
  const text     = msg.text.trim()
  const fromId   = msg.from.id
  const username = msg.from.username || msg.from.first_name || 'usuário'

  console.log(`[${new Date().toISOString()}] ${fromId} (${username}): ${text}`)

  // Rate limiting
  if (!checkRate(fromId)) {
    await sendMessage(chatId, '⚠️ Muitas mensagens. Aguarde 1 minuto.')
    return
  }

  // ── /start ──
  if (text === '/start' || text.startsWith('/start ')) {
    const user = await getUser(fromId)
    if (user) {
      await sendMessage(chatId, `Olá, *${user.nome}*! 🌿\n\nBem-vindo de volta ao Éden.\n\n${HELP}`)
    } else {
      await sendMessage(chatId,
        `Olá! 🌿 Bem-vindo ao *Éden*!\n\n_Finanças a dois, sem segredos._
_Não para controlar — para planejar juntos._\n\nPara começar, vincule sua conta:\n\n/vincular *seucodigodocasal*\n\nO código está no app em *Configurações → Casal*`
      )
    }
    return
  }

  // ── /ajuda ──
  if (text === '/ajuda' || text === '/help') {
    await sendMessage(chatId, HELP)
    return
  }

  // ── /vincular ──
  if (text.startsWith('/vincular')) {
    const codigo = text.split(' ')[1]?.trim().toLowerCase()
    if (!codigo) {
      await sendMessage(chatId, '🌿 Use: /vincular *seucodigo*\n\nO código está em *Configurações → Casal* no app.')
      return
    }
    const { data: profile } = await supabase.from('profiles')
      .select('*').eq('casal_code', codigo).maybeSingle()
    if (!profile) {
      await sendMessage(chatId, `❌ Código *${codigo}* não encontrado.\n\nVerifique em *Configurações → Casal* no app.`)
      return
    }
    if (profile.telegram_id && profile.telegram_id !== String(fromId)) {
      await sendMessage(chatId, '⚠️ Este código já está vinculado a outro Telegram.\n\nUse /desvincular no outro dispositivo primeiro.')
      return
    }
    await supabase.from('profiles').update({ telegram_id: String(fromId) }).eq('id', profile.id)
    await auditLog(profile.id, 'vincular_telegram', { telegram_id: fromId })
    await sendMessage(chatId, `✅ *Conta vinculada!*\n\nOlá, *${profile.nome}*! 🌿\n\nAgora diga o que gastou:\n_"gastei 50 no mercado"_ 🛒`)
    return
  }

  // ── /desvincular ──
  if (text === '/desvincular') {
    const user = await getUser(fromId)
    if (!user) { await sendMessage(chatId, 'Nenhuma conta vinculada.'); return }
    await supabase.from('profiles').update({ telegram_id: null }).eq('id', user.id)
    await auditLog(user.id, 'desvincular_telegram', { telegram_id: fromId })
    await sendMessage(chatId, '✅ Conta desvinculada. Use /vincular para reconectar.')
    return
  }

  // ── /saldo ──
  if (text === '/saldo') {
    const user = await getUser(fromId)
    if (!user) { await sendMessage(chatId, '⚠️ Use /vincular primeiro.'); return }
    const { saldo, bancos, bancoPrincipal, reserva } = await getResumo(user)
    const pctRes = reserva.meta > 0 ? ((reserva.atual / reserva.meta) * 100).toFixed(0) : 0
    let t = `🌿 *${user.nome}*\n\n📊 Saldo do mês: *${fmt(saldo)}*\n\n🏦 *Contas:*\n`
    bancos.forEach(b => {
      const isPrincipal = b.id === user.banco_principal_id
      t += `  ${isPrincipal ? '⭐' : '•'} ${b.banco}: *${fmt(b.saldo)}*\n`
    })
    t += `\n🛡 Reserva: *${fmt(reserva.atual)}* (${pctRes}%)`
    await sendMessage(chatId, t)
    return
  }

  // ── /resumo ──
  if (text === '/resumo') {
    const user = await getUser(fromId)
    if (!user) { await sendMessage(chatId, '⚠️ Use /vincular primeiro.'); return }
    const { totalRec, totalDesp, saldo } = await getResumo(user)
    const m = new Date().getMonth()
    await sendMessage(chatId,
      `📊 *Resumo de ${MESES[m]}*\n\n💰 Receitas: *${fmt(totalRec)}*\n💸 Gastos: *${fmt(totalDesp)}*\n${saldo >= 0 ? '✅' : '🔴'} Saldo: *${fmt(saldo)}*`
    )
    return
  }

  // ── /gastos ──
  if (text === '/gastos') {
    const user = await getUser(fromId)
    if (!user) { await sendMessage(chatId, '⚠️ Use /vincular primeiro.'); return }
    const now = new Date()
    const { data } = await supabase.from('despesas').select('*')
      .eq('casal_code', user.casal_code)
      .eq('mes', now.getMonth()).eq('ano', now.getFullYear())
      .order('created_at', { ascending: false }).limit(5)
    if (!data?.length) { await sendMessage(chatId, 'Nenhum gasto este mês ainda 😊'); return }
    let t = `💸 *Últimos gastos:*\n\n`
    data.forEach(d => {
      t += `${CAT_ICONS[d.categoria] || '💸'} *${d.nome}* — ${fmt(d.valor)}\n`
    })
    await sendMessage(chatId, t)
    return
  }

  // Ignora outros comandos
  if (text.startsWith('/')) {
    await sendMessage(chatId, `Comando não reconhecido. Use /ajuda`)
    return
  }

  // ── Usuário não vinculado ──
  const user = await getUser(fromId)
  if (!user) {
    await sendMessage(chatId, '⚠️ Conta não vinculada.\n\nUse: /vincular *seucodigo*\n\nO código está no app em *Configurações → Casal*')
    return
  }

  // ── Resposta a forma de pagamento ──
  const ctxPag = ctxMap.get(`pagamento_${fromId}`)
  if (ctxPag && Date.now() < ctxPag.expira) {
    const opcoes = { '1': 'debito', '2': 'cartao', '3': 'pix', '4': 'dinheiro' }
    const pagTipo = opcoes[text.trim()]

    if (pagTipo) {
      ctxMap.delete(`pagamento_${fromId}`)
      const { item } = ctxPag
      const icon = CAT_ICONS[item.categoria] || '💸'

      const resultado = await lancarDespesa(
        user, item.valor, item.descricao, item.categoria, item.quem,
        pagTipo === 'pix' ? 'debito' : pagTipo,
        pagTipo === 'cartao' ? CARTAO_PRINCIPAL.id : null
      )

      let resp = `${icon} *${item.descricao}*
✅ ${fmt(item.valor)} lançado!
📂 ${item.categoria || 'Outros'}
`

      if (pagTipo === 'cartao' && resultado) {
        resp += `
💳 ${resultado.cartaoNome}
📊 Nova fatura: ${fmt(resultado.novaFatura)}
`
        resp += `
💡 _Lançado na fatura — banco não debitado ainda_`
      } else if (resultado?.novoSaldo !== undefined) {
        resp += `
🏦 ${resultado.bancoNome}: ${fmt(resultado.novoSaldo)}`
      } else if (pagTipo === 'dinheiro') {
        resp += `
💵 _Pago em dinheiro — sem impacto no banco_`
      }

      await sendMessage(chatId, resp)
      await auditLog(user.id, 'lancar_despesa', { valor: item.valor, descricao: item.descricao, pagamento: pagTipo })
      await verificarMarco(user, chatId)

      // Evento: primeiro registro via Telegram
      try {
        await supabase.from('eventos_usuario').insert({
          user_id: user.id, casal_code: user.casal_code,
          evento: 'primeiro_telegram', dados: { canal: 'telegram', tipo: pagTipo },
        })
      } catch { /* já registrado */ }

      // Pergunta se foi planejado
      const chavePlan = `planejado_${fromId}`
      ctxMap.set(chavePlan, {
        item, pagTipo, expira: Date.now() + 10 * 60 * 1000,
      })
      await sendMessage(chatId, `Era uma compra planejada?\n\n1️⃣ Sim, estava no plano\n2️⃣ Não, foi impulsiva`)
      return
    } else {
      await sendMessage(chatId, 'Responda com 1, 2, 3 ou 4 para confirmar o pagamento. Ou envie outra mensagem para cancelar.')
      ctxMap.delete(`pagamento_${fromId}`)
    }
  }

  // ── Resposta a compra planejada ou não ──
  const ctxPlan = ctxMap.get(`planejado_${fromId}`)
  if (ctxPlan && Date.now() < ctxPlan.expira && (text.trim() === '1' || text.trim() === '2')) {
    const foiPlanejada = text.trim() === '1'
    ctxMap.delete(`planejado_${fromId}`)
    const { item, pagTipo } = ctxPlan

    // Salva contexto de comportamento
    await salvarContexto(user.casal_code, 'comportamento', foiPlanejada ? 'planejada' : 'impulsiva', {
      categoria: item.categoria, valor: item.valor, descricao: item.descricao,
    })

    // Busca metas e reserva para contexto da dica
    ;(async () => {
      try {
        const jaEnviou = await dicaJaEnviada(user.casal_code, item.categoria)

        const [ctx, padrao, metasData, reservaData] = await Promise.all([
          carregarContexto(user.casal_code, 15),
          carregarPadraoRespostas(user.casal_code),
          supabase.from('metas').select('nome,valor_alvo,valor_atual,atual').eq('casal_code', user.casal_code).eq('ativa', true).limit(3),
          supabase.from('reserva').select('atual,meta').eq('user_id', user.id).maybeSingle(),
        ])

        const metas = metasData.data || []
        const reserva = reservaData.data
        const pctReserva = reserva?.meta > 0 ? Math.round((reserva.atual / reserva.meta) * 100) : 0

        // Contexto de metas para a IA
        const ctxMetas = metas.map(m => {
          const atual = m.valor_atual || m.atual || 0
          const pct = m.valor_alvo > 0 ? Math.round((atual / m.valor_alvo) * 100) : 0
          const falta = m.valor_alvo - atual
          return `${m.nome}: ${pct}% (falta ${fmt(falta)})`
        }).join(', ')

        // Contexto de comportamento impulsivo
        const comprasImpulsivas = ctx.filter(c => c.tipo === 'comportamento' && c.conteudo === 'impulsiva').length
        const totalCompras = ctx.filter(c => c.tipo === 'comportamento').length
        const pctImpulsivo = totalCompras > 0 ? Math.round((comprasImpulsivas / totalCompras) * 100) : 0

        const dicasAnteriores = ctx.filter(c => c.tipo === 'dica').map(c => c.conteudo).slice(0,3).join(' | ')
        const perfilTexto = padrao.perfil === 'disciplinado'
          ? `Casal disciplinado (${padrao.pctSim}% investe nas reflexões)`
          : `Casal em desenvolvimento (${padrao.pctNao}% resistência)`

        const prompt = `Consultor financeiro para casais brasileiros.
Perfil: ${perfilTexto}
Compra: "${item.descricao}" R$${item.valor} em ${item.categoria} via ${pagTipo}
Foi planejada: ${foiPlanejada ? 'SIM' : 'NÃO — foi impulsiva'}
${pctImpulsivo > 0 ? `Histórico: ${pctImpulsivo}% das compras recentes foram impulsivas` : ''}
Reserva de emergência: ${pctReserva}% completa${pctReserva < 50 ? ' (abaixo do ideal)' : ''}
Metas ativas: ${ctxMetas || 'nenhuma cadastrada'}
Objetivo do casal: ${user.objetivo || 'controle'}
${dicasAnteriores ? 'Dicas recentes (NÃO repita): ' + dicasAnteriores : ''}

Regras:
- NÃO mande parar de gastar
- Se reserva < 50%: sugira um pequeno aporte na reserva, de forma gentil
- Se tem metas: mencione quanto falta e quanto por mês para chegar lá
- Se compra impulsiva: acolha sem punir, sugira reflexão
- Se compra planejada: elogie e reforce o comportamento
- Máx 2 frases curtas e diretas. Só a dica, sem título.`

        if (!jaEnviou || !foiPlanejada) {
          const dica = await chamarGroq(prompt)
          if (dica?.trim()) {
            await sendMessage(chatId, `💡 _${dica.trim()}_`)
            await salvarContexto(user.casal_code, 'dica', dica.trim(), { categoria: item.categoria, valor: item.valor, planejada: foiPlanejada })
          }
        }
      } catch(e) { console.warn('dica planejado:', e.message) }
    })()
    return
  }

  // ── Resposta a criação de meta ──
  const ctxMeta = ctxMap.get(`aguardando_meta_${fromId}`)
  if (ctxMeta && Date.now() < ctxMeta.expira && text.toLowerCase().trim() === 'sim') {
    try {
      const now = new Date()
      await supabase.from('metas').insert({
        user_id: user.id, casal_code: user.casal_code,
        nome: `Orçamento ${ctxMeta.categoria}`,
        descricao: `Meta de orçamento criada pelo bot`,
        valor_alvo: ctxMeta.valorSugerido,
        valor_atual: 0, atual: 0,
        categoria: ctxMeta.categoria,
        dono: 'casal', ativa: true, origem: 'bot',
      })
      ctxMap.delete(`aguardando_meta_${fromId}`)
      await sendMessage(chatId, `✅ Meta criada!

🎯 *Orçamento ${ctxMeta.categoria}*
Limite: *${fmt(ctxMeta.valorSugerido)}/mês*

Acompanhe no app em *Metas*. 🌿`)
      await salvarContexto(user.casal_code, 'meta_criada', `Meta ${ctxMeta.categoria}`, { valor: ctxMeta.valorSugerido })
    } catch(e) { await sendMessage(chatId, '❌ Erro ao criar meta: ' + e.message) }
    return
  }

  // ── Resposta a reflexão pendente ──
  const ctxReflexao = ctxMap.get(`aguardando_reflexao_${fromId}`)
  if (ctxReflexao && Date.now() < ctxReflexao.expira) {
    const respostas = {
      'sim': 'sim_guardei', 'já guardei': 'sim_guardei', 'já': 'sim_guardei',
      'guardar': 'vou_guardar', 'vou guardar': 'vou_guardar', 'vou': 'vou_guardar',
      'não': 'nao_desta_vez', 'nao': 'nao_desta_vez', 'não desta vez': 'nao_desta_vez',
    }
    const resposta = respostas[text.toLowerCase().trim()]
    if (resposta) {
      await supabase.from('reflexoes_respondidas').insert({
        casal_code: user.casal_code, user_id: user.id,
        padrao_id: ctxReflexao.padraoId, resposta,
        mes: ctxReflexao.mes, ano: ctxReflexao.ano,
      })
      ctxMap.delete(`aguardando_reflexao_${fromId}`)
      const msgs = {
        'sim_guardei':  '🌿 Parabéns! Vocês estão praticando a educação financeira de verdade.',
        'vou_guardar':  '💰 Ótima decisão! Abram o app → Metas e façam o aporte agora.',
        'nao_desta_vez': '🌱 Tudo bem! A consciência já é o primeiro passo do jardim.',
      }
      await sendMessage(chatId, msgs[resposta])
      await auditLog(user.id, 'reflexao_respondida', { resposta, padrao_id: ctxReflexao.padraoId })
      return
    }
  }

  // ── Verificações proativas ──
  await verificarRetrospectiva(user, chatId)
  await verificarReflexao(user, chatId)

  // ── Mensagem livre — interpreta com IA ──
  await sendAction(chatId, 'typing')

  try {
    const item = await interpretarMensagem(text)
    console.log(`Interpretado: ${JSON.stringify(item)}`)

    if (item.tipo === 'saldo' || item.tipo === 'resumo') {
      const { totalRec, totalDesp, saldo } = await getResumo(user)
      await sendMessage(chatId,
        `📊 *Seu mês:*\n💰 Receitas: ${fmt(totalRec)}\n💸 Gastos: ${fmt(totalDesp)}\n${saldo >= 0 ? '✅' : '🔴'} Saldo: *${fmt(saldo)}*`
      )
      return
    }

    if (item.tipo === 'ajuda') { await sendMessage(chatId, HELP); return }

    if (item.tipo === 'despesa' && item.valor && item.valor > 0) {
      // Pergunta forma de pagamento
      const chavePag = `pagamento_${fromId}`
      ctxMap.set(chavePag, {
        item, expira: Date.now() + 5 * 60 * 1000,
      })
      const icon = CAT_ICONS[item.categoria] || '💸'
      const msg = `${icon} *${item.descricao || text}*\n💰 ${fmt(item.valor)} · ${item.categoria || 'Outros'}\n\nComo foi pago?\n\n1️⃣ Débito (debita banco agora)\n2️⃣ Cartão Inter (vai para a fatura)\n3️⃣ PIX (debita banco agora)\n4️⃣ Dinheiro (não afeta banco)`
      await sendMessage(chatId, msg)
      return
    }

    if (false) { // placeholder removido
      const banco = null
      // Dica contextualizada em background
      ;(async () => {
        try {
          const jaEnviou = await dicaJaEnviada(user.casal_code, item.categoria)
          if (jaEnviou) return
          const [ctx, padrao] = await Promise.all([
            carregarContexto(user.casal_code, 10),
            carregarPadraoRespostas(user.casal_code),
          ])
          const dicasAnteriores = ctx.filter(c => c.tipo === 'dica').map(c => c.conteudo).slice(0,3).join(' | ')
          const perfilTexto = 'Casal em desenvolvimento financeiro'
          const prompt = ''
          const dica = await chamarGroq(prompt)
          if (dica?.trim()) {
            await sendMessage(chatId, `💡 _${dica.trim()}_`)
            await salvarContexto(user.casal_code, 'dica', dica.trim(), { categoria: item.categoria, valor: item.valor })
          }
        } catch(e) { console.warn('dica:', e.message) }
      })()

      await sendMessage(chatId, resp)
      await auditLog(user.id, 'lancar_despesa', { valor: item.valor, descricao: item.descricao })
      await verificarMarco(user, chatId)
      return
    }

    if (item.tipo === 'receita' && item.valor && item.valor > 0) {
      const banco = await lancarReceita(user, item.valor, item.descricao)
      let resp = `💰 *${item.descricao || 'Receita'}*\n✅ ${fmt(item.valor)} registrado!\n`
      if (banco) resp += `\n🏦 ${banco.banco}: ${fmt(banco.novoSaldo)}`
      await sendMessage(chatId, resp)
      await auditLog(user.id, 'lancar_receita', { valor: item.valor })
      await verificarMarco(user, chatId)
      return
    }

    await sendMessage(chatId,
      `Não entendi 😅\n\nTente:\n"gastei *45* no mercado"\n"recebi *8500* salário"\n\n/ajuda`
    )
  } catch (err) {
    console.error('Erro ao processar:', err)
    await sendMessage(chatId, '❌ Erro interno. Tente novamente em instantes.')
  }
}

// ── Servidor HTTP ─────────────────────────────────────

// ── Verificação noturna — dia sem gasto ──────────────
async function verificarDiaSemGasto() {
  try {
    const now = new Date()
    const hora = now.getHours()

    // Só roda entre 21h e 23h
    if (hora < 21 || hora > 23) return

    // Busca todos os usuários ativos (com telegram_id)
    const { data: usuarios } = await supabase
      .from('profiles')
      .select('id, nome, casal_code, telegram_id, objetivo')
      .not('telegram_id', 'is', null)

    if (!usuarios?.length) return

    // Agrupa por casal para não duplicar
    const casaisVistos = new Set()

    for (const user of usuarios) {
      if (!user.casal_code || casaisVistos.has(user.casal_code)) continue
      casaisVistos.add(user.casal_code)

      const chatId = user.telegram_id
      if (!chatId) continue

      // Verifica se já enviou mensagem hoje para esse casal
      const chaveHoje = `dia_sem_gasto_${user.casal_code}_${now.toISOString().split('T')[0]}`
      if (ctxMap.get(chaveHoje)) continue

      const mes = now.getMonth()
      const ano = now.getFullYear()
      const hoje = now.getDate()

      // Gastos de hoje
      const { data: gastosHoje } = await supabase
        .from('despesas')
        .select('valor')
        .eq('casal_code', user.casal_code)
        .eq('mes', mes)
        .eq('ano', ano)
        .gte('created_at', new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString())

      const totalHoje = (gastosHoje || []).reduce((s, d) => s + d.valor, 0)

      // Média diária dos últimos 30 dias
      const { data: gastosUltimos30 } = await supabase
        .from('despesas')
        .select('valor')
        .eq('casal_code', user.casal_code)
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())

      const totalUltimos30 = (gastosUltimos30 || []).reduce((s, d) => s + d.valor, 0)
      const mediaDiaria = totalUltimos30 / 30

      // Dias consecutivos sem gasto
      let diasSemGasto = 0
      for (let i = 1; i <= 7; i++) {
        const dia = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
        const { data: gastosDia } = await supabase
          .from('despesas')
          .select('id', { count: 'exact', head: true })
          .eq('casal_code', user.casal_code)
          .gte('created_at', new Date(dia.getFullYear(), dia.getMonth(), dia.getDate()).toISOString())
          .lt('created_at', new Date(dia.getFullYear(), dia.getMonth(), dia.getDate() + 1).toISOString())
        if ((gastosDia?.length || 0) === 0) diasSemGasto++
        else break
      }

      let msg = null

      // Cenário 1 — Dia sem gasto
      if (totalHoje === 0 && mediaDiaria > 0) {
        const economizado = Math.round(mediaDiaria)
        msg = `🌿 *Dia sem gastos!*

`
        msg += `A média diária de vocês é ${fmt(economizado)}.
`

        if (diasSemGasto >= 2) {
          msg += `
🏆 *${diasSemGasto + 1} dias consecutivos sem gastar!*
`
          if (diasSemGasto >= 3) {
            msg += `Querem tentar chegar a ${diasSemGasto + 2} dias? 💪
`
          }
        }

        // Sugere aporte na reserva
        const { data: reserva } = await supabase
          .from('reserva')
          .select('atual, meta')
          .eq('user_id', user.id)
          .maybeSingle()

        if (reserva && reserva.atual < reserva.meta) {
          const pct = Math.round((reserva.atual / reserva.meta) * 100)
          const sugestao = Math.min(Math.round(economizado * 0.5), reserva.meta - reserva.atual)
          msg += `
🛡 Sua reserva está em ${pct}%. `
          msg += `Que tal guardar ${fmt(sugestao)} hoje?
`
          msg += `_Pequenos aportes constroem jardins sólidos._`
        } else {
          msg += `
_Cada dia sem gasto é uma semente plantada no jardim._ 🌱`
        }
      }

      // Cenário 2 — Gasto muito abaixo da média (menos de 30%)
      else if (totalHoje > 0 && mediaDiaria > 0 && totalHoje < mediaDiaria * 0.3) {
        const economia = Math.round(mediaDiaria - totalHoje)
        msg = `✨ *Dia econômico!*

`
        msg += `Gastaram ${fmt(totalHoje)} hoje — ${Math.round((totalHoje/mediaDiaria)*100)}% da média diária.
`
        msg += `Uma diferença de ${fmt(economia)} em relação ao dia típico. 🌿`
      }

      if (msg) {
        ctxMap.set(chaveHoje, true)
        await sendMessage(chatId, msg)
        await salvarContexto(user.casal_code, 'nudge_dia', msg, {
          totalHoje, mediaDiaria: Math.round(mediaDiaria), diasSemGasto
        })
      }
    }
  } catch(e) { console.warn('verificarDiaSemGasto:', e.message) }
}

const server = require('http').createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/webhook') {
    let body = ''
    req.on('data', c => body += c)
    req.on('end', async () => {
      try { await processUpdate(JSON.parse(body)) } catch (e) { console.error('Parse error:', e.message) }
      res.writeHead(200); res.end('OK')
    })
    return
  }
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({
    status: 'ok', bot: 'Éden',
    tagline: 'Finanças a dois, sem segredos.',
    ts: new Date().toISOString(),
  }))
})

// Verificação noturna a cada hora
setInterval(async () => {
  try { await verificarDiaSemGasto() } catch(e) { console.warn('cron:', e.message) }
}, 60 * 60 * 1000) // a cada 1 hora

server.listen(PORT, async () => {
  console.log(`🌿 Éden Bot na porta ${PORT}`)
  const domain = process.env.RAILWAY_PUBLIC_DOMAIN || process.env.RAILWAY_STATIC_URL
  if (domain) {
    const webhookUrl = `https://${domain}/webhook`
    console.log(`📡 Registrando webhook: ${webhookUrl}`)
    await setWebhook(webhookUrl)
  } else {
    console.log('⚠️  RAILWAY_PUBLIC_DOMAIN não encontrado')
  }
  console.log('🌿 Bot pronto! Finanças a dois, sem segredos.')
})
