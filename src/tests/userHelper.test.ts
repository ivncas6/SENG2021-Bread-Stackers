import { 
  jwtClean, createNewSession, isTokenBlacklisted, getUserIdFromSession,
  invalidnameFirst, invalidnameLast, invalidemailcheck, invalidphonecheck,
  checkInteger, hasNonDigitCharacter, checkPassword, getHashOf 
} from '../userHelper';
import { supabase } from '../supabase';
import { UnauthorisedError, InvalidFirstName, InvalidLastName, InvalidEmail, InvalidPhone } from '../throwError';
import jwt from 'jsonwebtoken';

jest.mock('../supabase', () => ({
  supabase: {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    neq: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    lt: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockReturnThis(),
  }
}));

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn(),
  verify: jest.fn()
}));

const mockSupabase = supabase as any;
const mockedJwt = jwt as jest.Mocked<typeof jwt>;

describe('userHelper - Auth & Sessions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('jwtClean executes supabase delete correctly', async () => {
    mockSupabase.lt.mockResolvedValueOnce({});
    await jwtClean();
    expect(supabase.from).toHaveBeenCalledWith('jwt_blacklist');
    expect(mockSupabase.delete).toHaveBeenCalled();
  });

  test('createNewSession signs a new token and cleans old ones', async () => {
    mockSupabase.lt.mockResolvedValueOnce({}); // mock jwtClean success
    mockedJwt.sign.mockReturnValue('mocked-token' as any);
    
    const res = await createNewSession(1);
    expect(res).toEqual({ session: 'mocked-token' });
    expect(mockedJwt.sign).toHaveBeenCalled();
  });

  test('isTokenBlacklisted returns true/false correctly', async () => {
    mockSupabase.maybeSingle.mockResolvedValueOnce({ data: { jti: '123' }, error: null });
    await expect(isTokenBlacklisted('123')).resolves.toBe(true);

    mockSupabase.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    await expect(isTokenBlacklisted('123')).resolves.toBe(false);

    mockSupabase.maybeSingle.mockResolvedValueOnce({ data: null, error: new Error('DB Error') });
    await expect(isTokenBlacklisted('123')).rejects.toThrow('DB Error');
  });

  describe('getUserIdFromSession', () => {
    test('returns userId on valid, non-blacklisted token', async () => {
      mockedJwt.verify.mockReturnValue({ userId: 1, jti: '123' } as any);
      mockSupabase.maybeSingle.mockResolvedValueOnce({ data: null, error: null }); // Not blacklisted

      const res = await getUserIdFromSession('valid-token');
      expect(res).toBe(1);
    });

    test('throws UnauthorisedError if payload has no userId', async () => {
      mockedJwt.verify.mockReturnValue({ jti: '123' } as any); // Missing userId
      await expect(getUserIdFromSession('bad-token')).rejects.toThrow(UnauthorisedError);
    });

    test('throws UnauthorisedError if token is blacklisted', async () => {
      mockedJwt.verify.mockReturnValue({ userId: 1, jti: '123' } as any);
      mockSupabase.maybeSingle.mockResolvedValueOnce({ data: { jti: '123' }, error: null }); // Blacklisted

      await expect(getUserIdFromSession('blacklisted-token')).rejects.toThrow('Token has been revoked');
    });

    test('throws UnauthorisedError on verification failure', async () => {
      mockedJwt.verify.mockImplementation(() => { throw new Error('JWT Expired'); });
      await expect(getUserIdFromSession('expired-token')).rejects.toThrow('JWT Expired');
    });

    test('throws generic UnauthorisedError for non-Error throws', async () => {
      mockedJwt.verify.mockImplementation(() => { throw 'String error'; });
      await expect(getUserIdFromSession('weird-token')).rejects.toThrow('Invalid or expired session token');
    });
  });
});

describe('userHelper - Validations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Setup valid session verify for the email/phone checks
    mockedJwt.verify.mockReturnValue({ userId: 1, jti: '123' } as any);
    mockSupabase.maybeSingle.mockResolvedValue({ data: null, error: null }); 
  });

  describe('Name Validation', () => {
    test('invalidnameFirst throws correctly', () => {
      expect(invalidnameFirst('John')).toBeNull();
      expect(() => invalidnameFirst('J@hn')).toThrow(InvalidFirstName); // special char
      expect(() => invalidnameFirst('J')).toThrow(InvalidFirstName); // too short
      expect(() => invalidnameFirst('ThisNameIsWayTooLongForTheSystem')).toThrow(InvalidFirstName); // too long
    });

    test('invalidnameLast throws correctly', () => {
      expect(invalidnameLast('Doe')).toBeNull();
      expect(() => invalidnameLast('D0e')).toThrow(InvalidLastName); // numbers/special
      expect(() => invalidnameLast('D')).toThrow(InvalidLastName); // too short
      expect(() => invalidnameLast('ThisLastNameIsWayTooLongForTheSystem')).toThrow(InvalidLastName); // too long
    });
  });

  describe('Database Checks (Email & Phone)', () => {
    test('invalidemailcheck throws on bad format or existing email', async () => {
      await expect(invalidemailcheck('token', 'not-an-email')).rejects.toThrow(InvalidEmail);

      // Mock database returning an existing user
      mockSupabase.maybeSingle.mockResolvedValueOnce({ data: { contactId: 2 }, error: null });
      await expect(invalidemailcheck('token', 'test@test.com')).rejects.toThrow('Email is already used');

      // Valid case
      mockSupabase.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
      await expect(invalidemailcheck('token', 'good@test.com')).resolves.toBeNull();
    });

    test('invalidphonecheck throws on bad format or existing phone', async () => {
      await expect(invalidphonecheck('token', '123')).rejects.toThrow(InvalidPhone); // too short
      await expect(invalidphonecheck('token', '12345678901234')).rejects.toThrow(InvalidPhone); // too long
      await expect(invalidphonecheck('token', '1234567a')).rejects.toThrow(InvalidPhone); // non-digits

      // Mock database returning existing phone
      mockSupabase.maybeSingle.mockResolvedValueOnce({ data: { contactId: 2 }, error: null });
      await expect(invalidphonecheck('token', '0412345678')).rejects.toThrow('Phone number is already used');

      // Valid case
      mockSupabase.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
      await expect(invalidphonecheck('token', '0412345678')).resolves.toBeNull();
    });
  });

  describe('Password & Crypto Utils', () => {
    test('checkInteger returns true if string contains digit', () => {
      expect(checkInteger('abc1')).toBe(true);
      expect(checkInteger('abc')).toBe(false);
    });

    test('hasNonDigitCharacter returns true if string has non-digits', () => {
      expect(hasNonDigitCharacter('123a')).toBe(true);
      expect(hasNonDigitCharacter('123')).toBe(false);
    });

    test('checkPassword enforces length, letters, and numbers', () => {
      expect(checkPassword('short1')).toBe(false); // too short
      expect(checkPassword('onlyletters')).toBe(false); // no numbers
      expect(checkPassword('123456789')).toBe(false); // no letters
      expect(checkPassword('ValidPass123')).toBe(true); // valid
    });

    test('getHashOf generates a string hash', () => {
      const hash = getHashOf('password');
      expect(typeof hash).toBe('string');
      expect(hash.length).toBeGreaterThan(0);
    });
  });
});