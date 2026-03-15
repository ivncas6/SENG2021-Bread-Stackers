import { EmptyObject, ErrorObject, SessionId } from './interfaces';
import { getData } from './dataStore';
import {
  InvalidEmail,
  InvalidLogin,
  InvalidPassword,
  UnauthorisedError
} from './throwError';
import { invalidnameFirst, invalidnameLast, getHashOf, checkPassword, 
  createNewSession, invalidemailcheck,
  getUserIdFromSession,
} from './userHelper';
import validator from 'validator';

export function userRegister(nameFirst: string, nameLast: string, email: string, 
  password: string): SessionId | ErrorObject {
  const data = getData();

  // Check if the user has already registered an email
  if (data.users.some(user => user.email === email)) {
    throw new InvalidEmail('User already exists.');
  }

  // Check if the email is valid using the validator.isEmail function
  if (!validator.isEmail(email)) {
    throw new InvalidEmail('Invalid email format.');
  }

  invalidnameFirst(nameFirst);
  invalidnameLast(nameLast);

  // Validate the password
  if (!checkPassword(password)) {
    throw new InvalidPassword('Password does not meet requirements.');
  }

  const hashPassword = getHashOf(password);
  // Create user object
  const contactId = data.users.length + 1;
  const user = {
    contactId,
    name: nameFirst + ' ' + nameLast,
    email,
    telephone: "",
    password: hashPassword
  };

  // Store user object into database
  data.users.push(user);
  return createNewSession(user.contactId);
}

export function userLogin(email: string, password: string): SessionId | ErrorObject {
  const data = getData();

  // search through the users array in the data object to find a user with matching email to input
  const user = data.users.find(user => user.email === email);

  // if the user was not found
  if (!user) {
    throw new InvalidLogin('Email address does not exist');
  }
  const hashPassword = getHashOf(password);
  if (user.password !== hashPassword) {
    throw new InvalidLogin('Incorrect Password');
  }
  // Resets to 0 after successful login

  return createNewSession(user.contactId);
}

// Given the userId and set of user properties update the properties of the logged in adminUser
export function userDetailsUpdate(session: string, email: string,
  nameFirst: string, nameLast: string): EmptyObject | ErrorObject {
  const userId = getUserIdFromSession(session);
  const data = getData();
  const user = data.users.find((u) => u.contactId === userId);

  if (!user) {
    throw new UnauthorisedError('User does not exist');
  }

  invalidemailcheck(session, email);
  invalidnameFirst(nameFirst);
  invalidnameLast(nameLast);

  user.email = email;
  user.name = nameFirst + ' ' + nameLast; 
  return { };
}

export function userLogout(sessionId: string): EmptyObject | ErrorObject {

  /* Use for any live or self hosted server implementations in the future */

  getUserIdFromSession(sessionId);
  return {};
}


