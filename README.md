# Transactions to Notion Uploader

A CLI tool to upload transaction data from CSV files to Notion databases.

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/transactions-to-notion-uploader.git
cd transactions-to-notion-uploader

# Install dependencies
yarn install

# Make the CLI executable
chmod +x src/index.js

# Optional: Install globally
npm link
```

## Configuration

You can configure the tool using environment variables or command-line options:

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Edit the `.env` file and add your Notion API key and database ID:
   ```
   NOTION_API_KEY=your_notion_api_key_here
   NOTION_DATABASE_ID=your_notion_database_id_here
   ```

## Usage

```bash
# Basic usage with required arguments
transactions-to-notion --csv-file-path ./path/to/transactions.csv --payment-method "Credit Card"

# Using all options
transactions-to-notion \
  --csv-file-path ./path/to/transactions.csv \
  --payment-method "Credit Card" \
  --notion-database-id your_database_id \
  --notion-api-key your_api_key \
  --dry-run
```

### Required Arguments

- `--csv-file-path`: Path to the CSV file containing transaction data
- `--payment-method`: Payment method to filter transactions by

### Optional Arguments

- `--notion-database-id`: Notion database ID (can also be set via NOTION_DATABASE_ID env var)
- `--notion-api-key`: Notion API key (can also be set via NOTION_API_KEY env var)
- `--dry-run`: Show transactions that would be uploaded without actually uploading them

## CSV Format

The tool expects a CSV file with at least the following columns:
- `Description` or `description`: Transaction description
- `Amount` or `amount`: Transaction amount
- `Date` or `date`: Transaction date
- `Payment Method` or `payment_method` or `paymentMethod`: Payment method

Example CSV:
```
Date,Description,Amount,Payment Method
2023-01-15,Grocery Store,45.67,Credit Card
2023-01-16,Gas Station,30.00,Debit Card
2023-01-17,Online Shopping,120.50,Credit Card
```

## Notion Database Structure

Your Notion database should have the following properties:
- `Name` (title): Transaction description
- `Amount` (number): Transaction amount
- `Date` (date): Transaction date
- `Payment Method` (select): Payment method

## License

MIT