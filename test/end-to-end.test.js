const path = require('path');
const { BANK_MAPPINGS } = require('../src/index');

// Mock the fs module
jest.mock('fs', () => {
  const originalModule = jest.requireActual('fs');
  return {
    ...originalModule,
    promises: {
      access: jest.fn().mockResolvedValue(undefined),
    },
    createReadStream: jest.fn(),
  };
});

// Get the mocked fs module
const fs = require('fs');

// Mock csv-parser
jest.mock('csv-parser', () => jest.fn());
const csvParser = require('csv-parser');

// Mock dotenv
jest.mock('dotenv', () => ({
  config: jest.fn(),
}));

// Mock Notion client
const mockNotionCreate = jest.fn().mockResolvedValue({ id: 'mock-page-id' });
jest.mock('@notionhq/client', () => ({
  Client: jest.fn().mockImplementation(() => ({
    pages: {
      create: mockNotionCreate,
    },
  })),
}));

// Get the mocked Notion client
const { Client } = require('@notionhq/client');

describe('End-to-End Tests', () => {
  // Reset environment variables before each test
  const originalEnv = process.env;
  
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Reset environment variables
    process.env = { ...originalEnv };
    delete process.env.NOTION_API_KEY;
    delete process.env.NOTION_DATABASE_ID;
    delete process.env.WHO_AM_I;
    
    // Mock fs.access to succeed by default
    fs.promises.access.mockResolvedValue(undefined);
  });

  afterEach(() => {
    // Restore environment variables
    process.env = originalEnv;
  });

  describe('Chase Bank CSV Processing', () => {
    test('should correctly process Chase Bank CSV and send to Notion API with correct parameters', async () => {
      // Set up mock Chase Bank CSV data
      const mockChaseData = [
        {
          'Transaction Date': '2023-01-15',
          'Description': 'AMAZON.COM',
          'Category': 'Shopping',
          'Amount': '-50.99'
        },
        {
          'Transaction Date': '2023-01-16',
          'Description': 'STARBUCKS',
          'Category': 'Food & Drink',
          'Amount': '-4.95'
        },
        {
          'Transaction Date': '2023-01-17',
          'Description': 'NETFLIX',
          'Category': 'Entertainment',
          'Amount': '-15.99'
        }
      ];

      // Create a mock for the CSV parser result
      const csvParserResult = {
        on: jest.fn().mockImplementation(function(event, callback) {
          // Store the callbacks
          if (event === 'data') {
            this.dataCallback = callback;
          } else if (event === 'end') {
            this.endCallback = callback;
          } else if (event === 'error') {
            this.errorCallback = callback;
          }
          return this;
        }),
        // Method to trigger the callbacks
        triggerCallbacks: function() {
          // Call data callback for each mock data item
          if (this.dataCallback) {
            mockChaseData.forEach(item => this.dataCallback(item));
          }
          // Call end callback
          if (this.endCallback) {
            this.endCallback();
          }
        }
      };
      
      // Set up the CSV parser mock
      csvParser.mockReturnValue(csvParserResult);
      
      // Mock the createReadStream to return a mock with pipe method
      const mockStream = {
        pipe: jest.fn().mockReturnValue(csvParserResult)
      };
      fs.createReadStream.mockReturnValue(mockStream);

      // Set environment variables
      process.env.NOTION_API_KEY = 'test-api-key';
      process.env.NOTION_DATABASE_ID = 'test-database-id';
      process.env.WHO_AM_I = 'Alli';
      
      // Import the functions we need to test
      // We need to import these after setting up the mocks
      const { parseCSV, uploadToNotion } = require('../src/index');
      
      // Create a promise to handle the async parseCSV function
      const parsePromise = parseCSV('sample-transactions.csv', 'Chase Freedom');
      
      // Trigger the callbacks to simulate CSV processing
      csvParserResult.triggerCallbacks();
      
      // Wait for the parseCSV promise to resolve
      const transactions = await parsePromise;
      
      // Upload the transactions to Notion
      await uploadToNotion(new Client(), process.env.NOTION_DATABASE_ID, transactions, 'Alli');
      
      // Verify that the Notion API was called with the correct data
      expect(mockNotionCreate).toHaveBeenCalledTimes(3);
      
      // Check the first transaction
      const firstCall = mockNotionCreate.mock.calls[0][0];
      expect(firstCall).toHaveProperty('parent.database_id', 'test-database-id');
      expect(firstCall).toHaveProperty('properties.Date.date.start', '2023-01-15');
      expect(firstCall).toHaveProperty('properties.Expense.title[0].text.content', 'AMAZON.COM');
      expect(firstCall).toHaveProperty('properties.Total Amount.number', 50.99);
      expect(firstCall).toHaveProperty('properties.Status.select.name', 'Processing Audit');
      expect(firstCall).toHaveProperty('properties.Payment Method.select.name', 'Alli\'s Chase Freedom');
      expect(firstCall).toHaveProperty('properties.Category.select.name', 'Shopping');
      
      // Check the second transaction
      const secondCall = mockNotionCreate.mock.calls[1][0];
      expect(secondCall).toHaveProperty('parent.database_id', 'test-database-id');
      expect(secondCall).toHaveProperty('properties.Date.date.start', '2023-01-16');
      expect(secondCall).toHaveProperty('properties.Expense.title[0].text.content', 'STARBUCKS');
      expect(secondCall).toHaveProperty('properties.Total Amount.number', 4.95);
      expect(secondCall).toHaveProperty('properties.Status.select.name', 'Processing Audit');
      expect(secondCall).toHaveProperty('properties.Payment Method.select.name', 'Alli\'s Chase Freedom');
      expect(secondCall).toHaveProperty('properties.Category.select.name', 'Food & Drink');
      
      // Check the third transaction
      const thirdCall = mockNotionCreate.mock.calls[2][0];
      expect(thirdCall).toHaveProperty('parent.database_id', 'test-database-id');
      expect(thirdCall).toHaveProperty('properties.Date.date.start', '2023-01-17');
      expect(thirdCall).toHaveProperty('properties.Expense.title[0].text.content', 'NETFLIX');
      expect(thirdCall).toHaveProperty('properties.Total Amount.number', 15.99);
      expect(thirdCall).toHaveProperty('properties.Status.select.name', 'Processing Audit');
      expect(thirdCall).toHaveProperty('properties.Payment Method.select.name', 'Alli\'s Chase Freedom');
      expect(thirdCall).toHaveProperty('properties.Category.select.name', 'Entertainment');
    });
  });
});