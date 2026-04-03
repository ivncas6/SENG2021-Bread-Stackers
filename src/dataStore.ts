import { isUUID } from 'validator';
import { Address, Contact, Delivery, generateUBLOrderFilePath, Item, Order, 
  OrderLine, ReqDeliveryPeriod, ReqItem, 
  UBLBucket} from './interfaces';
import { supabase } from './supabase';
import { InvalidSupabase } from './throwError';

// local for testing

export interface Data {
    users: Contact[];
    orders: Order[];
    deliveries: Delivery[];
    orderLines: OrderLine[];
    addresses: Address[];
    items: Item[];
}

const data: Data = {
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
      taxExclusive: order.taxExclusive,
      taxInclusive: order.taxInclusive,
      buyerOrgID: order.buyerOrgID,
      status: 'OPEN',
      issuedDate: order.issuedDate,
      issuedTime: order.issuedTime
    }]);
  
  if (orderError) {
    console.error('Supabase Order Insert Error:', orderError.message);
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

export async function getOrderByIdSupa(orderId: string): Promise<Order | null> {
  if (!isUUID(orderId)) {
    return null; 
  }

  const { data, error } = await supabase
    .from('orders')
    .select(`
      *,
      deliveries (
        *,
        addresses ( * )
      ),
      order_lines ( 
        *, 
        items ( * ) 
      ),
      organisations!buyerOrgID ( 
        *,
        contacts ( * )
      )
    `)
    .eq('orderId', orderId)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    console.error('Fetch Order Error:', error.message);
    throw error;
  }
  
  return data;
}

export async function getUserByIdSupa(userId: number) {
  const { data } = await supabase
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

  if (error) throw new InvalidSupabase(error.message);
  return data;
}

export async function updateOrderSupa(
  orderId: string,
  deliveryAddress: string,
  reqDeliveryPeriod: ReqDeliveryPeriod,
  status: string 
) {
  // promise all uses concurrency so run simult + fast
  const [orderRes, deliveryRes] = await Promise.all([
    supabase
      .from('orders')
      .update({ status: status })
      .eq('orderId', orderId),
      
    supabase
      .from('deliveries')
      .update({
        startDate: reqDeliveryPeriod.startDateTime.toString(),
        endDate: reqDeliveryPeriod.endDateTime.toString()
      })
      .eq('orderID', orderId)
      .select('deliveryAddressID')
      .single()
  ]);

  // throw
  if (orderRes.error) throw orderRes.error;
  if (deliveryRes.error) throw deliveryRes.error;

  // update addr 
  const addressId = deliveryRes.data?.deliveryAddressID;
  
  if (addressId) {
    const { error: addressError } = await supabase
      .from('addresses')
      .update({ street: deliveryAddress })
      .eq('addressID', addressId);
      
    if (addressError) throw addressError;
  }
}

export async function deleteOrderSupa(orderId: string) {
  // delete UBLs
  const filePath = await generateUBLOrderFilePath(orderId);
  const deleteUBL = await supabase
    .storage
    .from(UBLBucket)
    .remove([filePath]);
  
  if (deleteUBL.error) throw deleteUBL.error;

  const { error } = await supabase
    .from('orders')
    .delete()
    .eq('orderId', orderId);

  if (error) {
    console.error('Database Delete Error:', error.message);
    throw error;
  }
}

export async function getOrgByUserId(userId: number) {
  return await supabase
    .from('organisations')
    .select('orgId')
    .eq('contactId', userId)
    .single();
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

  if (error) throw new InvalidSupabase(`Org Creation Failed: ${error.message}`);
  return data;
}