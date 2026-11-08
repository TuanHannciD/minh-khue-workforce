import * as argon2 from "argon2";

export const passwordOptions = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
  hashLength: 32,
} as const;

export function validatePassword(password: string) {
  if (
    Array.from(password).length < 12 ||
    Buffer.byteLength(password, "utf8") > 1024
  )
    throw new Error(
      "Password must have at least 12 characters and at most 1024 UTF-8 bytes",
    );
}
export async function hashPassword(password: string) {
  validatePassword(password);
  return argon2.hash(password, passwordOptions);
}
export async function verifyPassword(hash: string, password: string) {
  return argon2.verify(hash, password);
}
