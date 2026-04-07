/* eslint-disable react-hooks/exhaustive-deps */
import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './supabaseClient';

const CATS = ['Tout','Electronique','Vetements','Maison','Vehicules','Agriculture','Beaute','Sport','Autres'];
const COUNTRIES = ['Senegal','Ghana','Cote d\'Ivoire','Mali','Burkina Faso','Guinee','Cameroun','Benin','Togo','Niger','Nigeria','Kenya','Autre'];
const CURRENCIES = ['FCFA','GHS','NGN','KES','USD','EUR'];
const CONDITIONS = ['Neuf','Tres bon etat','Bon etat','Etat correct','Pour pieces'];
const PAYMENTS = ['Mobile Money','Paiement a la livraison','Virement bancaire','Especes en main propre'];

const fmt = (p) => String(p).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const ago = (ts) => {
  const d = Date.now() - new Date(ts).getTime();
  if (d < 60000) return "A l'instant";
  if (d < 3600000) return Math.floor(d/60000) + ' min';
  if (d < 86400000) return Math.floor(d/3600000) + ' h';
  return Math.floor(d/86400000) + ' j';
};

export default function App() {
  const [screen,   setScreen]   = useState('splash');
  const [user,     setUser]     = useState(null);
  const [profile,  setProfile]  = useState(null);
  const [products, setProducts] = useState([]);
  const [convs,    setConvs]    = useState([]);
  const [tab,      setTab]      = useState('home');
  const [detail,   setDetail]   = useState(null);
  const [convId,   setConvId]   = useState(null);
  const [toast,    setToast]    = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setUser(session.user);
        fetchProfile(session.user.id);
        fetchProducts();
        fetchConvs(session.user.id);
        setScreen('app');
      } else {
        setTimeout(() => setScreen('auth'), 2000);
      }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) { setUser(session.user); fetchProfile(session.user.id); }
      else { setUser(null); setProfile(null); }
    });
    return () => subscription.unsubscribe();
  }, []);

  const notify = (msg, type) => {
    setToast({ msg, type: type || 'ok' });
    setTimeout(() => setToast(null), 3200);
  };

  const fetchProfile = async (uid) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', uid).single();
    if (data) setProfile(data);
  };

  const fetchProducts = async () => {
    const { data, error } = await supabase
      .from('products')
      .select('*, profiles(name,city,country), product_photos(url,position)')
      .order('created_at', { ascending: false });
    if (!error && data) {
      setProducts(data.map(p => ({
        ...p,
        sellerName: p.profiles && p.profiles.name,
        photos: (p.product_photos || []).sort((a,b) => a.position - b.position).map(ph => ph.url),
      })));
    }
  };

  const fetchConvs = async (uid) => {
    const id = uid || (user && user.id);
    if (!id) return;
    const { data } = await supabase
      .from('conversations')
      .select('*, user1:profiles!conversations_user1_id_fkey(id,name,city,country,avatar_url), user2:profiles!conversations_user2_id_fkey(id,name,city,country,avatar_url), messages(content,created_at,sender_id)')
      .or('user1_id.eq.' + id + ',user2_id.eq.' + id)
      .order('created_at', { ascending: false });
    if (data) setConvs(data);
  };

  const fetchMessages = useCallback(async (cid) => {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', cid)
      .order('created_at', { ascending: true });
    return data || [];
  }, []);

  const handleLogin = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { notify(error.message, 'err'); return false; }
    setUser(data.user);
    await fetchProfile(data.user.id);
    await fetchProducts();
    await fetchConvs(data.user.id);
    setScreen('app');
    notify('Bienvenue ! 👋');
    return true;
  };

  const handleSignup = async (formData) => {
    const { data, error } = await supabase.auth.signUp({ email: formData.email, password: formData.password });
    if (error) { notify(error.message, 'err'); return false; }
    const uid = data.user.id;
    await supabase.from('profiles').insert({
      id: uid, name: formData.name, phone: formData.phone,
      country: formData.country, city: formData.city,
    });
    setUser(data.user);
    await fetchProfile(uid);
    setScreen('app');
    notify('Compte cree ! Bienvenue 🎉');
    return true;
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null); setProfile(null); setProducts([]); setConvs([]);
    setScreen('auth');
  };

  const handlePublish = async (formData, photoFiles) => {
    if (!user) return false;
    const { data: prod, error } = await supabase.from('products').insert({
      seller_id: user.id, title: formData.title, price: formData.price,
      currency: formData.currency, category: formData.category, condition: formData.condition,
      description: formData.description, location: formData.location,
      phone: formData.phone, payments: formData.payments,
    }).select().single();
    if (error) { notify('Erreur lors de la publication', 'err'); return false; }
    for (let i = 0; i < photoFiles.length; i++) {
      const file = photoFiles[i];
      const ext  = file.name.split('.').pop();
      const path = prod.id + '/' + i + '.' + ext;
      const { error: upErr } = await supabase.storage.from('products').upload(path, file);
      if (!upErr) {
        const { data: urlData } = supabase.storage.from('products').getPublicUrl(path);
        await supabase.from('product_photos').insert({ product_id: prod.id, url: urlData.publicUrl, position: i });
      }
    }
    await fetchProducts();
    notify('Annonce publiee ! 🎉');
    return true;
  };

  const handleDeleteProduct = async (id) => {
    const { data: photos } = await supabase.from('product_photos').select('url').eq('product_id', id);
    if (photos) {
      const paths = photos.map(p => p.url.split('/products/')[1]).filter(Boolean);
      if (paths.length) await supabase.storage.from('products').remove(paths);
    }
    await supabase.from('products').delete().eq('id', id);
    setProducts(prev => prev.filter(p => p.id !== id));
    notify('Annonce supprimee');
  };

  const handleStartChat = async (product) => {
    if (!user) { notify('Connectez-vous d\'abord', 'warn'); return; }
    if (product.seller_id === user.id) { notify('C\'est votre annonce', 'warn'); return; }
    const uid1 = user.id < product.seller_id ? user.id : product.seller_id;
    const uid2 = user.id < product.seller_id ? product.seller_id : user.id;
    let { data: existing } = await supabase.from('conversations')
      .select('id').eq('user1_id', uid1).eq('user2_id', uid2).single();
    if (!existing) {
      const { data: newConv } = await supabase.from('conversations')
        .insert({ user1_id: uid1, user2_id: uid2 }).select('id').single();
      existing = newConv;
    }
    if (existing) { setConvId(existing.id); setScreen('chat'); }
  };

  const handleSendMessage = async (cid, text) => {
    if (!user || !text.trim()) return;
    await supabase.from('messages').insert({ conversation_id: cid, sender_id: user.id, content: text.trim() });
  };

  const handleUpdateProfile = async (formData, avatarFile) => {
    let avatar_url = profile && profile.avatar_url;
    if (avatarFile) {
      const ext  = avatarFile.name.split('.').pop();
      const path = user.id + '/avatar.' + ext;
      await supabase.storage.from('avatars').upload(path, avatarFile, { upsert: true });
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      avatar_url = data.publicUrl + '?t=' + Date.now();
    }
    await supabase.from('profiles').update({ ...formData, avatar_url }).eq('id', user.id);
    await fetchProfile(user.id);
    notify('Profil mis a jour');
  };

  if (screen === 'splash') return <Splash />;

  return (
    <div style={S.root}>
      {toast && (
        <div style={{ ...S.toast, background: toast.type === 'err' ? '#ef4444' : toast.type === 'warn' ? '#f59e0b' : '#10b981' }}>
          {toast.msg}
        </div>
      )}
      {screen === 'auth' && <Auth onLogin={handleLogin} onSignup={handleSignup} />}
      {screen === 'app' && user && profile && (
        <AppLayout
          tab={tab} setTab={setTab} user={user} profile={profile}
          products={products} convs={convs}
          onOpenDetail={p => { setDetail(p); setScreen('detail'); }}
          onAddProduct={handlePublish}
          onDeleteProduct={handleDeleteProduct}
          onLogout={handleLogout}
          onUpdateProfile={handleUpdateProfile}
          fetchConvs={() => fetchConvs(user.id)}
          notify={notify}
        />
      )}
      {screen === 'detail' && detail && (
        <Detail product={detail} user={user} profile={profile}
          onBack={() => setScreen('app')}
          onChat={() => handleStartChat(detail)} />
      )}
      {screen === 'chat' && convId && user && (
        <ChatScreen convId={convId} userId={user.id}
          onBack={() => { setScreen('app'); fetchConvs(user.id); }}
          onSend={t => handleSendMessage(convId, t)}
          fetchMessages={fetchMessages} />
      )}
    </div>
  );
}

