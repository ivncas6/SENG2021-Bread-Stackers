import { clearData } from '../dataStore';
import { userRegister } from '../userRegister';
import { createOrder } from '../order';
import { SessionId } from '../interfaces';
import { InvalidPhone, InvalidRequestPeriod, 
  UnauthorisedError } from '../throwError';
import { createOrderHandler } from '../handlers/createOrder';
import { APIGatewayProxyEvent } from 'aws-lambda';
import mockEvent from './mocks/createOrderMock.json';

beforeEach(async () => {
  // Clean actual database/datastore
  await clearData();
});

async function createUser() {
  const session = await userRegister(
    'John',
    'Smith',
    'johnsmith@gmail.com',
    '0412345678',
    'password123',
  ) as SessionId;

  return { session };
}

const reqDeliveryPeriod = {
  startDateTime: Math.floor(Date.now() / 1000),
  endDateTime: Math.floor((Date.now() + 72 * 3600 * 1000) / 1000), // three days from startDate
};

const userDetails = {
  firstName: 'John',
  lastName: 'Smith',
  telephone: '0412345678',
  email: 'johnsmith@gmail.com',
};

const items = [
  {
    name: 'onion',
    description: 'a purple vegetable',
    unitPrice: 5,
    quantity: 15,
  },
  {
    name: 'tomato',
    description: 'A red fruit',
    unitPrice: 4,
    quantity: 100,
  },
];

describe('Backend logic test for Creating an Order', () => {

  test('Successfully create one order', async () => {
    const { session } = await createUser();

    const res = await createOrder('AUD', session.session , userDetails,
      '123 Kingsford', reqDeliveryPeriod, items
    );
    expect(res).toEqual({
      orderId: expect.any(String)
    });
  });

  test('Testing Invalid input - Wrong Phone number', async () => {
    const { session } = await createUser();
    await expect(
      createOrder('AUD', session.session, 
        { ...userDetails, telephone: '246' },
        '123 Kingsford', reqDeliveryPeriod, items
      )).rejects.toThrow(InvalidPhone);
  });
  
  test('Testing Invalid input - Wrong Delivery Date', async () => {
    const { session } = await createUser();
    await expect(
      createOrder('AUD', session.session , userDetails,
        '123 Kingsford', 
        {
          startDateTime: Math.floor(Date.now() / 1000),
          endDateTime: Math.floor(Date.now()  / 1000), 
        }, items
      )).rejects.toThrow(InvalidRequestPeriod);
  });

  test('Testing Invalid Session', async () => {
    await expect(
      createOrder('AUD', 'abcd' , userDetails, '123 Kingsford', 
        reqDeliveryPeriod, items)).rejects.toThrow(UnauthorisedError);
  });
});

//Lambda function for createOrder
describe('Lambda function for createOrder', () => {

  test('successfully creates an order', async () => {
    const { session } = await createUser();

    const result = {
      ...mockEvent,
      headers: {
        ...mockEvent.headers,
        session: session.session
      },
      body: JSON.stringify({
        currency: 'AUD',
        user: userDetails,
        reqDeliveryPeriod: reqDeliveryPeriod,
        deliveryAddress: '123 Kingsford',
        items: items
      })
    } as unknown as APIGatewayProxyEvent;

    const response = await createOrderHandler(result);

    expect(response.statusCode).toStrictEqual(200);
    expect(JSON.parse(response.body)).toStrictEqual({
      orderId: expect.any(String)
    });
  });

  test('Invalid Input - Wrong Phone number', async () => {
    const { session } = await createUser();

    const result = {
      headers: {
        session: session.session
      },
      body: JSON.stringify({
        currency: 'AUD',
        user: { 
          firstName: 'John',
          lastName: 'Smith',
          telephone: '12345',
          email: 'johnsmith@gmail.com' 
        },
        deliveryAddress: '123 Kingsford',
        reqDeliveryPeriod: reqDeliveryPeriod,
        items: items
      })
    } as unknown as APIGatewayProxyEvent;

    const response = await createOrderHandler(result);

    expect(response.statusCode).toStrictEqual(400);
    expect(JSON.parse(response.body)).toStrictEqual({
      error: expect.any(String)
    });
  });

  test('Invalid Input - Wrong Delivery Date', async () => {
    const { session } = await createUser();

    const result = {
      ...mockEvent,
      headers: {
        ...mockEvent.headers,
        session: session.session
      },
      body: JSON.stringify({
        currency: 'AUD',
        user: userDetails,
        reqDeliveryPeriod: 
        {
          startDateTime: Math.floor(Date.now() / 1000),
          endDateTime: Math.floor(Date.now()  / 1000),
        },
        deliveryAddress: '123 Kingsford',
        items: items
      })
    } as unknown as APIGatewayProxyEvent;

    const response = await createOrderHandler(result);

    expect(response.statusCode).toStrictEqual(400);
    expect(JSON.parse(response.body)).toStrictEqual({
      error: expect.any(String)
    });
  });

  test('Testing Invalid Session', async () => {
    const result = {
      headers: {
        session: '2345'
      },
      body: JSON.stringify({
        currency: 'AUD',
        user: userDetails,
        deliveryAddress: '123 Kingsford',
        reqDeliveryPeriod: reqDeliveryPeriod,
        items: items
      })
    } as unknown as APIGatewayProxyEvent;

    const response = await createOrderHandler(result);

    expect(response.statusCode).toStrictEqual(401);
    expect(JSON.parse(response.body)).toStrictEqual({
      error: expect.any(String)
    });
  });
});