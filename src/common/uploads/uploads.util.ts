import { BadRequestException, StreamableFile } from '@nestjs/common';
import { createReadStream, existsSync } from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { NotFoundException } from '@nestjs/common';

export interface DetectedFile {
  ext: string;
  mime: string;
}

const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.pdf': 'application/pdf',
};

/** Identifies a file from its leading bytes; the client's name/type are untrusted. */
export function detectFileType(buffer: Buffer): DetectedFile | null {
  const hex = buffer.subarray(0, 12).toString('hex');
  if (hex.startsWith('ffd8ff')) return { ext: '.jpg', mime: 'image/jpeg' };
  if (hex.startsWith('89504e470d0a1a0a')) {
    return { ext: '.png', mime: 'image/png' };
  }
  if (hex.startsWith('47494638')) return { ext: '.gif', mime: 'image/gif' };
  if (
    hex.startsWith('52494646') &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { ext: '.webp', mime: 'image/webp' };
  }
  if (buffer.subarray(0, 5).toString('ascii') === '%PDF-') {
    return { ext: '.pdf', mime: 'application/pdf' };
  }
  return null;
}

export function uploadsRoot(): string {
  return path.join(process.cwd(), 'uploads');
}

/**
 * Validates and stores an uploaded file under uploads/<folder>, returning the
 * relative path to persist (e.g. "receipts/<uuid>.pdf").
 */
export async function saveUpload(
  file: { buffer: Buffer } | undefined,
  folder: string,
  opts: { allowPdf: boolean; label: string },
): Promise<string> {
  if (!file?.buffer?.length) {
    throw new BadRequestException(`${opts.label} is required`);
  }
  const type = detectFileType(file.buffer);
  if (!type || (type.ext === '.pdf' && !opts.allowPdf)) {
    throw new BadRequestException(
      `${opts.label} must be an image (JPG, PNG, WEBP, GIF)${opts.allowPdf ? ' or a PDF' : ''}`,
    );
  }
  const dir = path.join(uploadsRoot(), folder);
  await fs.mkdir(dir, { recursive: true });
  const filename = `${randomUUID()}${type.ext}`;
  await fs.writeFile(path.join(dir, filename), file.buffer);
  return `${folder}/${filename}`;
}

/** Streams a stored upload with the right content type. */
export function streamUpload(relativePath: string): StreamableFile {
  const root = uploadsRoot();
  const fullPath = path.resolve(root, relativePath);
  if (!fullPath.startsWith(root + path.sep) || !existsSync(fullPath)) {
    throw new NotFoundException('File not found');
  }
  const ext = path.extname(fullPath).toLowerCase();
  return new StreamableFile(createReadStream(fullPath), {
    type: MIME_BY_EXT[ext] ?? 'application/octet-stream',
    disposition: 'inline',
  });
}

export async function deleteUpload(relativePath: string): Promise<void> {
  const root = uploadsRoot();
  const fullPath = path.resolve(root, relativePath);
  if (!fullPath.startsWith(root + path.sep)) return;
  await fs.rm(fullPath, { force: true });
}
