import { createClient } from '@supabase/supabase-js'
import { CameraView, useCameraPermissions } from 'expo-camera'
import React, { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { API_URL, SUPABASE_ANON_KEY, SUPABASE_URL } from '../config.js'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
const { width: SW } = Dimensions.get('window')

// ── DESIGN TOKENS ─────────────────────────────────────
const C = {
  bg:        '#F7F7F5',
  card:      '#FFFFFF',
  primary:   '#1C1C1E',
  secondary: '#8A8A8E',
  tertiary:  '#C7C7CC',
  border:    '#F0F0EE',
  separator: '#E8E8E6',
  red:       '#E8384F',
  redBg:     '#FFF1F2',
  green:     '#00C781',
  greenBg:   '#F0FBF6',
  blue:      '#3B82F6',
  blueBg:    '#EFF6FF',
  yellow:    '#F59E0B',
}

const T = {
  hero:    { fontSize: 42, fontWeight: '700', letterSpacing: -2, color: C.primary },
  title:   { fontSize: 17, fontWeight: '600', color: C.primary },
  body:    { fontSize: 15, fontWeight: '400', color: C.primary },
  caption: { fontSize: 12, fontWeight: '400', color: C.secondary },
  label:   { fontSize: 11, fontWeight: '500', color: C.secondary, letterSpacing: 0.6, textTransform: 'uppercase' },
}

const CATS = ['Alimentação','Moradia','Transporte','Saúde','Lazer','Educação','Assinaturas','Investimento','Outros']
const CAT_ICONS = { Alimentação:'🛒', Moradia:'🏠', Transporte:'🚗', Saúde:'💊', Lazer:'🎉', Educação:'📚', Assinaturas:'📺', Investimento:'📈', Outros:'💸' }
const TIPOS_REC = [['salario','Salário'],['adiantamento','Adiantamento'],['bonus','Bônus'],['freela','Freela'],['outros','Outros']]

function fmt(n) {
  return 'R$ ' + Number(n||0).toLocaleString('pt-BR', { minimumFractionDigits:2, maximumFractionDigits:2 })
}

// ── COMPONENTES UI ────────────────────────────────────

function Divider() {
  return <View style={{ height: 0.5, backgroundColor: C.separator, marginHorizontal: 20 }} />
}

function SectionHeader({ title, style }) {
  return <Text style={[T.label, { paddingHorizontal:24, paddingTop:28, paddingBottom:10 }, style]}>{title}</Text>
}

function Chip({ label, selected, onPress, color }) {
  return (
    <TouchableOpacity onPress={onPress} style={[s.chip, selected && { backgroundColor: color || C.primary, borderColor: color || C.primary }]}>
      <Text style={[s.chipTxt, selected && { color: '#fff' }]}>{label}</Text>
    </TouchableOpacity>
  )
}

function FieldLabel({ children }) {
  return <Text style={[T.label, { marginBottom: 8, marginTop: 4 }]}>{children}</Text>
}

function Input({ style, ...props }) {
  return (
    <TextInput
      style={[s.input, style]}
      placeholderTextColor={C.tertiary}
      {...props}
    />
  )
}

function PrimaryButton({ label, onPress, disabled, color, loading }) {
  return (
    <TouchableOpacity
      onPress={onPress} disabled={disabled || loading}
      style={[s.btnPrimary, { backgroundColor: color || C.primary }, (disabled || loading) && { opacity: 0.5 }]}>
      {loading
        ? <ActivityIndicator color="#fff" />
        : <Text style={s.btnPrimaryTxt}>{label}</Text>}
    </TouchableOpacity>
  )
}

// ── LOGIN ─────────────────────────────────────────────
function LoginScreen() {
  const [email, setEmail]   = useState('')
  const [senha, setSenha]   = useState('')
  const [loading, setLoading] = useState(false)
  const [modo, setModo]     = useState('login')
  const [msg, setMsg]       = useState({ txt:'', ok:true })

  async function handleAuth() {
    setMsg({ txt:'', ok:true })
    if (modo==='recuperar') {
      if (!email) { setMsg({ txt:'Informe seu e-mail', ok:false }); return }
      setLoading(true)
      const { error } = await supabase.auth.resetPasswordForEmail(email)
      setLoading(false)
      if (error) setMsg({ txt: error.message, ok:false })
      else { setMsg({ txt:'Link enviado! Verifique seu e-mail.', ok:true }); setTimeout(()=>setModo('login'), 3000) }
      return
    }
    if (!email||!senha) { setMsg({ txt:'Preencha e-mail e senha', ok:false }); return }
    setLoading(true)
    try {
      if (modo==='cadastro') {
        const { error } = await supabase.auth.signUp({ email, password: senha })
        if (error) throw error
        setMsg({ txt:'Conta criada! Verifique seu e-mail.', ok:true })
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
        if (error) throw error
      }
    } catch(e) {
      const erros = { 'Invalid login credentials':'E-mail ou senha incorretos.', 'Email not confirmed':'Confirme seu e-mail primeiro.' }
      setMsg({ txt: erros[e.message]||e.message, ok:false })
    } finally { setLoading(false) }
  }

  const titles = { login:'Bem-vindo', cadastro:'Criar conta', recuperar:'Recuperar senha' }
  const subs   = { login:'Suas finanças do casal', cadastro:'Comece gratuitamente', recuperar:'Receba o link por e-mail' }
  const btnLabels = { login:'Entrar', cadastro:'Criar conta', recuperar:'Enviar link' }

  return (
    <SafeAreaView style={{ flex:1, backgroundColor:C.bg }}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
      <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':'height'} style={{ flex:1 }}>
        <ScrollView contentContainerStyle={{ flexGrow:1, justifyContent:'center', padding:32 }} keyboardShouldPersistTaps="handled">

          {/* Logo */}
          <View style={{ alignItems:'center', marginBottom:40 }}>
            <View style={{ width:64, height:64, borderRadius:20, backgroundColor:C.primary, alignItems:'center', justifyContent:'center', marginBottom:16 }}>
              <Text style={{ fontSize:32 }}>💑</Text>
            </View>
            <Text style={{ fontSize:24, fontWeight:'700', color:C.primary, letterSpacing:-0.5 }}>FinançasCasal</Text>
            <Text style={{ fontSize:14, color:C.secondary, marginTop:4 }}>{subs[modo]}</Text>
          </View>

          {/* Card formulário */}
          <View style={[s.card, { padding:24 }]}>
            {msg.txt !== '' && (
              <View style={{ backgroundColor: msg.ok ? C.greenBg : C.redBg, borderRadius:10, padding:12, marginBottom:16 }}>
                <Text style={{ fontSize:13, color: msg.ok ? C.green : C.red, lineHeight:18 }}>{msg.txt}</Text>
              </View>
            )}

            {modo !== 'recuperar' && (
              <>
                <FieldLabel>E-mail</FieldLabel>
                <Input placeholder="seu@email.com" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
                <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:8, marginTop:4 }}>
                  <FieldLabel>Senha</FieldLabel>
                  {modo==='login' && (
                    <TouchableOpacity onPress={()=>{setModo('recuperar');setMsg({txt:'',ok:true})}}>
                      <Text style={{ fontSize:12, color:C.blue }}>Esqueci a senha</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <Input placeholder="••••••••" value={senha} onChangeText={setSenha} secureTextEntry style={{ marginBottom:0 }} />
              </>
            )}

            {modo === 'recuperar' && (
              <>
                <FieldLabel>E-mail</FieldLabel>
                <Input placeholder="seu@email.com" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoFocus />
              </>
            )}

            <PrimaryButton label={btnLabels[modo]} onPress={handleAuth} loading={loading} style={{ marginTop:20 }} />
          </View>

          {/* Links secundários */}
          <View style={{ marginTop:20, gap:12, alignItems:'center' }}>
            {modo==='login' && (
              <TouchableOpacity onPress={()=>{setModo('cadastro');setMsg({txt:'',ok:true})}}>
                <Text style={{ fontSize:13, color:C.secondary }}>Não tem conta? <Text style={{ color:C.blue }}>Cadastre-se</Text></Text>
              </TouchableOpacity>
            )}
            {modo==='cadastro' && (
              <TouchableOpacity onPress={()=>{setModo('login');setMsg({txt:'',ok:true})}}>
                <Text style={{ fontSize:13, color:C.secondary }}>Já tem conta? <Text style={{ color:C.blue }}>Entrar</Text></Text>
              </TouchableOpacity>
            )}
            {modo==='recuperar' && (
              <TouchableOpacity onPress={()=>{setModo('login');setMsg({txt:'',ok:true})}}>
                <Text style={{ fontSize:13, color:C.secondary }}>← Voltar para o login</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

// ── HOME ──────────────────────────────────────────────
function HomeScreen({ session, profile }) {
  const [bancos, setBancos]   = useState([])
  const [cartoes, setCartoes] = useState([])
  const [recentes, setRecentes] = useState([])
  const [resumo, setResumo]   = useState({ receitas:0, despesas:0, saldoBancos:0 })
  const [loading, setLoading] = useState(true)

  // Modal despesa
  const [mDesp, setMDesp]   = useState(false)
  const [dNome, setDNome]   = useState('')
  const [dValor, setDValor] = useState('')
  const [dCat, setDCat]     = useState('Alimentação')
  const [dQuem, setDQuem]   = useState(profile.papel)
  const [dPagTipo, setDPagTipo] = useState('debito')
  const [dBancoId, setDBancoId] = useState('')
  const [dCartaoId, setDCartaoId] = useState('')
  const [dCartaoNome, setDCartaoNome] = useState('')

  // Modal receita
  const [mRec, setMRec]     = useState(false)
  const [rTipo, setRTipo]   = useState('salario')
  const [rValor, setRValor] = useState('')
  const [rQuem, setRQuem]   = useState(profile.papel)
  const [rBancoId, setRBancoId] = useState('')

  // QR
  const [mQR, setMQR]       = useState(false)
  const [permission, requestPermission] = useCameraPermissions()
  const [qrScanned, setQrScanned] = useState(false)
  const [qrLoading, setQrLoading] = useState(false)

  // IA Toast
  const [iaMsg, setIaMsg]   = useState('')
  const iaAnim = useRef(new Animated.Value(0)).current
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const uid = session.user.id
    const cc  = profile.casal_code
    const cf  = q => cc ? q.eq('casal_code', cc) : q.eq('user_id', uid)
    const now = new Date()
    try {
      const [b, c, d, r] = await Promise.all([
        cf(supabase.from('contas_banco').select('*')),
        cf(supabase.from('cartoes').select('*')),
        cf(supabase.from('despesas').select('*'))
          .eq('mes', now.getMonth()).eq('ano', now.getFullYear())
          .order('created_at', { ascending:false }).limit(20),
        cf(supabase.from('receitas').select('valor,quem'))
          .eq('mes', now.getMonth()).eq('ano', now.getFullYear()),
      ])
      if (b.data) {
        setBancos(b.data)
        const p = b.data.find(x=>x.id===profile.banco_principal_id) || b.data[0]
        if (p) { setDBancoId(p.id); setRBancoId(p.id) }
      }
      if (c.data) {
        setCartoes(c.data)
        if (c.data[0]) { setDCartaoId(c.data[0].id); setDCartaoNome(c.data[0].nome) }
      }
      if (d.data) setRecentes(d.data)
      const totalRec  = (r.data||[]).reduce((s,x)=>s+x.valor,0)
      const totalDesp = (d.data||[]).reduce((s,x)=>s+x.valor,0)
      const saldoBancos = (b.data||[]).reduce((s,x)=>s+x.saldo,0)
      setResumo({ receitas:totalRec, despesas:totalDesp, saldoBancos })
    } catch(e) { console.log(e) }
    finally { setLoading(false) }
  }

  // IA animada
  async function chamarIA(prompt) {
    try {
      const res = await fetch(`${API_URL}/api/analise`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ prompt }),
      })
      if (!res.ok) return
      const data = await res.json()
      const msg = (data.resultado||data.resposta||'').trim()
      if (!msg) return
      setIaMsg(msg)
      Animated.sequence([
        Animated.timing(iaAnim,{ toValue:1, duration:300, useNativeDriver:true }),
        Animated.delay(7000),
        Animated.timing(iaAnim,{ toValue:0, duration:300, useNativeDriver:true }),
      ]).start(()=>setIaMsg(''))
    } catch(e) { /* silencioso */ }
  }

  // ── SALVAR DESPESA ──
  async function salvarDesp() {
    if (!dNome||!dValor) { Alert.alert('Preencha nome e valor'); return }
    setSaving(true)
    const uid = session.user.id; const cc = profile.casal_code||uid
    const v = parseFloat(dValor); const now = new Date()
    try {
      if (dPagTipo==='debito' && dBancoId) {
        const banco = bancos.find(b=>b.id===dBancoId)
        if (banco) {
          const ns = (banco.saldo||0) - v
          await supabase.from('contas_banco').update({ saldo:ns }).eq('id', dBancoId)
          await supabase.from('extrato_banco').insert({ user_id:uid, casal_code:cc, banco_id:dBancoId, banco_nome:banco.banco, tipo:'saida', descricao:dNome, categoria:dCat, valor:v, saldo_apos:ns, mes:now.getMonth(), ano:now.getFullYear() })
        }
      }
      if (dPagTipo==='cartao' && dCartaoId) {
        const cartao = cartoes.find(c=>c.id===dCartaoId)
        if (cartao) await supabase.from('cartoes').update({ fatura:(cartao.fatura||0)+v }).eq('id', dCartaoId)
      }
      await supabase.from('despesas').insert({ user_id:uid, casal_code:cc, nome:dNome, valor:v, categoria:dCat, quem:dQuem, tipo:'variavel', pagamento_tipo:dPagTipo, cartao_id:dPagTipo==='cartao'?dCartaoId:null, cartao_nome:dPagTipo==='cartao'?dCartaoNome:'', banco_id:dPagTipo==='debito'?dBancoId:null, banco_nome:dPagTipo==='debito'?(bancos.find(b=>b.id===dBancoId)?.banco||''):'', mes:now.getMonth(), ano:now.getFullYear() })
      setMDesp(false); setDNome(''); setDValor(''); loadData()
      chamarIA(`Consultor financeiro casal. Despesa: "${dNome}" R$${v} categoria ${dCat}. Total mês: R$${resumo.despesas+v}. UMA dica prática em 1 frase curta (máx 18 palavras). Só a dica.`)
    } catch(e) { Alert.alert('Erro', e.message) }
    finally { setSaving(false) }
  }

  // ── SALVAR RECEITA ──
  async function salvarRec() {
    if (!rValor) { Alert.alert('Informe o valor'); return }
    setSaving(true)
    const uid = session.user.id; const cc = profile.casal_code||uid
    const v = parseFloat(rValor); const now = new Date()
    try {
      await supabase.from('receitas').insert({ user_id:uid, casal_code:cc, tipo:rTipo, valor:v, quem:rQuem, mes:now.getMonth(), ano:now.getFullYear() })
      if (rBancoId) {
        const banco = bancos.find(b=>b.id===rBancoId)
        if (banco) {
          const ns = (banco.saldo||0)+v
          await supabase.from('contas_banco').update({ saldo:ns }).eq('id', rBancoId)
          await supabase.from('extrato_banco').insert({ user_id:uid, casal_code:cc, banco_id:rBancoId, banco_nome:banco.banco, tipo:'entrada', descricao:rTipo, categoria:rTipo, valor:v, saldo_apos:ns, mes:now.getMonth(), ano:now.getFullYear() })
        }
      }
      setMRec(false); setRValor(''); loadData()
      chamarIA(`Consultor financeiro casal. Receita: R$${v}. Reserva automática ${profile.pct_reserva||5}%. UMA dica sobre o que fazer com esse dinheiro em 1 frase curta. Só a dica.`)
    } catch(e) { Alert.alert('Erro', e.message) }
    finally { setSaving(false) }
  }

  // ── QR CODE ──
  async function abrirQR() {
    if (!permission?.granted) {
      const { granted } = await requestPermission()
      if (!granted) { Alert.alert('Permissão negada','Precisa de acesso à câmera'); return }
    }
    setQrScanned(false); setMQR(true)
  }

  async function onQRScanned({ data }) {
    if (qrScanned||qrLoading) return
    setQrScanned(true); setQrLoading(true)
    try {
      const isNFe = data.includes('nfce')||data.includes('nfe')||data.includes('fazenda')||data.includes('sefaz')||/\d{44}/.test(data)
      if (!isNFe) {
        setMQR(false)
        Alert.alert('QR Code não reconhecido','Não parece ser uma nota fiscal.\n\nLance o valor manualmente.',[
          { text:'Lançar manualmente', onPress:()=>{setDNome('');setDValor('');setMDesp(true)} },
          { text:'Cancelar', style:'cancel' }
        ])
        return
      }
      let valor = 0; let estabelecimento = ''
      const valorUrlMatch = data.match(/[?&]vl?=([0-9]+[.,][0-9]{2})/)||data.match(/valor[^=]*=([0-9]+[.,][0-9]{2})/i)
      if (valorUrlMatch) valor = parseFloat(valorUrlMatch[1].replace(',','.'))
      if (valor===0 && data.startsWith('http')) {
        try {
          const res = await fetch(data, { headers:{ 'User-Agent':'Mozilla/5.0' } })
          const html = await res.text()
          const patterns = [/Valor Total[^R]*R\$\s*([\d.,]+)/i,/vNF[^>]*>([0-9]+[.,][0-9]{2})/i,/Total da Nota[^R]*R\$\s*([\d.,]+)/i,/"vNF":"([\d.]+)"/i]
          for (const p of patterns) {
            const m = html.match(p)
            if (m) { const v = parseFloat(m[1].replace(/\./g,'').replace(',','.')); if (v>0&&v<100000) { valor=v; break } }
          }
          const nomeMatch = html.match(/razao.social[^>]*>([^<]+)/i)
          if (nomeMatch) estabelecimento = nomeMatch[1].trim().substring(0,30)
        } catch(e) { /* continua */ }
      }
      setMQR(false)
      setDNome(estabelecimento?`Compra ${estabelecimento}`:'Compra nota fiscal')
      setDValor(valor>0 ? String(valor.toFixed(2)) : '')
      setDCat('Alimentação'); setMDesp(true)
      if (valor>0) Alert.alert('📄 Nota lida!',`Valor: ${fmt(valor)}\n\nConfira e ajuste antes de lançar.`)
      else Alert.alert('📄 Nota detectada','Não foi possível extrair o valor. Preencha manualmente.')
    } catch(e) { setMQR(false); setDNome('Compra nota fiscal'); setDValor(''); setMDesp(true) }
    finally { setQrLoading(false) }
  }

  const bancoPrincipal = bancos.find(b=>b.id===profile.banco_principal_id)||bancos[0]
  const faturaTotal    = cartoes.reduce((s,c)=>s+(c.fatura||0),0)
  const saldo          = resumo.receitas - resumo.despesas
  const now = new Date()
  const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

  if (loading) return (
    <SafeAreaView style={{ flex:1, backgroundColor:C.bg, justifyContent:'center', alignItems:'center' }}>
      <ActivityIndicator size="large" color={C.primary} />
    </SafeAreaView>
  )

  return (
    <SafeAreaView style={{ flex:1, backgroundColor:C.bg }}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />

      <ScrollView style={{ flex:1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom:120 }}>

        {/* ── HERO ── */}
        <View style={{ backgroundColor:C.card, paddingHorizontal:24, paddingTop:28, paddingBottom:24 }}>
          <Text style={[T.caption, { marginBottom:20 }]}>
            {meses[now.getMonth()]} {now.getFullYear()} · {profile.nome?.split(' ')[0]}
          </Text>

          {/* Saldo principal */}
          <Text style={[T.label, { marginBottom:8 }]}>Saldo do mês</Text>
          <Text style={[T.hero, { color: saldo>=0 ? C.primary : C.red, marginBottom:16 }]}>
            {fmt(saldo)}
          </Text>

          {/* Linha receita / despesa */}
          <View style={{ flexDirection:'row', gap:24 }}>
            <View style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
              <View style={{ width:3, height:28, borderRadius:2, backgroundColor:C.green }} />
              <View>
                <Text style={[T.label, { marginBottom:2 }]}>Receitas</Text>
                <Text style={{ fontSize:16, fontWeight:'600', color:C.primary }}>{fmt(resumo.receitas)}</Text>
              </View>
            </View>
            <View style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
              <View style={{ width:3, height:28, borderRadius:2, backgroundColor:C.red }} />
              <View>
                <Text style={[T.label, { marginBottom:2 }]}>Despesas</Text>
                <Text style={{ fontSize:16, fontWeight:'600', color:C.primary }}>{fmt(resumo.despesas)}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── CARDS HORIZONTAIS ── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal:20, paddingVertical:16, gap:10 }}>
          {bancoPrincipal && (
            <View style={s.miniCard}>
              <Text style={[T.label, { marginBottom:6 }]}>{bancoPrincipal.banco}</Text>
              <Text style={{ fontSize:17, fontWeight:'600', color:C.primary }}>{fmt(bancoPrincipal.saldo)}</Text>
              <Text style={[T.caption, { marginTop:3 }]}>banco principal</Text>
            </View>
          )}
          {faturaTotal > 0 && (
            <View style={[s.miniCard, { borderTopWidth:2.5, borderTopColor:C.red }]}>
              <Text style={[T.label, { marginBottom:6, color:C.red }]}>Faturas</Text>
              <Text style={{ fontSize:17, fontWeight:'600', color:C.red }}>{fmt(faturaTotal)}</Text>
              <Text style={[T.caption, { marginTop:3 }]}>{cartoes.length} cartão(ões)</Text>
            </View>
          )}
          {bancos.length > 1 && (
            <View style={s.miniCard}>
              <Text style={[T.label, { marginBottom:6 }]}>Total contas</Text>
              <Text style={{ fontSize:17, fontWeight:'600', color:C.primary }}>{fmt(resumo.saldoBancos)}</Text>
              <Text style={[T.caption, { marginTop:3 }]}>{bancos.length} contas</Text>
            </View>
          )}
        </ScrollView>

        {/* ── ÚLTIMOS LANÇAMENTOS ── */}
        <SectionHeader title="Lançamentos recentes" />
        <View style={[s.card, { marginHorizontal:16 }]}>
          {recentes.length === 0 ? (
            <View style={{ padding:32, alignItems:'center' }}>
              <Text style={{ fontSize:28, marginBottom:10 }}>💸</Text>
              <Text style={[T.body, { textAlign:'center', marginBottom:6 }]}>Sem lançamentos</Text>
              <Text style={[T.caption, { textAlign:'center' }]}>Use os botões abaixo para começar</Text>
            </View>
          ) : recentes.map((d, idx) => (
            <View key={d.id}>
              <View style={s.itemRow}>
                <View style={s.itemIconWrap}>
                  <Text style={{ fontSize:18 }}>{CAT_ICONS[d.categoria]||'💸'}</Text>
                </View>
                <View style={{ flex:1 }}>
                  <Text style={[T.body, { fontWeight:'500' }]} numberOfLines={1}>{d.nome}</Text>
                  <Text style={[T.caption, { marginTop:2 }]}>
                    {d.categoria}
                    {d.pagamento_tipo==='cartao' ? ` · 💳 ${d.cartao_nome}` : ` · 🏦 débito`}
                    {d.quem !== profile.papel ? ` · ${d.quem==='casal'?'Casal':'Ela'}` : ''}
                  </Text>
                </View>
                <Text style={{ fontSize:15, fontWeight:'600', color:C.red }}>
                  -{fmt(d.valor)}
                </Text>
              </View>
              {idx < recentes.length-1 && <Divider />}
            </View>
          ))}
        </View>

      </ScrollView>

      {/* ── BARRA DE AÇÕES ── */}
      <View style={s.actionBar}>
        {/* Receita */}
        <TouchableOpacity style={[s.actionBtn, { backgroundColor:C.greenBg }]} onPress={()=>setMRec(true)}>
          <View style={[s.actionIconCircle, { backgroundColor:C.green }]}>
            <Text style={{ fontSize:18 }}>↑</Text>
          </View>
          <Text style={[T.caption, { marginTop:5, color:C.green, fontWeight:'600' }]}>Receita</Text>
        </TouchableOpacity>

        {/* Despesa — destaque */}
        <TouchableOpacity style={[s.actionBtn, s.actionBtnMain, { backgroundColor:C.red }]} onPress={()=>setMDesp(true)}>
          <Text style={{ fontSize:26, color:'#fff' }}>+</Text>
          <Text style={{ fontSize:13, color:'#fff', fontWeight:'700', marginTop:2 }}>Despesa</Text>
        </TouchableOpacity>

        {/* QR */}
        <TouchableOpacity style={[s.actionBtn, { backgroundColor:C.blueBg }]} onPress={abrirQR}>
          <View style={[s.actionIconCircle, { backgroundColor:C.blue }]}>
            <Text style={{ fontSize:18 }}>⌗</Text>
          </View>
          <Text style={[T.caption, { marginTop:5, color:C.blue, fontWeight:'600' }]}>QR Code</Text>
        </TouchableOpacity>
      </View>

      {/* ── IA TOAST ── */}
      {iaMsg !== '' && (
        <Animated.View style={[s.iaToast, {
          opacity: iaAnim,
          transform:[{ translateY: iaAnim.interpolate({ inputRange:[0,1], outputRange:[12,0] }) }]
        }]}>
          <View style={{ flexDirection:'row', alignItems:'flex-start', gap:10 }}>
            <View style={{ width:28, height:28, borderRadius:8, backgroundColor:'rgba(255,255,255,0.15)', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <Text style={{ fontSize:14 }}>💡</Text>
            </View>
            <View style={{ flex:1 }}>
              <Text style={{ fontSize:10, color:'rgba(255,255,255,0.6)', fontWeight:'600', letterSpacing:0.8, textTransform:'uppercase', marginBottom:3 }}>IA</Text>
              <Text style={{ fontSize:13, color:'#fff', lineHeight:18 }}>{iaMsg}</Text>
            </View>
            <TouchableOpacity onPress={()=>{ Animated.timing(iaAnim,{toValue:0,duration:200,useNativeDriver:true}).start(()=>setIaMsg('')) }}>
              <Text style={{ fontSize:20, color:'rgba(255,255,255,0.4)', lineHeight:24 }}>×</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}

      {/* ── MODAL DESPESA ── */}
      <Modal visible={mDesp} animationType="slide" presentationStyle="pageSheet" onRequestClose={()=>setMDesp(false)}>
        <SafeAreaView style={{ flex:1, backgroundColor:C.bg }}>
          <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':'height'} style={{ flex:1 }}>
            <ScrollView contentContainerStyle={{ padding:24 }} keyboardShouldPersistTaps="handled">

              {/* Handle bar */}
              <View style={{ width:36, height:4, borderRadius:2, backgroundColor:C.tertiary, alignSelf:'center', marginBottom:24 }} />

              <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:24 }}>
                <Text style={[T.title, { fontSize:20 }]}>Nova despesa</Text>
                <TouchableOpacity onPress={()=>setMDesp(false)} style={{ padding:4 }}>
                  <View style={{ width:28, height:28, borderRadius:14, backgroundColor:C.border, alignItems:'center', justifyContent:'center' }}>
                    <Text style={{ fontSize:14, color:C.secondary, fontWeight:'600' }}>✕</Text>
                  </View>
                </TouchableOpacity>
              </View>

              {/* Valor em destaque */}
              <View style={{ backgroundColor:C.card, borderRadius:16, padding:20, marginBottom:20, alignItems:'center' }}>
                <Text style={[T.label, { marginBottom:10 }]}>Valor (R$)</Text>
                <TextInput
                  style={{ fontSize:40, fontWeight:'700', color:dValor?C.red:C.tertiary, letterSpacing:-1, textAlign:'center', minWidth:120 }}
                  placeholder="0,00" placeholderTextColor={C.tertiary}
                  value={dValor} onChangeText={setDValor}
                  keyboardType="numeric" autoFocus
                />
              </View>

              <FieldLabel>Descrição</FieldLabel>
              <Input placeholder="Ex: Supermercado, Uber..." value={dNome} onChangeText={setDNome} />

              <FieldLabel>Categoria</FieldLabel>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom:16 }}>
                {CATS.map(c => <Chip key={c} label={`${CAT_ICONS[c]} ${c}`} selected={dCat===c} onPress={()=>setDCat(c)} />)}
              </ScrollView>

              <FieldLabel>Quem pagou?</FieldLabel>
              <View style={{ flexDirection:'row', gap:8, marginBottom:16 }}>
                {[['eu','EU'],['ela','ELA'],['casal','Casal']].map(([v,l]) => (
                  <Chip key={v} label={l} selected={dQuem===v} onPress={()=>setDQuem(v)} style={{ flex:1 }} />
                ))}
              </View>

              <FieldLabel>Pagamento</FieldLabel>
              <View style={{ flexDirection:'row', gap:8, marginBottom:16 }}>
                <Chip label="💵 Débito" selected={dPagTipo==='debito'} onPress={()=>setDPagTipo('debito')} />
                <Chip label="💳 Cartão" selected={dPagTipo==='cartao'} onPress={()=>setDPagTipo('cartao')} />
              </View>

              {dPagTipo==='debito' && bancos.length>0 && (
                <>
                  <FieldLabel>Banco</FieldLabel>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom:16 }}>
                    {bancos.map(b => <Chip key={b.id} label={`${b.id===profile.banco_principal_id?'⭐ ':''}${b.banco}`} selected={dBancoId===b.id} onPress={()=>setDBancoId(b.id)} />)}
                  </ScrollView>
                </>
              )}
              {dPagTipo==='cartao' && cartoes.length>0 && (
                <>
                  <FieldLabel>Cartão</FieldLabel>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom:16 }}>
                    {cartoes.map(c => <Chip key={c.id} label={`${c.nome}`} selected={dCartaoId===c.id} onPress={()=>{setDCartaoId(c.id);setDCartaoNome(c.nome)}} />)}
                  </ScrollView>
                </>
              )}

              <PrimaryButton label="Lançar despesa" onPress={salvarDesp} loading={saving} color={C.red} />
              <View style={{ height:20 }} />
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* ── MODAL RECEITA ── */}
      <Modal visible={mRec} animationType="slide" presentationStyle="pageSheet" onRequestClose={()=>setMRec(false)}>
        <SafeAreaView style={{ flex:1, backgroundColor:C.bg }}>
          <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':'height'} style={{ flex:1 }}>
            <View style={{ padding:24 }}>
              <View style={{ width:36, height:4, borderRadius:2, backgroundColor:C.tertiary, alignSelf:'center', marginBottom:24 }} />
              <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:24 }}>
                <Text style={[T.title, { fontSize:20 }]}>Nova receita</Text>
                <TouchableOpacity onPress={()=>setMRec(false)} style={{ padding:4 }}>
                  <View style={{ width:28, height:28, borderRadius:14, backgroundColor:C.border, alignItems:'center', justifyContent:'center' }}>
                    <Text style={{ fontSize:14, color:C.secondary, fontWeight:'600' }}>✕</Text>
                  </View>
                </TouchableOpacity>
              </View>

              {/* Valor destaque */}
              <View style={{ backgroundColor:C.card, borderRadius:16, padding:20, marginBottom:20, alignItems:'center' }}>
                <Text style={[T.label, { marginBottom:10 }]}>Valor (R$)</Text>
                <TextInput
                  style={{ fontSize:40, fontWeight:'700', color:rValor?C.green:C.tertiary, letterSpacing:-1, textAlign:'center', minWidth:120 }}
                  placeholder="0,00" placeholderTextColor={C.tertiary}
                  value={rValor} onChangeText={setRValor}
                  keyboardType="numeric" autoFocus
                />
              </View>

              <FieldLabel>Tipo</FieldLabel>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom:16 }}>
                {TIPOS_REC.map(([v,l]) => <Chip key={v} label={l} selected={rTipo===v} onPress={()=>setRTipo(v)} color={C.green} />)}
              </ScrollView>

              <FieldLabel>De quem?</FieldLabel>
              <View style={{ flexDirection:'row', gap:8, marginBottom:16 }}>
                {[['eu','EU'],['ela','ELA']].map(([v,l]) => <Chip key={v} label={l} selected={rQuem===v} onPress={()=>setRQuem(v)} color={C.green} />)}
              </View>

              {bancos.length>0 && (
                <>
                  <FieldLabel>Entrar em qual banco?</FieldLabel>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom:16 }}>
                    {[{id:'',banco:'Nenhum'}, ...bancos].map(b => (
                      <Chip key={b.id} label={`${b.id===profile.banco_principal_id?'⭐ ':''}${b.banco}`} selected={rBancoId===b.id} onPress={()=>setRBancoId(b.id)} color={C.green} />
                    ))}
                  </ScrollView>
                </>
              )}

              <PrimaryButton label="Lançar receita" onPress={salvarRec} loading={saving} color={C.green} />
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* ── MODAL QR ── */}
      <Modal visible={mQR} animationType="slide" onRequestClose={()=>setMQR(false)}>
        <SafeAreaView style={{ flex:1, backgroundColor:'#000' }}>
          <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', padding:20 }}>
            <Text style={{ color:'#fff', fontSize:17, fontWeight:'600' }}>Nota fiscal</Text>
            <TouchableOpacity onPress={()=>setMQR(false)} style={{ width:32, height:32, borderRadius:16, backgroundColor:'rgba(255,255,255,0.15)', alignItems:'center', justifyContent:'center' }}>
              <Text style={{ color:'#fff', fontSize:18, fontWeight:'300' }}>✕</Text>
            </TouchableOpacity>
          </View>
          {qrLoading ? (
            <View style={{ flex:1, justifyContent:'center', alignItems:'center' }}>
              <ActivityIndicator size="large" color="#fff" />
              <Text style={{ color:'rgba(255,255,255,0.7)', marginTop:16, fontSize:14 }}>Lendo nota fiscal...</Text>
            </View>
          ) : (
            <CameraView style={{ flex:1 }} facing="back"
              onBarcodeScanned={qrScanned?undefined:onQRScanned}
              barcodeScannerSettings={{ barcodeTypes:['qr','pdf417'] }}>
              <View style={{ flex:1, justifyContent:'center', alignItems:'center' }}>
                {/* Frame */}
                <View style={{ width:240, height:240, position:'relative', marginBottom:32 }}>
                  {[{top:0,left:0},{top:0,right:0},{bottom:0,left:0},{bottom:0,right:0}].map((pos,i)=>(
                    <View key={i} style={[{ position:'absolute', width:32, height:32 }, pos,
                      { borderTopWidth: i<2?3:0, borderBottomWidth:i>=2?3:0,
                        borderLeftWidth: i%2===0?3:0, borderRightWidth: i%2===1?3:0,
                        borderColor:'#fff', borderRadius:2 }]} />
                  ))}
                </View>
                <Text style={{ color:'rgba(255,255,255,0.8)', fontSize:14, textAlign:'center' }}>
                  Aponte para o QR Code da nota fiscal
                </Text>
              </View>
            </CameraView>
          )}
        </SafeAreaView>
      </Modal>

    </SafeAreaView>
  )
}

