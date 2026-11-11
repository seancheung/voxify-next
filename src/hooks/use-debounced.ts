import { type Dispatch, type SetStateAction, useEffect, useRef, useState } from "react";

/**
 * A React hook that returns a debounced version of the provided function.
 *
 * @template T - The type of the function to debounce
 * @param {T} func - The function to debounce
 * @param {number} delay - The delay in milliseconds before the function is executed
 * @returns {T} A debounced version of the provided function
 *
 * @example
 * ```tsx
 * const debouncedSearch = useDebounced((query) => {
 *   // Perform search operation
 *   searchAPI(query);
 * }, 500);
 *
 * // In your component
 * <input
 *   onChange={(e) => debouncedSearch(e.target.value)}
 *   placeholder="Search..."
 * />
 * ```
 */
// biome-ignore lint/suspicious/noExplicitAny: generic constraint requires any[] for variadic functions
export function useDebounced<T extends (...args: any[]) => void>(func: T, delay: number): T {
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const debounced = (...args: Parameters<T>) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => func(...args), delay);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return debounced as T;
}

/**
 * A React hook that returns a debounced version of the provided state.
 *
 * @template T - The type of the state
 * @param {T | (() => T)} initialState - The initial state
 * @param {number} delay - The delay in milliseconds before the state is updated
 * @returns {[T, T, Dispatch<SetStateAction<T>>]} A tuple containing the state, the debounced state, and the function to update the state
 */
export function useDebouncedState<T>(
  initialState: T | (() => T),
  delay: number,
): [T, T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState(initialState);
  const [debouncedValue, setDebouncedValue] = useState(value);
  const onChange = useDebounced(setDebouncedValue, delay);

  useEffect(() => {
    onChange(value);
  }, [onChange, value]);

  return [value, debouncedValue, setValue];
}
