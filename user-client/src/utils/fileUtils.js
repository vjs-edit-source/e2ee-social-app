/**
 * Truncate long file names with '.......' preserving the file extension.
 * Example:
 * "super_long_photo_of_mountains_sunset.png" -> "super_long_ph.......png"
 * "presentation_final_version.heic" -> "presentation_.......heic"
 */
export function formatTruncatedFileName(fileName, maxBaseLen = 14) {
  if (!fileName || typeof fileName !== 'string') return '';
  const lastDotIndex = fileName.lastIndexOf('.');
  if (lastDotIndex === -1) {
    if (fileName.length > maxBaseLen) {
      return `${fileName.slice(0, maxBaseLen)}.......`;
    }
    return fileName;
  }
  const baseName = fileName.slice(0, lastDotIndex);
  const ext = fileName.slice(lastDotIndex + 1);
  if (baseName.length > maxBaseLen) {
    return `${baseName.slice(0, maxBaseLen)}.......${ext}`;
  }
  return fileName;
}

/**
  * Safely extract a pure string blob/media URL from any raw value,
  * whether it was already a string or wrapped in an object { objectUrl, url }.
  */
export function resolveMediaUrl(raw) {
  if (!raw) return '';
  if (typeof raw === 'string') return raw;
  if (typeof raw.objectUrl === 'string') return raw.objectUrl;
  if (typeof raw.url === 'string') return raw.url;
  if (typeof raw.toString === 'function') {
    const s = raw.toString();
    if (s && s !== '[object Object]') return s;
  }
  return '';
}
