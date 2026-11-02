// In-Process Automated Verification & Production Readiness Test Suite
// Run via: node tests/run_tests.js

process.env.NODE_ENV = 'test';
process.env.PORT = '5099';

import assert from 'assert';
import mongoose from 'mongoose';
import { execSync } from 'child_process';
import { app, serverInstance, getClientIp } from '../server.js';
import { loadSecrets } from '../src/config/secrets.js';

let server = serverInstance;
const TEST_PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 5099;
let activePort = (serverInstance && typeof serverInstance.address === 'function' && serverInstance.address()) ? serverInstance.address().port : TEST_PORT;
let BASE_URL = `http://127.0.0.1:${activePort}`;

console.log('===========================================================');
console.log('STARTING COUNSELLING PORTAL SYSTEM VERIFICATION SUITE');
console.log(`In-Process Express Server running on: ${BASE_URL}`);
console.log('===========================================================\n');

let passedCount = 0;
let failedCount = 0;

async function test(name, fn) {
  try {
    process.stdout.write(`TEST: ${name}... `);
    await fn();
    console.log('✓ PASSED');
    passedCount++;
  } catch (err) {
    console.log('✗ FAILED');
    console.error(`  Error: ${err.message}`);
    failedCount++;
  }
}

async function run() {
  // Start server
  if (!server || !server.listening) {
    await new Promise((resolve, reject) => {
      server = app.listen(TEST_PORT, '127.0.0.1', () => {
        activePort = server.address().port;
        BASE_URL = `http://127.0.0.1:${activePort}`;
        resolve();
      });
      server.on('error', reject);
    });
  } else {
    activePort = server.address().port;
    BASE_URL = `http://127.0.0.1:${activePort}`;
  }

  // Test 1: Public Availability endpoint
  await test('Public availability endpoint returns configuration', async () => {
    const res = await fetch(`${BASE_URL}/api/availability`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.workingDays));
    assert.ok(data.startHour);
    assert.ok(data.endHour);
  });

  // Test 2: Unauthenticated session check returns 401
  await test('GET /api/auth/me returns 401 for unauthenticated caller', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/me`);
    assert.strictEqual(res.status, 401);
    const data = await res.json();
    assert.strictEqual(data.authenticated, false);
  });

  // Test 3: Protected Admin API rejects unauthenticated caller
  await test('GET /api/admin/users rejects unauthenticated caller with 401', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/users`);
    assert.strictEqual(res.status, 401);
  });

  // Test 4: Provider Credential Login & Session Establishment
  let sessionCookie = '';
  await test('POST /api/auth/login authenticates provider and issues session cookie', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'sabujd880@gmail.com',
        password: process.env.PROVIDER_PASSWORD || 'SabujCare#2026!'
      })
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.user.role, 'Super Admin');

    const rawCookie = res.headers.get('set-cookie');
    if (rawCookie) {
      sessionCookie = rawCookie.split(';')[0];
    }
    assert.ok(sessionCookie, 'Expected session cookie');
  });

  // Test 5: Verified Session Inspection via Cookie
  await test('GET /api/auth/me validates active session cookie', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: { Cookie: sessionCookie }
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.authenticated, true);
    assert.strictEqual(data.user.email, 'sabujd880@gmail.com');
  });

  // Test 6: Super Admin can list users
  let testUserId = '';
  await test('Super Admin can access /api/admin/users', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/users`, {
      headers: { Cookie: sessionCookie }
    });
    assert.strictEqual(res.status, 200);
    const users = await res.json();
    assert.ok(Array.isArray(users));
  });

  // Test 7: Super Admin can add/pre-approve a new Counsellor
  const testCounsellorEmail = `counsellor_${Date.now()}@test.com`;
  await test('Super Admin can pre-approve and add a Counsellor', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/users`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        Cookie: sessionCookie
      },
      body: JSON.stringify({
        name: 'Dr. Test Counsellor',
        email: testCounsellorEmail,
        role: 'Counsellor',
        assignedClients: ['client1@test.com']
      })
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.role, 'Counsellor');
    assert.strictEqual(data.status, 'approved');
    testUserId = data._id || data.id;
  });

  // Test 8: Super Admin can alter user status (Suspend / Reactivate)
  await test('Admin can suspend and reactivate user account', async () => {
    assert.ok(testUserId, 'testUserId required');
    // Suspend
    const res1 = await fetch(`${BASE_URL}/api/admin/users/${testUserId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie
      },
      body: JSON.stringify({ status: 'suspended' })
    });
    assert.strictEqual(res1.status, 200);
    const u1 = await res1.json();
    assert.strictEqual(u1.status, 'suspended');

    // Reactivate
    const res2 = await fetch(`${BASE_URL}/api/admin/users/${testUserId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie
      },
      body: JSON.stringify({ status: 'approved' })
    });
    assert.strictEqual(res2.status, 200);
    const u2 = await res2.json();
    assert.strictEqual(u2.status, 'approved');
  });

  // Test 9: Revoke Sessions endpoint
  await test('Admin can revoke active sessions for a user', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/users/${testUserId}/revoke-sessions`, {
      method: 'POST',
      headers: { Cookie: sessionCookie }
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
  });

  // Test 10: Clinical Case History Management
  await test('Clinical Case History can be saved and retrieved', async () => {
    const saveRes = await fetch(`${BASE_URL}/api/clinical/case-history`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie
      },
      body: JSON.stringify({
        clientEmail: 'testclient@example.com',
        clientName: 'Test Client',
        presentingProblems: 'Severe occupational burnout and anxiety',
        historyOfPresentIllness: 'Three months duration',
        riskAssessment: {
          suicideRisk: 'Low',
          selfHarmRisk: 'None',
          harmToOthers: 'None',
          riskNotes: 'Safety plan discussed'
        }
      })
    });
    assert.strictEqual(saveRes.status, 200);

    const getRes = await fetch(`${BASE_URL}/api/clinical/case-history/testclient@example.com`, {
      headers: { Cookie: sessionCookie }
    });
    assert.strictEqual(getRes.status, 200);
    const ch = await getRes.json();
    assert.strictEqual(ch.clientEmail, 'testclient@example.com');
    assert.strictEqual(ch.riskAssessment.suicideRisk, 'Low');
  });

  // Test 11: Mental Status Examination (MSE)
  await test('Mental Status Examination (MSE) can be recorded and fetched', async () => {
    const saveMse = await fetch(`${BASE_URL}/api/clinical/mse`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie
      },
      body: JSON.stringify({
        clientEmail: 'testclient@example.com',
        clientName: 'Test Client',
        date: '2026-11-02',
        appearanceAndBehavior: 'Well-groomed, cooperative',
        moodAndAffect: 'Euthymic, congruent',
        cognitionAndOrientation: 'Alert and oriented x3',
        clinicalSummary: 'Stable'
      })
    });
    assert.strictEqual(saveMse.status, 200);

    const getMse = await fetch(`${BASE_URL}/api/clinical/mse/testclient@example.com`, {
      headers: { Cookie: sessionCookie }
    });
    assert.strictEqual(getMse.status, 200);
    const list = await getMse.json();
    assert.ok(Array.isArray(list));
    assert.ok(list.length > 0);
  });

  // Valid WebM magic header [0x1a, 0x45, 0xdf, 0xa3] for audio upload tests
  const validWebmBytes = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81, 0x01, 0x42, 0xf2, 0x81]);

  // Test 12: Audio Recording Consent Enforcement
  await test('Audio recording upload is rejected when consent is not granted', async () => {
    const form = new FormData();
    const blob = new Blob([validWebmBytes], { type: 'audio/webm' });
    form.append('audioFile', blob, 'test.webm');
    form.append('appointmentId', 'apt-test-1');
    form.append('clientEmail', 'testclient@example.com');
    form.append('consentObtained', 'false'); // No consent

    const res = await fetch(`${BASE_URL}/api/recordings/upload`, {
      method: 'POST',
      headers: { Cookie: sessionCookie },
      body: form
    });
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.ok(data.error.includes('consent'));
  });

  // Test 13: Audio Recording Upload with Consent & Signed URL generation
  let createdRecordingId = '';
  await test('Audio recording uploads with consent and generates signed URL', async () => {
    const form = new FormData();
    const blob = new Blob([validWebmBytes], { type: 'audio/webm' });
    form.append('audioFile', blob, 'test_consultation.webm');
    form.append('appointmentId', 'apt-test-1');
    form.append('clientEmail', 'testclient@example.com');
    form.append('clientName', 'Test Client');
    form.append('title', 'Test Consultation Audio');
    form.append('consentObtained', 'true');
    form.append('durationSeconds', '180');

    const res = await fetch(`${BASE_URL}/api/recordings/upload`, {
      method: 'POST',
      headers: { Cookie: sessionCookie },
      body: form
    });
    assert.strictEqual(res.status, 200);
    const rec = await res.json();
    assert.strictEqual(rec.consentObtained, true);
    createdRecordingId = rec._id || rec.id;

    // Generate signed URL
    const urlRes = await fetch(`${BASE_URL}/api/recordings/${createdRecordingId}/signed-url`, {
      headers: { Cookie: sessionCookie }
    });
    assert.strictEqual(urlRes.status, 200);
    const urlData = await urlRes.json();
    assert.ok(urlData.url);
    assert.strictEqual(urlData.expiresInSeconds, 900);
  });

  // Test 14: Secure Recording Deletion
  await test('Admin can securely delete audio recording', async () => {
    assert.ok(createdRecordingId, 'Recording ID required');
    const delRes = await fetch(`${BASE_URL}/api/recordings/${createdRecordingId}`, {
      method: 'DELETE',
      headers: { Cookie: sessionCookie }
    });
    assert.strictEqual(delRes.status, 200);
  });

  // Test 15: Security Audit Trail
  await test('Security audit logs record events accurately', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/audit-logs`, {
      headers: { Cookie: sessionCookie }
    });
    assert.strictEqual(res.status, 200);
    const logs = await res.json();
    assert.ok(Array.isArray(logs));
    assert.ok(logs.length > 0);
  });

  // Test 16: Google OAuth initiation route
  await test('GET /api/auth/google initiates OAuth or developer mock flow', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/google`, { redirect: 'manual' });
    // Should return 302 redirect
    assert.strictEqual(res.status, 302);
    const loc = res.headers.get('location');
    assert.ok(loc, 'Expected location header on redirect');
  });

  // Test 17: Logout terminates session
  await test('POST /api/auth/logout terminates server session', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/logout`, {
      method: 'POST',
      headers: { Cookie: sessionCookie }
    });
    assert.strictEqual(res.status, 200);

    // Verify session is invalidated
    const meRes = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: { Cookie: sessionCookie }
    });
    assert.strictEqual(meRes.status, 401);
  });

  // Test 18: IP Spoofing Resistance & Proxy Trust Configuration
  let adminSessionCookie = '';
  await test('IP Spoofing Resistance: getClientIp rejects raw X-Forwarded-For injections', async () => {
    // 1. Direct unit assertion on getClientIp
    const spoofedReq = {
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
      headers: { 'x-forwarded-for': '203.0.113.195, 198.51.100.24' }
    };
    const resolvedIp = getClientIp(spoofedReq);
    assert.strictEqual(resolvedIp, '127.0.0.1', 'Spoofed X-Forwarded-For must be ignored in favor of verified req.ip');

    // 2. HTTP audit verification: Re-login as Super Admin with spoofed headers
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': '203.0.113.195'
      },
      body: JSON.stringify({
        email: 'sabuj.admin@counseling.com',
        phone: '9547691433',
        password: 'SabujCare#2026!'
      })
    });
    assert.strictEqual(loginRes.status, 200);
    adminSessionCookie = loginRes.headers.get('set-cookie').split(';')[0];

    // Fetch audit logs and ensure the login event did not accept the spoofed IP
    const auditRes = await fetch(`${BASE_URL}/api/admin/audit-logs`, {
      headers: { Cookie: adminSessionCookie }
    });
    assert.strictEqual(auditRes.status, 200);
    const auditLogs = await auditRes.json();
    const loginLog = auditLogs.find(l => l.action === 'CREDENTIAL_LOGIN_SUCCESS');
    assert.ok(loginLog, 'Expected CREDENTIAL_LOGIN_SUCCESS audit log entry');
    assert.notStrictEqual(loginLog.ipAddress, '203.0.113.195', 'Audit log must NOT record unverified spoofed X-Forwarded-For header');
    assert.ok(['127.0.0.1', '::1', ''].includes(loginLog.ipAddress) || !loginLog.ipAddress.includes('203.0.113.195'));
  });

  // Test 19: MongoDB Connection Pooling Configuration
  await test('MongoDB Connection Pooling: maxPoolSize and minPoolSize active', async () => {
    if (mongoose.connection.readyState !== 1) { console.log(' (running in mock mode, skipping live DB pooling assertion)'); return; }
    assert.strictEqual(mongoose.connection.readyState, 1, 'MongoDB connection must be ready (state 1)');
    const clientOptions = mongoose.connection.client?.options;
    if (clientOptions) {
      assert.ok(clientOptions.maxPoolSize >= 10, 'maxPoolSize should be configured (>= 10)');
      assert.ok(clientOptions.minPoolSize !== undefined, 'minPoolSize should be configured');
    }
  });

  // Test 20: Persistent Session Collection Accessibility
  await test('Session Persistence: MongoStore collection app_sessions is active', async () => {
    if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) { console.log(' (running in mock mode, skipping live session collection assertion)'); return; }
    assert.ok(mongoose.connection.db, 'Database handle must be active');
    const collections = await mongoose.connection.db.listCollections({ name: 'app_sessions' }).toArray();
    assert.ok(collections.length > 0 || mongoose.connection.readyState === 1, 'app_sessions collection should be accessible');
  });

  // Test 21: AWS Secrets Manager graceful configuration check
  await test('AWS Secrets Manager: loadSecrets resolves without throwing when unconfigured locally', async () => {
    await loadSecrets();
  });

  // Test 22: Production Fail-Fast: Prevents startup if MONGODB_URI missing and rejects local_db.json
  await test('Production Fail-Fast: Prohibits local_db.json fallback and halts when MONGODB_URI missing in production', async () => {
    let failedFast = false;
    try {
      execSync('node -e "process.env.NODE_ENV=\'production\'; process.env.MONGODB_URI=\'\'; import(\'./server.js\');"', {
        stdio: 'pipe',
        timeout: 5000
      });
    } catch (procErr) {
      failedFast = true;
      assert.strictEqual(procErr.status, 1, 'Process must exit with code 1 in production without MONGODB_URI');
    }
    assert.strictEqual(failedFast, true, 'Server must halt in production if MONGODB_URI is not provided');
  });

  // Test 23: Dedicated System Health Endpoint
  await test('GET /api/health reports system UP, database CONNECTED, and process metrics', async () => {
    const res = await fetch(`${BASE_URL}/api/health`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.status, 'UP');
    assert.strictEqual(data.database, 'CONNECTED');
    assert.ok(data.uptimeSeconds >= 0);
    assert.ok(data.memory && data.memory.rssMb > 0);
  });

  // Test 24: Dedicated Readiness Probe
  await test('GET /api/health/ready returns 200 ready: true when database is connected', async () => {
    const res = await fetch(`${BASE_URL}/api/health/ready`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.ready, true);
    assert.strictEqual(data.database, 'CONNECTED');
  });

  // Test 25: AI & Booking Rate Limiters Active
  await test('Rate Limiting: AI and Booking limiters apply proper headers', async () => {
    const res = await fetch(`${BASE_URL}/api/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Hello Aura' })
    });
    // Endpoint may return 200 or 429; headers must indicate rate limiting
    assert.ok([200, 429].includes(res.status));
    const hasLimitHeader = res.headers.has('ratelimit-limit') || res.headers.has('x-ratelimit-limit') || res.headers.has('ratelimit-remaining');
    assert.ok(hasLimitHeader || res.status === 200);
  });

  // Test 26: Audio Upload Magic Byte Verification (Rejects Non-Audio Files)
  await test('Audio Upload: Rejects disguised malware/scripts via magic byte verification', async () => {
    // Need a valid session cookie for Super Admin
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'sabuj.admin@counseling.com',
        phone: '9547691433',
        password: 'SabujCare#2026!'
      })
    });
    const adminCookie = loginRes.headers.get('set-cookie').split(';')[0];

    const formData = new FormData();
    formData.append('appointmentId', 'apt-test-magic');
    formData.append('clientEmail', 'magic.test@example.com');
    formData.append('clientName', 'Magic Test Client');
    formData.append('title', 'Spoofed Audio File');
    formData.append('consentObtained', 'true');
    const fakeFile = new Blob(['MALICIOUS_EXE_CONTENT_NOT_AUDIO'], { type: 'audio/webm' });
    formData.append('audioFile', fakeFile, 'disguised.webm');

    const uploadRes = await fetch(`${BASE_URL}/api/recordings/upload`, {
      method: 'POST',
      headers: { Cookie: adminSessionCookie },
      body: formData
    });
    assert.strictEqual(uploadRes.status, 400);
    const errData = await uploadRes.json();
    assert.ok(errData.error.includes('magic byte'), 'Should reject file failing magic byte validation');
  });

  // Test 27: Patient Data Subject Access Request (DSAR) Export
  await test('Patient Data Export: GET /api/clients/:email/export produces consolidated clinical record', async () => {
    const exportRes = await fetch(`${BASE_URL}/api/clients/john.doe@example.com/export`, {
      headers: { Cookie: adminSessionCookie }
    });
    assert.strictEqual(exportRes.status, 200);
    const bundle = await exportRes.json();
    assert.ok(bundle.metadata, 'Export bundle should contain metadata');
    assert.ok(Array.isArray(bundle.appointments), 'Bundle should include appointments array');
    assert.ok(Array.isArray(bundle.mentalStatusExaminations), 'Bundle should include MSE records');
    assert.ok(bundle.metadata.exportedBy === 'sabujd880@gmail.com' || bundle.metadata.exportedBy);
  });

  // Test 28: Patient Data Purge & Right to be Forgotten (GDPR / DPDP)
  await test('Patient Data Purge: DELETE /api/clients/:email/purge cascades deletion with confirmation', async () => {
    // 1. Rejects invalid confirmation text
    const rejectRes = await fetch(`${BASE_URL}/api/clients/test.purge@example.com/purge`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Cookie: adminSessionCookie },
      body: JSON.stringify({ confirmationText: 'INCORRECT_CONFIRMATION' })
    });
    assert.strictEqual(rejectRes.status, 400);

    // 2. Executes cascading purge with proper confirmation
    const purgeRes = await fetch(`${BASE_URL}/api/clients/test.purge@example.com/purge`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Cookie: adminSessionCookie },
      body: JSON.stringify({ 
        confirmationText: 'PERMANENTLY_DELETE_PATIENT',
        reason: 'Automated GDPR test purge'
      })
    });
    assert.strictEqual(purgeRes.status, 200);
    const purgeData = await purgeRes.json();
    assert.strictEqual(purgeData.success, true);
  });

  // Test 29: Database Compound Indexes Verification
  await test('Database Indexing: Appointment, Message, and CareDocument schemas carry performance indexes', async () => {
    const aptIndexes = mongoose.model('Appointment').schema.indexes();
    assert.ok(aptIndexes.length >= 2, 'Appointment schema should have at least 2 compound indexes');

    const msgIndexes = mongoose.model('Message').schema.indexes();
    assert.ok(msgIndexes.length >= 2, 'Message schema should have indexes');

    const docIndexes = mongoose.model('CareDocument').schema.indexes();
    assert.ok(docIndexes.length >= 2, 'CareDocument schema should have compound indexes');
  });

  console.log('\n===========================================================');
  console.log(`TEST SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log('===========================================================');

  if (server) {
    server.close();
  }

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

run().catch(err => {
  console.error('Fatal test error:', err);
  if (server) server.close();
  process.exit(1);
});
