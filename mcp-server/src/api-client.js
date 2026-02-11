/**
 * HookCats API Client
 * HTTP client for communicating with the HookCats REST API using API key authentication
 */
export class HookCatsClient {
  constructor(baseUrl, apiKey) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.apiKey = apiKey;
  }

  async request(method, path, body = null) {
    const url = `${this.baseUrl}/api${path}`;
    const options = {
      method,
      headers: {
        'X-API-Key': this.apiKey,
        'Content-Type': 'application/json'
      }
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const res = await fetch(url, options);
    const data = await res.json();

    if (!res.ok || !data.success) {
      const errorMsg = data.error || data.message || `API error: ${res.status}`;
      throw new Error(errorMsg);
    }

    return data;
  }

  async get(path) {
    return this.request('GET', path);
  }

  async post(path, body) {
    return this.request('POST', path, body);
  }

  async del(path) {
    return this.request('DELETE', path);
  }
}
