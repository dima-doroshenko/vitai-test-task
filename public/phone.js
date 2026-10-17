// Belarus fixed/mobile/VoIP patterns from google/libphonenumber, Apache-2.0.
// Snapshot 2026-10-17; see docs/materials.md. No runtime library needed.
const national = /^(?:(?:1(?:5(?:1[1-5]|[24]\d|6[2-4]|9[1-7])|6(?:[235]\d|4[1-7])|7\d\d)|2(?:1(?:[246]\d|3[0-35-9]|5[1-9])|2(?:[235]\d|4[0-8])|3(?:[26]\d|3[02-79]|4[024-7]|5[03-7])))\d{5}|(?:2(?:5[5-79]|9[1-9])|(?:33|44)\d)\d{6}|249\d{6})$/;
export function normalizePhone(value) {
  if (typeof value !== 'string' || value.length > 40 || !/^\+?[\d\s()\-–]+$/.test(value.trim())) return null;
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('810375')) digits = digits.slice(3);
  if (digits.length === 12 && digits.startsWith('375')) digits = digits.slice(3);
  else if (value.trim().startsWith('+')) return null;
  else if (digits.length === 11 && digits.startsWith('80')) digits = digits.slice(2);
  else if (digits.length === 10 && /^[08]/.test(digits)) digits = digits.slice(1);
  return digits.length === 9 && national.test(digits) ? '+375' + digits : null;
}
