// Client HTTP de l'API (jeton conservé dans le stockage local).
import { today } from './dates.js';

const TOKEN_KEY = 'auphine.token';
const TIMEZONE = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    return '';
  }
})();

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

async function request(method, path, { json, blob } = {}) {
  const hadToken = Boolean(token);
  const headers = {
    // Jour et fuseau locaux : le serveur calcule « aujourd'hui » et l'heure des rappels comme toi.
    'X-Local-Day': today(),
    ...(TIMEZONE ? { 'X-Timezone': TIMEZONE } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  if (json !== undefined) headers['Content-Type'] = 'application/json';
  if (blob) headers['Content-Type'] = blob.type || 'application/octet-stream';

  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      body: json !== undefined ? JSON.stringify(json) : blob,
    });
  } catch {
    throw new ApiError(0, 'Connexion impossible, vérifie ton réseau.');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    if (res.status === 401 && hadToken) {
      setToken(null);
      window.dispatchEvent(new Event('auth:lost'));
    }
    throw new ApiError(res.status, data?.error || 'Erreur inattendue');
  }
  return res;
}

export async function api(method, path, body) {
  const res = await request(method, path, { json: body });
  return res.status === 204 ? null : res.json().catch(() => null);
}

export const get = (path) => api('GET', path);
export const post = (path, body = {}) => api('POST', path, body);
export const put = (path, body = {}) => api('PUT', path, body);
export const patch = (path, body = {}) => api('PATCH', path, body);
export const del = (path) => api('DELETE', path);

/** Envoie un fichier brut (ex. photo). */
export const upload = async (path, blob) => (await request('PUT', path, { blob })).json();

// Les photos sont protégées par le jeton : on les télécharge puis on crée une URL locale.
const blobUrls = new Map();
export function blobUrl(path) {
  if (!blobUrls.has(path)) {
    blobUrls.set(path, request('GET', path)
      .then((res) => res.blob())
      .then((b) => URL.createObjectURL(b))
      .catch((err) => {
        blobUrls.delete(path);
        throw err;
      }));
  }
  return blobUrls.get(path);
}
