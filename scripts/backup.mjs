import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { appendFile, link, open, readFile, rm, writeFile } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { createGzip, createGunzip } from 'node:zlib';

const [command, input, output, keyPath] = process.argv.slice(2);
const magic = Buffer.from('STOCKS01');
async function digest(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}
if (command === 'keygen' && input) {
  await writeFile(input, randomBytes(32), { mode: 0o600, flag: 'wx' });
} else if ((command === 'seal' || command === 'open') && input && output && keyPath) {
  const key = await readFile(keyPath);
  if (key.length !== 32) throw new Error('Expected a 32-byte backup key');
  if (command === 'seal') {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
    const header = Buffer.concat([magic, iv]);
    cipher.setAAD(header);
    await writeFile(output, header, { mode: 0o600, flag: 'wx' });
    await pipeline(createReadStream(input), createGzip(), cipher, createWriteStream(output, { flags: 'a' }));
    await appendFile(output, cipher.getAuthTag());
    await writeFile(`${output}.manifest.json`, JSON.stringify({ version: 1, sqlSha256: await digest(input), sealedSha256: await digest(output) }, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  } else {
    const source = await open(input, 'r');
    let size, header, tag;
    try {
      size = (await source.stat()).size;
      if (size < 36) throw new Error('Invalid archive');
      header = Buffer.alloc(20); tag = Buffer.alloc(16);
      await source.read(header, 0, 20, 0);
      await source.read(tag, 0, 16, size - 16);
    } finally { await source.close(); }
    if (!header.subarray(0,8).equals(magic)) throw new Error('Invalid archive');
    const decipher = createDecipheriv('aes-256-gcm', key, header.subarray(8));
    decipher.setAAD(header); decipher.setAuthTag(tag);
    const temporary = `${output}.partial-${randomBytes(8).toString('hex')}`;
    try {
      await pipeline(createReadStream(input, { start: 20, end: size - 17 }), decipher, createGunzip(), createWriteStream(temporary, { mode: 0o600, flags: 'wx' }));
      const manifest = JSON.parse(await readFile(`${input}.manifest.json`, 'utf8'));
      if (manifest.sqlSha256 !== await digest(temporary) || manifest.sealedSha256 !== await digest(input)) throw new Error('Backup checksum mismatch');
      await link(temporary, output);
    } finally { await rm(temporary, { force: true }); }

  }
} else {
  throw new Error('Usage: backup.mjs keygen KEY | seal INPUT_SQL OUTPUT KEY | open INPUT OUTPUT_SQL KEY');
}
