/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Small formatting helpers that had drifted into 3-4 near-identical
 * copies across the export modules, Pricing.tsx, AnalyticsMini.tsx, and
 * db.ts. Consolidated here so a change to money/byte formatting only
 * needs to happen once.
 */

export function formatMoney(n: number, opts: { abbreviateMillions?: boolean } = {}): string {
  if (opts.abbreviateMillions && n >= 1_000_000) {
    return `$${(n / 1_000_000).toFixed(1)}M`;
  }
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

export function parseMoney(s: string | undefined): number {
  if (!s) return 0;
  const n = Number(s.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '0 KB';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Turns a tender/entity name into a safe filename fragment for exports. */
export function safeFilename(name: string | undefined, fallback = 'Tender'): string {
  return (name || fallback).replace(/[^a-z0-9]+/gi, '_');
}

export function saveBlob(data: Blob | Uint8Array, filename: string, mimeType?: string) {
  const blob = data instanceof Blob ? data : new Blob([data as BlobPart], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
