#!/usr/bin/env node
/**
 * The reverse proxy every deployment has in front of the image (Caddy in dev, the ALB in production), for Lighthouse:
 * the page comes from the nginx container, /api and /brand from elsewhere. Without an API it answers the two calls the
 * sign-in page makes, so what gets audited is the real sign-in page and not "this address is not configured".
 *   LH_WEB   nginx container     http://127.0.0.1:8080
 *   LH_API   a real API, optional
 *   LH_PORT  this proxy          8081
 */
import { createServer, request } from 'node:http';

const web = new URL(process.env.LH_WEB ?? 'http://127.0.0.1:8080');
const api = process.env.LH_API ? new URL(process.env.LH_API) : null;
const port = Number(process.env.LH_PORT ?? 8081);

const CONFIG = {
  product: { name: 'HRMS' },
  brand: { name: 'Example Company', productName: 'HRMS', primaryColor: '#2b3a4a', locale: 'en-IN', timezone: 'Asia/Kolkata', currency: 'INR', dateFormat: 'DD/MM/YYYY', financialYearStart: '04-01', country: 'IN' },
  features: {}, mode: 'multi', mfa: { available: false, enforced: false, methods: [] }, auth: { resetByEmail: true },
};

createServer((req, res) => {
  const toApi = /^\/(api|brand)\//.test(req.url ?? '');
  if (toApi && !api) {
    const config = req.url === '/api/v1/config/public';
    res.writeHead(config ? 200 : 401, { 'content-type': config ? 'application/json' : 'application/problem+json' });
    res.end(JSON.stringify(config ? CONFIG : { type: 'about:blank', title: 'Please sign in', status: 401 }));
    return;
  }
  const target = toApi ? api : web;
  const out = request({ host: target.hostname, port: target.port, path: req.url, method: req.method, headers: req.headers }, (r) => {
    res.writeHead(r.statusCode ?? 502, r.headers);
    r.pipe(res);
  });
  out.on('error', () => { res.writeHead(502); res.end(); });
  req.pipe(out);
}).listen(port, '127.0.0.1');
