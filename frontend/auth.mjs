// 회원 로그인 (Supabase Auth) + 내 경로 동기화.
// ★ 내 경로 창(#routesDialog) 맨 위에 로그인 칸을 붙인다: 로그인 / 처음 왔어? 비밀번호 만들기 / 새 비밀번호 / 로그인됨.
// - 회원은 명부(jachul_members)로 미리 등록돼 있다. 처음 온 회원은 메일 링크로 돌아와서 비밀번호를 정한다.
// - 내 경로 목록은 페이지(index.html)가 관리하고, 로그인하면 Supabase(jachul_routes)와 맞춘다.
//   페이지 → 'jachul:personal' (목표·경로 바뀜), 이 파일 → 'jachul:session' (로그인: 내 계정 것으로 바꿔) / 'jachul:signout' (지워)
const cfg = window.JACHUL_CONFIG || {};
// 로그인 유지: 체크하면 localStorage(브라우저 꺼도 유지), 안 하면 sessionStorage(이 탭 닫으면 로그아웃)
const KEEP = 'jachul-keep';
const keepOn = () => { try{ return localStorage.getItem(KEEP) !== '0'; }catch{ return false; } };
const authStore = {
  getItem: k => { try{ return localStorage.getItem(k) ?? sessionStorage.getItem(k); }catch{ return null; } },
  setItem: (k, v) => { try{ if(keepOn()){ localStorage.setItem(k, v); sessionStorage.removeItem(k); } else { sessionStorage.setItem(k, v); localStorage.removeItem(k); } }catch{} },
  removeItem: k => { try{ localStorage.removeItem(k); sessionStorage.removeItem(k); }catch{} },
};
const sb = window.supabase && cfg.supabaseUrl
  ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {auth: {persistSession: true, detectSessionInUrl: true, storage: authStore}}) : null;
let user = null, memberName = '', lastPushed = '', pushTimer = null, mode = 'login';

const ERR = {
  'Invalid login credentials': '이메일이나 비밀번호가 틀렸어. 처음이면 아래 "여기서 비밀번호 정하기"부터 해.',
  'Email not confirmed': '아직 이메일 확인이 안 됐어. 메일함 봐.',
  'New password should be different from the old password.': '전이랑 다른 비밀번호로 해.',
};
const errText = e => ERR[e?.message] || (/rate limit/i.test(e?.message || '') ? '메일을 너무 자주 보냈어. 좀 있다 다시 해.'
  : /weak|at least|characters/i.test(e?.message || '') ? '비밀번호가 너무 쉬워. 8자 넘게, 숫자도 섞어.' : '잠깐 문제가 생겼어. 다시 해줘.');

// ---- 화면: ★ 창 맨 위에 붙이기 ----
const css = `
.acct{margin:10px 0 4px;padding:12px;background:var(--soft)}
.acct form{display:grid;gap:2px}
.acct label{margin:8px 0 0}
.acct .save{margin-top:12px}
.acct .linkish{background:none;border:none;filter:none !important;padding:6px 0 0;font-size:13px;font-weight:400;color:var(--muted);text-decoration:underline;text-underline-offset:3px}
.acct .who{margin:0;font-size:15px}
.acct .who small{display:block;color:var(--muted);font-size:12px}
.acct .row2{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
.acct .msg-line{margin:10px 0 0;font-size:13px;font-weight:700;color:var(--late)}
.acct .msg-line.ok{color:var(--ok)}
.acct .msg-line:empty{display:none}
.acct label.keep{display:flex;gap:8px;align-items:center;margin:12px 0 0;font-size:14px;cursor:pointer}
.acct label.keep input{width:20px;height:20px;margin:0;flex:none;accent-color:var(--ok,#2a9d5c)}
.acct label.keep{flex-wrap:wrap;row-gap:2px}
.acct label.keep small{flex-basis:100%;padding-left:28px;color:var(--muted);font-size:12px}
.acct [data-import]{margin-top:10px;font-size:13px}
.acct .admin{margin-top:14px;padding-top:12px;border-top:2px dashed var(--line,#999)}
.acct .admin h3{margin:0 0 6px;font-size:15px}
.acct .reqs{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.acct .reqs li{display:grid;grid-template-columns:1fr auto auto;gap:6px;align-items:center;font-size:13px}
.acct .reqs li span{min-width:0;overflow-wrap:anywhere}
.acct .reqs li small{display:block;color:var(--muted)}
.acct .reqs button{padding:4px 8px;font-size:12px}
.acct details{margin-top:10px;font-size:13px}
.acct .codebox{margin-top:12px;padding:10px;background:var(--ok,#2a9d5c);color:#fff;display:grid;gap:6px}
.acct .codebox p{margin:0}
.acct .codebox output{font:700 26px/1.2 monospace;letter-spacing:2px;user-select:all}
.acct .codebox button{justify-self:start}
.acct .codebox small{font-size:12px}`;

