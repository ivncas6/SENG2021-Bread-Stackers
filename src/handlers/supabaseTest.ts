import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

// Make sure the variable names exactly match your .env
const supabase = createClient(
  process.env.supabaseURL!,
  process.env.supabaseKey!
);

async function test() {
  const { data, error } = await supabase
    .from('contacts')
    .insert([
      { firstName: 'John', lastName: 'Smith', email: 'john@test.com', telephone: '0400000000' }
    ]);

  if (error) console.error('Insert error:', error);
  else console.log('Inserted row:', data);
}

test();