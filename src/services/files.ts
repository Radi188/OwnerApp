import { Platform } from 'react-native';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { ApiError, apiFetch, apiRequestInfo } from './api';

/** "attachment; filename=\"Report Nov 2026.xlsx\"" → "Report Nov 2026.xlsx" */
function fileNameFrom(disposition: string | undefined, fallback: string): string {
  if (!disposition) return fallback;
  const star = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(disposition);
  if (star) { try { return decodeURIComponent(star[1].replace(/"/g, '').trim()); } catch { /* fall through */ } }
  const plain = /filename="?([^";]+)"?/i.exec(disposition);
  return plain ? plain[1].trim() : fallback;
}

const safe = (name: string) => name.replace(/[\\/:*?"<>|]+/g, '-');

/**
 * Download an authenticated API file (invoice PDF, Excel report) and open it in the system viewer,
 * which also offers Share / Save to Files. Retries once after refreshing an expired session.
 */
export async function downloadAndOpen(path: string, fallbackName: string, mime: string): Promise<void> {
  const dir = ReactNativeBlobUtil.fs.dirs.CacheDir;
  const tmp = `${dir}/dl-${Date.now()}`;

  const attempt = async () => {
    const { url, headers } = apiRequestInfo(path);
    return ReactNativeBlobUtil.config({ path: tmp }).fetch('GET', url, headers);
  };

  let res = await attempt();
  if (res.info().status === 401) {
    // A cheap authenticated call runs apiFetch's refresh / re-login logic, then try again
    await apiFetch('/users/me').catch(() => {});
    res = await attempt();
  }

  const info = res.info();
  const saved = res.path() ?? tmp;
  if (info.status >= 400) {
    let message = 'Download failed';
    // The error body is JSON ({ status, message }) — read it from the downloaded file
    try { message = JSON.parse(String(await res.readFile('utf8')))?.message ?? message; } catch { /* binary / empty */ }
    ReactNativeBlobUtil.fs.unlink(saved).catch(() => {});
    throw new ApiError(info.status, message);
  }

  const headers = info.headers ?? {};
  const disposition = headers['content-disposition'] ?? headers['Content-Disposition'];
  const target = `${dir}/${safe(fileNameFrom(disposition, fallbackName))}`;
  if (await ReactNativeBlobUtil.fs.exists(target)) await ReactNativeBlobUtil.fs.unlink(target);
  await ReactNativeBlobUtil.fs.mv(saved, target);

  if (Platform.OS === 'ios') await ReactNativeBlobUtil.ios.openDocument(target);
  else await ReactNativeBlobUtil.android.actionViewIntent(target, mime);
}

export const MIME = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};
