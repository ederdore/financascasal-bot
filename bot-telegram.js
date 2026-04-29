// bot-telegram.js — FinançasCasal Bot (versão simplificada)
// Usa apenas https nativo do Node — sem node-fetch
//
// Variáveis: preencha as 4 abaixo
// Deploy: Railway.app → New Project → Deploy from GitHub

const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');

// ── CONFIGURAÇÃO — preencha aqui ─────────────────────────
const TELEGRAM_TOKEN = '8710272845:AAFCB8CAT2K3eHhIh7dJsyx-1VxgZCfEIs8';
const SUPABASE_URL   = 'https://cpombcvppitlgynqzhsr.supabase.co';
const SUPABASE_ANON  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwb21iY3ZwcGl0bGd5bnF6aHNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3MzEwMzYsImV4cCI6MjA5MjMwNzAzNn0.qb7WC2lGELaK5C8Ga09Bhs3tHDL04sW2SeY_SFMoZ1A';
const GROQ_API_KEY   = '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';

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

const CAT_ICONS = {
  Alimentação:'🛒', Moradia:'🏠', Transporte:'🚗', Saúde:'💊',
  Lazer:'🎉', Educação:'📚', Outros:'💸',
};

function fmt(n) {
  return 'R$ ' + Number(n||0).toLocaleString('pt-BR', { minimumFractionDigits:2, maximumFractionDigits:2 });
}

