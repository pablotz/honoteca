import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'honoteca-upload-test-'));
process.env.DATA_DIR = dir;
const { uploadPhoto } = await import('./upload.js');
const { uploadPrefix } = await import('./coverAccess.js');
after(() => rmSync(dir, { recursive: true, force: true }));

test('multipart uploads use private unpredictable tickets and enforce the user limit', async () => {
  const upload = async (user, type = 'image/jpeg') => {
    const body = Buffer.from(`--photo-boundary\r\nContent-Disposition: form-data; name="photo"; filename="untrusted.html"\r\nContent-Type: ${type}\r\n\r\nphoto-bytes\r\n--photo-boundary--\r\n`);
    const req = Readable.from([body]);
    req.headers = { 'content-type': 'multipart/form-data; boundary=photo-boundary', 'content-length': String(body.length) };
    req.user = user;
    return new Promise((resolve) => {
      const res = { setHeader() {}, status(code) { this.code = code; return this; }, json() { resolve({ code: this.code }); } };
      uploadPhoto(req, res, (error) => resolve({ req, error }));
    });
  };
  const user = 'uploader@example.com';
  for (let i = 0; i < 5; i++) {
    const { req, error } = await upload(user);
    assert.ifError(error);
    assert.ok(req.file.filename.startsWith(`${uploadPrefix(user)}-`));
    assert.ok(req.file.filename.endsWith('.jpg'));
    assert.ok(existsSync(req.file.path));
  }
  assert.equal((await upload(user)).code, 429);
  assert.ifError((await upload('other@example.com')).error);
  assert.match((await upload('bad-type@example.com', 'text/html')).error.message, /solo imágenes/);
});
