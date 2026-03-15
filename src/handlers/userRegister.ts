import { APIGatewayProxyEvent } from 'aws-lambda';
import { InvalidLastName, InvalidFirstName, InvalidEmail, InvalidPassword, InvalidPhone } from '../throwError';
import { userRegister } from '../userRegister';

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
    const telephone = body.telephone

    const user = userRegister(firstName, lastName, email, password, telephone);

    return {
      statusCode: 200,
      body: JSON.stringify(user),
    };

  } catch (e) {
    if (e instanceof InvalidLastName ||
        e instanceof InvalidFirstName ||
        e instanceof InvalidEmail ||
        e instanceof InvalidPassword ||
        e instanceof InvalidPhone
    ) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: e.message })
      };
    }
    // internal server error, server doesnot know how to handle the error
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'INTERNAL SERVER ERROR' }),
    };
  }
};