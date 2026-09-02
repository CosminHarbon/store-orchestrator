import { formatBytes, MEDIA_QUOTA_BYTES } from './constants';

export type MediaErrorCode =
  | 'SOURCE_TOO_LARGE'
  | 'UNSUPPORTED'
  | 'QUOTA'
  | 'NETWORK'
  | 'UNAUTHORIZED'
  | 'GENERIC';

export class MediaError extends Error {
  readonly code: MediaErrorCode;
  readonly quotaBytes?: number;

  constructor(code: MediaErrorCode, message: string, quotaBytes?: number) {
    super(message);
    this.name = 'MediaError';
    this.code = code;
    this.quotaBytes = quotaBytes;
  }
}

export function merchantMediaMessage(
  error: unknown,
  t: (key: string, opts?: Record<string, string>) => string,
): string {
  if (error instanceof MediaError) {
    if (error.code === 'SOURCE_TOO_LARGE') {
      return error.message.includes('5 MB')
        ? t('media.errors.sourceTooLargeLogo')
        : t('media.errors.sourceTooLarge');
    }
    if (error.code === 'UNSUPPORTED') return t('media.errors.unsupported');
    if (error.code === 'QUOTA') {
      return t('media.errors.quota', {
        quota: formatBytes(error.quotaBytes || MEDIA_QUOTA_BYTES.start),
      });
    }
    if (error.code === 'NETWORK') return t('media.errors.network');
    if (error.code === 'UNAUTHORIZED') return t('media.errors.unauthorized');
  }
  return t('media.errors.generic');
}
