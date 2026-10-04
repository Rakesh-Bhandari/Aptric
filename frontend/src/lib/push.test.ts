import { describe, expect, it } from 'vitest';
import { urlBase64ToUint8Array } from './push';

describe('urlBase64ToUint8Array', () => {
  it('decodes unpadded URL-safe base64 (a VAPID key)', () => {
    // "hello?>" -> aGVsbG8_Pg in URL-safe base64 without padding.
    expect(Array.from(urlBase64ToUint8Array('aGVsbG8_Pg'))).toEqual([...'hello?>'].map((c) => c.charCodeAt(0)));
  });

  it('turns - and _ into + and /', () => {
    expect(Array.from(urlBase64ToUint8Array('-_8'))).toEqual([0xfb, 0xff]);
  });
});
