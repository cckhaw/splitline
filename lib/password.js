// Centralized password policy — signup and password-change both import
// this so the rule can't drift between the two check sites.
export const PASSWORD_MIN_LENGTH = 12;

export const PASSWORD_REQUIREMENTS_TEXT =
  "Password needs to be at least 12 characters, with at least one uppercase letter, one lowercase letter, one number, and one symbol.";

export function isValidPassword(password) {
  if (!password || password.length < PASSWORD_MIN_LENGTH) return false;
  if (!/[A-Z]/.test(password)) return false;
  if (!/[a-z]/.test(password)) return false;
  if (!/[0-9]/.test(password)) return false;
  if (!/[^A-Za-z0-9]/.test(password)) return false;
  return true;
}
