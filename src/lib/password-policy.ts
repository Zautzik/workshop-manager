/**
 * Password policy aligned with NIST SP 800-63B-4 (2024).
 *
 * Rules enforced:
 *   1. Minimum 8 characters           (§3.1.1.1 — "SHALL be at least 8 characters")
 *   2. Maximum 128 characters         (implementation ceiling; NIST requires allowing ≥64)
 *   3. Deny-list of common passwords  (§3.1.1.2 — "SHALL be compared against a list of
 *                                       known-bad / compromised-credential values")
 *
 * Rules intentionally NOT enforced (NIST actively discourages them):
 *   - Mandatory complexity rules (uppercase / digit / special char) — NIST §3.1.1.2
 *     states these "SHALL NOT" be imposed as they add friction without increasing entropy.
 *   - Periodic forced rotation — NIST §3.1.1.3: rotate only on evidence of compromise.
 *
 * Production note: extend the deny-list by querying the Have I Been Pwned Passwords API
 * (k-anonymity model, no plaintext transmitted):
 *   https://haveibeenpwned.com/API/v3#PwnedPasswords
 */

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

/**
 * Top common / breached passwords that satisfy the 8-char minimum.
 * Only entries with ≥ 8 characters are relevant here — shorter ones
 * are already rejected by the length check in checkPassword().
 *
 * Source basis: SecLists Common-Credentials / HIBP top-prevalence list.
 * Stored lower-cased; comparison is case-insensitive.
 */
const COMMON_PASSWORDS = new Set<string>([
	// Numeric sequences
	'12345678', '123456789', '1234567890', '11111111', '22222222', '33333333',
	'44444444', '55555555', '66666666', '77777777', '88888888', '99999999',
	'00000000', '12341234', '11223344', '87654321', '98765432', '10203040',

	// Keyboard walks
	'1q2w3e4r', '1q2w3e4r5t', '1q2w3e4r5t6y', 'qwerty123', 'qwerty12',
	'qwertyuiop', 'qazwsxedc', 'asdfghjkl', 'zxcvbnm1', 'asdfasdf',
	'qazxswed', 'wsxedc', '1qaz2wsx', '1qazxsw2',

	// Dictionary words / phrases
	'password', 'password1', 'password2', 'password!', 'password123',
	'passw0rd', 'p@ssword', 'p@ssw0rd', 'pa$$word', 'pa$$w0rd',
	'iloveyou', 'iloveyou1', 'sunshine', 'sunshine1', 'princess',
	'princess1', 'football', 'football1', 'baseball', 'baseball1',
	'basketball', 'superman', 'superman1', 'batman123', 'spiderman',
	'trustno1', 'starwars', 'starwars1', 'changeme', 'changeme1',
	'whatever', 'whatever1', 'welcome1', 'welcome!', 'hello123',
	'hello1234', 'access14', 'computer', 'internet', 'corvette',
	'nintendo', 'february', 'december', 'november', 'birthday',
	'chocolate', 'beautiful', 'butterfly', 'monkey123', 'dragon123',
	'shadow123', 'master123', 'letmein1', 'letmein!', 'michael1',
	'jessica1', 'charlie1', 'qwerty1234', 'abc12345', 'abc123456',
	'abcd1234', '12345abc', 'abc123789', 'admin123', 'admin1234',
	'root1234', 'test1234', 'guest123', 'login123', 'user1234',
]);

/** Size of the common/breached-password deny-list (for surfacing the policy in UI). */
export const COMMON_PASSWORD_COUNT = COMMON_PASSWORDS.size;

export interface PasswordCheckResult {
	ok: boolean;
	/** Human-readable reason when ok === false. Safe to surface to the user. */
	reason?: string;
}

/**
 * Validate a plaintext password against the site policy.
 *
 * Returns `{ ok: true }` when the password is acceptable.
 * Returns `{ ok: false, reason: string }` with a user-facing message otherwise.
 */
export function checkPassword(password: string): PasswordCheckResult {
	if (password.length < MIN_PASSWORD_LENGTH) {
		return {
			ok: false,
			reason: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
		};
	}

	if (password.length > MAX_PASSWORD_LENGTH) {
		return {
			ok: false,
			reason: `Password must not exceed ${MAX_PASSWORD_LENGTH} characters.`,
		};
	}

	if (COMMON_PASSWORDS.has(password.toLowerCase())) {
		return {
			ok: false,
			reason: 'Password is too common. Choose something harder to guess.',
		};
	}

	return { ok: true };
}
