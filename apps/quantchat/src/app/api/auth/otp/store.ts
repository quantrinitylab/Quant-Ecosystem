export const activeOtpCodes = new Map<string, { code: string; expiresAt: number }>();

export function getActiveOtpForTesting(phone: string) {
  return activeOtpCodes.get(phone);
}

export function clearOtpForTesting() {
  activeOtpCodes.clear();
}
