import { APIGatewayProxyEvent } from 'aws-lambda';
import { userDetailsUpdate } from '../userRegister';
import { handleErrorResponse, jsonResponse } from '../handlerHelpers';

export const updateUserDetailsHandler = async (
  event: APIGatewayProxyEvent
) => {
  try {
    // get the session from the header
    const session = event.headers.session;
    if (!session) {
      return jsonResponse(401, { error: 'provided session is not valid'});
    }
    // retrieve the parameters from the body
    const body = JSON.parse(event.body ?? '{}');

    const email = body.email;
    const firstName = body.firstName;
    const lastName = body.lastName;
    const telephone = body.telephone;

    const res = await userDetailsUpdate(
      session, email, firstName, lastName, telephone
    );

    return jsonResponse(200, res);

  } catch (e: unknown) {
    return handleErrorResponse(e);
  }
};
