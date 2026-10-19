import { Backend_BASE_URL } from '@Config/base_url';
import { apiLog } from '@Utils/logger';
import { HttpResponseError } from './HttpResponseError';

export const API_BASE_URL = Backend_BASE_URL;

/** Does not consume successful bodies: JSON, binary and streams share this gate. */
async function assertSuccessfulResponse(response: Response): Promise<void> {
  if (!response.ok) {
    let message = `HTTP error! status: ${response.status}`;
    let cause: unknown;
    try {
      const text = await response.text();
      if (text.trim()) {
        let data: unknown;
        try {
          data = JSON.parse(text);
        } catch {
          message = text;
        }
        if (
          data &&
          typeof data === 'object' &&
          'message' in data &&
          typeof data.message === 'string' &&
          data.message.trim()
        )
          message = data.message;
      }
    } catch (error) {
      cause = error;
    }
    const error = new HttpResponseError(response.status, response.statusText, message, cause);
    apiLog.error('API error', { error });
    throw error;
  }
}

/** Reads JSON only after HTTP success has been established. */
export const handleResponse = async <T = any>(response: Response): Promise<T> => {
  await assertSuccessfulResponse(response);
  try {
    return await response.json();
  } catch (error) {
    apiLog.error('Failed to parse API response', { error });
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

  protected static async assertSuccessfulResponse(response: Response): Promise<void> {
    await assertSuccessfulResponse(response);
  }

  protected static async handleResponse<T>(response: Response): Promise<T> {
    return handleResponse<T>(response);
  }
}
