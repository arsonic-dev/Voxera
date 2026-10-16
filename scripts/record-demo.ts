// scripts/record-demo.ts
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';

const MEDIA_DIR = path.resolve(process.cwd(), 'docs/media');
const TEMP_VIDEO_DIR = path.resolve(MEDIA_DIR, 'temp_video');

if (!fs.existsSync(TEMP_VIDEO_DIR)) {
  fs.mkdirSync(TEMP_VIDEO_DIR, { recursive: true });
}

async function record() {
  console.log('🎬 Starting Playwright browser recording for Voxera product demo...');
  const browser = await chromium.launch();
  
  // Viewport sized for optimal GitHub markdown presentation (compact, crisp, sharp text)
  const context = await browser.newContext({
    viewport: { width: 1024, height: 620 },
    recordVideo: {
      dir: TEMP_VIDEO_DIR,
      size: { width: 1024, height: 620 },
    },
  });

  const page = await context.newPage();

  // Navigate to interactive demo mode
  await page.goto('http://localhost:5173/?demo=1', { waitUntil: 'networkidle' });
  console.log('Recording timeline:');
  console.log(' - 0.0s: Landing page with Voxera sonic-V logo and hero');
  console.log(' - 1.4s: Join screen');
  console.log(' - 2.2s: Language selection & headphones verification');
  console.log(' - 3.0s: Connecting into room');
  console.log(' - 3.6s: Real-time debate room with live captions');
  console.log(' - 5.0s: Incoming speech stream');
  console.log(' - 6.4s: Client-side barge-in interruption (< 150ms) with red cutoff marker');
  console.log(' - 8.2s: Mind-change self-correction with "taken back" retraction');

  // Wait 10.8s for complete demo flow to execute
  await page.waitForTimeout(10800);

  // Close context to finish writing video file
  await page.close();
  await context.close();
  await browser.close();

  // Find the generated webm file
  const videoFiles = fs.readdirSync(TEMP_VIDEO_DIR).filter((f) => f.endsWith('.webm'));
  if (videoFiles.length === 0) {
    throw new Error('No video file was created in temp_video');
  }

  const rawVideoPath = path.join(TEMP_VIDEO_DIR, videoFiles[0]);
  const outputGifPath = path.join(MEDIA_DIR, 'voxera-demo.gif');

  console.log(`\n🎞️ Converting recorded WebM (${rawVideoPath}) to optimized GIF...`);

  // Single-pass filter_complex palette generation and palette use for crisp color and optimal compression
  const gifCmd = `ffmpeg -y -i "${rawVideoPath}" -filter_complex "[0:v] fps=12,scale=860:-1:flags=lanczos,split [a][b];[a] palettegen=max_colors=128:stats_mode=diff [p];[b][p] paletteuse=dither=bayer:bayer_scale=3" "${outputGifPath}"`;
  execSync(gifCmd, { stdio: 'inherit' });

  // Also generate focused 4.5-second barge-in & cutoff loop
  const bargeInGifPath = path.join(MEDIA_DIR, 'barge-in-cutoff.gif');
  const bargeInCmd = `ffmpeg -y -ss 00:00:05.2 -t 00:00:04.8 -i "${rawVideoPath}" -filter_complex "[0:v] fps=12,scale=860:-1:flags=lanczos,split [a][b];[a] palettegen=max_colors=128:stats_mode=diff [p];[b][p] paletteuse=dither=bayer:bayer_scale=3" "${bargeInGifPath}"`;
  execSync(bargeInCmd, { stdio: 'inherit' });

  // Clean up temp video directory
  fs.rmSync(TEMP_VIDEO_DIR, { recursive: true, force: true });

  const stats = fs.statSync(outputGifPath);
  const bargeStats = fs.statSync(bargeInGifPath);
  console.log(`\n✅ Generated demo GIF: docs/media/voxera-demo.gif (${(stats.size / (1024 * 1024)).toFixed(2)} MB)`);
  console.log(`✅ Generated barge-in GIF: docs/media/barge-in-cutoff.gif (${(bargeStats.size / (1024 * 1024)).toFixed(2)} MB)`);
}

record().catch((err) => {
  console.error('Recording failed:', err);
  process.exit(1);
});
