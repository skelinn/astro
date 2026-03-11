import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const ytdl = require('@distube/ytdl-core');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const v = req.query.v;
  if (!v) return res.status(400).json({ error: 'Missing video id (?v=...)' });

  try {
    const url = `https://www.youtube.com/watch?v=${v}`;
    const info = await ytdl.getInfo(url);

    const videoDetails = info.videoDetails || {};
    const formats = (info.formats || []).filter(f => f.url);

    const seen = new Set();
    const videoWithAudio = formats.filter(f => f.hasVideo && f.hasAudio);
    const videoOnly = formats.filter(f => f.hasVideo && !f.hasAudio);
    const audioOnly = formats.filter(f => !f.hasVideo && f.hasAudio);

    const pick = (arr, type) => {
      return arr
        .filter(f => {
          const key = `${f.itag}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .map(f => ({
          formatId: String(f.itag),
          quality: f.qualityLabel || (f.height ? `${f.height}p` : 'unknown'),
          type,
          ext: f.container || 'mp4',
          size: f.contentLength ? Math.round(Number(f.contentLength) / 1048576) : null,
          abr: f.audioBitrate ? Math.round(f.audioBitrate / 1000) : null,
          height: f.height || null,
        }));
    };

    const byHeight = new Map();
    videoOnly.forEach(f => {
      const h = f.height || parseInt((f.qualityLabel || '0').replace('p', '')) || 0;
      if (h && !byHeight.has(h)) byHeight.set(h, f);
    });
    const bestVideoOnly = [...byHeight.values()].sort((a, b) => (b.height || 0) - (a.height || 0));

    const formatList = [
      ...pick(videoWithAudio, 'video'),
      ...pick(bestVideoOnly, 'video'),
      ...pick(audioOnly, 'audio'),
    ];

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
    res.status(200).json({
      title: videoDetails.title || 'Video',
      author: videoDetails.author?.name || videoDetails.ownerChannelName || '',
      thumb: videoDetails.thumbnails?.[0]?.url || `https://i.ytimg.com/vi/${v}/hqdefault.jpg`,
      duration: videoDetails.lengthSeconds ? parseInt(videoDetails.lengthSeconds, 10) : null,
      formats: formatList,
    });
  } catch (err) {
    console.error('Info error:', err.message);
    res.status(500).json({ error: 'Could not fetch video info. ' + (err.message || '') });
  }
}
