import { EmptyObject, ErrorObject, SessionId } from './interfaces';
import { createOrganisationSupa, getUserByIdSupa } from './dataStore';
import {
  InvalidEmail,
  InvalidPhone,
  InvalidLogin,
  InvalidPassword,
  UnauthorisedError
} from './throwError';
import { invalidnameFirst, invalidnameLast, getHashOf, checkPassword, 
  createNewSession, invalidemailcheck, invalidphonecheck,
  getUserIdFromSession,
} from './userHelper';
import validator from 'validator';
import { supabase } from './supabase';
import jwt from 'jsonwebtoken';
import { JWTsecretKey } from './config';

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
    .maybeSingle();

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

  try {
    const org = await createOrganisationSupa(newUser.contactId, `${nameFirst} ${nameLast}`);
    if (!org) {
      throw new Error('Database returned no data for organization creation');
    }
  } catch (e: unknown) {
    // We pass the original error 'e' into the 'cause' property
    throw new Error(`User created, but Org failed: ${e instanceof Error ? 
      e.message : String(e)}`, { 
      cause: e 
    });
  }

  return await createNewSession(newUser.contactId);
}

export async function userLogin(email: string, password: string): Promise<SessionId | ErrorObject> {

  const { data: user, error } = await supabase
    .from('contacts')
    .select('contactId, password')
    .eq('email', email)
    .maybeSingle();

  if (error) throw error;

  // if the user was not found
  if (!user) {
    throw new InvalidLogin('Email address does not exist');
  }
  const hashPassword = getHashOf(password);
  if (user.password !== hashPassword) {
    throw new InvalidLogin('Incorrect Password');
  }
  // Resets to 0 after successful login

  return await createNewSession(user.contactId);
}

// Given the userId and set of user properties update the properties of the logged in adminUser
export async function userDetailsUpdate(
  session: string, 
  email: string,
  nameFirst: string, 
  nameLast: string,
  phone: string
): Promise<EmptyObject | ErrorObject> {

  invalidnameFirst(nameFirst);
  invalidnameLast(nameLast);
 
  const userId = await getUserIdFromSession(session);
  const u = await getUserByIdSupa(userId);

  if (!u) {
    throw new UnauthorisedError('User does not exist');
  }
  
  await invalidemailcheck(session, email);
  await invalidphonecheck(session, phone);

  const { error } = await supabase
    .from('contacts')
    .update({
      firstName: nameFirst,
      lastName: nameLast,
      email: email,
      telephone: phone
    })
    .eq('contactId', userId);
  
  if (error) throw error;

  return { };
}

export async function userLogout(sessionId: string): Promise<EmptyObject | ErrorObject> {
  const secretKey = JWTsecretKey as string;

  try {
    const decode = jwt.verify(sessionId, secretKey) as { jti: string; exp: number };
    
    if (!decode.jti || !decode.exp) {
      throw new UnauthorisedError('Invalid token');
    }
    
    // add JWT token to supabase blacklist and logout user
    await supabase
      .from('jwt_blacklist')
      .insert({
        jti: decode.jti,
        expires_at: new Date(decode.exp * 1000)
      });

    return {};

  } catch {
    throw new UnauthorisedError('Invalid token');
  }
}


