import 'react-native-url-polyfill/auto';
import { useState, useEffect } from 'react';
import {
  StyleSheet, Text, View, TextInput, TouchableOpacity,
  ScrollView, SafeAreaView, ActivityIndicator, Alert,
  StatusBar, KeyboardAvoidingView, Platform
} from 'react-native';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── CONFIGURAÇÃO SUPABASE ────────────────────────────────
// Substitua pelas suas chaves do Supabase (Settings → API)
const SUPABASE_URL = 'https://SEU_PROJETO.supabase.co';
const SUPABASE_ANON_KEY = 'SUA_CHAVE_ANON_PUBLICA';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
// ─────────────────────────────────────────────────────────

const C = {
  bg:'#F9F8F6', card:'#FFFFFF', primary:'#1A1A1A',
  secondary:'#6B6B6B', border:'#E8E6E0',
  green:'#1D9E75', red:'#E24B4A', blue:'#178DD1', yellow:'#EF9F27',
  euBg:'#E6F1FB', euText:'#185FA5', elaBg:'#FBEAF0', elaText:'#993556',
};

const CATS = ['Alimentação','Moradia','Transporte','Saúde','Lazer','Educação','Outros'];
const CAT_ICONS = { Alimentação:'🛒', Moradia:'🏠', Transporte:'🚗', Saúde:'💊', Lazer:'🎉', Educação:'📚', Outros:'💸' };

function fmt(n) {
  return 'R$ ' + Number(n||0).toLocaleString('pt-BR', { minimumFractionDigits:2, maximumFractionDigits:2 });
}

