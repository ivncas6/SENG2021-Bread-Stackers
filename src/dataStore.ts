import { Address, Contact, Delivery, Item, Order, OrderLine } from './interfaces';
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
    addresses: Address[];
    items: Item[];
}

let data: Data = {
  users: [],
  orders: [],
  deliveries: [],
  orderLines: [],
  addresses: [],
  items: [],
};

export function clearData() {
  data = {
    users: [],
    orders: [],
    deliveries: [],
    orderLines: [],
    addresses: [],
    items: [],
  };
}

export const getData = () : Data => data;