import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Missing env vars'); process.exit(1); }

const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

async function main() {
  const { data: { users }, error } = await supabase.auth.admin.listUsers();
  if (error) { console.error(error); process.exit(1); }
  
  const user = users.find((u: any) => u.email === 'dr.oli.don01@gmail.com');
  if (!user) { console.error('User not found'); process.exit(1); }
  
  console.log('User ID:', user.id);
  
  const { error: up } = await supabase.from('user_roles').update({ role: 'admin' }).eq('user_id', user.id);
  if (up) { console.error(up); process.exit(1); }
  
  console.log('Updated to admin');
}

main();
