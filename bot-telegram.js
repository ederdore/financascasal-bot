// bot-telegram.js — FinançasCasal Bot (webhook mode)
// Usa webhook em vez de polling — funciona perfeitamente no Railway
//
// ── CONFIGURAÇÃO — preencha aqui ─────────────────────────
const TELEGRAM_TOKEN = '8710272845:AAFCB8CAT2K3eHhIh7dJsyx-1VxgZCfEIs8';
const SUPABASE_URL   = 'https://cpombcvppitlgynqzhsr.supabase.co';
const SUPABASE_ANON  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwb21iY3ZwcGl0bGd5bnF6aHNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3MzEwMzYsImV4cCI6MjA5MjMwNzAzNn0.qb7WC2lGELaK5C8Ga09Bhs3tHDL04sW2SeY_SFMoZ1A';
const GROQ_API_KEY   = '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';

const http = require('http');
const https = require('https');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);
const PORT = process.env.PORT || 3000;

const CAT_ICONS = {
  Alimentação:'🛒', Moradia:'🏠', Transporte:'🚗', Saúde:'💊',
  Lazer:'🎉', Educação:'📚', Outros:'💸',
};

function fmt(n) {
  return 'R$ ' + Number(n||0).toLocaleString('pt-BR', { minimumFractionDigits:2, maximumFractionDigits:2 });
}

