const { spawn } = require('child_process');
const ffmpegStatic = require('ffmpeg-static');
const path = require('path');

const inputPath = 'C:\\Users\\rashe\\.gemini\\antigravity\\brain\\51401642-77ac-41eb-845c-8d35d127992a\\flowcap_logo_1776004630909.png';
const outputPath = path.join(__dirname, 'icon.ico');

const proc = spawn(ffmpegStatic, [
  '-i', inputPath,
  '-vf', 'scale=256:256',
  outputPath
]);

proc.on('close', code => {
  if (code === 0) console.log('Successfully created icon.ico');
  else console.error('Failed to create icon, exit code:', code);
});
