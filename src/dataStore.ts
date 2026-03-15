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
  // insert address
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
      buyerOrgID: order.buyerOrgID,
      status: 'OPEN'
    }]);
  
  if (orderError) {
    console.error("Supabase Order Insert Error:", orderError.message);
    throw new Error(`Order Table Error: ${orderError.message}`);
  }

  // insert delivery
  await supabase
    .from('deliveries').insert([{
      orderID: order.orderId,
      deliveryAddressID: addressData.addressID,
      startDate: reqDeliveryPeriod.startDateTime.toString(),
      endDate: reqDeliveryPeriod.endDateTime.toString()
    }]);


  for (const i of items) {
    // create the item to get an itemId
    const { data: itemData } = await supabase.from('items').insert([{
        name: i.name,
        price: i.unitPrice,
        description: i.description
    }]).select().single();

    if (itemData) {
        await supabase.from('order_lines').insert([{
            orderID: order.orderId,
            itemID: itemData.itemId,
            quantity: i.quantity,
            status: 'OPEN'
        }]);
    }
  }
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
    .from('contacts')
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

export async function createOrganisationSupa(contactId: number, ownerName: string) {
  const { data, error } = await supabase
    .from('organisations')
    .insert([{ 
      orgName: `${ownerName}'s Shop`,
      contactId: contactId
    }])
    .select()
    .single();

  if (error) throw new Error(`Org Creation Failed: ${error.message}`);
  return data;
}