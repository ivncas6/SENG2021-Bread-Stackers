import { Order } from './interfaces';

export function createOrderUBLXML(order: Order): string {
  let itemList = '';
    
  // ubl xml format for each item as item is an array of obeject
  for (const i of order.items) {
    itemList += `
                <cac:Item>
                    <cbc:name> ${i.name} </cbc:name>
                    <cbc:description> ${i.description} </cbc:description>
                    <cbc:unitPrice> ${i.unitPrice} </cbc:unitPrice>
                    <cbc:quantity> ${i.quantity} </cbc:quantity>
                </cac:Item>
        `;
  }

  // hard-coded ubl xml document format, that will produce the document for each order created
  const xmlDocument = ` <?xml version="1.0" encoding="UTF-8"?>
   <Order xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:
   CommonBasicComponents-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:
   CommonAggregateComponents-2" xmlns="urn:oasis:names:specification:ubl:schema:xsd:Order-2">
   <cbc:UBLVersionID>2.0</cbc:UBLVersionID>
   <cbc:OrderID> ${order.orderId} </cbc:OrderID>
   <cbc:OrderIssueDate> ${order.orderDate} </cbc:OrderIssueDate>
   <cac:User>
    <cbc:name> ${order.user.name} </cbc:name>
    <cbc:telephone> ${order.user.telephone} </cbc:telephone>
    <cbc:email> ${order.user.email} </cbc:email>
   </cac:User>
   <cac:Delivery>
    <cac:DeliveryAddress>
        <cbc:AddressLine> ${order.deliveryAddress} </cbc:AddressLine>
    </cac:DeliveryAddress>
    <cac:RequestedDeliveryPeriod>
        <cbc:startDateTime> ${order.reqDeliveryPeriod.startDateTime} </cbc:startDateTime>
        <cbc:endDateTime> ${order.reqDeliveryPeriod.endDateTime} </cbc:endDateTime>
    </cac:RequestedDeliveryPeriod>
   </cac:Delivery>
   <cac:Price>
    <cbc:Currency> ${order.currency} </cbc:Currency>
    <cbc:TotalAmount> ${order.totalAmount} </cbc:TotalAmount>
   </cac:Price>
   <cac:OrderLine>
    <cac:LineItem>
        ${itemList}
    </cac:LineItem>
    </cac:OrderLine> 
   `;
  return xmlDocument;
}