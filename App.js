import { createClient } from '@supabase/supabase-js'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { useEffect, useRef, useState } from 'react'
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

// ── CONFIGURAÇÃO ──────────────────────────────────────
const SUPABASE_URL     = 'https://cpombcvppitlgynqzhsr.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwb21iY3ZwcGl0bGd5bnF6aHNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3MzEwMzYsImV4cCI6MjA5MjMwNzAzNn0.qb7WC2lGELaK5C8Ga09Bhs3tHDL04sW2SeY_SFMoZ1A'
const API_URL          = 'https://financascasal-backend.vercel.app'
// ──────────────────────────────────────────────────────

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
const { width: SW } = Dimensions.get('window')

const C = {
  bg: '#F9F8F6', card: '#FFFFFF', primary: '#1A1A1A',
  secondary: '#6B6B6B', border: '#E8E6E0',
  green: '#1D9E75', red: '#E24B4A', blue: '#178DD1',
  yellow: '#EF9F27',
}

const CATS = ['Alimentação','Moradia','Transporte','Saúde','Lazer','Educação','Assinaturas','Investimento','Outros']
const CAT_ICONS = { Alimentação:'🛒', Moradia:'🏠', Transporte:'🚗', Saúde:'💊', Lazer:'🎉', Educação:'📚', Assinaturas:'📺', Investimento:'💰', Outros:'💸' }

function fmt(n) {
  return 'R$ ' + Number(n||0).toLocaleString('pt-BR', { minimumFractionDigits:2, maximumFractionDigits:2 })
}

