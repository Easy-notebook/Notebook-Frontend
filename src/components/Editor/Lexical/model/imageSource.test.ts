import { expect, it } from 'vitest';
import { parseImageSource } from './imageSource';
it('uses the same URLs for source editing and media previews', () => {
  expect(parseImageSource('![image](<https://example.com/a(b).png> "Title")')).toEqual({
    src: 'https://example.com/a(b).png',
    alt: 'image',
    title: 'Title',
  });
  expect(parseImageSource('![video](https://example.com/movie.mp4)')?.src).toBe(
    'https://example.com/movie.mp4'
  );
});
it('does not silently discard text beside an edited image', () => {
  expect(parseImageSource('![image](a.png) and text')).toBeNull();
});
