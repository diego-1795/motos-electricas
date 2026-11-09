#!/usr/bin/env node
/**
 * Genera la entrada de ADMIN_INITIAL_PASSWORDS para un usuario del panel (ADR-024) y, si no se indica
 * contraseña, una temporal aleatoria. También puede generar un SESSION_SECRET.
 *
 *   node scripts/admin-password.mjs <email> [contraseña]   → imprime la contraseña (si es nueva) y la línea con el hash
 *   node scripts/admin-password.mjs --secret                → imprime un SESSION_SECRET aleatorio (48 caracteres)
 *
 * Mismo algoritmo que functions/api/admin/_lib/auth.ts: PBKDF2-SHA256, 100 000 iteraciones, sal de 16 bytes,
 * formato `pbkdf2-sha256:<iter>:<sal b64url>:<hash b64url>`. No necesita dependencias (WebCrypto de Node ≥ 20).
 */
import { webcrypto } from 'node:crypto';

const { subtle, getRandomValues } = webcrypto;
const ITERATIONS = 100_000;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

const b64url = (bytes) => Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function randomString(length, alphabet = ALPHABET) {
  const out = [];
  const bytes = getRandomValues.call(webcrypto, new Uint8Array(length * 2));
  for (const b of bytes) {
    if (out.length === length) break;
    // Rechazo de módulo para no sesgar la distribución
    if (b < 256 - (256 % alphabet.length)) out.push(alphabet[b % alphabet.length]);
  }
  return out.length === length ? out.join('') : randomString(length, alphabet);
}

async function hashPassword(password) {
  const salt = getRandomValues.call(webcrypto, new Uint8Array(16));
  const key = await subtle.importKey('raw', new TextEncoder().encode(password.normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS }, key, 256);
  return `pbkdf2-sha256:${ITERATIONS}:${b64url(salt)}:${b64url(new Uint8Array(bits))}`;
}

const [arg1, arg2] = process.argv.slice(2);

if (!arg1 || arg1 === '-h' || arg1 === '--help') {
  console.log('Uso:\n  node scripts/admin-password.mjs <email> [contraseña]\n  node scripts/admin-password.mjs --secret');
  process.exit(arg1 ? 0 : 1);
}

if (arg1 === '--secret') {
  console.log(`SESSION_SECRET=${randomString(48)}`);
  process.exit(0);
}

const email = arg1.trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error(`Email no válido: ${arg1}`);
  process.exit(1);
}
const generated = !arg2;
const password = arg2 ?? `${randomString(4)}-${randomString(4)}-${randomString(4)}`;
if (password.length < 10) {
  console.error('La contraseña debe tener al menos 10 caracteres');
  process.exit(1);
}
const hash = await hashPassword(password);
if (generated) console.log(`Contraseña temporal para ${email} (entrégala en mano; al entrar deberá cambiarla):\n  ${password}\n`);
console.log(`Entrada para ADMIN_INITIAL_PASSWORDS (varias se separan con coma):\n  ${email}:${hash}`);
