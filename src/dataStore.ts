import { Order, Users } from './interfaces';

export interface Data {
    users: Users[];
    orders: Order[];
}

let data: Data = {
    users: [],
    orders: []
};

export const getData = () : Data => data;