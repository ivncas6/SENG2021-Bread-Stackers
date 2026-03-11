import { Order, Users } from './interfaces';

export interface Data {
    users: Users[];
    orders: Order[];
}

const data: Data = {
    users: [],
    orders: []
};

export const getData = () : Data => data;