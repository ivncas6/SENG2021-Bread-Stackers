// PK = Primary Key, FK = Foreign Key

export interface Contact {
  contactId: number; // PK
  firstName: string;
  lastName: string;
  telephone: string;
  email: string;
  password?: string
}

export interface Address {
  addressID: number;
  street: string;
  city: string;
  postcode: string;
  country: string;
}

export interface Organisation {
  orgId: number; // PK
  orgName: string;
  addressId: number; // FK
  contactId:  number; // FK
}

export interface Order {
  orderId: string; // PK
  issuedDate: string;
  issuedTime: string;
  currency: string;
  status: string; 
  unitPrice?: number;
  buyerOrgID: number; // FK
  sellerOrgID: number; //FK
  taxExclusive: number;
  taxInclusive: number;
  finalPrice: number;
}

export interface Delivery {
  deliveryID: number; // PK
  orderID: string; // FK
  deliveryAddressID: number; // FK
  deliveryTerms: string;
  startDate: string;
  endDate: string;
}

export interface OrderLine {
  orderLineID: number; // PK
  orderID: string; // FK
  itemID: number; // FK
  quantity: number;
  status: string;
}

export interface Item {
  itemId: number; // PK
  name: string;
  price: number;
  description: string;
  buyerItemId?: number;
  sellerItemId?: number;
}

export interface ReqItem {
  name: string;
  description: string;
  unitPrice: number;
  quantity: number;
}

export interface ReqDeliveryPeriod {
  startDateTime: number;
  endDateTime: number;
}

export interface ReqUser {
  firstName: string;
  lastName: string
  telephone: string;
  email: string;
}

export interface OrderId {
  orderId: string;
}

export interface UserId {
    userId: number;
}

export type EmptyObject = Record<string, never>;

export interface ErrorObject {
  error: string;
  message: string;
}

export interface createOrderReturn {
  orderId: string, 
}

export interface SessionId {
    session: string,
}

