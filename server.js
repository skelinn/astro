import express from 'express';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { createReadStream, statSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';
import https from 'node:https';
import http from 'node:http';
import { URL } from 'node:url';
import zlib from 'node:zlib';

const run = promisify(execFile);
const app = express();
const PORT = 3001;
const PROXY_PREFIX = '/p';

function buildOpts(targetUrl, method, reqHeaders) {
  const parsed = new URL(targetUrl);
  return {
    hostname: parsed.hostname,
    port: parsed.port,
    path: parsed.pathname + parsed.search,
    method,
    headers: {
      'User-Agent': reqHeaders['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': reqHeaders['accept'] || '*/*',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate, br',
      'Host': parsed.host,
      'Referer': parsed.origin + '/',
      ...(reqHeaders['content-type'] ? { 'Content-Type': reqHeaders['content-type'] } : {}),
      ...(reqHeaders['range'] ? { 'Range': reqHeaders['range'] } : {}),
    },
    rejectUnauthorized: false,
  };
}

function proxyFetch(targetUrl, method = 'GET', reqHeaders = {}, body = null) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(targetUrl);
    const mod = parsed.protocol === 'https:' ? https : http;
    const opts = buildOpts(targetUrl, method, reqHeaders);
    if (body && body.length) opts.headers['Content-Length'] = body.length;

    const request = mod.request(opts, (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
        const next = new URL(response.headers.location, targetUrl).href;
        const nextMethod = [301, 302, 303].includes(response.statusCode) ? 'GET' : method;
        proxyFetch(next, nextMethod, reqHeaders).then(resolve, reject);
        return;
      }

      let stream = response;
      const encoding = response.headers['content-encoding'];
      if (encoding === 'gzip') stream = response.pipe(zlib.createGunzip());
      else if (encoding === 'deflate') stream = response.pipe(zlib.createInflate());
      else if (encoding === 'br') stream = response.pipe(zlib.createBrotliDecompress());

      const chunks = [];
      stream.on('data', c => chunks.push(c));
      stream.on('end', () => {
        resolve({
          statusCode: response.statusCode,
          headers: response.headers,
          body: Buffer.concat(chunks),
          finalUrl: targetUrl,
        });
      });
      stream.on('error', reject);
    });
    request.on('error', reject);
    request.setTimeout(20000, () => { request.destroy(new Error('Timed out')); });
    if (body) request.write(body);
    request.end();
  });
}

function proxyStream(targetUrl, method, reqHeaders, clientRes, body) {
  const parsed = new URL(targetUrl);
  const mod = parsed.protocol === 'https:' ? https : http;
  const opts = buildOpts(targetUrl, method, reqHeaders);
  if (body && body.length) opts.headers['Content-Length'] = body.length;

  const request = mod.request(opts, (response) => {
    if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
      const next = new URL(response.headers.location, targetUrl).href;
      proxyStream(next, method, reqHeaders, clientRes, null);
      return;
    }

    const skipHeaders = new Set([
      'x-frame-options', 'content-security-policy',
      'content-security-policy-report-only', 'strict-transport-security',
      'x-content-type-options', 'cross-origin-opener-policy',
      'cross-origin-embedder-policy', 'cross-origin-resource-policy',
    ]);

    clientRes.status(response.statusCode);
    for (const [k, v] of Object.entries(response.headers)) {
      if (!skipHeaders.has(k)) {
        try { clientRes.setHeader(k, v); } catch {}
      }
    }
    clientRes.setHeader('Access-Control-Allow-Origin', '*');

    response.pipe(clientRes);
  });

  request.on('error', (err) => {
    if (!clientRes.headersSent) {
      clientRes.status(502).send('Stream failed: ' + err.message);
    }
  });
  request.setTimeout(60000, () => { request.destroy(); });
  if (body) request.write(body);
  request.end();
}