function Splash() {
  return (
    <div style={S.splash}>
      <div className="fadein">
        <div style={S.splashIco}><CartSvg size={56} color="#fff" /></div>
        <h1 style={S.splashTitle}>MarchePlus</h1>
        <p style={S.splashSub}>La marketplace de votre quartier</p>
      </div>
      <div style={S.loaderWrap}><div className="loader" /></div>
    </div>
  );
}

function Auth({ onLogin, onSignup }) {
  const [mode, setMode] = useState('login');
  const [f, setF] = useState({ name:'', email:'', phone:'', country:'Senegal', city:'', password:'', confirm:'' });
  const [err, setErr] = useState({});
  const [loading, setLoading] = useState(false);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  const validate = () => {
    const e = {};
    if (!/\S+@\S+\.\S+/.test(f.email)) e.email = 'Email invalide';
    if (f.password.length < 6) e.password = '6 caracteres minimum';
    if (mode === 'signup') {
      if (!f.name.trim()) e.name = 'Requis';
      if (!f.phone.trim()) e.phone = 'Requis';
      if (f.password !== f.confirm) e.confirm = 'Mots de passe differents';
    }
    setErr(e);
    return !Object.keys(e).length;
  };

  const submit = async () => {
    if (!validate()) return;
    setLoading(true);
    if (mode === 'login') await onLogin(f.email, f.password);
    else await onSignup(f);
    setLoading(false);
  };

  return (
    <div style={S.authPage}>
      <div style={S.authHero}>
        <div style={S.authIcoBox}><CartSvg size={38} color="#fff" /></div>
        <h1 style={S.authBrand}>MarchePlus</h1>
        <p style={S.authSub}>{mode === 'login' ? 'Bon retour !' : 'Creez votre compte gratuit'}</p>
      </div>
      <div style={S.authCard}>
        <div style={S.tabs}>
          {[['login','Connexion'],['signup','Inscription']].map(([m, l]) => (
            <button key={m} style={{ ...S.tabBtn, ...(mode === m ? S.tabBtnOn : {}) }}
              onClick={() => { setMode(m); setErr({}); }}>{l}</button>
          ))}
        </div>
        {mode === 'signup' && <>
          <FI label="Nom complet *" v={f.name} onChange={v => set('name', v)} ph="Aminata Diallo" err={err.name} />
          <FI label="Telephone *" v={f.phone} onChange={v => set('phone', v)} ph="+221 77 000 0000" type="tel" err={err.phone} />
          <FS label="Pays" v={f.country} onChange={v => set('country', v)} opts={COUNTRIES} />
          <FI label="Ville / Quartier" v={f.city} onChange={v => set('city', v)} ph="Dakar, Plateau" />
        </>}
        <FI label="Email *" v={f.email} onChange={v => set('email', v)} ph="vous@email.com" type="email" err={err.email} />
        <FI label="Mot de passe *" v={f.password} onChange={v => set('password', v)} ph="6 caracteres minimum" type="password" err={err.password} />
        {mode === 'signup' && <FI label="Confirmer *" v={f.confirm} onChange={v => set('confirm', v)} ph="*******" type="password" err={err.confirm} />}
        <button style={{ ...S.btnP, marginTop: 10 }} onClick={submit} disabled={loading} className="press">
          {loading ? <span className="spin">o</span> : mode === 'login' ? 'Se connecter' : 'Creer mon compte'}
        </button>
      </div>
    </div>
  );
}

function AppLayout({ tab, setTab, user, profile, products, convs, onOpenDetail, onAddProduct, onDeleteProduct, onLogout, onUpdateProfile, fetchConvs, notify }) {
  return (
    <div style={S.layout}>
      <div style={S.content}>
        {tab === 'home'    && <HomeTab    products={products} profile={profile} onOpen={onOpenDetail} />}
        {tab === 'search'  && <SearchTab  products={products} onOpen={onOpenDetail} />}
        {tab === 'publish' && <PublishTab user={user} profile={profile} onAdd={onAddProduct} notify={notify} onDone={() => setTab('home')} />}
        {tab === 'msgs'    && <MsgsTab    userId={user.id} convs={convs} fetchConvs={fetchConvs} />}
        {tab === 'profile' && <ProfileTab user={user} profile={profile} products={products} onLogout={onLogout} onUpdate={onUpdateProfile} notify={notify} onOpen={onOpenDetail} onDelete={onDeleteProduct} />}
      </div>
      <nav style={S.nav}>
        {[
          { id:'home',    Icon:HomeIco,   label:'Accueil' },
          { id:'search',  Icon:SearchIco, label:'Chercher' },
          { id:'publish', Icon:PlusIco,   label:'',    special:true },
          { id:'msgs',    Icon:ChatIco,   label:'Messages', badge:convs.length },
          { id:'profile', Icon:UserIco,   label:'Profil' },
        ].map(({ id, Icon, label, special, badge }) => (
          <button key={id}
            style={{ ...S.navBtn, ...(special ? S.navSpecial : {}), ...(tab === id && !special ? { color:'#FF6B35' } : {}) }}
            onClick={() => { setTab(id); if (id === 'msgs') fetchConvs(); }}>
            <Icon size={special ? 26 : 22} color={special ? '#fff' : tab === id ? '#FF6B35' : '#9ca3af'} />
            {!special && <span style={{ fontSize:10, fontWeight:700, color: tab === id ? '#FF6B35' : '#9ca3af' }}>{label}</span>}
            {badge > 0 && !special && <span style={S.badge}>{badge}</span>}
          </button>
        ))}
      </nav>
    </div>
  );
}

