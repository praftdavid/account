import { supabase } from '../../lib/supabaseClient.js';

export async function fetchDepartments({ activeOnly = false } = {}) {
  let q = supabase.from('departments').select('*').order('sort_order').order('dept_name');
  if (activeOnly) q = q.eq('is_active', true);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}
