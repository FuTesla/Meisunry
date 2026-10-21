const fs = require('fs/promises');
const path = require('path');

// Coordinate cleanup with generation so in-flight writes finish before deletion.
function createThumbnailCache(directory) {
  let barrier = Promise.resolve();
  const active = new Set();
  const cacheName = /^[a-f0-9]{40}\.(?:jpg|png|json)(?:\.tmp)?$/;
  async function entries() {
    let names;
    try { names = await fs.readdir(directory, { withFileTypes: true }); }
    catch (error) { if (error.code === 'ENOENT') return []; throw error; }
    const files = [];
    for (const entry of names) {
      if (!entry.isFile() || !cacheName.test(entry.name)) continue;
      const filePath = path.join(directory, entry.name);
      try { const stat = await fs.lstat(filePath); if (stat.isFile()) files.push({ filePath, name: entry.name, size: stat.size }); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    return files;
  }
  function summarize(files) {
    return { count: files.filter(file => /\.(jpg|png)$/.test(file.name)).length, bytes: files.reduce((sum, file) => sum + file.size, 0) };
  }
  return {
    run(task) {
      const operation = barrier.then(task);
      active.add(operation);
      operation.then(() => active.delete(operation), () => active.delete(operation));
      return operation;
    },
    async info() { await barrier; return summarize(await entries()); },
    clear() {
      const pending = [...active];
      const operation = barrier.then(async () => {
        await Promise.allSettled(pending);
        const files = await entries();
        for (const file of files) {
          try { await fs.unlink(file.filePath); }
          catch (error) { if (error.code !== 'ENOENT') throw error; }
        }
        const deleted = summarize(files);
        return { deletedCount: deleted.count, deletedBytes: deleted.bytes, remaining: summarize(await entries()) };
      });
      barrier = operation.catch(() => {});
      return operation;
    }
  };
}
module.exports = { createThumbnailCache };
