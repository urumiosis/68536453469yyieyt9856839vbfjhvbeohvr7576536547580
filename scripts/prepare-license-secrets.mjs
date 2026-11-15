import { createPrivateKey, createPublicKey } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const [, , privateKeyPath, outputPath] = process.argv;
if (!privateKeyPath || !outputPath || process.argv.length !== 4) {
  console.error('Usage: node scripts/prepare-license-secrets.mjs <private-key.pk8> <output.env>');
  process.exit(1);
}

try {
  const bytes = await readFile(privateKeyPath);
  const privateKey = createPrivateKey({ key: bytes, format: 'der', type: 'pkcs8' });
  if (privateKey.asymmetricKeyType !== 'ec' ||
      privateKey.asymmetricKeyDetails?.namedCurve !== 'prime256v1') {
    throw new Error('The signing key must be an ECDSA P-256 PKCS#8 key.');
  }
  const publicBytes = createPublicKey(privateKey).export({ format: 'der', type: 'spki' });
  const env = [
    'LICENSE_PRIVATE_KEY=' + bytes.toString('base64url'),
    'LICENSE_PUBLIC_KEY=' + publicBytes.toString('base64url'),
    ''
  ].join('\n');
  await writeFile(outputPath, env, { flag: 'wx', mode: 0o600 });
  console.log('Created restricted-permission secret env file outside Git. Public key:');
  console.log(publicBytes.toString('base64url'));
  console.log('Keep this env file and the original private key out of your repository.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
