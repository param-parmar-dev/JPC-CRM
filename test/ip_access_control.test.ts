import test from 'node:test';
import assert from 'node:assert/strict';

// Set NODE_ENV to test to prevent server.ts from starting listening sockets and crons
process.env.NODE_ENV = 'test';

import { 
  normalizeIp, 
  isIpInCidr, 
  isIpMatchingList, 
  evaluateIpAccess,
  OfficeIpConfig 
} from '../src/lib/ipMatcher';
import { 
  extractClientIp, 
  getIpAccessSettings, 
  logIpAccessAttempt 
} from '../server';

test('1. IP Normalization and CIDR Utilities', async (t) => {
  await t.test('normalizeIp strips IPv4-mapped IPv6, loopback, and proxy chains', () => {
    assert.equal(normalizeIp('::ffff:192.168.1.1'), '192.168.1.1');
    assert.equal(normalizeIp('::ffff:127.0.0.1'), '127.0.0.1');
    assert.equal(normalizeIp('::1'), '127.0.0.1');
    assert.equal(normalizeIp('  203.0.113.195  '), '203.0.113.195');
    assert.equal(normalizeIp('203.0.113.10, 10.0.0.1, 192.168.1.1'), '203.0.113.10');
    assert.equal(normalizeIp(''), '127.0.0.1');
    assert.equal(normalizeIp(null as any), '127.0.0.1');
  });

  await t.test('isIpInCidr validates exact single IPs and IPv4-mapped forms', () => {
    assert.equal(isIpInCidr('192.168.1.50', '192.168.1.50'), true);
    assert.equal(isIpInCidr('::ffff:192.168.1.50', '192.168.1.50'), true);
    assert.equal(isIpInCidr('192.168.1.50', '192.168.1.51'), false);
    assert.equal(isIpInCidr('203.0.113.10', '203.0.113.10'), true);
    assert.equal(isIpInCidr('203.0.113.11', '203.0.113.10'), false);
  });

  await t.test('isIpInCidr evaluates CIDR subnet blocks (/24, /16, /8, /32)', () => {
    // /24 subnet (256 addresses)
    assert.equal(isIpInCidr('192.168.1.0', '192.168.1.0/24'), true);
    assert.equal(isIpInCidr('192.168.1.145', '192.168.1.0/24'), true);
    assert.equal(isIpInCidr('192.168.1.255', '192.168.1.0/24'), true);
    assert.equal(isIpInCidr('192.168.2.1', '192.168.1.0/24'), false);

    // /16 subnet
    assert.equal(isIpInCidr('10.50.12.34', '10.50.0.0/16'), true);
    assert.equal(isIpInCidr('10.51.12.34', '10.50.0.0/16'), false);

    // /32 single host
    assert.equal(isIpInCidr('198.51.100.22', '198.51.100.22/32'), true);
    assert.equal(isIpInCidr('198.51.100.23', '198.51.100.22/32'), false);
  });

  await t.test('isIpMatchingList checks array of IPs and CIDRs', () => {
    const allowed = ['192.168.10.0/24', '203.0.113.50', '10.0.0.0/8'];
    assert.equal(isIpMatchingList('192.168.10.77', allowed), true);
    assert.equal(isIpMatchingList('203.0.113.50', allowed), true);
    assert.equal(isIpMatchingList('10.123.45.67', allowed), true);
    assert.equal(isIpMatchingList('172.16.0.1', allowed), false);
    assert.equal(isIpMatchingList('203.0.113.51', allowed), false);
  });
});

test('2. Access Rule 1: Office Network Access', async (t) => {
  const officeIps: OfficeIpConfig[] = [
    {
      id: 'hq-1',
      ip: '198.51.100.10',
      label: 'Main HQ Office',
      is_active: true,
      created_at: new Date().toISOString()
    },
    {
      id: 'branch-subnet',
      ip: '192.168.100.0/24',
      label: 'Branch Office Subnet',
      is_active: true,
      created_at: new Date().toISOString()
    },
    {
      id: 'old-office',
      ip: '203.0.113.99',
      label: 'Decommissioned Office',
      is_active: false,
      created_at: new Date().toISOString()
    }
  ];

  await t.test('All active CRM users can access normally from approved office IP without individual external permission', () => {
    const recruiterUser = {
      id: 'user-recruiter-1',
      username: 'john.recruiter',
      role: 'jpc_recruiter',
      external_access_enabled: false, // external access disabled!
      allowed_external_ips: []
    };

    const result = evaluateIpAccess({
      clientIp: '198.51.100.10',
      user: recruiterUser,
      officeIps,
      enforceIpControl: true
    });

    assert.equal(result.allowed, true);
    assert.equal(result.reason, 'office_ip');
    assert.equal(result.isOfficeIp, true);
    assert.match(result.message, /Access granted from approved office network/);
  });

  await t.test('Office subnet allows any IP within the CIDR block', () => {
    const salesUser = {
      id: 'user-sales-1',
      username: 'sarah.sales',
      role: 'jpc_sales',
      external_access_enabled: false
    };

    const result = evaluateIpAccess({
      clientIp: '192.168.100.45',
      user: salesUser,
      officeIps,
      enforceIpControl: true
    });

    assert.equal(result.allowed, true);
    assert.equal(result.reason, 'office_ip');
    assert.equal(result.isOfficeIp, true);
  });

  await t.test('Inactive office IP is ignored and treated as outside office', () => {
    const complianceUser = {
      id: 'user-cs-1',
      username: 'mike.cs',
      role: 'jpc_cs',
      external_access_enabled: false
    };

    const result = evaluateIpAccess({
      clientIp: '203.0.113.99', // Decommissioned office IP
      user: complianceUser,
      officeIps,
      enforceIpControl: true
    });

    assert.equal(result.allowed, false);
    assert.equal(result.reason, 'external_access_disabled');
    assert.equal(result.isOfficeIp, false);
  });
});

