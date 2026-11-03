// 회원 로그인 (Supabase Auth) + 내 경로(즐겨찾기·자주 가는 일정) 저장.
// 회원은 명부로 미리 등록돼 있다. 처음 온 회원은 "비밀번호 만들기"로 메일을 받아 링크에서 비밀번호를 정한다.
// 앱(app.js)과는 이벤트로만 주고받는다: 앱이 저장하면 'jachul:saved', 클라우드 값을 앱에 넣을 땐 'jachul:cloud'.
const cfg = window.JACHUL_CONFIG || {};
const $ = id => document.getElementById(id);
const sb = window.supabase && cfg.supabaseUrl ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {auth: {persistSession: true, detectSessionInUrl: true}}) : null;
let user = null, memberName = '', pushTimer = null, latest = null;

const ERR = {
  'Invalid login credentials': '이메일이나 비밀번호가 틀렸어. 처음이면 "비밀번호 만들기"부터 해.',
  'Email not confirmed': '아직 이메일 확인이 안 됐어. 메일함을 확인해.',
  'New password should be different from the old password.': '전이랑 다른 비밀번호로 해.',
};
const errText = e => ERR[e?.message] || (/rate limit/i.test(e?.message || '') ? '메일을 너무 자주 보냈어. 잠깐 뒤에 다시 해.' : /weak|at least/i.test(e?.message || '') ? '비밀번호가 너무 쉬워. 8자 넘게, 숫자도 섞어.' : '잠깐 문제가 생겼어. 다시 해줘.');

function view(name){
  for(const v of document.querySelectorAll('#authDialog [data-view]')) v.hidden = v.dataset.view !== name;
  $('authMsg').textContent = '';
  const focus = $('authDialog').querySelector(`[data-view="${name}"] input`);
  if(focus) setTimeout(() => focus.focus(), 0);
}
function open(name){ view(name); if(!$('authDialog').open) $('authDialog').showModal(); }
function msg(t, ok = false){ $('authMsg').textContent = t; $('authMsg').classList.toggle('ok', ok); }
function busy(form, on){ for(const b of form.querySelectorAll('button')) b.disabled = on; }

function renderAccount(){
  $('account').textContent = user ? `${memberName || '나'} ✓` : '로그인';
  $('account').setAttribute('aria-label', user ? '내 계정' : '로그인');
  $('accountName').textContent = memberName ? `${memberName}님` : user?.email || '';
  $('accountEmail').textContent = user?.email || '';
}

// ---- 내 경로 동기화 ----
const local = () => { try{ const r = JSON.parse(localStorage.getItem('jansori-v1')); return {favorites: r?.favorites || [], routines: r?.routines || []}; }catch{ return {favorites: [], routines: []}; } };
const sameTrip = (a, b) => a.from === b.from && a.to === b.to;
function merge(cloud, mine){
  const favorites = [...cloud.favorites];
  for(const f of mine.favorites) if(f && !favorites.some(x => sameTrip(x, f))) favorites.push(f);
  const routines = [...cloud.routines];
  for(const r of mine.routines) if(r && !routines.some(x => x.id === r.id)) routines.push(r);
  return {favorites: favorites.slice(-12), routines: routines.slice(0, 12)};
}
async function push(data){
  if(!user) return;
  const {error} = await sb.from('user_routes').upsert({user_id: user.id, favorites: data.favorites, routines: data.routines, updated_at: new Date().toISOString()});
  $('syncState').textContent = error ? '저장 실패 · 이 기기에만 있음' : `내 경로 저장됨 · ${new Date().toLocaleTimeString('ko-KR', {hour: '2-digit', minute: '2-digit', hour12: false})}`;
}
async function pull(){
  const {data, error} = await sb.from('user_routes').select('favorites,routines').maybeSingle();
  if(error){ $('syncState').textContent = '내 경로를 못 불러왔어.'; return; }
  const merged = merge(data || {favorites: [], routines: []}, latest || local());
  window.dispatchEvent(new CustomEvent('jachul:cloud', {detail: merged}));
  await push(merged);
}
window.addEventListener('jachul:saved', e => {
  latest = e.detail;
  if(!user) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => push(latest), 800);
});

async function signedIn(u){
  user = u;
  const {data} = await sb.from('members').select('name').maybeSingle();
  if(!data){   // 명부에 없는 계정은 받지 않음
    await sb.auth.signOut(); user = null; renderAccount();
    open('login'); msg('명부에 없는 계정이야. 등록된 이메일로 해.');
    return;
  }
  memberName = data.name; renderAccount(); pull();
}

// ---- 화면 ----
function init(){
  if(!sb){ $('account').hidden = true; return; }
  $('account').onclick = () => open(user ? 'me' : 'login');
  $('authClose').onclick = () => $('authDialog').close();
  for(const b of document.querySelectorAll('#authDialog [data-to]')) b.onclick = () => { view(b.dataset.to); if($('loginEmail').value) $('firstEmail').value ||= $('loginEmail').value; };

  $('loginForm').onsubmit = async e => {
    e.preventDefault(); busy(e.target, true);
    const {error} = await sb.auth.signInWithPassword({email: $('loginEmail').value.trim(), password: $('loginPw').value});
    busy(e.target, false);
    if(error) return msg(errText(error));
    $('loginPw').value = ''; $('authDialog').close();
  };
  $('firstForm').onsubmit = async e => {
    e.preventDefault(); busy(e.target, true);
    const email = $('firstEmail').value.trim();
    const {error} = await sb.auth.resetPasswordForEmail(email, {redirectTo: location.origin + location.pathname});
    busy(e.target, false);
    if(error) return msg(errText(error));
    msg(`${email}로 메일 보냈어. 메일 속 링크를 누르면 여기로 돌아와서 비밀번호를 정할 수 있어. (명부에 있는 이메일만 메일이 가)`, true);
  };
  $('pwForm').onsubmit = async e => {
    e.preventDefault();
    const pw = $('newPw').value;
    if(pw.length < 8) return msg('비밀번호는 8자 넘게.');
    if(pw !== $('newPw2').value) return msg('두 번 쓴 비밀번호가 달라.');
    busy(e.target, true);
    const {error} = await sb.auth.updateUser({password: pw});
    busy(e.target, false);
    if(error) return msg(errText(error));
    $('newPw').value = $('newPw2').value = '';
    view('me'); msg('비밀번호 정했어. 다음부턴 이메일이랑 이 비밀번호로 로그인해.', true);
  };
  $('logout').onclick = async () => { await sb.auth.signOut(); $('authDialog').close(); };

  sb.auth.onAuthStateChange((event, session) => {
    // 메일 링크로 돌아오면 바로 "비밀번호 정하기"
    if(event === 'PASSWORD_RECOVERY'){ open('setpw'); }
    const u = session?.user || null;
    if(u && u.id !== user?.id) setTimeout(() => signedIn(u), 0);
    if(!u && user){ user = null; memberName = ''; $('syncState').textContent = ''; renderAccount(); }
  });
  renderAccount();
}
init();
