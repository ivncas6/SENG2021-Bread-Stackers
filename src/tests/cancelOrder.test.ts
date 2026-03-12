import { cancelOrder, createOrder } from '../order';
import { userRegister } from '../userRegister';
import { getData } from '../dataStore';
import { createOrderReturn, SessionId } from '../interfaces';

// add something like this later
// beforeEach(() => {
//   clear();
// });

test('cancel a single order', () => {
  const session = userRegister('John', 'Smith', 'johnsmith@gmail.com', 'password123') as SessionId;
  const delPeriod = {
    startDateTime: 123,
    endDateTime: 456,
  };
  const items = [
    {
      name: 'cabbage',
      description: 'A leafy vegetable',
      unitPrice: 12,
      quantity: 50
    },
    {
      name: 'tomato',
      description: 'A red fruit',
      unitPrice: 6,
      quantity: 100
    }
  ];
  const userDetails = {
    name: 'John Smith',
    telephone: 123456789,
    email: 'johnsmith@gmail.com',
  };

  const order = createOrder('AUD', session.session, userDetails, 
    '308 Negra Arroyo Lane', delPeriod, items) as createOrderReturn;

  const res = cancelOrder(order.orderId, 'reason here');
  expect(res).toStrictEqual({ reason: 'reason here' });

  const data = getData();
  const userFind = data.orders.find(ord => ord.orderId === order.orderId);
  expect(userFind).toBeUndefined();
});

