import { clearData } from '../dataStore';
import { userRegister } from '../userRegister';
import { createOrder } from '../order';
import { SessionId } from '../interfaces';
import { InvalidInput, InvalidRequestPeriod, 
  UnauthorisedError } from '../throwError';
import { createOrderHandler } from '../handlers/createOrder';
import { APIGatewayProxyEvent } from 'aws-lambda';
import mockEvent from './mocks/createOrderMock.json';


beforeEach(() => {
  clearData();
});

function createUser() {
  const session = userRegister(
    'John',
    'Smith',
    'johnsmith@gmail.com',
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
  telephone: 123456789,
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

  test('Successfully create one order', () => {
    const { session } = createUser();
    const res = createOrder('AUD', session.session , userDetails,
      '123 Kingsford', reqDeliveryPeriod, items
    );
    expect(res).toEqual({
      orderId: expect.any(String)
    });
  });

  test('Testing Invalid input - Wrong Phone number', () => {
    const { session } = createUser();
    expect(() => {
      createOrder('AUD', session.session , 
        { 
          firstName: 'John', 
          lastName: 'Smith',
          telephone: 12345678,
          email: 'johnsmith@gmail.com' 
        },
        '123 Kingsford', reqDeliveryPeriod, items
      );
    }).toThrow(InvalidInput);
  });
	
  test('Testing Invalid input - Wrong Delivery Date', () => {
    const { session } = createUser();
    expect(() => {
      createOrder('AUD', session.session , userDetails,
        '123 Kingsford', 
        {
          startDateTime: Math.floor(Date.now() / 1000),
          endDateTime: Math.floor(Date.now()  / 1000), 
        }, items
      );
    }).toThrow(InvalidRequestPeriod);
  });

  test('Testing Invalid Session', () => {
    expect(() => {
      createOrder('AUD', 'abcd' , 
        { 
          firstName: 'John', 
          lastName: 'Smith',
          telephone: 12345678,
          email: 'johnsmith@gmail.com',},
        '123 Kingsford', reqDeliveryPeriod, items
      );
    }).toThrow(UnauthorisedError);
  });
});

//Lambda function for createOrder
describe('Lambda function for createOrder', () => {

  test('successfully creates an order', async () => {
    const { session } = createUser();

    const result = {
      // added mock to speed up test
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
    const { session } = createUser();

    const result = {
      headers: {
        session: session.session
      },
      body: JSON.stringify({
        currency: 'AUD',
        user: { name: 'John Smith',
          telephone: 12345678,
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
    const { session } = createUser();

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
        reqDeliveryPeriod: 
				{
				  startDateTime: Math.floor(Date.now() / 1000),
				  endDateTime: Math.floor(Date.now()  / 1000),
				},
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