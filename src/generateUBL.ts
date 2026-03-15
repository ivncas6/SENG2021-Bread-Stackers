import { Order, ReqItem, ReqUser } from './interfaces';

function generateItemXML(items: ReqItem[]): string {
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

export function createOrderUBLXML(order: Order, items: ReqItem[], user: ReqUser, deliveryAddress: string): string {
  const itemList = generateItemXML(items);

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
                <cbc:Name>${user.name}</cbc:Name>
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
        <cbc:TaxAmount currencyID="${order.currency}">${order.taxInclusive - order.taxExclusive}</cbc:TaxAmount>
    </cac:TaxTotal>

    <cac:AnticipatedMonetaryTotal>
        <cbc:LineExtensionAmount currencyID="${order.currency}">${order.taxExclusive}</cbc:LineExtensionAmount>
        <cbc:TaxInclusiveAmount currencyID="${order.currency}">${order.taxInclusive}</cbc:TaxInclusiveAmount>
        <cbc:PayableAmount currencyID="${order.currency}">${order.finalPrice}</cbc:PayableAmount>
    </cac:AnticipatedMonetaryTotal>

    ${itemList}
</Order>`;
}