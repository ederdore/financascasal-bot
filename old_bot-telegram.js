// bot-telegram.js
// Bot Telegram para o FinançasCasal
// Permite lançar gastos, receitas e consultar saldo pelo Telegram
//
// ── SETUP (5 minutos) ────────────────────────────────────
// 1. Abra o Telegram e fale com @BotFather
// 2. Digite /newbot → escolha um nome → escolha um username
// 3. Copie o TOKEN que ele vai te dar
// 4. Instale as dependências:
//    npm install node-telegram-bot-api @supabase/supabase-js
// 5. Preencha as variáveis abaixo
// 6. Rode: node bot-telegram.js
//
// ── HOSPEDAGEM GRATUITA ──────────────────────────────────
// Railway.app → New Project → Deploy from GitHub → gratuito
// Ou Render.com → New Web Service → Free plan
// ─────────────────────────────────────────────────────────

const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');

// ── CONFIGURAÇÃO ─────────────────────────────────────────
const TELEGRAM_TOKEN = 'SEU_TOKEN_DO_BOTFATHER';
const SUPABASE_URL   = 'https://SEU_PROJETO.supabase.co';
const SUPABASE_ANON  = 'SUA_CHAVE_ANON_PUBLICA';
const ANTHROPIC_KEY  = 'SUA_CHAVE_ANTHROPIC'; // para entender mensagens livres

// Mapeamento Telegram ID → usuário Supabase
// Após rodar o bot, use /vincular para cada membro do casal
// ─────────────────────────────────────────────────────────

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

const CATS = ['Alimentação','Moradia','Transporte','Saúde','Lazer','Educação','Outros'];
const CAT_ICONS = {
  Alimentação:'🛒', Moradia:'🏠', Transporte:'🚗', Saúde:'💊',
  Lazer:'🎉', Educação:'📚', Outros:'💸',
};

function fmt(n) {
  return 'R$ ' + Number(n||0).toLocaleString('pt-BR', { minimumFractionDigits:2, maximumFractionDigits:2 });
}

// ── BUSCA USUÁRIO PELO TELEGRAM ID ───────────────────────
async function getUser(telegramId) {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('telegram_id', String(telegramId))
    .maybeSingle();
  return data;
}

// ── INTERPRETA MENSAGEM LIVRE COM IA ─────────────────────
async function interpretarMensagem(texto) {
  const prompt = `Você é um assistente financeiro. O usuário enviou: "${texto}"
Extraia as informações e responda APENAS em JSON válido, sem markdown:
{
  "tipo": "despesa" | "receita" | "saldo" | "ajuda" | "desconhecido",
  "valor": número ou null,
  "descricao": "descrição curta" ou null,
  "categoria": uma de [${CATS.join(', ')}] ou null,
  "quem": "eu" | "ela" | "casal" ou null
}
Exemplos:
- "gastei 45 no mercado" → despesa, 45, Supermercado, Alimentação, eu
- "paguei 120 de gasolina pra ela" → despesa, 120, Gasolina, Transporte, ela
- "recebi salário 8500" → receita, 8500, Salário, null, eu
- "quanto tenho?" → saldo`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const data = await response.json();
  const raw = data.content?.[0]?.text || '{}';
  try { return JSON.parse(raw.replace(/```json|```/g, '').trim()); }
  catch { return { tipo: 'desconhecido' }; }
}

// ── LANÇA DESPESA ─────────────────────────────────────────
async function lancarDespesa(user, valor, descricao, categoria, quem) {
  const now = new Date();

  // Busca banco principal
  const { data: bancos } = await supabase
    .from('contas_banco')
    .select('*')
    .eq('casal_code', user.casal_code)
    .limit(10);

  const bancoPrincipal = bancos?.find(b => b.id === user.banco_principal_id) || bancos?.[0];

  // Lança despesa
  const { error } = await supabase.from('despesas').insert({
    user_id: user.id,
    casal_code: user.casal_code,
    nome: descricao,
    valor,
    categoria: categoria || 'Outros',
    quem: quem || user.papel,
    tipo: 'variavel',
    pagamento_tipo: 'debito',
    banco_id: bancoPrincipal?.id || null,
    banco_nome: bancoPrincipal?.banco || '',
    mes: now.getMonth(),
    ano: now.getFullYear(),
  });
  if (error) throw error;

  // Desconta do banco
  if (bancoPrincipal) {
    const novoSaldo = (bancoPrincipal.saldo || 0) - valor;
    await supabase.from('contas_banco').update({ saldo: novoSaldo }).eq('id', bancoPrincipal.id);
    await supabase.from('extrato_banco').insert({
      user_id: user.id,
      casal_code: user.casal_code,
      banco_id: bancoPrincipal.id,
      banco_nome: bancoPrincipal.banco,
      tipo: 'saida',
      descricao,
      valor,
      saldo_apos: novoSaldo,
      mes: now.getMonth(),
      ano: now.getFullYear(),
    });
  }
  return bancoPrincipal;
}