// ─── TELA DE LOGIN ────────────────────────────────────────
function LoginScreen() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [loading, setLoading] = useState(false);
  const [modo, setModo] = useState('login');

  async function handleAuth() {
    if (!email || !senha) { Alert.alert('Preencha e-mail e senha'); return; }
    setLoading(true);
    try {
      if (modo === 'cadastro') {
        const { error } = await supabase.auth.signUp({ email, password: senha });
        if (error) throw error;
        Alert.alert('Cadastro feito!', 'Verifique seu e-mail para confirmar a conta.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
        if (error) throw error;
      }
    } catch (e) { Alert.alert('Erro', e.message); }
    finally { setLoading(false); }
  }

  return (
    <SafeAreaView style={[s.safe, { justifyContent:'center' }]}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
      <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':'height'}>
        <View style={s.loginWrap}>
          <Text style={s.loginEmoji}>💑</Text>
          <Text style={s.loginTitle}>FinançasCasal</Text>
          <Text style={s.loginSub}>Finanças do casal, juntos e organizados</Text>
          <TextInput style={s.input} placeholder="E-mail" placeholderTextColor={C.secondary}
            value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none"/>
          <TextInput style={s.input} placeholder="Senha (mín. 6 caracteres)" placeholderTextColor={C.secondary}
            value={senha} onChangeText={setSenha} secureTextEntry/>
          <TouchableOpacity style={s.btnPrimary} onPress={handleAuth} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff"/>
              : <Text style={s.btnPrimaryTxt}>{modo==='login'?'Entrar':'Criar conta'}</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={()=>setModo(modo==='login'?'cadastro':'login')}>
            <Text style={s.loginSwitch}>
              {modo==='login'?'Não tem conta? Cadastre-se':'Já tem conta? Entrar'}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── TELA DE PERFIL ───────────────────────────────────────
function ProfileSetupScreen({ session, onDone }) {
  const [nome, setNome] = useState('');
  const [papel, setPapel] = useState('eu');
  const [renda, setRenda] = useState('');
  const [codigoCasal, setCodigoCasal] = useState('');
  const [loading, setLoading] = useState(false);

  async function salvar() {
    if (!nome || !renda) { Alert.alert('Preencha nome e renda'); return; }
    setLoading(true);
    try {
      const { error } = await supabase.from('profiles').upsert({
        id: session.user.id,
        nome,
        papel,
        renda: parseFloat(renda),
        casal_code: codigoCasal.trim().toLowerCase() || session.user.id.slice(0,8),
      });
      if (error) throw error;
      onDone();
    } catch (e) { Alert.alert('Erro', e.message); }
    finally { setLoading(false); }
  }

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg}/>
      <ScrollView contentContainerStyle={{ padding:24 }}>
        <Text style={[s.loginEmoji,{textAlign:'center'}]}>👤</Text>
        <Text style={[s.loginTitle,{textAlign:'center',fontSize:20,marginBottom:4}]}>Configure seu perfil</Text>
        <Text style={[s.loginSub,{textAlign:'center',marginBottom:24}]}>Isso aparecerá para o seu parceiro(a)</Text>

        <Text style={s.fieldLabel}>Seu nome</Text>
        <TextInput style={s.input} placeholder="Ex: João" placeholderTextColor={C.secondary}
          value={nome} onChangeText={setNome}/>

        <Text style={s.fieldLabel}>Você é</Text>
        <View style={{flexDirection:'row',gap:8,marginBottom:14}}>
          {[['eu','EU 💙'],['ela','ELA 💗']].map(([v,l])=>(
            <TouchableOpacity key={v} style={[s.chip, papel===v && s.chipSel, {flex:1,justifyContent:'center'}]}
              onPress={()=>setPapel(v)}>
              <Text style={[s.chipTxt, papel===v && s.chipTxtSel, {textAlign:'center',fontSize:13}]}>{l}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={s.fieldLabel}>Sua renda mensal (R$)</Text>
        <TextInput style={s.input} placeholder="Ex: 8500" placeholderTextColor={C.secondary}
          value={renda} onChangeText={setRenda} keyboardType="numeric"/>

        <View style={{backgroundColor:'#EEF6FF',borderRadius:12,padding:14,marginBottom:14}}>
          <Text style={{fontSize:12,fontWeight:'600',color:C.blue,marginBottom:4}}>🔗 Vincular ao casal</Text>
          <Text style={{fontSize:12,color:C.secondary,marginBottom:8}}>
            Combinem um código com seu parceiro(a) antes de cadastrar — ex: "joaoemaria2024".
            Ambos devem usar exatamente o mesmo código.
          </Text>
          <TextInput style={s.input} placeholder="Código do casal (ex: joaoemaria2024)"
            placeholderTextColor={C.secondary} value={codigoCasal} onChangeText={setCodigoCasal}
            autoCapitalize="none"/>
        </View>

        <TouchableOpacity style={s.btnPrimary} onPress={salvar} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff"/>
            : <Text style={s.btnPrimaryTxt}>Salvar e entrar</Text>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── TELA PRINCIPAL ───────────────────────────────────────
function HomeScreen({ session, profile, onLogout, onEditProfile }) {
  const [activeTab, setActiveTab] = useState('visao');
  const [loading, setLoading] = useState(true);
  const [despesas, setDespesas] = useState([]);
  const [cartoes, setCartoes] = useState([]);
  const [investimentos, setInvestimentos] = useState([]);
  const [reserva, setReserva] = useState({ meta:30000, atual:0 });
  const [parceiro, setParceiro] = useState(null);

  // Modal despesa
  const [modalDesp, setModalDesp] = useState(false);
  const [editDesp, setEditDesp] = useState(null);
  const [dNome, setDNome] = useState('');
  const [dValor, setDValor] = useState('');
  const [dCat, setDCat] = useState('Alimentação');
  const [dQuem, setDQuem] = useState(profile.papel);
  const [dTipo, setDTipo] = useState('variavel');
  const [saving, setSaving] = useState(false);

  useEffect(()=>{ loadData(); },[]);

  async function loadData() {
    setLoading(true);
    try {
      const uid = session.user.id;
      const casalCode = profile.casal_code;

      // Busca parceiro
      if (casalCode) {
        const { data:parceiros } = await supabase.from('profiles')
          .select('*').eq('casal_code', casalCode).neq('id', uid);
        if (parceiros && parceiros.length > 0) setParceiro(parceiros[0]);
      }

      // Despesas do casal (compartilhadas pelo casal_code)
      let despQuery = supabase.from('despesas').select('*').order('created_at',{ascending:false});
      despQuery = casalCode
        ? despQuery.eq('casal_code', casalCode)
        : despQuery.eq('user_id', uid);

      const [d, c, i] = await Promise.all([
        despQuery,
        supabase.from('cartoes').select('*').eq('user_id', uid),
        supabase.from('investimentos').select('*').eq('user_id', uid),
      ]);

      if (d.data) setDespesas(d.data);
      if (c.data) setCartoes(c.data);
      if (i.data) setInvestimentos(i.data);

      const r = await supabase.from('reserva').select('*').eq('user_id', uid).maybeSingle();
      if (r.data) setReserva(r.data);
    } catch (e) { console.log('Erro:', e); }
    finally { setLoading(false); }
  }

  function abrirNovaDesp() {
    setEditDesp(null);
    setDNome(''); setDValor(''); setDCat('Alimentação');
    setDQuem(profile.papel); setDTipo('variavel');
    setModalDesp(true);
  }

  function abrirEditDesp(desp) {
    setEditDesp(desp);
    setDNome(desp.nome);
    setDValor(String(desp.valor));
    setDCat(desp.categoria);
    setDQuem(desp.quem);
    setDTipo(desp.tipo||'variavel');
    setModalDesp(true);
  }

  async function salvarDespesa() {
    if (!dNome || !dValor) { Alert.alert('Preencha nome e valor'); return; }
    setSaving(true);
    const now = new Date();
    const payload = {
      nome:dNome, valor:parseFloat(dValor), categoria:dCat,
      quem:dQuem, tipo:dTipo, mes:now.getMonth(), ano:now.getFullYear(),
      user_id:session.user.id, casal_code:profile.casal_code||session.user.id,
    };
    try {
      if (editDesp) {
        const { error } = await supabase.from('despesas').update(payload).eq('id', editDesp.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('despesas').insert(payload);
        if (error) throw error;
      }
      setModalDesp(false);
      loadData();
    } catch (e) { Alert.alert('Erro', e.message); }
    finally { setSaving(false); }
  }

  async function excluirDespesa(id) {
    Alert.alert('Excluir despesa','Tem certeza?',[
      { text:'Cancelar', style:'cancel' },
      { text:'Excluir', style:'destructive', onPress: async () => {
        const { error } = await supabase.from('despesas').delete().eq('id', id);
        if (error) { Alert.alert('Erro', error.message); return; }
        setModalDesp(false);
        loadData();
      }},
    ]);
  }

  // Cálculos
  const now = new Date();
  const minhaRenda = profile.renda||0;
  const parceiroRenda = parceiro?.renda||0;
  const despMes = despesas.filter(d=>d.mes===now.getMonth()&&d.ano===now.getFullYear());
  const minhas = despMes.filter(d=>d.quem===profile.papel);
  const casal = despMes.filter(d=>d.quem==='casal');
  const totalGasto = minhas.reduce((s,d)=>s+d.valor,0)+casal.reduce((s,d)=>s+d.valor/2,0);
  const saldo = minhaRenda - totalGasto;
  const totalInv = investimentos.reduce((s,i)=>s+i.valor,0);
  const pctReserva = reserva.meta>0 ? Math.min(100,(reserva.atual/reserva.meta)*100) : 0;
  const papelBg = profile.papel==='eu'?C.euBg:C.elaBg;
  const papelTxt = profile.papel==='eu'?C.euText:C.elaText;

  if (loading) return (
    <SafeAreaView style={[s.safe,{justifyContent:'center',alignItems:'center'}]}>
      <ActivityIndicator size="large" color={C.primary}/>
      <Text style={[s.sub,{marginTop:12}]}>Carregando dados do casal...</Text>
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg}/>

      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>💑 FinançasCasal</Text>
          {parceiro && <Text style={{fontSize:10,color:C.secondary,marginTop:1}}>🔗 vinculado com {parceiro.nome}</Text>}
        </View>
        <View style={s.avRow}>
          <View style={[s.av,{backgroundColor:papelBg,borderColor:C.primary}]}>
            <Text style={{fontSize:9,fontWeight:'700',color:papelTxt}}>{profile.papel==='eu'?'EU':'ELA'}</Text>
          </View>
          <TouchableOpacity onPress={onEditProfile} style={{paddingHorizontal:6,paddingVertical:4}}>
            <Text style={{fontSize:18}}>⚙️</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onLogout} style={s.avLogout}>
            <Text style={{fontSize:11,color:C.secondary}}>Sair</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={{borderBottomWidth:0.5,borderBottomColor:C.border,maxHeight:42}}
        contentContainerStyle={{paddingHorizontal:16}}>
        {[{id:'visao',label:'Visão'},{id:'despesas',label:'Despesas'},
          {id:'cartoes',label:'Cartões'},{id:'invest',label:'Invest.'},
          {id:'reserva',label:'Reserva'},{id:'perfil',label:'Perfil'}
        ].map(t=>(
          <TouchableOpacity key={t.id} style={s.tab} onPress={()=>setActiveTab(t.id)}>
            <Text style={[s.tabLabel, activeTab===t.id && s.tabActive]}>{t.label}</Text>
            {activeTab===t.id && <View style={s.tabLine}/>}
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>

        {/* VISÃO */}
        {activeTab==='visao' && (
          <View style={s.page}>
            <Text style={s.secTitle}>Seu saldo este mês</Text>
            <Text style={[s.bigNum,{color:saldo>=0?C.primary:C.red}]}>{fmt(saldo)}</Text>
            <Text style={s.sub}>Renda: {fmt(minhaRenda)} · Gastos: {fmt(totalGasto)}</Text>

            {parceiro && (
              <View style={{backgroundColor:C.card,borderRadius:12,padding:12,
                borderWidth:0.5,borderColor:C.border,marginTop:12,flexDirection:'row',alignItems:'center',gap:10}}>
                <View style={[s.av,{width:36,height:36,borderRadius:18,
                  backgroundColor:parceiro.papel==='eu'?C.euBg:C.elaBg,borderColor:'transparent'}]}>
                  <Text style={{fontSize:10,fontWeight:'700',
                    color:parceiro.papel==='eu'?C.euText:C.elaText}}>
                    {parceiro.papel==='eu'?'EU':'ELA'}
                  </Text>
                </View>
                <View style={{flex:1}}>
                  <Text style={{fontSize:13,fontWeight:'500',color:C.primary}}>{parceiro.nome}</Text>
                  <Text style={{fontSize:11,color:C.secondary}}>Renda: {fmt(parceiroRenda)}</Text>
                </View>
                <View style={{alignItems:'flex-end'}}>
                  <Text style={{fontSize:11,color:C.secondary}}>Renda conjunta</Text>
                  <Text style={{fontSize:14,fontWeight:'600',color:C.green}}>{fmt(minhaRenda+parceiroRenda)}</Text>
                </View>
              </View>
            )}

            <View style={s.grid2}>
              <View style={s.miniCard}><Text style={s.miniLbl}>Gastos mês</Text>
                <Text style={[s.miniVal,{color:C.red}]}>{fmt(totalGasto)}</Text></View>
              <View style={s.miniCard}><Text style={s.miniLbl}>Investimentos</Text>
                <Text style={[s.miniVal,{color:C.green}]}>{fmt(totalInv)}</Text></View>
              <View style={s.miniCard}><Text style={s.miniLbl}>Reserva</Text>
                <Text style={s.miniVal}>{pctReserva.toFixed(0)}% da meta</Text></View>
              <View style={s.miniCard}><Text style={s.miniLbl}>Lançamentos</Text>
                <Text style={s.miniVal}>{despMes.length} este mês</Text></View>
            </View>

            <Text style={[s.secTitle,{marginTop:20}]}>Últimas despesas</Text>
            {despesas.slice(0,5).map(d=>(
              <TouchableOpacity key={d.id} style={s.expRow} onPress={()=>abrirEditDesp(d)}>
                <Text style={s.expIcon}>{CAT_ICONS[d.categoria]||'💸'}</Text>
                <View style={s.expInfo}>
                  <Text style={s.expNome}>{d.nome}</Text>
                  <Text style={s.expMeta}>{d.categoria} · {d.tipo==='fixa'?'Fixa':'Variável'}{d.quem==='casal'?' · Casal':''}</Text>
                </View>
                <View style={{alignItems:'flex-end'}}>
                  <Text style={[s.expVal,{color:C.red}]}>-{fmt(d.quem==='casal'?d.valor/2:d.valor)}</Text>
                  <Text style={{fontSize:10,color:C.secondary,marginTop:2}}>✏️ editar</Text>
                </View>
              </TouchableOpacity>
            ))}
            {despesas.length===0 && <Text style={s.empty}>Nenhum gasto lançado ainda</Text>}
          </View>
        )}

        {/* DESPESAS */}
        {activeTab==='despesas' && (
          <View style={s.page}>
            <Text style={s.secTitle}>Despesas do mês — {despMes.length} lançamentos</Text>
            {despMes.length===0 && <Text style={s.empty}>Nenhuma despesa este mês</Text>}
            {despMes.map(d=>(
              <TouchableOpacity key={d.id} style={s.expRow} onPress={()=>abrirEditDesp(d)}>
                <Text style={s.expIcon}>{CAT_ICONS[d.categoria]||'💸'}</Text>
                <View style={s.expInfo}>
                  <Text style={s.expNome}>{d.nome}</Text>
                  <Text style={s.expMeta}>
                    {d.categoria} · <Text style={{color:d.tipo==='fixa'?C.blue:C.yellow}}>{d.tipo==='fixa'?'Fixa':'Variável'}</Text>
                    {d.quem==='casal'?' · Casal':d.quem==='eu'?' · EU':' · ELA'}
                  </Text>
                </View>
                <View style={{alignItems:'flex-end'}}>
                  <Text style={[s.expVal,{color:C.red}]}>-{fmt(d.valor)}</Text>
                  <Text style={{fontSize:10,color:C.secondary,marginTop:2}}>✏️ editar</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* CARTÕES */}
        {activeTab==='cartoes' && (
          <View style={s.page}>
            <Text style={s.secTitle}>Cartões</Text>
            {cartoes.map(c=>{
              const pct = c.limite>0?Math.min(100,(c.fatura/c.limite)*100):0;
              const cor = pct>80?C.red:pct>50?C.yellow:C.green;
              return (
                <View key={c.id} style={s.cardRow}>
                  <View style={{flexDirection:'row',justifyContent:'space-between',marginBottom:6}}>
                    <Text style={s.expNome}>{c.nome}</Text>
                    <Text style={{fontSize:12,color:cor}}>{pct.toFixed(0)}% usado</Text>
                  </View>
                  <View style={s.progWrap}><View style={[s.prog,{width:pct+'%',backgroundColor:cor}]}/></View>
                  <View style={{flexDirection:'row',justifyContent:'space-between'}}>
                    <Text style={[s.expMeta,{color:C.red}]}>Fatura: {fmt(c.fatura)}</Text>
                    <Text style={[s.expMeta,{color:C.green}]}>Disponível: {fmt(Math.max(0,c.limite-c.fatura))}</Text>
                  </View>
                </View>
              );
            })}
            {cartoes.length===0 && <Text style={s.empty}>Nenhum cartão cadastrado</Text>}
          </View>
        )}

        {/* INVEST */}
        {activeTab==='invest' && (
          <View style={s.page}>
            <Text style={s.secTitle}>Carteira</Text>
            <View style={s.miniCard}><Text style={s.miniLbl}>Total investido</Text>
              <Text style={[s.miniVal,{color:C.green,fontSize:22}]}>{fmt(totalInv)}</Text></View>
            <View style={{height:12}}/>
            {investimentos.map(i=>{
              const rent = i.rentabilidade||0;
              return (
                <View key={i.id} style={s.expRow}>
                  <View style={[s.expIconBox,{backgroundColor:'#E6F1FB'}]}>
                    <Text style={{fontSize:11,fontWeight:'700',color:C.euText}}>{i.nome.slice(0,2).toUpperCase()}</Text>
                  </View>
                  <View style={s.expInfo}>
                    <Text style={s.expNome}>{i.nome}</Text>
                    <Text style={s.expMeta}>{i.categoria}</Text>
                  </View>
                  <View style={{alignItems:'flex-end'}}>
                    <Text style={s.expVal}>{fmt(i.valor)}</Text>
                    <Text style={{fontSize:11,color:rent>=0?C.green:C.red}}>{rent>=0?'+':''}{rent.toFixed(1)}%</Text>
                  </View>
                </View>
              );
            })}
            {investimentos.length===0 && <Text style={s.empty}>Nenhum ativo cadastrado</Text>}
          </View>
        )}

        {/* RESERVA */}
        {activeTab==='reserva' && (
          <View style={s.page}>
            <Text style={s.secTitle}>Reserva de emergência</Text>
            <View style={[s.miniCard,{padding:16}]}>
              <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}>
                <View>
                  <Text style={[s.bigNum,{fontSize:24,color:C.green}]}>{fmt(reserva.atual)}</Text>
                  <Text style={s.sub}>Meta: {fmt(reserva.meta)}</Text>
                  <Text style={[s.sub,{color:C.green,marginTop:4}]}>{pctReserva.toFixed(0)}% atingido</Text>
                </View>
                <Text style={{fontSize:36}}>🛡️</Text>
              </View>
              <View style={[s.progWrap,{marginTop:12}]}>
                <View style={[s.prog,{width:pctReserva+'%',
                  backgroundColor:pctReserva>=100?C.green:pctReserva>=50?C.blue:C.yellow}]}/>
              </View>
              <Text style={[s.expMeta,{marginTop:6}]}>Faltam: {fmt(Math.max(0,reserva.meta-reserva.atual))}</Text>
            </View>
          </View>
        )}

        {/* PERFIL */}
        {activeTab==='perfil' && (
          <View style={s.page}>
            <Text style={s.secTitle}>Seu perfil</Text>
            <View style={[s.miniCard,{padding:16,marginBottom:12}]}>
              <View style={{flexDirection:'row',alignItems:'center',gap:12,marginBottom:12}}>
                <View style={[s.av,{width:44,height:44,borderRadius:22,
                  backgroundColor:papelBg,borderColor:'transparent'}]}>
                  <Text style={{fontSize:12,fontWeight:'700',color:papelTxt}}>
                    {profile.papel==='eu'?'EU':'ELA'}
                  </Text>
                </View>
                <View>
                  <Text style={[s.expNome,{fontSize:16}]}>{profile.nome}</Text>
                  <Text style={s.expMeta}>{session.user.email}</Text>
                </View>
              </View>
              <View style={{borderTopWidth:0.5,borderTopColor:C.border,paddingTop:12}}>
                <Text style={s.expMeta}>Renda mensal</Text>
                <Text style={[s.expNome,{color:C.green,marginTop:2,fontSize:18}]}>{fmt(profile.renda)}</Text>
              </View>
              {profile.casal_code && (
                <View style={{borderTopWidth:0.5,borderTopColor:C.border,paddingTop:12,marginTop:12}}>
                  <Text style={s.expMeta}>Código do casal</Text>
                  <Text style={[s.expNome,{color:C.blue,marginTop:2}]}>{profile.casal_code}</Text>
                  <Text style={{fontSize:11,color:C.secondary,marginTop:4}}>
                    Compartilhe este código com seu parceiro(a) para sincronizar dados
                  </Text>
                </View>
              )}
            </View>
            <TouchableOpacity style={s.btnPrimary} onPress={onEditProfile}>
              <Text style={s.btnPrimaryTxt}>✏️ Editar perfil e renda</Text>
            </TouchableOpacity>
            {parceiro && (
              <View style={[s.miniCard,{padding:16,marginTop:12}]}>
                <Text style={[s.secTitle,{marginBottom:8}]}>Parceiro(a) vinculado</Text>
                <Text style={s.expNome}>{parceiro.nome}</Text>
                <Text style={s.expMeta}>Renda: {fmt(parceiro.renda)}</Text>
              </View>
            )}
          </View>
        )}

        <View style={{height:100}}/>
      </ScrollView>

      {/* FAB */}
      {!modalDesp && (
        <TouchableOpacity style={s.fab} onPress={abrirNovaDesp}>
          <Text style={s.fabTxt}>+ Lançar despesa</Text>
        </TouchableOpacity>
      )}

      {/* Modal despesa */}
      {modalDesp && (
        <View style={s.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':'height'}>
            <View style={s.modal}>
              <View style={s.modalHandle}/>
              <Text style={s.modalTitle}>{editDesp?'✏️ Editar despesa':'Nova despesa'}</Text>
              <TextInput style={s.input} placeholder="Descrição" placeholderTextColor={C.secondary}
                value={dNome} onChangeText={setDNome}/>
              <TextInput style={s.input} placeholder="Valor (R$)" placeholderTextColor={C.secondary}
                value={dValor} onChangeText={setDValor} keyboardType="numeric"/>

              <Text style={s.fieldLabel}>Categoria</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:10}}>
                {CATS.map(c=>(
                  <TouchableOpacity key={c} style={[s.chip,dCat===c&&s.chipSel]} onPress={()=>setDCat(c)}>
                    <Text style={[s.chipTxt,dCat===c&&s.chipTxtSel]}>{CAT_ICONS[c]} {c}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={s.fieldLabel}>Quem pagou?</Text>
              <View style={{flexDirection:'row',gap:8,marginBottom:10}}>
                {[['eu','EU'],['ela','ELA'],['casal','Casal']].map(([v,l])=>(
                  <TouchableOpacity key={v} style={[s.chip,dQuem===v&&s.chipSel]} onPress={()=>setDQuem(v)}>
                    <Text style={[s.chipTxt,dQuem===v&&s.chipTxtSel]}>{l}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.fieldLabel}>Tipo</Text>
              <View style={{flexDirection:'row',gap:8,marginBottom:16}}>
                {[['variavel','Variável'],['fixa','Fixa']].map(([v,l])=>(
                  <TouchableOpacity key={v} style={[s.chip,dTipo===v&&s.chipSel]} onPress={()=>setDTipo(v)}>
                    <Text style={[s.chipTxt,dTipo===v&&s.chipTxtSel]}>{l}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={{flexDirection:'row',gap:8}}>
                <TouchableOpacity style={[s.btnSecondary,{flex:1}]} onPress={()=>setModalDesp(false)}>
                  <Text style={s.btnSecondaryTxt}>Cancelar</Text>
                </TouchableOpacity>
                {editDesp && (
                  <TouchableOpacity style={[s.btnSecondary,{paddingHorizontal:16,borderColor:C.red}]}
                    onPress={()=>excluirDespesa(editDesp.id)}>
                    <Text style={{fontSize:16,color:C.red}}>🗑️</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={[s.btnPrimary,{flex:2}]} onPress={salvarDespesa} disabled={saving}>
                  {saving ? <ActivityIndicator color="#fff"/>
                    : <Text style={s.btnPrimaryTxt}>{editDesp?'Salvar edição':'Lançar'}</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      )}
    </SafeAreaView>
  );
}

// ─── ROOT ─────────────────────────────────────────────────
export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loadingApp, setLoadingApp] = useState(true);
  const [editingProfile, setEditingProfile] = useState(false);

  useEffect(()=>{
    supabase.auth.getSession().then(({ data:{ session } })=>{
      setSession(session);
      if (session) loadProfile(session.user.id);
      else setLoadingApp(false);
    });
    supabase.auth.onAuthStateChange((_e, session)=>{
      setSession(session);
      if (session) loadProfile(session.user.id);
      else { setProfile(null); setLoadingApp(false); }
    });
  },[]);

  async function loadProfile(uid) {
    const { data } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
    setProfile(data);
    setLoadingApp(false);
  }

  if (loadingApp) return (
    <View style={[s.safe,{justifyContent:'center',alignItems:'center',backgroundColor:C.bg}]}>
      <ActivityIndicator size="large" color={C.primary}/>
    </View>
  );

  if (!session) return <LoginScreen/>;
  if (!profile || editingProfile) return (
    <ProfileSetupScreen session={session} onDone={()=>{
      setEditingProfile(false);
      loadProfile(session.user.id);
    }}/>
  );

  return (
    <HomeScreen session={session} profile={profile}
      onLogout={()=>supabase.auth.signOut()}
      onEditProfile={()=>setEditingProfile(true)}/>
  );
}

// ─── ESTILOS ──────────────────────────────────────────────
const s = StyleSheet.create({
  safe:{ flex:1, backgroundColor:C.bg },
  scroll:{ flex:1 },
  page:{ padding:16 },
  header:{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', padding:16, paddingBottom:8 },
  headerTitle:{ fontSize:15, fontWeight:'600', color:C.primary },
  avRow:{ flexDirection:'row', gap:6, alignItems:'center' },
  av:{ width:28, height:28, borderRadius:14, justifyContent:'center', alignItems:'center', borderWidth:2, borderColor:'transparent' },
  avLogout:{ paddingHorizontal:8, paddingVertical:4 },
  tab:{ paddingHorizontal:4, paddingVertical:10, marginRight:8, position:'relative' },
  tabLabel:{ fontSize:12, color:C.secondary },
  tabActive:{ color:C.primary, fontWeight:'600' },
  tabLine:{ position:'absolute', bottom:-1, left:0, right:0, height:2, backgroundColor:C.primary, borderRadius:1 },
  secTitle:{ fontSize:11, fontWeight:'600', color:C.secondary, textTransform:'uppercase', letterSpacing:0.5, marginBottom:8 },
  bigNum:{ fontSize:30, fontWeight:'500', letterSpacing:-1, color:C.primary },
  sub:{ fontSize:12, color:C.secondary, marginTop:2 },
  grid2:{ flexDirection:'row', flexWrap:'wrap', gap:8, marginTop:16 },
  miniCard:{ flex:1, minWidth:'45%', backgroundColor:C.card, borderRadius:12, padding:12, borderWidth:0.5, borderColor:C.border },
  miniLbl:{ fontSize:11, color:C.secondary, marginBottom:4 },
  miniVal:{ fontSize:16, fontWeight:'500', color:C.primary },
  expRow:{ flexDirection:'row', alignItems:'center', gap:10, backgroundColor:C.card, borderRadius:12, padding:12, marginBottom:6, borderWidth:0.5, borderColor:C.border },
  expIcon:{ fontSize:20 },
  expIconBox:{ width:36, height:36, borderRadius:18, justifyContent:'center', alignItems:'center' },
  expInfo:{ flex:1 },
  expNome:{ fontSize:13, fontWeight:'500', color:C.primary },
  expMeta:{ fontSize:11, color:C.secondary, marginTop:1 },
  expVal:{ fontSize:13, fontWeight:'500', color:C.primary },
  cardRow:{ backgroundColor:C.card, borderRadius:12, padding:12, marginBottom:8, borderWidth:0.5, borderColor:C.border },
  progWrap:{ height:6, backgroundColor:'#F0EDE8', borderRadius:3, overflow:'hidden' },
  prog:{ height:'100%', borderRadius:3 },
  empty:{ textAlign:'center', color:C.secondary, fontSize:13, paddingVertical:24 },
  fab:{ position:'absolute', bottom:24, left:16, right:16, backgroundColor:C.primary, borderRadius:14, padding:15, alignItems:'center' },
  fabTxt:{ color:'#fff', fontSize:14, fontWeight:'600' },
  modalOverlay:{ position:'absolute', bottom:0, left:0, right:0, top:0, backgroundColor:'rgba(0,0,0,0.4)', justifyContent:'flex-end' },
  modal:{ backgroundColor:C.card, borderTopLeftRadius:20, borderTopRightRadius:20, padding:20, paddingBottom:40 },
  modalHandle:{ width:36, height:4, backgroundColor:C.border, borderRadius:2, alignSelf:'center', marginBottom:14 },
  modalTitle:{ fontSize:15, fontWeight:'600', marginBottom:14, color:C.primary },
  input:{ backgroundColor:'#F5F3EF', borderRadius:10, padding:11, fontSize:14, color:C.primary, marginBottom:10, borderWidth:0.5, borderColor:C.border },
  fieldLabel:{ fontSize:11, color:C.secondary, marginBottom:6, fontWeight:'500' },
  chip:{ paddingHorizontal:12, paddingVertical:6, borderRadius:20, borderWidth:0.5, borderColor:C.border, marginRight:6 },
  chipSel:{ backgroundColor:C.primary, borderColor:C.primary },
  chipTxt:{ fontSize:12, color:C.secondary },
  chipTxtSel:{ color:'#fff' },
  btnPrimary:{ backgroundColor:C.primary, borderRadius:12, padding:13, alignItems:'center' },
  btnPrimaryTxt:{ color:'#fff', fontSize:14, fontWeight:'600' },
  btnSecondary:{ borderRadius:12, padding:13, alignItems:'center', borderWidth:0.5, borderColor:C.border },
  btnSecondaryTxt:{ fontSize:14, color:C.primary },
  loginWrap:{ padding:32 },
  loginEmoji:{ fontSize:48, textAlign:'center', marginBottom:8 },
  loginTitle:{ fontSize:26, fontWeight:'700', textAlign:'center', color:C.primary, marginBottom:4 },
  loginSub:{ fontSize:13, color:C.secondary, textAlign:'center', marginBottom:32 },
  loginSwitch:{ textAlign:'center', color:C.secondary, fontSize:13, marginTop:16, textDecorationLine:'underline' },
});
