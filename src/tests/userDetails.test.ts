import { clearData } from '../dataStore';
import { userRegister, userDetailsUpdate } from '../userRegister';
import { Session, UserInfo } from '../interfaces';
import {
  InvalidEmail,
  InvalidFirstName,
  InvalidLastName,
  UnauthorisedError,
} from '../throwError';
import { updateUserDetailsHandler } from '../handlers/userDetails';
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

describe('test for the user details update function', () => {
  test('Successful update', () => {
    const user = registerUser();
    const res = userDetailsUpdate(
      user.session,
      'johnsmith@gmail.com',
      'John',
      'Brenner',
    );
    expect(res).toStrictEqual({});
  });
  test('Invalid name 1', () => {
    const user = registerUser();
    expect(() =>
      userDetailsUpdate(user.session, 'johnsmith@gmail.com', 'Joh!', 'Smith'),
    ).toThrow(InvalidFirstName);
  });
  test('Invalid name 2', () => {
    const user = registerUser();
    expect(() =>
      userDetailsUpdate(user.session, 'johnsmith@gmail.com', 'J', 'Smith'),
    ).toThrow(InvalidFirstName);
  });
  test('Invalid name 3', () => {
    const user = registerUser();
    expect(() =>
      userDetailsUpdate(
        user.session,
        'johnsmith@gmail.com',
        'JohnJohnJohnJohnJohnJohn',
        'Smith',
      ),
    ).toThrow(InvalidFirstName);
  });
  test('Invalid email', () => {
    const user = registerUser();
    expect(() =>
      userDetailsUpdate(
        user.session,
        'johnsmith.com',
        'JohnJohnJohnJohnJohnJohn',
        'Smith',
      ),
    ).toThrow(InvalidEmail);
  });
  test('Invalid last name', () => {
    const user = registerUser();
    expect(() =>
      userDetailsUpdate(user.session, 'johnsmith@gmail.com', 'John', 'Sm!th'),
    ).toThrow(InvalidLastName);
  });
  test('Invalid last name 2', () => {
    const user = registerUser();
    expect(() =>
      userDetailsUpdate(
        user.session,
        'johnsmith@gmail.com',
        'John',
        'SmithSmithSmithSmithSmith',
      ),
    ).toThrow(InvalidLastName);
  });
  test('Invalid last name 2', () => {
    const user = registerUser();
    expect(() =>
      userDetailsUpdate(user.session, 'johnsmith@gmail.com', 'John', 'S'),
    ).toThrow(InvalidLastName);
  });
  test('Invalid session', () => {
    const user = registerUser();
    expect(() =>
      userDetailsUpdate(
        user.session + 'adw',
        'johnsmith@gmail.com',
        'John',
        'Smith',
      ),
    ).toThrow(UnauthorisedError);
  });
});

describe('test for the user details update function', () => {
  test('successful update', async () => {
    const user = registerUser();
    const result = {
      headers: {
        session: user.session,
      },
      body: JSON.stringify({
        firstName: 'John',
        lastName: 'Smith',
        email: 'johnsmith@gmail.com',
      }),
    } as unknown as APIGatewayProxyEvent;

    const response = await updateUserDetailsHandler(result);
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toStrictEqual({});
  });
  test('invalid email provided', async () => {
    const user = registerUser();
    const result = {
      headers: {
        session: user.session,
      },
      body: JSON.stringify({
        firstName: 'John',
        lastName: 'Smith',
        email: 'johnsmith.com',
      }),
    } as unknown as APIGatewayProxyEvent;

    const response = await updateUserDetailsHandler(result);
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({ error: expect.any(String) });
  });
  test('invalid first name provided', async () => {
    const user = registerUser();
    const result = {
      headers: {
        session: user.session,
      },
      body: JSON.stringify({
        firstName: 'J',
        lastName: 'Smith',
        email: 'johnsmith.com',
      }),
    } as unknown as APIGatewayProxyEvent;

    const response = await updateUserDetailsHandler(result);
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({ error: expect.any(String) });
  });
  test('invalid last name provided', async () => {
    const user = registerUser();
    const result = {
      headers: {
        session: user.session,
      },
      body: JSON.stringify({
        firstName: 'John',
        lastName: 'Sm!th',
        email: 'johnsmith.com',
      }),
    } as unknown as APIGatewayProxyEvent;

    const response = await updateUserDetailsHandler(result);
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({ error: expect.any(String) });
  });
  test('invalid session provided', async () => {
    const user = registerUser();
    const result = {
      headers: {
        session: user.session + 'aws',
      },
      body: JSON.stringify({
        firstName: 'John',
        lastName: 'Smith',
        email: 'johnsmith.com',
      }),
    } as unknown as APIGatewayProxyEvent;

    const response = await updateUserDetailsHandler(result);
    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body)).toEqual({ error: expect.any(String) });
  });
  test('empty session provided', async () => {
    const user = registerUser();
    const result = {
      headers: {
        session: null,
      },
      body: JSON.stringify({
        firstName: 'John',
        lastName: 'Smith',
        email: 'johnsmith.com',
      }),
    } as unknown as APIGatewayProxyEvent;

    const response = await updateUserDetailsHandler(result);
    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body)).toEqual({ error: expect.any(String) });
  });
});
