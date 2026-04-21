import { isUUID } from 'validator';
import { Address, Contact, Delivery, Item, Order, OrgRole,
  OrderLine, ReqDeliveryPeriod, ReqItem, 
} from './interfaces';
import { UBLBucket, generateUBLOrderFilePath } from './generateUBL';
import { supabase } from './supabase';
import { InvalidSupabase } from './throwError';

// local memory

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

// orders

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

/* V2 version: uses an existing addressId instead of  inserting new address row.
callers can manage addresses independently from /v2/address endpoints
and reference them when placing orders. */
export async function createOrderSupaPushV2(
  order: Order,
  deliveryAddressId: number,
  reqDeliveryPeriod: ReqDeliveryPeriod,
  items: ReqItem[]
) {
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

  await supabase
    .from('deliveries').insert([{
      orderID: order.orderId,
      deliveryAddressID: deliveryAddressId,
      startDate: reqDeliveryPeriod.startDateTime.toString(),
      endDate: reqDeliveryPeriod.endDateTime.toString()
    }]);

  for (const i of items) {
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

  if (orderRes.error) throw orderRes.error;
  if (deliveryRes.error) throw deliveryRes.error;

  const addressId = deliveryRes.data?.deliveryAddressID;
  
  if (addressId) {
    const { error: addressError } = await supabase
      .from('addresses')
      .update({ street: deliveryAddress })
      .eq('addressID', addressId);
      
    if (addressError) throw addressError;
  }
}

/**
 * V2 variant: updates the delivery's addressId reference (swaps which address
 * the delivery points at) rather than mutating the address row itself.
 * This keeps address records reusable and independently managed.
 */
export async function updateOrderSupaV2(
  orderId: string,
  deliveryAddressId: number,
  reqDeliveryPeriod: ReqDeliveryPeriod,
  status: string
) {
  const [orderRes, deliveryRes] = await Promise.all([
    supabase
      .from('orders')
      .update({ status })
      .eq('orderId', orderId),

    supabase
      .from('deliveries')
      .update({
        deliveryAddressID: deliveryAddressId,
        startDate: reqDeliveryPeriod.startDateTime.toString(),
        endDate: reqDeliveryPeriod.endDateTime.toString()
      })
      .eq('orderID', orderId)
  ]);

  if (orderRes.error) throw orderRes.error;
  if (deliveryRes.error) throw deliveryRes.error;
}

export async function deleteOrderSupa(orderId: string) {
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

// users & contacts

export async function getUserByIdSupa(userId: number) {
  const { data } = await supabase
    .from('contacts')
    .select('*')
    .eq('contactId', userId)
    .maybeSingle();
  return data;
}

// organisations

/**
 * V0 compatibility: find the org that a user OWNS (organisations.contactId).
 * Members added via organisation_members are NOT found here.
 * Use getUserRoleInOrg for the full membership check.
 */
export async function getOrgByUserId(userId: number) {
  return await supabase
    .from('organisations')
    .select('orgId')
    .eq('contactId', userId)
    .single();
}

/**
 * Returns the calling user's role in the given org, or null if they are not
 * a member. Checks both the owner column (organisations.contactId = OWNER)
 * and the organisation_members table (ADMIN / MEMBER).
 */
export async function getUserRoleInOrg(
  userId: number,
  orgId: number
): Promise<OrgRole | null> {
  // First check if the org exists and if the user is the owner
  const { data: orgData } = await supabase
    .from('organisations')
    .select('contactId')
    .eq('orgId', orgId)
    .maybeSingle();

  if (!orgData) return null; // org does not exist

  if (orgData.contactId === userId) return 'OWNER';

  // Otherwise look in organisation_members
  const { data: memberData } = await supabase
    .from('organisation_members')
    .select('role')
    .eq('orgId', orgId)
    .eq('contactId', userId)
    .maybeSingle();

  if (!memberData) return null;
  return memberData.role as OrgRole;
}

/*Create an organisation and automatically add the creator as OWNER in 
organisation_members. Called during user registration.*/
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

  // mirror the owner in organisation_members so role-based checks work
  await supabase
    .from('organisation_members')
    .insert([{ orgId: data.orgId, contactId: contactId, role: 'OWNER' }]);

  return data;
}