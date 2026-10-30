export const NAME_MIN_LENGTH = 2;
export const NAME_MAX_LENGTH = 120;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_BYTES = 72;

export const NAME_ERROR = `O nome deve ter entre ${NAME_MIN_LENGTH} e ${NAME_MAX_LENGTH} caracteres.`;
export const PASSWORD_ERROR = `A senha deve ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres e no máximo ${PASSWORD_MAX_BYTES} bytes.`;

export function validateName(value: unknown): { value?: string; error?: string } {
  if (typeof value !== "string") {
    return { error: NAME_ERROR };
  }

  const name = value.trim();

  if (name.length < NAME_MIN_LENGTH || name.length > NAME_MAX_LENGTH) {
    return { error: NAME_ERROR };
  }

  return { value: name };
}

export function isValidPassword(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= PASSWORD_MIN_LENGTH &&
    Buffer.byteLength(value, "utf8") <= PASSWORD_MAX_BYTES
  );
}

export function parseProfileUpdate(body: unknown): {
  value?: { name: string };
  error?: string;
} {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Envie os dados do perfil." };
  }

  const name = validateName((body as Record<string, unknown>).name);

  return name.value === undefined ? { error: name.error } : { value: { name: name.value } };
}

export function parsePasswordChange(body: unknown): {
  value?: { currentPassword: string; newPassword: string };
  error?: string;
} {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Envie a senha atual e a nova senha." };
  }

  const { currentPassword, newPassword } = body as Record<string, unknown>;

  if (typeof currentPassword !== "string" || currentPassword.length === 0) {
    return { error: "Informe a senha atual." };
  }

  if (!isValidPassword(newPassword)) {
    return { error: PASSWORD_ERROR };
  }

  if (newPassword === currentPassword) {
    return { error: "A nova senha deve ser diferente da atual." };
  }

  return { value: { currentPassword, newPassword } };
}
