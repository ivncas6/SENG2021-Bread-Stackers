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

export async function persistOrderDataSupa(order: Order) {
  const { data, error } = await supabase
    .from('orders').insert([
      {
        orderId: order.orderId, 
        currency: order.currency, 
        finalPrice: order.finalPrice,
        status: 'OPEN'
      }
    ]);
  if (error) {
    console.error('Error pushing data:', error.message);
    throw error;
  }
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