import { expect, it, vi } from 'vitest';
import { handleResponse, API_BASE_URL } from './BaseService';
import { HttpResponseError } from './HttpResponseError';

vi.mock('@Utils/logger', () => ({ apiLog: { error: vi.fn() } }));

it('preserves the successful JSON result', async () => {
  const data = { status: 'ok', data: { notebook_id: 'a' } };
  await expect(handleResponse(new Response(JSON.stringify(data)))).resolves.toEqual(data);
});

it.each([
  ['{"message":"Notebook is busy"}', 'Notebook is busy'],
  ['upstream unavailable', 'upstream unavailable'],
  ['<html>Gateway failure</html>', '<html>Gateway failure</html>'],
  ['{"message":', '{"message":'],
  ['', 'HTTP error! status: 503'],
  ['   ', 'HTTP error! status: 503'],
  ['null', 'HTTP error! status: 503'],
  ['{"message":42}', 'HTTP error! status: 503'],
  ['{"message":"  "}', 'HTTP error! status: 503'],
  ['[]', 'HTTP error! status: 503'],
])('retains HTTP status and reads error body once: %j', async (body, message) => {
  const response = new Response(body, { status: 503, statusText: 'Service Unavailable' });
  const text = vi.spyOn(response, 'text');
  const json = vi.spyOn(response, 'json');
  const error = await handleResponse(response).catch((failure: unknown) => failure);
  expect(error).toBeInstanceOf(HttpResponseError);
  expect(error).toMatchObject({
    name: 'HttpResponseError',
    status: 503,
    statusText: 'Service Unavailable',
    message,
  });
  expect(text).toHaveBeenCalledTimes(1);
  expect(json).not.toHaveBeenCalled();
});

it('retains HTTP status and body-read cause if the response body cannot be read', async () => {
  const response = new Response('denied', { status: 403 });
  const cause = new Error('body stream interrupted');
  vi.spyOn(response, 'text').mockRejectedValue(cause);
  await expect(handleResponse(response)).rejects.toMatchObject({
    name: 'HttpResponseError',
    status: 403,
    message: 'HTTP error! status: 403',
    cause,
  });
});

it('does not misclassify a malformed successful response as an HTTP failure', async () => {
  const failure = await handleResponse(new Response('not json')).catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(Error);
  expect(failure).not.toBeInstanceOf(HttpResponseError);
  expect(failure).toMatchObject({
    message: expect.stringContaining('Invalid response from server:'),
  });
});

it('preserves the existing network diagnostic for interrupted successful response reads', async () => {
  const response = new Response('{}');
  vi.spyOn(response, 'json').mockRejectedValue(new TypeError('Load failed'));
  await expect(handleResponse(response)).rejects.toThrow(
    `Unable to connect to server at ${API_BASE_URL}`
  );
});
