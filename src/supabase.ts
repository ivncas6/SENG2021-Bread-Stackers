import { createClient } from '@supabase/supabase-js';

// link to supabase, make sure to put your keys in .env
const supabaseUrl = process.env.SUPABASE_URL as string;
const supabaseKey = process.env.SUPABASE_KEY as string;



export const supabase = createClient(
  supabaseUrl || 'https://supabase-url-here', 
  supabaseKey || 'api-key-here'
);