function HomeTab({ products, profile, onOpen }) {
  const [cat, setCat] = useState('Tout');
  const [q, setQ]     = useState('');
  const list = products.filter(p =>
    (cat === 'Tout' || p.category === cat) &&
    (!q || p.title.toLowerCase().includes(q.toLowerCase()))
  );
  return (
    <div style={S.screen}>
      <div style={S.hHead}>
        <div>
          <p style={S.hSmall}>Bonjour</p>
          <h2 style={S.hName}>{profile && profile.name ? profile.name.split(' ')[0] : 'Vous'}</h2>
        </div>
        <Av profile={profile} size={46} />
      </div>
      <SearchBar q={q} setQ={setQ} />
      <CatBar cat={cat} setCat={setCat} />
      {list.length === 0
        ? <Empty ico="🛒" title={products.length === 0 ? 'Aucune annonce' : 'Aucun resultat'} sub={products.length === 0 ? 'Publiez la premiere annonce !' : 'Essayez d\'autres mots-cles'} />
        : <>
          <p style={S.count}>{list.length} annonce{list.length > 1 ? 's' : ''}</p>
          <Grid items={list} onOpen={onOpen} />
        </>}
    </div>
  );
}

function SearchTab({ products, onOpen }) {
  const [q, setQ]       = useState('');
  const [cat, setCat]   = useState('Tout');
  const [sort, setSort] = useState('new');
  const [min, setMin]   = useState('');
  const [max, setMax]   = useState('');

  let res = products.filter(p => {
    const mq = !q || [p.title, p.description, p.location].join(' ').toLowerCase().includes(q.toLowerCase());
    return mq && (cat === 'Tout' || p.category === cat) && (!min || p.price >= +min) && (!max || p.price <= +max);
  });
  if (sort === 'new')  res = [...res].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  if (sort === 'low')  res = [...res].sort((a, b) => a.price - b.price);
  if (sort === 'high') res = [...res].sort((a, b) => b.price - a.price);

  return (
    <div style={S.screen}>
      <h2 style={S.title}>Recherche</h2>
      <SearchBar q={q} setQ={setQ} autoFocus={true} />
      <CatBar cat={cat} setCat={setCat} />
      <div style={S.filterRow}>
        <input style={S.fInput} placeholder="Prix min" value={min} onChange={e => setMin(e.target.value)} type="number" />
        <span style={{ color:'#ccc' }}>-</span>
        <input style={S.fInput} placeholder="Prix max" value={max} onChange={e => setMax(e.target.value)} type="number" />
        <select style={S.fSelect} value={sort} onChange={e => setSort(e.target.value)}>
          <option value="new">Recent</option>
          <option value="low">Prix croissant</option>
          <option value="high">Prix decroissant</option>
        </select>
      </div>
      <p style={S.count}>{res.length} resultat{res.length > 1 ? 's' : ''}</p>
      {res.length === 0 ? <Empty ico="😔" title="Aucun resultat" sub="Modifiez les filtres" /> : <Grid items={res} onOpen={onOpen} />}
    </div>
  );
}

function PublishTab({ user, profile, onAdd, notify, onDone }) {
  const [step, setStep]             = useState(1);
  const [photoFiles, setPhotoFiles] = useState([]);
  const [previews, setPreviews]     = useState([]);
  const [f, setF] = useState({
    title:'', price:'', currency:'FCFA', category:'Electronique',
    condition:'Bon etat', description:'', location: (profile && profile.city) || '',
    phone: (profile && profile.phone) || '', payments:[],
  });
  const [err, setErr]   = useState({});
  const [busy, setBusy] = useState(false);
  const fileRef = useRef();
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const togglePay = (v) => set('payments', f.payments.includes(v) ? f.payments.filter(x => x !== v) : [...f.payments, v]);

  const addPhotos = (files) => {
    const arr = Array.from(files).slice(0, 8 - photoFiles.length);
    setPhotoFiles(prev => [...prev, ...arr]);
    arr.forEach(file => {
      const reader = new FileReader();
      reader.onload = e => setPreviews(prev => [...prev, e.target.result]);
      reader.readAsDataURL(file);
    });
  };
  const removePhoto = (i) => {
    setPhotoFiles(prev => prev.filter((_, j) => j !== i));
    setPreviews(prev => prev.filter((_, j) => j !== i));
  };

  const v1 = () => {
    const e = {};
    if (!photoFiles.length) e.photo = 'Au moins 1 photo requise';
    if (!f.title.trim()) e.title = 'Requis';
    if (!f.price || +f.price <= 0) e.price = 'Invalide';
    setErr(e); return !Object.keys(e).length;
  };
  const v2 = () => {
    const e = {};
    if (!f.description.trim()) e.desc = 'Requis';
    if (!f.location.trim()) e.loc = 'Requis';
    if (!f.phone.trim()) e.phone = 'Requis';
    if (!f.payments.length) e.pay = 'Mode de paiement requis';
    setErr(e); return !Object.keys(e).length;
  };

  const publish = async () => {
    setBusy(true);
    const ok = await onAdd({ ...f, price: +f.price }, photoFiles);
    setBusy(false);
    if (ok) onDone();
  };

  return (
    <div style={S.screen}>
      <h2 style={S.title}>Publier une annonce</h2>
      <div style={S.stepBar}>
        {[1,2,3].map(s => (
          <div key={s} style={{ display:'flex', alignItems:'center', flex: s < 3 ? 1 : 'unset' }}>
            <div style={{ ...S.dot, ...(step >= s ? S.dotOn : {}) }}>{step > s ? 'v' : s}</div>
            {s < 3 && <div style={{ ...S.dLine, background: step > s ? '#FF6B35' : '#e5e7eb' }} />}
          </div>
        ))}
      </div>

      {step === 1 && <>
        <input ref={fileRef} type="file" accept="image 
                    multiple style={{ display:'none' }} onChange={e => addPhotos(e.target.files)} />
        <p style={S.lbl}>Photos du produit *</p>
        <div style={S.photoGrid}>
          {previews.map((src, i) => (
            <div key={i} style={S.pThumb}>
              <img src={src} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', borderRadius:10 }} />
              <button style={S.pDel} onClick={() => removePhoto(i)}>X</button>
              {i === 0 && <span style={S.pMain}>Principal</span>}
            </div>
          ))}
          {previews.length < 8 && (
            <button style={S.pAdd} onClick={() => fileRef.current.click()}>
              <CameraIco size={26} color="#9ca3af" />
              <span style={{ fontSize:11, color:'#9ca3af', marginTop:3 }}>Photo</span>
            </button>
          )}
        </div>
        {err.photo && <Err>{err.photo}</Err>}
        <FI label="Titre *" v={f.title} onChange={v => set('title', v)} ph="iPhone 14, Robe wax, Moto..." err={err.title} />
        <div style={{ display:'flex', gap:10 }}>
          <div style={{ flex:2 }}><FI label="Prix *" v={f.price} onChange={v => set('price', v)} ph="50000" type="number" err={err.price} /></div>
          <FS label="Devise" v={f.currency} onChange={v => set('currency', v)} opts={CURRENCIES} />
        </div>
        <FS label="Categorie" v={f.category} onChange={v => set('category', v)} opts={CATS.slice(1)} />
        <FS label="Etat" v={f.condition} onChange={v => set('condition', v)} opts={CONDITIONS} />
        <button style={S.btnP} onClick={() => { if (v1()) setStep(2); }} className="press">Suivant</button>
      </>}

      {step === 2 && <>
        <div style={S.fw}>
          <p style={S.lbl}>Description *</p>
          <textarea style={{ ...S.inp, height:110, resize:'none' }} value={f.description}
            onChange={e => set('description', e.target.value)}
            placeholder="Etat, caracteristiques, raison de la vente..." />
          {err.desc && <Err>{err.desc}</Err>}
        </div>
        <FI label="Localisation *" v={f.location} onChange={v => set('location', v)} ph="Dakar, Plateau" err={err.loc} />
        <FI label="Numero de contact *" v={f.phone} onChange={v => set('phone', v)} ph="+221 77 000 0000" type="tel" err={err.phone} />
        <p style={S.lbl}>Modes de paiement *</p>
        {PAYMENTS.map(p => (
          <button key={p} style={{ ...S.payOpt, ...(f.payments.includes(p) ? S.payOptOn : {}) }} onClick={() => togglePay(p)}>
            <span style={{ ...S.chk, ...(f.payments.includes(p) ? S.chkOn : {}) }}>{f.payments.includes(p) ? 'v' : ''}</span>
            {p}
          </button>
        ))}
        {err.pay && <Err>{err.pay}</Err>}
        <div style={{ display:'flex', gap:10, marginTop:8 }}>
          <button style={{ ...S.btnS, flex:1 }} onClick={() => setStep(1)}>Retour</button>
          <button style={{ ...S.btnP, flex:2, marginTop:0 }} onClick={() => { if (v2()) setStep(3); }} className="press">Suivant</button>
        </div>
      </>}

      {step === 3 && <>
        <h3 style={{ fontWeight:800, marginBottom:14 }}>Verifiez votre annonce</h3>
        {previews[0] && <img src={previews[0]} alt="" style={{ width:'100%', height:200, objectFit:'cover', borderRadius:14, marginBottom:14 }} />}
        <div style={S.prevBox}>
          <p style={{ fontWeight:800, fontSize:18, margin:'0 0 4px' }}>{f.title}</p>
          <p style={{ fontWeight:900, fontSize:22, color:'#FF6B35', margin:'0 0 10px' }}>{fmt(f.price)} {f.currency}</p>
          <div style={{ display:'flex', gap:7, flexWrap:'wrap', marginBottom:8 }}>
            <Tag>{f.category}</Tag><Tag>{f.condition}</Tag><Tag>{f.location}</Tag>
          </div>
          <p style={{ color:'#4b5563', fontSize:14, lineHeight:1.6, margin:'0 0 10px' }}>{f.description}</p>
          <div style={{ display:'flex', gap:7, flexWrap:'wrap' }}>
            {f.payments.map(p => <Tag key={p} green={true}>{p}</Tag>)}
          </div>
          <p style={{ color:'#6b7280', fontSize:13, marginTop:8 }}>{f.phone}</p>
        </div>
        <div style={{ display:'flex', gap:10, marginTop:14 }}>
          <button style={{ ...S.btnS, flex:1 }} onClick={() => setStep(2)}>Modifier</button>
          <button style={{ ...S.btnP, flex:2, marginTop:0 }} onClick={publish} disabled={busy} className="press">
            {busy ? 'Publication...' : 'Publier'}
          </button>
        </div>
      </>}
    </div>
  );
}

