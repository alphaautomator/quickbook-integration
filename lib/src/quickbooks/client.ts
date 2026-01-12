import axios, { AxiosResponse } from 'axios';
import { config } from '../config';
import { tokenRepository } from '../database/repositories/token.repository';
import { refreshAccessToken } from './oauth';
import { logger } from '../utils/logger';

/**
 * QuickBooks API Client with automatic token refresh
 * 
 * This client handles all authentication automatically:
 * - Fetches valid tokens from database
 * - Automatically refreshes expired tokens
 * - Persists new refresh tokens (QuickBooks rotates them)
 * 
 * Usage:
 * ```typescript
 * const qb = new QuickBooks(realmId);
 * const customers = await qb.query('SELECT * FROM Customer');
 * ```
 */
export class QuickBooks {
  private realmId: string;
  private baseUrl: string;

  constructor(realmId: string) {
    this.realmId = realmId;
    this.baseUrl = `${config.quickbooks.baseUrl}/v3/company/${realmId}`;
  }

  /**
   * Get a valid access token, automatically refreshing if expired
   */
  private async getValidToken(): Promise<string> {
    const tokenData = await tokenRepository.findByRealmId(this.realmId);

    if (!tokenData) {
      throw new Error(
        `No tokens found for realm ${this.realmId}. Please authorize the app first.`
      );
    }

    // Check if token is expired (with 5 minute buffer)
    const bufferMs = 5 * 60 * 1000; // 5 minutes
    const isExpired = Date.now() >= (tokenData.expiresAt - bufferMs);

    if (isExpired) {
      logger.info(`Access token expired for realm ${this.realmId}, refreshing...`);

      try {
        const refreshed = await refreshAccessToken(tokenData.refreshToken);

        // CRITICAL: Save new refresh_token (QuickBooks rotates it)
        await tokenRepository.update(this.realmId, {
          accessToken: refreshed.access_token,
          refreshToken: refreshed.refresh_token,
          expiresAt: Date.now() + refreshed.expires_in * 1000
        });

        logger.info(`Token refreshed successfully for realm ${this.realmId}`);
        return refreshed.access_token;
      } catch (error: any) {
        logger.error(`Token refresh failed for realm ${this.realmId}:`, error.message);
        throw new Error(
          `Token refresh failed. Please re-authorize the app. Error: ${error.message}`
        );
      }
    }

    return tokenData.accessToken;
  }

  /**
   * Make authenticated GET request to QuickBooks API
   */
  async get<T = any>(endpoint: string, params?: Record<string, any>): Promise<T> {
    const token = await this.getValidToken();

    try {
      const response: AxiosResponse<T> = await axios.get(`${this.baseUrl}${endpoint}`, {
        params,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });

      return response.data;
    } catch (error: any) {
      this.handleApiError(error, 'GET', endpoint);
      throw error;
    }
  }

  /**
   * Make authenticated POST request to QuickBooks API
   */
  async post<T = any>(endpoint: string, body: any): Promise<T> {
    const token = await this.getValidToken();

    try {
      const response: AxiosResponse<T> = await axios.post(
        `${this.baseUrl}${endpoint}`,
        body,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error: any) {
      this.handleApiError(error, 'POST', endpoint);
      throw error;
    }
  }

  /**
   * Execute a QuickBooks SQL-like query
   * 
   * @example
   * ```typescript
   * // Get all customers
   * await qb.query('SELECT * FROM Customer');
   * 
   * // Get customers updated after a timestamp
   * await qb.query("SELECT * FROM Customer WHERE Metadata.LastUpdatedTime > '2024-01-01'");
   * ```
   */
  async query<T = any>(queryString: string): Promise<T> {
    logger.debug(`Executing query: ${queryString}`);

    return this.get<T>('/query', { query: queryString });
  }

  /**
   * Get entity by ID
   */
  async getById<T = any>(entityType: string, id: string): Promise<T> {
    logger.debug(`Fetching ${entityType} with ID: ${id}`);

    return this.get<T>(`/${entityType}/${id}`);
  }

  /**
   * Create a new entity
   */
  async create<T = any>(entityType: string, data: any): Promise<T> {
    logger.debug(`Creating ${entityType}`);

    return this.post<T>(`/${entityType}`, data);
  }

  /**
   * Update an existing entity
   */
  async update<T = any>(entityType: string, data: any): Promise<T> {
    logger.debug(`Updating ${entityType} with ID: ${data.Id}`);

    return this.post<T>(`/${entityType}`, data);
  }

  /**
   * Delete an entity (QuickBooks uses POST for deletes)
   */
  async delete<T = any>(entityType: string, id: string, syncToken: string): Promise<T> {
    logger.debug(`Deleting ${entityType} with ID: ${id}`);

    return this.post<T>(`/${entityType}?operation=delete`, {
      Id: id,
      SyncToken: syncToken
    });
  }

  /**
   * Get company info
   */
  async getCompanyInfo(): Promise<any> {
    return this.get('/companyinfo/' + this.realmId);
  }

  /**
   * Handle API errors with detailed logging
   */
  private handleApiError(error: any, method: string, endpoint: string): void {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;

      logger.error(
        `QuickBooks API Error [${method} ${endpoint}]:`,
        `Status: ${status},`,
        `Error: ${JSON.stringify(data)}`
      );

      // Handle specific error cases
      if (status === 401) {
        logger.error('Authentication failed. Token may be invalid or expired.');
      } else if (status === 429) {
        logger.error('Rate limit exceeded. Please slow down API requests.');
      } else if (status === 400) {
        logger.error('Bad request. Check request parameters:', data);
      }
    } else if (error.request) {
      logger.error(`QuickBooks API request failed [${method} ${endpoint}]:`, 'No response received');
    } else {
      logger.error(`QuickBooks API error [${method} ${endpoint}]:`, error.message);
    }
  }

  /**
   * Get the realm ID for this client
   */
  getRealmId(): string {
    return this.realmId;
  }
}
