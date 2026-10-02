import { ZipReader, Uint8ArrayReader } from '@zip.js/zip.js/lib/zip-core-native.js';

// Native compression only: no WASM, remote worker scripts, disk extraction or relaxed CSP.
export async function readBillZip(bytes, { password = '', budget = 20 * 1024 * 1024, maxFiles = 40, maxFileBytes = 4 * 1024 * 1024, signal } = {}) {
  const reader = new ZipReader(new Uint8ArrayReader(bytes), { useWebWorkers: false, useCompressionStream: true, strictness: 'strict' });
  try {
    const entries = [];
    for await (const entry of reader.getEntriesGenerator()) {
      signal?.throwIfAborted();
      if (entries.length >= maxFiles + 10) throw new Error('ZIP 内文件数量过多，请按月份拆分');
      entries.push(entry);
    }
    const files = entries.filter(entry => !entry.directory), names = new Set();
    let declared = 0;
    if (files.length > maxFiles) throw new Error('ZIP 内文件数量过多，请按月份拆分');
    for (const entry of files) {
      if (!entry.filename || entry.filename.length > 240 || entry.filename.startsWith('/') || entry.filename.includes('\\') || entry.filename.split('/').some(part => part === '..' || part === '.') || names.has(entry.filename)) throw new Error('ZIP 含不安全或重复文件名，未解压');
      names.add(entry.filename);
      if (!Number.isSafeInteger(entry.uncompressedSize) || entry.uncompressedSize < 0 || entry.uncompressedSize > maxFileBytes) throw new Error('ZIP 内单份文件超过 4 MB，未解压');
      declared += entry.uncompressedSize;
      if (declared > budget) throw new Error('ZIP 解压后超过本批 20 MB 限额');
      if (entry.encrypted && !password) throw new Error('需要此份 ZIP 的解压码；不是支付密码，且不会上传');
    }
    if (!files.length) throw new Error('ZIP 中没有文件');
    const result = [], actualBudget = { used: 0 };
    for (const entry of files) {
      if (!/\.csv$/i.test(entry.filename)) { result.push({ name: entry.filename, error: 'ZIP 内不是 CSV，当前未适配该格式；未忽略此文件' }); continue; }
      const chunks = []; let size = 0;
      try {
        await entry.getData(new WritableStream({ write(chunk) {
          size += chunk.byteLength; actualBudget.used += chunk.byteLength;
          if (size > maxFileBytes || actualBudget.used > budget) throw new Error('ZIP 实际解压大小超过限额');
          chunks.push(chunk.slice());
        } }), { password, checkCrc32: true, checkAuthenticationCode: true, useWebWorkers: false, useCompressionStream: true, signal });
      } catch { throw new Error('ZIP 解密／校验失败：请检查解压码或重新取得原件；未计入此压缩包'); }
      if (size !== entry.uncompressedSize) throw new Error('ZIP 实际大小与声明不一致，未计入');
      const data = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
      result.push({ name: entry.filename, bytes: data });
    }
    return result;
  } catch (error) {
    signal?.throwIfAborted();
    if (/^(ZIP|需要)/.test(error.message)) throw error;
    throw new Error('ZIP 无法读取：结构损坏、文件名不安全或压缩格式不支持；未计入此文件');
  } finally { await reader.close(); }
}