// Chama Groq usando https nativo (sem node-fetch)
function chamarGroq(prompt) {
  return new Promise((resolve) => {
    const https = require('https');
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
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.choices?.[0]?.message?.content || '{}');
        } catch { resolve('{}'); }
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
  const mes = now.getMonth();
  const ano = now.getFullYear();
  const [{ data: desp }, { data: rec }, { data: bancos }, reservaRes] = await Promise.all([
    supabase.from('despesas').select('valor,quem').eq('casal_code', user.casal_code).eq('mes', mes).eq('ano', ano),
    supabase.from('receitas').select('valor,quem').eq('casal_code', user.casal_code).eq('mes', mes).eq('ano', ano),
    supabase.from('contas_banco').select('banco,saldo,moeda').eq('casal_code', user.casal_code),
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
📊 "quanto tenho?" ou "resumo"

Comandos:
/saldo — saldo e bancos
/resumo — resumo do mês
/gastos — últimos gastos
/vincular CODIGO — vincular conta
/ajuda — esta mensagem`;

// ── COMANDOS ──────────────────────────────────────────────

bot.onText(/\/start/, async (msg) => {
  console.log('Comando /start de', msg.from.id);
  const user = await getUser(msg.from.id);
  if (user) {
    bot.sendMessage(msg.chat.id, `Olá, *${user.nome}*! 👋\n\nDiga o que gastou!\n${HELP}`, { parse_mode: 'Markdown' });
  } else {
    bot.sendMessage(msg.chat.id,
      `Olá! 👋\n\nPara começar vincule sua conta:\n\n/vincular *seucodigodocasal*\n\nO código está no app em *Perfil → Código do casal*`,
      { parse_mode: 'Markdown' }
    );
  }
});

bot.onText(/\/ajuda/, (msg) => {
  bot.sendMessage(msg.chat.id, HELP, { parse_mode: 'Markdown' });
});

bot.onText(/\/vincular(?:\s+(.+))?/, async (msg, match) => {
  console.log('Comando /vincular de', msg.from.id, 'código:', match?.[1]);
  const codigo = match?.[1]?.trim().toLowerCase();
  if (!codigo) {
    bot.sendMessage(msg.chat.id, 'Use: /vincular *seucodigo*\n\nO código está no app em Perfil.', { parse_mode: 'Markdown' });
    return;
  }
  const { data: profile } = await supabase.from('profiles').select('*').eq('casal_code', codigo).maybeSingle();
  if (!profile) {
    bot.sendMessage(msg.chat.id, `❌ Código *${codigo}* não encontrado.\n\nVerifique no app em *Perfil → Código do casal*.`, { parse_mode: 'Markdown' });
    return;
  }
  await supabase.from('profiles').update({ telegram_id: String(msg.from.id) }).eq('id', profile.id);
  bot.sendMessage(msg.chat.id, `✅ Conta vinculada!\n\nOlá, *${profile.nome}*! Agora diga o que gastou.\n\nEx: "gastei 50 no mercado" 🛒`, { parse_mode: 'Markdown' });
});

bot.onText(/\/saldo/, async (msg) => {
  const user = await getUser(msg.from.id);
  if (!user) { bot.sendMessage(msg.chat.id, '⚠️ Use /vincular primeiro.'); return; }
  const { saldo, bancos, saldoBancos, reserva } = await getResumo(user);
  const pct = reserva.meta > 0 ? ((reserva.atual/reserva.meta)*100).toFixed(0) : 0;
  let text = `💑 *Saldo — ${user.nome}*\n\n📊 Este mês: *${fmt(saldo)}*\n\n🏦 *Contas:*\n`;
  bancos.forEach(b => { text += `  ${b.banco}: *${fmt(b.saldo)}*\n`; });
  text += `  Total: *${fmt(saldoBancos)}*\n\n🛡 Reserva: *${fmt(reserva.atual)}* (${pct}%)`;
  bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
});

bot.onText(/\/resumo/, async (msg) => {
  const user = await getUser(msg.from.id);
  if (!user) { bot.sendMessage(msg.chat.id, '⚠️ Use /vincular primeiro.'); return; }
  const { totalRec, totalDesp, saldo } = await getResumo(user);
  const now = new Date();
  const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  let text = `📊 *Resumo de ${meses[now.getMonth()]}*\n\n`;
  text += `💰 Receitas: *${fmt(totalRec)}*\n`;
  text += `💸 Gastos: *${fmt(totalDesp)}*\n`;
  text += `${saldo >= 0 ? '✅' : '🔴'} Saldo: *${fmt(saldo)}*`;
  bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
});

bot.onText(/\/gastos/, async (msg) => {
  const user = await getUser(msg.from.id);
  if (!user) { bot.sendMessage(msg.chat.id, '⚠️ Use /vincular primeiro.'); return; }
  const now = new Date();
  const { data: desp } = await supabase.from('despesas').select('*')
    .eq('casal_code', user.casal_code)
    .eq('mes', now.getMonth()).eq('ano', now.getFullYear())
    .order('created_at', { ascending: false }).limit(5);
  if (!desp || desp.length === 0) { bot.sendMessage(msg.chat.id, 'Nenhum gasto este mês ainda. 😊'); return; }
  let text = `💸 *Últimos gastos:*\n\n`;
  desp.forEach(d => {
    text += `${CAT_ICONS[d.categoria]||'💸'} *${d.nome}* — ${fmt(d.valor)}\n`;
    text += `   ${d.categoria}${d.quem==='casal'?' · Casal':''}\n\n`;
  });
  bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
});

// ── MENSAGEM LIVRE ────────────────────────────────────────

bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;

  console.log('Mensagem de', msg.from.id, ':', msg.text);

  const user = await getUser(msg.from.id);
  if (!user) {
    bot.sendMessage(msg.chat.id,
      '⚠️ Conta não vinculada.\n\nUse: /vincular *seucodigo*',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  bot.sendChatAction(msg.chat.id, 'typing');

  try {
    const item = await interpretarMensagem(msg.text);
    console.log('Interpretado:', JSON.stringify(item));

    if (item.tipo === 'saldo' || item.tipo === 'resumo') {
      const { totalRec, totalDesp, saldo } = await getResumo(user);
      bot.sendMessage(msg.chat.id,
        `📊 *Seu mês:*\n💰 Receitas: ${fmt(totalRec)}\n💸 Gastos: ${fmt(totalDesp)}\n${saldo>=0?'✅':'🔴'} Saldo: *${fmt(saldo)}*`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    if (item.tipo === 'ajuda') {
      bot.sendMessage(msg.chat.id, HELP, { parse_mode: 'Markdown' });
      return;
    }

    if (item.tipo === 'despesa' && item.valor) {
      const banco = await lancarDespesa(user, item.valor, item.descricao||msg.text, item.categoria, item.quem);
      const icon = CAT_ICONS[item.categoria] || '💸';
      let resp = `${icon} *${item.descricao||msg.text}*\n✅ *${fmt(item.valor)}* lançado!\n`;
      if (item.categoria) resp += `📂 ${item.categoria}\n`;
      if (item.quem === 'casal') resp += `👫 Casal (50/50)\n`;
      if (item.quem === 'ela') resp += `👤 Ela\n`;
      if (banco) resp += `\n🏦 ${banco.banco}: ${fmt(banco.novoSaldo)}`;
      bot.sendMessage(msg.chat.id, resp, { parse_mode: 'Markdown' });
      return;
    }

    if (item.tipo === 'receita' && item.valor) {
      const banco = await lancarReceita(user, item.valor, item.descricao);
      let resp = `💰 *${item.descricao||'Receita'}*\n✅ *${fmt(item.valor)}* registrado!\n`;
      if (banco) resp += `\n🏦 ${banco.banco}: ${fmt(banco.novoSaldo)}`;
      bot.sendMessage(msg.chat.id, resp, { parse_mode: 'Markdown' });
      return;
    }

    bot.sendMessage(msg.chat.id,
      `Não entendi 😅\n\nTente:\n"gastei *45* no mercado"\n"paguei *120* gasolina"\n\n/ajuda`,
      { parse_mode: 'Markdown' }
    );

  } catch (err) {
    console.error('Erro:', err);
    bot.sendMessage(msg.chat.id, '❌ Erro ao processar. Tente novamente.');
  }
});

bot.on('polling_error', (err) => {
  console.error('Polling error:', err.message);
});

console.log('🤖 Bot FinançasCasal rodando com Groq...');
