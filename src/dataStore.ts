import { Order, Users, Session} from './interfaces';

export interface Data {
    users: Users[];
    orders: Order[];
    sessions: Session[],
}

const data: Data = {
    users: [],
    orders: [],
    sessions: [],
};

export const getData = () : Data => data;