// ── LANÇA RECEITA ─────────────────────────────────────────
async function lancarReceita(user, valor, descricao) {
  const now = new Date();
  const { data: bancos } = await supabase
    .from('contas_banco').select('*').eq('casal_code', user.casal_code).limit(10);
  const bancoPrincipal = bancos?.find(b => b.id === user.banco_principal_id) || bancos?.[0];

  await supabase.from('receitas').insert({
    user_id: user.id,
    casal_code: user.casal_code,
    tipo: 'outros',
    valor,
    quem: user.papel,
    mes: now.getMonth(),
    ano: now.getFullYear(),
  });

  if (bancoPrincipal) {
    const novoSaldo = (bancoPrincipal.saldo || 0) + valor;
    await supabase.from('contas_banco').update({ saldo: novoSaldo }).eq('id', bancoPrincipal.id);
    await supabase.from('extrato_banco').insert({
      user_id: user.id,
      casal_code: user.casal_code,
      banco_id: bancoPrincipal.id,
      banco_nome: bancoPrincipal.banco,
      tipo: 'entrada',
      descricao,
      valor,
      saldo_apos: novoSaldo,
      mes: now.getMonth(),
      ano: now.getFullYear(),
    });
  }
  return bancoPrincipal;
}

// ── RESUMO DO MÊS ─────────────────────────────────────────
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
    .reduce((s,d) => s+(d.quem==='casal'?d.valor/2:d.valor), 0);
  const saldo = totalRec - totalDesp;
  const saldoBancos = (bancos||[]).reduce((s,b) => s+b.saldo, 0);
  const res = reserva?.data || { atual:0, meta:30000 };

  return { totalRec, totalDesp, saldo, saldoBancos, bancos: bancos||[], reserva: res };
}

// ── MENSAGENS ─────────────────────────────────────────────
const HELP_MSG = `
💑 *FinançasCasal Bot*

Exemplos do que você pode dizer:
💸 "gastei 45 no mercado"
💸 "paguei 200 de gasolina pra ela"
💸 "jantar casal 180"
💰 "recebi salário 8500"
📊 "quanto tenho?" ou "resumo"
📋 "últimos gastos"

Comandos:
/saldo — ver saldo e bancos
/resumo — resumo do mês
/gastos — últimos 5 gastos
/vincular — vincular sua conta
/ajuda — esta mensagem
`;

// ── HANDLERS ─────────────────────────────────────────────

bot.onText(/\/start/, async (msg) => {
  const user = await getUser(msg.from.id);
  if (user) {
    bot.sendMessage(msg.chat.id,
      `Olá, *${user.nome}*! 👋\n\nEstou pronto para lançar seus gastos. Me diga o que gastou!\n\n${HELP_MSG}`,
      { parse_mode: 'Markdown' }
    );
  } else {
    bot.sendMessage(msg.chat.id,
      `Olá! 👋 Para usar o bot, primeiro vincule sua conta:\n\n` +
      `1. Abra o app FinançasCasal\n` +
      `2. Vá em Perfil → Vincular Telegram\n` +
      `3. Digite o código que aparecer aqui: /vincular *SEU_CODIGO*`,
      { parse_mode: 'Markdown' }
    );
  }
});

bot.onText(/\/ajuda/, (msg) => {
  bot.sendMessage(msg.chat.id, HELP_MSG, { parse_mode: 'Markdown' });
});

bot.onText(/\/vincular (.+)/, async (msg, match) => {
  const codigo = match[1].trim();
  // O código é o casal_code ou um código de vinculação gerado no app
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('casal_code', codigo.toLowerCase())
    .maybeSingle();

  if (!profile) {
    bot.sendMessage(msg.chat.id, '❌ Código não encontrado. Verifique no app em Perfil → Código do casal.');
    return;
  }

  // Salva telegram_id no profile
  await supabase.from('profiles')
    .update({ telegram_id: String(msg.from.id) })
    .eq('id', profile.id);

  bot.sendMessage(msg.chat.id,
    `✅ Conta vinculada com sucesso!\n\nOlá, *${profile.nome}*! Agora você pode lançar gastos direto aqui.\n\nTente: "gastei 50 no mercado"`,
    { parse_mode: 'Markdown' }
  );
});

bot.onText(/\/saldo/, async (msg) => {
  const user = await getUser(msg.from.id);
  if (!user) { bot.sendMessage(msg.chat.id, '⚠️ Use /vincular primeiro.'); return; }

  const { saldo, saldoBancos, bancos, reserva } = await getResumo(user);
  const pctReserva = reserva.meta > 0 ? ((reserva.atual/reserva.meta)*100).toFixed(0) : 0;

  let msg2 = `💑 *Saldo — ${user.nome}*\n\n`;
  msg2 += `📊 Este mês: *${fmt(saldo)}*\n\n`;
  msg2 += `🏦 *Contas bancárias:*\n`;
  bancos.forEach(b => { msg2 += `  ${b.banco}: *${fmt(b.saldo)}*\n`; });
  msg2 += `  Total: *${fmt(saldoBancos)}*\n\n`;
  msg2 += `🛡 Reserva: *${fmt(reserva.atual)}* de ${fmt(reserva.meta)} (${pctReserva}%)`;

  bot.sendMessage(msg.chat.id, msg2, { parse_mode: 'Markdown' });
});

