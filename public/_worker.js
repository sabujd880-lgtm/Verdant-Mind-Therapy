export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Proxy all backend API calls to the authoritative Render Express API
    if (url.pathname.startsWith('/api/')) {
      const targetUrl = new URL(url.pathname + url.search, 'https://verdant-mind-therapy-ys6i.onrender.com');
      const proxyRequest = new Request(targetUrl, request);
      return fetch(proxyRequest);
    }

    // Serve static frontend assets via Cloudflare Pages / Workers Assets
    return env.ASSETS.fetch(request);
  }
};
