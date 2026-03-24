import { createClient } from '@supabase/supabase-js';
import { supabaseUrl, supabaseKey } from './config'

// link to supabase
export const supabase = createClient(
  supabaseUrl as string, supabaseKey as string);
