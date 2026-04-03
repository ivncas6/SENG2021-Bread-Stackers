import { createOrderUBLXML, getOrderUBLXML } from '../generateUBL';
import * as dataStore from '../dataStore';
import * as userHelper from '../userHelper';
import { supabase } from '../supabase';
import { UBLBucket } from '../interfaces';

// 1. Mock the internal dependencies
jest.mock('../userHelper');
jest.mock('../dataStore');

// 2. Mock the Supabase client (specifically the storage chain)
jest.mock('../supabase', () => ({
  supabase: {
    storage: {
      from: jest.fn().mockReturnThis(), // allows .from().upload() chaining
      upload: jest.fn(),
      createSignedUrl: jest.fn(),
    }
  }
}));

const mockedUserHelper = userHelper as jest.Mocked<typeof userHelper>;
const mockedDataStore = dataStore as jest.Mocked<typeof dataStore>;
const mockedSupabase = supabase as jest.Mocked<typeof supabase>;

describe('UBL Generation Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('successfully creates and uploads a UBL XML', async () => {
    // 1. Set up your mock data
    const mockSession = 'valid-session';
    const mockOrderId = 'order-123';
    
    mockedUserHelper.getUserIdFromSession.mockResolvedValue(1);
    mockedDataStore.getOrgByUserId
      .mockResolvedValue({ data: { orgId: 10 }, error: null } as never);
    mockedDataStore.getUserByIdSupa.mockResolvedValue({
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      telephone: '0412345678'
    } as never);
    
    mockedDataStore.getOrderByIdSupa.mockResolvedValue({
      orderId: mockOrderId,
      issuedDate: '2026-04-03',
      issuedTime: '12:00:00',
      currency: 'AUD',
      buyerOrgID: 10,
      taxExclusive: 100,
      taxInclusive: 110,
      finalPrice: 110,
      deliveries: [{ addresses: { street: '123 Baker St' } }],
      order_lines: [{ 
        quantity: 2, 
        items: { name: 'Bread', description: 'Sourdough', price: 50 } 
      }]
    } as never);

    // mock upload to work without errors
    (mockedSupabase.storage.from(UBLBucket).upload as jest.Mock)
      .mockResolvedValue({ data: { path: 'mock-path' }, error: null });

    // make UBL
    await createOrderUBLXML(mockOrderId, mockSession);

    // check UBL Bucket
    expect(mockedSupabase.storage.from).toHaveBeenCalledWith('UBLBucket');
    expect(mockedSupabase.storage.from(UBLBucket).upload).toHaveBeenCalled();
    
    // consts for checking UBL content
    const uploadArgs = (mockedSupabase
      .storage.from(UBLBucket).upload as jest.Mock).mock.calls[0];
    const uploadedXMLContent = uploadArgs[1];
    
    expect(uploadedXMLContent).toContain('<cbc:Name>John Doe</cbc:Name>');
    expect(uploadedXMLContent).toContain('<cbc:StreetName>123 Baker St</cbc:StreetName>');
  });
});