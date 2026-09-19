/**
 * Universal file downloader for SadiSocial (Web & Android Capacitor).
 * On Android, routes to native Java AndroidCallBridge to write directly to phone's public Downloads directory.
 */
export async function downloadFile(urlOrBlob, fileName = 'download', mimeType = '') {
  if (!urlOrBlob) return;

  // 1. Android Native Bridge: Save directly to phone's Downloads directory
  if (
    typeof window !== 'undefined' &&
    window.AndroidCallBridge &&
    typeof window.AndroidCallBridge.saveFile === 'function'
  ) {
    try {
      let base64Data = '';
      if (typeof urlOrBlob === 'string') {
        if (urlOrBlob.startsWith('data:')) {
          base64Data = urlOrBlob;
        } else {
          // Fetch blob from blob: or http: URL
          const res = await fetch(urlOrBlob);
          const blob = await res.blob();
          base64Data = await blobToBase64(blob);
        }
      } else if (urlOrBlob instanceof Blob) {
        base64Data = await blobToBase64(urlOrBlob);
      }

      if (base64Data) {
        window.AndroidCallBridge.saveFile(
          base64Data,
          fileName || 'download',
          mimeType || 'application/octet-stream'
        );
        return;
      }
    } catch (err) {
      console.warn('Native Android saveFile failed, falling back to browser download:', err);
    }
  }

  // 2. Standard Web Browser Download Fallback
  try {
    const a = document.createElement('a');
    let objectUrl = null;

    if (typeof urlOrBlob === 'string') {
      a.href = urlOrBlob;
    } else if (urlOrBlob instanceof Blob) {
      objectUrl = URL.createObjectURL(urlOrBlob);
      a.href = objectUrl;
    }

    a.download = fileName || 'download';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    if (objectUrl) {
      setTimeout(() => URL.revokeObjectURL(objectUrl), 15000);
    }
  } catch (err) {
    console.error('Download failed:', err);
  }
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
