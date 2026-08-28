import test from 'node:test'
import assert from 'node:assert/strict'

import { validatePublicUrl } from '../api/context.js'

test('URL guard accepts ordinary public HTTP and HTTPS URLs', () => {
  assert.equal(validatePublicUrl('https://example.com/article').hostname, 'example.com')
  assert.equal(validatePublicUrl('http://example.org').protocol, 'http:')
})

test('URL guard rejects local, private and metadata destinations', () => {
  const blocked = [
    'http://localhost/admin',
    'http://127.0.0.1/',
    'http://10.10.0.2/',
    'http://172.16.0.1/',
    'http://192.168.1.1/',
    'http://169.254.169.254/latest/meta-data',
    'http://[::1]/',
    'http://metadata.google.internal/',
    'https://service.internal/',
    'https://example.com:8080/',
  ]
  for (const url of blocked) assert.throws(() => validatePublicUrl(url), undefined, url)
})

test('URL guard rejects credentials and non-HTTP protocols', () => {
  assert.throws(() => validatePublicUrl('https://user:pass@example.com/'))
  assert.throws(() => validatePublicUrl('file:///etc/passwd'))
})

