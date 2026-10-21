const fs = require('fs');
const path = require('path');
const exifr = require('exifr');

async function readMediaMetadata(filePath) {
  if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) throw new Error('文件路径无效');
  const stat = await fs.promises.stat(filePath);
  if (!stat.isFile()) throw new Error('请选择照片文件');
  const result = {
    name: path.basename(filePath), fullPath: filePath,
    format: path.extname(filePath).slice(1).toUpperCase(),
    size: stat.size, createdAt: stat.birthtime.toISOString(), modifiedAt: stat.mtime.toISOString(),
    exif: {}, exifStatus: 'missing'
  };
  try {
    const tags = await exifr.parse(filePath, {
      pick: ['Make', 'Model', 'LensModel', 'DateTimeOriginal', 'ExposureTime', 'FNumber', 'ISO', 'ISOSpeedRatings', 'FocalLength', 'FocalLengthIn35mmFormat', 'Orientation', 'ColorSpace', 'Software', 'Artist', 'Copyright', 'latitude', 'longitude']
    });
    for (const [key, value] of Object.entries(tags || {})) {
      if (value instanceof Date) result.exif[key] = value.toISOString();
      else if (typeof value === 'string' || typeof value === 'number') result.exif[key] = value;
    }
    if (Object.keys(result.exif).length) result.exifStatus = 'available';
  } catch { result.exifStatus = 'unreadable'; }
  return result;
}

module.exports = { readMediaMetadata };
