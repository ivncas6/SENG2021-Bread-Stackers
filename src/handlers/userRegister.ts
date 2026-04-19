import { APIGatewayProxyEvent } from 'aws-lambda';
import { userRegister } from '../userRegister';
import { handleErrorResponse, jsonResponse } from '../handlerHelpers';

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

  } catch (e: unknown) {
    return handleErrorResponse(e);
  }
};
