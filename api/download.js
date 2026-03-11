import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const ytdl = require('@distube/ytdl-core');

export const config = {
  api: {
    responseLimit: false,
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const v = req.query.v;
  const formatId = req.query.f;
  if (!v || !formatId) return res.status(400).json({ error: 'Missing v or f' });

  const itag = formatId.split('+')[0];
  const url = `https://www.youtube.com/watch?v=${v}`;

  try {
    const info = await ytdl.getInfo(url);
    const format = info.formats.find(f => String(f.itag) === String(itag));
    if (!format || !format.url) {
      return res.status(400).json({ error: 'Format not found' });
    }

    const title = (info.videoDetails?.title || 'video').replace(/[<>:"/\\|?*]/g, '_');
    const ext = format.container || 'mp4';

    res.setHeader('Content-Disposition', `attachment; filename="${title}.${ext}"`);
    res.setHeader('Content-Type', 'application/octet-stream');

    const stream = ytdl.downloadFromInfo(info, { format });
    stream.pipe(res);
    stream.on('error', (err) => {
      if (!res.headersSent) res.status(500).json({ error: 'Download failed. ' + err.message });
    });
  } catch (err) {
    console.error('Download error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Download failed. ' + (err.message || '') });
    }
  }
}
