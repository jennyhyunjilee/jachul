// 쟈철 관리자 전용: 가입 코드 요청 보기 / 코드 발급 / 요청 지우기.
// - 로그인한 사람의 이메일이 public.jachul_admins 에 있을 때만 동작 (아니면 403).
// - service_role 키는 Supabase가 이 함수 안에만 넣어줌(SUPABASE_SERVICE_ROLE_KEY). 페이지·깃엔 없음.
// - 코드는 응답으로 관리자 화면에 딱 한 번만 감. DB엔 sha256(소금+코드)만 저장.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const ORIGINS = new Set(["https://jachul.vercel.app", "http://127.0.0.1:5174", "http://localhost:5174"]);
const ABC = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const sha = async (s: string) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
const randHex = (n: number) => hex(crypto.getRandomValues(new Uint8Array(n)).buffer);
function newCode() {
  const r = crypto.getRandomValues(new Uint32Array(8));
  return [...r].map((x) => ABC[x % ABC.length]).join("");
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") || "";
  const cors: Record<string, string> = {
    "Access-Control-Allow-Origin": ORIGINS.has(origin) ? origin : "https://jachul.vercel.app",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
  const json = (status: number, obj: unknown) =>
    new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "method" });

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 누가 불렀는지 확인 → 관리자 명단에 있어야 함
  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: who } = await db.auth.getUser(jwt);
  const me = who?.user?.email?.toLowerCase();
  if (!me) return json(401, { error: "login" });
  const { data: adm } = await db.from("jachul_admins").select("email").eq("email", me).maybeSingle();
  if (!adm) return json(403, { error: "admin" });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* 빈 몸통 */ }
  const action = String(body.action || "");

  if (action === "list") {
    const { data: reqs } = await db.from("jachul_code_requests").select("id,email,name,note,created_at")
      .is("done_at", null).order("created_at").limit(100);
    const { data: mem } = await db.from("jachul_members").select("email");
    const roster = new Set((mem || []).map((m) => m.email.toLowerCase()));
    return json(200, { requests: (reqs || []).map((r) => ({ ...r, member: roster.has(r.email) })) });
  }

  if (action === "issue") {
    const email = String(body.email || "").trim().toLowerCase();
    const name = String(body.name || "").trim().slice(0, 30);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json(400, { error: "email" });
    // 명부에 없으면 추가 (있으면 이름 그대로)
    const { data: m } = await db.from("jachul_members").select("email").eq("email", email).maybeSingle();
    if (!m) {
      if (!name) return json(400, { error: "name" });
      const { error } = await db.from("jachul_members").insert({ email, name });
      if (error) return json(500, { error: "member" });
    }
    // 로그인 계정 없으면 만듦 (비밀번호 없이, 이메일 확인된 상태로. 비밀번호는 본인이 코드로 정함)
    const { error: cu } = await db.auth.admin.createUser({ email, email_confirm: true, user_metadata: { name } });
    if (cu && !/already|registered|exists/i.test(cu.message)) return json(500, { error: "user" });
    // 새 코드 (예전 코드는 무효)
    const code = newCode(), salt = randHex(16);
    const { error: ie } = await db.from("jachul_invites").upsert({
      email_sha: await sha(email), salt, code_hash: await sha(salt + code), fails: 0, used_at: null, created_at: new Date().toISOString(),
    });
    if (ie) return json(500, { error: "invite" });
    await db.from("jachul_code_requests").update({ done_at: new Date().toISOString() }).eq("email", email).is("done_at", null);
    return json(200, { code: code.slice(0, 4) + "-" + code.slice(4) });
  }

  if (action === "dismiss") {
    const id = Number(body.id);
    if (!Number.isInteger(id)) return json(400, { error: "id" });
    await db.from("jachul_code_requests").update({ done_at: new Date().toISOString() }).eq("id", id);
    return json(200, { ok: true });
  }

  return json(400, { error: "action" });
});
