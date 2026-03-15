import { EmptyObject, ErrorObject, SessionId } from './interfaces';
import { getData, getUserByIdSupa } from './dataStore';
import {
  InvalidEmail,
  InvalidPhone,
  InvalidLogin,
  InvalidPassword,
  UnauthorisedError
} from './throwError';
import { invalidnameFirst, invalidnameLast, getHashOf, checkPassword, 
  createNewSession, invalidemailcheck,
  getUserIdFromSession,
} from './userHelper';
import validator from 'validator';
import { supabase } from './supabase';

export async function userRegister(nameFirst: string, nameLast: string, email: string, 
  telephone: string, password: string): Promise<SessionId> {

  // Check if the email is valid using the validator.isEmail function
  if (!validator.isEmail(email)) {
    throw new InvalidEmail('Invalid email format.');
  }

  const { data: existingUser } = await supabase
    .from('contacts')
    .select('email')
    .eq('email', email)
    .single();

  // Check if the user has already registered an email
  if (existingUser) {
    throw new InvalidEmail('User already exists.');
  }

  const digitsCheck = /^\d+$/.test(telephone);
  if (!digitsCheck || telephone.length < 8 || telephone.length > 12) {
    throw new InvalidPhone('Invalid phone format');
  }

  invalidnameFirst(nameFirst);
  invalidnameLast(nameLast);

  // Validate the password
  if (!checkPassword(password)) {
    throw new InvalidPassword('Password does not meet requirements.');
  }

  const hashPassword = getHashOf(password);

  // Store user object into database
  const { data: newUser, error } = await supabase 
    .from('contacts')
    .insert([{
      firstName: nameFirst,
      lastName: nameLast,
      email,
      telephone,
      password: hashPassword
    }])
    .select()
    .single();
  
  if (error) throw new Error(error.message);

  return createNewSession(newUser.contactId);
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
export async function userDetailsUpdate(
  session: string, 
  email: string,
  nameFirst: string, 
  nameLast: string): Promise<EmptyObject | ErrorObject> {
 
  const userId = getUserIdFromSession(session);
  const u = await getUserByIdSupa(userId);

  if (!u) {
    throw new UnauthorisedError('User does not exist');
  }

  invalidnameFirst(nameFirst);
  invalidnameLast(nameLast);
  invalidemailcheck(session, email);

  const { error } = await supabase
    .from('contacts')
    .update({
      firstName: nameFirst,
      lastName: nameLast,
      email: email
    })
    .eq('contactId', userId);

  return { };
}

export function userLogout(sessionId: string): EmptyObject | ErrorObject {

  /* Use for any live or self hosted server implementations in the future */

  getUserIdFromSession(sessionId);
  return {};
}


