/**
 * IP Matching & CIDR Evaluation Engine for Placify CRM
 * Supports IPv4, IPv6, CIDR blocks (/24, /16, etc.), and IP address normalization.
 */

export interface OfficeIpConfig {
  id: string;
  ip: string; // e.g. "198.51.100.10" or "192.168.1.0/24"
  label: string; // e.g. "Placify Headquarters"
  description?: string;
  is_active: boolean;
  created_at: string;
  created_by?: string;
}

export interface UserIpAccessConfig {
  external_access_enabled?: boolean;
  allowed_external_ips?: string[];
  access_status?: 'active' | 'suspended' | 'revoked';
  external_access_notes?: string;
  external_access_updated_at?: string;
  external_access_updated_by?: string;
}

export interface EvaluateIpAccessParams {
  clientIp: string;
  user?: {
    id?: string | number;
    username?: string;
    role?: string;
    email?: string;
    display_name?: string;
    external_access_enabled?: boolean;
    allowed_external_ips?: string[];
    access_status?: 'active' | 'suspended' | 'revoked';
  } | null;
  officeIps: OfficeIpConfig[];
  enforceIpControl?: boolean;
  adminLockoutPrevention?: boolean;
}

export interface IpAccessResult {
  allowed: boolean;
  reason: 
    | 'office_ip'
    | 'external_whitelist_all'
    | 'external_ip_matched'
    | 'external_access_disabled'
    | 'external_ip_not_matched'
    | 'access_status_suspended'
    | 'admin_lockout_safeguard'
    | 'admin_initial_setup_safeguard'
    | 'enforcement_disabled'
    | 'candidate_portal_access'
    | 'unauthenticated';
  message: string;
  clientIp: string;
  isOfficeIp: boolean;
  matchedRule?: string;
}

/**
 * Normalizes an IP string:
 * - Trims whitespace
 * - Strips IPv4-mapped IPv6 prefixes (::ffff:192.168.1.1 -> 192.168.1.1)
 * - Standardizes IPv6 loopback (::1 -> 127.0.0.1 for local dev convenience)
 */
export function normalizeIp(ip: string | undefined | null): string {
  if (!ip) return '127.0.0.1';
  let clean = ip.trim();

  // If comma separated (e.g. from x-forwarded-for: "client, proxy1, proxy2"), take the first one
  if (clean.includes(',')) {
    clean = clean.split(',')[0].trim();
  }

  // Strip IPv4-mapped IPv6 prefix ::ffff:
  if (clean.startsWith('::ffff:')) {
    clean = clean.substring(7);
  }

  // Handle standard IPv6 localhost
  if (clean === '::1') {
    return '127.0.0.1';
  }

  return clean;
}

/**
 * Converts an IPv4 string to a 32-bit unsigned number.
 * Returns null if the string is not a valid IPv4 address.
 */
export function ipv4ToNumber(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;

  let num = 0;
  for (let i = 0; i < 4; i++) {
    const part = parseInt(parts[i], 10);
    if (isNaN(part) || part < 0 || part > 255 || String(part) !== parts[i]) {
      return null;
    }
    num = (num << 8) + part;
  }
  return num >>> 0;
}

/**
 * Checks if an IP is within a CIDR block or matches a single IP.
 * Supports:
 * - Single IPv4: "192.168.1.50" (implicitly /32)
 * - CIDR IPv4: "192.168.1.0/24"
 * - Exact IPv6 match: "2001:db8::1"
 */
export function isIpInCidr(clientIp: string, cidrOrIp: string): boolean {
  const normClient = normalizeIp(clientIp);
  const normRule = normalizeIp(cidrOrIp);

  // Exact string match (handles IPv6 exact matches, hostnames, localhost)
  if (normClient.toLowerCase() === normRule.toLowerCase()) {
    return true;
  }

  // Check for CIDR notation
  const [networkAddress, prefixStr] = normRule.split('/');
  const clientNum = ipv4ToNumber(normClient);
  const networkNum = ipv4ToNumber(networkAddress);

  // If either is not valid IPv4, fallback to exact match check
  if (clientNum === null || networkNum === null) {
    return normClient.toLowerCase() === networkAddress.toLowerCase();
  }

  if (!prefixStr) {
    // Single IP match
    return clientNum === networkNum;
  }

  const prefix = parseInt(prefixStr, 10);
  if (isNaN(prefix) || prefix < 0 || prefix > 32) {
    return false;
  }

  if (prefix === 0) {
    return true; // 0.0.0.0/0 matches all IPv4
  }

  // Calculate netmask: for prefix N, the top N bits are 1
  const mask = (prefix === 32 ? 0xFFFFFFFF : ~(0xFFFFFFFF >>> prefix)) >>> 0;
  return (clientNum & mask) === (networkNum & mask);
}

/**
 * Checks if an IP matches any entry in an array of IPs or CIDR strings.
 */
export function isIpMatchingList(clientIp: string, list: string[]): boolean {
  if (!list || list.length === 0) return false;
  return list.some(item => {
    if (!item) return false;
    return isIpInCidr(clientIp, item);
  });
}

