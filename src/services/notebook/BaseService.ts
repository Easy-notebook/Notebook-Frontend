import { Backend_BASE_URL } from '@Config/base_url';
import { apiLog } from '@Utils/logger';

export const API_BASE_URL = Backend_BASE_URL;

// API response handling for non-stream responses
export const handleResponse = async <T = any>(response: Response): Promise<T> => {
  try {
    // First check if the response is ok
    if (!response.ok) {
      // Try to get error details, but handle cases where response body is not JSON
      let errorMessage = `HTTP error! status: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = (errorData as any).message || errorMessage;
        apiLog.error('API error', { errorData });
      } catch (jsonError) {
        apiLog.error('Failed to parse error response as JSON', { jsonError });
        // Use the response text as fallback
        try {
          const errorText = await response.text();
          if (errorText) {
            errorMessage = errorText;
          }
        } catch (textError) {
          apiLog.error('Failed to get response text', { textError });
        }
      }
      throw new Error(errorMessage);
    }

    // Try to parse successful response
    const data: T = await response.json();
    return data;
  } catch (error) {
    // If this was already an Error we threw above, re-throw it
    if (error instanceof Error && error.message.includes('HTTP error!')) {
      throw error;
    }

    apiLog.error('Failed to parse API response', { error });

    // Provide more specific error messages for common cases
    if (error instanceof TypeError && error.message.includes('Load failed')) {
      throw new Error(
        `Network error: Unable to connect to server at ${API_BASE_URL}. Please check if the backend server is running.`
      );
    }

    throw new Error(
      `Invalid response from server: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
};

export class BaseService {
  protected static get baseUrl(): string {
    return API_BASE_URL;
  }

  protected static async handleResponse<T>(response: Response): Promise<T> {
    return handleResponse<T>(response);
  }
}
