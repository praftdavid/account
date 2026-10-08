import { supabase } from '../../lib/supabaseClient.js';

export async function fetchTemplates() {
  const { data, error } = await supabase.from('doc_templates').select('*').order('doc_type').order('name');
  if (error) throw error;
  return data ?? [];
}
