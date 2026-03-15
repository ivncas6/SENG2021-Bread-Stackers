import { Address, Contact, Delivery, Item, Order, 
  OrderLine, ReqDeliveryPeriod, ReqItem } from './interfaces';
import { supabase } from './supabase';

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

export async function persistOrderData(
  data: any, 
  order: Order, 
  deliveryAddress: string, 
  reqDeliveryPeriod: ReqDeliveryPeriod, 
  items: ReqItem[]
) {
  // Orders
  data.orders.push(order);

  // addresses
  const addressId = data.addresses.length + 1;
  data.addresses.push({
    addressID: addressId,
    street: deliveryAddress,
    city: 'N/A',
    postcode: 'N/A',
    country: 'AUS'
  });

  // Deliveries
  data.deliveries.push({
    deliveryID: data.deliveries.length + 1,
    orderID: order.orderId,
    deliveryAddressID: addressId,
    startDate: reqDeliveryPeriod.startDateTime.toString(),
    endDate: reqDeliveryPeriod.endDateTime.toString(),
    deliveryTerms: 'Standard'
  });

  // items
  items.forEach((item) => {
    const itemId = data.items.length + 1;
    data.items.push({
      itemId: itemId,
      name: item.name,
      price: item.unitPrice,
      description: item.description
    });

    data.orderLines.push({
      orderLineID: data.orderLines.length + 1,
      orderID: order.orderId,
      itemID: itemId,
      quantity: item.quantity,
      status: 'OPEN'
    });
  });
}

export async function persistOrderDataSupa(
  order: Order,
  deliveryAddress: String,
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
    }])

  // collect array of items
  const itemsToInsert = items.map(i => ({
    order_id: order.orderId,
    name: i.name,
    quantity: i.quantity,
    price: i.unitPrice
  }))

  // insert them items
  await supabase.from('order_items').insert(itemsToInsert);
}

export async function getOrderById(orderId: string) {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('orderId', orderId)
    .single();

  if (error) {
    console.error('Error querying data:', error.message);
    return null;
  }

  return data;
}