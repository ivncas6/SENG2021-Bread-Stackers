import { clearData } from '../dataStore';
import { userRegister, userLogout } from '../userRegister';
import { Session } from '../interfaces';
import { UnauthorisedError } from '../throwError';
import { userLogoutHandler } from '../handlers/userLogout';
import { APIGatewayProxyEvent } from 'aws-lambda';

beforeEach(() => {
  clearData();
});

function registerUser() {
  const session = userRegister(
    'John',
    'Smith',
    'johnsmith@gmail.com',
    'password123',
  ) as Session;
  return session;
}

describe('user logout test', () => {
  test('sucessful logout', () => {
    const user = registerUser();
    const res = userLogout(user.session);
    expect(res).toStrictEqual({});
  });
  test('invalid session provided', () => {
    const user = registerUser();
    expect(() => userLogout(user.session + 'aswd')).toThrow(UnauthorisedError);
  });
});

describe('user logout handler test', () => {
  test('sucessful logout', async () => {
    const user = registerUser();
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
    const user = registerUser();
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
