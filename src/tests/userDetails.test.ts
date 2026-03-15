import { clearData } from '../dataStore';
import { userRegister, userDetailsUpdate } from '../userRegister';
import { SessionId } from '../interfaces';
import {
  InvalidEmail,
  InvalidFirstName,
  InvalidLastName,
  InvalidPhone,
  UnauthorisedError,
} from '../throwError';
import { updateUserDetailsHandler } from '../handlers/userDetails';
import { APIGatewayProxyEvent } from 'aws-lambda';

beforeEach(async () => {
  await clearData();
});

async function registerUser() {
  const session = await userRegister(
    'John',
    'Smith',
    'johnsmith@gmail.com',
    '0412345678',
    'password123',
  );
  return session as SessionId;
}

describe('test for the user details update function', () => {
  test('Successful update', async () => {
    const user = await registerUser();
    const res = await userDetailsUpdate(
      user.session,
      'johnsmith@gmail.com',
      'John',
      'Brenner',
      '0412345678'
    );
    expect(res).toStrictEqual({});
  });

  test('Invalid name characters', async () => {
    const user = await registerUser();
    await expect(
      userDetailsUpdate(user.session, 'johnsmith@gmail.com', 'Joh!', 'Smith', '0412345678')
    ).rejects.toThrow(InvalidFirstName);
  });

  test('Invalid short name', async () => {
    const user = await registerUser();
    await expect(
      userDetailsUpdate(user.session, 'johnsmith@gmail.com', 'J', 'Smith', '0412345678')
    ).rejects.toThrow(InvalidFirstName);
  });

  test('Invalid long name', async () => {
    const user = await registerUser();
    await expect(
      userDetailsUpdate(
        user.session,
        'johnsmith@gmail.com',
        'JohnJohnJohnJohnJohnJohn',
        'Smith',
        '0412345678'
      )
    ).rejects.toThrow(InvalidFirstName);
  });

  test('Invalid email', async () => {
    const user = await registerUser();
    await expect(
      userDetailsUpdate(
        user.session,
        'johnsmith.com',
        'JohnJohn',
        'Smith',
        '0412345678'
      )
    ).rejects.toThrow(InvalidEmail);
  });

  test('Invalid last name character', async () => {
    const user = await registerUser();
    await expect(
      userDetailsUpdate(user.session, 'johnsmith@gmail.com', 'John', 'Sm!th', '0412345678')
    ).rejects.toThrow(InvalidLastName);
  });

  test('Invalid last name length', async () => {
    const user = await registerUser();
    await expect(
      userDetailsUpdate(
        user.session,
        'johnsmith@gmail.com',
        'John',
        'SmithSmithSmithSmithSmith',
        '0412345678'
      )
    ).rejects.toThrow(InvalidLastName);
  });

  test('Invalid session', async () => {
    const user = await registerUser();
    await expect(
      userDetailsUpdate(
        user.session + 'adw',
        'johnsmith@gmail.com',
        'John',
        'Smith',
        '0412345678'
      )
    ).rejects.toThrow(UnauthorisedError);
  });

  test('Invalid phone short', async () => {
    const user = await registerUser();
    await expect(
      userDetailsUpdate(
        user.session,
        'johnsmith@gmail.com',
        'John',
        'Smith',
        '04123'
      )
    ).rejects.toThrow(InvalidPhone);
  });

  test('Invalid phone long', async () => {
    const user = await registerUser();
    await expect(
      userDetailsUpdate(
        user.session,
        'johnsmith@gmail.com',
        'John',
        'Smith',
        '04123234567890'
      )
    ).rejects.toThrow(InvalidPhone);
  });

  test('Invalid phone char', async () => {
    const user = await registerUser();
    await expect(
      userDetailsUpdate(
        user.session,
        'johnsmith@gmail.com',
        'John',
        'Smith',
        '04123234!5'
      )
    ).rejects.toThrow(InvalidPhone);
  });
});

describe('Lambda handler tests for userDetailsUpdate', () => {
  test('successful update', async () => {
    const user = await registerUser();
    const result = {
      headers: {
        session: user.session,
      },
      body: JSON.stringify({
        firstName: 'John',
        lastName: 'Smith',
        email: 'johnsmith@gmail.com',
        telephone: '0412345678'
      }),
    } as unknown as APIGatewayProxyEvent;

    const response = await updateUserDetailsHandler(result);
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toStrictEqual({});
  });

  test('invalid email provided', async () => {
    const user = await registerUser();
    const result = {
      headers: {
        session: user.session,
      },
      body: JSON.stringify({
        firstName: 'John',
        lastName: 'Smith',
        email: 'johnsmith.com',
        telephone: '0412345678'
      }),
    } as unknown as APIGatewayProxyEvent;

    const response = await updateUserDetailsHandler(result);
    expect(response.statusCode).toBe(400);
  });

  test('invalid session provided', async () => {
    const user = await registerUser();
    const result = {
      headers: {
        session: user.session + 'aws',
      },
      body: JSON.stringify({
        firstName: 'John',
        lastName: 'Smith',
        email: 'johnsmith@gmail.com',
        telephone: '0412345678'
      }),
    } as unknown as APIGatewayProxyEvent;

    const response = await updateUserDetailsHandler(result);
    expect(response.statusCode).toBe(401);
  });
});