// ── PERFIL SETUP ──────────────────────────────────────
function ProfileSetupScreen({ session, onDone }) {
  const [nome, setNome]       = useState('')
  const [papel, setPapel]     = useState('eu')
  const [renda, setRenda]     = useState('')
  const [codigo, setCodigo]   = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle().then(({data})=>{
      if (data) { setNome(data.nome||''); setPapel(data.papel||'eu'); setRenda(data.renda?String(data.renda):''); setCodigo(data.casal_code||'') }
    })
  }, [])

  async function salvar() {
    if (!nome||!renda) { Alert.alert('Preencha nome e renda'); return }
    setLoading(true)
    const uid = session.user.id
    const cc  = codigo.trim().toLowerCase() || uid.slice(0,8)
    try {
      const { error:ue } = await supabase.from('profiles').update({ nome, papel, renda:parseFloat(renda), pct_reserva:5, objetivo:'controle', casal_code:cc }).eq('id', uid)
      if (ue) {
        const { error:ie } = await supabase.from('profiles').insert({ id:uid, nome, papel, renda:parseFloat(renda), pct_reserva:5, objetivo:'controle', casal_code:cc })
        if (ie) throw ie
      }
      onDone()
    } catch(e) { Alert.alert('Erro', e.message) }
    finally { setLoading(false) }
  }

  return (
    <SafeAreaView style={{ flex:1, backgroundColor:C.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':'height'} style={{ flex:1 }}>
        <ScrollView contentContainerStyle={{ padding:32 }} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems:'center', marginBottom:32 }}>
            <View style={{ width:56, height:56, borderRadius:16, backgroundColor:C.primary, alignItems:'center', justifyContent:'center', marginBottom:14 }}>
              <Text style={{ fontSize:28 }}>💑</Text>
            </View>
            <Text style={[T.title, { fontSize:22, marginBottom:6 }]}>Configure seu perfil</Text>
            <Text style={T.caption}>Só leva 1 minuto</Text>
          </View>

          <View style={[s.card, { padding:24, gap:4 }]}>
            <FieldLabel>Seu nome</FieldLabel>
            <Input placeholder="Como quer ser chamado(a)?" value={nome} onChangeText={setNome} />

            <FieldLabel>Você é</FieldLabel>
            <View style={{ flexDirection:'row', gap:8, marginBottom:8 }}>
              {[['eu','👤 EU'],['ela','👤 ELA']].map(([v,l]) => (
                <Chip key={v} label={l} selected={papel===v} onPress={()=>setPapel(v)} />
              ))}
            </View>

            <FieldLabel>Renda mensal (R$)</FieldLabel>
            <Input placeholder="Ex: 8500" value={renda} onChangeText={setRenda} keyboardType="numeric" />

            <FieldLabel>Código do casal</FieldLabel>
            <Input placeholder="Ex: joaoemaria2024 (compartilhe com seu parceiro)" value={codigo} onChangeText={setCodigo} autoCapitalize="none" />
            <Text style={[T.caption, { marginBottom:8, marginTop:-8 }]}>
              Compartilhe com seu parceiro para ver os dados juntos
            </Text>

            <PrimaryButton label="Salvar e entrar" onPress={salvar} loading={loading} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

// ── ROOT ──────────────────────────────────────────────
export default function App() {
  const [session, setSession]   = useState(null)
  const [profile, setProfile]   = useState(null)
  const [loadingApp, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data:{ session } }) => {
      setSession(session)
      if (session) loadProfile(session.user.id)
      else setLoading(false)
    })
    supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session)
      if (session) loadProfile(session.user.id)
      else { setProfile(null); setLoading(false) }
    })
  }, [])

  async function loadProfile(uid) {
    const { data } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle()
    setProfile(data)
    setLoading(false)
  }

  if (loadingApp) return (
    <View style={{ flex:1, backgroundColor:C.bg, justifyContent:'center', alignItems:'center' }}>
      <ActivityIndicator size="large" color={C.primary} />
    </View>
  )

  if (!session) return <LoginScreen />
  if (!profile) return <ProfileSetupScreen session={session} onDone={()=>loadProfile(session.user.id)} />
  return <HomeScreen session={session} profile={profile} />
}

