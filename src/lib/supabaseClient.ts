import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('缺少 Supabase 环境变量，请检查 .env.local 文件');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function getUsersByRole(role: 'parent' | 'child') {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username')
    .eq('role', role);
  if (error) {
    console.error('获取用户列表失败:', error);
    return [];
  }
  return data || [];
}