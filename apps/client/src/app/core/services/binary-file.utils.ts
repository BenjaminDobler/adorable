/**
 * Browser-only utilities for converting between data URIs, base64, and
 * binary buffers. Used by the project export flow (zipping/publishing)
 * and the workspace's image-write path.
 *
 * Pure functions, no DI — keep that way.
 */

/**
 * Decode the base64 payload of a data URI into a Uint8Array.
 * Throws if the input is not a valid `data:...,base64-payload` string.
 */
export function dataURIToUint8Array(dataURI: string): Uint8Array {
  const byteString = atob(dataURI.split(',')[1]);
  const buffer = new ArrayBuffer(byteString.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < byteString.length; i++) {
    bytes[i] = byteString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Encode a Uint8Array as a base64 string. Mirrors btoa for binary data.
 */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}