const dlg = document.getElementById('routesDialog');
const box = document.createElement('div');
box.className = 'acct';
box.innerHTML = `
  <div data-pane="login">
    <p class="hint">로그인하면 이런 게 생겨:<br>★ <b>내 경로</b>: 자주 가는 길 저장해두고 바로 불러오기<br>⚙ <b>설정</b>: 캐릭터 꾸미기, 걷는 시간·여유·보챌 간격<br>지금 목표까지 다 내 계정에 저장돼서 폰·컴퓨터 어디서든 그대로야. (알림·효과음·GPS·아두이노는 로그인 없이도 ⚙에서 돼)</p>
    <form data-form="login"><label for="acEmail">이메일</label><input id="acEmail" type="email" autocomplete="username" required>
      <label for="acPw">비밀번호</label><input id="acPw" type="password" autocomplete="current-password" required>
      <label class="keep"><input type="checkbox" data-keep checked> 로그인 유지 <small>(내 폰·컴퓨터면 체크. 같이 쓰는 컴퓨터면 끄기)</small></label>
      <button class="save" type="submit">로그인</button></form>
    <button type="button" class="linkish" data-go="first">처음 왔어? / 비밀번호 잊었어? 여기서 비밀번호 정하기</button>
  </div>
  <div data-pane="first" hidden>
    <p class="hint">처음이면 여기서 바로 비밀번호 정해. 명부에 있는 이메일이랑 따로 받은 <b>가입 코드</b>(1번만 씀)가 필요해.</p>
    <form data-form="first"><label for="acFirst">이메일</label><input id="acFirst" type="email" autocomplete="username" required>
      <label for="acCode">가입 코드</label><input id="acCode" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false" placeholder="ABCD-1234" maxlength="12" required>
      <label for="acFirstPw">새 비밀번호 (8자 넘게)</label><input id="acFirstPw" type="password" autocomplete="new-password" minlength="8" maxlength="72" required>
      <label for="acFirstPw2">한 번 더</label><input id="acFirstPw2" type="password" autocomplete="new-password" minlength="8" maxlength="72" required>
      <label class="keep"><input type="checkbox" data-keep checked> 로그인 유지 <small>(같이 쓰는 컴퓨터면 끄기)</small></label>
      <button class="save" type="submit">비밀번호 정하고 로그인</button></form>
    <button type="button" class="linkish" data-go="ask">가입 코드 없어? / 비밀번호 잊었어? 코드 달라고 하기</button>
    <button type="button" class="linkish" data-go="login">← 로그인으로</button>
  </div>
  <div data-pane="ask" hidden>
    <p class="hint">관리자한테 가입 코드 달라고 남겨. 코드 받으면 "여기서 비밀번호 정하기"에서 쓰면 돼.</p>
    <form data-form="ask"><label for="akEmail">이메일</label><input id="akEmail" type="email" autocomplete="email" maxlength="120" required>
      <label for="akName">이름</label><input id="akName" autocomplete="name" maxlength="30" required>
      <label for="akNote">한마디 (선택: 어느 수업인지, 비밀번호 잊었는지 등)</label><input id="akNote" maxlength="200">
      <button class="save" type="submit">코드 달라고 하기</button></form>
    <button type="button" class="linkish" data-go="first">← 코드 받았으면 비밀번호 정하기</button>
  </div>
  <div data-pane="setpw" hidden>
    <p class="hint">새 비밀번호 정해. 8자 넘게.</p>
    <form data-form="setpw"><label for="acNew">새 비밀번호</label><input id="acNew" type="password" autocomplete="new-password" minlength="8" required>
      <label for="acNew2">한 번 더</label><input id="acNew2" type="password" autocomplete="new-password" minlength="8" required>
      <button class="save" type="submit">비밀번호 저장</button></form>
  </div>
  <div data-pane="me" hidden>
    <p class="who"><b data-name></b> 로그인됨<small data-sync></small></p>
    <button type="button" data-import hidden></button>
    <div class="row2"><button type="button" data-go="setpw">비밀번호 바꾸기</button><button type="button" data-logout>로그아웃</button></div>
    <div class="admin" data-admin hidden>
      <h3>관리자 · 가입 코드 요청 <span data-reqn></span></h3>
      <ul class="reqs" data-reqs></ul>
      <details><summary>요청 없이 직접 코드 만들기</summary>
        <form data-form="issue"><label for="adEmail">이메일</label><input id="adEmail" type="email" maxlength="120" required>
          <label for="adName">이름 (명부에 없는 새 사람이면 꼭)</label><input id="adName" maxlength="30">
          <button class="save" type="submit">코드 만들기</button></form></details>
      <div class="codebox" data-codebox hidden><p><b data-codewho></b> 가입 코드</p><output data-code></output>
        <button type="button" data-copy>복사</button><small>이 창 닫으면 다시 못 봐. 그 사람한테만 따로 보내. 예전 코드는 이제 안 돼.</small></div>
    </div>
  </div>
  <p class="msg-line" role="alert" data-msg></p>`;
