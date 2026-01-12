import axios from 'axios';
import { config } from '../config';
import { logger } from '../utils/logger';

export interface OAuthTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  x_refresh_token_expires_in: number;
  token_type: string;
}

/**
 * Generate OAuth authorization URL
 */
export function getAuthorizationUrl(state?: string): string {
  const params = new URLSearchParams({
    client_id: config.quickbooks.clientId,
    redirect_uri: config.quickbooks.redirectUri,
    response_type: 'code',
    scope: 'com.intuit.quickbooks.accounting',
    state: state || 'default'
  });

  return `${config.quickbooks.authUrl}?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(
  code: string,
  realmId: string
): Promise<OAuthTokenResponse> {
  logger.info(`Exchanging authorization code for tokens (realm: ${realmId})`);

  try {
    const response = await axios.post<OAuthTokenResponse>(
      config.quickbooks.tokenUrl,
      new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: config.quickbooks.redirectUri
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${getBasicAuthHeader()}`
        }
      }
    );

    logger.info('Successfully exchanged code for tokens');
    return response.data;
  } catch (error: any) {
    logger.error('Failed to exchange code for tokens:', error.response?.data || error.message);
    throw new Error(`OAuth token exchange failed: ${error.response?.data?.error || error.message}`);
  }
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(refreshToken: string): Promise<OAuthTokenResponse> {
  logger.debug('Refreshing access token');

  try {
    const response = await axios.post<OAuthTokenResponse>(
      config.quickbooks.tokenUrl,
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${getBasicAuthHeader()}`
        }
      }
    );

    logger.info('Successfully refreshed access token');
    return response.data;
  } catch (error: any) {
    logger.error('Failed to refresh access token:', error.response?.data || error.message);
    throw new Error(`Token refresh failed: ${error.response?.data?.error || error.message}`);
  }
}

/**
 * Revoke tokens (disconnect)
 */
export async function revokeToken(token: string): Promise<void> {
  logger.info('Revoking token');

  try {
    await axios.post(
      'https://developer.api.intuit.com/v2/oauth2/tokens/revoke',
      new URLSearchParams({
        token: token
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${getBasicAuthHeader()}`
        }
      }
    );

    logger.info('Token revoked successfully');
  } catch (error: any) {
    logger.error('Failed to revoke token:', error.response?.data || error.message);
    throw new Error(`Token revocation failed: ${error.message}`);
  }
}

/**
 * Generate Basic Auth header for OAuth requests
 */
function getBasicAuthHeader(): string {
  const credentials = `${config.quickbooks.clientId}:${config.quickbooks.clientSecret}`;
  return Buffer.from(credentials).toString('base64');
}
