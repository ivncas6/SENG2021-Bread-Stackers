export interface Session {
    session: string,
    userId: number
}

export interface UserInfo {
    userId: number;
    name: string;
    email: string;
}

export interface Users extends UserInfo {
  nameFirst: string;
  nameLast: string;
  password: string;
}

export interface Order {
    orderId?: string;
    currency: string;
    totalAmount: number;
    userId: number;
    user: User;
    deliveryAddress: string;
    reqDeliveryPeriod: ReqDeliveryPeriod;
    items: Item[];
}


export interface OrderInfo {
    orderId: string;
    status: string;
    orderDateTime: number;
    currency: string;
    deliveryAddress: string;
    userDetails: User;
    reqDeliveryPeriod: ReqDeliveryPeriod;
    items: Item[];
}

export interface User {
    name: string,
    telephone: number;
    email: string;
}

export interface ReqDeliveryPeriod {
    startDateTime: number;
    endDateTime: number;
}

export interface Item {
    name: string;
    description: string;
    unitPrice: number;
    quantity: number;
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

