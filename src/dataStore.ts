import { Order, Users, Session} from './interfaces';
import { createClient } from '@supabase/supabase-js';


// link to supabase, make sure to put your keys in .env
const supabaseUrl = process.env.supabaseURL || '';
const supabaseKey = process.env.supabaseKey || '';

export const supabase = createClient(supabaseUrl, supabaseKey);

export interface Data {
    users: Users[];
    orders: Order[];
    sessions: Session[],
}

let data: Data = {
  users: [],
  orders: [],
  sessions: [],
};

export function clearData() {
  data = {
    users: [],
    orders: [],
    sessions: [],
  };
}

export const getData = () : Data => data;