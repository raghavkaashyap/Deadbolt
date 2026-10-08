/**
 * Lightweight API client utility.
 *
 * Wraps fetch with JSON handling and basic error throwing so you don't
 * have to repeat boilerplate across your components.
 *
 * Usage:
 *   import { get, post } from "@/lib/apiClient";
 *   const items = await get<Item[]>("/api/items");
 *   const newItem = await post<Item>("/api/items", { name: "hello" });
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

async function request<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });

  if (!res.ok) {
    const message = await res.text();
    throw new Error(`API error ${res.status}: ${message}`);
  }

  return res.json() as Promise<T>;
}

export const get = <T>(path: string, options?: RequestInit) =>
  request<T>(path, { method: "GET", ...options });

export const post = <T>(path: string, body: unknown, options?: RequestInit) =>
  request<T>(path, {
    method: "POST",
    body: JSON.stringify(body),
    ...options,
  });

export const put = <T>(path: string, body: unknown, options?: RequestInit) =>
  request<T>(path, {
    method: "PUT",
    body: JSON.stringify(body),
    ...options,
  });

export const del = <T>(path: string, options?: RequestInit) =>
  request<T>(path, { method: "DELETE", ...options });
