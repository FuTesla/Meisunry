const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const asar = require('@electron/asar');

const archive = path.resolve('dist/win-unpacked/resources/app.asar');
const files = asar.listPackage(archive).map(name => name.replace(/\\/g, '/').replace(/^\//, ''));
const forbidden = /(^|\/)(appdata\.json|thumbnail-cache|userData|Local Storage|Session Storage|Cookies|History|\.git|\.vs)(\/|$)|\.(log|tmp)$/i;
for (const file of files) {
  assert(!forbidden.test(file), `Private or temporary data in release: ${file}`);
  const top = file.split('/')[0];
  assert(['mains', 'renderers', 'shared', 'app-icons', 'node_modules', 'package.json', 'LICENSE'].includes(top), `Unexpected packaged path: ${file}`);
}
for (const file of ['mains/main.js', 'mains/main-functions.js', 'renderers/index.html', 'shared/theme.js', 'node_modules/exifr/package.json', 'node_modules/lucide/dist/umd/lucide.min.js']) {
  assert(files.includes(file), `Missing runtime file: ${file}`);
}
assert(!files.includes('app-icons/demo.gif'));
const defaults = asar.extractFile(archive, 'mains/main-functions.js').toString();
assert(defaults.includes('folderLocation: ""'), 'First run must start without a personal folder');
const packed = JSON.parse(asar.extractFile(archive, 'package.json'));
assert.equal(packed.version, require('../package.json').version);
const unpacked = archive + '.unpacked';
function checkUnpacked(directory) {
  if (!fs.existsSync(directory)) return;
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    const location = path.join(directory, item.name);
    assert(!forbidden.test(path.relative(unpacked, location).replace(/\\/g, '/')), `Private unpacked data: ${location}`);
    if (item.isDirectory()) checkUnpacked(location);
  }
}
checkUnpacked(unpacked);
console.log(`Release ${packed.version}: ${files.length} archive entries verified; no personal data paths found.`);