test('3. Access Rule 2 & 3: Outside Office Network & External User Whitelist', async (t) => {
  const officeIps: OfficeIpConfig[] = [
    {
      id: 'hq',
      ip: '198.51.100.10',
      label: 'Main Office',
      is_active: true,
      created_at: new Date().toISOString()
    }
  ];

  await t.test('Outside Office: Access denied by default for users without external access (Recruiter B example)', () => {
    const recruiterB = {
      id: 'user-recruiter-b',
      username: 'recruiter.b',
      role: 'jpc_recruiter',
      external_access_enabled: false
    };

    const result = evaluateIpAccess({
      clientIp: '203.0.113.55', // External IP
      user: recruiterB,
      officeIps,
      enforceIpControl: true
    });

    assert.equal(result.allowed, false);
    assert.equal(result.reason, 'external_access_disabled');
    assert.match(result.message, /External access is not enabled for your account/);
  });

  await t.test('Outside Office: Allowed when external access is enabled with no IP restriction (Recruiter A example)', () => {
    const recruiterA = {
      id: 'user-recruiter-a',
      username: 'recruiter.a',
      role: 'jpc_recruiter',
      external_access_enabled: true,
      allowed_external_ips: [] // Empty = any external IP permitted
    };

    const result = evaluateIpAccess({
      clientIp: '185.220.101.5', // External IP
      user: recruiterA,
      officeIps,
      enforceIpControl: true
    });

    assert.equal(result.allowed, true);
    assert.equal(result.reason, 'external_whitelist_all');
    assert.equal(result.isOfficeIp, false);
    assert.match(result.message, /Access granted via user external access whitelist/);
  });

  await t.test('Outside Office: Allowed only from configured external IP (Manager C example)', () => {
    const managerC = {
      id: 'user-manager-c',
      username: 'manager.c',
      role: 'jpc_manager',
      external_access_enabled: true,
      allowed_external_ips: ['203.0.113.88'] // Configured specific external IP
    };

    // Attempt 1: From configured external IP -> ALLOWED
    const allowedAttempt = evaluateIpAccess({
      clientIp: '203.0.113.88',
      user: managerC,
      officeIps,
      enforceIpControl: true
    });
    assert.equal(allowedAttempt.allowed, true);
    assert.equal(allowedAttempt.reason, 'external_ip_matched');
    assert.match(allowedAttempt.message, /Access granted from configured external IP address/);

    // Attempt 2: From different external IP -> DENIED
    const deniedAttempt = evaluateIpAccess({
      clientIp: '203.0.113.89',
      user: managerC,
      officeIps,
      enforceIpControl: true
    });
    assert.equal(deniedAttempt.allowed, false);
    assert.equal(deniedAttempt.reason, 'external_ip_not_matched');
    assert.match(deniedAttempt.message, /not among your configured allowed IP addresses/);
  });

  await t.test('Outside Office: External access with CIDR range support', () => {
    const engineer = {
      id: 'user-eng-1',
      username: 'alice.engineer',
      role: 'administrator',
      external_access_enabled: true,
      allowed_external_ips: ['10.50.0.0/16']
    };

    const allowedCidr = evaluateIpAccess({
      clientIp: '10.50.4.99',
      user: engineer,
      officeIps,
      enforceIpControl: true
    });
    assert.equal(allowedCidr.allowed, true);
    assert.equal(allowedCidr.reason, 'external_ip_matched');

    const deniedCidr = evaluateIpAccess({
      clientIp: '10.51.4.99',
      user: engineer,
      officeIps,
      enforceIpControl: true
    });
    // Even if engineer is admin, when admin specifies allowed_external_ips, outside that range:
    assert.equal(deniedCidr.allowed, false);
    assert.equal(deniedCidr.reason, 'external_ip_not_matched');
  });

  await t.test('Access status suspended or revoked blocks access even if external access was enabled', () => {
    const suspendedUser = {
      id: 'user-suspended-1',
      username: 'temp.suspended',
      role: 'jpc_sales',
      external_access_enabled: true,
      allowed_external_ips: [],
      access_status: 'suspended' as const
    };

    const result = evaluateIpAccess({
      clientIp: '203.0.113.12',
      user: suspendedUser,
      officeIps,
      enforceIpControl: true
    });

    assert.equal(result.allowed, false);
    assert.equal(result.reason, 'access_status_suspended');
    assert.match(result.message, /access has been suspended/i);
  });
});

