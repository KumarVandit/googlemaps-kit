import { youtube, YouTubeError } from '../src/youtube.js';
import { lens } from '../src/lens.js';

const media = youtube({ locale: 'en', region: 'US' });
try {
  const video = await media.video('bC8fvcpocBU');
  console.log(video.title, video.author, video.playability);
  console.log('Caption tracks:', video.captions.map(({ languageCode, name, kind }) => ({ languageCode, name, kind })));
  const first = await media.search('Google for Developers');
  console.log(first.items.map(({ type, title, url }) => ({ type, title, url })));
  if (first.continuation) console.log((await media.continueSearch(first.continuation)).items.map(item => item.title));
  console.log('Embed metadata:', await media.oembed('bC8fvcpocBU'));
} catch (error) {
  if (error instanceof YouTubeError) console.error(error.kind, error.status, error.message);
  else throw error;
  process.exitCode = 1;
}

console.log('Lens image-URL navigation:', lens().searchUrl('https://example.com/public-image.png'));
