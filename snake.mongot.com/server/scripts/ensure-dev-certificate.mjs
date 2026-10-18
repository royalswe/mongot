import { execFileSync } from 'node:child_process';
import { createPrivateKey, createPublicKey, X509Certificate } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const certificateDirectory = resolve(fileURLToPath(new URL('../../.local-certs', import.meta.url)));
const certificatePath = resolve(certificateDirectory, 'certificate.pem');
const keyPath = resolve(certificateDirectory, 'key.pem');
const renewalThreshold = Date.now() + 30 * 24 * 60 * 60 * 1000;

function hasUsableCertificate() {
	try {
		if (!existsSync(keyPath)) {
			return false;
		}

		const certificate = new X509Certificate(readFileSync(certificatePath));
		const certificateKey = certificate.publicKey.export({ type: 'spki', format: 'der' });
		const privateKey = createPublicKey(createPrivateKey(readFileSync(keyPath))).export({
			type: 'spki',
			format: 'der'
		});
		return (
			certificate.checkHost('localhost') !== undefined &&
			certificate.checkIP('127.0.0.1') !== undefined &&
			certificateKey.equals(privateKey) &&
			Date.parse(certificate.validTo) > renewalThreshold
		);
	} catch {
		return false;
	}
}

if (!hasUsableCertificate()) {
	mkdirSync(certificateDirectory, { recursive: true });
	execFileSync('mkcert', ['-install'], { stdio: 'inherit' });
	execFileSync(
		'mkcert',
		[
			'-cert-file',
			certificatePath,
			'-key-file',
			keyPath,
			'localhost',
			'127.0.0.1',
			'::1'
		],
		{ stdio: 'inherit' }
	);

	if (!hasUsableCertificate()) {
		throw new Error('mkcert did not generate a valid local server certificate.');
	}
}
