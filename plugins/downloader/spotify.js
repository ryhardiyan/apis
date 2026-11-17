// Spotify track downloader (track only). Uses a job queue so it fits serverless time limits:
//   POST /api/spotify/track          -> creates a job, returns jobId
//   GET  /api/spotify/track/:jobId   -> poll until status is "ready" (or "failed")
import { success, requireUrl, HttpError } from '../../src/response.js';
import { upstreamFetch } from '../../src/http.js';

const SPOTIFY_HOSTS = ['open.spotify.com'];
const API = 'https://spotyloader.com/api/spotify';
const JOB_ID = /^[A-Za-z0-9_-]{1,100}$/;

function validateTrackUrl(raw) {
  const url = requireUrl(raw, 'url', SPOTIFY_HOSTS);
  if (!/\/track\/[A-Za-z0-9]+/.test(new URL(url).pathname)) {
    throw new HttpError(400, 'Invalid request', 'Only Spotify track links are supported (albums and playlists are not allowed)');
  }
  return url;
}

export default {
  name: 'spotify',
  description: 'Unduh lagu Spotify (track tunggal) dalam format MP3 dengan sistem job dan polling.',
  version: '1.0.0',
  author: 'RyharDev',
  routes: [
    {
      method: 'post',
      path: '/track',
      summary: 'Create Spotify track job',
      description: 'Membuat job konversi untuk satu track Spotify. Gunakan jobId pada GET /track/{jobId} untuk mengecek status.',
      requestBody: {
        type: 'object',
        required: ['url'],
        properties: { url: { type: 'string', format: 'uri', maxLength: 2048 } },
      },
      requestExample: { url: 'https://open.spotify.com/track/4PTG3Z6ehGkBF3zI7YgR7u' },
      example: { jobId: 'abc123', statusUrl: '/api/spotify/track/abc123' },
      async handler(req, res) {
        const target = validateTrackUrl(req.body?.url);
        const upstream = await upstreamFetch(`${API}/track`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ url: target }),
          timeout: 9000,
        });
        if (!upstream.ok) throw new HttpError(502, 'Upstream error', 'Conversion service rejected the request', 'UpstreamError');

        const data = await upstream.json();
        if (!data?.jobId || !JOB_ID.test(String(data.jobId))) {
          throw new HttpError(502, 'Upstream error', 'Conversion service did not return a valid job id', 'UpstreamError');
        }
        const jobId = String(data.jobId);
        success(res, { jobId, statusUrl: `/api/spotify/track/${jobId}` }, 'Job created');
      },
    },
    {
      method: 'get',
      path: '/track/:jobId',
      summary: 'Check Spotify track job',
      description: 'Status: "processing", "ready" (dengan downloadUrl dan metadata), atau "failed".',
      example: {
        status: 'ready',
        downloadUrl: 'https://example.com/file.mp3',
        metadata: { title: 'Contoh lagu', artist: 'Artis', album: 'Album', image: 'https://i.scdn.co/image/example' },
      },
      async handler(req, res) {
        const { jobId } = req.params;
        if (!JOB_ID.test(jobId)) throw new HttpError(400, 'Invalid request', 'Parameter "jobId" is invalid');

        const upstream = await upstreamFetch(`${API}/track/status/${encodeURIComponent(jobId)}`, {
          headers: { Accept: 'application/json' },
          timeout: 9000,
        });
        if (!upstream.ok) throw new HttpError(502, 'Upstream error', 'Could not read job status', 'UpstreamError');

        const job = await upstream.json();
        const downloadUrl = job.downloadLink || job.downloadUrl || job.post?.download_url || null;

        if ((job.status === 'ready' || job.status === 'success') && downloadUrl) {
          return success(
            res,
            {
              status: 'ready',
              downloadUrl,
              metadata: job.post
                ? { title: job.post.name ?? null, artist: job.post.artist ?? null, album: job.post.album ?? null, image: job.post.image ?? null }
                : null,
            },
            'Track ready',
          );
        }
        if (job.status === 'error' || job.status === 'failed') {
          return success(res, { status: 'failed' }, 'Conversion failed on the upstream service');
        }
        return success(res, { status: 'processing' }, 'Track is still processing');
      },
    },
  ],
};
