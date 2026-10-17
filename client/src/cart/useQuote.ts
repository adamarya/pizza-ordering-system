import { useEffect, useState } from 'react';
import { fetchQuote, type Quote, type QuoteRequest } from '../lib/api';

// Asks the server to price the given request whenever it changes. Requests are debounced briefly
// and older ones are cancelled, so the screen always shows the latest server quote.
export function useQuote(request: QuoteRequest | null) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const key = request ? JSON.stringify(request) : null;

  useEffect(() => {
    if (!key) {
      setQuote(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(() => {
      fetchQuote(JSON.parse(key), controller.signal)
        .then((q) => {
          setQuote(q);
          setError(null);
        })
        .catch((e: Error) => {
          if (e.name !== 'AbortError') setError(e.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key]);

  return { quote, error, loading };
}
