import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet, Text,
  TextInput, TouchableOpacity,
  View
} from 'react-native';
import 'react-native-url-polyfill/auto';

// ─── CONFIGURAÇÃO SUPABASE ───────────────────────────────
// Substitua pelas suas chaves do Supabase (Settings → API)
const SUPABASE_URL = 'https://cpombcvppitlgynqzhsr.supabase.co/rest/v1/';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwb21iY3ZwcGl0bGd5bnF6aHNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3MzEwMzYsImV4cCI6MjA5MjMwNzAzNn0.qb7WC2lGELaK5C8Ga09Bhs3tHDL04sW2SeY_SFMoZ1A';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
// ────────────────────────────────────────────────────────

const COLORS = {
  bg: '#F9F8F6',
  card: '#FFFFFF',
  primary: '#1A1A1A',
  secondary: '#6B6B6B',
  border: '#E8E6E0',
  green: '#1D9E75',
  red: '#E24B4A',
  blue: '#178DD1',
  yellow: '#EF9F27',
  euBg: '#E6F1FB',
  euText: '#185FA5',
  elaBg: '#FBEAF0',
  elaText: '#993556',
};

function fmt(n) {
  return 'R$ ' + Number(n || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2, maximumFractionDigits: 2
  });
}

// ─── TELA DE LOGIN ───────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [loading, setLoading] = useState(false);
  const [modo, setModo] = useState('login'); // 'login' | 'cadastro'

  async function handleAuth() {
    if (!email || !senha) { Alert.alert('Preencha e-mail e senha'); return; }
    setLoading(true);
    try {
      if (modo === 'cadastro') {
        const { error } = await supabase.auth.signUp({ email, password: senha });
        if (error) throw error;
        Alert.alert('Cadastro feito!', 'Verifique seu e-mail para confirmar.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
        if (error) throw error;
      }
    } catch (e) {
      Alert.alert('Erro', e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={[s.safe, { justifyContent: 'center' }]}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />
      <View style={s.loginWrap}>
        <Text style={s.loginEmoji}>💑</Text>
        <Text style={s.loginTitle}>FinançasCasal</Text>
        <Text style={s.loginSub}>Finanças do casal, juntos e organizados</Text>

        <TextInput
          style={s.input}
          placeholder="E-mail"
          placeholderTextColor={COLORS.secondary}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <TextInput
          style={s.input}
          placeholder="Senha"
          placeholderTextColor={COLORS.secondary}
          value={senha}
          onChangeText={setSenha}
          secureTextEntry
        />

        <TouchableOpacity style={s.btnPrimary} onPress={handleAuth} disabled={loading}>
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.btnPrimaryText}>{modo === 'login' ? 'Entrar' : 'Criar conta'}</Text>
          }
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setModo(modo === 'login' ? 'cadastro' : 'login')}>
          <Text style={s.loginSwitch}>
            {modo === 'login' ? 'Não tem conta? Cadastre-se' : 'Já tem conta? Entrar'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ─── TELA PRINCIPAL ──────────────────────────────────────
function HomeScreen({ session, onLogout }) {
  const [activeTab, setActiveTab] = useState('visao');
  const [currentUser, setCurrentUser] = useState('eu');
  const [loading, setLoading] = useState(true);

  // Dados
  const [despesas, setDespesas] = useState([]);
  const [cartoes, setCartoes] = useState([]);
  const [investimentos, setInvestimentos] = useState([]);
  const [reserva, setReserva] = useState({ meta: 30000, atual: 0 });

  // Modal lançar despesa
  const [showModal, setShowModal] = useState(false);
  const [dNome, setDNome] = useState('');
  const [dValor, setDValor] = useState('');
  const [dCat, setDCat] = useState('Alimentação');
  const [dQuem, setDQuem] = useState('eu');
  const [dTipo, setDTipo] = useState('variavel');
  const [saving, setSaving] = useState(false);

  const CATS = ['Alimentação', 'Moradia', 'Transporte', 'Saúde', 'Lazer', 'Educação', 'Outros'];
  const CAT_ICONS = { Alimentação: '🛒', Moradia: '🏠', Transporte: '🚗', Saúde: '💊', Lazer: '🎉', Educação: '📚', Outros: '💸' };

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const uid = session.user.id;
      const [d, c, i] = await Promise.all([
        supabase.from('despesas').select('*').eq('user_id', uid).order('created_at', { ascending: false }),
        supabase.from('cartoes').select('*').eq('user_id', uid),
        supabase.from('investimentos').select('*').eq('user_id', uid),
      ]);
      if (d.data) setDespesas(d.data);
      if (c.data) setCartoes(c.data);
      if (i.data) setInvestimentos(i.data);

      const r = await supabase.from('reserva').select('*').eq('user_id', uid).single();
      if (r.data) setReserva(r.data);
    } catch (e) {
      console.log('Erro ao carregar:', e);
    } finally {
      setLoading(false);
    }
  }

  async function salvarDespesa() {
    if (!dNome || !dValor) { Alert.alert('Preencha nome e valor'); return; }
    setSaving(true);
    const now = new Date();
    const { error } = await supabase.from('despesas').insert({
      user_id: session.user.id,
      nome: dNome,
      valor: parseFloat(dValor),
      categoria: dCat,
      quem: dQuem,
      tipo: dTipo,
      mes: now.getMonth(),
      ano: now.getFullYear(),
    });
    setSaving(false);
    if (error) { Alert.alert('Erro', error.message); return; }
    setDNome(''); setDValor(''); setShowModal(false);
    loadData();
  }

  // Cálculos
  const now = new Date();
  const despMes = despesas.filter(d => d.mes === now.getMonth() && d.ano === now.getFullYear());
  const minhas = despMes.filter(d => d.quem === currentUser);
  const casal = despMes.filter(d => d.quem === 'casal');
  const totalGasto = minhas.reduce((s, d) => s + d.valor, 0) + casal.reduce((s, d) => s + d.valor / 2, 0);
  const renda = currentUser === 'eu' ? 8500 : 7200;
  const saldo = renda - totalGasto;
  const totalInv = investimentos.reduce((s, i) => s + i.valor, 0);
  const pctReserva = reserva.meta > 0 ? Math.min(100, (reserva.atual / reserva.meta) * 100) : 0;

  if (loading) {
    return (
      <SafeAreaView style={[s.safe, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={[s.sub, { marginTop: 12 }]}>Carregando seus dados...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />

      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>💑 FinançasCasal</Text>
        <View style={s.avRow}>
          <TouchableOpacity
            style={[s.av, { backgroundColor: COLORS.euBg }, currentUser === 'eu' && s.avActive]}
            onPress={() => setCurrentUser('eu')}>
            <Text style={{ fontSize: 10, fontWeight: '600', color: COLORS.euText }}>EU</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.av, { backgroundColor: COLORS.elaBg }, currentUser === 'ela' && s.avActive]}
            onPress={() => setCurrentUser('ela')}>
            <Text style={{ fontSize: 10, fontWeight: '600', color: COLORS.elaText }}>ELA</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onLogout} style={s.avLogout}>
            <Text style={{ fontSize: 11, color: COLORS.secondary }}>Sair</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Tabs */}
      <View style={s.tabBar}>
        {[
          { id: 'visao', label: 'Visão' },
          { id: 'despesas', label: 'Despesas' },
          { id: 'cartoes', label: 'Cartões' },
          { id: 'invest', label: 'Invest.' },
          { id: 'reserva', label: 'Reserva' },
        ].map(t => (
          <TouchableOpacity key={t.id} style={s.tab} onPress={() => setActiveTab(t.id)}>
            <Text style={[s.tabLabel, activeTab === t.id && s.tabActive]}>{t.label}</Text>
            {activeTab === t.id && <View style={s.tabLine} />}
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── VISÃO ── */}
        {activeTab === 'visao' && (
          <View style={s.page}>
            <Text style={s.secTitle}>{currentUser === 'eu' ? 'Seu saldo este mês' : 'Saldo dela este mês'}</Text>
            <Text style={[s.bigNum, { color: saldo >= 0 ? COLORS.primary : COLORS.red }]}>{fmt(saldo)}</Text>
            <Text style={s.sub}>Renda: {fmt(renda)} · Gastos: {fmt(totalGasto)}</Text>

            <View style={s.grid2}>
              <View style={s.miniCard}>
                <Text style={s.miniLbl}>Gastos mês</Text>
                <Text style={[s.miniVal, { color: COLORS.red }]}>{fmt(totalGasto)}</Text>
              </View>
              <View style={s.miniCard}>
                <Text style={s.miniLbl}>Investimentos</Text>
                <Text style={[s.miniVal, { color: COLORS.green }]}>{fmt(totalInv)}</Text>
              </View>
              <View style={s.miniCard}>
                <Text style={s.miniLbl}>Reserva</Text>
                <Text style={s.miniVal}>{pctReserva.toFixed(0)}% da meta</Text>
              </View>
              <View style={s.miniCard}>
                <Text style={s.miniLbl}>Lançamentos</Text>
                <Text style={s.miniVal}>{despMes.length} este mês</Text>
              </View>
            </View>

            <Text style={[s.secTitle, { marginTop: 20 }]}>Últimas despesas</Text>
            {despesas.slice(0, 5).map(d => (
              <View key={d.id} style={s.expRow}>
                <Text style={s.expIcon}>{CAT_ICONS[d.categoria] || '💸'}</Text>
                <View style={s.expInfo}>
                  <Text style={s.expNome}>{d.nome}</Text>
                  <Text style={s.expMeta}>{d.categoria} · {d.tipo === 'fixa' ? 'Fixa' : 'Variável'}{d.quem === 'casal' ? ' · Casal' : ''}</Text>
                </View>
                <Text style={[s.expVal, { color: COLORS.red }]}>-{fmt(d.quem === 'casal' ? d.valor / 2 : d.valor)}</Text>
              </View>
            ))}
            {despesas.length === 0 && <Text style={s.empty}>Nenhum gasto lançado ainda</Text>}
          </View>
        )}

        {/* ── DESPESAS ── */}
        {activeTab === 'despesas' && (
          <View style={s.page}>
            <Text style={s.secTitle}>Despesas do mês</Text>
            {despMes.map(d => (
              <View key={d.id} style={s.expRow}>
                <Text style={s.expIcon}>{CAT_ICONS[d.categoria] || '💸'}</Text>
                <View style={s.expInfo}>
                  <Text style={s.expNome}>{d.nome}</Text>
                  <Text style={s.expMeta}>{d.categoria} · <Text style={{ color: d.tipo === 'fixa' ? COLORS.blue : COLORS.yellow }}>{d.tipo === 'fixa' ? 'Fixa' : 'Variável'}</Text></Text>
                </View>
                <Text style={[s.expVal, { color: COLORS.red }]}>-{fmt(d.valor)}</Text>
              </View>
            ))}
            {despMes.length === 0 && <Text style={s.empty}>Nenhuma despesa este mês</Text>}
          </View>
        )}

        {/* ── CARTÕES ── */}
        {activeTab === 'cartoes' && (
          <View style={s.page}>
            <Text style={s.secTitle}>Cartões</Text>
            {cartoes.map(c => {
              const pct = c.limite > 0 ? Math.min(100, (c.fatura / c.limite) * 100) : 0;
              const cor = pct > 80 ? COLORS.red : pct > 50 ? COLORS.yellow : COLORS.green;
              return (
                <View key={c.id} style={s.cardRow}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                    <Text style={s.expNome}>{c.nome}</Text>
                    <Text style={{ fontSize: 12, color: cor }}>{pct.toFixed(0)}% usado</Text>
                  </View>
                  <View style={s.progWrap}>
                    <View style={[s.prog, { width: pct + '%', backgroundColor: cor }]} />
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={[s.expMeta, { color: COLORS.red }]}>Fatura: {fmt(c.fatura)}</Text>
                    <Text style={[s.expMeta, { color: COLORS.green }]}>Disponível: {fmt(Math.max(0, c.limite - c.fatura))}</Text>
                  </View>
                </View>
              );
            })}
            {cartoes.length === 0 && <Text style={s.empty}>Nenhum cartão cadastrado</Text>}
          </View>
        )}

        {/* ── INVESTIMENTOS ── */}
        {activeTab === 'invest' && (
          <View style={s.page}>
            <Text style={s.secTitle}>Carteira de investimentos</Text>
            <View style={s.miniCard}>
              <Text style={s.miniLbl}>Total investido</Text>
              <Text style={[s.miniVal, { color: COLORS.green, fontSize: 22 }]}>{fmt(totalInv)}</Text>
            </View>
            <View style={{ height: 12 }} />
            {investimentos.map(i => {
              const rent = i.rentabilidade || 0;
              return (
                <View key={i.id} style={s.expRow}>
                  <View style={[s.expIconBox, { backgroundColor: '#E6F1FB' }]}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.euText }}>{i.nome.slice(0, 2).toUpperCase()}</Text>
                  </View>
                  <View style={s.expInfo}>
                    <Text style={s.expNome}>{i.nome}</Text>
                    <Text style={s.expMeta}>{i.categoria} · {i.dono === 'eu' ? 'Eu' : i.dono === 'ela' ? 'Ela' : 'Casal'}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={s.expVal}>{fmt(i.valor)}</Text>
                    <Text style={{ fontSize: 11, color: rent >= 0 ? COLORS.green : COLORS.red }}>{rent >= 0 ? '+' : ''}{rent.toFixed(1)}%</Text>
                  </View>
                </View>
              );
            })}
            {investimentos.length === 0 && <Text style={s.empty}>Nenhum ativo cadastrado</Text>}
          </View>
        )}

        {/* ── RESERVA ── */}
        {activeTab === 'reserva' && (
          <View style={s.page}>
            <Text style={s.secTitle}>Reserva de emergência</Text>
            <View style={[s.miniCard, { padding: 16 }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View>
                  <Text style={[s.bigNum, { fontSize: 24, color: COLORS.green }]}>{fmt(reserva.atual)}</Text>
                  <Text style={s.sub}>Meta: {fmt(reserva.meta)}</Text>
                  <Text style={[s.sub, { color: COLORS.green, marginTop: 4 }]}>{pctReserva.toFixed(0)}% atingido</Text>
                </View>
                <Text style={{ fontSize: 36 }}>🛡️</Text>
              </View>
              <View style={[s.progWrap, { marginTop: 12 }]}>
                <View style={[s.prog, {
                  width: pctReserva + '%',
                  backgroundColor: pctReserva >= 100 ? COLORS.green : pctReserva >= 50 ? COLORS.blue : COLORS.yellow
                }]} />
              </View>
              <Text style={[s.expMeta, { marginTop: 6 }]}>
                Faltam: {fmt(Math.max(0, reserva.meta - reserva.atual))}
              </Text>
            </View>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* FAB — lançar despesa */}
      {!showModal && (
        <TouchableOpacity style={s.fab} onPress={() => setShowModal(true)}>
          <Text style={s.fabText}>+ Lançar despesa</Text>
        </TouchableOpacity>
      )}

      {/* Modal despesa */}
      {showModal && (
        <View style={s.modalOverlay}>
          <View style={s.modal}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>Nova despesa</Text>

            <TextInput style={s.input} placeholder="Descrição" placeholderTextColor={COLORS.secondary} value={dNome} onChangeText={setDNome} />
            <TextInput style={s.input} placeholder="Valor (R$)" placeholderTextColor={COLORS.secondary} value={dValor} onChangeText={setDValor} keyboardType="numeric" />

            <Text style={s.fieldLabel}>Categoria</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
              {CATS.map(c => (
                <TouchableOpacity key={c} style={[s.chip, dCat === c && s.chipSel]} onPress={() => setDCat(c)}>
                  <Text style={[s.chipText, dCat === c && s.chipTextSel]}>{CAT_ICONS[c]} {c}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={s.fieldLabel}>Quem pagou?</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
              {['eu', 'ela', 'casal'].map(q => (
                <TouchableOpacity key={q} style={[s.chip, dQuem === q && s.chipSel]} onPress={() => setDQuem(q)}>
                  <Text style={[s.chipText, dQuem === q && s.chipTextSel]}>{q === 'eu' ? 'Eu' : q === 'ela' ? 'Ela' : 'Casal'}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.fieldLabel}>Tipo</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
              {[['variavel', 'Variável'], ['fixa', 'Fixa']].map(([v, l]) => (
                <TouchableOpacity key={v} style={[s.chip, dTipo === v && s.chipSel]} onPress={() => setDTipo(v)}>
                  <Text style={[s.chipText, dTipo === v && s.chipTextSel]}>{l}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={[s.btnSecondary, { flex: 1 }]} onPress={() => setShowModal(false)}>
                <Text style={s.btnSecondaryText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.btnPrimary, { flex: 2 }]} onPress={salvarDespesa} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.btnPrimaryText}>Salvar</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

// ─── ROOT ────────────────────────────────────────────────
export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session); setLoading(false);
    });
    supabase.auth.onAuthStateChange((_event, session) => setSession(session));
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  if (loading) {
    return (
      <View style={[s.safe, { justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.bg }]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return session
    ? <HomeScreen session={session} onLogout={handleLogout} />
    : <LoginScreen onLogin={() => {}} />;
}

// ─── ESTILOS ─────────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { flex: 1 },
  page: { padding: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingBottom: 8 },
  headerTitle: { fontSize: 15, fontWeight: '600', color: COLORS.primary },
  avRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  av: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: 'transparent' },
  avActive: { borderColor: COLORS.primary },
  avLogout: { paddingHorizontal: 8, paddingVertical: 4 },
  tabBar: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: COLORS.border, marginHorizontal: 16 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 10 },
  tabLabel: { fontSize: 11, color: COLORS.secondary },
  tabActive: { color: COLORS.primary, fontWeight: '600' },
  tabLine: { position: 'absolute', bottom: -1, width: '80%', height: 2, backgroundColor: COLORS.primary, borderRadius: 1 },
  secTitle: { fontSize: 11, fontWeight: '600', color: COLORS.secondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  bigNum: { fontSize: 30, fontWeight: '500', letterSpacing: -1, color: COLORS.primary },
  sub: { fontSize: 12, color: COLORS.secondary, marginTop: 2 },
  grid2: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  miniCard: { flex: 1, minWidth: '45%', backgroundColor: COLORS.card, borderRadius: 12, padding: 12, borderWidth: 0.5, borderColor: COLORS.border },
  miniLbl: { fontSize: 11, color: COLORS.secondary, marginBottom: 4 },
  miniVal: { fontSize: 16, fontWeight: '500', color: COLORS.primary },
  expRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COLORS.card, borderRadius: 12, padding: 12, marginBottom: 6, borderWidth: 0.5, borderColor: COLORS.border },
  expIcon: { fontSize: 20 },
  expIconBox: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  expInfo: { flex: 1 },
  expNome: { fontSize: 13, fontWeight: '500', color: COLORS.primary },
  expMeta: { fontSize: 11, color: COLORS.secondary, marginTop: 1 },
  expVal: { fontSize: 13, fontWeight: '500', color: COLORS.primary },
  cardRow: { backgroundColor: COLORS.card, borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 0.5, borderColor: COLORS.border },
  progWrap: { height: 6, backgroundColor: '#F0EDE8', borderRadius: 3, overflow: 'hidden' },
  prog: { height: '100%', borderRadius: 3 },
  empty: { textAlign: 'center', color: COLORS.secondary, fontSize: 13, paddingVertical: 24 },
  fab: { position: 'absolute', bottom: 24, left: 16, right: 16, backgroundColor: COLORS.primary, borderRadius: 14, padding: 15, alignItems: 'center' },
  fabText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  modalOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modal: { backgroundColor: COLORS.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 40 },
  modalHandle: { width: 36, height: 4, backgroundColor: COLORS.border, borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
  modalTitle: { fontSize: 15, fontWeight: '600', marginBottom: 14, color: COLORS.primary },
  input: { backgroundColor: '#F5F3EF', borderRadius: 10, padding: 11, fontSize: 14, color: COLORS.primary, marginBottom: 10, borderWidth: 0.5, borderColor: COLORS.border },
  fieldLabel: { fontSize: 11, color: COLORS.secondary, marginBottom: 6, fontWeight: '500' },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 0.5, borderColor: COLORS.border, marginRight: 6 },
  chipSel: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 12, color: COLORS.secondary },
  chipTextSel: { color: '#fff' },
  btnPrimary: { backgroundColor: COLORS.primary, borderRadius: 12, padding: 13, alignItems: 'center' },
  btnPrimaryText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  btnSecondary: { borderRadius: 12, padding: 13, alignItems: 'center', borderWidth: 0.5, borderColor: COLORS.border },
  btnSecondaryText: { fontSize: 14, color: COLORS.primary },
  loginWrap: { padding: 32 },
  loginEmoji: { fontSize: 48, textAlign: 'center', marginBottom: 8 },
  loginTitle: { fontSize: 26, fontWeight: '700', textAlign: 'center', color: COLORS.primary, marginBottom: 4 },
  loginSub: { fontSize: 13, color: COLORS.secondary, textAlign: 'center', marginBottom: 32 },
  loginSwitch: { textAlign: 'center', color: COLORS.secondary, fontSize: 13, marginTop: 16, textDecorationLine: 'underline' },
});
