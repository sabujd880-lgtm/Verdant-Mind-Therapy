/**
 * Safe JSON and HTTP response parsing utility.
 * Prevents "Unexpected token '<', '<!DOCTYPE '... is not valid JSON" errors
 * caused by server restarts, cold starts, proxy 502/503/504 errors, or HTML error pages.
 */

export async function safeJson(response) {
  try {
    if (!response) return null;
    const contentType = response.headers?.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return await response.json();
    }
    return null;
  } catch {
    return null;
  }
}

export async function getResponseError(response, defaultMsg = 'Request failed') {
  if (!response) return defaultMsg;

  const data = await safeJson(response);
  if (data && (data.error || data.message)) {
    return data.error || data.message;
  }

  // Handle HTML or non-JSON gateway / proxy responses gracefully
  if (response.status === 502 || response.status === 503 || response.status === 504) {
    return 'The server is currently waking up or restarting. Please retry in a few moments.';
  }
  if (response.status === 401) {
    return 'Authentication required or session expired. Please sign in again.';
  }
  if (response.status === 403) {
    return 'You do not have authorization to perform this action.';
  }
  if (response.status === 404) {
    return 'The requested resource or endpoint was not found.';
  }
  if (response.status === 413) {
    return 'The uploaded file exceeds the maximum permitted size.';
  }
  if (response.status === 429) {
    return 'Too many requests. Please wait a moment and try again.';
  }

  return `${defaultMsg} (${response.statusText || `Status ${response.status}`})`;
}

