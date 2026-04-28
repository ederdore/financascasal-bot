// bot-telegram.js
// Bot Telegram para o FinançasCasal — usando Groq (GRATUITO)
//
// ── SETUP ────────────────────────────────────────────────
// 1. Fale com @BotFather no Telegram → /newbot → copie o TOKEN
// 2. Acesse console.groq.com → API Keys → copie a chave gsk_...
// 3. Preencha as 4 variáveis abaixo
// 4. npm install node-telegram-bot-api @supabase/supabase-js node-fetch
// 5. node bot-telegram.js
//
// ── HOSPEDAGEM GRATUITA ──────────────────────────────────
// Railway.app → New Project → Deploy from GitHub → Free plan
// ─────────────────────────────────────────────────────────

const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

// ── CONFIGURAÇÃO — preencha aqui ─────────────────────────
const TELEGRAM_TOKEN = 'SEU_TOKEN_DO_BOTFATHER';
const SUPABASE_URL   = 'https://SEU_PROJETO.supabase.co';
const SUPABASE_ANON  = 'SUA_CHAVE_ANON_PUBLICA';
const GROQ_API_KEY   = 'gsk_...SUA_CHAVE_GROQ...';
// ─────────────────────────────────────────────────────────

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

const CATS = ['Alimentação','Moradia','Transporte','Saúde','Lazer','Educação','Outros'];
const CAT_ICONS = {
  Alimentação:'🛒', Moradia:'🏠', Transporte:'🚗', Saúde:'💊',
  Lazer:'🎉', Educação:'📚', Outros:'💸',
};
const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

function fmt(n) {
  return 'R$ ' + Number(n||0).toLocaleString('pt-BR', { minimumFractionDigits:2, maximumFractionDigits:2 });
}

// ── BUSCA USUÁRIO ─────────────────────────────────────────
async function getUser(telegramId) {
  const { data } = await supabase
    .from('profiles').select('*')
    .eq('telegram_id', String(telegramId)).maybeSingle();
  return data;
}

// ── INTERPRETA MENSAGEM COM GROQ ─────────────────────────
async function interpretarMensagem(texto) {
  const prompt = `O usuário de um app financeiro enviou: "${texto}"

Extraia as informações e responda APENAS em JSON válido, sem markdown, sem explicação:
{
  "tipo": "despesa" | "receita" | "saldo" | "ajuda" | "desconhecido",
  "valor": número ou null,
  "descricao": "descrição curta" ou null,
  "categoria": uma de [${CATS.join(', ')}] ou null,
  "quem": "eu" | "ela" | "casal" ou null
}

Exemplos:
- "gastei 45 no mercado" → {"tipo":"despesa","valor":45,"descricao":"Supermercado","categoria":"Alimentação","quem":"eu"}
- "paguei 120 de gasolina pra ela" → {"tipo":"despesa","valor":120,"descricao":"Gasolina","categoria":"Transporte","quem":"ela"}
- "jantar casal 180" → {"tipo":"despesa","valor":180,"descricao":"Jantar","categoria":"Alimentação","quem":"casal"}
- "recebi salário 8500" → {"tipo":"receita","valor":8500,"descricao":"Salário","categoria":null,"quem":"eu"}
- "quanto tenho?" → {"tipo":"saldo","valor":null,"descricao":null,"categoria":null,"quem":null}`;

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 200,
        temperature: 0.1, // baixo para respostas mais precisas
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content || '{}';
    return JSON.parse(raw.replace(/```json|```/g, '').trim());
  } catch {
    return { tipo: 'desconhecido' };
  }
}

// ── MOVIMENTA BANCO ───────────────────────────────────────
async function movimentarBanco(user, tipo, descricao, valor) {
  const { data: bancos } = await supabase
    .from('contas_banco').select('*').eq('casal_code', user.casal_code);

  const banco = bancos?.find(b => b.id === user.banco_principal_id) || bancos?.[0];
  if (!banco) return null;

  const novoSaldo = tipo === 'entrada'
    ? (banco.saldo || 0) + valor
    : (banco.saldo || 0) - valor;

  const now = new Date();
  await supabase.from('contas_banco').update({ saldo: novoSaldo }).eq('id', banco.id);
  await supabase.from('extrato_banco').insert({
    user_id: user.id,
    casal_code: user.casal_code,
    banco_id: banco.id,
    banco_nome: banco.banco,
    tipo,
    descricao,
    valor,
    saldo_apos: novoSaldo,
    mes: now.getMonth(),
    ano: now.getFullYear(),
  });

  return { ...banco, novoSaldo };
}

// ── LANÇA DESPESA ─────────────────────────────────────────
async function lancarDespesa(user, valor, descricao, categoria, quem) {
  const now = new Date();
  await supabase.from('despesas').insert({
    user_id: user.id,
    casal_code: user.casal_code,
    nome: descricao,
    valor,
    categoria: categoria || 'Outros',
    quem: quem || user.papel,
    tipo: 'variavel',
    pagamento_tipo: 'debito',
    mes: now.getMonth(),
    ano: now.getFullYear(),
  });
  return movimentarBanco(user, 'saida', descricao, valor);
}

