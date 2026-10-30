import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { ImageRejected, processProfilePhoto } from '@/lib/images';

const jpegWithGps = () => sharp({ create: { width: 600, height: 400, channels: 3, background: '#3b5e4d' } })
  .jpeg()
  .withExif({ IFD0: { Make: 'TestCam', Artist: 'Secret Name' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '32/1 56/1 0/1', GPSLongitudeRef: 'W', GPSLongitude: '97/1 4/1 0/1' } })
  .toBuffer();

describe('profile photo processing', () => {
  it('the fixture really contains EXIF + GPS', async () => {
    const meta = await sharp(await jpegWithGps()).metadata();
    expect(meta.exif).toBeDefined();
    expect(meta.exif!.toString('latin1')).toContain('TestCam');
  });

  it('re-encodes to WebP and strips all metadata', async () => {
    const out = await processProfilePhoto(await jpegWithGps());
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe('webp');
    expect([meta.width, meta.height]).toEqual([400, 400]);
    expect(meta.exif).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    expect(meta.icc).toBeUndefined();
    expect(out.toString('latin1')).not.toContain('TestCam');
    expect(out.toString('latin1')).not.toContain('Secret Name');
  });

  it('rejects non-images, SVG, GIF and oversized files', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)" width="10" height="10"/>');
    const gif = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#000' } }).gif().toBuffer();
    for (const bad of [Buffer.from('hello'), svg, gif, Buffer.alloc(0), Buffer.alloc(6 * 1024 * 1024)]) {
      await expect(processProfilePhoto(bad)).rejects.toBeInstanceOf(ImageRejected);
    }
  });
});
