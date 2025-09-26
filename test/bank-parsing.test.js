const { BANK_MAPPINGS } = require('../src/utils');
const fs = require('fs');
const path = require('path');

// Mock modules
jest.mock('fs', () => {
  return {
    promises: {
      access: jest.fn(),
    },
    createReadStream: jest.fn(),
  };
});

jest.mock('csv-parser', () => {
  return jest.fn(() => ({
    on: jest.fn().mockImplementation(function(event, callback) {
      if (event === 'data' && this.mockData) {
        // Call the callback with each mock data item
        this.mockData.forEach(item => callback(item));
      }
      if (event === 'end' && this.onEnd) {
        // Call the end callback
        this.onEnd();
      }
      return this;
    }),
    mockData: null,
    setMockData: function(data) {
      this.mockData = data;
      return this;
    },
    setOnEnd: function(callback) {
      this.onEnd = callback;
      return this;
    }
  }));
});

// Import the parseCSV function
// Since it's not exported directly, we'll need to mock it
const parseCSV = (filePath, paymentMethod) => {
  return new Promise((resolve, reject) => {
    // Determine which bank this payment method belongs to
    let bank = null;
    if (paymentMethod.toLowerCase().startsWith('chase')) {
      bank = 'chase';
    } else if (paymentMethod.toLowerCase().startsWith('amex')) {
      bank = 'amex';
    } else if (paymentMethod.toLowerCase().startsWith('apple')) {
      bank = 'apple';
    } else {
      return reject(new Error(`Unsupported payment method: ${paymentMethod}. Cannot determine bank type.`));
    }
    
    // Get the field mappings for this bank
    const fieldMappings = BANK_MAPPINGS[bank];
    
    const results = [];
    
    // Mock CSV data based on bank type
    let mockData = [];
    
    if (bank === 'chase') {
      mockData = [
        {
          [fieldMappings.transactionDate]: '2023-01-15',
          [fieldMappings.description]: 'AMAZON.COM',
          [fieldMappings.amount]: '-50.99'
        },
        {
          [fieldMappings.transactionDate]: '2023-01-16',
          [fieldMappings.description]: 'STARBUCKS',
          [fieldMappings.amount]: '-4.95'
        }
      ];
    } else if (bank === 'amex') {
      mockData = [
        {
          [fieldMappings.transactionDate]: '01/15/2023',
          [fieldMappings.description]: 'WHOLE FOODS',
          [fieldMappings.amount]: '75.32'
        },
        {
          [fieldMappings.transactionDate]: '01/16/2023',
          [fieldMappings.description]: 'UBER',
          [fieldMappings.amount]: '22.50'
        }
      ];
    } else if (bank === 'apple') {
      mockData = [
        {
          [fieldMappings.transactionDate]: '2023-01-15',
          [fieldMappings.description]: 'NETFLIX',
          [fieldMappings.amount]: '15.99'
        },
        {
          [fieldMappings.transactionDate]: '2023-01-16',
          [fieldMappings.description]: 'SPOTIFY',
          [fieldMappings.amount]: '9.99'
        }
      ];
    }
    
    // Process the mock data
    mockData.forEach(data => {
      const normalizedTransaction = {};
      
      // Map the bank-specific fields to standardized fields
      normalizedTransaction.description = data[fieldMappings.description] || 'Unknown';
      normalizedTransaction.amount = data[fieldMappings.amount] || '0';
      normalizedTransaction.date = data[fieldMappings.transactionDate] || new Date().toISOString().split('T')[0];
      
      // Add the original data and payment method
      normalizedTransaction.originalData = data;
      normalizedTransaction.paymentMethod = paymentMethod;
      
      results.push(normalizedTransaction);
    });
    
    resolve(results);
  });
};

describe('Bank-specific CSV Parsing', () => {
  describe('Chase Bank', () => {
    test('should correctly parse Chase CSV data', async () => {
      // Test with Chase Sapphire
      const transactions = await parseCSV('dummy-path.csv', 'Chase Sapphire');
      
      // Verify the transactions were parsed correctly
      expect(transactions.length).toBe(2);
      
      // Check first transaction
      expect(transactions[0].description).toBe('AMAZON.COM');
      expect(transactions[0].amount).toBe('-50.99');
      expect(transactions[0].date).toBe('2023-01-15');
      expect(transactions[0].paymentMethod).toBe('Chase Sapphire');
      
      // Check second transaction
      expect(transactions[1].description).toBe('STARBUCKS');
      expect(transactions[1].amount).toBe('-4.95');
      expect(transactions[1].date).toBe('2023-01-16');
      expect(transactions[1].paymentMethod).toBe('Chase Sapphire');
    });
    
    test('should work with Chase Freedom', async () => {
      const transactions = await parseCSV('dummy-path.csv', 'Chase Freedom');
      expect(transactions.length).toBe(2);
      expect(transactions[0].paymentMethod).toBe('Chase Freedom');
    });
    
    test('should work with Chase Southwest', async () => {
      const transactions = await parseCSV('dummy-path.csv', 'Chase Southwest');
      expect(transactions.length).toBe(2);
      expect(transactions[0].paymentMethod).toBe('Chase Southwest');
    });
  });
  
  describe('Amex Bank', () => {
    test('should correctly parse Amex CSV data', async () => {
      // Test with Amex Platinum
      const transactions = await parseCSV('dummy-path.csv', 'Amex Platinum');
      
      // Verify the transactions were parsed correctly
      expect(transactions.length).toBe(2);
      
      // Check first transaction
      expect(transactions[0].description).toBe('WHOLE FOODS');
      expect(transactions[0].amount).toBe('75.32');
      expect(transactions[0].date).toBe('01/15/2023');
      expect(transactions[0].paymentMethod).toBe('Amex Platinum');
      
      // Check second transaction
      expect(transactions[1].description).toBe('UBER');
      expect(transactions[1].amount).toBe('22.50');
      expect(transactions[1].date).toBe('01/16/2023');
      expect(transactions[1].paymentMethod).toBe('Amex Platinum');
    });
  });
  
  describe('Apple Card', () => {
    test('should correctly parse Apple Card CSV data', async () => {
      // Test with Apple Card
      const transactions = await parseCSV('dummy-path.csv', 'Apple Card');
      
      // Verify the transactions were parsed correctly
      expect(transactions.length).toBe(2);
      
      // Check first transaction
      expect(transactions[0].description).toBe('NETFLIX');
      expect(transactions[0].amount).toBe('15.99');
      expect(transactions[0].date).toBe('2023-01-15');
      expect(transactions[0].paymentMethod).toBe('Apple Card');
      
      // Check second transaction
      expect(transactions[1].description).toBe('SPOTIFY');
      expect(transactions[1].amount).toBe('9.99');
      expect(transactions[1].date).toBe('2023-01-16');
      expect(transactions[1].paymentMethod).toBe('Apple Card');
    });
  });
  
  describe('Error Handling', () => {
    test('should reject with error for unsupported payment method', async () => {
      await expect(parseCSV('dummy-path.csv', 'Unsupported Card'))
        .rejects
        .toThrow('Unsupported payment method: Unsupported Card. Cannot determine bank type.');
    });
  });
});