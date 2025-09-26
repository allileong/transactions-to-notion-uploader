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
    // Add other Apple Card fields as needed
  }
};

// Main function
async function main(options) {
  console.log('just entered MAIN')
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

    console.log('DEBUG START')
    console.log( {notionApiKey, notionDatabaseId})
    console.log('DEBUG END')
    
    // Get whoAmI value
    const whoAmI = options.whoAmI || process.env.WHO_AM_I;
    
    // Validate Notion API key
    if (!notionApiKey) {
      console.error('Error: Notion API key is required. Provide it via --notion-api-key option or NOTION_API_KEY env var.');
      process.exit(1);
    }

    // Validate Notion database ID
    if (!notionDatabaseId) {
      console.error('Error: Notion database ID is required. Provide it via --notion-database-id option or NOTION_DATABASE_ID env var.');
      process.exit(1);
    }
    
    // Validate whoAmI
    if (!whoAmI) {
      console.error('Error: WHO_AM_I is required. Provide it via --who-am-i option or WHO_AM_I env var.');
      process.exit(1);
    }
    
    if (!ALLOWED_USERS.includes(whoAmI)) {
      console.error(`Error: --who-am-i must be one of: ${ALLOWED_USERS.join(', ')}`);
      process.exit(1);
    }

    if (!ALLOWED_PAYMENT_METHODS.includes(options.paymentMethod)) {
      console.error(`Error: --payment-method must be one of: ${ALLOWED_PAYMENT_METHODS.join(', ')}`);
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
      console.log('🔍 DRY RUN: The following transactions would be uploaded:');
      console.log('------------------------------------------------');
      transactions.forEach((transaction, index) => {
        console.log(`${index + 1}. 📝 ${transaction.description || 'Unknown'} | 💰 $${Math.abs(parseFloat(transaction.amount || 0)).toFixed(2)} | 📅 ${transaction.date || 'No date'}`);
      });
      console.log('------------------------------------------------');
      console.log(`📊 Total: ${transactions.length} transactions`);
    } else {
      await uploadToNotion(notion, notionDatabaseId, transactions, whoAmI);
      console.log(`\n🎉 Successfully uploaded ${transactions.length} transactions to Notion! 🎉`);
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
        
        // Add the original data and payment method
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
async function uploadToNotion(notionClient, databaseId, transactions, whoAmI) {
  console.log('Uploading transactions to Notion...');
  
  // Format the whoAmI prefix
  const whoAmIPrefix = `${whoAmI}'s `;
  
  for (const transaction of transactions) {
    try {
      // Use the normalized transaction data
      await notionClient.pages.create({
        parent: {
          database_id: databaseId,
        },
        properties: {
          // Transaction Date -> Date (ensure ISO format)
          'Date': {
            date: {
              start: formatDateToISO(transaction.date) || new Date().toISOString().split('T')[0],
            },
          },
          // Description -> Expense
          'Expense': {
            title: [
              {
                text: {
                  content: transaction.description || 'Unknown Transaction',
                },
              },
            ],
          },
          // Amount -> Total Amount (always positive)
          'Total Amount': {
            number: Math.abs(parseFloat(transaction.amount || 0)), // Ensure positive value
          },
          // Status field set to "Requires Audit" for all imported records
          'Status': {
            select: {
              name: 'Requires Audit',
            },
          },
          // Payment Method field - concatenate whoAmI with payment method
          'Payment Method': {
            select: {
              name: `${whoAmIPrefix}${transaction.paymentMethod || 'Unknown Card'}`,
            },
          },
        }
      });
      
      // Print transaction details in a visually pleasing way with emojis
      console.log(`✅ Uploaded: 💰 ${Math.abs(parseFloat(transaction.amount || 0)).toFixed(2)} | 📝 ${transaction.description || 'Unknown'} | 📅 ${transaction.date || 'No date'} | 💳 ${whoAmIPrefix}${transaction.paymentMethod}`);
    } catch (error) {
      console.error(`Failed to upload transaction: ${error.message}`);
      // Continue with the next transaction
    }
  }
}

// Format date string to ISO format (YYYY-MM-DD)
function formatDateToISO(dateString) {
  if (!dateString) return null;
    
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      throw new Error(`Invalid date: ${dateString}`);
    }
    return date.toISOString().split('T')[0]; // Return YYYY-MM-DD format
  } catch (error) {
    console.warn(`Date parsing error for "${dateString}":`, error.message);
    return null;
  }
}

(async () => {
  console.log('IN THE FILE')
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

  // Use the parseCSV and uploadToNotion functions defined outside the main function

  // Run the main function
  main(program.opts());
})();

// Export constants and functions for testing
module.exports = {
  ALLOWED_PAYMENT_METHODS,
  ALLOWED_USERS,
  BANK_MAPPINGS,
  parseCSV,
  uploadToNotion,
  formatDateToISO
};
