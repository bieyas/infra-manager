/**
 * AES-256-GCM encrypt/decrypt for sensitive device credentials.
 * Key is read from ENCRYPTION_KEY env var (32-byte hex string).
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALG      = 'aes-256-gcm'
const KEY_HEX  = process.env.ENCRYPTION_KEY || ''

function getKey() {
  if (KEY_HEX.length !== 64) {
    throw new Error(
      'ENCRYPTION_KEY must be a 64-char hex string (32 bytes). ' +
      'Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    )
  }
  return Buffer.from(KEY_HEX, 'hex')
}

/**
 * Encrypt a plaintext string.
 * Returns a base64 string in format: iv:authTag:ciphertext
 */
export function encrypt(plaintext) {
  if (!plaintext) return null
  const key    = getKey()
  const iv     = randomBytes(12)
  const cipher = createCipheriv(ALG, key, iv)
  const enc    = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag    = cipher.getAuthTag()
  return [iv.toString('hex'), tag.toString('hex'), enc.toString('hex')].join(':')
}

/**
 * Decrypt a ciphertext string produced by encrypt().
 * Returns the original plaintext, or null if input is null/empty.
 */
export function decrypt(ciphertext) {
  if (!ciphertext) return null
  const key              = getKey()
  const [ivHex, tagHex, encHex] = ciphertext.split(':')
  if (!ivHex || !tagHex || !encHex) return null
  const decipher = createDecipheriv(ALG, key, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  const dec = Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()])
  return dec.toString('utf8')
}