// ── LANÇA RECEITA ─────────────────────────────────────────
async function lancarReceita(user, valor, descricao) {
  const now = new Date();
  await supabase.from('receitas').insert({
    user_id: user.id,
    casal_code: user.casal_code,
    tipo: 'salario',
    valor,
    quem: user.papel,
    mes: now.getMonth(),
    ano: now.getFullYear(),
  });
  return movimentarBanco(user, 'entrada', descricao || 'Receita', valor);
}

// ── RESUMO ────────────────────────────────────────────────
async function getResumo(user) {
  const now = new Date();
  const mes = now.getMonth();
  const ano = now.getFullYear();

  const [{ data: desp }, { data: rec }, { data: bancos }, { data: reserva }] = await Promise.all([
    supabase.from('despesas').select('valor,quem').eq('casal_code', user.casal_code).eq('mes', mes).eq('ano', ano),
    supabase.from('receitas').select('valor,quem').eq('casal_code', user.casal_code).eq('mes', mes).eq('ano', ano),
    supabase.from('contas_banco').select('banco,saldo,moeda').eq('casal_code', user.casal_code),
    supabase.from('reserva').select('atual,meta').eq('user_id', user.id).maybeSingle(),
  ]);

  const totalRec = (rec||[]).filter(r => r.quem === user.papel).reduce((s,r) => s+r.valor, 0);
  const totalDesp = (desp||[])
    .filter(d => d.quem === user.papel || d.quem === 'casal')
    .reduce((s,d) => s + (d.quem==='casal' ? d.valor/2 : d.valor), 0);

  return {
    totalRec,
    totalDesp,
    saldo: totalRec - totalDesp,
    bancos: bancos || [],
    saldoBancos: (bancos||[]).reduce((s,b) => s+b.saldo, 0),
    reserva: reserva?.data || { atual:0, meta:30000 },
  };
}

const HELP_MSG = `
💑 *FinançasCasal Bot*

Diga naturalmente o que gastou:
💸 "gastei 45 no mercado"
💸 "paguei 200 de gasolina pra ela"
💸 "jantar casal 180"
💰 "recebi salário 8500"
📊 "quanto tenho?" ou "resumo"

Comandos:
/saldo — ver saldo e bancos
/resumo — resumo do mês
/gastos — últimos 5 gastos
/vincular CODIGO — vincular sua conta
/ajuda — esta mensagem
`;

// ── HANDLERS ─────────────────────────────────────────────

bot.onText(/\/start/, async (msg) => {
  const user = await getUser(msg.from.id);
  if (user) {
    bot.sendMessage(msg.chat.id,
      `Olá, *${user.nome}*! 👋\n\nDiga o que gastou e eu lanço direto no app!\n${HELP_MSG}`,
      { parse_mode: 'Markdown' }
    );
  } else {
    bot.sendMessage(msg.chat.id,
      `Olá! 👋\n\nPara começar, vincule sua conta:\n\n` +
      `1. Abra o app FinançasCasal\n` +
      `2. Vá em Perfil e copie o *Código do casal*\n` +
      `3. Envie aqui: /vincular *seucodigo*`,
      { parse_mode: 'Markdown' }
    );
  }
});

bot.onText(/\/ajuda/, (msg) => {
  bot.sendMessage(msg.chat.id, HELP_MSG, { parse_mode: 'Markdown' });
});

bot.onText(/\/vincular(?:\s+(.+))?/, async (msg, match) => {
  const codigo = match?.[1]?.trim().toLowerCase();
  if (!codigo) {
    bot.sendMessage(msg.chat.id, 'Use: /vincular *seucodigo*\n\nO código está no app em Perfil → Código do casal', { parse_mode: 'Markdown' });
    return;
  }

  const { data: profile } = await supabase
    .from('profiles').select('*').eq('casal_code', codigo).maybeSingle();

  if (!profile) {
    bot.sendMessage(msg.chat.id, '❌ Código não encontrado.\n\nVerifique no app em *Perfil → Código do casal*.', { parse_mode: 'Markdown' });
    return;
  }

  await supabase.from('profiles')
    .update({ telegram_id: String(msg.from.id) })
    .eq('id', profile.id);

  bot.sendMessage(msg.chat.id,
    `✅ Conta vinculada!\n\nOlá, *${profile.nome}*! Agora é só me dizer o que gastou.\n\nTente: "gastei 50 no mercado" 🛒`,
    { parse_mode: 'Markdown' }
  );
});

