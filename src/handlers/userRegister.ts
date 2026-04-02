import { APIGatewayProxyEvent } from 'aws-lambda';
import { InvalidLastName, InvalidFirstName, 
  InvalidEmail, InvalidPassword, InvalidPhone } from '../throwError';
import { userRegister } from '../userRegister';
import { jsonResponse } from './response';

export const registerUserHandler = async (
  event: APIGatewayProxyEvent
) => {
  try {
    // retrieve the parameters from the body
    const body = JSON.parse(event.body ?? '{}');

    const email = body.email;
    const firstName = body.firstName;
    const lastName = body.lastName;
    const password = body.password;
    const telephone = body.telephone;

    const user = await userRegister(firstName, lastName, email, telephone, password);

    return jsonResponse(200, user);

  } catch (e) {
    if (e instanceof InvalidLastName ||
        e instanceof InvalidFirstName ||
        e instanceof InvalidEmail ||
        e instanceof InvalidPassword ||
        e instanceof InvalidPhone
    ) {
      return jsonResponse(400, { error: e.message });
    }
    // internal server error, server doesnot know how to handle the error
    return jsonResponse(500, { error: 'INTERNAL SERVER ERROR' });
  }
};