if(dlg && sb){
  const style = document.createElement('style'); style.textContent = css; document.head.append(style);
  const head = dlg.querySelector('.khead');
  head ? head.after(box) : dlg.querySelector('.sheet').prepend(box);
}
const q = sel => box.querySelector(sel);
// 위쪽 '로그인' 버튼: 내 경로 창 안에 숨어 있던 로그인 칸을 바로 열어줌
const loginBtn = document.getElementById('loginBtn');
if(loginBtn && dlg && sb){ loginBtn.dataset.auth = '1'; loginBtn.addEventListener('click', () => open(user ? 'me' : 'login')); }

function show(pane){
  mode = pane;
  for(const p of box.querySelectorAll('[data-pane]')) p.hidden = p.dataset.pane !== pane;
  msg('');
}
function msg(t, ok = false){ q('[data-msg]').textContent = t; q('[data-msg]').classList.toggle('ok', ok); }
function open(pane){ show(pane); if(!dlg.open) document.getElementById('openRoutes').click(); }
function render(){
  document.body.classList.toggle('signed-in', !!user && synced);   // ★·계정 설정은 로그인(내 정보 불러온 뒤)에만
  q('[data-name]').textContent = memberName ? `${memberName}님` : '';
  if(user && (mode === 'login' || mode === 'first')) show('me');
  if(!user && (mode === 'me' || mode === 'setpw')) show('login');
  const b = document.getElementById('openRoutes');
  if(b) b.title = user ? `${memberName} · 내 경로` : '내 경로 · 로그인';
  const lb = document.getElementById('loginBtn');
  if(lb){ lb.textContent = user ? (memberName ? `${memberName}님` : '내 계정') : '로그인'; lb.title = user ? '로그인됨 · 눌러서 내 계정 보기' : '로그인하면 내 경로가 폰·컴퓨터에 같이 저장돼'; }
}

// ---- 내 경로 동기화 ----
// 페이지(index.html)가 계정 정보(목표·경로)를 바꾸면 'jachul:personal'로 알려줌 → 내 계정 줄에만 저장 (RLS: 본인 것만)
let latest = null, synced = false;
async function push(){
  if(!user || !synced || !latest || latest.owner !== user.id) return;
  const row = {user_id: user.id, favorites: latest.routes, updated_at: new Date().toISOString()};
  if(latest.goal) row.goal = latest.goal;
  const body = JSON.stringify(row.favorites) + JSON.stringify(row.goal || null);
  if(body === lastPushed) return;
  const {error} = await sb.from('jachul_routes').upsert(row);
  if(!error) lastPushed = body;
  q('[data-sync]').textContent = error ? '저장 실패. 잠깐 뒤에 다시 해볼게.' : '목표랑 경로가 내 계정에 저장돼 있어.';
  if(error){ clearTimeout(pushTimer); pushTimer = setTimeout(push, 5000); }
}
// 로그인하면 서버에 있는 내 것만 가져와서 화면을 내 걸로 바꿈 (다른 사람 것·손님 것과 안 섞음)
async function pull(){
  const {data, error} = await sb.from('jachul_routes').select('favorites, goal').maybeSingle();
  if(error){ q('[data-sync]').textContent = '저장한 걸 못 불러왔어. 새로고침 해봐.'; return; }
  synced = true; lastPushed = ''; render();
  window.dispatchEvent(new CustomEvent('jachul:session', {detail: {uid: user.id, cloud: data ? {routes: data.favorites, goal: data.goal} : null}}));
  renderGuest();
}
window.addEventListener('jachul:personal', e => {
  latest = e.detail;
  if(!user || !synced) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(push, 600);
});
// 손님일 때 이 기기에 저장한 경로 → 내 계정으로 옮길지 (본인이 눌러야만)
function renderGuest(){
  const n = (window.jachulGuestRoutes && window.jachulGuestRoutes()) || 0;
  const b = q('[data-import]');
  b.hidden = !user || !n;
  b.textContent = `로그인 전에 이 기기에 저장한 경로 ${n}개 내 계정에 넣기`;
}

