/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Upload validation tests — filename sanitisation (Part 13) and file
 * size/type enforcement (Part 14).
 */
import { describe, it, expect } from 'vitest';
import { sanitizeFileName, validateUpload, partitionUploads, MAX_UPLOAD_BYTES } from '../src/lib/uploadValidation';

function fileOfSize(name: string, bytes: number, type = ''): File {
  // A File whose .size reports `bytes` without allocating them.
  const f = new File(['x'], name, { type });
  Object.defineProperty(f, 'size', { value: bytes });
  return f;
}

describe('sanitizeFileName', () => {
  it('slugs spaces, special characters and case', () => {
    expect(sanitizeFileName('Tender Addendum #1 (Final).pdf')).toBe('tender-addendum-1-final.pdf');
  });

  it('lowercases the extension', () => {
    expect(sanitizeFileName('SCOPE.PDF')).toBe('scope.pdf');
    expect(sanitizeFileName('Pricing.XLSX')).toBe('pricing.xlsx');
  });

  it('neutralises path traversal and slashes', () => {
    const out = sanitizeFileName('../../etc/passwd.txt');
    expect(out).not.toContain('..');
    expect(out).not.toContain('/');
    expect(out).toBe('etc-passwd.txt');
  });

  it('strips diacritics and collapses unsafe runs', () => {
    expect(sanitizeFileName('Résumé   —   Jane   Doe.docx')).toBe('resume-jane-doe.docx');
  });

  it('never returns an empty base', () => {
    expect(sanitizeFileName('###.pdf')).toBe('file.pdf');
  });

  it('drops an extension that is not on the allowlist', () => {
    // A disguised type can't smuggle an unexpected extension into the path.
    expect(sanitizeFileName('malware.exe')).toBe('malware');
  });
});

describe('validateUpload', () => {
  it('accepts a supported file within the size limit', () => {
    expect(validateUpload(fileOfSize('scope.pdf', 1024)).ok).toBe(true);
    expect(validateUpload(fileOfSize('rates.xlsx', 1024)).ok).toBe(true);
  });

  it('rejects an unsupported type with a clear reason', () => {
    const r = validateUpload(fileOfSize('drawings.zip', 1024));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/unsupported file type/i);
  });

  it('rejects an oversized file with a clear reason', () => {
    const r = validateUpload(fileOfSize('huge.pdf', MAX_UPLOAD_BYTES + 1));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/too large/i);
  });

  it('honours a custom max size', () => {
    expect(validateUpload(fileOfSize('a.pdf', 2048), { maxBytes: 1024 }).ok).toBe(false);
  });
});

describe('partitionUploads', () => {
  it('separates accepted files from human-readable rejections', () => {
    const files = [
      fileOfSize('ok.pdf', 1000),
      fileOfSize('bad.zip', 1000),
      fileOfSize('big.docx', MAX_UPLOAD_BYTES + 1),
    ];
    const { accepted, rejected } = partitionUploads(files);
    expect(accepted.map((f) => f.name)).toEqual(['ok.pdf']);
    expect(rejected).toHaveLength(2);
    expect(rejected.some((r) => /bad\.zip/.test(r))).toBe(true);
    expect(rejected.some((r) => /big\.docx/.test(r))).toBe(true);
  });
});
