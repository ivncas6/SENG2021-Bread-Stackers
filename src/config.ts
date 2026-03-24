import 'dotenv/config';

const JWTsecretKey = process.env.JWT_SECRET;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!JWTsecretKey) throw new Error('Missing JWT_SECRET');
if (!supabaseUrl) throw new Error('Missing SUPABASE_URL');
if (!supabaseKey) throw new Error('Missing SUPABASE_KEY');

export { JWTsecretKey, supabaseUrl, supabaseKey };