function MsgsTab({ userId, convs, fetchConvs }) {
  useEffect(() => {
    fetchConvs();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={S.screen}>
      <h2 style={S.title}>Messages</h2>
      {convs.length === 0
        ? <Empty ico="💬" title="Aucun message" sub="Contactez un vendeur depuis une annonce." />
        : convs.map(c => {
            const other = c.user1_id === userId ? c.user2 : c.user1;
            const msgs  = c.messages || [];
            const last  = msgs[msgs.length - 1];
            return (
              <div key={c.id} style={S.convRow} className="press">
                <Av profile={other} size={50} />
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ fontWeight:700, margin:'0 0 2px' }}>{other && other.name}</p>
                  <p style={{ color:'#6b7280', fontSize:13, margin:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {last ? (last.sender_id === userId ? 'Vous : ' : '') + last.content : 'Nouvelle conversation'}
                  </p>
                </div>
                {last && <span style={{ color:'#9ca3af', fontSize:11 }}>{ago(last.created_at)}</span>}
              </div>
            );
          })
      }
    </div>
  );
}

function ProfileTab({ user, profile, products, onLogout, onUpdate, notify, onOpen, onDelete }) {
  const mine = products.filter(p => p.seller_id === user.id);
  const [edit, setEdit]     = useState(false);
  const [f, setF]           = useState({ name: (profile && profile.name) || '', phone: (profile && profile.phone) || '', country: (profile && profile.country) || 'Senegal', city: (profile && profile.city) || '' });
  const [avatarFile, setAF] = useState(null);
  const [avPrev, setAvPrev] = useState(null);
  const [busy, setBusy]     = useState(false);
  const avRef = useRef();

  const save = async () => {
    setBusy(true);
    await onUpdate(f, avatarFile);
    setBusy(false);
    setEdit(false);
  };

  const handleAv = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setAF(file);
    const r = new FileReader();
    r.onload = ev => setAvPrev(ev.target.result);
    r.readAsDataURL(file);
  };

  return (
    <div style={S.screen}>
      <div style={S.profHero}>
        <div style={{ position:'relative', display:'inline-block' }}>
          <Av profile={profile} size={90} override={avPrev} />
          {edit && <>
            <input ref={avRef} type="file" accept="image/*" style={{ display:'none' }} onChange={handleAv} />
            <button style={S.avEditBtn} onClick={() => avRef.current.click()}>+</button>
          </>}
        </div>
        <h2 style={{ margin:'12px 0 4px', fontSize:22, fontWeight:800 }}>{profile && profile.name}</h2>
        <p style={{ color:'#6b7280', margin:0, fontSize:14 }}>{(profile && (profile.city || profile.country)) || ''}</p>
        <div style={S.statsRow}>
          <div style={{ textAlign:'center', flex:1, padding:'12px 0' }}>
            <p style={{ margin:0, fontWeight:800, fontSize:20, color:'#FF6B35' }}>{mine.length}</p>
            <p style={{ margin:0, fontSize:12, color:'#9ca3af' }}>Annonces</p>
          </div>
          <div style={{ textAlign:'center', flex:1, padding:'12px 0', borderLeft:'1px solid #f0f0f0' }}>
            <p style={{ margin:0, fontWeight:800, fontSize:20, color:'#FF6B35' }}>{new Date(user.created_at || Date.now()).getFullYear()}</p>
            <p style={{ margin:0, fontSize:12, color:'#9ca3af' }}>Membre depuis</p>
          </div>
        </div>
      </div>
      {!edit ? <>
        {[['Email', user.email],['Tel', (profile && profile.phone) || '-'],['Pays', (profile && profile.country) || '-'],['Ville', (profile && profile.city) || '-']].map(([lb, vl]) => (
          <div key={lb} style={S.infoRow}><div><p style={{ margin:0, fontSize:12, color:'#9ca3af' }}>{lb}</p><p style={{ margin:0, fontWeight:600 }}>{vl}</p></div></div>
        ))}
        <button style={{ ...S.btnS, marginTop:12 }} onClick={() => setEdit(true)}>Modifier le profil</button>
      </> : <>
        <FI label="Nom" v={f.name} onChange={v => setF(p => ({ ...p, name: v }))} />
        <FI label="Telephone" v={f.phone} onChange={v => setF(p => ({ ...p, phone: v }))} type="tel" />
        <FS label="Pays" v={f.country} onChange={v => setF(p => ({ ...p, country: v }))} opts={COUNTRIES} />
        <FI label="Ville" v={f.city} onChange={v => setF(p => ({ ...p, city: v }))} />
        <div style={{ display:'flex', gap:10 }}>
          <button style={{ ...S.btnS, flex:1 }} onClick={() => setEdit(false)}>Annuler</button>
          <button style={{ ...S.btnP, flex:1, marginTop:0 }} onClick={save} disabled={busy}>
            {busy ? '...' : 'Enregistrer'}
          </button>
        </div>
      </>}
      {mine.length > 0 && <>
        <h3 style={{ fontWeight:800, margin:'22px 0 12px' }}>Mes annonces ({mine.length})</h3>
        {mine.map(p => (
          <div key={p.id} style={S.myPRow}>
            {p.photos && p.photos[0]
              ? <img src={p.photos[0]} alt="" style={{ width:60, height:60, objectFit:'cover', borderRadius:10, flexShrink:0 }} />
              : <div style={{ width:60, height:60, background:'#f3f4f6', borderRadius:10, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:28 }}>?</div>}
            <div style={{ flex:1, minWidth:0, cursor:'pointer' }} onClick={() => onOpen(p)}>
              <p style={{ fontWeight:700, margin:'0 0 2px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.title}</p>
              <p style={{ color:'#FF6B35', fontWeight:700, margin:0 }}>{fmt(p.price)} {p.currency}</p>
              <p style={{ color:'#9ca3af', fontSize:12, margin:0 }}>{ago(p.created_at)}</p>
            </div>
            <button style={S.delBtn} onClick={() => { if (window.confirm('Supprimer ?')) onDelete(p.id); }}>X</button>
          </div>
        ))}
      </>}
      <button style={{ ...S.btnDanger, marginTop:24, marginBottom:32 }} onClick={() => { if (window.confirm('Se deconnecter ?')) onLogout(); }}>
        Deconnexion
      </button>
    </div>
  );
}

function Detail({ product, user, profile, onBack, onChat }) {
  const p = product;
  const [idx, setIdx] = useState(0);
  const isOwner = user && p.seller_id === user.id;
  const [seller, setSeller] = useState(null);

  useEffect(() => {
    supabase.from('profiles').select('*').eq('id', p.seller_id).single().then(({ data }) => {
      if (data) setSeller(data);
    });
  }, [p.seller_id]);

  return (
    <div style={S.detPage}>
      <div style={{ position:'relative', background:'#f3f4f6' }}>
        {p.photos && p.photos.length > 0
          ? <>
              <img src={p.photos[idx]} alt="" style={{ width:'100%', height:300, objectFit:'cover', display:'block' }} />
              {p.photos.length > 1 && (
                <div style={S.dotRow}>
                  {p.photos.map((_, i) => (
                    <button key={i}
                      style={{ width: i === idx ? 20 : 8, height:8, borderRadius: i === idx ? 4 : '50%', background: i === idx ? '#fff' : 'rgba(255,255,255,0.5)', border:'none', cursor:'pointer', transition:'all 0.2s', padding:0 }}
                      onClick={() => setIdx(i)} />
                  ))}
                </div>
              )}
            </>
          : <div style={{ height:220, display:'flex', alignItems:'center', justifyContent:'center', background:'#f3f4f6', fontSize:72 }}>?</div>}
        <button style={S.backFloat} onClick={onBack}>Retour</button>
      </div>
      <div style={S.detBody}>
        <div style={{ display:'flex', gap:7, marginBottom:10 }}><Tag>{p.category}</Tag><Tag>{p.condition}</Tag></div>
        <h2 style={{ fontSize:22, fontWeight:800, margin:'0 0 6px' }}>{p.title}</h2>
        <p style={{ fontSize:28, fontWeight:900, color:'#FF6B35', margin:'0 0 4px' }}>
          {fmt(p.price)} <span style={{ fontSize:16, color:'#9ca3af', fontWeight:600 }}>{p.currency}</span>
        </p>
        <p style={{ color:'#9ca3af', fontSize:13, margin:'0 0 16px' }}>{p.location} - {ago(p.created_at)}</p>
        <div style={S.detSec}>
          <h4 style={S.detSecTitle}>Description</h4>
          <p style={{ color:'#374151', lineHeight:1.7, fontSize:14, margin:0 }}>{p.description}</p>
        </div>
        <div style={S.detSec}>
          <h4 style={S.detSecTitle}>Modes de paiement</h4>
          <div style={{ display:'flex', gap:7, flexWrap:'wrap' }}>
            {p.payments && p.payments.map(pm => <Tag key={pm} green={true}>{pm}</Tag>)}
          </div>
        </div>
        {seller && (
          <div style={S.sellCard}>
            <Av profile={seller} size={52} />
            <div style={{ flex:1 }}>
              <p style={{ fontWeight:700, margin:'0 0 2px' }}>{seller.name}</p>
              <p style={{ color:'#6b7280', fontSize:13, margin:0 }}>{seller.city || seller.country}</p>
              <p style={{ color:'#6b7280', fontSize:13, margin:0 }}>{p.phone}</p>
            </div>
          </div>
        )}
        {!isOwner && user && (
          <div style={{ display:'flex', gap:10, marginTop:16, paddingBottom:24 }}>
            <a href={'tel:' + p.phone} style={{ ...S.btnS, flex:1, textAlign:'center', textDecoration:'none', display:'flex', alignItems:'center', justifyContent:'center' }}>
              Appeler
            </a>
            <button style={{ ...S.btnP, flex:2, marginTop:0 }} onClick={onChat} className="press">Message</button>
          </div>
        )}
        {!user && <p style={{ color:'#9ca3af', textAlign:'center', fontSize:14, marginTop:16 }}>Connectez-vous pour contacter le vendeur</p>}
        {isOwner && <div style={{ background:'#fef3c7', borderRadius:12, padding:'12px 16px', border:'1px solid #fde68a', marginTop:16, textAlign:'center' }}><p style={{ margin:0, color:'#92400e' }}>C\'est votre annonce</p></div>}
      </div>
    </div>
  );
}

function ChatScreen({ convId, userId, onBack, onSend, fetchMessages }) {
  const [msgs, setMsgs]   = useState([]);
  const [text, setText]   = useState('');
  const [other, setOther] = useState(null);
  const bottomRef = useRef();

  const loadMsgs = useCallback(async () => {
    const data = await fetchMessages(convId);
    setMsgs(data);
  }, [convId, fetchMessages]);

  useEffect(() => {
    loadMsgs();
    supabase.from('conversations')
      .select('user1_id, user2_id, user1:profiles!conversations_user1_id_fkey(name,city,country,avatar_url), user2:profiles!conversations_user2_id_fkey(name,city,country,avatar_url)')
      .eq('id', convId).single()
      .then(({ data }) => {
        if (data) setOther(data.user1_id === userId ? data.user2 : data.user1);
      });
    const sub = supabase.channel('conv-' + convId)
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'messages', filter:'conversation_id=eq.' + convId }, () => loadMsgs())
      .subscribe();
    return () => supabase.removeChannel(sub);
  }, [convId, userId, loadMsgs]);

  useEffect(() => { bottomRef.current && bottomRef.current.scrollIntoView({ behavior:'smooth' }); }, [msgs]);

  const send = async () => {
    if (!text.trim()) return;
    await onSend(text.trim());
    setText('');
    loadMsgs();
  };

  return (
    <div style={S.chatPage}>
      <div style={S.chatHead}>
        <button style={S.backInline} onClick={onBack}>Retour</button>
        {other && <Av profile={other} size={38} />}
        <div>
          <p style={{ margin:0, fontWeight:700, fontSize:15 }}>{other ? other.name : '...'}</p>
          <p style={{ margin:0, fontSize:11, color:'#9ca3af' }}>{other ? (other.city || other.country || '') : ''}</p>
        </div>
      </div>
      <div style={S.chatMsgs}>
        {msgs.length === 0 && <p style={{ textAlign:'center', color:'#9ca3af', padding:'32px 0', fontSize:14 }}>Demarrez la conversation !</p>}
        {msgs.map((m, i) => {
          const isMe = m.sender_id === userId;
          return (
            <div key={i} style={{ display:'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', marginBottom:6 }}>
              <div style={{ ...S.bub, ...(isMe ? S.bubMe : S.bubThem) }}>
                <p style={{ margin:0, fontSize:14, lineHeight:1.5 }}>{m.content}</p>
                <p style={{ margin:'3px 0 0', fontSize:10, opacity:0.6, textAlign:'right' }}>{ago(m.created_at)}</p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <div style={S.chatBar}>
        <input style={S.chatInput} value={text} onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()} placeholder="Votre message..." />
        <button style={{ ...S.sendBtn, opacity: text.trim() ? 1 : 0.4 }} onClick={send}>
          <SendSvg />
        </button>
      </div>
    </div>
  );
}

function Grid({ items, onOpen }) {
  return <div style={S.grid}>{items.map(p => <Card key={p.id} p={p} onOpen={onOpen} />)}</div>;
}

function Card({ p, onOpen }) {
  return (
    <div style={S.card} onClick={() => onOpen(p)} className="card-lift">
      <div style={S.cardImg}>
        {p.photos && p.photos[0]
          ? <img src={p.photos[0]} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
          : <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', fontSize:40, background:'#f3f4f6' }}>?</div>}
        <span style={S.condTag}>{p.condition}</span>
      </div>
      <div style={S.cardBody}>
        <p style={S.cardTitle}>{p.title}</p>
        <p style={S.cardPrice}>{fmt(p.price)} <span style={{ fontSize:11, color:'#9ca3af', fontWeight:600 }}>{p.currency}</span></p>
        <div style={{ display:'flex', justifyContent:'space-between' }}>
          <span style={{ fontSize:11, color:'#9ca3af' }}>{p.location}</span>
          <span style={{ fontSize:11, color:'#9ca3af' }}>{ago(p.created_at)}</span>
        </div>
      </div>
    </div>
  );
}

function Av({ profile, size, override }) {
  const s   = size || 40;
  const src = override || (profile && profile.avatar_url);
  const ini = profile && profile.name ? profile.name.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase() : '?';
  const bgs = ['#FF6B35','#FF9E1B','#2EC4B6','#E71D36','#4CAF50','#9C27B0'];
  const bg  = bgs[((profile && profile.name && profile.name.charCodeAt(0)) || 0) % bgs.length];
  return src
    ? <img src={src} alt="" style={{ width:s, height:s, borderRadius:'50%', objectFit:'cover', flexShrink:0 }} />
    : <div style={{ width:s, height:s, borderRadius:'50%', background:bg, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:s*0.34, flexShrink:0 }}>{ini}</div>;
}

function SearchBar({ q, setQ, autoFocus }) {
  return (
    <div style={S.sBar}>
      <SearchIco size={17} color="#9ca3af" />
      <input style={S.sInput} placeholder="Rechercher un produit..." value={q} onChange={e => setQ(e.target.value)} autoFocus={autoFocus || false} />
      {q && <button style={{ border:'none', background:'none', cursor:'pointer', color:'#9ca3af', fontSize:13 }} onClick={() => setQ('')}>X</button>}
    </div>
  );
}

function CatBar({ cat, setCat }) {
  return (
    <div className="cat-scroll" style={{ marginBottom:18 }}>
      {CATS.map(c => (
        <button key={c} style={{ ...S.catChip, ...(cat === c ? S.catOn : {}) }} onClick={() => setCat(c)}>{c}</button>
      ))}
    </div>
  );
}

function FI({ label, v, onChange, ph, type, err }) {
  return (
    <div style={S.fw}>
      {label && <p style={S.lbl}>{label}</p>}
      <input style={{ ...S.inp, ...(err ? { borderColor:'#ef4444' } : {}) }}
        type={type || 'text'} value={v} onChange={e => onChange(e.target.value)} placeholder={ph || ''} />
      {err && <Err>{err}</Err>}
    </div>
  );
}

function FS({ label, v, onChange, opts }) {
  return (
    <div style={S.fw}>
      {label && <p style={S.lbl}>{label}</p>}
      <select style={S.inp} value={v} onChange={e => onChange(e.target.value)}>
        {opts.map(o => <option key={o}>{o}</option>)}
      </select>
    </div>
  );
}

function Tag({ children, green }) {
  return <span style={{ ...S.tag, ...(green ? S.tagG : {}) }}>{children}</span>;
}
function Err({ children }) {
  return <span style={{ color:'#ef4444', fontSize:12, marginTop:2, display:'block' }}>{children}</span>;
}
function Empty({ ico, title, sub }) {
  return (
    <div style={S.empty}>
      <div style={{ fontSize:52 }}>{ico}</div>
      <p style={{ fontWeight:700, margin:'12px 0 4px' }}>{title}</p>
      <p style={{ color:'#9ca3af', fontSize:14, margin:0 }}>{sub}</p>
    </div>
  );
}

const CartSvg   = ({ size, color }) => <svg width={size||48} height={size||48} viewBox="0 0 72 72" fill="none"><path d="M18 24h5l6 22h16l6-22h5" stroke={color||'#fff'} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/><circle cx="30" cy="52" r="3" fill={color||'#fff'}/><circle cx="46" cy="52" r="3" fill={color||'#fff'}/><path d="M23 24l3-10h20l3 10" stroke={color||'#fff'} strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.7"/></svg>;
const SendSvg   = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>;
const HomeIco   = ({ size, color }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M3 12L12 3L21 12V21H15V15H9V21H3V12Z" stroke={color} strokeWidth="2" strokeLinejoin="round"/></svg>;
const SearchIco = ({ size, color }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="8" stroke={color} strokeWidth="2"/><path d="M21 21L16.65 16.65" stroke={color} strokeWidth="2" strokeLinecap="round"/></svg>;
const PlusIco   = ({ size, color }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M12 5V19M5 12H19" stroke={color} strokeWidth="2.5" strokeLinecap="round"/></svg>;
const ChatIco   = ({ size, color }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M21 15C21 16.1 20.1 17 19 17H7L3 21V5C3 3.9 3.9 3 5 3H19C20.1 3 21 3.9 21 5V15Z" stroke={color} strokeWidth="2" strokeLinejoin="round"/></svg>;
const UserIco   = ({ size, color }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke={color} strokeWidth="2"/><path d="M4 20C4 17 7.6 15 12 15C16.4 15 20 17 20 20" stroke={color} strokeWidth="2" strokeLinecap="round"/></svg>;
const CameraIco = ({ size, color }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M23 19C23 20.1 22.1 21 21 21H3C1.9 21 1 20.1 1 19V8C1 6.9 1.9 6 3 6H7L9 3H15L17 6H21C22.1 6 23 6.9 23 8V19Z" stroke={color} strokeWidth="2" strokeLinejoin="round"/><circle cx="12" cy="13" r="4" stroke={color} strokeWidth="2"/></svg>;

const S = {
  root:{fontFamily:"'Nunito',sans-serif",maxWidth:430,margin:"0 auto",minHeight:"100vh",background:"#f7f7f7",position:"relative"},
  toast:{position:"fixed",top:16,left:"50%",transform:"translateX(-50%)",color:"#fff",padding:"11px 22px",borderRadius:100,fontWeight:700,zIndex:9999,fontSize:14,boxShadow:"0 4px 24px rgba(0,0,0,0.18)",whiteSpace:"nowrap"},
  splash:{minHeight:"100vh",background:"linear-gradient(160deg,#FF6B35 0%,#FF9E1B 100%)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:32},
  splashIco:{background:"rgba(255,255,255,0.2)",borderRadius:24,padding:20,marginBottom:12},
  splashTitle:{color:"#fff",fontSize:38,fontWeight:900,margin:0},
  splashSub:{color:"rgba(255,255,255,0.8)",fontSize:16,margin:"6px 0 0"},
  loaderWrap:{width:160,height:4,background:"rgba(255,255,255,0.3)",borderRadius:100,overflow:"hidden"},
  authPage:{minHeight:"100vh",background:"#fff",overflowY:"auto"},
  authHero:{background:"linear-gradient(160deg,#FF6B35,#FF9E1B)",padding:"44px 24px 32px",textAlign:"center"},
  authIcoBox:{background:"rgba(255,255,255,0.2)",borderRadius:20,padding:16,display:"inline-block",marginBottom:12},
  authBrand:{color:"#fff",fontSize:30,fontWeight:900,margin:0},
  authSub:{color:"rgba(255,255,255,0.85)",margin:"6px 0 0",fontSize:15},
  authCard:{padding:"24px 24px 32px"},
  tabs:{display:"flex",background:"#f3f4f6",borderRadius:14,padding:4,marginBottom:22},
  tabBtn:{flex:1,padding:"11px 0",border:"none",background:"transparent",cursor:"pointer",fontWeight:700,fontSize:15,borderRadius:11,color:"#6b7280",fontFamily:"inherit"},
  tabBtnOn:{background:"#fff",color:"#FF6B35",boxShadow:"0 2px 10px rgba(0,0,0,0.1)"},
  layout:{display:"flex",flexDirection:"column",height:"100vh"},
  content:{flex:1,overflowY:"auto",paddingBottom:72},
  nav:{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:430,background:"#fff",borderTop:"1px solid #f0f0f0",display:"flex",alignItems:"center",padding:"6px 0 10px",zIndex:100,boxShadow:"0 -2px 20px rgba(0,0,0,0.06)"},
  navBtn:{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3,border:"none",background:"transparent",cursor:"pointer",padding:"4px 0",position:"relative"},
  navSpecial:{background:"linear-gradient(135deg,#FF6B35,#FF9E1B)",borderRadius:"50%",width:52,height:52,margin:"-14px auto 0",boxShadow:"0 4px 16px rgba(255,107,53,0.45)",flex:"unset",padding:0,display:"flex",alignItems:"center",justifyContent:"center"},
  badge:{position:"absolute",top:2,right:10,background:"#ef4444",color:"#fff",fontSize:10,fontWeight:800,width:16,height:16,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center"},
  screen:{padding:"22px 16px 16px"},
  title:{fontSize:24,fontWeight:900,margin:"0 0 20px"},
  hHead:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20},
  hSmall:{color:"#9ca3af",fontSize:13,margin:0},
  hName:{fontSize:22,fontWeight:900,margin:"2px 0 0"},
  sBar:{display:"flex",alignItems:"center",gap:10,background:"#fff",border:"2px solid #f0f0f0",borderRadius:14,padding:"11px 16px",marginBottom:16,boxShadow:"0 2px 8px rgba(0,0,0,0.04)"},
  sInput:{flex:1,border:"none",outline:"none",fontSize:15,background:"transparent",fontFamily:"inherit"},
  catChip:{flexShrink:0,padding:"7px 16px",borderRadius:100,border:"2px solid #e5e7eb",background:"#fff",cursor:"pointer",fontSize:13,fontWeight:700,color:"#6b7280",fontFamily:"inherit"},
  catOn:{background:"#FF6B35",borderColor:"#FF6B35",color:"#fff"},
  count:{color:"#9ca3af",fontSize:13,margin:"0 0 14px"},
  grid:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14},
  card:{background:"#fff",borderRadius:16,overflow:"hidden",cursor:"pointer",boxShadow:"0 2px 12px rgba(0,0,0,0.07)",border:"1px solid #f5f5f5"},
  cardImg:{height:140,position:"relative",overflow:"hidden",background:"#f9f9f9"},
  condTag:{position:"absolute",bottom:8,left:8,background:"rgba(0,0,0,0.55)",color:"#fff",fontSize:11,fontWeight:700,padding:"3px 9px",borderRadius:100},
  cardBody:{padding:"10px 12px 12px"},
  cardTitle:{fontWeight:700,fontSize:14,margin:"0 0 4px",lineHeight:1.3,overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"},
  cardPrice:{fontWeight:900,fontSize:17,color:"#FF6B35",margin:"0 0 6px"},
  filterRow:{display:"flex",gap:8,alignItems:"center",marginBottom:16},
  fInput:{flex:1,border:"2px solid #e5e7eb",borderRadius:10,padding:"9px 12px",fontSize:13,outline:"none",fontFamily:"inherit",background:"#f9fafb"},
  fSelect:{border:"2px solid #e5e7eb",borderRadius:10,padding:"9px 10px",fontSize:13,outline:"none",fontFamily:"inherit",background:"#f9fafb",cursor:"pointer"},
  fw:{marginBottom:14},
  lbl:{fontSize:13,fontWeight:700,color:"#374151",margin:"0 0 5px"},
  inp:{width:"100%",border:"2px solid #e5e7eb",borderRadius:12,padding:"12px 14px",fontSize:15,outline:"none",background:"#f9fafb",fontFamily:"inherit",boxSizing:"border-box",color:"#111"},
  stepBar:{display:"flex",alignItems:"center",marginBottom:26,padding:"0 20px"},
  dot:{width:34,height:34,borderRadius:"50%",background:"#e5e7eb",color:"#9ca3af",fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,flexShrink:0},
  dotOn:{background:"#FF6B35",color:"#fff"},
  dLine:{flex:1,height:3},
  photoGrid:{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:14},
  pThumb:{aspectRatio:"1",borderRadius:10,overflow:"hidden",position:"relative"},
  pDel:{position:"absolute",top:4,right:4,background:"rgba(0,0,0,0.6)",color:"#fff",border:"none",borderRadius:"50%",width:22,height:22,cursor:"pointer",fontSize:11,display:"flex",alignItems:"center",justifyContent:"center"},
  pMain:{position:"absolute",bottom:4,left:4,background:"#FF6B35",color:"#fff",fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:100},
  pAdd:{aspectRatio:"1",border:"2px dashed #d1d5db",borderRadius:10,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"#f9fafb",cursor:"pointer"},
  payOpt:{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"13px 16px",border:"2px solid #e5e7eb",borderRadius:12,background:"#f9fafb",cursor:"pointer",fontWeight:600,fontSize:14,marginBottom:8,fontFamily:"inherit",color:"#374151",textAlign:"left"},
  payOptOn:{borderColor:"#10b981",background:"#ecfdf5",color:"#065f46"},
  chk:{width:20,height:20,borderRadius:"50%",border:"2px solid #d1d5db",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:12},
  chkOn:{background:"#10b981",borderColor:"#10b981",color:"#fff"},
  prevBox:{background:"#f9fafb",border:"1px solid #e5e7eb",borderRadius:16,padding:16},
  convRow:{display:"flex",alignItems:"center",gap:14,padding:"14px 16px",background:"#fff",borderRadius:16,marginBottom:10,cursor:"pointer",boxShadow:"0 2px 8px rgba(0,0,0,0.05)"},
  profHero:{background:"linear-gradient(160deg,#fff8f5,#fff)",padding:"28px 20px 20px",display:"flex",flexDirection:"column",alignItems:"center",borderBottom:"1px solid #f0f0f0",marginBottom:4},
  statsRow:{display:"flex",background:"#f9fafb",borderRadius:14,overflow:"hidden",width:"100%",marginTop:16,border:"1px solid #f0f0f0"},
  infoRow:{display:"flex",alignItems:"center",gap:14,padding:"12px 0",borderBottom:"1px solid #f5f5f5"},
  myPRow:{display:"flex",alignItems:"center",gap:12,padding:"12px 0",borderBottom:"1px solid #f5f5f5"},
  delBtn:{background:"#fee2e2",border:"none",borderRadius:10,width:36,height:36,cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0},
  avEditBtn:{position:"absolute",bottom:0,right:0,background:"#FF6B35",color:"#fff",border:"none",borderRadius:"50%",width:28,height:28,cursor:"pointer",fontSize:13},
  detPage:{minHeight:"100vh",background:"#fff"},
  backFloat:{position:"absolute",top:14,left:14,background:"rgba(255,255,255,0.9)",border:"none",borderRadius:100,padding:"8px 16px",cursor:"pointer",fontWeight:800,fontSize:15,boxShadow:"0 2px 10px rgba(0,0,0,0.12)"},
  dotRow:{position:"absolute",bottom:12,left:"50%",transform:"translateX(-50%)",display:"flex",gap:6},
  detBody:{padding:"20px 20px 32px"},
  detSec:{background:"#f9fafb",borderRadius:14,padding:"14px 16px",marginBottom:14,border:"1px solid #f0f0f0"},
  detSecTitle:{fontWeight:800,margin:"0 0 8px",fontSize:15},
  sellCard:{display:"flex",alignItems:"center",gap:14,background:"#f9fafb",borderRadius:16,padding:"14px 16px",border:"1px solid #f0f0f0"},
  chatPage:{display:"flex",flexDirection:"column",height:"100vh",background:"#f3f4f6"},
  chatHead:{display:"flex",alignItems:"center",gap:12,background:"#fff",padding:"14px 16px",borderBottom:"1px solid #f0f0f0"},
  backInline:{background:"none",border:"none",cursor:"pointer",fontWeight:800,fontSize:16,color:"#374151",padding:"0 8px 0 0"},
  chatMsgs:{flex:1,overflowY:"auto",padding:"16px 14px 8px"},
  bub:{maxWidth:"76%",padding:"10px 14px",borderRadius:18},
  bubMe:{background:"#FF6B35",color:"#fff",borderBottomRightRadius:4},
  bubThem:{background:"#fff",color:"#111",borderBottomLeftRadius:4,boxShadow:"0 1px 4px rgba(0,0,0,0.08)"},
  chatBar:{display:"flex",gap:10,padding:"10px 14px 18px",background:"#fff",borderTop:"1px solid #f0f0f0"},
  chatInput:{flex:1,border:"2px solid #e5e7eb",borderRadius:100,padding:"12px 18px",outline:"none",fontSize:15,fontFamily:"inherit",background:"#f9fafb"},
  sendBtn:{width:48,height:48,borderRadius:"50%",background:"linear-gradient(135deg,#FF6B35,#FF9E1B)",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0},
  tag:{display:"inline-block",background:"#f3f4f6",color:"#6b7280",borderRadius:100,padding:"4px 10px",fontSize:12,fontWeight:700},
  tagG:{background:"#d1fae5",color:"#065f46"},
  empty:{textAlign:"center",padding:"56px 0 32px",color:"#9ca3af"},
  btnP:{width:"100%",padding:"15px",background:"linear-gradient(135deg,#FF6B35,#FF9E1B)",border:"none",borderRadius:14,color:"#fff",fontWeight:800,fontSize:16,cursor:"pointer",marginTop:6,fontFamily:"inherit",boxSizing:"border-box"},
  btnS:{width:"100%",padding:"14px",background:"#f3f4f6",border:"none",borderRadius:14,color:"#374151",fontWeight:700,fontSize:15,cursor:"pointer",fontFamily:"inherit",boxSizing:"border-box"},
  btnDanger:{width:"100%",padding:"14px",background:"#fee2e2",border:"none",borderRadius:14,color:"#ef4444",fontWeight:700,fontSize:15,cursor:"pointer",fontFamily:"inherit",boxSizing:"border-box"},
};

