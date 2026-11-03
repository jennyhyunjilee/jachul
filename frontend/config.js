// 배포 주소 설정. 여기엔 공개해도 되는 값만 둔다.
// supabaseKey는 Supabase의 공개(anon) 키: 표마다 RLS로 "본인 것만" 막혀 있어서 페이지에 있어도 된다.
// OpenAI·서울시 키 같은 비밀 값은 백엔드(Render) 환경변수에만 둔다.
window.JACHUL_CONFIG = {
  // 로컬(backend/app.py가 프론트도 같이 내보냄)에선 같은 주소, 배포에선 Render 백엔드
  apiBase: ['localhost', '127.0.0.1'].includes(location.hostname) ? '' : 'https://jachul-api.onrender.com',
  supabaseUrl: 'https://lkodieijgaegfnayrapq.supabase.co',
  supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxrb2RpZWlqZ2FlZ2ZuYXlyYXBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEyNjQxNTIsImV4cCI6MjEwNjg0MDE1Mn0.Zc7Fr7cdSJz3Aoig9GfnUsSGEvU1Ib4hrhG-UImEjp8',
};
