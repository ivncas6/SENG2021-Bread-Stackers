import { userDetailsUpdate } from '../userRegister';
import { updateUserDetailsHandler } from '../handlers/userDetails';
import { updateUserDetailsHandler as v2Details } from '../handlersV1/userDetails';
import { APIGatewayProxyEvent } from 'aws-lambda';
import * as userHelper from '../userHelper';
import * as dataStore from '../dataStore';
import { supabase } from '../supabase';
import {
  InvalidEmail,
  InvalidFirstName,
  InvalidPhone,
  UnauthorisedError,
} from '../throwError';

// external deps
jest.mock('../userHelper', () => {
  const actual = jest.requireActual('../userHelper');
  return {
    ...actual,
    getUserIdFromSession: jest.fn(),
    invalidemailcheck: jest.fn(),
    invalidphonecheck: jest.fn(),
  };
});

jest.mock('../dataStore');
jest.mock('../supabase', () => ({
  supabase: {
    from: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
  }
}));

const mockedUserHelper = userHelper as jest.Mocked<typeof userHelper>;
const mockedDataStore = dataStore as jest.Mocked<typeof dataStore>;
const mockedSupabase = supabase as never;

const mockEvent: Partial<APIGatewayProxyEvent> = {
  headers: {},
  body: ''
};

beforeEach(() => {
  jest.clearAllMocks();
});

async function setupMockUser() {
  const session = 'valid-session';
  const userId = 123;
  mockedUserHelper.getUserIdFromSession.mockReturnValue(userId);
  mockedDataStore.getUserByIdSupa.mockResolvedValue({ contactId: userId } as never);
  mockedSupabase.eq.mockResolvedValue({ error: null });
  
  // Default: validation helpers do nothing (success)
  mockedUserHelper.invalidemailcheck.mockResolvedValue(undefined);
  mockedUserHelper.invalidphonecheck.mockResolvedValue(undefined);
  
  return { session, userId };
}

describe('test for the user details update function', () => {
  test('Successful update', async () => {
    const { session } = await setupMockUser();
    const res = await userDetailsUpdate(session, 'test@test.com', 'John', 'Smith', '0412345678');
    expect(res).toStrictEqual({});
  });

  test('Invalid name characters', async () => {
    const { session } = await setupMockUser();
    // This uses the REAL logic from userHelper because of requireActual
    await expect(
      userDetailsUpdate(session, 'test@test.com', 'Joh!', 'Smith', '0412345678')
    ).rejects.toThrow(InvalidFirstName);
  });

  test('Invalid short name', async () => {
    const { session } = await setupMockUser();
    await expect(
      userDetailsUpdate(session, 'test@test.com', 'J', 'Smith', '0412345678')
    ).rejects.toThrow(InvalidFirstName);
  });

  test('invalid email', async () => {
    const { session } = await setupMockUser();
    // Since we mocked invalidemailcheck, we tell it to throw for this test
    mockedUserHelper.invalidemailcheck.mockRejectedValue(new InvalidEmail('Invalid email'));

    await expect(
      userDetailsUpdate(session, 'bad-email', 'John', 'Smith', '0412345678')
    ).rejects.toThrow(InvalidEmail);
  });

  test('invalid phone', async () => {
    const { session } = await setupMockUser();
    mockedUserHelper.invalidphonecheck.mockRejectedValue(new InvalidPhone('Invalid phone'));

    await expect(
      userDetailsUpdate(session, 'test@test.com', 'John', 'Smith', '123')
    ).rejects.toThrow(InvalidPhone);
  });

  test('user doesnt exist in database', async () => {
    const { session } = await setupMockUser();
    mockedDataStore.getUserByIdSupa.mockResolvedValue(null);

    await expect(
      userDetailsUpdate(session, 'test@test.com', 'John', 'Smith', '0412345678')
    ).rejects.toThrow(UnauthorisedError);
  });
});

describe('Lambda handler tests for userDetailsUpdate', () => {
  test('invalid email provided (Lambda returns 400)', async () => {
    const { session } = await setupMockUser();
    mockedUserHelper.invalidemailcheck.mockRejectedValue(new InvalidEmail('Invalid email'));

    const event = {
      ...mockEvent,
      headers: { session: session },
      body: JSON.stringify({
        firstName: 'John',
        lastName: 'Smith',
        email: 'invalid.com',
        phone: '0412345678'
      }),
    } as unknown as APIGatewayProxyEvent;

    const response = await updateUserDetailsHandler(event);
    expect(response?.statusCode).toStrictEqual(400);
    expect(JSON.parse(response?.body ?? '{}')).toHaveProperty('error');
  });

  test('Missing session header returns 401', async () => {
    const event = {
      ...mockEvent,
      headers: {}, // empty session
      body: JSON.stringify({ firstName: 'John' }),
    } as unknown as APIGatewayProxyEvent;

    const response = await updateUserDetailsHandler(event);
    expect(response.statusCode).toStrictEqual(401);
  });

  test('Internal Server Error (500) on unexpected crash', async () => {
    const { session } = await setupMockUser();

    // valid body
    const event = {
      ...mockEvent,
      headers: { session },
      body: JSON.stringify({
        firstName: 'John',
        lastName: 'Smith',
        email: 'test@test.com',
        phone: '0412345678'
      }),
    } as unknown as APIGatewayProxyEvent;

    // force crash after validation
    // DB call throw a non-Supabase, non-Validation error
    mockedDataStore.getUserByIdSupa.mockImplementation(() => {
      throw new Error('Generic Database Explosion'); 
    });

    const response = await updateUserDetailsHandler(event);
    
    expect(response.statusCode).toStrictEqual(500);
  });
});

describe('Lambda V2 tests for updateUserDetailsHandler (Optional Fields)', () => {
  
  test('successfully merges partial body payload with existing DB data', async () => {
    mockedUserHelper.getUserIdFromSession.mockResolvedValue(1);
    mockedUserHelper.invalidemailcheck.mockResolvedValue(undefined);
    mockedUserHelper.invalidphonecheck.mockResolvedValue(undefined);
    mockedDataStore.getUserByIdSupa.mockResolvedValue({
      contactId: 1,
      firstName: 'OldFirst',
      lastName: 'OldLast',
      email: 'old@test.com',
      telephone: '0400000000'
    } as never);

    const event = {
      headers: { session: 'valid-session' },
      body: JSON.stringify({
        // only updating these two
        firstName: 'NewFirst',
        telephone: '0499999999'
      })
    } as unknown as APIGatewayProxyEvent;

    const response = await v2Details(event);

    expect(response?.statusCode).toStrictEqual(200);
    expect((mockedSupabase as never).update).toHaveBeenCalledWith({
      firstName: 'NewFirst',
      lastName: 'OldLast',
      email: 'old@test.com',
      telephone: '0499999999'
    });
  });

  test('returns 401 Unauthorised if session user is not found in DB', async () => {
    mockedUserHelper.getUserIdFromSession.mockResolvedValue(1);
    mockedUserHelper.invalidemailcheck.mockResolvedValue(undefined);
    mockedUserHelper.invalidphonecheck.mockResolvedValue(undefined);
    // Return null to simulate user missing from DB
    mockedDataStore.getUserByIdSupa.mockResolvedValue(null);

    const event = {
      headers: { session: 'valid-session' },
      body: JSON.stringify({ firstName: 'NewFirst' })
    } as unknown as APIGatewayProxyEvent;

    const response = await v2Details(event);
    
    expect(response?.statusCode).toStrictEqual(401); 
    expect(JSON.parse(response?.body ?? '{}'))
      .toHaveProperty('error', 'User for session does not exist');
  });

});