bot.onText(/\/saldo/, async (msg) => {
  const user = await getUser(msg.from.id);
  if (!user) { bot.sendMessage(msg.chat.id, '⚠️ Use /vincular primeiro.'); return; }

  const { saldo, bancos, saldoBancos, reserva } = await getResumo(user);
  const pct = reserva.meta > 0 ? ((reserva.atual/reserva.meta)*100).toFixed(0) : 0;

  let text = `💑 *Saldo — ${user.nome}*\n\n`;
  text += `📊 Este mês: *${fmt(saldo)}*\n\n`;
  text += `🏦 *Contas:*\n`;
  bancos.forEach(b => { text += `  ${b.banco}: *${fmt(b.saldo)}*\n`; });
  text += `  Total: *${fmt(saldoBancos)}*\n\n`;
  text += `🛡 Reserva: *${fmt(reserva.atual)}* (${pct}% da meta)`;

  bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
});

bot.onText(/\/resumo/, async (msg) => {
  const user = await getUser(msg.from.id);
  if (!user) { bot.sendMessage(msg.chat.id, '⚠️ Use /vincular primeiro.'); return; }

  const { totalRec, totalDesp, saldo } = await getResumo(user);
  const now = new Date();

  let text = `📊 *Resumo de ${MESES[now.getMonth()]}*\n\n`;
  text += `💰 Receitas: *${fmt(totalRec)}*\n`;
  text += `💸 Gastos: *${fmt(totalDesp)}*\n`;
  text += `${saldo >= 0 ? '✅' : '🔴'} Saldo: *${fmt(saldo)}*`;

  bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
});

bot.onText(/\/gastos/, async (msg) => {
  const user = await getUser(msg.from.id);
  if (!user) { bot.sendMessage(msg.chat.id, '⚠️ Use /vincular primeiro.'); return; }

  const now = new Date();
  const { data: desp } = await supabase
    .from('despesas').select('*')
    .eq('casal_code', user.casal_code)
    .eq('mes', now.getMonth()).eq('ano', now.getFullYear())
    .order('created_at', { ascending: false }).limit(5);

  if (!desp || desp.length === 0) {
    bot.sendMessage(msg.chat.id, 'Nenhum gasto este mês ainda. 😊');
    return;
  }

  let text = `💸 *Últimos 5 gastos:*\n\n`;
  desp.forEach(d => {
    const icon = CAT_ICONS[d.categoria] || '💸';
    text += `${icon} *${d.nome}* — ${fmt(d.valor)}\n`;
    text += `   ${d.categoria}${d.quem==='casal'?' · Casal':''}\n\n`;
  });

  bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
});

// ── MENSAGEM LIVRE ────────────────────────────────────────
bot.on('message', async (msg) => {
  if (msg.text?.startsWith('/')) return;
  if (!msg.text) return;

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

    if (item.tipo === 'saldo' || item.tipo === 'resumo') {
      const { totalRec, totalDesp, saldo } = await getResumo(user);
      bot.sendMessage(msg.chat.id,
        `📊 *Seu mês:*\n💰 Receitas: ${fmt(totalRec)}\n💸 Gastos: ${fmt(totalDesp)}\n${saldo>=0?'✅':'🔴'} Saldo: *${fmt(saldo)}*`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    if (item.tipo === 'ajuda') {
      bot.sendMessage(msg.chat.id, HELP_MSG, { parse_mode: 'Markdown' });
      return;
    }

    if (item.tipo === 'despesa' && item.valor) {
      const banco = await lancarDespesa(user, item.valor, item.descricao || msg.text, item.categoria, item.quem);
      const icon = CAT_ICONS[item.categoria] || '💸';

      let resp = `${icon} *${item.descricao || msg.text}*\n`;
      resp += `✅ *${fmt(item.valor)}* lançado!\n`;
      if (item.categoria) resp += `📂 ${item.categoria}\n`;
      if (item.quem === 'casal') resp += `👫 Casal (50/50)\n`;
      if (item.quem === 'ela') resp += `👤 Ela\n`;
      if (banco) resp += `\n🏦 ${banco.banco}: ${fmt(banco.novoSaldo)}`;

      bot.sendMessage(msg.chat.id, resp, { parse_mode: 'Markdown' });
      return;
    }

    if (item.tipo === 'receita' && item.valor) {
      const banco = await lancarReceita(user, item.valor, item.descricao);

      let resp = `💰 *${item.descricao || 'Receita'}*\n`;
      resp += `✅ *${fmt(item.valor)}* registrado!\n`;
      if (banco) resp += `\n🏦 ${banco.banco}: ${fmt(banco.novoSaldo)}`;

      bot.sendMessage(msg.chat.id, resp, { parse_mode: 'Markdown' });
      return;
    }

    // Não entendeu
    bot.sendMessage(msg.chat.id,
      `Não entendi 😅\n\nTente assim:\n"gastei *45* no mercado"\n"paguei *120* de gasolina"\n\n/ajuda para ver todos os exemplos`,
      { parse_mode: 'Markdown' }
    );

  } catch (err) {
    console.error('Erro:', err);
    bot.sendMessage(msg.chat.id, '❌ Erro ao processar. Tente novamente.');
  }
});

console.log('🤖 Bot FinançasCasal rodando com Groq...');
