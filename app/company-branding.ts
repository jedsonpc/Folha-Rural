const normalizeCompanyName = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

export function companyBrandImage(name: string) {
  const normalized = normalizeCompanyName(name);
  return normalized.includes("ivaldo alvim soares neto") ||
    normalized.includes("manoel antonio")
    ? "/empresa-ivaldo-manoel.png"
    : null;
}
