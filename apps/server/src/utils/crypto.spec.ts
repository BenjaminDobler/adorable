import { describe, it, expect } from 'vitest';
import { encrypt, decrypt } from './crypto';

describe('Crypto Utils', () => {
  describe('encrypt', () => {
    it('should produce different output each time (random IV)', () => {
      const plaintext = 'my-secret-api-key';
      const encrypted1 = encrypt(plaintext);
      const encrypted2 = encrypt(plaintext);

      // Same plaintext should produce different ciphertext due to random IV
      expect(encrypted1).not.toBe(encrypted2);

      // Both should still contain the separator
      expect(encrypted1).toContain(':');
      expect(encrypted2).toContain(':');
    });

    it('should return empty/falsy values as-is', () => {
      expect(encrypt('')).toBe('');
      expect(encrypt(null as unknown as string)).toBe(null);
      expect(encrypt(undefined as unknown as string)).toBe(undefined);
    });
  });

  describe('decrypt', () => {
    it('should recover original plaintext', () => {
      const plaintext = 'sk-ant-api03-xxxxxxxxxxxxx';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should return values without separator as-is', () => {
      expect(decrypt('no-colon-here')).toBe('no-colon-here');
      expect(decrypt('')).toBe('');
    });
  });

  describe('round-trip encryption', () => {
    it('should preserve the original value', () => {
      const testCases = [
        'simple-key',
        'sk-ant-api03-aBcDeFgHiJkLmNoPqRsTuVwXyZ1234567890',
        'key with spaces',
        '{"json": "data", "nested": {"value": 123}}',
      ];

      for (const original of testCases) {
        const encrypted = encrypt(original);
        const decrypted = decrypt(encrypted);
        expect(decrypted).toBe(original);
      }
    });

    it('should handle special characters and Unicode', () => {
      const testCases = [
        'émojis: 🔑🔐',
        '中文密钥',
        'key\nwith\nnewlines',
        'key\twith\ttabs',
        'special: !@#$%^&*()[]{}|;:,.<>?',
      ];

      for (const original of testCases) {
        const encrypted = encrypt(original);
        const decrypted = decrypt(encrypted);
        expect(decrypted).toBe(original);
      }
    });
  });
});
