#!/usr/bin/env node
/**
 * Utilitário para gerar os hashes de senha que vão pra env var
 * `MEMBER_CREDENTIALS`.
 *
 * Uso:
 *   JWT_SECRET="..." node scripts/hash-password.mjs <username> <senha>
 *
 * Exemplo:
 *   JWT_SECRET="abc...32+chars..." node scripts/hash-password.mjs anna "minha-senha"
 *
 * Saída: linha no formato `username:sha256hex` pronta pra concatenar em
 * `MEMBER_CREDENTIALS="anna:...|daniel:...|..."`.
 *
 * IMPORTANTE: usa o mesmo algoritmo de `lib/auth.ts#hashPassword` —
 * SHA-256(senha + JWT_SECRET). Se o JWT_SECRET mudar, todos os hashes têm
 * que ser regerados.
 */

import { createHash } from 'node:crypto'

const [, , username, senha] = process.argv
const secret = process.env.JWT_SECRET

if (!secret) {
  console.error('Defina a env JWT_SECRET antes de rodar (o mesmo valor que vai pro deploy).')
  process.exit(1)
}

if (secret.length < 32) {
  console.error('JWT_SECRET tem menos de 32 caracteres — gere com: openssl rand -hex 32')
  process.exit(1)
}

if (!username || !senha) {
  console.error('Uso: JWT_SECRET=... node scripts/hash-password.mjs <username> <senha>')
  process.exit(1)
}

const hash = createHash('sha256').update(senha + secret).digest('hex')
console.log(`${username.trim().toLowerCase()}:${hash}`)
