export function normalizePhone(input: string) {
  const digits = input.replace(/[\s+-]/g, "");
  const value = digits.startsWith("0")
    ? `254${digits.slice(1)}`
    : /^[17]\d{8}$/.test(digits)
      ? `254${digits}`
      : digits;
  if (!/^254[17]\d{8}$/.test(value))
    throw new Error("Invalid Kenyan mobile number");
  return value;
}
