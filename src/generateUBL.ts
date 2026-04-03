import { Session } from 'node:inspector';
import { getOrderByIdSupa, getUserByIdSupa } from './dataStore';
import { Order, OrderLineWithItem, ReqItem, ReqUser, SessionId } from './interfaces';
import { getUserIdFromSession } from './userHelper';
import { InvalidOrderId } from './throwError';

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

export async function createOrderUBLXML(orderId: string,
  session: string): Promise<string> {

  const order = await getOrderByIdSupa(orderId);
  
  // if order doesn't exist
  if (!order) {
    throw new InvalidOrderId(
      'Provided orderId doesnot correspond to any existing order',
    );
  }

  const items = (order.order_lines || []).map((line: OrderLineWithItem) => ({
    name: line.items?.name || 'Unknown',
    description: line.items?.description || '',
    unitPrice: Number(line.items?.price || 0),
    quantity: line.quantity
  }))

  const itemList = await generateItemXML(items);

  const delivery = order.deliveries?.[0];
  const deliveryAddress = delivery?.addresses;
  
  await generateItemXML(items);
  const userId = await getUserIdFromSession(session);
  const user = await getUserByIdSupa(userId as number);

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