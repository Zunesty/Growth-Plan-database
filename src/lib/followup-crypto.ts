// AES-256-GCM encryption for Fathom keys, Gmail tokens, and webhook secrets
// at rest. Ciphertext format (base64): [12-byte IV][16-byte auth tag][ciphertext]

import crypto from "crypto";
import { followupConfig } from "./followup-config";

const ALGO = "aes-256-gcm";

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const hex = followupConfig.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      "ENCRYPTION_KEY must be a 64-char hex string (32 bytes). Generate one with:\n" +
        "  node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }
  cachedKey = Buffer.from(hex, "hex");
  return cachedKey;
}

export function encrypt(plaintext: string | null | undefined): string {
  if (plaintext == null || plaintext === "") return "";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decrypt(payload: string | null | undefined): string {
  if (payload == null || payload === "") return "";
  const raw = Buffer.from(payload, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const enc = raw.subarray(28);
  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

// True when a usable encryption key is configured (used to warn, not crash, in demo mode).
export function keyAvailable(): boolean {
  return Boolean(followupConfig.ENCRYPTION_KEY && followupConfig.ENCRYPTION_KEY.length === 64);
}
