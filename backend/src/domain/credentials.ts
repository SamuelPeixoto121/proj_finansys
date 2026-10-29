import bcrypt from "bcryptjs";

// Hash válido (custo 12, igual ao das senhas reais) de uma senha que ninguém usa.
// Serve só para o login gastar o mesmo tempo quando o e-mail não existe.
export const DUMMY_PASSWORD_HASH =
  "$2b$12$yO8nFqeUtECCP1TFAXX8eOuCYukDQqQwe6OAFbEKiSaCPXmdOn2oi";

export type PasswordComparer = (
  password: string,
  hash: string,
) => Promise<boolean>;

export async function checkPassword(
  storedHash: string | undefined,
  password: string,
  compare: PasswordComparer = (plain, hash) => bcrypt.compare(plain, hash),
): Promise<boolean> {
  const matches = await compare(password, storedHash ?? DUMMY_PASSWORD_HASH);

  return storedHash !== undefined && matches;
}