/**
 * Evaluates whether a user can access Placify CRM based on the exact business logic:
 * 1. Office Network Access: If IP is approved office IP -> allowed.
 * 2. Outside Office Network: If IP is not approved office IP -> denied by default.
 * 3. External User Whitelist: For selected users, allows access if enabled,
 *    restricted to specific external IPs/CIDRs if configured.
 * 4. Admin Lockout Safeguard: Prevents lockout of Admin/System Admin.
 */
export function evaluateIpAccess(params: EvaluateIpAccessParams): IpAccessResult {
  const {
    clientIp: rawClientIp,
    user,
    officeIps = [],
    enforceIpControl = true,
    adminLockoutPrevention = true
  } = params;

  const clientIp = normalizeIp(rawClientIp);

  // If IP enforcement is globally disabled in settings, allow all
  if (!enforceIpControl) {
    return {
      allowed: true,
      reason: 'enforcement_disabled',
      message: 'IP access enforcement is currently disabled.',
      clientIp,
      isOfficeIp: false
    };
  }

  // Candidate portal access is not subject to internal CRM office network restrictions
  if (user?.role === 'candidate' || user?.role === 'jpc_candidate') {
    return {
      allowed: true,
      reason: 'candidate_portal_access',
      message: 'Candidate access permitted without office IP restriction.',
      clientIp,
      isOfficeIp: false
    };
  }

  const activeOfficeIps = officeIps.filter(o => o.is_active !== false);
  const isAdmin = user && (
    user.role === 'administrator' || 
    user.role === 'jpc_sysadmin' || 
    user.email === 'paramatwork3076@gmail.com'
  );

  // --- Admin Lockout Prevention: Initial Setup Safeguard ---
  // If no office IPs are configured yet, admins must be allowed in to configure office IPs
  if (isAdmin && activeOfficeIps.length === 0) {
    return {
      allowed: true,
      reason: 'admin_initial_setup_safeguard',
      message: 'Admin access granted for initial office network configuration.',
      clientIp,
      isOfficeIp: false
    };
  }

  // --- 1. Office Network Access ---
  // If user is accessing from an approved office IP:
  // All active CRM users with valid permissions can access normally.
  // No individual external IP permission is required.
  const isOfficeMatch = activeOfficeIps.some(office => isIpInCidr(clientIp, office.ip));
  if (isOfficeMatch) {
    const matched = activeOfficeIps.find(office => isIpInCidr(clientIp, office.ip));
    return {
      allowed: true,
      reason: 'office_ip',
      message: `Access granted from approved office network (${matched?.label || matched?.ip || clientIp}).`,
      clientIp,
      isOfficeIp: true,
      matchedRule: matched?.label || matched?.ip
    };
  }

  // --- 2. Outside Office Network ---
  // If the user is accessing from an IP that is NOT an approved office IP:
  // Access must be denied by default for all users.
  // Only specifically selected/whitelisted users can access from outside the office.

  // Check user existence
  if (!user) {
    return {
      allowed: false,
      reason: 'unauthenticated',
      message: 'Access denied. Outside office network and user identity is unverified.',
      clientIp,
      isOfficeIp: false
    };
  }

  // Check access status (suspended or revoked)
  if (user.access_status === 'suspended' || user.access_status === 'revoked') {
    return {
      allowed: false,
      reason: 'access_status_suspended',
      message: `Access denied. Your external access has been ${user.access_status}.`,
      clientIp,
      isOfficeIp: false
    };
  }

  // --- 3. External User Whitelist ---
  // Check if external access is enabled for this user
  if (!user.external_access_enabled) {
    // Admin Lockout Safeguard (Outside Office):
    // Prevent accidental lockout of System Admin / Administrator if they did not enable external access
    if (isAdmin && adminLockoutPrevention) {
      return {
        allowed: true,
        reason: 'admin_lockout_safeguard',
        message: 'Admin access permitted under administrative lockout safeguard.',
        clientIp,
        isOfficeIp: false,
        matchedRule: 'Admin Safeguard'
      };
    }

    // Recruiter B outside office -> Denied because external access is not enabled.
    return {
      allowed: false,
      reason: 'external_access_disabled',
      message: 'Access denied. External access is not enabled for your account outside the office network.',
      clientIp,
      isOfficeIp: false
    };
  }

  // If external access is enabled:
  const allowedIps = (user.allowed_external_ips || []).filter(ip => Boolean(ip && ip.trim()));

  if (allowedIps.length === 0) {
    // Recruiter A outside office -> Allowed because external access is enabled (no specific IP restriction)
    return {
      allowed: true,
      reason: 'external_whitelist_all',
      message: 'Access granted via user external access whitelist.',
      clientIp,
      isOfficeIp: false,
      matchedRule: 'User External Whitelist'
    };
  }

  // Manager C outside office -> Allowed only from their configured external IP / CIDR
  const isUserIpMatch = isIpMatchingList(clientIp, allowedIps);
  if (isUserIpMatch) {
    return {
      allowed: true,
      reason: 'external_ip_matched',
      message: 'Access granted from configured external IP address.',
      clientIp,
      isOfficeIp: false,
      matchedRule: 'User Configured External IP'
    };
  }

  // External access enabled, but current IP does not match the configured allowed external IPs
  return {
    allowed: false,
    reason: 'external_ip_not_matched',
    message: `Access denied. Your current external IP (${clientIp}) is not among your configured allowed IP addresses.`,
    clientIp,
    isOfficeIp: false
  };
}
