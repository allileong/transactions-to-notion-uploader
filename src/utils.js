const fs = require('fs').promises;
const { createReadStream } = require('fs');
const csv = require('csv-parser');
const { Client } = require('@notionhq/client');

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

// Main function to validate inputs and upload transactions to Notion
async function validateAndUploadTransactions(options) {
  console.log('just entered MAIN')
  try {
    // Validate CSV file path
    const csvFilePath = options.csvFilePath;
    try {
      await fs.access(csvFilePath);
    } catch (error) {
      throw new Error(`CSV file not found at path: ${csvFilePath}`);
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
      throw new Error('Notion API key is required. Provide it via --notion-api-key option or NOTION_API_KEY env var.');
    }

    // Validate Notion database ID
    if (!notionDatabaseId) {
      throw new Error('Notion database ID is required. Provide it via --notion-database-id option or NOTION_DATABASE_ID env var.');
    }
    
    // Validate whoAmI
    if (!whoAmI) {
      throw new Error('WHO_AM_I is required. Provide it via --who-am-i option or WHO_AM_I env var.');
    }
    
    if (!ALLOWED_USERS.includes(whoAmI)) {
      throw new Error(`--who-am-i must be one of: ${ALLOWED_USERS.join(', ')}`);
    }

    if (!ALLOWED_PAYMENT_METHODS.includes(options.paymentMethod)) {
      throw new Error(`--payment-method must be one of: ${ALLOWED_PAYMENT_METHODS.join(', ')}`);
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
    throw error;
  }
}

// Export constants and functions for testing
module.exports = {
  ALLOWED_PAYMENT_METHODS,
  ALLOWED_USERS,
  BANK_MAPPINGS,
  parseCSV,
  uploadToNotion,
  formatDateToISO,
  validateAndUploadTransactions
};