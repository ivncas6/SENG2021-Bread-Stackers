import { clearData } from '../dataStore';
import { userRegister } from '../userRegister';
import { SessionId } from '../interfaces';
import {
  InvalidEmail,
  InvalidFirstName,
  InvalidLastName,
  InvalidPassword,
  InvalidPhone
} from '../throwError';
import { registerUserHandler } from '../handlers/userRegister';
import { APIGatewayProxyEvent } from 'aws-lambda';

// keep this or suffer 20+ seconds
jest.mock('../supabase')

beforeEach(async () => {
  await clearData();
});

//this is backend logic tests 
describe('await userRegister tests', () => {

  test('successfully registers user', async () => {
    const res = await userRegister(
      'Eric',
      'Wong',
      'hello@gmail.com',
      '0412345678',
      'Password123',
    ) as SessionId;

    expect(res).toEqual({
      session: expect.any(String)
    });
  });

  test('duplicate email error', async () => {
    await userRegister('Eric', 'Wong', 'hello@gmail.com', '0412345678', 'Password123');

    await expect(() =>
      userRegister('Eric', 'Wong', 'hello@gmail.com', '0412345678', 'Password123')
    ).toThrow(InvalidEmail);
  });

  test('invalid email format', async () => {
    await expect(() =>
      userRegister('Eric', 'Wong', 'hellogmail.com', '0412345678', 'Password123')
    ).rejects.toThrow(InvalidEmail);
  });

  test('invalid first name characters', async () => {
    await expect(() =>
      userRegister('Er!c', 'Wong', 'hello@gmail.com', '0412345678', 'Password123')
    ).rejects.toThrow(InvalidFirstName);
  });

  test('first name too short', async () => {
    await expect(() =>
      userRegister('E', 'Wong', 'hello@gmail.com', '0412345678', 'Password123')
    ).rejects.toThrow(InvalidFirstName);
  });

  test('invalid last name characters', async () => {
    await expect(() =>
      userRegister('Eric', 'W&ng', 'hello@gmail.com', '0412345678', 'Password123')
    ).rejects.toThrow(InvalidLastName);
  });

  test('password too short', async () => {
    await expect(() =>
      userRegister('Eric', 'Wong', 'hello@gmail.com', '0412345678', 'short')
    ).rejects.toThrow(InvalidPassword);
  });

  test('password missing number', async () => {
    await expect(() =>
      userRegister('Eric', 'Wong', 'hello@gmail.com', '0412345678', 'passwordonly',)
    ).rejects.toThrow(InvalidPassword);
  });

  test('telephone is too long', async () => {
    await expect(() =>
      userRegister('Eric', 'Wong', 'hello@gmail.com', '041234567822567', '12345678as',)
    ).rejects.toThrow(InvalidPhone);
  });

  test('telephone is too short', async () => {
    await expect(() =>
      userRegister('Eric', 'Wong', 'hello@gmail.com', '041234', '12345678as',)
    ).rejects.toThrow(InvalidPhone);
  });

  test('telephone is not a number', async () => {
    await expect(() =>
      userRegister('Eric', 'Wong', 'hello@gmail.com', '04123456ba', '12345678as')
    ).rejects.toThrow(InvalidPhone);
  });

});

//this is lambda handler test 
describe('Lambda function tests for userRegister', () => {

  test('successfully registers user', async () => {

    const event = {
      body: JSON.stringify({
        firstName: 'Eric',
        lastName: 'Wong',
        email: 'hello@gmail.com',
        telephone: '0412345678',
        password: 'Password123'
      })
    } as unknown as APIGatewayProxyEvent;

    const response = await registerUserHandler(event);

    expect(response.statusCode).toEqual(200);
    expect(JSON.parse(response.body)).toEqual({
      session: expect.any(String)
    });

  });

  test('invalid email provided', async () => {

    const event = {
      body: JSON.stringify({
        firstName: 'Eric',
        lastName: 'Wong',
        email: 'hellogmail.com',
        telpehone: '0412345678',
        password: 'Password123'
      })
    } as unknown as APIGatewayProxyEvent;

    const response = await registerUserHandler(event);

    expect(response.statusCode).toStrictEqual(400);
    expect(JSON.parse(response.body)).toStrictEqual({
      error: expect.any(String)
    });

  });

  test('invalid first name', async () => {

    const event = {
      body: JSON.stringify({
        firstName: 'Er!c',
        lastName: 'Wong',
        email: 'hello@gmail.com',
        telephone: '0412345678',
        password: 'Password123'
      })
    } as unknown as APIGatewayProxyEvent;

    const response = await registerUserHandler(event);

    expect(response.statusCode).toStrictEqual(400);
    expect(JSON.parse(response.body)).toStrictEqual({
      error: expect.any(String)
    });

  });

  test('invalid password', async () => {

    const event = {
      body: JSON.stringify({
        firstName: 'Eric',
        lastName: 'Wong',
        email: 'hello@gmail.com',
        telephone: '0412345678',
        password: '123'
      })
    } as unknown as APIGatewayProxyEvent;

    const response = await registerUserHandler(event);

    expect(response.statusCode).toStrictEqual(400);
    expect(JSON.parse(response.body)).toStrictEqual({
      error: expect.any(String)
    });

  });

});