async function signedIn(u){
  user = u;
  const {data} = await sb.from('jachul_members').select('name').maybeSingle();
  if(!data){   // 명부에 없는 계정은 안 받음
    await sb.auth.signOut(); user = null; render(); open('login'); msg('명부에 없는 계정이야. 등록된 이메일로 해.');
    return;
  }
  memberName = data.name; render(); pull(); loadReqs();
}

// ---- 이벤트 ----
const busy = (form, on) => form.querySelectorAll('button').forEach(b => b.disabled = on);
box.addEventListener('click', async e => {
  const t = e.target.closest('button'); if(!t) return;
  if(t.dataset.go){ show(t.dataset.go); if(t.dataset.go === 'first' && q('#acEmail').value) q('#acFirst').value ||= q('#acEmail').value;
    if(t.dataset.go === 'ask') q('#akEmail').value ||= q('#acFirst').value || q('#acEmail').value; return; }
  if(t.hasAttribute('data-logout')){ await sb.auth.signOut(); }
  if(t.hasAttribute('data-import')){ window.dispatchEvent(new CustomEvent('jachul:import-guest')); renderGuest(); msg('옮겼어. 이제 내 계정에 저장돼.', true); }
  if(t.dataset.issue){ const r = reqs.find(x => String(x.id) === t.dataset.issue); if(r) issue(r.email, r.name, t.closest('li')); }
  if(t.dataset.dismiss){ await admin({action: 'dismiss', id: Number(t.dataset.dismiss)}); loadReqs(); }
  if(t.hasAttribute('data-copy')){
    const c = q('[data-code]').textContent;
    try{ await navigator.clipboard.writeText(c); t.textContent = '복사됨'; }catch{ getSelection().selectAllChildren(q('[data-code]')); }
  }
});
box.addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target, kind = f.dataset.form;
  const keep = f.querySelector('[data-keep]');
  if(keep) try{ localStorage.setItem(KEEP, keep.checked ? '1' : '0'); }catch{}
  if(kind === 'login'){
    busy(f, true);
    const {error} = await sb.auth.signInWithPassword({email: q('#acEmail').value.trim(), password: q('#acPw').value});
    busy(f, false);
    if(error) return msg(errText(error));
    q('#acPw').value = '';
  } else if(kind === 'first'){
    busy(f, true);
    const email = q('#acFirst').value.trim(), pw = q('#acFirstPw').value;
    if(pw !== q('#acFirstPw2').value){ busy(f, false); return msg('두 번 쓴 비밀번호가 달라.'); }
    // 비밀번호는 Supabase(HTTPS)로만 감. DB 함수가 이메일+가입 코드 확인하고 bcrypt로만 저장. 코드는 1회용, 5번 틀리면 잠김
    const {data, error} = await sb.rpc('jachul_set_password', {p_email: email, p_code: q('#acCode').value, p_password: pw});
    if(error || data !== 'ok'){
      busy(f, false);
      return msg(data === 'weak' ? '비밀번호가 너무 짧아. 8자 넘게.' : '이메일이나 가입 코드가 안 맞아. (이미 쓴 코드거나, 5번 틀려서 잠겼으면 관리자한테 새 코드 받아)');
    }
    q('#acCode').value = q('#acFirstPw').value = q('#acFirstPw2').value = '';
    const r = await sb.auth.signInWithPassword({email, password: pw});
    busy(f, false);
    if(r.error) return msg(errText(r.error));
    msg('비밀번호 정했어. 이제 내 경로 저장하면 어디서든 같이 보여.', true);
  } else if(kind === 'ask'){
    busy(f, true);
    const {data, error} = await sb.rpc('jachul_request_code', {p_email: q('#akEmail').value, p_name: q('#akName').value, p_note: q('#akNote').value});
    busy(f, false);
    if(error || data !== 'ok') return msg(data === 'email' ? '이메일 다시 봐.' : data === 'name' ? '이름 써줘 (30자까지).' : data === 'full' ? '요청이 너무 많이 밀려 있어. 좀 있다 해.' : errText(error));
    q('#akNote').value = '';
    msg('요청 남겼어. 관리자가 코드 주면 "여기서 비밀번호 정하기"에서 써.', true);
  } else if(kind === 'issue'){
    issue(q('#adEmail').value, q('#adName').value, f);
  } else if(kind === 'setpw'){
    const pw = q('#acNew').value;
    if(pw.length < 8) return msg('비밀번호는 8자 넘게.');
    if(pw !== q('#acNew2').value) return msg('두 번 쓴 게 달라.');
    busy(f, true);
    const {error} = await sb.auth.updateUser({password: pw});
    busy(f, false);
    if(error) return msg(errText(error));
    q('#acNew').value = q('#acNew2').value = '';
    show('me'); msg('비밀번호 정했어. 다음부턴 이메일이랑 이걸로 로그인해.', true);
  }
});