// ── Envia mensagem via Telegram API ──────────────────────
function sendMessage(chatId, text, extra = {}) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown', ...extra });
    const options = {
      hostname: 'api.telegram.org',
      path: `/bot${TELEGRAM_TOKEN}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    };
    const req = https.request(options, (res) => {
      res.on('data', () => {});
      res.on('end', resolve);
    });
    req.on('error', (e) => { console.error('sendMessage error:', e.message); resolve(); });
    req.write(body);
    req.end();
  });
}

// ── Registra webhook ──────────────────────────────────────
function setWebhook(url) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ url });
    const options = {
      hostname: 'api.telegram.org',
      path: `/bot${TELEGRAM_TOKEN}/setWebhook`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => { console.log('Webhook:', data); resolve(); });
    });
    req.on('error', (e) => { console.error('setWebhook error:', e.message); resolve(); });
    req.write(body);
    req.end();
  });
}

// ── Chama Groq ────────────────────────────────────────────
function chamarGroq(prompt) {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 200,
      temperature: 0.1,
      messages: [{ role: 'user', content: prompt }],
    });
    const options = {
      hostname: 'api.groq.com',
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data).choices?.[0]?.message?.content || '{}'); }
        catch { resolve('{}'); }
      });
    });
    req.on('error', () => resolve('{}'));
    req.write(body);
    req.end();
  });
}

async function interpretarMensagem(texto) {
  const prompt = `Usuário de app financeiro enviou: "${texto}"
Responda APENAS em JSON válido sem markdown:
{"tipo":"despesa"|"receita"|"saldo"|"ajuda"|"desconhecido","valor":número|null,"descricao":"texto"|null,"categoria":"Alimentação"|"Moradia"|"Transporte"|"Saúde"|"Lazer"|"Educação"|"Outros"|null,"quem":"eu"|"ela"|"casal"|null}
Exemplos:
"gastei 45 no mercado"->{"tipo":"despesa","valor":45,"descricao":"Supermercado","categoria":"Alimentação","quem":"eu"}
"paguei 120 gasolina ela"->{"tipo":"despesa","valor":120,"descricao":"Gasolina","categoria":"Transporte","quem":"ela"}
"jantar casal 180"->{"tipo":"despesa","valor":180,"descricao":"Jantar","categoria":"Alimentação","quem":"casal"}
"recebi salário 8500"->{"tipo":"receita","valor":8500,"descricao":"Salário","categoria":null,"quem":"eu"}
"quanto tenho"->{"tipo":"saldo","valor":null,"descricao":null,"categoria":null,"quem":null}`;
  try {
    const raw = await chamarGroq(prompt);
    return JSON.parse(raw.replace(/```json|```/g, '').trim());
  } catch { return { tipo: 'desconhecido' }; }
}

async function getUser(telegramId) {
  const { data } = await supabase.from('profiles').select('*')
    .eq('telegram_id', String(telegramId)).maybeSingle();
  return data;
}

async function getResumo(user) {
  const now = new Date();
  const [{ data: desp }, { data: rec }, { data: bancos }, reservaRes] = await Promise.all([
    supabase.from('despesas').select('valor,quem').eq('casal_code', user.casal_code).eq('mes', now.getMonth()).eq('ano', now.getFullYear()),
    supabase.from('receitas').select('valor,quem').eq('casal_code', user.casal_code).eq('mes', now.getMonth()).eq('ano', now.getFullYear()),
    supabase.from('contas_banco').select('banco,saldo').eq('casal_code', user.casal_code),
    supabase.from('reserva').select('atual,meta').eq('user_id', user.id).maybeSingle(),
  ]);
  const totalRec = (rec||[]).filter(r => r.quem === user.papel).reduce((s,r) => s+r.valor, 0);
  const totalDesp = (desp||[]).filter(d => d.quem === user.papel || d.quem === 'casal')
    .reduce((s,d) => s+(d.quem==='casal'?d.valor/2:d.valor), 0);
  return {
    totalRec, totalDesp, saldo: totalRec - totalDesp,
    bancos: bancos||[],
    saldoBancos: (bancos||[]).reduce((s,b) => s+b.saldo, 0),
    reserva: reservaRes?.data || { atual:0, meta:30000 },
  };
}

async function lancarDespesa(user, valor, descricao, categoria, quem) {
  const now = new Date();
  const { data: bancos } = await supabase.from('contas_banco').select('*').eq('casal_code', user.casal_code);
  const banco = bancos?.find(b => b.id === user.banco_principal_id) || bancos?.[0];
  await supabase.from('despesas').insert({
    user_id: user.id, casal_code: user.casal_code,
    nome: descricao, valor, categoria: categoria||'Outros',
    quem: quem||user.papel, tipo: 'variavel', pagamento_tipo: 'debito',
    banco_id: banco?.id||null, banco_nome: banco?.banco||'',
    mes: now.getMonth(), ano: now.getFullYear(),
  });
  if (banco) {
    const novoSaldo = (banco.saldo||0) - valor;
    await supabase.from('contas_banco').update({ saldo: novoSaldo }).eq('id', banco.id);
    await supabase.from('extrato_banco').insert({
      user_id: user.id, casal_code: user.casal_code,
      banco_id: banco.id, banco_nome: banco.banco,
      tipo: 'saida', descricao, valor, saldo_apos: novoSaldo,
      mes: now.getMonth(), ano: now.getFullYear(),
    });
    return { ...banco, novoSaldo };
  }
  return null;
}

async function lancarReceita(user, valor, descricao) {
  const now = new Date();
  const { data: bancos } = await supabase.from('contas_banco').select('*').eq('casal_code', user.casal_code);
  const banco = bancos?.find(b => b.id === user.banco_principal_id) || bancos?.[0];
  await supabase.from('receitas').insert({
    user_id: user.id, casal_code: user.casal_code,
    tipo: 'salario', valor, quem: user.papel,
    mes: now.getMonth(), ano: now.getFullYear(),
  });
  if (banco) {
    const novoSaldo = (banco.saldo||0) + valor;
    await supabase.from('contas_banco').update({ saldo: novoSaldo }).eq('id', banco.id);
    await supabase.from('extrato_banco').insert({
      user_id: user.id, casal_code: user.casal_code,
      banco_id: banco.id, banco_nome: banco.banco,
      tipo: 'entrada', descricao: descricao||'Receita', valor, saldo_apos: novoSaldo,
      mes: now.getMonth(), ano: now.getFullYear(),
    });
    return { ...banco, novoSaldo };
  }
  return null;
}

const HELP = `💑 *FinançasCasal Bot*

Diga naturalmente:
💸 "gastei 45 no mercado"
💸 "paguei 200 gasolina ela"
💸 "jantar casal 180"
💰 "recebi salário 8500"
📊 "quanto tenho?"

Comandos:
/saldo — saldo e bancos
/resumo — resumo do mês  
/gastos — últimos gastos
/vincular CODIGO — vincular conta
/ajuda — esta mensagem`;

// ── Processa update do Telegram ───────────────────────────
async function processUpdate(update) {
  const msg = update.message || update.edited_message;
  if (!msg || !msg.text) return;

  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const fromId = msg.from.id;

  console.log(`Mensagem de ${fromId}: ${text}`);

  // /start
  if (text === '/start' || text.startsWith('/start ')) {
    const user = await getUser(fromId);
    if (user) {
      await sendMessage(chatId, `Olá, *${user.nome}*! 👋\n\nDiga o que gastou!\n\n${HELP}`);
    } else {
      await sendMessage(chatId, `Olá! 👋\n\nPara começar vincule sua conta:\n\n/vincular *seucodigodocasal*\n\nO código está no app em *Perfil → Código do casal*`);
    }
    return;
  }

  // /ajuda
  if (text === '/ajuda' || text.startsWith('/ajuda ')) {
    await sendMessage(chatId, HELP);
    return;
  }

  // /vincular
  if (text.startsWith('/vincular')) {
    const parts = text.split(' ');
    const codigo = parts[1]?.trim().toLowerCase();
    if (!codigo) {
      await sendMessage(chatId, 'Use: /vincular *seucodigo*\n\nO código está no app em Perfil.');
      return;
    }
    const { data: profile } = await supabase.from('profiles').select('*').eq('casal_code', codigo).maybeSingle();
    if (!profile) {
      await sendMessage(chatId, `❌ Código *${codigo}* não encontrado.\n\nVerifique no app em *Perfil → Código do casal*.`);
      return;
    }
    await supabase.from('profiles').update({ telegram_id: String(fromId) }).eq('id', profile.id);
    await sendMessage(chatId, `✅ Conta vinculada!\n\nOlá, *${profile.nome}*\\! Agora diga o que gastou.\n\nEx: "gastei 50 no mercado" 🛒`);
    return;
  }

  // /saldo
  if (text === '/saldo' || text.startsWith('/saldo ')) {
    const user = await getUser(fromId);
    if (!user) { await sendMessage(chatId, '⚠️ Use /vincular primeiro.'); return; }
    const { saldo, bancos, saldoBancos, reserva } = await getResumo(user);
    const pct = reserva.meta > 0 ? ((reserva.atual/reserva.meta)*100).toFixed(0) : 0;
    let t = `💑 *Saldo — ${user.nome}*\n\n📊 Este mês: *${fmt(saldo)}*\n\n🏦 *Contas:*\n`;
    bancos.forEach(b => { t += `  ${b.banco}: *${fmt(b.saldo)}*\n`; });
    t += `  Total: *${fmt(saldoBancos)}*\n\n🛡 Reserva: *${fmt(reserva.atual)}* (${pct}%)`;
    await sendMessage(chatId, t);
    return;
  }

  // /resumo
  if (text === '/resumo' || text.startsWith('/resumo ')) {
    const user = await getUser(fromId);
    if (!user) { await sendMessage(chatId, '⚠️ Use /vincular primeiro.'); return; }
    const { totalRec, totalDesp, saldo } = await getResumo(user);
    const now = new Date();
    const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    await sendMessage(chatId, `📊 *Resumo de ${meses[now.getMonth()]}*\n\n💰 Receitas: *${fmt(totalRec)}*\n💸 Gastos: *${fmt(totalDesp)}*\n${saldo>=0?'✅':'🔴'} Saldo: *${fmt(saldo)}*`);
    return;
  }

  // /gastos
  if (text === '/gastos' || text.startsWith('/gastos ')) {
    const user = await getUser(fromId);
    if (!user) { await sendMessage(chatId, '⚠️ Use /vincular primeiro.'); return; }
    const now = new Date();
    const { data: desp } = await supabase.from('despesas').select('*')
      .eq('casal_code', user.casal_code)
      .eq('mes', now.getMonth()).eq('ano', now.getFullYear())
      .order('created_at', { ascending: false }).limit(5);
    if (!desp || desp.length === 0) { await sendMessage(chatId, 'Nenhum gasto este mês ainda. 😊'); return; }
    let t = `💸 *Últimos gastos:*\n\n`;
    desp.forEach(d => { t += `${CAT_ICONS[d.categoria]||'💸'} *${d.nome}* — ${fmt(d.valor)}\n   ${d.categoria}\n\n`; });
    await sendMessage(chatId, t);
    return;
  }

  // Ignora outros comandos
  if (text.startsWith('/')) return;

  // Mensagem livre — interpreta com IA
  const user = await getUser(fromId);
  if (!user) {
    await sendMessage(chatId, '⚠️ Conta não vinculada.\n\nUse: /vincular *seucodigo*');
    return;
  }

  try {
    const item = await interpretarMensagem(text);
    console.log('Interpretado:', JSON.stringify(item));

    if (item.tipo === 'saldo' || item.tipo === 'resumo') {
      const { totalRec, totalDesp, saldo } = await getResumo(user);
      await sendMessage(chatId, `📊 *Seu mês:*\n💰 Receitas: ${fmt(totalRec)}\n💸 Gastos: ${fmt(totalDesp)}\n${saldo>=0?'✅':'🔴'} Saldo: *${fmt(saldo)}*`);
      return;
    }
    if (item.tipo === 'ajuda') { await sendMessage(chatId, HELP); return; }

    if (item.tipo === 'despesa' && item.valor) {
      const banco = await lancarDespesa(user, item.valor, item.descricao||text, item.categoria, item.quem);
      const icon = CAT_ICONS[item.categoria] || '💸';
      let resp = `${icon} *${item.descricao||text}*\n✅ *${fmt(item.valor)}* lançado\\!\n`;
      if (item.categoria) resp += `📂 ${item.categoria}\n`;
      if (item.quem === 'casal') resp += `👫 Casal \\(50/50\\)\n`;
      if (item.quem === 'ela') resp += `👤 Ela\n`;
      if (banco) resp += `\n🏦 ${banco.banco}: ${fmt(banco.novoSaldo)}`;
      await sendMessage(chatId, resp);
      return;
    }

    if (item.tipo === 'receita' && item.valor) {
      const banco = await lancarReceita(user, item.valor, item.descricao);
      let resp = `💰 *${item.descricao||'Receita'}*\n✅ *${fmt(item.valor)}* registrado\\!\n`;
      if (banco) resp += `\n🏦 ${banco.banco}: ${fmt(banco.novoSaldo)}`;
      await sendMessage(chatId, resp);
      return;
    }

    await sendMessage(chatId, `Não entendi 😅\n\nTente:\n"gastei *45* no mercado"\n"paguei *120* gasolina"\n\n/ajuda`);

  } catch (err) {
    console.error('Erro ao processar:', err);
    await sendMessage(chatId, '❌ Erro ao processar. Tente novamente.');
  }
}

// ── Servidor HTTP (webhook) ───────────────────────────────
const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/webhook') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const update = JSON.parse(body);
        await processUpdate(update);
      } catch (e) {
        console.error('Erro ao processar update:', e.message);
      }
      res.writeHead(200);
      res.end('OK');
    });
    return;
  }

  // Health check
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok', bot: 'FinançasCasal' }));
});

server.listen(PORT, async () => {
  console.log(`🌐 Servidor rodando na porta ${PORT}`);

  // Registra webhook automaticamente usando a URL do Railway
  const railwayUrl = process.env.RAILWAY_STATIC_URL || process.env.RAILWAY_PUBLIC_DOMAIN;
  if (railwayUrl) {
    const webhookUrl = `https://${railwayUrl}/webhook`;
    console.log(`📡 Registrando webhook: ${webhookUrl}`);
    await setWebhook(webhookUrl);
  } else {
    console.log('⚠️ RAILWAY_PUBLIC_DOMAIN não encontrado. Configure o webhook manualmente.');
    console.log(`📡 URL do webhook: https://SEU-PROJETO.railway.app/webhook`);
  }

  console.log('🤖 Bot FinançasCasal pronto!');
});
