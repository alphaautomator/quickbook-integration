#!/usr/bin/env ts-node

import {
  config,
  validateConfig,
  initializeDatabase,
  tokenRepository,
  exchangeCodeForTokens,
  logger
} from '../lib/src/index';

/**
 * Bootstrap script to exchange authorization code for tokens
 * 
 * Usage:
 * 1. Get authorization code from QuickBooks OAuth Playground
 * 2. Add to .env:
 *    QB_AUTHORIZATION_CODE=your_code
 *    QB_REALM_ID=your_realm_id
 * 3. Run: npm run bootstrap
 */

async function bootstrap() {
  logger.info('==========================================================');
  logger.info('QuickBooks Bootstrap');
  logger.info('==========================================================');

  try {
    // Validate config
    validateConfig();
    logger.info('Configuration validated');

    // Check for authorization code and realm ID
    const authCode = process.env.QB_AUTHORIZATION_CODE;
    const realmId = process.env.QB_REALM_ID;

    if (!authCode || !realmId) {
      logger.error('Missing required environment variables');
      logger.error('Please add to your .env file:');
      logger.error('  QB_AUTHORIZATION_CODE=your_authorization_code');
      logger.error('  QB_REALM_ID=your_realm_id');
      logger.error('');
      logger.error('Get these from QuickBooks OAuth Playground:');
      logger.error('  https://developer.intuit.com/app/developer/playground');
      process.exit(1);
    }

    // Initialize database
    initializeDatabase();
    logger.info('Database initialized');

    // Check if already authorized
    const existingTokens = tokenRepository.findByRealmId(realmId);
    if (existingTokens) {
      logger.warn(`Tokens already exist for realm: ${realmId}`);
      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const answer = await new Promise<string>((resolve) => {
        readline.question('Overwrite existing tokens? (yes/no): ', resolve);
      });
      readline.close();

      if (answer.toLowerCase() !== 'yes') {
        logger.info('Bootstrap cancelled');
        process.exit(0);
      }
    }

    logger.info('Exchanging authorization code for tokens...');

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(authCode, realmId);

    // Save tokens to database
    tokenRepository.save({
      realmId: realmId,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + tokens.expires_in * 1000
    });

    logger.info('Bootstrap successful');
    logger.info(`Tokens saved for realm: ${realmId}`);
    logger.info(`Access token expires in: ${Math.floor(tokens.expires_in / 60)} minutes`);
    logger.info('');
    logger.info('Next steps:');
    logger.info('  1. Remove QB_AUTHORIZATION_CODE from .env (it can only be used once)');
    logger.info('  2. Start the sync service: npm run dev:sync');

  } catch (error: any) {
    logger.error('Bootstrap failed:', error.message);
    
    if (error.message.includes('Token exchange failed')) {
      logger.error('Common issues:');
      logger.error('  - Authorization code already used (get a new one)');
      logger.error('  - Code expired (they expire after 10 minutes)');
      logger.error('  - Wrong QB_CLIENT_ID or QB_CLIENT_SECRET');
      logger.error('  - QB_REDIRECT_URI does not match the one used to get the code');
    }
    
    process.exit(1);
  }
}

// Run bootstrap
bootstrap();
