const path = require('path');
const { 
  ALLOWED_PAYMENT_METHODS, 
  ALLOWED_USERS,
  validateAndUploadTransactions 
} = require('../src/utils');

// Mock modules
jest.mock('fs', () => {
  return {
    promises: {
      access: jest.fn(),
    },
    createReadStream: jest.fn(() => ({
      pipe: jest.fn().mockReturnThis(),
      on: jest.fn().mockReturnThis()
    })),
  };
});

// Get the mocked fs module
const fs = require('fs');

jest.mock('dotenv', () => ({
  config: jest.fn(),
}));

jest.mock('@notionhq/client', () => ({
  Client: jest.fn().mockImplementation(() => ({
    pages: {
      create: jest.fn(),
    },
  })),
}));

// Mock console methods to prevent noise in test output
const originalConsoleLog = console.log;

describe('Input Validation Tests', () => {
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock console.log to prevent noise
    console.log = jest.fn();
    
    // Reset environment variables
    process.env = { ...process.env };
    delete process.env.NOTION_API_KEY;
    delete process.env.NOTION_DATABASE_ID;
    delete process.env.WHO_AM_I;
    
    // Mock fs.access to succeed by default
    fs.promises.access.mockResolvedValue(undefined);
  });

  afterEach(() => {
    // Restore console methods
    console.log = originalConsoleLog;
  });

  describe('CSV File Path Validation', () => {
    test('should error when CSV file is not found', async () => {
      // Mock fs.access to fail
      fs.promises.access.mockRejectedValue(new Error('File not found'));
      
      const options = {
        csvFilePath: 'non-existent-file.csv',
        paymentMethod: 'Chase Sapphire',
        notionApiKey: 'test-key',
        notionDatabaseId: 'test-db'
      };
      
      await expect(validateAndUploadTransactions(options)).rejects.toThrow('CSV file not found at path');
    });
  });

  describe('Notion API Key Validation', () => {
    test('should error when NOTION_API_KEY is not provided', async () => {
      // Mock fs.access to succeed
      fs.promises.access.mockResolvedValue(undefined);
      
      const options = {
        csvFilePath: 'sample-transactions.csv',
        paymentMethod: 'Chase Sapphire',
        notionDatabaseId: 'test-db'
      };
      
      await expect(validateAndUploadTransactions(options)).rejects.toThrow('Notion API key is required');
    });

    test('should accept NOTION_API_KEY from environment variable', async () => {
      // Set environment variable
      process.env.NOTION_API_KEY = 'test-key-from-env';
      process.env.NOTION_DATABASE_ID = 'test-db-from-env';
      process.env.WHO_AM_I = 'Alli';
      
      // Mock fs.access to succeed
      fs.promises.access.mockResolvedValue(undefined);
      
      const options = {
        csvFilePath: 'sample-transactions.csv',
        paymentMethod: 'Chase Sapphire',
        dryRun: true
      };
      
      // Mock parseCSV to return empty array
      const mockParseCSV = jest.fn().mockResolvedValue([]);
      jest.spyOn(global, 'Promise').mockImplementationOnce(() => ({
        then: (callback) => {
          callback([]);
          return { catch: jest.fn() };
        }
      }));
      
      // This should not throw an error related to API key
      await expect(validateAndUploadTransactions(options)).resolves.not.toThrow('Notion API key is required');
    });
  });

  describe('Notion Database ID Validation', () => {
    test('should error when NOTION_DATABASE_ID is not provided', async () => {
      // Mock fs.access to succeed
      fs.promises.access.mockResolvedValue(undefined);
      
      const options = {
        csvFilePath: 'sample-transactions.csv',
        paymentMethod: 'Chase Sapphire',
        notionApiKey: 'test-key'
      };
      
      await expect(validateAndUploadTransactions(options)).rejects.toThrow('Notion database ID is required');
    });

    test('should accept NOTION_DATABASE_ID from environment variable', async () => {
      // Set environment variable
      process.env.NOTION_API_KEY = 'test-key-from-env';
      process.env.NOTION_DATABASE_ID = 'test-db-from-env';
      process.env.WHO_AM_I = 'Alli';
      
      // Mock fs.access to succeed
      fs.promises.access.mockResolvedValue(undefined);
      
      const options = {
        csvFilePath: 'sample-transactions.csv',
        paymentMethod: 'Chase Sapphire',
        dryRun: true
      };
      
      // Mock parseCSV to return empty array
      jest.spyOn(global, 'Promise').mockImplementationOnce(() => ({
        then: (callback) => {
          callback([]);
          return { catch: jest.fn() };
        }
      }));
      
      // This should not throw an error related to database ID
      await expect(validateAndUploadTransactions(options)).resolves.not.toThrow('Notion database ID is required');
    });
  });

  describe('WHO_AM_I Validation', () => {
    test('should error when WHO_AM_I is not provided', async () => {
      // Mock fs.access to succeed
      fs.promises.access.mockResolvedValue(undefined);
      
      const options = {
        csvFilePath: 'sample-transactions.csv',
        paymentMethod: 'Chase Sapphire',
        notionApiKey: 'test-key',
        notionDatabaseId: 'test-db'
      };
      
      await expect(validateAndUploadTransactions(options)).rejects.toThrow('WHO_AM_I is required');
    });

    test('should error when WHO_AM_I is invalid', async () => {
      // Mock fs.access to succeed
      fs.promises.access.mockResolvedValue(undefined);
      
      const options = {
        csvFilePath: 'sample-transactions.csv',
        paymentMethod: 'Chase Sapphire',
        notionApiKey: 'test-key',
        notionDatabaseId: 'test-db',
        whoAmI: 'InvalidUser'
      };
      
      await expect(validateAndUploadTransactions(options)).rejects.toThrow('--who-am-i must be one of');
    });

    test('should accept valid WHO_AM_I values', async () => {
      // Mock fs.access to succeed
      fs.promises.access.mockResolvedValue(undefined);
      
      // Mock parseCSV to return empty array
      jest.spyOn(global, 'Promise').mockImplementation(() => ({
        then: (callback) => {
          callback([]);
          return { catch: jest.fn() };
        }
      }));
      
      for (const user of ALLOWED_USERS) {
        const options = {
          csvFilePath: 'sample-transactions.csv',
          paymentMethod: 'Chase Sapphire',
          notionApiKey: 'test-key',
          notionDatabaseId: 'test-db',
          whoAmI: user,
          dryRun: true
        };
        
        // This should not throw an error related to WHO_AM_I
        await expect(validateAndUploadTransactions(options)).resolves.not.toThrow('--who-am-i must be one of');
      }
    });

    test('should accept WHO_AM_I from environment variable', async () => {
      // Set environment variable
      process.env.WHO_AM_I = 'Alli';
      process.env.NOTION_API_KEY = 'test-key-from-env';
      process.env.NOTION_DATABASE_ID = 'test-db-from-env';
      
      // Mock fs.access to succeed
      fs.promises.access.mockResolvedValue(undefined);
      
      const options = {
        csvFilePath: 'sample-transactions.csv',
        paymentMethod: 'Chase Sapphire',
        dryRun: true
      };
      
      // Mock parseCSV to return empty array
      jest.spyOn(global, 'Promise').mockImplementationOnce(() => ({
        then: (callback) => {
          callback([]);
          return { catch: jest.fn() };
        }
      }));
      
      // This should not throw an error related to WHO_AM_I
      await expect(validateAndUploadTransactions(options)).resolves.not.toThrow('WHO_AM_I is required');
    });
  });

  describe('Payment Method Validation', () => {
    test('should error when payment method is invalid', async () => {
      // Set environment variables
      process.env.NOTION_API_KEY = 'test-key-from-env';
      process.env.NOTION_DATABASE_ID = 'test-db-from-env';
      process.env.WHO_AM_I = 'Alli';
      
      // Mock fs.access to succeed
      fs.promises.access.mockResolvedValue(undefined);
      
      const options = {
        csvFilePath: 'sample-transactions.csv',
        paymentMethod: 'Invalid Payment Method'
      };
      
      await expect(validateAndUploadTransactions(options)).rejects.toThrow('--payment-method must be one of');
    });

    test('should accept valid payment methods', async () => {
      // Set environment variables
      process.env.NOTION_API_KEY = 'test-key-from-env';
      process.env.NOTION_DATABASE_ID = 'test-db-from-env';
      process.env.WHO_AM_I = 'Alli';
      
      // Mock fs.access to succeed
      fs.promises.access.mockResolvedValue(undefined);
      
      // Mock parseCSV to return empty array
      jest.spyOn(global, 'Promise').mockImplementation(() => ({
        then: (callback) => {
          callback([]);
          return { catch: jest.fn() };
        }
      }));
      
      for (const method of ALLOWED_PAYMENT_METHODS) {
        const options = {
          csvFilePath: 'sample-transactions.csv',
          paymentMethod: method,
          dryRun: true
        };
        
        // This should not throw an error related to payment method
        await expect(validateAndUploadTransactions(options)).resolves.not.toThrow('--payment-method must be one of');
      }
    });
  });
});