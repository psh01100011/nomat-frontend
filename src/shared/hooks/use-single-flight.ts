import { useCallback, useRef } from 'react';

export function useSingleFlight() {
  const activeKeysRef = useRef(new Set<string>());

  return useCallback((key: string, request: () => Promise<unknown>) => {
    if (activeKeysRef.current.has(key)) return false;
    activeKeysRef.current.add(key);
    void request()
      .catch(() => undefined)
      .finally(() => activeKeysRef.current.delete(key));
    return true;
  }, []);
}
