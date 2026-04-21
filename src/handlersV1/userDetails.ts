import { APIGatewayProxyEvent } from 'aws-lambda';
import { UnauthorisedError } from '../throwError';
import { userDetailsUpdate } from '../userRegister';
import { handleErrorResponse, jsonResponse } from '../handlerHelpers';
import { getUserIdFromSession } from '../userHelper';
import { getUserByIdSupa } from '../dataStore';

export const updateUserDetailsHandler = async (
  event: APIGatewayProxyEvent
) => {
  try {
    // get the session from the header
    const session = event.headers.session;
    if (!session) {
      return jsonResponse(401, { error: 'provided session is not valid'});
    }

    const userId = await getUserIdFromSession(session);
    const user = await getUserByIdSupa(userId);

    if (!user) {
      throw new UnauthorisedError('User for session does not exist');
    }

    // retrieve the parameters from the body
    const body = JSON.parse(event.body ?? '{}');

    // if no change mentioned keep the same
    const email = body.email ?? user.email;
    const firstName = body.firstName ?? user.firstName;
    const lastName = body.lastName ?? user.lastName;
    const telephone = body.telephone ?? user.telephone;

    const res = await userDetailsUpdate(
      session, email, firstName, lastName, telephone
    );

    return jsonResponse(200, res);

  } catch (e: unknown) {
    return handleErrorResponse(e);
  }
};