// ── STYLES ────────────────────────────────────────────
const s = StyleSheet.create({
  card: {
    backgroundColor: C.card,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width:0, height:1 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  miniCard: {
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 16,
    width: 148,
    shadowColor: '#000',
    shadowOffset: { width:0, height:1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  input: {
    backgroundColor: C.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: C.primary,
    marginBottom: 16,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: C.border,
    marginRight: 8,
    borderWidth: 0,
  },
  chipTxt: {
    fontSize: 13,
    color: C.secondary,
    fontWeight: '500',
  },
  btnPrimary: {
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  btnPrimaryTxt: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  itemIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBar: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS==='ios' ? 32 : 16,
    backgroundColor: C.card,
    borderTopWidth: 0.5,
    borderTopColor: C.border,
    shadowColor: '#000',
    shadowOffset: { width:0, height:-2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 8,
  },
  actionBtn: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnMain: {
    flex: 1.6,
    paddingVertical: 16,
  },
  actionIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iaToast: {
    position: 'absolute',
    bottom: Platform.OS==='ios' ? 110 : 88,
    left: 16,
    right: 16,
    backgroundColor: C.primary,
    borderRadius: 16,
    padding: 16,
    zIndex: 999,
    shadowColor: '#000',
    shadowOffset: { width:0, height:4 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 10,
  },
})