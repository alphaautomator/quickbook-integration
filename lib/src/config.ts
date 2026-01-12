import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from root .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  quickbooks: {
    clientId: process.env.QB_CLIENT_ID || '',
    clientSecret: process.env.QB_CLIENT_SECRET || '',
    redirectUri: process.env.QB_REDIRECT_URI || 'https://developer.intuit.com/v2/OAuth2Playground/RedirectUrl',
    environment: process.env.QB_ENVIRONMENT || 'sandbox',
    baseUrl: process.env.QB_ENVIRONMENT === 'production'
      ? 'https://quickbooks.api.intuit.com'
      : 'https://sandbox-quickbooks.api.intuit.com',
    authUrl: process.env.QB_ENVIRONMENT === 'production'
      ? 'https://appcenter.intuit.com/connect/oauth2'
      : 'https://appcenter.intuit.com/connect/oauth2',
    tokenUrl: 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
    maxResults: parseInt(process.env.QB_MAX_RESULTS || '1000', 10)
  },
  database: {
    path: process.env.DATABASE_PATH || './quickbooks.db'
  },
  sync: {
    intervalMinutes: parseInt(process.env.SYNC_INTERVAL_MINUTES || '5', 10)
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info'
  }
};

// Validate required config
export function validateConfig() {
  const errors: string[] = [];

  if (!config.quickbooks.clientId) {
    errors.push('QB_CLIENT_ID is required');
  }
  if (!config.quickbooks.clientSecret) {
    errors.push('QB_CLIENT_SECRET is required');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }
}
