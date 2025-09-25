#!/usr/bin/env node

const { Command } = require('commander');
const fs = require('fs').promises;
const path = require('path');
const csv = require('csv-parser');
const { createReadStream } = require('fs');
const dotenv = require('dotenv');
const { Client } = require('@notionhq/client');

// Load environment variables
dotenv.config();

// Constants
const ALLOWED_PAYMENT_METHODS = ['Amex Platinum', 'Apple Card', 'Chase Freedom', 'Chase Sapphire', 'Chase Southwest'];
const ALLOWED_USERS = ['Alli', 'Justin'];

// Bank-specific CSV field mappings
const BANK_MAPPINGS = {
  chase: {
    transactionDate: 'Transaction Date',
    description: 'Description',
    category: 'Category',
    amount: 'Amount'
  },
  amex: {
    // Amex-specific field mappings
    transactionDate: 'Date',
    description: 'Description',
    amount: 'Amount',
    // Add other Amex fields as needed
  },
  apple: {
    // Apple Card-specific field mappings
    transactionDate: 'Transaction Date',
    description: 'Merchant',
    amount: 'Amount (USD)',
    category: 'Category',
    // Add other Apple Card fields as needed
  }
};


// Only run the main code if this file is being run directly
if (require.main === module) {
  const program = new Command();

  program
    .name('transactions-to-notion')
    .description('Upload transactions from a CSV file to Notion')
    .version('1.0.0')
    .requiredOption('--csv-file-path <path>', 'Path to the CSV file containing transactions')
    .requiredOption('--payment-method <method>', `Payment method to filter transactions (one of: ${ALLOWED_PAYMENT_METHODS.join(', ')})`)
    .option('--notion-database-id <id>', 'Notion database ID (can also be set via NOTION_DATABASE_ID env var)')
    .option('--notion-api-key <key>', 'Notion API key (can also be set via NOTION_API_KEY env var)')
    .option('--who-am-i <name>', `Specify user identity (one of: ${ALLOWED_USERS.join(', ')})`)
    .option('--dry-run', 'Show transactions that would be uploaded without actually uploading them')
    .parse(process.argv);

  const options = program.opts();

  // Main function
  async function main() {
    try {
      // Validate CSV file path
      const csvFilePath = options.csvFilePath;
      try {
        await fs.access(csvFilePath);
      } catch (error) {
        console.error(`Error: CSV file not found at path: ${csvFilePath}`);
        process.exit(1);
      }

      // Get Notion API key and database ID
      const notionApiKey = options.notionApiKey || process.env.NOTION_API_KEY;
      const notionDatabaseId = options.notionDatabaseId || process.env.NOTION_DATABASE_ID;
      
      // Validate who-am-i option if provided
      if (options.whoAmI && !ALLOWED_USERS.includes(options.whoAmI)) {
        console.error(`Error: --who-am-i must be one of: ${ALLOWED_USERS.join(', ')}`);
        process.exit(1);
      }

      if (!notionApiKey) {
        console.error('Error: Notion API key is required. Provide it via --notion-api-key option or NOTION_API_KEY env var.');
        process.exit(1);
      }

      if (!notionDatabaseId) {
        console.error('Error: Notion database ID is required. Provide it via --notion-database-id option or NOTION_DATABASE_ID env var.');
        process.exit(1);
      }

      // Initialize Notion client
      const notion = new Client({ auth: notionApiKey });

      // Parse CSV and filter by payment method
      const transactions = await parseCSV(csvFilePath, options.paymentMethod);
      
      if (transactions.length === 0) {
        console.log(`No transactions found with payment method: ${options.paymentMethod}`);
        process.exit(0);
      }
      
      console.log(`Found ${transactions.length} transactions with payment method: ${options.paymentMethod}`);
      
      // Upload transactions to Notion (unless dry run)
      if (options.dryRun) {
        console.log('DRY RUN: The following transactions would be uploaded:');
        transactions.forEach((transaction, index) => {
          console.log(`${index + 1}. ${transaction.description || 'Unknown'} - ${transaction.amount || '0'}`);
        });
      } else {
        await uploadToNotion(notion, notionDatabaseId, transactions);
        console.log('Successfully uploaded transactions to Notion!');
      }
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  }

  // Parse CSV file based on payment method
  function parseCSV(filePath, paymentMethod) {
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
      
      console.log(`Using ${bank} field mappings for payment method: ${paymentMethod}`);
      
      const results = [];
      
      createReadStream(filePath)
        .pipe(csv())
        .on('data', (data) => {
          // Normalize the transaction data using the bank-specific field mappings
          const normalizedTransaction = {};
          
          // Map the bank-specific fields to standardized fields
          normalizedTransaction.description = data[fieldMappings.description] || 'Unknown';
          normalizedTransaction.amount = data[fieldMappings.amount] || '0';
          normalizedTransaction.date = data[fieldMappings.transactionDate] || new Date().toISOString().split('T')[0];
          
          // Add any other fields that might be useful
          if (fieldMappings.category) {
            normalizedTransaction.category = data[fieldMappings.category];
          }
          
          // Add the original data and payment method
          normalizedTransaction.originalData = data;
          normalizedTransaction.paymentMethod = paymentMethod;
          
          results.push(normalizedTransaction);
        })
        .on('end', () => {
          resolve(results);
        })
        .on('error', (error) => {
          reject(error);
        });
    });
  }

  // Upload transactions to Notion database
  async function uploadToNotion(notionClient, databaseId, transactions) {
    console.log('Uploading transactions to Notion...');
    
    for (const transaction of transactions) {
      try {
        // Use the normalized transaction data
        await notionClient.pages.create({
          parent: {
            database_id: databaseId,
          },
          properties: {
            // These are example mappings - adjust according to your actual Notion database structure
            'Name': {
              title: [
                {
                  text: {
                    content: transaction.description || 'Unknown Transaction'
                  }
                }
              ]
            },
            'Amount': {
              number: parseFloat(transaction.amount || 0)
            },
            'Date': {
              date: {
                start: transaction.date || new Date().toISOString().split('T')[0]
              }
            },
            'Payment Method': {
              select: {
                name: transaction.paymentMethod
              }
            },
            // Add category if available
            ...(transaction.category && {
              'Category': {
                select: {
                  name: transaction.category
                }
              }
            }),
            // End of properties
          }
        });
        
        console.log(`Uploaded transaction: ${transaction.description || 'Unknown'}`);
      } catch (error) {
        console.error(`Failed to upload transaction: ${error.message}`);
        // Continue with the next transaction
      }
    }
  }

  // Run the main function
  main();
}

// Export constants for testing
module.exports = {
  ALLOWED_PAYMENT_METHODS,
  ALLOWED_USERS,
  BANK_MAPPINGS
};
