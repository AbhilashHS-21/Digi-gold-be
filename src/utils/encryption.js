import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

const ALGO = "aes-256-gcm";
const ENC_KEY = crypto
  .createHash("sha256")
  .update(process.env.ENCRYPTION_SECRET)
  .digest();
const IV_LEN = 12;

/**
 * Encrypt a plain-text value
 * @param {string} text
 * @returns {string} Base64 encoded (IV:authTag:ciphertext)
 */
export function encrypt(text) {
  if (!text) return null;
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, ENC_KEY, iv);
  const enc = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

/**
 * Decrypt an encrypted Base64 string
 * @param {string} data
 * @returns {string}
 */
export function decrypt(data) {
  if (!data) return null;
  const raw = Buffer.from(data, "base64");
  const iv = raw.subarray(0, IV_LEN);
  const tag = raw.subarray(IV_LEN, IV_LEN + 16);
  const text = raw.subarray(IV_LEN + 16);
  const decipher = crypto.createDecipheriv(ALGO, ENC_KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(text), decipher.final()]).toString(
    "utf8"
  );
}