bot.onText(/\/resumo/, async (msg) => {
  const user = await getUser(msg.from.id);
  if (!user) { bot.sendMessage(msg.chat.id, '⚠️ Use /vincular primeiro.'); return; }

  const { totalRec, totalDesp, saldo } = await getResumo(user);
  const now = new Date();

  let msg2 = `📊 *Resumo de ${['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][now.getMonth()]}*\n\n`;
  msg2 += `💰 Receitas: *${fmt(totalRec)}*\n`;
  msg2 += `💸 Gastos: *${fmt(totalDesp)}*\n`;
  msg2 += `${saldo >= 0 ? '✅' : '🔴'} Saldo: *${fmt(saldo)}*`;

  bot.sendMessage(msg.chat.id, msg2, { parse_mode: 'Markdown' });
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
    bot.sendMessage(msg.chat.id, 'Nenhum gasto este mês ainda.');
    return;
  }

  let msg2 = `💸 *Últimos gastos:*\n\n`;
  desp.forEach(d => {
    const icon = CAT_ICONS[d.categoria] || '💸';
    msg2 += `${icon} ${d.nome} — *${fmt(d.valor)}*\n`;
    msg2 += `   ${d.categoria}${d.quem==='casal'?' · Casal':''}\n`;
  });

  bot.sendMessage(msg.chat.id, msg2, { parse_mode: 'Markdown' });
});

// ── MENSAGEM LIVRE (IA) ───────────────────────────────────
bot.on('message', async (msg) => {
  // Ignora comandos
  if (msg.text?.startsWith('/')) return;
  if (!msg.text) return;

  const user = await getUser(msg.from.id);
  if (!user) {
    bot.sendMessage(msg.chat.id,
      '⚠️ Conta não vinculada. Use /vincular *SEU_CODIGO_DO_APP*',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  // Indicador de digitação
  bot.sendChatAction(msg.chat.id, 'typing');

  try {
    const interpretado = await interpretarMensagem(msg.text);

    if (interpretado.tipo === 'desconhecido' || !interpretado.tipo) {
      bot.sendMessage(msg.chat.id,
        `Não entendi 😅 Tente:\n"gastei 50 no mercado"\n"recebi 8500 de salário"\n/ajuda`
      );
      return;
    }

    if (interpretado.tipo === 'saldo' || interpretado.tipo === 'resumo') {
      const { totalRec, totalDesp, saldo } = await getResumo(user);
      bot.sendMessage(msg.chat.id,
        `📊 *Seu mês:*\n💰 Receitas: ${fmt(totalRec)}\n💸 Gastos: ${fmt(totalDesp)}\n${saldo>=0?'✅':'🔴'} Saldo: *${fmt(saldo)}*`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    if (interpretado.tipo === 'ajuda') {
      bot.sendMessage(msg.chat.id, HELP_MSG, { parse_mode: 'Markdown' });
      return;
    }

    if (interpretado.tipo === 'despesa' && interpretado.valor) {
      const banco = await lancarDespesa(
        user,
        interpretado.valor,
        interpretado.descricao || msg.text,
        interpretado.categoria,
        interpretado.quem
      );
      const icon = CAT_ICONS[interpretado.categoria] || '💸';
      let resp = `${icon} *${interpretado.descricao || msg.text}*\n`;
      resp += `💸 *${fmt(interpretado.valor)}* lançado!\n`;
      if (interpretado.categoria) resp += `📂 ${interpretado.categoria}\n`;
      if (interpretado.quem === 'casal') resp += `👫 Casal (50/50)\n`;
      if (banco) resp += `🏦 Saiu de: ${banco.banco} → saldo: ${fmt((banco.saldo||0)-interpretado.valor)}`;
      bot.sendMessage(msg.chat.id, resp, { parse_mode: 'Markdown' });
      return;
    }

    if (interpretado.tipo === 'receita' && interpretado.valor) {
      const banco = await lancarReceita(user, interpretado.valor, interpretado.descricao || 'Receita');
      let resp = `💰 *${interpretado.descricao || 'Receita'}*\n`;
      resp += `✅ *${fmt(interpretado.valor)}* registrado!\n`;
      if (banco) resp += `🏦 Entrou em: ${banco.banco} → saldo: ${fmt((banco.saldo||0)+interpretado.valor)}`;
      bot.sendMessage(msg.chat.id, resp, { parse_mode: 'Markdown' });
      return;
    }

    bot.sendMessage(msg.chat.id, 'Não consegui identificar o valor. Tente: "gastei *45* no mercado"', { parse_mode: 'Markdown' });

  } catch (err) {
    console.error('Erro bot:', err);
    bot.sendMessage(msg.chat.id, '❌ Erro ao processar. Tente novamente ou use os comandos (/ajuda)');
  }
});

console.log('🤖 Bot FinançasCasal rodando...');
