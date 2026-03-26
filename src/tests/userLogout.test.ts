import { userLogout } from '../userRegister';
import { userLogoutHandler } from '../handlers/userLogout';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { UnauthorisedError } from '../throwError';
import { supabase } from '../supabase';
import jwt from 'jsonwebtoken';
import { SupabaseMock } from '../interfaces';

// mock dependencies
jest.mock('../supabase');
jest.mock('jsonwebtoken');

const mockedSupabase = supabase as unknown as SupabaseMock;
const mockedJwt = jwt as jest.Mocked<typeof jwt>;

const MOCK_SESSION = 'valid-session-123';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Backend logic test for userLogout', () => {
  test('Successful logout', async () => {
    // JWT verification to return valid payload
    mockedJwt.verify.mockReturnValue({ jti: 'mock-uuid-jti', exp: 1234567890 } as unknown as never);
    
    // insert into mock Supabase
    mockedSupabase.insert.mockResolvedValueOnce({ data: null, error: null } as never);

    const res = await userLogout(MOCK_SESSION);
    
    expect(res).toStrictEqual({});
    expect(mockedSupabase.from).toHaveBeenCalledWith('jwt_blacklist');
    expect(mockedSupabase.insert).toHaveBeenCalled();
  });

  test('Testing Invalid Session - Fails Verification', async () => {
    //simulating invalid/tampered token
    mockedJwt.verify.mockImplementation(() => {
      throw new Error('jwt malformed');
    });

    await expect(userLogout('bad-token')).rejects.toThrow(UnauthorisedError);
  });
});

describe('Lambda function for userLogout', () => {
  test('successfully logs out', async () => {
    mockedJwt.verify.mockReturnValue({ jti: 'mock-uuid-jti', exp: 1234567890 } as unknown as never);
    mockedSupabase.insert.mockResolvedValueOnce({ data: null, error: null } as never);

    const event = {
      headers: { session: MOCK_SESSION },
    } as unknown as APIGatewayProxyEvent;

    const response = await userLogoutHandler(event);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toStrictEqual({});
  });

  test('Missing session header', async () => {
    const event = {
      // empty sesh
      headers: {},
    } as unknown as APIGatewayProxyEvent;

    const response = await userLogoutHandler(event);

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toHaveProperty('error');
  });

  test('Invalid session header format', async () => {
    mockedJwt.verify.mockImplementation(() => {
      throw new Error('jwt malformed');
    });

    const event = {
      headers: { session: 'bad-token' },
    } as unknown as APIGatewayProxyEvent;

    const response = await userLogoutHandler(event);

    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body)).toHaveProperty('error');
  });
});