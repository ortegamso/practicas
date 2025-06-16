import crypto from 'crypto';
import config from '../config'; // To get a master encryption key

const ALGORITHM = 'aes-256-cbc';
// Key length for AES-256 is 32 bytes
const KEY_LENGTH = 32;
// IV length for AES-256-CBC is 16 bytes
const IV_LENGTH = 16;

// Derive a consistent key from the JWT secret or a dedicated encryption secret
// IMPORTANT: For production, use a dedicated, randomly generated, and securely managed ENCRYPTION_KEY.
// Using JWT_SECRET here is for convenience in this example but not ideal for separation of concerns.
let encryptionKey = config.jwt.secret; // Re-using JWT secret for simplicity - NOT RECOMMENDED FOR PRODUCTION
if (!encryptionKey || encryptionKey.length < KEY_LENGTH) {
    console.warn(\`[SECURITY WARNING] Encryption key (derived from JWT_SECRET: '\${encryptionKey}') is too short or missing. Using a default insecure key. SET A STRONG JWT_SECRET or a dedicated ENCRYPTION_KEY of at least 32 characters.\`);
    encryptionKey = 'default_insecure_encryption_key_32_chars_long_enough'; // Fallback for safety, but insecure
}

// Ensure the key is exactly 32 bytes by hashing or padding/truncating (hashing is better)
// Using SHA-256 to derive a 32-byte key from the configured secret
const getDerivedKey = (): Buffer => {
    return crypto.createHash('sha256').update(String(encryptionKey)).digest();
};

export const encrypt = (text: string): string => {
  if (!text) return '';
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const derivedKey = getDerivedKey();
    const cipher = crypto.createCipheriv(ALGORITHM, derivedKey, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    // Prepend IV to the encrypted string (hex format) for use during decryption
    return iv.toString('hex') + ':' + encrypted;
  } catch (error) { // Removed comma here
    console.error("Encryption error:", error);
    throw new Error("Encryption failed."); // Or handle more gracefully
  }
};

export const decrypt = (textWithIv: string): string => {
  if (!textWithIv) return '';
  try {
    const parts = textWithIv.split(':');
    if (parts.length !== 2) {
        console.error("Decryption error: Invalid format for encrypted text with IV.");
        throw new Error("Decryption failed due to invalid format.");
    }
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedText = parts[1];
    const derivedKey = getDerivedKey();

    if (iv.length !== IV_LENGTH) {
        console.error(\`Decryption error: IV length is incorrect. Expected \${IV_LENGTH}, got \${iv.length}\`);
        throw new Error("Decryption failed due to IV length error.");
    }

    const decipher = crypto.createDecipheriv(ALGORITHM, derivedKey, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error("Decryption error:", error);
    // Do not expose detailed crypto errors to client, log them and throw generic
    throw new Error("Decryption failed. The encrypted data may be corrupt or the key incorrect.");
  }
};
