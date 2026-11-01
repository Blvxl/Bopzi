/** Turns what the browser or a server says into something a person can act on. Messages that already read well pass through. */
export function plain(message: string): string {
  if (/failed to fetch|networkerror|load failed|network error|fetch failed/i.test(message)) return 'Bopzi could not reach the server. Check your internet connection and try again.';
  if (/\b429\b|too many requests/i.test(message)) return 'Too many tries in a row. Wait a minute, then try again.';
  if (/unexpected token|is not valid json|unexpected end of json/i.test(message)) return 'Something went wrong on our side. Try again in a moment.';
  if (/aborterror|the operation was aborted|signal is aborted/i.test(message)) return 'That was cancelled.';
  if (/\b50[0-4]\b|internal server error|bad gateway/i.test(message)) return 'The server had a problem. Try again in a moment.';
  return message;
}
