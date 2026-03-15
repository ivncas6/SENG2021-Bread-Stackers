import { Contact, ErrorObject, SessionId } from './interfaces';
import { Data, getData } from './dataStore';
import {
  InvalidEmail,
  InvalidFirstName,
  InvalidLastName,
  InvalidPhone,
} from './throwError';
import * as crypto from 'crypto';
import validator from 'validator';
import jwt from 'jsonwebtoken';
import { UnauthorisedError } from './throwError';
import 'dotenv/config';
import { supabase } from './supabase';

const secretKey = process.env.JWT_SECRET || 'fallback-key-get-your-own-in-env-file';

/**
 * Given a registered userId the function will create a new session.
 * @param {number} userId
 * @returns {Session}
 */
// helper function for creating a new session
export function createNewSession(userId:number): SessionId {
  // generate JWT
  const token = jwt.sign({ userId: userId }, secretKey, { expiresIn: '2h' });
  return { session: token };
}

export function getUserIdFromSession(token: string): number {
  try {
    const decode = jwt.verify(token, secretKey) as { userId: number};

    if (typeof decode.userId !== 'number') {
      throw new UnauthorisedError('Invalid token payload');
    }

    return decode.userId;
  } catch (e) {
    if (e instanceof Error) {
      throw new UnauthorisedError(e.message);
    }

    throw new UnauthorisedError('Invalid or expired session token');
  }
}

export function invalidnameFirst(nameFirst: string): null | ErrorObject {
  const charRange: RegExp = /^[a-zA-Z\s\-']+$/;
  if (!charRange.test(nameFirst)) {
    throw new InvalidFirstName('invalid first name: includes special characters');
  }

  if (nameFirst.length < 2) {
    throw new InvalidFirstName('First name is less than 2 characters');
  }
  if (nameFirst.length > 20) {
    throw new InvalidFirstName('First name is more than 20 characters');
  }
  return null;
}

export function invalidnameLast(nameLast: string): ErrorObject | null {
  const charRange: RegExp = /^[a-zA-Z\s\-']+$/;
  if (!charRange.test(nameLast)) {
    throw new InvalidLastName('invalid last name -> includes special characters');
  }
  if (nameLast.length < 2) {
    throw new InvalidLastName('Last name is less than 2 characters');
  }
  if (nameLast.length > 20) {
    throw new InvalidLastName('Last name is more than 20 characters');
  }
  return null;
}

export async function invalidemailcheck(sessionId: string, email: string): Promise<ErrorObject | null> {
  const userId = getUserIdFromSession(sessionId);
  const data: Data = getData();

  if (!validator.isEmail(email)) {
    throw new InvalidEmail('This email is not valid');
  }

  const { data: existingUser } = await supabase
    .from('contacts')
    .select('contactId')
    .eq('email', email)
    .neq('contactId', userId) // Check everyone EXCEPT the current user
    .maybeSingle();

  if (existingUser) {
    throw new InvalidEmail('Email is already used by another user');
  }

  return null;
}

export async function invalidphonecheck(sessionId: string, telephone: string): Promise<ErrorObject | null> {
  const isAllDigits = /^\d+$/.test(telephone);
  if (!isAllDigits || telephone.length < 8 || telephone.length > 12) {
    throw new InvalidPhone('The telephone number is incorrect');
  }

  const userId = getUserIdFromSession(sessionId);
  const { data: existingUser } = await supabase
    .from('contacts')
    .select('contactId')
    .eq('telephone', telephone)
    .neq('contactId', userId)
    .maybeSingle();

  if (existingUser) {
    throw new InvalidPhone('Phone number is already used by another user');
  }

  return null
}


export function checkInteger(password: string) {
  const intRange = /\d/;
  if (intRange.test(password)) {
    return true;
  }
  return false;
}

// Given a string will return true if the string has at least 1 alphabetical value
export function hasNonDigitCharacter(str: string) {
  const regex = /\D/;
  return regex.test(str);
}

// Confirms that the string password given is a valid password.
export function checkPassword(password: string): boolean {
  if (password.length < 8) {
    return false;
  }

  if (hasNonDigitCharacter(password) === true && checkInteger(password) === true) {
    return true;
  }

  return false;
}

export function getHashOf(password: string) {
  return crypto.createHash('sha256').update(password).digest('hex');
}
