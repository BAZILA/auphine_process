// Client HTTP de l'API (jeton conservé dans le stockage local).
const TOKEN_KEY = 'auphine.token';

function readToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

let token = readToken();

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function setToken(value) {
  token = value;
  try {
    if (value) localStorage.setItem(TOKEN_KEY, value);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* navigation privée : la session ne survivra pas au rechargement */ }
}

export const hasToken = () => Boolean(token);

export async function api(method, path, body) {
  const hadToken = Boolean(token);
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Connexion impossible, vérifie ton réseau.');
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && hadToken) {
      setToken(null);
      window.dispatchEvent(new Event('auth:lost'));
    }
    throw new ApiError(res.status, data?.error || 'Erreur inattendue');
  }
  return data;
}

export const get = (path) => api('GET', path);
export const post = (path, body = {}) => api('POST', path, body);
export const put = (path, body = {}) => api('PUT', path, body);
export const patch = (path, body = {}) => api('PATCH', path, body);
export const del = (path) => api('DELETE', path);
