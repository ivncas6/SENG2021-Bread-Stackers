import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

// link to supabase, make sure to put your keys in .env
const supabaseUrl = process.env.SUPABASE_URL as string;
const supabaseKey = process.env.SUPABASE_KEY as string;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Configure or connect supabase');
}

export const supabase = createClient(supabaseUrl, supabaseKey);
