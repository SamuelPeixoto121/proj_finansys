// Problemas de configuração que impedem o servidor de iniciar. Melhor falhar na
// inicialização, com uma mensagem clara, do que no primeiro login de um visitante.
export function findStartupProblems(env: NodeJS.ProcessEnv): string[] {
  const problems: string[] = [];

  if ((env.JWT_SECRET ?? "").length < 32) {
    problems.push("JWT_SECRET ausente ou com menos de 32 caracteres.");
  }

  if (env.NODE_ENV === "production" && !env.DB_HOST?.trim()) {
    problems.push("DB_HOST não definido: em produção, o banco não pode ser o localhost padrão.");
  }

  return problems;
}
