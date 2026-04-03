import { createOrderUBLXML } from '../generateUBL';
import { generateUBLHandler } from '../handlers/generateUBL';
import * as dataStore from '../dataStore';
import * as userHelper from '../userHelper';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { UnauthorisedError } from '../throwError';

jest.mock('../dataStore');
jest.mock('../userHelper');

const mockedUserHelper = userHelper as jest.Mocked<typeof userHelper>;
const mockedDataStore = dataStore as jest.Mocked<typeof dataStore>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('UBL Backend Functions', () => {
  test('successfully creates a UBL', async () => {
    mockedUserHelper.getUserIdFromSession.mockReturnValue(1);
    mockedDataStore.getOrderByIdSupa.mockResolvedValue({ orderId: 'valid-id' } as never);
    
    // assumes generateUBL returns a file path or URL
    const result = await createOrderUBLXML('valid-id', 'valid-session');
    expect(result).toStrictEqual(expect.any(String)); 
  });

  test('throws UnauthorisedError for invalid session', async () => {
    mockedUserHelper.getUserIdFromSession.mockImplementation(() => {
      throw new UnauthorisedError('Invalid session');
    });

    await expect(createOrderUBLXML('valid-id', 'bad-session')).rejects.toThrow(UnauthorisedError);
  });
});

describe('UBL Handlers', () => {
  test('Handler returns 200 on success', async () => {
    mockedUserHelper.getUserIdFromSession.mockReturnValue(1);
    mockedDataStore.getOrderByIdSupa.mockResolvedValue({ orderId: 'valid-id' } as never);

    const mockEvent: Partial<APIGatewayProxyEvent> = {
      pathParameters: { orderId: 'valid-id' },
      headers: { session: 'valid-session' }
    };

    const res = await generateUBLHandler(mockEvent as APIGatewayProxyEvent);
    expect(res.statusCode).toBe(200);
  });

  test('Handler returns 401 on invalid session', async () => {
    mockedUserHelper.getUserIdFromSession.mockImplementation(() => {
      throw new UnauthorisedError('Invalid session');
    });

    const mockEvent: Partial<APIGatewayProxyEvent> = {
      pathParameters: { orderId: 'valid-id' },
      headers: { session: 'bad-session' }
    };

    const res = await generateUBLHandler(mockEvent as APIGatewayProxyEvent);
    expect(res.statusCode).toBe(401);
  });
});