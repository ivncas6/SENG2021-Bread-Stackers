import { createOrder } from '../order';
import { createOrderHandler } from '../handlers/createOrder';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import mockEvent from './mocks/createOrderMock.json';
import { InvalidPhone, InvalidRequestPeriod, UnauthorisedError } from '../throwError';

import * as userHelper from '../userHelper';
import * as dataStore from '../dataStore';
import * as generateUBL from '../generateUBL';

// mocks
jest.mock('../userHelper');
jest.mock('../dataStore');
jest.mock('../generateUBL');

const mockedUserHelper = userHelper as jest.Mocked<typeof userHelper>;
const mockedDataStore = dataStore as jest.Mocked<typeof dataStore>;
const mockedGenerateUBL = generateUBL as jest.Mocked<typeof generateUBL>;

// save test data
const reqDeliveryPeriod = {
  startDateTime: Math.floor(Date.now() / 1000),
  endDateTime: Math.floor((Date.now() + 72 * 3600 * 1000) / 1000),
};

const userDetails = {
  firstName: 'John',
  lastName: 'Smith',
  telephone: '0412345678',
  email: 'johnsmith@gmail.com',
};

const items = [
  { name: 'onion', description: 'a purple vegetable', unitPrice: 5, quantity: 15 },
  { name: 'tomato', description: 'A red fruit', unitPrice: 4, quantity: 100 },
];

const MOCK_SESSION = 'valid-session-123';

beforeEach(() => {
  jest.clearAllMocks();

  // default mocks
  mockedUserHelper.getUserIdFromSession.mockReturnValue(1);
  mockedDataStore.getUserByIdSupa.mockResolvedValue({ email: userDetails.email } as any);
  mockedDataStore.getOrgByUserId.mockResolvedValue({ data: { orgId: 10 }, error: null } as never);
  mockedDataStore.createOrderSupaPush.mockResolvedValue();
  mockedGenerateUBL.createOrderUBLXML.mockImplementation();
});

describe('Backend logic test for Creating an Order', () => {

  test('Successfully create one order', async () => {
    const res = await createOrder('AUD', MOCK_SESSION, userDetails, '123 Kingsford', reqDeliveryPeriod, items);
    
    expect(res).toEqual({ orderId: expect.any(String) });
    expect(mockedDataStore.createOrderSupaPush).toHaveBeenCalled();
  });

  test('Testing Invalid input - Wrong Phone number', async () => {
    await expect(
      createOrder('AUD', MOCK_SESSION, { ...userDetails, telephone: '246' }, '123 Kingsford', reqDeliveryPeriod, items)
    ).rejects.toThrow(InvalidPhone);
  });
  
  test('Testing Invalid input - Wrong Delivery Date', async () => {
    const badPeriod = {
      startDateTime: Math.floor(Date.now() / 1000),
      endDateTime: Math.floor(Date.now() / 1000), 
    };
    await expect(
      createOrder('AUD', MOCK_SESSION, userDetails, '123 Kingsford', badPeriod, items)
    ).rejects.toThrow(InvalidRequestPeriod);
  });

  test('Testing Invalid Session', async () => {
    mockedUserHelper.getUserIdFromSession.mockImplementation(() => {
      throw new UnauthorisedError('Invalid Session');
    });

    await expect(
      createOrder('AUD', 'abcd', userDetails, '123 Kingsford', reqDeliveryPeriod, items)
    ).rejects.toThrow(UnauthorisedError);
  });
});

describe('Lambda function for createOrder', () => {

  test('successfully creates an order', async () => {
    const event = {
      ...mockEvent,
      headers: { ...mockEvent.headers, session: MOCK_SESSION },
      body: JSON.stringify({
        currency: 'AUD', user: userDetails, reqDeliveryPeriod, deliveryAddress: '123 Kingsford', items
      })
    } as unknown as APIGatewayProxyEvent;

    const response: APIGatewayProxyResult = await createOrderHandler(event);

    expect(response.statusCode).toStrictEqual(200);
    expect(JSON.parse(response.body)).toStrictEqual({ orderId: expect.any(String) });
  });

  test('Invalid Input - Wrong Phone number', async () => {
    const event = {
      headers: { session: MOCK_SESSION },
      body: JSON.stringify({
        currency: 'AUD', 
        user: { ...userDetails, telephone: '12345' }, 
        deliveryAddress: '123 Kingsford', reqDeliveryPeriod, items
      })
    } as unknown as APIGatewayProxyEvent;

    const response: APIGatewayProxyResult = await createOrderHandler(event);

    expect(response.statusCode).toStrictEqual(400);
    expect(JSON.parse(response.body)).toHaveProperty('error');
  });

  test('Invalid Input - Wrong Delivery Date', async () => {
    const badPeriod = { startDateTime: 1000, endDateTime: 1000 };
    const event = {
      headers: { session: MOCK_SESSION },
      body: JSON.stringify({
        currency: 'AUD', user: userDetails, reqDeliveryPeriod: badPeriod, deliveryAddress: '123 Kingsford', items
      })
    } as unknown as APIGatewayProxyEvent;

    const response: APIGatewayProxyResult = await createOrderHandler(event);

    expect(response.statusCode).toStrictEqual(400);
    expect(JSON.parse(response.body)).toHaveProperty('error');
  });

  test('Testing Invalid Session', async () => {
    mockedUserHelper.getUserIdFromSession.mockImplementation(() => {
      throw new UnauthorisedError('Invalid Session');
    });

    const event = {
      headers: { session: 'bad-session' },
      body: JSON.stringify({
        currency: 'AUD', user: userDetails, deliveryAddress: '123 Kingsford', reqDeliveryPeriod, items
      })
    } as unknown as APIGatewayProxyEvent;

    const response: APIGatewayProxyResult = await createOrderHandler(event);

    expect(response.statusCode).toStrictEqual(401);
    expect(JSON.parse(response.body)).toHaveProperty('error');
  });
});