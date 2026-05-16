'use strict';

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';

// Key must be a 32-byte hex string (64 hex chars).
// In production, set CREDENTIALS_ENCRYPTION_KEY in your environment.
// The dev placeholder is intentionally weak — never use in production.
const DEV_KEY = '0000000000000000000000000000000000000000000000000000000000000000';

function getKey() {
  const hex = process.env.CREDENTIALS_ENCRYPTION_KEY || DEV_KEY;
  if (hex === DEV_KEY && process.env.NODE_ENV === 'production') {
    throw new Error('CREDENTIALS_ENCRYPTION_KEY must be set in production');
  }
  return Buffer.from(hex, 'hex');
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * @param {string} plaintext
 * @returns {{ encrypted: string, iv: string, tag: string }}
 */
function encrypt(plaintext) {
  const key = getKey();
  const iv = crypto.randomBytes(12); // 96-bit IV recommended for GCM
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const tag = cipher.getAuthTag();

  return {
    encrypted,
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
  };
}

/**
 * Decrypt ciphertext encrypted by encrypt().
 * @param {string} encrypted - hex ciphertext
 * @param {string} iv        - hex IV
 * @param {string} tag       - hex auth tag
 * @returns {string} plaintext
 */
function decrypt(encrypted, iv, tag) {
  const key = getKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));

  let plaintext = decipher.update(encrypted, 'hex', 'utf8');
  plaintext += decipher.final('utf8');

  return plaintext;
}

module.exports = { encrypt, decrypt };
