import constants from './constants.js';

/**
 * Generic helper to call backend generation endpoints.
 * @param issue   Identifier of the task/issue.
 * @param context Extra context object to send to backend.
 * @param locale  Optional locale string. (Kept for backward compatibility but ignored by backend.)
 */
export const generalResponse = async (
  issue: string,
  context: Record<string, unknown>,
  locale?: string,
): Promise<any> => {
  try {
    const response = await fetch(constants.API.GENERATE_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ issue, context, locale }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('[StageGeneralFunction] API error:', errorData);
      throw new Error(`API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('[StageGeneralFunction] Request failed:', error);
    throw error;
  }
};
