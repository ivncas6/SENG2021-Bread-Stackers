import { clearData } from '../dataStore';
import { userRegister, userLogout } from '../userRegister';
import { SessionId } from '../interfaces';
import { UnauthorisedError } from '../throwError';
import { userLogoutHandler } from '../handlers/userLogout';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { randomUUID } from 'node:crypto';

beforeEach(async () => {
  await clearData();
  jest.clearAllMocks();
});


async function registerUser() {
  const session = await userRegister(
    'John',
    'Smith',
    'johnsmith@gmail.com',
    '0412345678',
    'password123',
  ) as SessionId;
  return session;
}

describe('user logout test', () => {
  test('sucessful logout', async () => {
    const user = await registerUser();
    const res = await userLogout(user.session);
    expect(res).toStrictEqual({});
  });
  test('invalid session provided', async () => {
    await registerUser();
    await expect(() => userLogout(randomUUID())).rejects.toThrow(UnauthorisedError);
  });
});

describe('user logout handler test', () => {
  test('sucessful logout', async () => {
    const user = await registerUser();
    const result = {
      headers: {
        session: user.session,
      },
    } as unknown as APIGatewayProxyEvent;

    const response = await userLogoutHandler(result);
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toStrictEqual({});
  });
  test('sucessful logout', async () => {
    const user = await registerUser();
    const result = {
      headers: {
        session: user.session + 'awsd',
      },
    } as unknown as APIGatewayProxyEvent;

    const response = await userLogoutHandler(result);
    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body)).toStrictEqual({
      error: expect.any(String),
    });
  });
});
