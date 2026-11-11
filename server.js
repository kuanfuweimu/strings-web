// Local server: serves the pages (so output + control share one origin) and
// turns frames posted by index.html?render=1 into MP4 files through ffmpeg.
const http = require('http'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const PORT = +process.env.PORT || 8787, ROOT = __dirname, OUT = path.join(ROOT, 'out');
const tdLive = require('./td-live-server')();
fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mp4': 'video/mp4', '.png': 'image/png' };
let ff = null, frames = 0;

function body(req) { return new Promise((res, rej) => { const c = []; req.on('data', d => c.push(d)); req.on('end', () => res(Buffer.concat(c))); req.on('error', rej); }); }

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  try {
    if (await tdLive(req, res, u)) return;
    if (req.method === 'POST' && u.pathname === '/start') {
      const name = (u.searchParams.get('name') || 'clip').replace(/[^\w-]/g, ''), fps = String(+u.searchParams.get('fps') || 60);
      frames = 0;
      // NVENC by default: 4K libx264 lookahead needs several GB of RAM. Set ENCODER=x264 on machines without an NVIDIA GPU.
      const enc = process.env.ENCODER === 'x264'
        ? ['-c:v', 'libx264', '-preset', 'fast', '-crf', '15', '-threads', '8', '-x264-params', 'rc-lookahead=10']
        : ['-c:v', 'h264_nvenc', '-preset', 'p6', '-rc', 'vbr', '-cq', '15', '-b:v', '0', '-maxrate', '120M', '-bufsize', '240M'];
      ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', fps, '-c:v', 'mjpeg', '-threads', '4', '-i', '-',
        '-vf', 'scale=in_range=full:out_range=tv,format=yuv420p', ...enc,
        '-color_range', 'tv', '-movflags', '+faststart', path.join(OUT, name + '.mp4')], { stdio: ['pipe', 'inherit', 'inherit'] });
      ff.closed = new Promise(r => ff.on('close', r));
      console.log('start', name, fps + 'fps');
      return res.end('ok');
    }
    if (req.method === 'POST' && u.pathname === '/frame') {
      const b = await body(req);
      if (!ff) { res.statusCode = 409; return res.end('no clip'); }
      if (!ff.stdin.write(b)) await new Promise(r => ff.stdin.once('drain', r));
      frames++;
      return res.end('ok');
    }
    if (req.method === 'POST' && u.pathname === '/end') {
      if (ff) { ff.stdin.end(); const code = await ff.closed; console.log('end', frames, 'frames, ffmpeg exit', code); ff = null; }
      return res.end('ok');
    }
    if (req.method === 'POST' && u.pathname === '/done') { res.end('ok'); console.log('done'); if (process.env.EXIT_ON_DONE) setTimeout(() => process.exit(0), 200); return; }
    const rel = decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname);
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.statusCode = 404; return res.end('not found'); }
    res.setHeader('Content-Type', MIME[path.extname(file)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    fs.createReadStream(file).pipe(res);
  } catch (e) { console.error(e); res.statusCode = 500; res.end(String(e)); }
}).listen(PORT, '127.0.0.1', () => console.log('STRINGS  http://localhost:' + PORT + '/   control: http://localhost:' + PORT + '/control.html'));
