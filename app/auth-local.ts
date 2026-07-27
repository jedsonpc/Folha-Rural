const encoder = new TextEncoder();
const hex = (bytes: ArrayBuffer | Uint8Array) =>
  [...new Uint8Array(bytes instanceof ArrayBuffer ? bytes : bytes.buffer)]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
export const randomHex = (size = 32) => {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return hex(bytes);
};
export const sha256 = async (value: string) =>
  hex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
export async function hashPassword(password: string, salt: string) {
  const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(password),
      "PBKDF2",
      false,
      ["deriveBits"],
    ),
    bits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: encoder.encode(salt),
        iterations: 210000,
        hash: "SHA-256",
      },
      key,
      256,
    );
  return hex(bits);
}
export const cookieToken = (request: Request) =>
  request.headers.get("cookie")?.match(/(?:^|;\s*)fr_session=([^;]+)/)?.[1] ||
  "";
export const ALL_MODULES = [
  "Visão geral",
  "Empresas",
  "Colaboradores",
  "Serviços",
  "Sindicatos",
  "Tabelas oficiais",
  "Apontamentos",
  "Fechamento",
  "Relatórios",
  "Importar Access",
  "Usuários",
];