// ── LOGIN ─────────────────────────────────────────────
function LoginScreen() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [loading, setLoading] = useState(false)
  const [modo, setModo] = useState('login')
  const [msg, setMsg] = useState('')

  async function handleAuth() {
    if (modo === 'recuperar') {
      if (!email) { Alert.alert('Informe seu e-mail'); return }
      setLoading(true)
      const { error } = await supabase.auth.resetPasswordForEmail(email)
      setLoading(false)
      if (error) Alert.alert('Erro', error.message)
      else { setMsg('✅ Link enviado! Verifique seu e-mail.'); setModo('login') }
      return
    }
    if (!email || !senha) { Alert.alert('Preencha e-mail e senha'); return }
    setLoading(true)
    try {
      if (modo === 'cadastro') {
        const { error } = await supabase.auth.signUp({ email, password: senha })
        if (error) throw error
        Alert.alert('Cadastro feito!', 'Verifique seu e-mail para confirmar.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
        if (error) throw error
      }
    } catch (e) { Alert.alert('Erro', e.message) }
    finally { setLoading(false) }
  }

  return (
    <SafeAreaView style={[s.safe, { justifyContent:'center' }]}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
      <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':'height'}>
        <View style={{ padding:32 }}>
          <Text style={{ fontSize:52, textAlign:'center', marginBottom:8 }}>💑</Text>
          <Text style={{ fontSize:28, fontWeight:'700', textAlign:'center', color:C.primary, marginBottom:4 }}>FinançasCasal</Text>
          <Text style={{ fontSize:14, color:C.secondary, textAlign:'center', marginBottom:32 }}>
            {modo==='recuperar' ? 'Recuperar senha' : modo==='cadastro' ? 'Criar conta' : 'Lançamento rápido'}
          </Text>
          {msg!=='' && <View style={{ backgroundColor:'#E1F5EE', borderRadius:10, padding:12, marginBottom:14 }}><Text style={{ fontSize:13, color:C.green }}>{msg}</Text></View>}
          {modo!=='recuperar' && (
            <>
              <TextInput style={s.input} placeholder="E-mail" placeholderTextColor={C.secondary} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
              <TextInput style={s.input} placeholder="Senha" placeholderTextColor={C.secondary} value={senha} onChangeText={setSenha} secureTextEntry />
            </>
          )}
          {modo==='recuperar' && (
            <TextInput style={s.input} placeholder="E-mail" placeholderTextColor={C.secondary} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
          )}
          <TouchableOpacity style={s.btnPrimary} onPress={handleAuth} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnPrimaryTxt}>{modo==='login'?'Entrar':modo==='cadastro'?'Criar conta':'Enviar link'}</Text>}
          </TouchableOpacity>
          {modo==='login' && (
            <TouchableOpacity onPress={()=>{setModo('recuperar');setMsg('')}}>
              <Text style={{ textAlign:'center', color:C.secondary, fontSize:13, marginTop:12, textDecorationLine:'underline' }}>Esqueci minha senha</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={()=>{ setMsg(''); setModo(modo==='login'?'cadastro': modo==='cadastro'?'login':'login') }}>
            <Text style={{ textAlign:'center', color:C.secondary, fontSize:13, marginTop:10, textDecorationLine:'underline' }}>
              {modo==='login'?'Não tem conta? Cadastre-se': modo==='cadastro'?'Já tem conta? Entrar':'Voltar para o login'}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

// ── TELA PRINCIPAL ────────────────────────────────────
function HomeScreen({ session, profile }) {
  const [bancos, setBancos] = useState([])
  const [cartoes, setCartoes] = useState([])
  const [recentes, setRecentes] = useState([])
  const [resumo, setResumo] = useState({ receitas:0, despesas:0, saldoBancos:0 })
  const [loading, setLoading] = useState(true)

  // Modal despesa
  const [mDesp, setMDesp] = useState(false)
  const [dNome, setDNome] = useState('')
  const [dValor, setDValor] = useState('')
  const [dCat, setDCat] = useState('Alimentação')
  const [dQuem, setDQuem] = useState(profile.papel)
  const [dPagTipo, setDPagTipo] = useState('debito')
  const [dBancoId, setDBancoId] = useState('')
  const [dCartaoId, setDCartaoId] = useState('')
  const [dCartaoNome, setDCartaoNome] = useState('')

  // Modal receita
  const [mRec, setMRec] = useState(false)
  const [rTipo, setRTipo] = useState('salario')
  const [rValor, setRValor] = useState('')
  const [rQuem, setRQuem] = useState(profile.papel)
  const [rBancoId, setRBancoId] = useState('')

  // QR Code
  const [mQR, setMQR] = useState(false)
  const [permission, requestPermission] = useCameraPermissions()
  const [qrScanned, setQrScanned] = useState(false)
  const [qrLoading, setQrLoading] = useState(false)

  // IA Toast
  const [iaMsg, setIaMsg] = useState('')
  const iaAnim = useRef(new Animated.Value(0)).current

  const [saving, setSaving] = useState(false)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const uid = session.user.id
    const cc = profile.casal_code
    const cf = q => cc ? q.eq('casal_code', cc) : q.eq('user_id', uid)
    const now = new Date()
    try {
      const [b, c, d, r] = await Promise.all([
        cf(supabase.from('contas_banco').select('*')),
        cf(supabase.from('cartoes').select('*')),
        cf(supabase.from('despesas').select('*')).eq('mes', now.getMonth()).eq('ano', now.getFullYear()).order('created_at', { ascending:false }).limit(10),
        cf(supabase.from('receitas').select('valor,quem')).eq('mes', now.getMonth()).eq('ano', now.getFullYear()),
      ])
      if (b.data) {
        setBancos(b.data)
        const principal = b.data.find(x => x.id === profile.banco_principal_id) || b.data[0]
        if (principal) { setDBancoId(principal.id); setRBancoId(principal.id) }
      }
      if (c.data) {
        setCartoes(c.data)
        if (c.data.length > 0) { setDCartaoId(c.data[0].id); setDCartaoNome(c.data[0].nome) }
      }
      if (d.data) setRecentes(d.data)
      const totalRec = (r.data||[]).reduce((s,x)=>s+x.valor,0)
      const totalDesp = (d.data||[]).reduce((s,x)=>s+x.valor,0)
      const saldoBancos = (b.data||[]).reduce((s,x)=>s+x.saldo,0)
      setResumo({ receitas:totalRec, despesas:totalDesp, saldoBancos })
    } catch(e) { console.log(e) }
    finally { setLoading(false) }
  }

  // IA toast animado
  async function chamarIA(prompt) {
    try {
      const res = await fetch(`${API_URL}/api/analise`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ prompt }),
      })
      if (!res.ok) return
      const data = await res.json()
      const msg = data.resultado || data.resposta || ''
      if (!msg) return
      setIaMsg(msg.trim())
      Animated.sequence([
        Animated.timing(iaAnim, { toValue:1, duration:300, useNativeDriver:true }),
        Animated.delay(6000),
        Animated.timing(iaAnim, { toValue:0, duration:300, useNativeDriver:true }),
      ]).start(() => setIaMsg(''))
    } catch(e) { /* falha silenciosa */ }
  }

  // ── SALVAR DESPESA ──
  async function salvarDesp() {
    if (!dNome||!dValor) { Alert.alert('Preencha nome e valor'); return }
    setSaving(true)
    const uid = session.user.id
    const cc = profile.casal_code || uid
    const v = parseFloat(dValor)
    const now = new Date()
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
      setMDesp(false)
      setDNome(''); setDValor('')
      loadData()
      // IA sugestão
      chamarIA(`Consultor financeiro. Despesa lançada: "${dNome}" R$${v} em ${dCat}. Total despesas mês: R$${resumo.despesas+v}. Dê UMA dica prática em 1 frase (máx 20 palavras). Só a dica, sem introdução.`)
    } catch(e) { Alert.alert('Erro', e.message) }
    finally { setSaving(false) }
  }

  // ── SALVAR RECEITA ──
  async function salvarRec() {
    if (!rValor) { Alert.alert('Informe o valor'); return }
    setSaving(true)
    const uid = session.user.id
    const cc = profile.casal_code || uid
    const v = parseFloat(rValor)
    const now = new Date()
    try {
      await supabase.from('receitas').insert({ user_id:uid, casal_code:cc, tipo:rTipo, valor:v, quem:rQuem, mes:now.getMonth(), ano:now.getFullYear() })
      if (rBancoId) {
        const banco = bancos.find(b=>b.id===rBancoId)
        if (banco) {
          const ns = (banco.saldo||0) + v
          await supabase.from('contas_banco').update({ saldo:ns }).eq('id', rBancoId)
          await supabase.from('extrato_banco').insert({ user_id:uid, casal_code:cc, banco_id:rBancoId, banco_nome:banco.banco, tipo:'entrada', descricao:rTipo, categoria:rTipo, valor:v, saldo_apos:ns, mes:now.getMonth(), ano:now.getFullYear() })
        }
      }
      setMRec(false); setRValor('')
      loadData()
      chamarIA(`Consultor financeiro. Receita registrada: R$${v}. Reserva automática ${profile.pct_reserva||5}%. Dê UMA dica sobre o que fazer com esse dinheiro em 1 frase (máx 20 palavras). Só a dica.`)
    } catch(e) { Alert.alert('Erro', e.message) }
    finally { setSaving(false) }
  }

  // ── QR CODE (Nota Fiscal) ──
  async function abrirQR() {
    if (!permission?.granted) {
      const { granted } = await requestPermission()
      if (!granted) { Alert.alert('Permissão negada', 'Precisa de acesso à câmera'); return }
    }
    setQrScanned(false); setMQR(true)
  }

  async function onQRScanned({ data }) {
    if (qrScanned || qrLoading) return
    setQrScanned(true); setQrLoading(true)
    try {
      // Nota fiscal eletrônica brasileira — extrai chave de acesso da URL
      const chaveMatch = data.match(/p=(\d{44})/) || data.match(/(\d{44})/)
      if (!chaveMatch) {
        Alert.alert('QR Code inválido', 'Este QR Code não parece ser de uma nota fiscal. Você pode lançar a despesa manualmente.', [
          { text: 'OK', onPress:()=>{setMQR(false);setDNome('');setMDesp(true)} }
        ])
        return
      }
      const chave = chaveMatch[1]
      // Extrai valor da chave (posições 65-76 = valor total em centavos)
      const valorCentavos = parseInt(chave.substring(65, 77))
      const valor = valorCentavos / 100
      setMQR(false)
      setDNome('Compra nota fiscal')
      setDValor(String(valor))
      setDCat('Alimentação')
      setMDesp(true)
      Alert.alert('📄 Nota fiscal lida!', `Valor: ${fmt(valor)}\n\nConfira os dados e ajuste o nome e categoria antes de lançar.`)
    } catch(e) {
      setMQR(false)
      Alert.alert('Erro ao ler QR', 'Não foi possível ler os dados. Lance manualmente.')
    } finally { setQrLoading(false) }
  }

  const bancoPrincipal = bancos.find(b=>b.id===profile.banco_principal_id) || bancos[0]
  const faturaTotal = cartoes.reduce((s,c)=>s+(c.fatura||0),0)
  const saldo = resumo.receitas - resumo.despesas

  if (loading) return (
    <SafeAreaView style={[s.safe, { justifyContent:'center', alignItems:'center' }]}>
      <ActivityIndicator size="large" color={C.primary} />
      <Text style={{ color:C.secondary, marginTop:12, fontSize:14 }}>Carregando...</Text>
    </SafeAreaView>
  )

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />

      <ScrollView style={s.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom:140 }}>

        {/* Header */}
        <View style={{ padding:24, paddingBottom:8 }}>
          <Text style={{ fontSize:13, color:C.secondary, marginBottom:4 }}>Olá, {profile.nome?.split(' ')[0]} 👋</Text>
          <Text style={{ fontSize:28, fontWeight:'500', letterSpacing:-1, color:saldo>=0?C.primary:C.red }}>{fmt(saldo)}</Text>
          <Text style={{ fontSize:12, color:C.secondary, marginTop:2 }}>saldo do mês · rec: {fmt(resumo.receitas)} · desp: {fmt(resumo.despesas)}</Text>
        </View>

        {/* Cards resumo */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal:20, gap:10, paddingBottom:4 }}>
          {/* Banco principal */}
          {bancoPrincipal && (
            <View style={[s.miniCard, { backgroundColor:'#EEF6FF' }]}>
              <Text style={{ fontSize:11, color:C.blue, fontWeight:'600', marginBottom:4 }}>🏦 {bancoPrincipal.banco}</Text>
              <Text style={{ fontSize:18, fontWeight:'500', color:C.primary }}>{fmt(bancoPrincipal.saldo)}</Text>
              <Text style={{ fontSize:10, color:C.secondary, marginTop:2 }}>banco principal</Text>
            </View>
          )}
          {/* Faturas */}
          {faturaTotal > 0 && (
            <View style={[s.miniCard, { backgroundColor:'#FCEBEB' }]}>
              <Text style={{ fontSize:11, color:C.red, fontWeight:'600', marginBottom:4 }}>💳 Faturas</Text>
              <Text style={{ fontSize:18, fontWeight:'500', color:C.red }}>{fmt(faturaTotal)}</Text>
              <Text style={{ fontSize:10, color:C.secondary, marginTop:2 }}>{cartoes.length} cartão(ões)</Text>
            </View>
          )}
          {/* Total bancos */}
          <View style={[s.miniCard, { backgroundColor:'#F5F3EF' }]}>
            <Text style={{ fontSize:11, color:C.secondary, fontWeight:'600', marginBottom:4 }}>💰 Bancos</Text>
            <Text style={{ fontSize:18, fontWeight:'500', color:C.primary }}>{fmt(resumo.saldoBancos)}</Text>
            <Text style={{ fontSize:10, color:C.secondary, marginTop:2 }}>{bancos.length} conta(s)</Text>
          </View>
        </ScrollView>

        {/* Últimos lançamentos */}
        <View style={{ padding:24, paddingTop:20 }}>
          <Text style={s.secTitle}>Últimos lançamentos</Text>
          {recentes.length === 0 && (
            <Text style={{ color:C.secondary, fontSize:14, textAlign:'center', paddingVertical:24 }}>
              Nenhum lançamento este mês.{'\n'}Use os botões abaixo para começar!
            </Text>
          )}
          {recentes.map(d => (
            <View key={d.id} style={s.itemRow}>
              <View style={s.itemIcon}>
                <Text style={{ fontSize:20 }}>{CAT_ICONS[d.categoria]||'💸'}</Text>
              </View>
              <View style={{ flex:1 }}>
                <Text style={{ fontSize:14, fontWeight:'500', color:C.primary }}>{d.nome}</Text>
                <Text style={{ fontSize:12, color:C.secondary, marginTop:1 }}>
                  {d.categoria} · {d.pagamento_tipo==='cartao'?'💳 '+d.cartao_nome:'🏦 débito'}
                </Text>
              </View>
              <Text style={{ fontSize:14, fontWeight:'500', color:C.red }}>-{fmt(d.valor)}</Text>
            </View>
          ))}
        </View>

      </ScrollView>

      {/* ── 3 BOTÕES DE AÇÃO ── */}
      <View style={s.actionBar}>
        <TouchableOpacity style={[s.actionBtn, { backgroundColor:C.green }]} onPress={()=>setMRec(true)}>
          <Text style={s.actionIcon}>💰</Text>
          <Text style={s.actionLabel}>Receita</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.actionBtn, s.actionBtnLarge, { backgroundColor:C.red }]} onPress={()=>setMDesp(true)}>
          <Text style={[s.actionIcon, { fontSize:28 }]}>💸</Text>
          <Text style={[s.actionLabel, { fontSize:15 }]}>Despesa</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.actionBtn, { backgroundColor:C.blue }]} onPress={abrirQR}>
          <Text style={s.actionIcon}>📷</Text>
          <Text style={s.actionLabel}>QR Code</Text>
        </TouchableOpacity>
      </View>

      {/* ── TOAST IA ── */}
      {iaMsg !== '' && (
        <Animated.View style={[s.iaToast, { opacity:iaAnim, transform:[{ translateY:iaAnim.interpolate({ inputRange:[0,1], outputRange:[20,0] }) }] }]}>
          <Text style={{ fontSize:12, fontWeight:'600', color:'rgba(255,255,255,0.6)', marginBottom:4 }}>💡 Sugestão da IA</Text>
          <Text style={{ fontSize:13, color:'#fff', lineHeight:18 }}>{iaMsg}</Text>
        </Animated.View>
      )}

      {/* ── MODAL DESPESA ── */}
      <Modal visible={mDesp} animationType="slide" presentationStyle="pageSheet" onRequestClose={()=>setMDesp(false)}>
        <SafeAreaView style={{ flex:1, backgroundColor:C.card }}>
          <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':'height'} style={{ flex:1 }}>
            <ScrollView contentContainerStyle={{ padding:24 }} keyboardShouldPersistTaps="handled">
              <View style={s.modalHeader}>
                <Text style={s.modalTitle}>💸 Nova despesa</Text>
                <TouchableOpacity onPress={()=>setMDesp(false)}><Text style={{ fontSize:26, color:C.secondary }}>×</Text></TouchableOpacity>
              </View>

              <Text style={s.fieldLabel}>Descrição</Text>
              <TextInput style={s.input} placeholder="Ex: Supermercado, Uber..." placeholderTextColor={C.secondary} value={dNome} onChangeText={setDNome} autoFocus />

              <Text style={s.fieldLabel}>Valor (R$)</Text>
              <TextInput style={[s.input, { fontSize:22, fontWeight:'500' }]} placeholder="0,00" placeholderTextColor={C.secondary} value={dValor} onChangeText={setDValor} keyboardType="numeric" />

              <Text style={s.fieldLabel}>Categoria</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom:16 }}>
                {CATS.map(c => (
                  <TouchableOpacity key={c} onPress={()=>setDCat(c)}
                    style={[s.chip, dCat===c&&s.chipSel]}>
                    <Text style={[s.chipTxt, dCat===c&&s.chipTxtSel]}>{CAT_ICONS[c]} {c}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={s.fieldLabel}>Quem pagou?</Text>
              <View style={{ flexDirection:'row', gap:8, marginBottom:16 }}>
                {[['eu','EU'],['ela','ELA'],['casal','Casal']].map(([v,l]) => (
                  <TouchableOpacity key={v} onPress={()=>setDQuem(v)}
                    style={[s.chip, { flex:1, alignItems:'center' }, dQuem===v&&s.chipSel]}>
                    <Text style={[s.chipTxt, dQuem===v&&s.chipTxtSel]}>{l}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.fieldLabel}>Pagamento</Text>
              <View style={{ flexDirection:'row', gap:8, marginBottom:16 }}>
                {[['debito','💵 Débito'],['cartao','💳 Cartão']].map(([v,l]) => (
                  <TouchableOpacity key={v} onPress={()=>setDPagTipo(v)}
                    style={[s.chip, { flex:1, alignItems:'center' }, dPagTipo===v&&s.chipSel]}>
                    <Text style={[s.chipTxt, dPagTipo===v&&s.chipTxtSel]}>{l}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {dPagTipo==='debito' && bancos.length>0 && (
                <>
                  <Text style={s.fieldLabel}>Banco</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom:16 }}>
                    {bancos.map(b => (
                      <TouchableOpacity key={b.id} onPress={()=>setDBancoId(b.id)}
                        style={[s.chip, dBancoId===b.id&&s.chipSel]}>
                        <Text style={[s.chipTxt, dBancoId===b.id&&s.chipTxtSel]}>
                          {b.id===profile.banco_principal_id?'⭐ ':''}{b.banco} {fmt(b.saldo)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </>
              )}

              {dPagTipo==='cartao' && cartoes.length>0 && (
                <>
                  <Text style={s.fieldLabel}>Cartão</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom:16 }}>
                    {cartoes.map(c => (
                      <TouchableOpacity key={c.id} onPress={()=>{setDCartaoId(c.id);setDCartaoNome(c.nome)}}
                        style={[s.chip, dCartaoId===c.id&&s.chipSel]}>
                        <Text style={[s.chipTxt, dCartaoId===c.id&&s.chipTxtSel]}>{c.nome} · livre {fmt(Math.max(0,c.limite-(c.fatura||0)))}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </>
              )}

              <TouchableOpacity style={[s.btnPrimary, { backgroundColor:C.red, marginTop:8 }]} onPress={salvarDesp} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.btnPrimaryTxt}>Lançar despesa</Text>}
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* ── MODAL RECEITA ── */}
      <Modal visible={mRec} animationType="slide" presentationStyle="pageSheet" onRequestClose={()=>setMRec(false)}>
        <SafeAreaView style={{ flex:1, backgroundColor:C.card }}>
          <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':'height'} style={{ flex:1 }}>
            <View style={{ padding:24 }}>
              <View style={s.modalHeader}>
                <Text style={s.modalTitle}>💰 Nova receita</Text>
                <TouchableOpacity onPress={()=>setMRec(false)}><Text style={{ fontSize:26, color:C.secondary }}>×</Text></TouchableOpacity>
              </View>

              <Text style={s.fieldLabel}>Tipo</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom:16 }}>
                {[['salario','💰 Salário'],['adiantamento','💵 Adiantamento'],['bonus','🎯 Bônus'],['freela','💻 Freela'],['outros','📦 Outros']].map(([v,l]) => (
                  <TouchableOpacity key={v} onPress={()=>setRTipo(v)}
                    style={[s.chip, rTipo===v&&s.chipSel]}>
                    <Text style={[s.chipTxt, rTipo===v&&s.chipTxtSel]}>{l}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={s.fieldLabel}>Valor (R$)</Text>
              <TextInput style={[s.input, { fontSize:22, fontWeight:'500' }]} placeholder="0,00" placeholderTextColor={C.secondary} value={rValor} onChangeText={setRValor} keyboardType="numeric" autoFocus />

              <Text style={s.fieldLabel}>De quem?</Text>
              <View style={{ flexDirection:'row', gap:8, marginBottom:16 }}>
                {[['eu','EU'],['ela','ELA']].map(([v,l]) => (
                  <TouchableOpacity key={v} onPress={()=>setRQuem(v)}
                    style={[s.chip, { flex:1, alignItems:'center' }, rQuem===v&&s.chipSel]}>
                    <Text style={[s.chipTxt, rQuem===v&&s.chipTxtSel]}>{l}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {bancos.length > 0 && (
                <>
                  <Text style={s.fieldLabel}>Entrar em qual banco?</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom:16 }}>
                    {[{ id:'', banco:'Nenhum' }, ...bancos].map(b => (
                      <TouchableOpacity key={b.id} onPress={()=>setRBancoId(b.id)}
                        style={[s.chip, rBancoId===b.id&&s.chipSel]}>
                        <Text style={[s.chipTxt, rBancoId===b.id&&s.chipTxtSel]}>
                          {b.id&&b.id===profile.banco_principal_id?'⭐ ':''}{b.banco}
                          {b.saldo!=null?' '+fmt(b.saldo):''}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </>
              )}

              <TouchableOpacity style={[s.btnPrimary, { backgroundColor:C.green, marginTop:8 }]} onPress={salvarRec} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.btnPrimaryTxt}>Lançar receita</Text>}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* ── MODAL QR CODE ── */}
      <Modal visible={mQR} animationType="slide" onRequestClose={()=>setMQR(false)}>
        <SafeAreaView style={{ flex:1, backgroundColor:'#000' }}>
          <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', padding:20 }}>
            <Text style={{ color:'#fff', fontSize:17, fontWeight:'600' }}>📷 Escanear nota fiscal</Text>
            <TouchableOpacity onPress={()=>setMQR(false)}>
              <Text style={{ color:'rgba(255,255,255,0.6)', fontSize:26 }}>×</Text>
            </TouchableOpacity>
          </View>
          {qrLoading ? (
            <View style={{ flex:1, justifyContent:'center', alignItems:'center' }}>
              <ActivityIndicator size="large" color="#fff" />
              <Text style={{ color:'#fff', marginTop:16, fontSize:14 }}>Lendo nota fiscal...</Text>
            </View>
          ) : (
            <CameraView style={{ flex:1 }} facing="back" onBarcodeScanned={qrScanned ? undefined : onQRScanned} barcodeScannerSettings={{ barcodeTypes:['qr','pdf417'] }}>
              {/* Guia de enquadramento */}
              <View style={{ flex:1, justifyContent:'center', alignItems:'center' }}>
                <View style={{ width:260, height:260, position:'relative' }}>
                  {[[-1,-1],[-1,1],[1,-1],[1,1]].map(([h,v],i) => (
                    <View key={i} style={{ position:'absolute', [h<0?'top':'bottom']:0, [v<0?'left':'right']:0, width:40, height:40,
                      borderTopWidth:h<0?3:0, borderBottomWidth:h>0?3:0,
                      borderLeftWidth:v<0?3:0, borderRightWidth:v>0?3:0,
                      borderColor:'#fff', borderRadius:2 }} />
                  ))}
                </View>
                <Text style={{ color:'rgba(255,255,255,0.8)', fontSize:14, marginTop:24, textAlign:'center' }}>
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

// ── PERFIL INICIAL ────────────────────────────────────
function ProfileSetupScreen({ session, onDone }) {
  const [nome, setNome] = useState('')
  const [papel, setPapel] = useState('eu')
  const [renda, setRenda] = useState('')
  const [codigoCasal, setCodigoCasal] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle().then(({ data }) => {
      if (data) { setNome(data.nome||''); setPapel(data.papel||'eu'); setRenda(data.renda?String(data.renda):''); setCodigoCasal(data.casal_code||'') }
    })
  }, [])

  async function salvar() {
    if (!nome||!renda) { Alert.alert('Preencha nome e renda'); return }
    setLoading(true)
    const uid = session.user.id
    const cc = codigoCasal.trim().toLowerCase() || uid.slice(0,8)
    try {
      const { error: ue } = await supabase.from('profiles').update({ nome, papel, renda:parseFloat(renda), pct_reserva:5, objetivo:'controle', casal_code:cc, notif_fatura:true, notif_reserva:true, notif_parcelas:true, notif_saldo:true, notif_diario:true }).eq('id', uid)
      if (ue) {
        const { error: ie } = await supabase.from('profiles').insert({ id:uid, nome, papel, renda:parseFloat(renda), pct_reserva:5, objetivo:'controle', casal_code:cc, notif_fatura:true, notif_reserva:true, notif_parcelas:true, notif_saldo:true, notif_diario:true })
        if (ie) throw ie
      }
      onDone()
    } catch(e) { Alert.alert('Erro', e.message) }
    finally { setLoading(false) }
  }

  return (
    <SafeAreaView style={[s.safe, { justifyContent:'center' }]}>
      <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':'height'}>
        <ScrollView contentContainerStyle={{ padding:32 }}>
          <Text style={{ fontSize:32, textAlign:'center', marginBottom:8 }}>💑</Text>
          <Text style={{ fontSize:22, fontWeight:'600', textAlign:'center', color:C.primary, marginBottom:24 }}>Configure seu perfil</Text>

          <Text style={s.fieldLabel}>Seu nome</Text>
          <TextInput style={s.input} placeholder="Como quer ser chamado(a)?" placeholderTextColor={C.secondary} value={nome} onChangeText={setNome} />

          <Text style={s.fieldLabel}>Você é</Text>
          <View style={{ flexDirection:'row', gap:8, marginBottom:16 }}>
            {[['eu','👤 EU'],['ela','👤 ELA']].map(([v,l]) => (
              <TouchableOpacity key={v} onPress={()=>setPapel(v)} style={[s.chip, { flex:1, alignItems:'center' }, papel===v&&s.chipSel]}>
                <Text style={[s.chipTxt, papel===v&&s.chipTxtSel]}>{l}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={s.fieldLabel}>Renda mensal (R$)</Text>
          <TextInput style={s.input} placeholder="Ex: 8500" placeholderTextColor={C.secondary} value={renda} onChangeText={setRenda} keyboardType="numeric" />

          <Text style={s.fieldLabel}>Código do casal (opcional)</Text>
          <TextInput style={s.input} placeholder="Ex: joaoemaria2024" placeholderTextColor={C.secondary} value={codigoCasal} onChangeText={setCodigoCasal} autoCapitalize="none" />
          <Text style={{ fontSize:12, color:C.secondary, marginBottom:16, marginTop:-10 }}>
            Compartilhe com seu parceiro(a) para ver tudo junto
          </Text>

          <TouchableOpacity style={s.btnPrimary} onPress={salvar} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnPrimaryTxt}>Salvar e entrar</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

// ── ROOT ──────────────────────────────────────────────
export default function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loadingApp, setLoadingApp] = useState(true)
  const [editingProfile, setEditingProfile] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) loadProfile(session.user.id)
      else setLoadingApp(false)
    })
    supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session)
      if (session) loadProfile(session.user.id)
      else { setProfile(null); setLoadingApp(false) }
    })
  }, [])

  async function loadProfile(uid) {
    const { data } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle()
    setProfile(data)
    setLoadingApp(false)
  }

  if (loadingApp) return (
    <View style={[s.safe, { justifyContent:'center', alignItems:'center', backgroundColor:C.bg }]}>
      <ActivityIndicator size="large" color={C.primary} />
    </View>
  )

  if (!session) return <LoginScreen />
  if (!profile || editingProfile) return <ProfileSetupScreen session={session} onDone={() => { setEditingProfile(false); loadProfile(session.user.id) }} />
  return <HomeScreen session={session} profile={profile} onEditProfile={() => setEditingProfile(true)} />
}

// ── ESTILOS ───────────────────────────────────────────
const s = StyleSheet.create({
  safe:           { flex:1, backgroundColor:C.bg },
  scroll:         { flex:1 },
  input:          { backgroundColor:'#F5F3EF', borderRadius:12, padding:14, fontSize:15, color:C.primary, marginBottom:14, borderWidth:0.5, borderColor:C.border },
  btnPrimary:     { backgroundColor:C.primary, borderRadius:12, padding:16, alignItems:'center' },
  btnPrimaryTxt:  { color:'#fff', fontSize:16, fontWeight:'600' },
  fieldLabel:     { fontSize:13, color:C.secondary, fontWeight:'500', marginBottom:8 },
  chip:           { paddingHorizontal:14, paddingVertical:9, borderRadius:20, borderWidth:0.5, borderColor:C.border, marginRight:8 },
  chipSel:        { backgroundColor:C.primary, borderColor:C.primary },
  chipTxt:        { fontSize:13, color:C.secondary },
  chipTxtSel:     { color:'#fff' },
  secTitle:       { fontSize:12, fontWeight:'600', color:C.secondary, textTransform:'uppercase', letterSpacing:0.5, marginBottom:12 },
  miniCard:       { width:140, borderRadius:14, padding:14 },
  itemRow:        { flexDirection:'row', alignItems:'center', gap:12, backgroundColor:C.card, borderRadius:12, padding:14, marginBottom:8, borderWidth:0.5, borderColor:C.border },
  itemIcon:       { width:40, height:40, borderRadius:20, backgroundColor:'#F5F3EF', justifyContent:'center', alignItems:'center' },
  modalHeader:    { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:20 },
  modalTitle:     { fontSize:20, fontWeight:'600', color:C.primary },
  actionBar:      { position:'absolute', bottom:0, left:0, right:0, flexDirection:'row', gap:10, padding:16, paddingBottom:32, backgroundColor:C.bg, borderTopWidth:0.5, borderTopColor:C.border },
  actionBtn:      { flex:1, borderRadius:16, padding:14, alignItems:'center', justifyContent:'center' },
  actionBtnLarge: { flex:1.6 },
  actionIcon:     { fontSize:22, marginBottom:4 },
  actionLabel:    { fontSize:12, fontWeight:'600', color:'#fff' },
  iaToast:        { position:'absolute', bottom:110, left:16, right:16, backgroundColor:C.primary, borderRadius:14, padding:16, zIndex:999 },
})