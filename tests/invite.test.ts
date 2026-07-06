/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Invite link security (Part 11) — links are built from the trusted
 * server-side APP_BASE_URL, never a client-supplied origin, and a
 * missing/invalid APP_BASE_URL fails safely.
 */
import { describe, it, expect } from 'vitest';
import { resolveAppBaseUrl } from '../api/send-invite';

describe('resolveAppBaseUrl', () => {
  it('accepts a valid https URL and returns its origin', () => {
    expect(resolveAppBaseUrl('https://thebidroom.com')).toBe('https://thebidroom.com');
  });

  it('normalises to origin, dropping any path/query', () => {
    expect(resolveAppBaseUrl('https://thebidroom.com/app/?x=1')).toBe('https://thebidroom.com');
  });

  it('accepts http for local/dev', () => {
    expect(resolveAppBaseUrl('http://localhost:3000')).toBe('http://localhost:3000');
  });

  it('fails safely when unset', () => {
    expect(resolveAppBaseUrl(undefined)).toBeNull();
    expect(resolveAppBaseUrl('')).toBeNull();
  });

  it('rejects a non-URL string', () => {
    expect(resolveAppBaseUrl('not a url')).toBeNull();
  });

  it('rejects a non-http(s) scheme (no javascript:/data: links in emails)', () => {
    expect(resolveAppBaseUrl('javascript:alert(1)')).toBeNull();
    expect(resolveAppBaseUrl('ftp://example.com')).toBeNull();
  });
});
