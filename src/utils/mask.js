export function maskPAN(pan) {
  if (!pan) return null;
  // typical PAN: 10 characters — show first 3 and last 2
  if (pan.length <= 5) return "*****";
  const first = pan.slice(0, 3);
  const last = pan.slice(-2);
  return `${first}*****${last}`;
}

export function maskAccount(accountNo) {
  if (!accountNo) return null;
  const len = accountNo.length;
  if (len <= 4) return "****";
  const visible = 4;
  return `${"*".repeat(len - visible)}${accountNo.slice(-visible)}`;
}
