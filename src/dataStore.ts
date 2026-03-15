import { Address, Contact, Delivery, Item, Order, 
  OrderLine, ReqDeliveryPeriod, ReqItem } from './interfaces';
import { supabase } from './supabase';

// local for testing

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

export async function clearData() {
  // DO NOT CHANGE ORDER YOU GUYS

  // order Details
  await supabase.from('order_lines').delete().neq('orderLineID', 0);
  await supabase.from('deliveries').delete().neq('deliveryID', 0);

  // delete Orders
  await supabase.from('orders').delete().neq('status', 'RESET_WIPE');

  // delete Orgs (they point to contacts and addresses)
  await supabase.from('organisations').delete().neq('orgId', 0);

  // delete 'core' tables last
  await supabase.from('contacts').delete().neq('email', '');
  await supabase.from('addresses').delete().neq('addressID', 0);
  await supabase.from('items').delete().neq('itemId', 0);
}

export const getData = () : Data => data;

// supaBase stuff

export async function createOrderSupaPush(
  order: Order,
  deliveryAddress: string,
  reqDeliveryPeriod: ReqDeliveryPeriod,
  items: ReqItem[]
) {
  // first insert an address
  const { data: addressData, error: addressErr } = await supabase
    .from('addresses')
    .insert([{ street: deliveryAddress, country: 'AUS' }])
    .select().single();

  if (addressErr) throw addressErr;

  // insert order
  const { error: orderError } = await supabase
    .from('orders').insert([{
      orderId: order.orderId,
      currency: order.currency, 
      finalPrice: order.finalPrice,
      buyer_id: order.buyerOrgID,
      status: 'OPEN'
    }]);
  
  if (orderError) throw orderError;

  // insert delivery details
  await supabase
    .from('deliveries').insert([{
      order_id: order.orderId,
      address_id: addressData.addressID,
      start_date: reqDeliveryPeriod.startDateTime,
      end_Date: reqDeliveryPeriod.endDateTime
    }]);

  // collect array of items
  const itemsToInsert = items.map(i => ({
    order_id: order.orderId,
    name: i.name,
    quantity: i.quantity,
    price: i.unitPrice
  }));

  // insert them items
  await supabase.from('order_items').insert(itemsToInsert);
}

export async function getOrderByIdSupa(orderId: string) {
  const { data, error } = await supabase
    .from('orders')
    .select(`
      *,
      deliveries (
        *,
        addresses ( * )
      ),
      order_items ( * ),
      users:buyer_id ( * )
    `)
    .eq('orderId', orderId)
    .single();

  if (error) throw error;
  return data;
}

export async function getUserByIdSupa(userId: number) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('contactId', userId)
    .maybeSingle();
  return data;
}

export async function updateOrderStatus(orderId: string, newStatus: string) {
  const { data, error } = await supabase
    .from('orders')
    .update({ status: newStatus })
    .eq('orderId', orderId);

  if (error) throw error;
  return data;
}

export async function updateOrderSupa(
  orderId: string,
  deliveryAddress: string,
  reqDeliveryPeriod: ReqDeliveryPeriod,
  status: string 
) {
  await supabase
    .from('orders')
    .update({ status: status })
    .eq('orderId', orderId);

  const { data: delivery } = await supabase
    .from('deliveries')
    .update({
      start_date: reqDeliveryPeriod.startDateTime,
      end_date: reqDeliveryPeriod.endDateTime
    })
    .eq('order_id', orderId)
    .select('address_id')
    .maybeSingle();

  if (delivery?.address_id) {
    await supabase.from('addresses')
      .update({ street: deliveryAddress })
      .eq('addressID', delivery.address_id);
  }
}

export async function deleteOrderSupa(orderId: string) {
  const { error } = await supabase
    .from('orders')
    .delete()
    .eq('orderId', orderId);

  if (error) {
    console.error('Database Delete Error:', error.message);
    throw error;
  }
}