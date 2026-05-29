import { MockQualifiedSignatureProvider } from './mock.js';
const providers = [MockQualifiedSignatureProvider];
export function getQualifiedSignatureProvider(code) {
    const c = String(code || '').trim().toUpperCase();
    return providers.find((p) => p.code.toUpperCase() === c) || null;
}
