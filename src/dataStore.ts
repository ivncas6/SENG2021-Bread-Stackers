import { Contact, Delivery, Order, OrderLine } from './interfaces';
import { createClient } from '@supabase/supabase-js';


// link to supabase, make sure to put your keys in .env
// const supabaseUrl = process.env.supabaseURL || '';
// const supabaseKey = process.env.supabaseKey || '';

// export const supabase = createClient(supabaseUrl, supabaseKey);

export interface Data {
    users: Contact[];
    orders: Order[];
    deliveries: Delivery[];
    orderLines: OrderLine[];
}

let data: Data = {
  users: [],
  orders: [],
  deliveries: [],
  orderLines: [],
};

export function clearData() {
  data = {
    users: [],
    orders: [],
    deliveries: [],
    orderLines: [],
  };
}

export const getData = () : Data => data;