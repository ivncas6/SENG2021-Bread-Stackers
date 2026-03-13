import { Order, Users, Session} from './interfaces';

export interface Data {
    users: Users[];
    orders: Order[];
    sessions: Session[],
}

let data: Data = {
  users: [],
  orders: [],
  sessions: [],
};

export function clearData() {
  data = {
    users: [],
    orders: [],
    sessions: [],
  };
}

export const getData = () : Data => data;