/**
 * @file GeneralAPIUtils.ts
 * @description General API utility functions for workflow-related requests.
 *
 * This file provides utility functions for making API calls to the workflow backend.
 * It replaces the deprecated StageGeneralFunction.ts
 *
 * @author Hu Silan
 * @project Easy-notebook
 */

import { Backend_BASE_URL } from '../../../../config/base_url';

/**
 * API endpoints
 */
export const API_ENDPOINTS = {
  GENERATE: `${Backend_BASE_URL}/v1/generate`,
};

/**
 * Generic helper to call backend generation endpoints.
 *
 * @param issue - Identifier of the task/issue (e.g., 'generate_question_choice_map')
 * @param context - Extra context object to send to backend
 * @param locale - Optional locale string (kept for backward compatibility)
 * @returns Promise resolving to the API response
 *
 * @example
 * ```typescript
 * const result = await generalResponse('generate_question_choice_map', {
 *   column_info: columns,
 *   dataset_info: metadata
 * });
 * ```
 */
export const generalResponse = async (
  issue: string,
  context: Record<string, unknown>,
  locale?: string
): Promise<any> => {
  try {
    console.log(`[GeneralAPIUtils] Calling ${issue} with context:`, context);

    const response = await fetch(API_ENDPOINTS.GENERATE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ issue, context, locale }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({
        error: `HTTP ${response.status}: ${response.statusText}`,
      }));
      console.error('[GeneralAPIUtils] API error:', errorData);
      throw new Error(`API error: ${response.status} - ${JSON.stringify(errorData)}`);
    }

    const result = await response.json();
    console.log(`[GeneralAPIUtils] ${issue} response received:`, result);

    return result;
  } catch (error) {
    console.error('[GeneralAPIUtils] Request failed:', error);
    throw error;
  }
};

/**
 * Make a generic POST request to any workflow API endpoint
 *
 * @param endpoint - The API endpoint URL
 * @param data - Data to send in the request body
 * @returns Promise resolving to the API response
 */
export const makeAPIRequest = async (
  endpoint: string,
  data: Record<string, unknown>
): Promise<any> => {
  try {
    console.log(`[GeneralAPIUtils] POST to ${endpoint}:`, data);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({
        error: `HTTP ${response.status}: ${response.statusText}`,
      }));
      console.error('[GeneralAPIUtils] API error:', errorData);
      throw new Error(`API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('[GeneralAPIUtils] Request failed:', error);
    throw error;
  }
};

/**
 * Make a GET request to any workflow API endpoint
 *
 * @param endpoint - The API endpoint URL
 * @param params - Optional query parameters
 * @returns Promise resolving to the API response
 */
export const getAPIData = async (
  endpoint: string,
  params?: Record<string, string>
): Promise<any> => {
  try {
    const url = new URL(endpoint);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, value);
      });
    }

    console.log(`[GeneralAPIUtils] GET from ${url.toString()}`);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({
        error: `HTTP ${response.status}: ${response.statusText}`,
      }));
      console.error('[GeneralAPIUtils] API error:', errorData);
      throw new Error(`API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('[GeneralAPIUtils] Request failed:', error);
    throw error;
  }
};