// ---- 관리자: 가입 코드 요청함 (Edge Function jachul-admin, 관리자 아니면 서버가 거절) ----
let reqs = [];
async function admin(body){
  const {data, error} = await sb.functions.invoke('jachul-admin', {body});
  return error ? null : data;
}
async function loadReqs(){
  const d = await admin({action: 'list'});
  q('[data-admin]').hidden = !d;
  if(!d) return;
  reqs = d.requests || [];
  q('[data-reqn]').textContent = reqs.length ? `${reqs.length}건` : '없음';
  const ul = q('[data-reqs]'); ul.textContent = '';
  for(const r of reqs){   // 남이 쓴 글이라 textContent로만 넣음
    const li = document.createElement('li'), sp = document.createElement('span'), sm = document.createElement('small');
    sp.textContent = `${r.name} · ${r.email}${r.member ? '' : ' (새 사람)'}`;
    sm.textContent = r.note || ''; sp.append(sm);
    const b1 = document.createElement('button'); b1.type = 'button'; b1.dataset.issue = r.id; b1.textContent = '코드 만들기';
    const b2 = document.createElement('button'); b2.type = 'button'; b2.dataset.dismiss = r.id; b2.textContent = '지우기';
    li.append(sp, b1, b2); ul.append(li);
  }
}
async function issue(email, name, el){
  el?.querySelectorAll?.('button').forEach(b => b.disabled = true);
  const d = await admin({action: 'issue', email, name});
  el?.querySelectorAll?.('button').forEach(b => b.disabled = false);
  if(!d?.code) return msg('코드 못 만들었어. 새 사람이면 이름도 넣어.');
  q('[data-codewho]').textContent = `${name || ''} ${email}`.trim();
  q('[data-code]').textContent = d.code;
  q('[data-copy]').textContent = '복사';
  q('[data-codebox]').hidden = false;
  q('#adEmail').value = q('#adName').value = '';
  loadReqs();
}
// 창 닫으면 코드 지움 (다시 못 봄)
dlg?.addEventListener('close', () => { if(q('[data-code]')){ q('[data-code]').textContent = ''; q('[data-codebox]').hidden = true; } });

if(dlg && sb){
  sb.auth.onAuthStateChange((event, session) => {
    if(event === 'PASSWORD_RECOVERY') setTimeout(() => open('setpw'), 300);   // 메일 링크로 돌아오면 바로 비밀번호 정하기
    const u = session?.user || null;
    if(u && u.id !== user?.id) setTimeout(() => signedIn(u), 0);
    if(!u && user){ user = null; memberName = ''; lastPushed = ''; synced = false; clearTimeout(pushTimer); reqs = []; q('[data-admin]').hidden = true; window.dispatchEvent(new CustomEvent('jachul:signout')); render(); renderGuest(); }
    if(!u && !user && event === 'INITIAL_SESSION') window.dispatchEvent(new CustomEvent('jachul:signout'));   // 시작할 때 로그인 안 돼 있으면 남은 계정 정보 지움
  });
  render();
}