function decodeHtmlEntities(str) {
  return str.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function toProxyUrl(url, baseUrl) {
  if (!url || url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('javascript:') || url.startsWith('#') || url.startsWith(PROXY_PREFIX + '?')) {
    return url;
  }
  try {
    const decoded = decodeHtmlEntities(url);
    const absolute = new URL(decoded, baseUrl).href;
    return PROXY_PREFIX + '?url=' + encodeURIComponent(absolute);
  } catch {
    return url;
  }
}

function rewriteHtml(html, baseUrl) {
  html = html.replace(
    /(<(?:a|link|area|form)\s[^>]*?(?:href|action)=)(["'])([^"']*?)\2/gi,
    (m, before, q, url) => `${before}${q}${toProxyUrl(url, baseUrl)}${q}`
  );

  html = html.replace(
    /(<(?:script|img|iframe|source|video|audio|embed|input|track)\s[^>]*?src=)(["'])([^"']*?)\2/gi,
    (m, before, q, url) => `${before}${q}${toProxyUrl(url, baseUrl)}${q}`
  );

  html = html.replace(
    /(<(?:img|source)\s[^>]*?srcset=)(["'])([^"']*?)\2/gi,
    (m, before, q, srcset) => {
      const rw = srcset.split(',').map(entry => {
        const parts = entry.trim().split(/\s+/);
        if (parts[0]) parts[0] = toProxyUrl(parts[0], baseUrl);
        return parts.join(' ');
      }).join(', ');
      return `${before}${q}${rw}${q}`;
    }
  );

  html = html.replace(
    /<style([\s\S]*?)>([\s\S]*?)<\/style>/gi,
    (m, attrs, css) => `<style${attrs}>${rewriteCss(css, baseUrl)}</style>`
  );

  const clientScript = `
<script>
(function(){
  var P = ${JSON.stringify(PROXY_PREFIX)};
  var B = ${JSON.stringify(baseUrl)};

  function rw(u) {
    if (!u || u.startsWith('data:') || u.startsWith('blob:') || u.startsWith('javascript:') || u.startsWith('#')) return u;
    try {
      if (u.startsWith(P + '?')) return u;
      var a = new URL(u, B).href;
      return P + '?url=' + encodeURIComponent(a);
    } catch(e) { return u; }
  }

  if (navigator.serviceWorker) {
    navigator.serviceWorker.register('/sw-proxy.js', { scope: '/p' }).then(function(reg) {
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'set-base',
          clientId: 'frame',
          baseUrl: B
        });
      }
      reg.active && reg.active.postMessage({
        type: 'set-base',
        clientId: 'frame',
        baseUrl: B
      });
    }).catch(function(){});
  }

  var _fetch = window.fetch;
  window.fetch = function(input, init) {
    if (typeof input === 'string') input = rw(input);
    else if (input instanceof Request) input = new Request(rw(input.url), input);
    return _fetch.call(this, input, init);
  };

  var _open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url) {
    arguments[1] = rw(url);
    return _open.apply(this, arguments);
  };

  var props = {src:['HTMLScriptElement','HTMLImageElement','HTMLIFrameElement','HTMLMediaElement','HTMLSourceElement','HTMLEmbedElement'],href:['HTMLLinkElement','HTMLAnchorElement','HTMLAreaElement']};
  Object.keys(props).forEach(function(attr){
    props[attr].forEach(function(el){
      try {
        var proto = window[el] && window[el].prototype;
        if (!proto) return;
        var desc = Object.getOwnPropertyDescriptor(proto, attr);
        if (!desc || !desc.set) return;
        var origSet = desc.set;
        Object.defineProperty(proto, attr, {
          get: desc.get,
          set: function(v) { origSet.call(this, rw(v)); },
          configurable: true,
          enumerable: true
        });
      } catch(e){}
    });
  });
})();
<\/script>`;

  if (html.includes('<head>')) {
    html = html.replace('<head>', '<head>' + clientScript);
  } else if (html.includes('<HEAD>')) {
    html = html.replace('<HEAD>', '<HEAD>' + clientScript);
  } else if (html.includes('<html')) {
    html = html.replace(/<html[^>]*>/, '$&' + clientScript);
  } else {
    html = clientScript + html;
  }

  return html;
}

function rewriteCss(css, baseUrl) {
  return css.replace(/url\(\s*(["']?)([^"')]+?)\1\s*\)/gi, (m, q, url) => {
    return `url(${q}${toProxyUrl(url, baseUrl)}${q})`;
  }).replace(/@import\s+(["'])([^"']+?)\1/gi, (m, q, url) => {
    return `@import ${q}${toProxyUrl(url, baseUrl)}${q}`;
  });
}

app.use(express.raw({ type: '*/*', limit: '10mb' }));

app.all('/p', async (req, res) => {
  let targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send('Missing ?url=');
  try {
    new URL(targetUrl);
  } catch {
    return res.status(400).send('Invalid URL');
  }

  const accept = req.headers['accept'] || '';
  const needsRewrite = accept.includes('text/html') ||
    targetUrl.match(/\.(html?|php|asp)(\?|$)/i) ||
    (!accept && req.method === 'GET' && !targetUrl.match(/\.(js|css|json|png|jpe?g|gif|webp|svg|woff2?|ttf|mp[34]|webm|ogg|m4[av]|ts|m3u8|mpd)(\?|$)/i));

  const body = req.method === 'POST' ? req.body : null;

  if (!needsRewrite) {
    try {
      proxyStream(targetUrl, req.method, req.headers, res, body);
    } catch (err) {
      if (!res.headersSent) res.status(502).send('Stream failed: ' + err.message);
    }
    return;
  }

  try {
    const resp = await proxyFetch(targetUrl, req.method, req.headers, body);
    const ct = resp.headers['content-type'] || '';

    const skipHeaders = new Set([
      'content-encoding', 'content-length', 'transfer-encoding',
      'connection', 'keep-alive', 'x-frame-options',
      'content-security-policy', 'content-security-policy-report-only',
      'strict-transport-security', 'x-content-type-options',
      'cross-origin-opener-policy', 'cross-origin-embedder-policy',
      'cross-origin-resource-policy',
    ]);
    for (const [k, v] of Object.entries(resp.headers)) {
      if (!skipHeaders.has(k)) {
        try { res.setHeader(k, v); } catch {}
      }
    }
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (ct.includes('text/html')) {
      let html = resp.body.toString('utf-8');
      html = rewriteHtml(html, targetUrl);
      res.header('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } else if (ct.includes('text/css')) {
      let css = resp.body.toString('utf-8');
      css = rewriteCss(css, targetUrl);
      res.header('Content-Type', ct);
      res.send(css);
    } else {
      res.header('Content-Type', ct);
      res.send(resp.body);
    }
  } catch (err) {
    console.error('Proxy error:', targetUrl, err.message);
    res.status(502).send(`
      <html><body style="font-family:sans-serif;background:#111;color:#eee;padding:2rem;text-align:center">
        <h2>Could not load this page</h2>
        <p style="color:#888">${err.message}</p>
        <p style="margin-top:1rem"><a href="javascript:history.back()" style="color:#4af">Go back</a></p>
      </body></html>
    `);
  }
});

app.get('/api/info', async (req, res) => {
  const { v } = req.query;
  if (!v) return res.status(400).json({ error: 'Missing video id (?v=...)' });

  try {
    const url = `https://www.youtube.com/watch?v=${v}`;
    const { stdout } = await run('yt-dlp', [
      '--dump-json', '--no-warnings', '--no-playlist', url,
    ], { timeout: 30000 });

    const info = JSON.parse(stdout);

    const videoAudio = info.formats.filter(f => f.vcodec !== 'none' && f.acodec !== 'none');
    const videoOnly = info.formats.filter(f => f.vcodec !== 'none' && f.acodec === 'none');
    const audioOnly = info.formats.filter(f => f.vcodec === 'none' && f.acodec !== 'none');

    const seen = new Set();
    const dedup = (arr, keyFn) => arr.filter(f => {
      const key = keyFn ? keyFn(f) : `${f.format_id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const pick = (arr, type, opts = {}) => dedup(arr, opts.keyFn).map(f => ({
      formatId: opts.formatIdFn ? opts.formatIdFn(f) : f.format_id,
      quality: f.format_note || f.resolution || (f.height ? `${f.height}p` : 'unknown'),
      type,
      ext: opts.ext || f.ext,
      size: f.filesize || f.filesize_approx
        ? Math.round((f.filesize || f.filesize_approx) / 1048576)
        : null,
      abr: f.abr ? Math.round(f.abr) : null,
      height: f.height,
    }));

    const videoOnlyByHeight = videoOnly
      .filter(f => f.height)
      .sort((a, b) => (b.height || 0) - (a.height || 0));
    const byHeight = new Map();
    for (const f of videoOnlyByHeight) {
      if (!byHeight.has(f.height)) byHeight.set(f.height, f);
    }
    const bestPerRes = [...byHeight.values()].sort((a, b) => (b.height || 0) - (a.height || 0));

    const formats = [
      ...pick(videoAudio, 'video'),
      ...pick(bestPerRes, 'video', {
        keyFn: f => `v${f.height}`,
        formatIdFn: f => `${f.format_id}+bestaudio`,
        ext: 'mp4',
      }),
      ...pick(audioOnly, 'audio'),
    ];

    res.json({
      title: info.title,
      author: info.uploader || info.channel || '',
      thumb: info.thumbnail || `https://i.ytimg.com/vi/${v}/hqdefault.jpg`,
      duration: info.duration,
      formats,
    });
  } catch (err) {
    console.error('Info error:', err.message);
    res.status(500).json({ error: 'Could not fetch video info. ' + (err.stderr || err.message) });
  }
});

app.get('/api/download', async (req, res) => {
  const { v, f: formatId } = req.query;
  if (!v || !formatId) return res.status(400).json({ error: 'Missing v or f' });

  const url = `https://www.youtube.com/watch?v=${v}`;
  const tmpPath = join(tmpdir(), `astro-dl-${randomUUID()}`);

  try {
    const { stdout: infoRaw } = await run('yt-dlp', [
      '--dump-json', '--no-warnings', '--no-playlist', url,
    ], { timeout: 30000 });
    const info = JSON.parse(infoRaw);
    const safeTitle = (info.title || 'video').replace(/[<>:"/\\|?*]/g, '_');
    const needsMerge = formatId.includes('+');
    const fmt = info.formats.find(f => String(f.format_id) === String(formatId.split('+')[0]));
    const ext = needsMerge ? 'mp4' : (fmt?.ext || 'mp4');
    const outPath = `${tmpPath}.${ext}`;

    const args = [
      '-f', formatId,
      '-o', needsMerge ? outPath : `${tmpPath}.%(ext)s`,
      '--no-warnings', '--no-playlist', url,
    ];
    if (needsMerge) args.push('--merge-output-format', 'mp4');

    await run('yt-dlp', args, { timeout: needsMerge ? 180000 : 120000 });
    const stat = statSync(outPath);

    res.header('Content-Disposition', `attachment; filename="${safeTitle}.${ext}"`);
    res.header('Content-Type', 'application/octet-stream');
    res.header('Content-Length', stat.size);

    const stream = createReadStream(outPath);
    stream.pipe(res);
    stream.on('end', () => { try { unlinkSync(outPath); } catch {} });
    stream.on('error', () => { try { unlinkSync(outPath); } catch {} });
  } catch (err) {
    console.error('Download error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Download failed. ' + (err.stderr || err.message) });
    }
  }
});

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