test('4. Security Safeguards & Edge Cases', async (t) => {
  await t.test('Admin Lockout Prevention: Initial Setup Safeguard when office IPs is empty', () => {
    const sysAdmin = {
      id: 'admin-1',
      username: 'sysadmin',
      role: 'jpc_sysadmin',
      email: 'admin@placify.com'
    };

    // No office IPs configured yet
    const result = evaluateIpAccess({
      clientIp: '203.0.113.1',
      user: sysAdmin,
      officeIps: [],
      enforceIpControl: true,
      adminLockoutPrevention: true
    });

    assert.equal(result.allowed, true);
    assert.equal(result.reason, 'admin_initial_setup_safeguard');
  });

  await t.test('Admin Lockout Prevention: Standard admin outside office protected from accidental lockout', () => {
    const adminUser = {
      id: 'admin-2',
      username: 'param',
      role: 'administrator',
      email: 'paramatwork3076@gmail.com',
      external_access_enabled: false // Admin forgot to enable external access for their profile
    };

    const officeIps = [{
      id: 'hq',
      ip: '198.51.100.10',
      label: 'Main Office',
      is_active: true,
      created_at: new Date().toISOString()
    }];

    const result = evaluateIpAccess({
      clientIp: '54.210.12.34', // Unrecognized outside IP
      user: adminUser,
      officeIps,
      enforceIpControl: true,
      adminLockoutPrevention: true
    });

    assert.equal(result.allowed, true);
    assert.equal(result.reason, 'admin_lockout_safeguard');
  });

  await t.test('Candidate portal role bypasses internal CRM office IP restrictions', () => {
    const candidateUser = {
      id: 'cand-1',
      username: 'applicant.joe',
      role: 'candidate',
      email: 'applicant@gmail.com'
    };

    const officeIps = [{
      id: 'hq',
      ip: '198.51.100.10',
      label: 'Main Office',
      is_active: true,
      created_at: new Date().toISOString()
    }];

    const result = evaluateIpAccess({
      clientIp: '172.56.21.9',
      user: candidateUser,
      officeIps,
      enforceIpControl: true
    });

    assert.equal(result.allowed, true);
    assert.equal(result.reason, 'candidate_portal_access');
  });

  await t.test('Global enforcement disabled allows all users', () => {
    const recruiter = {
      id: 'recruiter-99',
      username: 'recruiter.plain',
      role: 'jpc_recruiter',
      external_access_enabled: false
    };

    const result = evaluateIpAccess({
      clientIp: '203.0.113.1',
      user: recruiter,
      officeIps: [{ id: 'hq', ip: '198.51.100.10', label: 'HQ', is_active: true, created_at: '' }],
      enforceIpControl: false // Enforcement paused
    });

    assert.equal(result.allowed, true);
    assert.equal(result.reason, 'enforcement_disabled');
  });
});

test('5. Backend Request Helpers: extractClientIp and logIpAccessAttempt', async (t) => {
  await t.test('extractClientIp extracts IP correctly from various proxy headers', () => {
    const req1 = { headers: { 'x-forwarded-for': '198.51.100.55, 10.0.0.1' } };
    assert.equal(extractClientIp(req1), '198.51.100.55');

    const req2 = { headers: { 'x-real-ip': '203.0.113.77' } };
    assert.equal(extractClientIp(req2), '203.0.113.77');

    const req3 = { headers: {}, ip: '::ffff:192.168.1.200' };
    assert.equal(extractClientIp(req3), '192.168.1.200');

    const req4 = { headers: {}, socket: { remoteAddress: '::1' } };
    assert.equal(extractClientIp(req4), '127.0.0.1');
  });

  await t.test('logIpAccessAttempt writes structured audit records to jpc_ip_access_logs', async () => {
    const loggedDocs: any[] = [];
    const mockDb = {
      collection: (colName: string) => {
        assert.equal(colName, 'jpc_ip_access_logs');
        return {
          doc: () => {
            const id = `log-${Date.now()}`;
            return {
              id,
              set: async (data: any) => {
                loggedDocs.push({ id, ...data });
              }
            };
          }
        };
      }
    };

    await logIpAccessAttempt(mockDb, {
      ip: '203.0.113.99',
      userId: 'user-recruiter-b',
      username: 'recruiter.b',
      userDisplayName: 'Recruiter B',
      userRole: 'jpc_recruiter',
      userEmail: 'recruiter.b@placify.com',
      result: 'blocked',
      reason: 'external_access_disabled',
      matchedRule: '',
      userAgent: 'Mozilla/5.0'
    });

    assert.equal(loggedDocs.length, 1);
    assert.equal(loggedDocs[0].ip, '203.0.113.99');
    assert.equal(loggedDocs[0].result, 'blocked');
    assert.equal(loggedDocs[0].reason, 'external_access_disabled');
    assert.equal(loggedDocs[0].username, 'recruiter.b');
    assert.ok(loggedDocs[0].timestamp);
  });
});
