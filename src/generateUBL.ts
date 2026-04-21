import { getOrderByIdSupa, getOrgByUserId, getUserByIdSupa } from './dataStore';
import { OrderLineWithItem, ReqItem } from './interfaces';
import { getUserIdFromSession } from './userHelper';
import { InvalidOrderId, InvalidSupabase, UnauthorisedError } from './throwError';
import { supabase } from './supabase';

export const UBLBucket = 'UBL Order Documents';

export async function generateUBLOrderFilePath(orderId: string): Promise<string> {
  return `UBLOrders/${orderId}`;
}

async function generateItemXML(items: ReqItem[]): Promise<string> {
  return items.map(i => `
    <cac:LineItem>
        <cbc:Quantity>${i.quantity}</cbc:Quantity>
        <cac:Item>
            <cbc:Name>${i.name}</cbc:Name>
            <cbc:Description>${i.description}</cbc:Description>
        </cac:Item>
        <cac:Price>
            <cbc:PriceAmount currencyID="AUD">${i.unitPrice}</cbc:PriceAmount>
        </cac:Price>
    </cac:LineItem>`).join('');
}

// keep for backwards compatability in v0

export async function getOrderUBLXML(orderId: string,
  session: string): Promise<string> {

  const userId = await getUserIdFromSession(session);
  const { data: orgData } = await getOrgByUserId(userId);
  if (!orgData) {
    throw new UnauthorisedError('User has no associated organization');
  }

  const order = await getOrderByIdSupa(orderId);
  if (!order) {
    throw new InvalidOrderId(
      'Provided orderId doesnot correspond to any existing order',
    );
  }

  if (order.buyerOrgID !== orgData.orgId) {
    throw new UnauthorisedError('You do not have permission to cancel this order');
  }
    
  const filePath = await generateUBLOrderFilePath(orderId);
  const { data, error } = await supabase
    .storage
    .from(UBLBucket)
    .createSignedUrl(filePath, 60);

  if (error) throw new InvalidSupabase(error.message);

  if (!data) {
    throw new InvalidSupabase('supabase failed to fetch UBL order document');
  }

  return data.signedUrl;
}

export async function createOrderUBLXML(orderId: string,
  session: string): Promise<null> {

  const userId = await getUserIdFromSession(session);
  const { data: orgData } = await getOrgByUserId(userId);
  if (!orgData) {
    throw new UnauthorisedError('User has no associated organization');
  }
  const user = await getUserByIdSupa(userId);

  const order = await getOrderByIdSupa(orderId);
  if (!order) {
    throw new InvalidOrderId(
      'Provided orderId doesnot correspond to any existing order',
    );
  }

  if (order.buyerOrgID !== orgData.orgId) {
    throw new UnauthorisedError('You do not have permission to cancel this order');
  }

  const items = (order.order_lines || []).map((line: OrderLineWithItem) => ({
    name: line.items?.name || 'Unknown',
    description: line.items?.description || '',
    unitPrice: Number(line.items?.price || 0),
    quantity: line.quantity
  }));

  const itemList = await generateItemXML(items);
  const delivery = order.deliveries?.[0];
  const deliveryAddress = delivery?.addresses?.street;

  const doc = buildUBLDocument(order, user, deliveryAddress, itemList);

  const filePath = await generateUBLOrderFilePath(orderId);
  const { error } = await supabase
    .storage
    .from(UBLBucket)
    .upload(filePath, doc, {
      cacheControl: '3600',
      upsert: true,
      contentType: 'application/xml'
    });

  if (error) throw new InvalidSupabase(error.message);
  return null;
}

// v2 helpers, make sure permissions is checked by function caller

// generate and upload the UBL XML for an order.
export async function uploadUBLForOrder(
  orderId: string,
  userId: number
): Promise<null> {
  const user = await getUserByIdSupa(userId);
  const order = await getOrderByIdSupa(orderId);

  if (!order) {
    throw new InvalidOrderId('Order not found for UBL generation');
  }

  const items = (order.order_lines || []).map((line: OrderLineWithItem) => ({
    name: line.items?.name || 'Unknown',
    description: line.items?.description || '',
    unitPrice: Number(line.items?.price || 0),
    quantity: line.quantity
  }));

  const itemList = await generateItemXML(items);
  const delivery = order.deliveries?.[0];
  const deliveryAddress = delivery?.addresses?.street;

  const doc = buildUBLDocument(order, user, deliveryAddress, itemList);

  const filePath = await generateUBLOrderFilePath(orderId);
  const { error } = await supabase
    .storage
    .from(UBLBucket)
    .upload(filePath, doc, {
      cacheControl: '3600',
      upsert: true,
      contentType: 'application/xml'
    });

  if (error) throw new InvalidSupabase(error.message);
  return null;
}

// return a signed download URL for an order's UBL document.
export async function getSignedUBLUrl(orderId: string): Promise<string> {
  const filePath = await generateUBLOrderFilePath(orderId);
  const { data, error } = await supabase
    .storage
    .from(UBLBucket)
    .createSignedUrl(filePath, 60);

  if (error) throw new InvalidSupabase(error.message);
  if (!data) throw new InvalidSupabase('supabase failed to fetch UBL order document');
  return data.signedUrl;
}

// Shared XML builder (private)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildUBLDocument(order: any, user: any, deliveryAddress: string, itemList: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
    <Order xmlns="urn:oasis:names:specification:ubl:schema:xsd:Order-2"
        xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
        xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
        <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
        <cbc:ID>${order.orderId}</cbc:ID>
        <cbc:IssueDate>${order.issuedDate}</cbc:IssueDate>
        <cbc:IssueTime>${order.issuedTime}</cbc:IssueTime>
        <cbc:DocumentCurrencyCode>${order.currency}</cbc:DocumentCurrencyCode>
        
        <cac:BuyerCustomerParty>
            <cac:Party>
                <cac:Contact>
                    <cbc:Name>${user.firstName} ${user.lastName}</cbc:Name>
                    <cbc:Telephone>${user.telephone}</cbc:Telephone>
                    <cbc:ElectronicMail>${user.email}</cbc:ElectronicMail>
                </cac:Contact>
            </cac:Party>
        </cac:BuyerCustomerParty>

        <cac:Delivery>
            <cac:DeliveryLocation>
                <cac:Address>
                    <cbc:StreetName>${deliveryAddress}</cbc:StreetName>
                </cac:Address>
            </cac:DeliveryLocation>
        </cac:Delivery>

        <cac:TaxTotal>
            <cbc:TaxAmount currencyID="${order.currency}">
                ${order.taxInclusive - order.taxExclusive}
            </cbc:TaxAmount>
        </cac:TaxTotal>

        <cac:AnticipatedMonetaryTotal>
            <cbc:LineExtensionAmount currencyID="${order.currency}">
                ${order.taxExclusive}
            </cbc:LineExtensionAmount>
            <cbc:TaxInclusiveAmount currencyID="${order.currency}">
                ${order.taxInclusive}
            </cbc:TaxInclusiveAmount>
            <cbc:PayableAmount currencyID="${order.currency}">
                ${order.finalPrice}
            </cbc:PayableAmount>
        </cac:AnticipatedMonetaryTotal>

        ${itemList}
    </Order>`;
}