#!/usr/bin/env node

const { Command } = require('commander');
const dotenv = require('dotenv');

// Import helper functions and constants from utils.js
const {
  ALLOWED_PAYMENT_METHODS,
  ALLOWED_USERS,
  parseCSV,
  uploadToNotion,
  validateAndUploadTransactions
} = require('./utils');

// Load environment variables
dotenv.config();

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

  // Run the main function
  try {
    validateAndUploadTransactions(program.opts());
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
})();
