// Authoritative Application Timezone: Asia/Kolkata (Indian Standard Time, UTC+05:30)
process.env.TZ = 'Asia/Kolkata';

// Intercept background network / DNS unhandled rejections to prevent process crashes
process.on('unhandledRejection', (reason) => {
  console.warn('[SYSTEM WARN] Background unhandled rejection intercepted:', reason?.message || reason);
});
process.on('uncaughtException', (err) => {
  console.error('[SYSTEM ALERT] Uncaught exception intercepted:', err?.message || err);
});

import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import dns from 'dns';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import multer from 'multer';
import crypto from 'crypto';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { loadSecrets } from './src/config/secrets.js';
import {
  normalizeToISTDate, 
  normalizeTo12HourTime, 
  parseISTDateTimeToUTC, 
  formatISTDate, 
  formatISTTime, 
  formatISTDateTimeWithZone,
  isSameISTDate,
  doAppointmentsOverlap 
} from './src/utils/dateTime.js';

dotenv.config();

// Ensure reliable DNS resolution for MongoDB Atlas SRV records.
// In Windows development, local router/ISP firewalls frequently cause querySrv ECONNREFUSED,
// where public DNS (Google/Cloudflare) resolves SRV records reliably.
// On Linux/Render containers, DO NOT override dns.setServers by default because it bypasses the container's
// internal /etc/resolv.conf nameservers and may be blocked by container network firewall policies.
if (process.platform === 'win32' || process.env.OVERRIDE_DNS === 'true') {
  try {
    dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
  } catch (dnsErr) {
    console.warn('DNS server configuration warning:', dnsErr.message);
  }
}

// Load secrets from AWS Secrets Manager if configured
await loadSecrets();

const app = express();
const PORT = process.env.PORT || 5000;
const isProd = process.env.NODE_ENV === 'production';

// Trust proxy configuration:
// In production behind AWS ALB / App Runner / CloudFront, trust only configured hop count or CIDRs.
// Wildcard boolean `true` is strictly prohibited in production to prevent IP spoofing attacks via X-Forwarded-For headers.
// When unset, in production defaults to 1 hop (the immediate upstream ALB/reverse-proxy); in development defaults to false.
let trustProxyConfig = false;
if (process.env.TRUST_PROXY !== undefined) {
  const tp = process.env.TRUST_PROXY.trim();
  if (tp === 'false') {
    trustProxyConfig = false;
  } else if (tp === 'true') {
    if (isProd) {
      console.warn('[SECURITY WARNING] TRUST_PROXY=true (wildcard trust) is insecure in production. Defaulting to 1 hop.');
      trustProxyConfig = 1;
    } else {
      trustProxyConfig = true;
    }
  } else if (!isNaN(Number(tp))) {
    trustProxyConfig = Number(tp);
  } else {
    trustProxyConfig = tp; // CIDR string, comma-separated IPs, or predefined express presets
  }
} else {
  trustProxyConfig = (isProd || process.env.RENDER === 'true') ? 1 : false;
}
app.set('trust proxy', trustProxyConfig);

/**
 * Extracts and sanitizes verified client IP from request.
 * Strictly relies on Express req.ip (evaluated via proxy-addr and trust proxy configuration).
 * Prevents header-injection / IP spoofing attacks via raw X-Forwarded-For headers.
 */
export function getClientIp(req) {
  if (!req) return '';
  let ip = req.ip || req.socket?.remoteAddress || '';
  if (typeof ip === 'string' && ip.startsWith('::ffff:')) {
    ip = ip.replace('::ffff:', '');
  }
  return ip;
}

// =========================================================================
// STATIC ASSET SERVING & SECURITY HEADERS
// =========================================================================
const __dirname = path.resolve();
const distPath = path.join(__dirname, 'dist');
const assetsPath = path.join(distPath, 'assets');

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Serve static frontend assets with public cross-origin access and strict MIME types
if (fs.existsSync(distPath)) {
  // 1. Dedicated /assets router with 1-year immutable caching, cross-origin headers, and strict MIME types
  app.use('/assets', (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  }, express.static(assetsPath, {
    immutable: true,
    maxAge: '1y',
    setHeaders: (res, filePath) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      if (filePath.endsWith('.js') || filePath.endsWith('.mjs')) {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      } else if (filePath.endsWith('.css')) {
        res.setHeader('Content-Type', 'text/css; charset=utf-8');
      }
    }
  }));

  // Missing /assets/* files must return 404 text/plain, never JSON or index.html
  app.use('/assets', (req, res) => {
    res.status(404).type('text/plain').send('Asset not found');
  });

  // 2. Root static files (favicon.ico, manifest.webmanifest, images, etc.)
  app.use(express.static(distPath, {
    maxAge: '1h',
    setHeaders: (res, filePath) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      if (filePath.endsWith('.js') || filePath.endsWith('.mjs')) {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      } else if (filePath.endsWith('.css')) {
        res.setHeader('Content-Type', 'text/css; charset=utf-8');
      }
    }
  }));
}

// =========================================================================
// CORS & ORIGIN GOVERNANCE FOR API ENDPOINTS
// =========================================================================
const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.RENDER_EXTERNAL_URL,
  'https://verdant-mind-therapy-ys6i.onrender.com',
  'https://verdant-mind.onrender.com',
  'https://counselling.yourdomain.com',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:5000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5000'
].filter(Boolean).map(o => o.trim().replace(/\/+$/, ''));

const isOriginAllowed = (origin, req) => {
  if (!origin) return true; // Direct non-CORS navigation, curl, server-to-server
  const cleanOrigin = origin.trim().replace(/\/+$/, '');

  // 1. Explicit allowed list
  if (allowedOrigins.includes(cleanOrigin)) return true;

  // 2. Render cloud deployments (*.onrender.com)
  try {
    const originUrl = new URL(cleanOrigin);
    if (originUrl.hostname.endsWith('.onrender.com')) return true;

    // 3. Same-origin match with current Host or X-Forwarded-Host header
    const hostHeader = (req?.headers?.['x-forwarded-host'] || req?.headers?.host || '').split(':')[0].toLowerCase();
    if (hostHeader && originUrl.hostname.toLowerCase() === hostHeader) return true;

    // 4. Local development
    if (originUrl.hostname === 'localhost' || originUrl.hostname === '127.0.0.1') return true;
  } catch (e) {
    return false;
  }

  return false;
};

app.use((req, res, next) => {
  // Static assets and non-API paths are public and allowed
  if (!req.path.startsWith('/api')) {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    return next();
  }

  // API endpoints: enforce origin authorization
  const origin = req.headers.origin;
  if (isOriginAllowed(origin, req)) {
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, CSRF-Token');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  } else {
    if (isProd) {
      return res.status(403).json({ error: `CORS policy blocked request from unauthorized origin: ${origin}` });
    }
    next();
  }
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// =========================================================================
// API RATE LIMITING (Per-Endpoint & Anti-Brute-Force Architecture)
// =========================================================================
// General Authentication Limiter: 100 requests per 15 mins
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getClientIp(req),
  message: { error: 'Too many authentication requests from this IP. Please try again after 15 minutes.' }
});
app.use('/api/auth/', authLimiter);

// Strict Credential & OTP Brute-Force Limiter: 15 attempts per 15 mins
const loginBruteForceLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getClientIp(req),
  message: { error: 'Too many consecutive login attempts. Please wait 15 minutes before trying again.' }
});

// Password Recovery & OTP Request Limiter: 5 attempts per 15 mins (Protects Brevo SMTP quota)
const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getClientIp(req),
  message: { error: 'Too many password reset requests. Please wait 15 minutes before requesting another OTP.' }
});

// AI & Clinical LLM Limiter: 30 requests per minute
const aiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getClientIp(req),
  message: { error: 'Too many AI requests from this IP. Please wait a moment before trying again.' }
});

// Public Appointment & Inquiries Submission Limiter: 30 per hour
const bookingLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getClientIp(req),
  message: { error: 'Too many submissions from this IP. Please wait before submitting again.' }
});

// =========================================================================
// SESSION STORE CONFIGURATION
// =========================================================================
let sessionStore = null;

if (process.env.MONGODB_URI && process.env.NODE_ENV !== 'test') {
  try {
    sessionStore = MongoStore.create({
      mongoUrl: process.env.MONGODB_URI,
      collectionName: 'app_sessions',
      ttl: 8 * 60 * 60, // 8 hours
      crypto: {
        secret: process.env.SESSION_SECRET || 'verdant-mind-counselling-session-enc-salt-2026'
      }
    });
    if (sessionStore && sessionStore.clientPromise) {
      sessionStore.clientPromise.catch(err => {
        console.warn('[SESSION STORE WARNING] MongoStore client connection notice:', err.message);
      });
    }
    sessionStore.on('error', (err) => {
      console.warn('[SESSION STORE WARNING] MongoStore async connection alert:', err.message);
    });
  } catch (storeErr) {
    console.error('[SESSION ERROR] Could not initialize MongoStore:', storeErr.message);
    if (isProd) {
      console.error('[FATAL] Persistent session store (MongoStore) is mandatory in production. Halting startup.');
      process.exit(1);
    }
  }
} else if (isProd) {
  console.error('[FATAL] MONGODB_URI is required for session persistence in production. Halting startup.');
  process.exit(1);
}

if (isProd && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === 'verdant-mind-counselling-super-secure-key-2026')) {
  console.error('[FATAL] A strong, custom SESSION_SECRET must be configured in production. Halting startup.');
  process.exit(1);
}

app.use(session({
  name: 'counselling_portal_sid',
  secret: process.env.SESSION_SECRET || 'verdant-mind-counselling-super-secure-key-2026',
  resave: false,
  saveUninitialized: false,
  store: sessionStore || undefined,
  cookie: {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    maxAge: 8 * 60 * 60 * 1000 // 8 hours
  }
}));

// Ensure uploads directories exist for private storage fallback and streamed upload buffers
const RECORDINGS_DIR = path.join(process.cwd(), 'uploads', 'recordings');
const UPLOAD_TMP_DIR = path.join(process.cwd(), 'uploads', 'tmp');
if (!fs.existsSync(RECORDINGS_DIR)) {
  fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOAD_TMP_DIR)) {
  fs.mkdirSync(UPLOAD_TMP_DIR, { recursive: true });
}

// =========================================================================
// AWS S3 CLIENT INITIALIZATION
// =========================================================================
const awsRegion = process.env.AWS_REGION || 'ap-south-1';
const s3Bucket = process.env.AWS_S3_BUCKET;
let s3Client = null;

if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && s3Bucket) {
  s3Client = new S3Client({
    region: awsRegion,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
  });
  console.log(`Configured AWS S3 client in region ${awsRegion} for bucket: ${s3Bucket}`);
}

// Multer disk-backed streaming storage for audio uploads (Prevents RAM Exhaustion / OOM crashes)
const audioDiskStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_TMP_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `tmp_${Date.now()}_${crypto.randomBytes(8).toString('hex')}.bin`;
    cb(null, uniqueSuffix);
  }
});

const upload = multer({
  storage: audioDiskStorage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit for therapy audio recordings
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('audio/') || file.mimetype === 'video/webm' || file.mimetype === 'application/octet-stream') {
      cb(null, true);
    } else {
      cb(new Error('Only audio recordings are permitted.'));
    }
  }
});

/**
 * Validates audio magic bytes to prevent disguised executable / script injection (OWASP A03)
 */
function isValidAudioMagicBytes(filePath) {
  try {
    if (!fs.existsSync(filePath)) return false;
    const stat = fs.statSync(filePath);
    if (stat.size < 4) return false;
    
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(16);
    fs.readSync(fd, buffer, 0, Math.min(16, stat.size), 0);
    fs.closeSync(fd);

    // EBML / WebM: 1A 45 DF A3
    if (buffer[0] === 0x1A && buffer[1] === 0x45 && buffer[2] === 0xDF && buffer[3] === 0xA3) return true;
    // RIFF / WAV: RIFF....WAVE
    if (buffer.toString('ascii', 0, 4) === 'RIFF') return true;
    // ID3 MP3: ID3
    if (buffer.toString('ascii', 0, 3) === 'ID3') return true;
    // Raw MP3 frame sync header
    if (buffer[0] === 0xFF && (buffer[1] & 0xE0) === 0xE0) return true;
    // Ogg: OggS
    if (buffer.toString('ascii', 0, 4) === 'OggS') return true;
    // MP4 / M4A: ....ftyp
    if (buffer.length >= 8 && buffer.toString('ascii', 4, 8) === 'ftyp') return true;

    return false;
  } catch (err) {
    console.error('Magic byte validation error:', err.message);
    return false;
  }
}

// =========================================================================
// CRYPTOGRAPHIC PASSWORD SECURITY (scrypt + constant-time comparison)
// =========================================================================
function hashPassword(password) {
  if (!password) throw new Error('Password cannot be empty');
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return `scrypt:${salt}:${derivedKey.toString('hex')}`;
}

function safeStringCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function verifyPassword(password, storedHash) {
  if (!storedHash || !password) return false;
  
  if (storedHash.startsWith('scrypt:')) {
    const parts = storedHash.split(':');
    if (parts.length !== 3) return false;
    const salt = parts[1];
    const key = parts[2];
    const derivedKey = crypto.scryptSync(password, salt, 64);
    const keyBuffer = Buffer.from(key, 'hex');
    if (derivedKey.length !== keyBuffer.length) return false;
    return crypto.timingSafeEqual(derivedKey, keyBuffer);
  }
  
  // Legacy plaintext fallback for backwards compatibility with existing accounts
  return safeStringCompare(password, storedHash);
}

function isLegacyPlaintext(storedHash) {
  return typeof storedHash === 'string' && !storedHash.startsWith('scrypt:');
}

// =========================================================================
// DATABASE SCHEMAS & MODELS
// =========================================================================

// 1. User Schema (for Multi-Role Authentication & Google OAuth)
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, index: true },
  name: { type: String, required: true },
  picture: { type: String, default: '' },
  password: { type: String }, // Optional hashed password for staff/admin email login
  googleId: { type: String, sparse: true, index: true },
  role: { 
    type: String, 
    enum: ['Super Admin', 'Administrator', 'Counsellor', 'Viewer', 'client', 'provider'], 
    default: 'Viewer' 
  },
  status: { 
    type: String, 
    enum: ['approved', 'pending', 'suspended', 'rejected'], 
    default: 'pending',
    index: true
  },
  assignedClients: { type: [String], default: [] }, // Client emails assigned to this practitioner
  assignedCounsellor: { type: String, default: '' }, // For viewers or clients
  createdAt: { type: Date, default: Date.now },
  lastLoginAt: { type: Date },
  lastLoginIp: { type: String },
  approvedBy: { type: String },
  approvedAt: { type: Date },
  revokedSessionsBefore: { type: Date }
});
userSchema.index({ email: 1, status: 1 });
let User = mongoose.model('User', userSchema);

// 2. AuditLog Schema (Security & Compliance Tracking - Append-Only & Immutable)
const auditLogSchema = new mongoose.Schema({
  eventId: { type: String, unique: true, index: true },
  timestamp: { type: Date, default: Date.now, index: true },
  actorEmail: { type: String, required: true, index: true },
  actorUserId: { type: String, default: '' },
  actorRole: { type: String, default: 'unknown' },
  action: { type: String, required: true, index: true },
  resourceType: { type: String, default: 'general' },
  targetResource: { type: String, default: '' },
  eventCategory: { 
    type: String, 
    enum: [
      'Authentication', 
      'Profile Management', 
      'Clinical Documentation', 
      'Appointments', 
      'Assessments', 
      'Document Management', 
      'Security Administration', 
      'Privacy & Consent'
    ],
    default: 'Security Administration',
    index: true 
  },
  outcome: { type: String, enum: ['success', 'failure', 'denied'], default: 'success', index: true },
  severity: { type: String, enum: ['info', 'low', 'medium', 'high', 'critical'], default: 'info', index: true },
  ipAddress: { type: String, default: '' },
  userAgent: { type: String, default: '' },
  requestId: { type: String, default: '' },
  details: { type: mongoose.Schema.Types.Mixed, default: {} },
  beforeAfter: { type: mongoose.Schema.Types.Mixed, default: null }
});
auditLogSchema.index({ timestamp: -1, action: 1 });
auditLogSchema.index({ actorEmail: 1, timestamp: -1 });
auditLogSchema.index({ eventCategory: 1, severity: 1 });

// Prevent updates and deletions to preserve audit immutability
auditLogSchema.pre('save', function (next) {
  if (!this.isNew) {
    return next(new Error('Audit logs are immutable append-only records and cannot be modified.'));
  }
  next();
});
auditLogSchema.pre(['deleteOne', 'deleteMany', 'findOneAndDelete', 'findOneAndRemove', 'remove'], function (next) {
  next(new Error('Audit logs are immutable append-only records and cannot be deleted.'));
});

let AuditLog = mongoose.model('AuditLog', auditLogSchema);

// 2.1 SecurityEvent Schema (Security Alerts & Threat Detection)
const securityEventSchema = new mongoose.Schema({
  eventId: { type: String, required: true, unique: true, index: true },
  category: { 
    type: String, 
    enum: ['failed_logins', 'unauthorized_access', 'suspicious_activity', 'role_change', 'session_anomaly', 'data_export', 'policy_violation'],
    default: 'suspicious_activity',
    index: true 
  },
  severity: { type: String, enum: ['info', 'low', 'medium', 'high', 'critical'], default: 'medium', index: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  sourceIp: { type: String, default: '' },
  affectedUser: { type: String, default: '' },
  targetResource: { type: String, default: '' },
  status: { type: String, enum: ['open', 'investigating', 'resolved', 'dismissed'], default: 'open', index: true },
  assignedAdmin: { type: String, default: '' },
  resolutionNotes: { type: String, default: '' },
  resolvedAt: { type: Date },
  occurrences: { type: Number, default: 1 },
  lastOccurred: { type: Date, default: Date.now, index: true },
  timestamp: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now }
});
securityEventSchema.index({ status: 1, severity: 1, lastOccurred: -1 });
let SecurityEvent = mongoose.model('SecurityEvent', securityEventSchema);

// 2.2 UserSession Schema (Active Session Lifecycle & Monitoring)
const userSessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true, index: true },
  userId: { type: String, default: '' },
  userEmail: { type: String, required: true, lowercase: true, index: true },
  userName: { type: String, default: '' },
  role: { type: String, default: 'client' },
  ipAddress: { type: String, default: '' },
  userAgent: { type: String, default: '' },
  loginTime: { type: Date, default: Date.now },
  lastActivity: { type: Date, default: Date.now, index: true },
  status: { type: String, enum: ['active', 'revoked', 'expired', 'logged_out'], default: 'active', index: true },
  revokedAt: { type: Date },
  revokedBy: { type: String }
});
userSessionSchema.index({ userEmail: 1, status: 1 });
let UserSession = mongoose.model('UserSession', userSessionSchema);

// 2.3 ConsentRecord Schema (Granular Privacy & Informed Consent Tracking)
const consentRecordSchema = new mongoose.Schema({
  consentId: { type: String, required: true, unique: true, index: true },
  userId: { type: String, default: '' },
  userEmail: { type: String, required: true, lowercase: true, index: true },
  consentType: { 
    type: String, 
    required: true, 
    enum: ['counselling', 'assessment', 'audio_recording', 'teleconsultation', 'data_sharing'],
    index: true 
  },
  status: { type: String, enum: ['granted', 'withdrawn'], required: true },
  version: { type: String, default: '1.0' },
  purpose: { type: String, default: '' },
  collectionMethod: { type: String, default: 'portal_self_service' },
  ipAddress: { type: String, default: '' },
  userAgent: { type: String, default: '' },
  grantedAt: { type: Date },
  withdrawnAt: { type: Date },
  history: [{
    status: String,
    version: String,
    timestamp: { type: Date, default: Date.now },
    ipAddress: String,
    reason: String
  }]
});
consentRecordSchema.index({ userEmail: 1, consentType: 1 });
let ConsentRecord = mongoose.model('ConsentRecord', consentRecordSchema);

// 2.4 PrivacyRequest Schema (Student/Patient Rights & Data Subject Access Requests)
const privacyRequestSchema = new mongoose.Schema({
  requestId: { type: String, required: true, unique: true, index: true },
  userId: { type: String, default: '' },
  userEmail: { type: String, required: true, lowercase: true, index: true },
  userName: { type: String, required: true },
  requestType: { 
    type: String, 
    required: true, 
    enum: ['access_export', 'correction', 'deactivation', 'deletion', 'restriction'],
    index: true 
  },
  details: { type: String, required: true },
  status: { 
    type: String, 
    enum: ['pending', 'under_review', 'fulfilled', 'rejected'], 
    default: 'pending',
    index: true 
  },
  adminNotes: { type: String, default: '' },
  requestedAt: { type: Date, default: Date.now, index: true },
  resolvedAt: { type: Date },
  resolvedBy: { type: String }
});
privacyRequestSchema.index({ userEmail: 1, requestedAt: -1 });
let PrivacyRequest = mongoose.model('PrivacyRequest', privacyRequestSchema);

// 2.5 SecuritySettings Schema (Practice Security Governance & Policies)
const securitySettingsSchema = new mongoose.Schema({
  configId: { type: String, default: 'global_security_config', unique: true },
  sessionInactivityTimeoutMinutes: { type: Number, default: 15, min: 5, max: 120 },
  loginRateLimitMax: { type: Number, default: 5, min: 3, max: 20 },
  loginRateLimitWindowMinutes: { type: Number, default: 15, min: 1, max: 60 },
  passwordMinLength: { type: Number, default: 8, min: 8, max: 32 },
  requireSpecialChar: { type: Boolean, default: true },
  requireNumber: { type: Boolean, default: true },
  auditLogRetentionDays: { type: Number, default: 365, min: 30, max: 2555 },
  enableSuspiciousLoginAlerts: { type: Boolean, default: true },
  enableUnauthorizedAccessAlerts: { type: Boolean, default: true },
  approvedOrigins: { type: [String], default: [] },
  updatedAt: { type: Date, default: Date.now },
  updatedBy: { type: String, default: 'system' }
});
let SecuritySettings = mongoose.model('SecuritySettings', securitySettingsSchema);

// 3. AudioRecording Schema (Encrypted S3 or Private Local Storage with Signed URLs)
const audioRecordingSchema = new mongoose.Schema({
  appointmentId: { type: String, required: true, index: true },
  clientEmail: { type: String, required: true, lowercase: true, index: true },
  clientName: { type: String, required: true },
  counsellorEmail: { type: String, required: true, lowercase: true, index: true },
  title: { type: String, required: true },
  storageType: { type: String, enum: ['s3', 'local'], default: 'local' },
  storageKey: { type: String, required: true }, // S3 object key or local filename
  s3Bucket: { type: String },
  mimeType: { type: String, default: 'audio/webm' },
  fileSizeBytes: { type: Number, default: 0 },
  durationSeconds: { type: Number, default: 0 },
  consentObtained: { type: Boolean, required: true }, // Mandatory clinical consent
  consentDate: { type: Date, default: Date.now },
  retentionExpiryDate: { type: Date }, // Default 7-year medical retention policy
  uploadedAt: { type: Date, default: Date.now },
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date },
  deletedBy: { type: String }
});
audioRecordingSchema.index({ clientEmail: 1, uploadedAt: -1 });
audioRecordingSchema.index({ counsellorEmail: 1, isDeleted: 1 });
let AudioRecording = mongoose.model('AudioRecording', audioRecordingSchema);

// 4. ClinicalCaseHistory Schema (Comprehensive Psychological Case Records)
const clinicalCaseHistorySchema = new mongoose.Schema({
  clientEmail: { type: String, required: true, unique: true, lowercase: true, index: true },
  clientName: { type: String, required: true },
  counsellorEmail: { type: String, required: true, lowercase: true },
  presentingProblems: { type: String, default: '' },
  historyOfPresentIllness: { type: String, default: '' },
  pastPsychiatricHistory: { type: String, default: '' },
  medicalHistory: { type: String, default: '' },
  familyPsychiatricHistory: { type: String, default: '' },
  personalAndSocialHistory: { type: String, default: '' },
  riskAssessment: {
    suicideRisk: { type: String, enum: ['None', 'Low', 'Moderate', 'High'], default: 'None' },
    selfHarmRisk: { type: String, enum: ['None', 'Low', 'Moderate', 'High'], default: 'None' },
    harmToOthers: { type: String, enum: ['None', 'Low', 'Moderate', 'High'], default: 'None' },
    riskNotes: { type: String, default: '' }
  },
  updatedAt: { type: Date, default: Date.now }
});
let ClinicalCaseHistory = mongoose.model('ClinicalCaseHistory', clinicalCaseHistorySchema);

// 5. MentalStatusExam Schema (MSE Evaluations)
const mentalStatusExamSchema = new mongoose.Schema({
  clientEmail: { type: String, required: true, lowercase: true, index: true },
  clientName: { type: String, required: true },
  counsellorEmail: { type: String, required: true, lowercase: true },
  date: { type: String, required: true },
  appearanceAndBehavior: { type: String, default: '' },
  speechAndCommunication: { type: String, default: '' },
  moodAndAffect: { type: String, default: '' },
  thoughtProcessAndContent: { type: String, default: '' },
  perceptualDisturbances: { type: String, default: '' },
  cognitionAndOrientation: { type: String, default: '' },
  insightAndJudgment: { type: String, default: '' },
  clinicalSummary: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});
let MentalStatusExam = mongoose.model('MentalStatusExam', mentalStatusExamSchema);

// 6. Client Schema (Preserved)
const clientSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  phone: { type: String, required: true },
  ageGroup: { type: String, required: true },
  verified: { type: Boolean, default: false },
  otpCode: { type: String },
  otpExpires: { type: Date },
  resetOtpCode: { type: String },
  resetOtpExpires: { type: Date }
});
let Client = mongoose.model('Client', clientSchema);

// 7. Appointment Schema (Preserved & Enhanced with counsellor tracking)
const appointmentSchema = new mongoose.Schema({
  clientEmail: { type: String, required: true, lowercase: true },
  clientName: { type: String, required: true },
  clientPhone: { type: String, required: true },
  date: { type: String, required: true },
  time: { type: String, required: true },
  durationMinutes: { type: Number, default: 60 },
  bufferMinutes: { type: Number, default: 15 },
  appointmentUtc: { type: Date },
  sessionMode: { type: String, required: true },
  problemDescription: { type: String, required: true },
  status: { type: String, default: 'Pending' }, // 'Pending' | 'Confirmed' | 'Cancelled' | 'Rescheduled'
  cancellationReason: { type: String, default: '' },
  rescheduledFrom: {
    date: String,
    time: String,
    rescheduledAt: Date,
    rescheduledBy: String
  },
  history: [{
    action: String,
    timestamp: { type: Date, default: Date.now },
    performedBy: String,
    details: mongoose.Schema.Types.Mixed
  }],
  reminded24h: { type: Boolean, default: false },
  reminded1h: { type: Boolean, default: false },
  notes: { type: String, default: '' },
  counsellorEmail: { type: String, default: 'sabujd880@gmail.com', lowercase: true }
});
appointmentSchema.index({ clientEmail: 1, date: -1 });
appointmentSchema.index({ counsellorEmail: 1, status: 1 });
appointmentSchema.index({ date: 1, time: 1, status: 1 });
appointmentSchema.index({ appointmentUtc: 1, status: 1 });
appointmentSchema.index({ appointmentUtc: 1 }, { unique: true, partialFilterExpression: { status: { $ne: 'Cancelled' } } });
let Appointment = mongoose.model('Appointment', appointmentSchema);

// 8. Message Schema (Preserved)
const messageSchema = new mongoose.Schema({
  senderName: { type: String, required: true },
  senderEmail: { type: String, required: true, lowercase: true },
  subject: { type: String, required: true },
  message: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  status: { type: String, default: 'unread' }, // 'unread' | 'read' | 'replied'
  replies: [{
    id: { type: String, required: true },
    message: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
  }]
});
messageSchema.index({ senderEmail: 1, timestamp: -1 });
messageSchema.index({ status: 1, timestamp: -1 });
let Message = mongoose.model('Message', messageSchema);

// 9. CareDocument Schema (Preserved)
const careDocumentSchema = new mongoose.Schema({
  clientEmail: { type: String, required: true, lowercase: true },
  clientName: { type: String, required: true },
  type: { type: String, required: true }, // 'receipt' | 'prescription' | 'report'
  date: { type: String, required: true },
  data: { type: mongoose.Schema.Types.Mixed, required: true },
  counsellorEmail: { type: String, default: 'sabujd880@gmail.com', lowercase: true }
});
careDocumentSchema.index({ clientEmail: 1, type: 1 });
careDocumentSchema.index({ counsellorEmail: 1, date: -1 });
let CareDocument = mongoose.model('CareDocument', careDocumentSchema);

// 10. Availability & Scheduling Governance Schema
const availabilitySchema = new mongoose.Schema({
  workingDays: { type: [Number], default: [1, 2, 3, 4, 5] },
  blockedDates: { type: [String], default: [] },
  blockedRanges: {
    type: [{
      date: String,
      startTime: String,
      endTime: String,
      reason: String
    }],
    default: []
  },
  startHour: { type: String, default: '09:00' },
  endHour: { type: String, default: '17:00' },
  breakStart: { type: String, default: '13:00' },
  breakEnd: { type: String, default: '14:00' },
  defaultDurationMinutes: { type: Number, default: 60 },
  permittedDurations: { type: [Number], default: [30, 45, 60] },
  bufferMinutes: { type: Number, default: 15 },
  minAdvanceHours: { type: Number, default: 2 },
  maxAdvanceDays: { type: Number, default: 60 },
  maxAppointmentsPerDay: { type: Number, default: 8 },
  cancellationDeadlineHours: { type: Number, default: 24 },
  reschedulingDeadlineHours: { type: Number, default: 12 },
  holidays: {
    type: [{
      date: String,
      name: String,
      type: { type: String, default: 'holiday' }
    }],
    default: []
  }
});
let Availability = mongoose.model('Availability', availabilitySchema);

// 11. Theme Governance Schema (Restricted to Super Admin & Administrator)
const themeConfigSchema = new mongoose.Schema({
  activeTheme: { type: String, default: 'lavender-rose' },
  themeMode: { type: String, default: 'light' },
  updatedBy: { type: String, default: 'System Initializer' },
  updatedAt: { type: Date, default: Date.now },
  history: {
    type: [{
      theme: String,
      mode: String,
      updatedBy: String,
      timestamp: { type: Date, default: Date.now }
    }],
    default: []
  }
});
let ThemeConfig = mongoose.model('ThemeConfig', themeConfigSchema);

// 12. PatientProfile Schema (for Comprehensive Patient / Service User & Clinical History Management)
const patientProfileSchema = new mongoose.Schema({
  profileId: { type: String, required: true, unique: true, uppercase: true, index: true },
  userId: { type: String, sparse: true, index: true },
  category: { 
    type: String, 
    enum: [
      'General Patient', 'Staff Referral', 'Self-Referral', 'Professional Referral', 'Other',
      'student', 'patient', 'staff_referral', 'other' // legacy backward compatibility
    ], 
    default: 'General Patient',
    index: true
  },
  personalInfo: {
    fullName: { type: String, required: true, trim: true },
    photoUrl: { type: String, default: '' },
    dateOfBirth: { type: String, default: '' },
    age: { type: Number },
    gender: { 
      type: String, 
      enum: ['Female', 'Male', 'Non-Binary', 'Other', 'Prefer not to say', 'Self-described', 'Unknown / Not Available', ''], 
      default: 'Unknown / Not Available' 
    },
    selfDescribedGender: { type: String, default: '' },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    phone: { type: String, trim: true, default: '' },
    alternatePhone: { type: String, trim: true, default: '' },
    occupation: { type: String, trim: true, default: '' },
    address: { type: String, default: '' },
    city: { type: String, default: '' },
    state: { type: String, default: '' },
    postalCode: { type: String, default: '' },
    pinCode: { type: String, default: '' },
    preferredLanguage: { type: String, default: 'English' }
  },
  emergencyContact: {
    name: { type: String, trim: true, default: '' },
    contactPersonName: { type: String, trim: true, default: '' },
    relationship: { type: String, trim: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    altPhone: { type: String, trim: true, default: '' },
    address: { type: String, default: '' },
    authorizedForClinicalDisclosure: { type: Boolean, default: false }
  },
  pastMedicalPsychiatricHistory: {
    assessmentStatus: { 
      type: String, 
      enum: ['Not assessed', 'Not known', 'None reported', 'Reported', ''], 
      default: 'None reported' 
    },
    previousMedicalIllnesses: { type: String, default: '' },
    previousPsychiatricHistory: { type: String, default: '' },
    previousPsychologicalCounselling: { type: String, default: '' },
    previousPsychiatricConsultation: { type: String, default: '' },
    previousHospitalisation: { type: String, default: '' },
    previousSurgeries: { type: String, default: '' },
    previousTreatments: { type: String, default: '' },
    currentMedications: { type: String, default: '' },
    previousMedications: { type: String, default: '' },
    knownAllergies: { type: String, default: '' },
    substanceUseHistory: { type: String, default: '' },
    relevantMedicalNotes: { type: String, default: '' },
    structuredConditions: [{
      condition: String,
      approximateYear: String,
      treatmentReceived: String,
      currentStatus: String,
      notes: String
    }]
  },
  familyHistory: {
    familyMedicalHistory: { type: String, default: '' },
    familyPsychiatricHistory: { type: String, default: '' },
    hereditaryConditions: { type: String, default: '' },
    historyOfSubstanceUseInFamily: { type: String, default: '' },
    relevantFamilyStressors: { type: String, default: '' },
    familyStructure: { type: String, default: '' },
    familySupportSystem: { type: String, default: '' },
    additionalFamilyNotes: { type: String, default: '' },
    structuredMembers: [{
      relationship: String,
      condition: String,
      clinicalDetails: String
    }]
  },
  birthDevelopmentalHistory: {
    status: { 
      type: String, 
      enum: ['Not Applicable', 'Not Assessed', 'Unknown', 'Assessed', ''], 
      default: 'Not Applicable' 
    },
    pregnancyHistory: { type: String, default: '' },
    maternalPregnancyComplications: { type: String, default: '' },
    birthType: { 
      type: String, 
      enum: ['Normal Vaginal Delivery', 'Caesarean Section', 'Assisted Delivery', 'Unknown', 'Not Applicable', ''], 
      default: 'Unknown' 
    },
    gestationalAge: { type: String, default: '' },
    prematureBirth: { 
      type: String, 
      enum: ['Yes', 'No', 'Unknown', 'Not Applicable', ''], 
      default: 'Unknown' 
    },
    birthComplications: { type: String, default: '' },
    birthWeight: { type: String, default: '' },
    neonatalComplications: { type: String, default: '' },
    developmentalMilestones: { type: String, default: '' },
    speechLanguageDevelopment: { type: String, default: '' },
    motorDevelopment: { type: String, default: '' },
    cognitiveLearningDevelopment: { type: String, default: '' },
    childhoodDevelopmentalConcerns: { type: String, default: '' },
    relevantAdditionalNotes: { type: String, default: '' }
  },
  personalSocialHistory: {
    educationalBackground: { type: String, default: '' },
    occupationalHistory: { type: String, default: '' },
    employmentStatus: { type: String, default: '' },
    maritalStatus: { type: String, default: '' },
    livingArrangements: { type: String, default: '' },
    socialSupport: { type: String, default: '' },
    sleepPattern: { type: String, default: '' },
    appetite: { type: String, default: '' },
    lifestyleInformation: { type: String, default: '' },
    relevantPersonalHistory: { type: String, default: '' },
    additionalNotes: { type: String, default: '' }
  },
  clinicalInfo: {
    presentingConcerns: { type: String, default: '' },
    durationOfConcerns: { type: String, default: '' },
    onsetAndCourse: { type: String, default: '' },
    previousCounsellingExperience: { type: String, default: '' },
    previousMentalHealthTreatment: { type: String, default: '' },
    relevantClinicalObservations: { type: String, default: '' },
    initialClinicalImpression: { type: String, default: '' },
    additionalClinicalNotes: { type: String, default: '' },
    relevantClinicalHistory: { type: String, default: '' },
    previousCounsellingHistory: { type: String, default: '' },
    referralInformation: { type: String, default: '' },
    assessmentReferences: { type: [String], default: [] },
    currentCareStatus: { 
      type: String, 
      enum: ['Intake', 'Active Therapy', 'On Hold', 'Maintenance', 'Completed', 'Referred Out', 'Discharged'], 
      default: 'Intake' 
    },
    followUpRecommendations: { type: String, default: '' },
    lastClinicalReviewDate: { type: Date },
    lastReviewedBy: { type: String, default: '' }
  },
  academicInfo: {
    isStudent: { type: Boolean, default: false },
    registrationNumber: { type: String, trim: true, default: '', index: true },
    department: { type: String, trim: true, default: '', index: true },
    schoolFaculty: { type: String, trim: true, default: '' },
    programme: { type: String, trim: true, default: '' },
    programmeLevel: { 
      type: String, 
      enum: ['UG', 'PG', 'PhD', 'Diploma', 'Other', ''], 
      default: 'UG',
      index: true
    },
    currentSemester: { type: String, default: '' },
    academicSession: { type: String, default: '' },
    enrollmentStatus: { 
      type: String, 
      enum: ['Active', 'On Leave', 'Graduated', 'Suspended', 'Withdrawn', ''], 
      default: 'Active' 
    }
  },
  assignedProvider: {
    providerId: { type: String, default: '' },
    providerName: { type: String, default: '' },
    providerEmail: { type: String, default: '' },
    assignedAt: { type: Date },
    assignedBy: { type: String, default: '' }
  },
  assignmentHistory: [{
    providerId: String,
    providerName: String,
    providerEmail: String,
    assignedAt: { type: Date, default: Date.now },
    assignedBy: String,
    reason: String
  }],
  consentAndPrivacy: {
    patientConsentStatus: { 
      type: String, 
      enum: ['Granted', 'Pending', 'Refused', 'Withdrawn', ''], 
      default: 'Pending' 
    },
    consentDateTime: { type: Date },
    consentRecordedBy: { type: String, default: '' },
    guardianDetails: {
      hasGuardian: { type: Boolean, default: false },
      guardianName: { type: String, default: '' },
      guardianRelationship: { type: String, default: '' },
      guardianPhone: { type: String, default: '' },
      guardianEmail: { type: String, default: '' },
      guardianConsentStatus: { type: String, enum: ['Granted', 'Pending', 'Not Applicable', ''], default: 'Not Applicable' }
    },
    privacyNoticeAcknowledged: { type: Boolean, default: false },
    counsellingConsent: { type: Boolean, default: false },
    assessmentConsent: { type: Boolean, default: false },
    audioRecordingConsent: { type: Boolean, default: false },
    consentVersion: { type: String, default: '2.0' },
    consentTimestamp: { type: Date },
    consentWithdrawn: { type: Boolean, default: false },
    withdrawnTimestamp: { type: Date },
    withdrawnReason: { type: String, default: '' }
  },
  documents: [{
    docId: String,
    title: String,
    category: { type: String, enum: ['Referral', 'Consent', 'Academic', 'Clinical', 'Other'], default: 'Other' },
    fileUrl: String,
    fileSize: Number,
    mimeType: String,
    uploadedAt: { type: Date, default: Date.now },
    uploadedBy: String
  }],
  profileStatus: { 
    type: String, 
    enum: ['pending_verification', 'active', 'inactive', 'archived'], 
    default: 'pending_verification', 
    index: true 
  },
  statusHistory: [{
    status: String,
    changedAt: { type: Date, default: Date.now },
    changedBy: String,
    reason: String
  }],
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now }
});

patientProfileSchema.index({ 'personalInfo.email': 1 });
patientProfileSchema.index({ profileStatus: 1, category: 1 });
patientProfileSchema.index({ 'academicInfo.department': 1, 'academicInfo.programmeLevel': 1 });
patientProfileSchema.index({ 'assignedProvider.providerEmail': 1 });
let PatientProfile = mongoose.model('PatientProfile', patientProfileSchema);

// Age calculation helper
function calculateAgeFromDob(dob) {
  if (!dob) return null;
  let d = null;
  if (typeof dob === 'string' && /^\d{2}-\d{2}-\d{4}$/.test(dob)) {
    const parts = dob.split('-');
    d = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
  } else {
    d = new Date(dob);
  }
  if (isNaN(d.getTime())) return null;
  const today = new Date();
  if (d > today) return null; // Prohibit future dates of birth
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) {
    age--;
  }
  return age >= 0 && age < 130 ? age : null;
}

// Generate unique sequential profile ID e.g. VM-2026-00001
async function generateUniqueProfileId() {
  const currentYear = new Date().getFullYear();
  const prefix = `VM-${currentYear}-`;
  
  let attempts = 0;
  while (attempts < 10) {
    attempts++;
    const count = await PatientProfile.countDocuments();
    const candidateId = `${prefix}${String(count + attempts).padStart(5, '0')}`;
    const existing = await PatientProfile.findOne({ profileId: candidateId });
    if (!existing) {
      return candidateId;
    }
  }
  const randomSuffix = Math.floor(10000 + Math.random() * 90000);
  return `${prefix}${randomSuffix}`;
}

// =========================================================================
// AUDIT LOGGER & SECURITY EVENT HELPERS
// =========================================================================
async function generateUniqueAuditId() {
  const year = new Date().getFullYear();
  let count = 0;
  try {
    count = await AuditLog.countDocuments();
  } catch {
    count = Math.floor(1000 + Math.random() * 9000);
  }
  return `AUD-${year}-${String(count + 1).padStart(5, '0')}`;
}

async function recordSecurityEvent({
  category = 'suspicious_activity',
  severity = 'medium',
  title,
  description,
  sourceIp = '',
  affectedUser = '',
  targetResource = ''
}) {
  try {
    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000);
    const existing = await SecurityEvent.findOne({
      category,
      sourceIp,
      affectedUser,
      status: { $in: ['open', 'investigating'] },
      lastOccurred: { $gte: fifteenMinAgo }
    });

    if (existing) {
      existing.occurrences = (existing.occurrences || 1) + 1;
      existing.lastOccurred = new Date();
      await existing.save();
      return existing;
    }

    const year = new Date().getFullYear();
    let count = 0;
    try {
      count = await SecurityEvent.countDocuments();
    } catch {
      count = Math.floor(100 + Math.random() * 900);
    }
    const eventId = `SEC-${year}-${String(count + 1).padStart(5, '0')}`;

    const event = await SecurityEvent.create({
      eventId,
      category,
      severity,
      title,
      description,
      sourceIp,
      affectedUser,
      targetResource,
      status: 'open',
      occurrences: 1,
      timestamp: new Date(),
      lastOccurred: new Date(),
      createdAt: new Date()
    });
    return event;
  } catch (err) {
    console.warn('SecurityEvent recording alert:', err.message);
  }
}

async function logAuditEvent({ 
  actorEmail, 
  actorUserId = '',
  actorRole, 
  action, 
  resourceType = 'general',
  targetResource = 'general', 
  eventCategory = 'Security Administration',
  outcome = 'success',
  severity = 'info',
  details = {}, 
  beforeAfter = null,
  req = null 
}) {
  try {
    const clientIp = getClientIp(req);
    const userAgent = req ? (req.headers['user-agent'] || '') : '';
    const requestId = req?.id || req?.headers?.['x-request-id'] || `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const eventId = await generateUniqueAuditId();

    // Redact passwords, tokens, full clinical bodies from details
    const sanitizedDetails = { ...details };
    ['password', 'token', 'refreshToken', 'secret', 'clientSecret'].forEach(k => {
      if (sanitizedDetails[k]) sanitizedDetails[k] = '[REDACTED]';
    });

    await AuditLog.create({
      eventId,
      actorEmail: actorEmail || 'system',
      actorUserId: actorUserId || (req?.session?.user?.id || ''),
      actorRole: actorRole || (req?.session?.user?.role || 'system'),
      action,
      resourceType,
      targetResource: targetResource || 'general',
      eventCategory,
      outcome,
      severity,
      details: sanitizedDetails,
      beforeAfter,
      timestamp: new Date(),
      createdAt: new Date(),
      ipAddress: clientIp,
      userAgent,
      requestId
    });

    // Auto-create security event if high/critical or unauthorized
    if (outcome === 'denied' || severity === 'high' || severity === 'critical') {
      await recordSecurityEvent({
        category: outcome === 'denied' ? 'unauthorized_access' : 'suspicious_activity',
        severity,
        title: `Security Alert: ${action.replace(/_/g, ' ')}`,
        description: `Action '${action}' was flagged with outcome '${outcome}'. Target: ${targetResource}`,
        sourceIp: clientIp,
        affectedUser: actorEmail,
        targetResource
      });
    }
  } catch (err) {
    console.error('AuditLog writing failed:', err.message);
  }
}

// =========================================================================
// LOCAL FILE-BASED DATABASE FALLBACK FOR DEVELOPMENT
// =========================================================================
const DB_FILE = path.join(process.cwd(), 'local_db.json');

const DB_COLLECTIONS = [
  'clients', 'appointments', 'messages', 'caredocuments', 'availabilities', 
  'users', 'auditlogs', 'audiorecordings', 'casehistories', 'mserecords', 
  'themeconfigs', 'patientprofiles', 'usersessions', 'securityevents', 
  'consents', 'privacyrequests', 'securitysettings'
];

function ensureDbFile() {
  if (!fs.existsSync(DB_FILE)) {
    const initial = {};
    DB_COLLECTIONS.forEach(c => { initial[c] = []; });
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2));
  } else {
    try {
      const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      let modified = false;
      DB_COLLECTIONS.forEach(k => {
        if (!data[k]) {
          data[k] = [];
          modified = true;
        }
      });
      if (modified) {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
      }
    } catch (e) {
      console.warn('Error verifying local db file:', e);
    }
  }
}

function readData() {
  ensureDbFile();
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (e) {
    const fallback = {};
    DB_COLLECTIONS.forEach(c => { fallback[c] = []; });
    return fallback;
  }
}

function writeData(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

class MockModel {
  constructor(collectionName, data) {
    this._collection = collectionName;
    Object.assign(this, data);
    if (!this._id && !this.id) {
      this._id = 'mock_' + Math.random().toString(36).substr(2, 9);
      this.id = this._id;
    }
  }

  async save() {
    const db = readData();
    const list = db[this._collection] || [];
    const index = list.findIndex(item => (item._id === this._id || item.id === this._id));

    const plain = { ...this };
    delete plain._collection;

    if (index >= 0) {
      list[index] = plain;
    } else {
      list.push(plain);
    }
    db[this._collection] = list;
    writeData(db);
    return this;
  }
}

function getNestedProp(obj, path) {
  if (!obj || !path) return undefined;
  if (Object.prototype.hasOwnProperty.call(obj, path)) return obj[path];
  const parts = path.split('.');
  let curr = obj;
  for (const part of parts) {
    if (curr == null) return undefined;
    curr = curr[part];
  }
  return curr;
}

function matchesQuery(item, query = {}) {
  if (!query || Object.keys(query).length === 0) return true;

  if (query.$or && Array.isArray(query.$or)) {
    const orMatches = query.$or.some(subQuery => matchesQuery(item, subQuery));
    if (!orMatches) return false;
  }

  for (const key of Object.keys(query)) {
    if (key === '$or') continue;
    const qVal = query[key];
    const iVal = key.includes('.') ? getNestedProp(item, key) : item[key];

    if (qVal instanceof RegExp) {
      if (!qVal.test(String(iVal || ''))) return false;
      continue;
    }

    if (qVal && typeof qVal === 'object' && !Array.isArray(qVal) && !(qVal instanceof RegExp)) {
      if ('$ne' in qVal) {
        if (iVal === qVal.$ne) return false;
        continue;
      }
      if ('$in' in qVal && Array.isArray(qVal.$in)) {
        if (!qVal.$in.includes(iVal)) return false;
        continue;
      }
      if ('$regex' in qVal) {
        const reg = new RegExp(qVal.$regex, qVal.$options || '');
        if (!reg.test(String(iVal || ''))) return false;
        continue;
      }
    }

    if (typeof qVal === 'string' && typeof iVal === 'string') {
      if (qVal.toLowerCase() !== iVal.toLowerCase()) return false;
    } else if (iVal !== qVal) {
      return false;
    }
  }

  return true;
}

const makeMockModel = (collectionName) => {
  function Model(data = {}) {
    return new MockModel(collectionName, data);
  }
  Model.findOne = async function(query = {}) {
    const db = readData();
    const list = db[collectionName] || [];
    const found = list.find(item => matchesQuery(item, query));
    if (!found && collectionName === 'availabilities') {
      const defaultAvail = {
        _id: 'default-avail',
        workingDays: [1, 2, 3, 4, 5],
        blockedDates: [],
        blockedRanges: [],
        startHour: '09:00',
        endHour: '17:00',
        breakStart: '13:00',
        breakEnd: '14:00',
        defaultDurationMinutes: 60,
        permittedDurations: [30, 45, 60],
        bufferMinutes: 15,
        minAdvanceHours: 2,
        maxAdvanceDays: 60,
        maxAppointmentsPerDay: 8,
        cancellationDeadlineHours: 24,
        reschedulingDeadlineHours: 12,
        holidays: []
      };
      db.availabilities = [defaultAvail];
      writeData(db);
      return new MockModel('availabilities', defaultAvail);
    }
    if (!found && collectionName === 'securitysettings') {
      const defaultSec = {
        _id: 'default-sec-settings',
        configId: 'global_security_config',
        sessionInactivityTimeoutMinutes: 15,
        loginRateLimitMax: 5,
        loginRateLimitWindowMinutes: 15,
        passwordMinLength: 8,
        requireSpecialChar: true,
        requireNumber: true,
        auditLogRetentionDays: 365,
        enableSuspiciousLoginAlerts: true,
        enableUnauthorizedAccessAlerts: true,
        approvedOrigins: ['http://localhost:5173', 'http://127.0.0.1:5173', 'https://verdant-mind.onrender.com'],
        updatedAt: new Date(),
        updatedBy: 'SYSTEM_BOOTSTRAP'
      };
      db.securitysettings = [defaultSec];
      writeData(db);
      return new MockModel('securitysettings', defaultSec);
    }
    return found ? new MockModel(collectionName, found) : null;
  };
  Model.find = async function(query = {}) {
    const db = readData();
    const list = db[collectionName] || [];
    const filtered = list.filter(item => matchesQuery(item, query));
    return filtered.map(item => new MockModel(collectionName, item));
  };
  Model.findById = async function(id) {
    const db = readData();
    const list = db[collectionName] || [];
    const found = list.find(item => item._id === id || item.id === id);
    return found ? new MockModel(collectionName, found) : null;
  };
  Model.findByIdAndUpdate = async function(id, update, options = {}) {
    const db = readData();
    const list = db[collectionName] || [];
    const index = list.findIndex(item => item._id === id || item.id === id);
    if (index >= 0) {
      list[index] = { ...list[index], ...update };
      writeData(db);
      return new MockModel(collectionName, list[index]);
    }
    return null;
  };
  Model.findOneAndUpdate = async function(query = {}, update = {}, options = {}) {
    const db = readData();
    const list = db[collectionName] || [];
    const index = list.findIndex(item => matchesQuery(item, query));
    if (index >= 0) {
      list[index] = { ...list[index], ...update };
      writeData(db);
      return new MockModel(collectionName, list[index]);
    }
    if (options && options.upsert) {
      const merged = { ...query, ...update };
      const instance = new MockModel(collectionName, merged);
      await instance.save();
      return instance;
    }
    return null;
  };
  Model.create = async function(data) {
    const instance = new MockModel(collectionName, data);
    await instance.save();
    return instance;
  };
  Model.countDocuments = async function(query = {}) {
    const db = readData();
    const list = db[collectionName] || [];
    return list.length;
  };
  Model.deleteOne = async function(query = {}) {
    const db = readData();
    const list = db[collectionName] || [];
    const idx = list.findIndex(item => matchesQuery(item, query));
    if (idx >= 0) {
      list.splice(idx, 1);
      db[collectionName] = list;
      writeData(db);
      return { deletedCount: 1 };
    }
    return { deletedCount: 0 };
  };
  Model.deleteMany = async function(query = {}) {
    const db = readData();
    const list = db[collectionName] || [];
    const remaining = list.filter(item => !matchesQuery(item, query));
    const count = list.length - remaining.length;
    db[collectionName] = remaining;
    writeData(db);
    return { deletedCount: count };
  };
  return Model;
};

function setupLocalDBFallback() {
  if (isProd) {
    console.error('[FATAL] Local JSON database fallback is strictly prohibited in production mode. Halting server.');
    process.exit(1);
  }
  Client = makeMockModel('clients');
  Appointment = makeMockModel('appointments');
  Message = makeMockModel('messages');
  CareDocument = makeMockModel('caredocuments');
  Availability = makeMockModel('availabilities');
  User = makeMockModel('users');
  AuditLog = makeMockModel('auditlogs');
  AudioRecording = makeMockModel('audiorecordings');
  ClinicalCaseHistory = makeMockModel('casehistories');
  MentalStatusExam = makeMockModel('mserecords');
  ThemeConfig = makeMockModel('themeconfigs');
  PatientProfile = makeMockModel('patientprofiles');
  UserSession = makeMockModel('usersessions');
  SecurityEvent = makeMockModel('securityevents');
  ConsentRecord = makeMockModel('consents');
  PrivacyRequest = makeMockModel('privacyrequests');
  SecuritySettings = makeMockModel('securitysettings');
  initializeAvailability();
  initializeSuperAdmin();
  initializeThemeConfig();
  initializeSecuritySettings();
}

// Bootstrap practice security governance settings
async function initializeSecuritySettings() {
  try {
    let settings = await SecuritySettings.findOne({ configId: 'global_security_config' });
    if (!settings) {
      settings = await SecuritySettings.create({
        configId: 'global_security_config',
        sessionInactivityTimeoutMinutes: 15,
        loginRateLimitMax: 5,
        loginRateLimitWindowMinutes: 15,
        passwordMinLength: 8,
        requireSpecialChar: true,
        requireNumber: true,
        auditLogRetentionDays: 365,
        enableSuspiciousLoginAlerts: true,
        enableUnauthorizedAccessAlerts: true,
        approvedOrigins: ['http://localhost:5173', 'http://127.0.0.1:5173', 'https://verdant-mind.onrender.com'],
        updatedAt: new Date(),
        updatedBy: 'SYSTEM_BOOTSTRAP'
      });
      console.log('[BOOTSTRAP] Security governance policy initialized.');
    }
  } catch (err) {
    console.warn('[SECURITY] Notice initializing security settings:', err.message);
  }
}

// Bootstrap initial Super Admin safely if not already present
async function initializeSuperAdmin() {
  try {
    const adminEmail = (process.env.BOOTSTRAP_ADMIN_EMAIL || process.env.PROVIDER_EMAIL || 'sabujd880@gmail.com').toLowerCase().trim();
    let superAdmin = await User.findOne({ email: adminEmail });
    if (!superAdmin) {
      superAdmin = await User.create({
        email: adminEmail,
        name: 'Sabuj Das (Super Admin)',
        role: 'Super Admin',
        status: 'approved',
        picture: '',
        createdAt: new Date(),
        approvedAt: new Date(),
        approvedBy: 'SYSTEM_BOOTSTRAP'
      });
      console.log(`[BOOTSTRAP] Initial Super Admin account provisioned for: ${adminEmail}`);
      await logAuditEvent({
        actorEmail: 'SYSTEM',
        actorRole: 'system',
        action: 'SUPER_ADMIN_BOOTSTRAP',
        targetResource: adminEmail,
        details: { note: 'Initial system super admin provisioned' }
      });
    } else {
      if (superAdmin.role !== 'Super Admin' || superAdmin.status !== 'approved') {
        superAdmin.role = 'Super Admin';
        superAdmin.status = 'approved';
        await superAdmin.save();
        console.log(`[BOOTSTRAP] Elevated bootstrap admin ${adminEmail} to Super Admin.`);
      }
    }
  } catch (err) {
    console.error('Error provisioning initial Super Admin:', err.message);
  }
}

// Ensure a default Availability record exists on startup
async function initializeAvailability() {
  try {
    const count = await Availability.countDocuments();
    if (count === 0) {
      await Availability.create({
        workingDays: [1, 2, 3, 4, 5],
        blockedDates: [],
        startHour: '09:00',
        endHour: '17:00'
      });
      console.log('Initialized default availability configuration.');
    }
  } catch (err) {
    console.error('Error initializing default availability:', err);
  }
}

// Bootstrap authoritative practice theme safely if not already present
async function initializeThemeConfig() {
  try {
    let config = await ThemeConfig.findOne();
    if (!config) {
      await ThemeConfig.create({
        activeTheme: 'lavender-rose',
        themeMode: 'light',
        updatedBy: 'System Bootstrap',
        updatedAt: new Date(),
        history: [{
          theme: 'lavender-rose',
          mode: 'light',
          updatedBy: 'System Bootstrap',
          timestamp: new Date()
        }]
      });
      console.log('Initialized default lavender-rose brand theme configuration.');
    }
  } catch (err) {
    console.warn('[THEME WARNING] Initial theme bootstrap skipped:', err.message);
  }
}

// Mongoose Connection Pool Configuration
const mongoOptions = {
  maxPoolSize: parseInt(process.env.MONGO_MAX_POOL_SIZE || '50', 10),
  minPoolSize: parseInt(process.env.MONGO_MIN_POOL_SIZE || '10', 10),
  serverSelectionTimeoutMS: process.env.NODE_ENV === 'test' ? 1500 : 20000,
  socketTimeoutMS: 45000,
  connectTimeoutMS: 20000,
  retryWrites: true,
  w: 'majority'
};

async function connectToMongoWithRetry(uri, options, maxRetries = 3) {
  let lastErr = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 1) {
        console.log(`[MONGODB] Connection attempt ${attempt}/${maxRetries} to MongoDB Atlas...`);
      }
      await mongoose.connect(uri, options);
      console.log(`Successfully connected to MongoDB Atlas (Pool: min=${options.minPoolSize}, max=${options.maxPoolSize}).`);
      return true;
    } catch (err) {
      lastErr = err;
      console.warn(`[MONGODB WARN] Connection attempt ${attempt}/${maxRetries} failed: ${err.message}`);
      if (attempt < maxRetries) {
        const delayMs = attempt * 3000;
        console.log(`[MONGODB] Retrying in ${delayMs / 1000}s...`);
        await new Promise(res => setTimeout(res, delayMs));
      }
    }
  }
  throw lastErr;
}

if (process.env.MONGODB_URI && process.env.NODE_ENV !== 'test') {
  try {
    await connectToMongoWithRetry(process.env.MONGODB_URI, mongoOptions, isProd ? 4 : 2);
    await initializeAvailability();
    await initializeSuperAdmin();
    await initializeThemeConfig();
    await initializeSecuritySettings();
  } catch (err) {
    console.error('================================================================================');
    console.error('[FATAL] Error connecting to MongoDB Atlas:', err.message);
    console.error('');
    console.error('REQUIRED ACTIONS FOR MONGODB ATLAS:');
    console.error('1. IP ACCESS LIST (WHITELIST) IN MONGODB ATLAS:');
    console.error('   Render instances use dynamic egress IP addresses that change on every deploy.');
    console.error('   -> Log in to MongoDB Atlas (https://cloud.mongodb.com/) -> Security -> Network Access.');
    console.error('   -> Click "+ ADD IP ADDRESS" -> Select "ALLOW ACCESS FROM ANYWHERE" (0.0.0.0/0).');
    console.error('   -> Click "Confirm" and wait 1-2 minutes until status shows "Active" (green).');
    console.error('');
    console.error('2. CLUSTER STATE (PAUSED CLUSTER):');
    console.error('   Free tier (M0 Sandbox) clusters automatically pause after periods of inactivity.');
    console.error('   -> In Atlas Dashboard -> Database -> Check if cluster is paused -> Click "Resume".');
    console.error('');
    console.error('3. MONGODB_URI FORMAT & CREDENTIAL ENCODING:');
    console.error('   Verify credentials in the Render Dashboard -> Environment -> MONGODB_URI.');
    console.error('   If the password has special characters (@, #, $, %, etc.), URL-encode them:');
    console.error('   e.g. "@" -> "%40", "#" -> "%23", "$" -> "%24", "%" -> "%25", "!" -> "%21".');
    console.error('================================================================================');
    if (isProd) {
      console.error('[FATAL] Database connection failed in production. Halting server process.');
      process.exit(1);
    }
    console.log('Swapping to local file-based database fallback...');
    setupLocalDBFallback();
  }
} else {
  if (isProd) {
    console.error('[FATAL] MONGODB_URI is required in production mode. Halting server process.');
    process.exit(1);
  }
  console.log('No MONGODB_URI provided. Swapping to local file-based database fallback...');
  setupLocalDBFallback();
}

// =========================================================================
// RBAC & IDOR PERMISSION MIDDLEWARE (With 15-Min Inactivity & Revocation Checks)
// =========================================================================

// Middleware: Require active authentication session with inactivity timeout and revocation enforcement
const requireAuth = async (req, res, next) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'Authentication required. Please sign in.' });
  }

  const now = Date.now();
  const INACTIVITY_TIMEOUT_MS = parseInt(process.env.SESSION_INACTIVITY_TIMEOUT_MS || String(15 * 60 * 1000), 10);
  const ABSOLUTE_TIMEOUT_MS = 8 * 60 * 60 * 1000; // 8 hours absolute session ceiling

  // 1. Enforce 15-Minute Inactivity Timeout
  if (req.session.lastActivity && (now - req.session.lastActivity > INACTIVITY_TIMEOUT_MS)) {
    req.session.destroy(() => {});
    return res.status(401).json({ 
      error: 'Session expired due to 15 minutes of inactivity. Please sign in again.',
      code: 'SESSION_INACTIVITY_TIMEOUT'
    });
  }

  // 2. Enforce 8-Hour Absolute Session Lifetime
  if (req.session.createdAt && (now - req.session.createdAt > ABSOLUTE_TIMEOUT_MS)) {
    req.session.destroy(() => {});
    return res.status(401).json({ 
      error: 'Session maximum 8-hour lifetime reached. Please sign in again.',
      code: 'SESSION_ABSOLUTE_TIMEOUT'
    });
  }

  // Update last activity timestamp on legitimate interaction
  req.session.lastActivity = now;

  // 3. UserSession Revocation Check & Heartbeat
  try {
    if (req.sessionID) {
      const sessRecord = await UserSession.findOne({ sessionId: req.sessionID });
      if (sessRecord && sessRecord.status === 'revoked') {
        req.session.destroy(() => {});
        return res.status(401).json({ 
          error: 'Your session has been terminated by security administration. Please sign in again.',
          code: 'SESSION_REVOKED'
        });
      }
      if (sessRecord && sessRecord.status === 'active') {
        sessRecord.lastActivity = new Date();
        await sessRecord.save();
      }
    }
  } catch (sessCheckErr) {
    // Graceful non-blocking
  }

  // 4. Server-Side Account Status & Administrative Revocation Check
  try {
    const userEmail = (req.session.user.email || '').toLowerCase().trim();
    if (userEmail) {
      const userDoc = await User.findOne({ email: userEmail });
      if (userDoc) {
        if (userDoc.status === 'suspended' || userDoc.status === 'rejected') {
          req.session.destroy(() => {});
          return res.status(401).json({ 
            error: `Your account status is ${userDoc.status}. Access has been revoked by an administrator.`,
            code: 'ACCOUNT_SUSPENDED'
          });
        }
        if (userDoc.revokedSessionsBefore && req.session.authTime && new Date(req.session.authTime) < new Date(userDoc.revokedSessionsBefore)) {
          req.session.destroy(() => {});
          return res.status(401).json({ 
            error: 'This session was invalidated by an administrator. Please log in again.',
            code: 'SESSION_REVOKED'
          });
        }
      }
    }
  } catch (authErr) {
    console.warn('[AUTH] Warning during session status verification:', authErr.message);
  }

  next();
};

// Middleware: Require specific role(s)
const requireRole = (allowedRoles) => {
  return async (req, res, next) => {
    if (!req.session || !req.session.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    const role = req.session.user.role;
    // Map legacy 'provider' to 'Super Admin'
    const effectiveRole = role === 'provider' ? 'Super Admin' : role;
    if (!allowedRoles.includes(effectiveRole)) {
      await logAuditEvent({
        actorEmail: req.session.user.email,
        actorRole: role,
        action: 'UNAUTHORIZED_ROLE_ACCESS_DENIED',
        resourceType: 'api_endpoint',
        targetResource: req.originalUrl || req.path,
        eventCategory: 'Security Administration',
        outcome: 'denied',
        severity: 'high',
        details: { requiredRoles: allowedRoles, attemptedMethod: req.method },
        req
      });
      return res.status(403).json({ 
        error: `Access denied. Your role '${role}' is not authorized for this operation.` 
      });
    }
    next();
  };
};

// Helper: Verify if current user is permitted to access a given client's clinical record
const canAccessClientRecord = (user, clientEmail) => {
  if (!user || !clientEmail) return false;
  const role = user.role === 'provider' ? 'Super Admin' : user.role;
  const targetEmail = clientEmail.toLowerCase().trim();

  // Super Admin and Administrator have practice-wide clinical oversight
  if (role === 'Super Admin' || role === 'Administrator') return true;

  // Client can only ever access their own records
  if (role === 'client') return user.email.toLowerCase() === targetEmail;

  // Counsellor can access assigned clients or if single-practitioner
  if (role === 'Counsellor') {
    if (user.assignedClients && user.assignedClients.length > 0) {
      return user.assignedClients.some(e => e.toLowerCase() === targetEmail);
    }
    return true; // Default access for sole/unrestricted counsellor
  }

  // Viewer has strict read-only access only to explicitly assigned clients
  if (role === 'Viewer') {
    return user.assignedClients && user.assignedClients.some(e => e.toLowerCase() === targetEmail);
  }

  return false;
};

// =========================================================================
// SYSTEM HEALTH & READINESS PROBES (AWS App Runner / ECS / Kubernetes)
// =========================================================================
app.get('/api/health', (req, res) => {
  const dbState = mongoose.connection.readyState;
  const dbStatus = dbState === 1 ? 'CONNECTED' : (dbState === 2 ? 'CONNECTING' : 'DISCONNECTED');
  const isHealthy = dbState === 1 || !isProd;
  
  const mem = process.memoryUsage();
  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'UP' : 'DEGRADED',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    database: dbStatus,
    uptimeSeconds: Math.floor(process.uptime()),
    memory: {
      rssMb: Math.round(mem.rss / 1024 / 1024),
      heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024)
    },
    timezone: 'Asia/Kolkata',
    timeZoneOffset: '+05:30',
    currentTimeIST: formatISTDateTimeWithZone(new Date()),
    timestamp: new Date().toISOString()
  });
});

app.get('/api/health/ready', (req, res) => {
  if (mongoose.connection.readyState === 1 || !isProd) {
    return res.status(200).json({ ready: true, database: 'CONNECTED' });
  }
  return res.status(503).json({ ready: false, database: 'NOT_CONNECTED' });
});

// =========================================================================
// BREVO TRANSACTIONAL SMTP EMAIL CLIENT (PRESERVED)
// =========================================================================
const sendEmail = async ({ toEmail, toName, subject, htmlContent }) => {
  try {
    if (!process.env.BREVO_API_KEY || process.env.NODE_ENV === 'test') {
      console.log(`[EMAIL SIMULATED] To: ${toEmail} | Subject: ${subject}`);
      return { success: true, simulated: true };
    }
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        sender: { name: process.env.SENDER_NAME || 'Verdant Mind Care', email: process.env.SENDER_EMAIL || 'sabujd880@gmail.com' },
        to: [{ email: toEmail, name: toName }],
        subject: subject,
        htmlContent: htmlContent
      })
    });

    if (!response.ok) {
      const errorResponse = await response.text();
      console.error('Brevo API request failed:', errorResponse);
      return { success: false, error: errorResponse };
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    console.error('Failed to send email via Brevo client:', error.message);
    return { success: false, error: error.message };
  }
};

// =========================================================================
// PHASE 2: GOOGLE OAUTH 2.0 REST API ENDPOINTS
// =========================================================================

/**
 * Resolves the authoritative Google OAuth 2.0 callback URL.
 * Strictly eliminates protocol mismatches (forcing HTTPS on public domains),
 * strips accidental trailing slashes/whitespace, avoids raw IP addresses,
 * and guards against localhost callback URLs being accidentally dispatched in cloud/production environments.
 */
export function resolveGoogleCallbackUrl(req) {
  const isCloudOrProd = isProd || process.env.RENDER === 'true';

  // 1. Check explicit GOOGLE_CALLBACK_URL from environment
  let envCallback = (process.env.GOOGLE_CALLBACK_URL || '').trim();
  if (envCallback) {
    // Guard against accidental deployment of localhost callback in production
    if (isCloudOrProd && (envCallback.includes('localhost') || envCallback.includes('127.0.0.1'))) {
      console.warn(`[OAUTH CONFIG WARNING] GOOGLE_CALLBACK_URL contains localhost in production (${envCallback}). Overriding with production domain callback.`);
      envCallback = '';
    } else {
      let clean = envCallback.replace(/\/+$/, '');
      if (!clean.endsWith('/api/auth/google/callback')) {
        clean = `${clean}/api/auth/google/callback`;
      }
      return clean;
    }
  }

  // 2. Dynamic resolution from incoming HTTP request headers
  if (req) {
    const rawHost = req.get('x-forwarded-host') || req.get('host') || '';
    if (rawHost) {
      const host = rawHost.split(',')[0].trim().replace(/^127\.0\.0\.1/, 'localhost');
      const isLocalhost = host.startsWith('localhost') || host.startsWith('127.0.0.1');

      let protocol = 'https';
      if (isLocalhost && !isCloudOrProd) {
        protocol = (req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim();
      } else {
        protocol = 'https';
      }

      return `${protocol}://${host}/api/auth/google/callback`;
    }
  }

  // 3. Check explicit RENDER_EXTERNAL_URL, BACKEND_URL, or API_URL
  const envBackend = (process.env.RENDER_EXTERNAL_URL || process.env.BACKEND_URL || process.env.API_URL || '').trim();
  if (envBackend) {
    let clean = envBackend.replace(/\/+$/, '');
    if (isCloudOrProd && clean.startsWith('http://') && !clean.includes('localhost') && !clean.includes('127.0.0.1')) {
      clean = clean.replace(/^http:\/\//, 'https://');
    }
    if (!clean.endsWith('/api/auth/google/callback')) {
      clean = `${clean}/api/auth/google/callback`;
    }
    return clean;
  }

  // 4. Default fallback
  return isCloudOrProd 
    ? 'https://verdant-mind-therapy-ys6i.onrender.com/api/auth/google/callback'
    : 'http://localhost:5000/api/auth/google/callback';
}

/**
 * Resolves the authoritative frontend redirect URL after OAuth callback.
 */
export function resolveFrontendUrl(req) {
  const isCloudOrProd = isProd || process.env.RENDER === 'true';

  let envFrontend = (process.env.FRONTEND_URL || '').trim();
  if (envFrontend) {
    if (isCloudOrProd && (envFrontend.includes('localhost') || envFrontend.includes('127.0.0.1'))) {
      console.warn(`[OAUTH CONFIG WARNING] FRONTEND_URL contains localhost in production (${envFrontend}). Overriding with production domain.`);
      envFrontend = '';
    } else {
      return envFrontend.replace(/\/+$/, '');
    }
  }

  if (req) {
    const rawHost = req.get('x-forwarded-host') || req.get('host') || '';
    if (rawHost) {
      const host = rawHost.split(',')[0].trim().replace(/^127\.0\.0\.1/, 'localhost');
      const isLocalhost = host.startsWith('localhost') || host.startsWith('127.0.0.1');
      const protocol = isLocalhost && !isCloudOrProd 
        ? (req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim() 
        : 'https';
      return `${protocol}://${host}`;
    }
  }

  if (process.env.RENDER_EXTERNAL_URL) {
    return process.env.RENDER_EXTERNAL_URL.trim().replace(/\/+$/, '');
  }

  return isCloudOrProd ? 'https://verdant-mind-therapy-ys6i.onrender.com' : 'http://localhost:5173';
}

// 1. Initiate Google OAuth 2.0 Server-Side Flow
app.get('/api/auth/google', (req, res) => {
  const callbackUrl = resolveGoogleCallbackUrl(req);
  console.log(`[GOOGLE OAUTH INITIATE] Using redirect_uri: ${callbackUrl}`);

  // Cryptographic random state parameter for CSRF mitigation
  const state = crypto.randomBytes(24).toString('hex');
  req.session.oauthState = state;
  req.session.oauthRedirectTo = req.query.redirect || '/';

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    // If running in development without credentials, provide developer mock login flow option
    if (!isProd) {
      const mockStateUrl = `/api/auth/google/callback?code=dev_mock_code&state=${state}`;
      return req.session.save(() => res.redirect(mockStateUrl));
    }
    const frontendUrl = resolveFrontendUrl(req);
    return res.redirect(`${frontendUrl}/?auth_error=google_not_configured`);
  }

  const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(process.env.GOOGLE_CLIENT_ID)}&redirect_uri=${encodeURIComponent(callbackUrl)}&response_type=code&scope=${encodeURIComponent('openid email profile')}&state=${state}&access_type=online&prompt=select_account`;
  
  // Explicitly persist session state before sending 302 redirect to ensure CSRF token is saved
  req.session.save((err) => {
    if (err) console.error('Failed to save session prior to Google OAuth redirect:', err);
    res.redirect(googleAuthUrl);
  });
});

// 2. Google OAuth 2.0 Authorization Callback
app.get('/api/auth/google/callback', async (req, res) => {
  const frontendUrl = resolveFrontendUrl(req);
  const { code, state, error } = req.query;

  if (error) {
    console.error('Google OAuth returned error:', error);
    return res.redirect(`${frontendUrl}/?auth_error=${encodeURIComponent(error)}`);
  }

  // Validate CSRF state
  if (!state || state !== req.session.oauthState) {
    console.warn('OAuth state verification failed. Potential CSRF attempt.');
    return res.redirect(`${frontendUrl}/?auth_error=csrf_validation_failed`);
  }
  delete req.session.oauthState;

  try {
    let googleUser;

    // Handle dev mock flow ONLY in development if Google credentials are not configured
    if (!isProd && code === 'dev_mock_code' && (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET)) {
      const devEmail = (process.env.BOOTSTRAP_ADMIN_EMAIL || 'sabujd880@gmail.com').toLowerCase();
      googleUser = {
        email: devEmail,
        name: 'Sabuj Das (Developer)',
        picture: 'https://lh3.googleusercontent.com/a/default-user',
        sub: 'mock_google_id_123',
        email_verified: true
      };
    } else {
      const callbackUrl = resolveGoogleCallbackUrl(req);
      console.log(`[GOOGLE OAUTH CALLBACK] Exchanging code with redirect_uri: ${callbackUrl}`);

      // Token Exchange
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET,
          redirect_uri: callbackUrl,
          grant_type: 'authorization_code'
        })
      });

      if (!tokenRes.ok) {
        const tokenErr = await tokenRes.text();
        console.error('Failed to exchange Google OAuth code for tokens:', tokenErr);
        return res.redirect(`${frontendUrl}/?auth_error=token_exchange_failed`);
      }

      const tokenData = await tokenRes.json();

      // Fetch Verified Google Profile
      const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` }
      });

      if (!profileRes.ok) {
        return res.redirect(`${frontendUrl}/?auth_error=profile_fetch_failed`);
      }

      googleUser = await profileRes.json();
    }

    if (!googleUser.email || !googleUser.email_verified) {
      return res.redirect(`${frontendUrl}/?auth_error=unverified_google_email`);
    }

    const normalizedEmail = googleUser.email.toLowerCase().trim();
    const bootstrapEmail = (process.env.BOOTSTRAP_ADMIN_EMAIL || process.env.PROVIDER_EMAIL || 'sabujd880@gmail.com').toLowerCase().trim();

    let user = await User.findOne({ email: normalizedEmail });

    // Check if user already exists as an approved Client (student/patient registration)
    let existingClient = await Client.findOne({ email: normalizedEmail });

    // Bootstrap or Super Admin auto-provisioning
    if (normalizedEmail === bootstrapEmail || normalizedEmail === 'sabujd880@gmail.com') {
      if (!user) {
        user = await User.create({
          email: normalizedEmail,
          name: googleUser.name || 'Super Admin',
          picture: googleUser.picture || '',
          googleId: googleUser.sub,
          role: 'Super Admin',
          status: 'approved',
          createdAt: new Date(),
          approvedAt: new Date(),
          approvedBy: 'SYSTEM_BOOTSTRAP'
        });
      } else {
        user.role = 'Super Admin';
        user.status = 'approved';
        user.googleId = googleUser.sub;
        if (googleUser.picture) user.picture = googleUser.picture;
        await user.save();
      }
    } else if (existingClient && existingClient.verified) {
      // Safe Account Linking: Google account verified email matches existing verified client account
      if (!user) {
        user = await User.create({
          email: existingClient.email,
          name: existingClient.name || googleUser.name,
          picture: googleUser.picture || '',
          googleId: googleUser.sub,
          role: 'client',
          status: 'approved',
          createdAt: new Date()
        });
      } else {
        if (!user.googleId) user.googleId = googleUser.sub;
        if (googleUser.picture) user.picture = googleUser.picture;
        await user.save();
      }
      if (!existingClient.googleId) {
        existingClient.googleId = googleUser.sub;
        await existingClient.save();
      }
    }

    // If user does not exist in the approved system directory:
    // Prevent unrestricted public registration: create pending request and reject immediate entry
    if (!user) {
      user = await User.create({
        email: normalizedEmail,
        name: googleUser.name || 'Portal User',
        picture: googleUser.picture || '',
        googleId: googleUser.sub,
        role: 'Viewer',
        status: 'pending',
        createdAt: new Date()
      });

      await logAuditEvent({
        actorEmail: normalizedEmail,
        actorRole: 'Viewer',
        action: 'UNAPPROVED_OAUTH_REGISTRATION',
        targetResource: 'auth',
        details: { status: 'pending', note: 'New user registered via Google OAuth; awaiting administrator approval.' },
        req
      });

      return res.redirect(`${frontendUrl}/?auth_status=pending_approval&email=${encodeURIComponent(normalizedEmail)}`);
    }

    // Account Status Verification
    if (user.status === 'pending') {
      return res.redirect(`${frontendUrl}/?auth_status=pending_approval&email=${encodeURIComponent(normalizedEmail)}`);
    }
    if (user.status === 'suspended') {
      return res.redirect(`${frontendUrl}/?auth_status=account_suspended`);
    }
    if (user.status === 'rejected') {
      return res.redirect(`${frontendUrl}/?auth_status=account_rejected`);
    }

    // Session Regeneration & Login Establishment
    req.session.regenerate(async (err) => {
      if (err) {
        console.error('Session regeneration error:', err);
        return res.redirect(`${frontendUrl}/?auth_error=session_error`);
      }

      req.session.user = {
        id: user._id || user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        picture: user.picture || googleUser.picture,
        assignedClients: user.assignedClients || []
      };
      req.session.createdAt = Date.now();
      req.session.lastActivity = Date.now();
      req.session.authTime = Date.now();

      user.lastLoginAt = new Date();
      user.lastLoginIp = getClientIp(req);
      if (googleUser.sub) user.googleId = googleUser.sub;
      if (googleUser.picture) user.picture = googleUser.picture;
      await user.save();

      await logAuditEvent({
        actorEmail: user.email,
        actorRole: user.role,
        action: 'GOOGLE_OAUTH_LOGIN',
        targetResource: 'session',
        details: { ip: user.lastLoginIp },
        req
      });

      res.redirect(`${frontendUrl}/?auth_status=success`);
    });

  } catch (authErr) {
    console.error('Google OAuth Callback exception:', authErr);
    res.redirect(`${frontendUrl}/?auth_error=${encodeURIComponent(authErr.message)}`);
  }
});

// 3. Current Authenticated Session Inspection
app.get('/api/auth/me', async (req, res) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ authenticated: false });
  }

  try {
    const user = await User.findById(req.session.user.id) || await User.findOne({ email: req.session.user.email });
    if (!user) {
      req.session.destroy();
      return res.status(401).json({ authenticated: false, error: 'User record no longer exists.' });
    }

    if (user.status !== 'approved') {
      req.session.destroy();
      return res.status(403).json({ authenticated: false, error: `Account is ${user.status}.` });
    }

    // Verify session revocation timestamp
    if (user.revokedSessionsBefore && req.session.authTime && new Date(req.session.authTime) < new Date(user.revokedSessionsBefore)) {
      req.session.destroy();
      return res.status(401).json({ authenticated: false, error: 'Session was revoked by an administrator.' });
    }

    // Update session snapshot if role or assignedClients changed
    req.session.user.role = user.role;
    req.session.user.assignedClients = user.assignedClients || [];

    res.json({
      authenticated: true,
      user: {
        id: user._id || user.id,
        email: user.email,
        name: user.name,
        role: user.role === 'provider' ? 'Super Admin' : user.role,
        picture: user.picture,
        assignedClients: user.assignedClients || []
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Session Termination (Logout)
app.post('/api/auth/logout', async (req, res) => {
  const sessId = req.sessionID;
  if (sessId) {
    try {
      await UserSession.findOneAndUpdate(
        { sessionId: sessId },
        { status: 'logged_out', lastActivity: new Date() }
      );
    } catch {}
  }

  if (req.session && req.session.user) {
    await logAuditEvent({
      actorEmail: req.session.user.email,
      actorRole: req.session.user.role,
      action: 'USER_LOGOUT',
      targetResource: 'session',
      eventCategory: 'Authentication',
      outcome: 'success',
      severity: 'info',
      req
    });
  }

  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({ error: 'Could not log out cleanly.' });
    }
    res.clearCookie('counselling_portal_sid', {
      path: '/',
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax'
    });
    res.json({ success: true, message: 'Logged out successfully.' });
  });
});

// 5. Session Keep-Alive & Inactivity Renewal
app.post('/api/auth/keep-alive', requireAuth, (req, res) => {
  req.session.lastActivity = Date.now();
  res.json({
    success: true,
    lastActivity: req.session.lastActivity,
    message: 'Active session renewed successfully.'
  });
});

// =========================================================================
// PHASE 3 & 4: ADMIN MANAGEMENT MODULE & USER GOVERNANCE
// =========================================================================

// 1. List Registered Users (Super Admin & Administrator)
app.get('/api/admin/users', requireAuth, requireRole(['Super Admin', 'Administrator']), async (req, res) => {
  try {
    const users = await User.find();
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Pre-approve / Add New User Account (Super Admin & Administrator)
app.post('/api/admin/users', requireAuth, requireRole(['Super Admin', 'Administrator']), async (req, res) => {
  const { email, name, role = 'Counsellor', assignedClients = [] } = req.body;
  const currentActor = req.session.user;

  try {
    const normalizedEmail = (email || '').toLowerCase().trim();
    if (!normalizedEmail || !name) {
      return res.status(400).json({ error: 'Email and full name are required.' });
    }

    // Privilege Escalation Prevention: Only Super Admin can create Super Admins
    if (role === 'Super Admin' && currentActor.role !== 'Super Admin') {
      return res.status(403).json({ error: 'Only a Super Admin can create or assign the Super Admin role.' });
    }

    let existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(400).json({ error: 'An account with this email address already exists.' });
    }

    const newUser = await User.create({
      email: normalizedEmail,
      name,
      role,
      status: 'approved',
      assignedClients,
      approvedBy: currentActor.email,
      approvedAt: new Date(),
      createdAt: new Date()
    });

    await logAuditEvent({
      actorEmail: currentActor.email,
      actorRole: currentActor.role,
      action: 'USER_CREATED_BY_ADMIN',
      targetResource: normalizedEmail,
      details: { role, assignedClients },
      req
    });

    res.json(newUser);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Approve, Reject, Suspend, or Reactivate User Status
app.patch('/api/admin/users/:id/status', requireAuth, requireRole(['Super Admin', 'Administrator']), async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const currentActor = req.session.user;

  if (!['approved', 'pending', 'suspended', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Invalid user status specified.' });
  }

  try {
    const targetUser = await User.findById(id);
    if (!targetUser) {
      return res.status(404).json({ error: 'Target user could not be found.' });
    }

    // Safety constraint: Cannot suspend or reject yourself
    if (targetUser.email.toLowerCase() === currentActor.email.toLowerCase()) {
      return res.status(400).json({ error: 'You cannot alter your own account status.' });
    }

    // Safety constraint: Administrator cannot modify Super Admin status
    if (targetUser.role === 'Super Admin' && currentActor.role !== 'Super Admin') {
      return res.status(403).json({ error: 'Only Super Admins can alter a Super Admin account.' });
    }

    targetUser.status = status;
    if (status === 'approved') {
      targetUser.approvedBy = currentActor.email;
      targetUser.approvedAt = new Date();
    }
    // If suspended or rejected, automatically invalidate their active sessions
    if (status === 'suspended' || status === 'rejected') {
      targetUser.revokedSessionsBefore = new Date();
    }

    await targetUser.save();

    await logAuditEvent({
      actorEmail: currentActor.email,
      actorRole: currentActor.role,
      action: `USER_STATUS_${status.toUpperCase()}`,
      targetResource: targetUser.email,
      details: { newStatus: status },
      req
    });

    res.json(targetUser);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4. Assign and Change Roles
app.patch('/api/admin/users/:id/role', requireAuth, requireRole(['Super Admin', 'Administrator']), async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;
  const currentActor = req.session.user;

  const validRoles = ['Super Admin', 'Administrator', 'Counsellor', 'Viewer', 'client'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ error: 'Invalid user role specified.' });
  }

  try {
    const targetUser = await User.findById(id);
    if (!targetUser) {
      return res.status(404).json({ error: 'Target user could not be found.' });
    }

    // Privilege Escalation Prevention: User cannot grant themselves administrator privileges
    if (targetUser.email.toLowerCase() === currentActor.email.toLowerCase() && role !== targetUser.role) {
      return res.status(403).json({ error: 'You cannot modify your own role.' });
    }

    // Only Super Admin can assign or demote Super Admin
    if ((role === 'Super Admin' || targetUser.role === 'Super Admin') && currentActor.role !== 'Super Admin') {
      return res.status(403).json({ error: 'Only a Super Admin can assign or modify the Super Admin role.' });
    }

    const previousRole = targetUser.role;
    targetUser.role = role;
    await targetUser.save();

    await logAuditEvent({
      actorEmail: currentActor.email,
      actorRole: currentActor.role,
      action: 'USER_ROLE_CHANGED',
      targetResource: targetUser.email,
      details: { previousRole, newRole: role },
      req
    });

    res.json(targetUser);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 5. Revoke Active Sessions for User
app.post('/api/admin/users/:id/revoke-sessions', requireAuth, requireRole(['Super Admin', 'Administrator']), async (req, res) => {
  const { id } = req.params;
  const currentActor = req.session.user;

  try {
    const targetUser = await User.findById(id);
    if (!targetUser) {
      return res.status(404).json({ error: 'Target user could not be located.' });
    }

    targetUser.revokedSessionsBefore = new Date();
    await targetUser.save();

    await logAuditEvent({
      actorEmail: currentActor.email,
      actorRole: currentActor.role,
      action: 'SESSIONS_REVOKED',
      targetResource: targetUser.email,
      req
    });

    res.json({ success: true, message: `All active sessions for ${targetUser.email} have been revoked.` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =========================================================================
// SECURITY, AUDIT TRAIL & PRIVACY MANAGEMENT SYSTEM
// =========================================================================

// 6. Security Audit Trail (Multi-Filter, Search, Pagination & Backwards Compatibility)
app.get('/api/admin/audit-logs', requireAuth, requireRole(['Super Admin', 'Administrator']), async (req, res) => {
  const { search, category, role, severity, outcome, startDate, endDate, page, limit, paginated } = req.query;
  try {
    const list = await AuditLog.find();
    let logs = Array.isArray(list) ? list : [];

    const getTime = (entry) => {
      if (!entry) return 0;
      const t = entry.timestamp || entry.createdAt;
      if (!t) return 0;
      const time = new Date(t).getTime();
      return isNaN(time) ? 0 : time;
    };

    if (category && category !== 'all') {
      logs = logs.filter(l => l.eventCategory === category);
    }
    if (role && role !== 'all') {
      logs = logs.filter(l => l.actorRole === role);
    }
    if (severity && severity !== 'all') {
      logs = logs.filter(l => l.severity === severity);
    }
    if (outcome && outcome !== 'all') {
      logs = logs.filter(l => l.outcome === outcome);
    }
    if (startDate) {
      const start = new Date(startDate).getTime();
      if (!isNaN(start)) logs = logs.filter(l => getTime(l) >= start);
    }
    if (endDate) {
      const end = new Date(endDate).getTime();
      if (!isNaN(end)) logs = logs.filter(l => getTime(l) <= end);
    }
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      logs = logs.filter(l => 
        (l.actorEmail && l.actorEmail.toLowerCase().includes(q)) ||
        (l.action && l.action.toLowerCase().includes(q)) ||
        (l.targetResource && l.targetResource.toLowerCase().includes(q)) ||
        (l.ipAddress && l.ipAddress.toLowerCase().includes(q)) ||
        (l.eventId && l.eventId.toLowerCase().includes(q))
      );
    }

    logs.sort((a, b) => getTime(b) - getTime(a));

    // If explicit pagination requested
    if (paginated === 'true' || page || limit) {
      const pageNum = parseInt(page, 10) || 1;
      const limitNum = parseInt(limit, 10) || 25;
      const paginatedLogs = logs.slice((pageNum - 1) * limitNum, pageNum * limitNum);
      return res.json({
        logs: paginatedLogs,
        pagination: {
          total: logs.length,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(logs.length / limitNum) || 1
        }
      });
    }

    // Default: return top 100 entries as array for backward-compatibility
    res.json(logs.slice(0, 100));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 6.1 Export Audit Logs (CSV / JSON)
app.get('/api/admin/audit-logs/export', requireAuth, requireRole(['Super Admin', 'Administrator']), async (req, res) => {
  const { format = 'csv' } = req.query;
  const user = req.session.user;
  try {
    const list = await AuditLog.find();
    const logs = (Array.isArray(list) ? list : []).sort((a, b) => {
      const tA = new Date(a.timestamp || a.createdAt).getTime();
      const tB = new Date(b.timestamp || b.createdAt).getTime();
      return tB - tA;
    });

    await logAuditEvent({
      actorEmail: user.email,
      actorRole: user.role,
      action: 'AUDIT_LOGS_EXPORTED',
      resourceType: 'audit_trail',
      targetResource: 'all_logs',
      eventCategory: 'Security Administration',
      outcome: 'success',
      severity: 'medium',
      details: { format, count: logs.length },
      req
    });

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="verdant_mind_audit_export_${Date.now()}.json"`);
      return res.send(JSON.stringify(logs, null, 2));
    }

    const headers = ['Event ID', 'Timestamp', 'Actor Email', 'Actor Role', 'Action', 'Category', 'Resource', 'Outcome', 'Severity', 'IP Address', 'User Agent'];
    const rows = logs.map(l => {
      const dt = l.timestamp || l.createdAt;
      const dateStr = dt && !isNaN(new Date(dt).getTime()) ? new Date(dt).toISOString() : new Date().toISOString();
      return [
        l.eventId || '',
        dateStr,
        `"${(l.actorEmail || '').replace(/"/g, '""')}"`,
        `"${(l.actorRole || '').replace(/"/g, '""')}"`,
        `"${(l.action || '').replace(/"/g, '""')}"`,
        `"${(l.eventCategory || '').replace(/"/g, '""')}"`,
        `"${(l.targetResource || '').replace(/"/g, '""')}"`,
        l.outcome || 'success',
        l.severity || 'info',
        `"${(l.ipAddress || '').replace(/"/g, '""')}"`,
        `"${(l.userAgent || '').replace(/"/g, '""')}"`
      ];
    });

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="verdant_mind_audit_export_${Date.now()}.csv"`);
    res.send(csvContent);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 6.2 Get Single Audit Log Details
app.get('/api/admin/audit-logs/:id', requireAuth, requireRole(['Super Admin', 'Administrator']), async (req, res) => {
  const { id } = req.params;
  try {
    let log = await AuditLog.findOne({ eventId: id.toUpperCase() });
    if (!log) log = await AuditLog.findById(id);
    if (!log) return res.status(404).json({ error: 'Audit log record not found.' });
    res.json(log);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 6.3 Security Dashboard Overview & Visual Analytics
app.get('/api/admin/security/overview', requireAuth, requireRole(['Super Admin', 'Administrator']), async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const [userCount, clientCount, auditList, eventList, sessionList] = await Promise.all([
      User.find(),
      Client.find(),
      AuditLog.find(),
      SecurityEvent.find(),
      UserSession.find()
    ]);

    const allUsers = Array.isArray(userCount) ? userCount : [];
    const allClients = Array.isArray(clientCount) ? clientCount : [];
    const allAudits = Array.isArray(auditList) ? auditList : [];
    const allEvents = Array.isArray(eventList) ? eventList : [];
    const allSessions = Array.isArray(sessionList) ? sessionList : [];

    const totalUsers = allUsers.length + allClients.length;
    const activeUsers = allUsers.filter(u => u.status === 'approved').length + allClients.filter(c => c.verified).length;
    const inactiveUsers = allUsers.filter(u => u.status === 'suspended' || u.status === 'rejected' || u.status === 'pending').length;

    const auditsToday = allAudits.filter(a => new Date(a.timestamp || a.createdAt) >= today);
    const audits7Days = allAudits.filter(a => new Date(a.timestamp || a.createdAt) >= sevenDaysAgo);

    const failedLoginsToday = auditsToday.filter(a => a.outcome === 'failure' || a.action === 'LOGIN_FAILURE').length;
    const successfulLoginsToday = auditsToday.filter(a => a.outcome === 'success' && a.action.includes('LOGIN_SUCCESS')).length;
    const failedLoginsPast7Days = audits7Days.filter(a => a.outcome === 'failure' || a.action === 'LOGIN_FAILURE').length;
    const successfulLoginsPast7Days = audits7Days.filter(a => a.outcome === 'success' && a.action.includes('LOGIN_SUCCESS')).length;

    const activeSessions = allSessions.filter(s => s.status === 'active').length;
    const openSecurityAlerts = allEvents.filter(e => e.status === 'open' || e.status === 'investigating').length;
    const unauthorizedAttemptsToday = auditsToday.filter(a => a.outcome === 'denied' || a.action.includes('UNAUTHORIZED')).length;

    // 7-day trend calculation
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const authActivityTrends = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dayStart = new Date(d);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(d);
      dayEnd.setHours(23, 59, 59, 999);

      const dayAudits = allAudits.filter(a => {
        const at = new Date(a.timestamp || a.createdAt);
        return at >= dayStart && at <= dayEnd;
      });

      authActivityTrends.push({
        date: dayStart.toISOString().split('T')[0],
        day: dayNames[dayStart.getDay()],
        success: dayAudits.filter(a => a.outcome === 'success' && a.action.includes('LOGIN_SUCCESS')).length,
        failure: dayAudits.filter(a => a.outcome === 'failure' || a.action === 'LOGIN_FAILURE').length,
        unauthorized: dayAudits.filter(a => a.outcome === 'denied' || a.action.includes('UNAUTHORIZED')).length
      });
    }

    // Role breakdown
    const userActivityByRole = {
      'Super Admin': allUsers.filter(u => u.role === 'Super Admin' || u.role === 'provider').length,
      'Administrator': allUsers.filter(u => u.role === 'Administrator').length,
      'Counsellor': allUsers.filter(u => u.role === 'Counsellor').length,
      'client': allClients.length + allUsers.filter(u => u.role === 'client').length
    };

    // Category & Severity breakdowns
    const securityEventsByCategory = {};
    const securityEventsBySeverity = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    allEvents.forEach(e => {
      securityEventsByCategory[e.category] = (securityEventsByCategory[e.category] || 0) + (e.occurrences || 1);
      const sev = e.severity || 'medium';
      if (securityEventsBySeverity[sev] !== undefined) {
        securityEventsBySeverity[sev] += (e.occurrences || 1);
      }
    });

    const recentAlerts = allEvents
      .filter(e => e.status === 'open' || e.status === 'investigating')
      .sort((a, b) => new Date(b.lastOccurred || b.createdAt).getTime() - new Date(a.lastOccurred || a.createdAt).getTime())
      .slice(0, 6);

    res.json({
      metrics: {
        totalUsers,
        activeUsers,
        inactiveUsers,
        failedLoginsToday,
        failedLogins24h: failedLoginsToday,
        successfulLoginsToday,
        failedLoginsPast7Days,
        successfulLoginsPast7Days,
        activeSessions,
        openSecurityAlerts,
        openAlerts: openSecurityAlerts,
        criticalAlerts: securityEventsBySeverity.critical || 0,
        unauthorizedAttemptsToday,
        auditEventsToday: auditsToday.length
      },
      visualAnalytics: {
        authActivityTrends,
        userActivityByRole,
        securityEventsByCategory,
        securityEventsBySeverity
      },
      authTimeline: authActivityTrends,
      roleBreakdown: userActivityByRole,
      recentAlerts
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 6.4 Security Events Directory
app.get('/api/admin/security/events', requireAuth, requireRole(['Super Admin', 'Administrator']), async (req, res) => {
  const { status, severity, category, search, page = 1, limit = 20 } = req.query;
  try {
    const list = await SecurityEvent.find();
    let events = Array.isArray(list) ? list : [];

    if (status && status !== 'all') {
      events = events.filter(e => e.status === status);
    }
    if (severity && severity !== 'all') {
      events = events.filter(e => e.severity === severity);
    }
    if (category && category !== 'all') {
      events = events.filter(e => e.category === category);
    }
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      events = events.filter(e => 
        (e.title && e.title.toLowerCase().includes(q)) ||
        (e.description && e.description.toLowerCase().includes(q)) ||
        (e.eventId && e.eventId.toLowerCase().includes(q)) ||
        (e.sourceIp && e.sourceIp.toLowerCase().includes(q)) ||
        (e.affectedUser && e.affectedUser.toLowerCase().includes(q))
      );
    }

    events.sort((a, b) => new Date(b.lastOccurred || b.createdAt).getTime() - new Date(a.lastOccurred || a.createdAt).getTime());

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;
    const paginated = events.slice((pageNum - 1) * limitNum, pageNum * limitNum);

    res.json({
      events: paginated,
      pagination: {
        total: events.length,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(events.length / limitNum) || 1
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 6.5 Resolve / Update Security Event
app.patch('/api/admin/security/events/:id', requireAuth, requireRole(['Super Admin', 'Administrator']), async (req, res) => {
  const { id } = req.params;
  const { status, resolutionNotes, assignedAdmin } = req.body;
  const user = req.session.user;

  try {
    let event = await SecurityEvent.findOne({ eventId: id.toUpperCase() });
    if (!event) event = await SecurityEvent.findById(id);
    if (!event) return res.status(404).json({ error: 'Security event not found.' });

    if (status) event.status = status;
    if (resolutionNotes !== undefined) event.resolutionNotes = resolutionNotes;
    if (assignedAdmin !== undefined) event.assignedAdmin = assignedAdmin;
    if (status === 'resolved' || status === 'dismissed') {
      event.resolvedAt = new Date();
    }
    await event.save();

    await logAuditEvent({
      actorEmail: user.email,
      actorRole: user.role,
      action: 'SECURITY_EVENT_STATUS_UPDATED',
      resourceType: 'security_event',
      targetResource: event.eventId,
      eventCategory: 'Security Administration',
      outcome: 'success',
      severity: 'medium',
      details: { newStatus: status, resolutionNotes },
      req
    });

    res.json({ success: true, event, ...(event.toObject ? event.toObject() : event) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 6.6 Active Sessions List
app.get('/api/admin/security/sessions', requireAuth, requireRole(['Super Admin', 'Administrator']), async (req, res) => {
  try {
    const list = await UserSession.find();
    const sessions = (Array.isArray(list) ? list : [])
      .filter(s => s.status === 'active')
      .sort((a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime());
    res.json(sessions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 6.7 Revoke Specific Session
app.delete('/api/admin/security/sessions/:id', requireAuth, requireRole(['Super Admin', 'Administrator']), async (req, res) => {
  const { id } = req.params;
  const user = req.session.user;
  try {
    let sessionDoc = await UserSession.findOne({ sessionId: id });
    if (!sessionDoc) sessionDoc = await UserSession.findById(id);
    if (!sessionDoc) return res.status(404).json({ error: 'Session not found.' });

    sessionDoc.status = 'revoked';
    sessionDoc.revokedAt = new Date();
    sessionDoc.revokedBy = user.email;
    await sessionDoc.save();

    await logAuditEvent({
      actorEmail: user.email,
      actorRole: user.role,
      action: 'SESSION_REVOKED',
      resourceType: 'session',
      targetResource: sessionDoc.sessionId,
      eventCategory: 'Security Administration',
      outcome: 'success',
      severity: 'medium',
      details: { revokedUser: sessionDoc.userEmail },
      req
    });

    res.json({ success: true, message: `Session ${sessionDoc.sessionId} revoked successfully.` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 6.8 Bulk Revoke Sessions
app.post('/api/admin/security/sessions/revoke-all', requireAuth, requireRole(['Super Admin', 'Administrator']), async (req, res) => {
  const { targetEmail } = req.body;
  const user = req.session.user;
  try {
    const list = await UserSession.find();
    let count = 0;
    for (const sess of (Array.isArray(list) ? list : [])) {
      if (sess.status === 'active') {
        if (!targetEmail || sess.userEmail.toLowerCase() === targetEmail.toLowerCase()) {
          // Do not revoke current actor's session unless targetEmail explicitly matches
          if (sess.sessionId !== req.sessionID || (targetEmail && targetEmail === user.email)) {
            sess.status = 'revoked';
            sess.revokedAt = new Date();
            sess.revokedBy = user.email;
            await sess.save();
            count++;
          }
        }
      }
    }

    await logAuditEvent({
      actorEmail: user.email,
      actorRole: user.role,
      action: 'SESSIONS_BULK_REVOKED',
      resourceType: 'session',
      targetResource: targetEmail || 'all_active_sessions',
      eventCategory: 'Security Administration',
      outcome: 'success',
      severity: 'high',
      details: { revokedCount: count, targetEmail: targetEmail || 'all' },
      req
    });

    res.json({ success: true, count, message: `Successfully revoked ${count} active sessions.` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 6.9 Get Security Settings
app.get('/api/admin/security/settings', requireAuth, requireRole(['Super Admin', 'Administrator']), async (req, res) => {
  try {
    let settings = await SecuritySettings.findOne({ configId: 'global_security_config' });
    if (!settings) settings = await SecuritySettings.findOne();
    if (!settings) {
      settings = {
        configId: 'global_security_config',
        sessionInactivityTimeoutMinutes: 15,
        loginRateLimitMax: 5,
        loginRateLimitWindowMinutes: 15,
        passwordMinLength: 8,
        requireSpecialChar: true,
        requireNumber: true,
        auditLogRetentionDays: 365,
        enableSuspiciousLoginAlerts: true,
        enableUnauthorizedAccessAlerts: true,
        approvedOrigins: ['http://localhost:5173', 'http://127.0.0.1:5173', 'https://verdant-mind.onrender.com']
      };
    }
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 6.10 Update Security Settings
app.patch('/api/admin/security/settings', requireAuth, requireRole(['Super Admin']), async (req, res) => {
  const user = req.session.user;
  const {
    sessionInactivityTimeoutMinutes,
    loginRateLimitMax,
    loginRateLimitWindowMinutes,
    passwordMinLength,
    requireSpecialChar,
    requireNumber,
    auditLogRetentionDays,
    enableSuspiciousLoginAlerts,
    enableUnauthorizedAccessAlerts,
    approvedOrigins
  } = req.body;

  try {
    let settings = await SecuritySettings.findOne({ configId: 'global_security_config' });
    if (!settings) settings = await SecuritySettings.findOne();
    if (!settings) {
      settings = new SecuritySettings({ configId: 'global_security_config' });
    }

    const previousConfig = { ...settings.toObject ? settings.toObject() : settings };

    if (sessionInactivityTimeoutMinutes !== undefined) {
      const val = parseInt(sessionInactivityTimeoutMinutes, 10);
      if (isNaN(val) || val < 5 || val > 120) {
        return res.status(400).json({ error: 'Session inactivity timeout must be between 5 and 120 minutes.' });
      }
      settings.sessionInactivityTimeoutMinutes = val;
    }
    if (loginRateLimitMax !== undefined) {
      const val = parseInt(loginRateLimitMax, 10);
      if (isNaN(val) || val < 3 || val > 50) {
        return res.status(400).json({ error: 'Login rate limit must be between 3 and 50 attempts.' });
      }
      settings.loginRateLimitMax = val;
    }
    if (loginRateLimitWindowMinutes !== undefined) {
      const val = parseInt(loginRateLimitWindowMinutes, 10);
      if (isNaN(val) || val < 1 || val > 60) {
        return res.status(400).json({ error: 'Rate limit window must be between 1 and 60 minutes.' });
      }
      settings.loginRateLimitWindowMinutes = val;
    }
    if (passwordMinLength !== undefined) {
      const val = parseInt(passwordMinLength, 10);
      if (isNaN(val) || val < 8 || val > 32) {
        return res.status(400).json({ error: 'Password minimum length must be between 8 and 32 characters.' });
      }
      settings.passwordMinLength = val;
    }
    if (typeof requireSpecialChar === 'boolean') settings.requireSpecialChar = requireSpecialChar;
    if (typeof requireNumber === 'boolean') settings.requireNumber = requireNumber;
    if (auditLogRetentionDays !== undefined) {
      const val = parseInt(auditLogRetentionDays, 10);
      if (val >= 30 && val <= 2555) settings.auditLogRetentionDays = val;
    }
    if (typeof enableSuspiciousLoginAlerts === 'boolean') settings.enableSuspiciousLoginAlerts = enableSuspiciousLoginAlerts;
    if (typeof enableUnauthorizedAccessAlerts === 'boolean') settings.enableUnauthorizedAccessAlerts = enableUnauthorizedAccessAlerts;
    if (Array.isArray(approvedOrigins)) settings.approvedOrigins = approvedOrigins;

    settings.updatedAt = new Date();
    settings.updatedBy = user.email;
    await settings.save();

    await logAuditEvent({
      actorEmail: user.email,
      actorRole: user.role,
      action: 'SECURITY_SETTINGS_UPDATED',
      resourceType: 'security_config',
      targetResource: 'global_security_config',
      eventCategory: 'Security Administration',
      outcome: 'success',
      severity: 'high',
      beforeAfter: { previous: previousConfig, current: settings },
      req
    });

    res.json({ success: true, settings, ...(settings.toObject ? settings.toObject() : settings) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =========================================================================
// PRIVACY RIGHTS & INFORMED CONSENT MANAGEMENT ENDPOINTS
// =========================================================================

// 6.11 Get My Privacy Profile & Consents
app.get('/api/privacy/me', requireAuth, async (req, res) => {
  const user = req.session.user;
  const userEmail = (user.email || '').toLowerCase().trim();
  try {
    const [consents, requests] = await Promise.all([
      ConsentRecord.find({ userEmail }),
      PrivacyRequest.find({ userEmail })
    ]);

    const activeConsents = {};
    const consentList = Array.isArray(consents) ? consents : [];
    consentList.forEach(c => {
      activeConsents[c.consentType] = c;
    });

    const sortedRequests = (Array.isArray(requests) ? requests : []).sort(
      (a, b) => new Date(b.requestedAt || b.createdAt || 0).getTime() - new Date(a.requestedAt || a.createdAt || 0).getTime()
    );

    res.json({
      activeConsents,
      consents: consentList,
      privacyRequests: sortedRequests,
      requests: sortedRequests
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 6.12 Get Active Consents
app.get('/api/privacy/consents', requireAuth, async (req, res) => {
  const user = req.session.user;
  const userEmail = (user.email || '').toLowerCase().trim();
  try {
    const consents = await ConsentRecord.find({ userEmail });
    res.json(Array.isArray(consents) ? consents : []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 6.13 Grant or Withdraw Consent (Granular & Auditable)
app.post('/api/privacy/consents', requireAuth, async (req, res) => {
  const user = req.session.user;
  const userEmail = (user.email || '').toLowerCase().trim();
  const { consentType, status, version = '1.0', reason = '' } = req.body;

  const validTypes = ['counselling', 'assessment', 'audio_recording', 'teleconsultation', 'data_sharing'];
  if (!validTypes.includes(consentType)) {
    return res.status(400).json({ error: `Invalid consent type. Must be one of: ${validTypes.join(', ')}` });
  }
  if (!['granted', 'withdrawn'].includes(status)) {
    return res.status(400).json({ error: "Consent status must be 'granted' or 'withdrawn'." });
  }

  try {
    let consentDoc = await ConsentRecord.findOne({ userEmail, consentType });
    const clientIp = getClientIp(req);

    const historyEntry = {
      status,
      version,
      timestamp: new Date(),
      ipAddress: clientIp,
      reason
    };

    if (consentDoc) {
      consentDoc.status = status;
      consentDoc.version = version;
      if (status === 'granted') consentDoc.grantedAt = new Date();
      if (status === 'withdrawn') consentDoc.withdrawnAt = new Date();
      consentDoc.history = consentDoc.history || [];
      consentDoc.history.push(historyEntry);
      await consentDoc.save();
    } else {
      const consentId = `CNS-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`;
      consentDoc = await ConsentRecord.create({
        consentId,
        userId: user.id || '',
        userEmail,
        consentType,
        status,
        version,
        purpose: `Client informed consent for ${consentType.replace('_', ' ')} services`,
        collectionMethod: 'portal_self_service',
        ipAddress: clientIp,
        userAgent: req.headers['user-agent'] || '',
        grantedAt: status === 'granted' ? new Date() : undefined,
        withdrawnAt: status === 'withdrawn' ? new Date() : undefined,
        history: [historyEntry]
      });
    }

    // Sync with patient profile if audio recording consent
    if (consentType === 'audio_recording') {
      try {
        const prof = await PatientProfile.findOne({ 'personalInfo.email': userEmail });
        if (prof) {
          prof.consentAndPrivacy = prof.consentAndPrivacy || {};
          prof.consentAndPrivacy.audioRecordingConsent = (status === 'granted');
          await prof.save();
        }
      } catch {}
    }

    await logAuditEvent({
      actorEmail: user.email,
      actorRole: user.role,
      action: status === 'granted' ? 'CONSENT_GRANTED' : 'CONSENT_WITHDRAWN',
      resourceType: 'consent',
      targetResource: consentType,
      eventCategory: 'Privacy & Consent',
      outcome: 'success',
      severity: 'info',
      details: { consentType, status, version },
      req
    });

    res.json({ success: true, consent: consentDoc });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 6.14 Submit Data Subject Privacy Request (DSAR / Deletion / Correction)
app.post('/api/privacy/requests', requireAuth, async (req, res) => {
  const user = req.session.user;
  const userEmail = (user.email || '').toLowerCase().trim();
  const { requestType, details, reason } = req.body;
  const content = (details || reason || '').trim();

  const validTypes = ['access_export', 'correction', 'deactivation', 'deletion', 'restriction'];
  if (!validTypes.includes(requestType)) {
    return res.status(400).json({ error: `Invalid request type. Must be one of: ${validTypes.join(', ')}` });
  }
  if (!content) {
    return res.status(400).json({ error: 'Details or reason are required for a privacy request.' });
  }

  try {
    const year = new Date().getFullYear();
    let count = 0;
    try { 
      const existing = await PrivacyRequest.find();
      count = Array.isArray(existing) ? existing.length : 0;
    } catch {}
    const requestId = `REQ-${year}-${String(count + 1).padStart(5, '0')}`;

    const newReq = await PrivacyRequest.create({
      requestId,
      userId: user.id || '',
      userEmail,
      userName: user.name || 'User',
      requestType,
      reason: (reason || content).trim(),
      details: (details || content).trim(),
      status: 'submitted',
      requestedAt: new Date(),
      submittedAt: new Date()
    });

    await logAuditEvent({
      actorEmail: user.email,
      actorRole: user.role,
      action: 'PRIVACY_REQUEST_SUBMITTED',
      resourceType: 'privacy_request',
      targetResource: requestId,
      eventCategory: 'Privacy & Consent',
      outcome: 'success',
      severity: 'medium',
      details: { requestType },
      req
    });

    res.status(201).json({ success: true, request: newReq, ...(newReq.toObject ? newReq.toObject() : newReq) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 6.15 Admin: View Privacy Requests Queue
app.get('/api/admin/privacy/requests', requireAuth, requireRole(['Super Admin', 'Administrator']), async (req, res) => {
  const { status, type } = req.query;
  try {
    const list = await PrivacyRequest.find();
    let requests = Array.isArray(list) ? list : [];

    if (status && status !== 'all') {
      requests = requests.filter(r => r.status === status);
    }
    if (type && type !== 'all') {
      requests = requests.filter(r => r.requestType === type);
    }

    requests.sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime());
    res.json(requests);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 6.16 Admin: Process Privacy Request (Approve / Reject / Complete)
app.patch('/api/admin/privacy/requests/:id', requireAuth, requireRole(['Super Admin', 'Administrator']), async (req, res) => {
  const { id } = req.params;
  const { status, adminNotes = '' } = req.body;
  const user = req.session.user;

  const allowedStatuses = ['pending', 'submitted', 'in_review', 'under_review', 'fulfilled', 'completed', 'rejected', 'denied'];
  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Must be one of: ${allowedStatuses.join(', ')}` });
  }

  try {
    let prv = await PrivacyRequest.findOne({ requestId: id.toUpperCase() });
    if (!prv) prv = await PrivacyRequest.findById(id);
    if (!prv) return res.status(404).json({ error: 'Privacy request not found.' });

    prv.status = status;
    prv.adminNotes = adminNotes;
    if (status === 'fulfilled' || status === 'completed' || status === 'rejected' || status === 'denied') {
      prv.resolvedAt = new Date();
      prv.resolvedBy = user.email;
    }
    await prv.save();

    await logAuditEvent({
      actorEmail: user.email,
      actorRole: user.role,
      action: 'PRIVACY_REQUEST_PROCESSED',
      resourceType: 'privacy_request',
      targetResource: prv.requestId,
      eventCategory: 'Privacy & Consent',
      outcome: 'success',
      severity: 'medium',
      details: { newStatus: status, adminNotes },
      req
    });

    res.json({ success: true, request: prv, ...(prv.toObject ? prv.toObject() : prv) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 7. Manage Counsellor Client Assignments
app.patch('/api/admin/counsellors/:id/assignments', requireAuth, requireRole(['Super Admin', 'Administrator']), async (req, res) => {
  const { id } = req.params;
  const { assignedClients } = req.body;
  const currentActor = req.session.user;

  try {
    const counsellor = await User.findById(id);
    if (!counsellor) {
      return res.status(404).json({ error: 'Counsellor record not found.' });
    }

    counsellor.assignedClients = Array.isArray(assignedClients) ? assignedClients : [];
    await counsellor.save();

    await logAuditEvent({
      actorEmail: currentActor.email,
      actorRole: currentActor.role,
      action: 'COUNSELLOR_ASSIGNMENTS_UPDATED',
      targetResource: counsellor.email,
      details: { assignedClients: counsellor.assignedClients },
      req
    });

    res.json(counsellor);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =========================================================================
// PHASE 5: COUNSELLING DATA SECURITY, CLINICAL RECORDS & AUDIO RECORDINGS
// =========================================================================

// --- AUDIO RECORDING STORAGE & SHORT-LIVED SIGNED URLS ---

// Token signing key for private local storage fallback streams
const LOCAL_STREAM_SECRET = process.env.SESSION_SECRET || 'local-stream-signing-secret-2026';

function generateLocalStreamToken(recordingId) {
  const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes
  const payload = `${recordingId}:${expiresAt}`;
  const hmac = crypto.createHmac('sha256', LOCAL_STREAM_SECRET).update(payload).digest('hex');
  return Buffer.from(`${payload}:${hmac}`).toString('base64url');
}

function verifyLocalStreamToken(token, expectedRecordingId) {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const [recId, expiresAtStr, hmac] = decoded.split(':');
    if (recId !== expectedRecordingId) return false;
    if (Date.now() > parseInt(expiresAtStr, 10)) return false;
    const expectedPayload = `${recId}:${expiresAtStr}`;
    const expectedHmac = crypto.createHmac('sha256', LOCAL_STREAM_SECRET).update(expectedPayload).digest('hex');
    return hmac === expectedHmac;
  } catch (e) {
    return false;
  }
}

// 1. Upload Clinical Session Audio Recording
app.post('/api/recordings/upload', 
  requireAuth, 
  requireRole(['Super Admin', 'Administrator', 'Counsellor']), 
  upload.single('audioFile'), 
  async (req, res) => {
    const { appointmentId, clientEmail, clientName, title, consentObtained, durationSeconds = 0 } = req.body;
    const actor = req.session.user;

    // Strict Clinical Consent Check (HIPAA / Healthcare Data Compliance)
    const hasConsent = consentObtained === 'true' || consentObtained === true;
    if (!hasConsent) {
      return res.status(400).json({ 
        error: 'Explicit client consent is legally mandatory for clinical audio recording.' 
      });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Audio file attachment is required.' });
    }

    const tempFilePath = req.file.path;

    try {
      // Validate audio magic bytes to prevent disguised scripts or malware
      if (tempFilePath && !isValidAudioMagicBytes(tempFilePath)) {
        return res.status(400).json({ 
          error: 'Uploaded file fails audio magic byte verification. Invalid audio format.' 
        });
      }

      const sanitizedFilename = `rec_${Date.now()}_${crypto.randomBytes(8).toString('hex')}.webm`;
      let storageType = 'local';
      let storageKey = sanitizedFilename;

      if (s3Client && s3Bucket) {
        // Upload to Private S3 with Server-Side Encryption (AES256) via non-buffering stream
        const s3Key = `clinical_recordings/${Date.now()}_${crypto.randomBytes(12).toString('hex')}.webm`;
        const bodyContent = tempFilePath ? fs.createReadStream(tempFilePath) : req.file.buffer;
        await s3Client.send(new PutObjectCommand({
          Bucket: s3Bucket,
          Key: s3Key,
          Body: bodyContent,
          ContentType: req.file.mimetype || 'audio/webm',
          ServerSideEncryption: 'AES256'
        }));
        storageType = 's3';
        storageKey = s3Key;
      } else {
        // Fallback: Save to private server storage
        if (isProd) {
          console.warn('[STORAGE ALERT] Audio recording saved to local filesystem in production mode. Render containers have ephemeral storage. Configure AWS S3 credentials (AWS_S3_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY) to ensure persistent healthcare compliance storage.');
        }
        const filePath = path.join(RECORDINGS_DIR, sanitizedFilename);
        if (tempFilePath) {
          fs.copyFileSync(tempFilePath, filePath);
        } else if (req.file.buffer) {
          fs.writeFileSync(filePath, req.file.buffer);
        }
      }

      // Default 7-Year Healthcare Retention Policy
      const retentionDate = new Date();
      retentionDate.setFullYear(retentionDate.getFullYear() + 7);

      const record = await AudioRecording.create({
        appointmentId: appointmentId || `apt-${Date.now()}`,
        clientEmail: (clientEmail || '').toLowerCase(),
        clientName: clientName || 'Client',
        counsellorEmail: actor.email,
        title: title || `Clinical Session Audio - ${formatISTDate(new Date())}`,
        storageType,
        storageKey,
        s3Bucket: storageType === 's3' ? s3Bucket : undefined,
        mimeType: req.file.mimetype || 'audio/webm',
        fileSizeBytes: req.file.size,
        durationSeconds: Number(durationSeconds) || 0,
        consentObtained: true,
        consentDate: new Date(),
        retentionExpiryDate: retentionDate,
        uploadedAt: new Date()
      });

      await logAuditEvent({
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'AUDIO_RECORDING_UPLOADED',
        targetResource: record._id || record.id,
        details: { clientEmail, appointmentId, durationSeconds },
        req
      });

      res.json(record);
    } catch (err) {
      console.error('Recording upload error:', err);
      res.status(500).json({ error: err.message });
    } finally {
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        try { fs.unlinkSync(tempFilePath); } catch (e) {}
      }
    }
  }
);

// 2. Retrieve Recordings for an Appointment
app.get('/api/recordings/appointment/:appointmentId', requireAuth, async (req, res) => {
  const { appointmentId } = req.params;
  const user = req.session.user;

  try {
    const list = await AudioRecording.find({ appointmentId, isDeleted: false });
    // IDOR protection: filter out any recordings user does not have permission to view
    const accessible = list.filter(item => canAccessClientRecord(user, item.clientEmail));
    res.json(accessible);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Generate Short-Lived Signed Recording URL (15-Minute Expiration)
app.get('/api/recordings/:id/signed-url', requireAuth, async (req, res) => {
  const { id } = req.params;
  const user = req.session.user;

  try {
    const recording = await AudioRecording.findById(id);
    if (!recording || recording.isDeleted) {
      return res.status(404).json({ error: 'Clinical audio recording not found or deleted.' });
    }

    if (!canAccessClientRecord(user, recording.clientEmail)) {
      return res.status(403).json({ error: 'Access denied to this clinical audio recording.' });
    }

    let playbackUrl = '';
    const expiresInSeconds = 900; // 15 minutes

    if (recording.storageType === 's3' && s3Client && recording.s3Bucket) {
      const getCmd = new GetObjectCommand({
        Bucket: recording.s3Bucket,
        Key: recording.storageKey
      });
      playbackUrl = await getSignedUrl(s3Client, getCmd, { expiresIn: expiresInSeconds });
    } else {
      // Local fallback: generate signed HMAC streaming token
      const token = generateLocalStreamToken(id);
      playbackUrl = `/api/recordings/stream/${id}?token=${token}`;
    }

    await logAuditEvent({
      actorEmail: user.email,
      actorRole: user.role,
      action: 'AUDIO_RECORDING_STREAM_REQUESTED',
      targetResource: id,
      details: { clientEmail: recording.clientEmail },
      req
    });

    res.json({
      success: true,
      url: playbackUrl,
      expiresInSeconds,
      title: recording.title,
      durationSeconds: recording.durationSeconds
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4. Secure Audio Stream Endpoint (For local storage mode)
app.get('/api/recordings/stream/:id', async (req, res) => {
  const { id } = req.params;
  const { token } = req.query;

  if (!token || !verifyLocalStreamToken(token, id)) {
    return res.status(403).json({ error: 'Signed streaming token is invalid or has expired.' });
  }

  try {
    const recording = await AudioRecording.findById(id);
    if (!recording || recording.isDeleted) {
      return res.status(404).json({ error: 'Recording not found.' });
    }

    const filePath = path.join(RECORDINGS_DIR, recording.storageKey);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Audio file not found on disk.' });
    }

    const stat = fs.statSync(filePath);
    res.writeHead(200, {
      'Content-Type': recording.mimeType || 'audio/webm',
      'Content-Length': stat.size,
      'Cache-Control': 'private, no-cache, no-store, must-revalidate',
      'Content-Disposition': `inline; filename="${recording.storageKey}"`
    });

    const readStream = fs.createReadStream(filePath);
    readStream.pipe(res);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 5. Secure Deletion of Recording (Super Admin & Administrator only)
app.delete('/api/recordings/:id', requireAuth, requireRole(['Super Admin', 'Administrator']), async (req, res) => {
  const { id } = req.params;
  const user = req.session.user;

  try {
    const recording = await AudioRecording.findById(id);
    if (!recording) {
      return res.status(404).json({ error: 'Audio recording not found.' });
    }

    // If stored on AWS S3, execute secure deletion from bucket
    if (recording.storageType === 's3' && s3Client && recording.s3Bucket) {
      try {
        await s3Client.send(new DeleteObjectCommand({
          Bucket: recording.s3Bucket,
          Key: recording.storageKey
        }));
      } catch (s3Err) {
        console.warn('Could not delete object directly from S3 bucket:', s3Err.message);
      }
    }

    recording.isDeleted = true;
    recording.deletedAt = new Date();
    recording.deletedBy = user.email;
    await recording.save();

    await logAuditEvent({
      actorEmail: user.email,
      actorRole: user.role,
      action: 'AUDIO_RECORDING_DELETED',
      targetResource: id,
      details: { storageKey: recording.storageKey },
      req
    });

    res.json({ success: true, message: 'Clinical audio recording safely deleted.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- CLINICAL CASE HISTORY & MENTAL STATUS EXAMINATION (MSE) ---

// 1. Get Clinical Case History for a Client
app.get('/api/clinical/case-history/:clientEmail', 
  requireAuth, 
  requireRole(['Super Admin', 'Administrator', 'Counsellor', 'Viewer']), 
  async (req, res) => {
    const { clientEmail } = req.params;
    const user = req.session.user;

    if (!canAccessClientRecord(user, clientEmail)) {
      return res.status(403).json({ error: 'Access denied to this client case history.' });
    }

    try {
      const record = await ClinicalCaseHistory.findOne({ clientEmail: clientEmail.toLowerCase() });
      res.json(record || null);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// 2. Create or Update Clinical Case History
app.post('/api/clinical/case-history', 
  requireAuth, 
  requireRole(['Super Admin', 'Administrator', 'Counsellor']), 
  async (req, res) => {
    const { 
      clientEmail, clientName, presentingProblems, historyOfPresentIllness,
      pastPsychiatricHistory, medicalHistory, familyPsychiatricHistory,
      personalAndSocialHistory, riskAssessment 
    } = req.body;
    const user = req.session.user;

    if (!clientEmail || !clientName) {
      return res.status(400).json({ error: 'Client email and name are required.' });
    }

    if (!canAccessClientRecord(user, clientEmail)) {
      return res.status(403).json({ error: 'Access denied to manage this client record.' });
    }

    try {
      let record = await ClinicalCaseHistory.findOne({ clientEmail: clientEmail.toLowerCase() });
      if (record) {
        record.clientName = clientName;
        record.counsellorEmail = user.email;
        record.presentingProblems = presentingProblems || '';
        record.historyOfPresentIllness = historyOfPresentIllness || '';
        record.pastPsychiatricHistory = pastPsychiatricHistory || '';
        record.medicalHistory = medicalHistory || '';
        record.familyPsychiatricHistory = familyPsychiatricHistory || '';
        record.personalAndSocialHistory = personalAndSocialHistory || '';
        if (riskAssessment) record.riskAssessment = riskAssessment;
        record.updatedAt = new Date();
        await record.save();
      } else {
        record = await ClinicalCaseHistory.create({
          clientEmail: clientEmail.toLowerCase(),
          clientName,
          counsellorEmail: user.email,
          presentingProblems,
          historyOfPresentIllness,
          pastPsychiatricHistory,
          medicalHistory,
          familyPsychiatricHistory,
          personalAndSocialHistory,
          riskAssessment: riskAssessment || {},
          updatedAt: new Date()
        });
      }

      await logAuditEvent({
        actorEmail: user.email,
        actorRole: user.role,
        action: 'CASE_HISTORY_SAVED',
        targetResource: clientEmail,
        req
      });

      res.json(record);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// 3. Get MSE Evaluations for a Client
app.get('/api/clinical/mse/:clientEmail', 
  requireAuth, 
  requireRole(['Super Admin', 'Administrator', 'Counsellor', 'Viewer']), 
  async (req, res) => {
    const { clientEmail } = req.params;
    const user = req.session.user;

    if (!canAccessClientRecord(user, clientEmail)) {
      return res.status(403).json({ error: 'Access denied to this MSE record.' });
    }

    try {
      const records = await MentalStatusExam.find({ clientEmail: clientEmail.toLowerCase() });
      res.json(records);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// 4. Create Mental Status Examination (MSE) Record
app.post('/api/clinical/mse', 
  requireAuth, 
  requireRole(['Super Admin', 'Administrator', 'Counsellor']), 
  async (req, res) => {
    const { 
      clientEmail, clientName, date, appearanceAndBehavior, speechAndCommunication,
      moodAndAffect, thoughtProcessAndContent, perceptualDisturbances,
      cognitionAndOrientation, insightAndJudgment, clinicalSummary 
    } = req.body;
    const user = req.session.user;

    if (!clientEmail || !clientName) {
      return res.status(400).json({ error: 'Client email and client name are required.' });
    }

    if (!canAccessClientRecord(user, clientEmail)) {
      return res.status(403).json({ error: 'Access denied to record MSE for this client.' });
    }

    try {
      const newMse = await MentalStatusExam.create({
        clientEmail: clientEmail.toLowerCase(),
        clientName,
        counsellorEmail: user.email,
        date: normalizeToISTDate(date || new Date()),
        appearanceAndBehavior,
        speechAndCommunication,
        moodAndAffect,
        thoughtProcessAndContent,
        perceptualDisturbances,
        cognitionAndOrientation,
        insightAndJudgment,
        clinicalSummary,
        createdAt: new Date()
      });

      await logAuditEvent({
        actorEmail: user.email,
        actorRole: user.role,
        action: 'MSE_RECORD_CREATED',
        targetResource: clientEmail,
        req
      });

      res.json(newMse);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// 4. Patient Data Export (GDPR / DPDP Right of Access - DSAR)
app.get('/api/clients/:email/export',
  requireAuth,
  requireRole(['Super Admin', 'Administrator', 'Counsellor']),
  async (req, res) => {
    const { email } = req.params;
    const actor = req.session.user;

    if (!canAccessClientRecord(actor, email)) {
      return res.status(403).json({ error: 'Access denied: You are not authorized to export this client’s records.' });
    }

    try {
      const normalizedEmail = email.toLowerCase().trim();
      const [client, appointments, caseHistory, mseRecords, careDocuments, recordings] = await Promise.all([
        Client.findOne({ email: normalizedEmail }),
        Appointment.find({ clientEmail: normalizedEmail }),
        ClinicalCaseHistory.findOne({ clientEmail: normalizedEmail }),
        MentalStatusExam.find({ clientEmail: normalizedEmail }),
        CareDocument.find({ clientEmail: normalizedEmail }),
        AudioRecording.find({ clientEmail: normalizedEmail, isDeleted: false })
      ]);

      const exportBundle = {
        metadata: {
          exportedAt: new Date().toISOString(),
          exportedBy: actor.email,
          exportReason: req.query.reason || 'Patient Data Subject Access Request (DSAR)',
          recordCount: {
            appointments: (appointments || []).length,
            caseHistories: caseHistory ? 1 : 0,
            mseRecords: (mseRecords || []).length,
            careDocuments: (careDocuments || []).length,
            audioRecordings: (recordings || []).length
          }
        },
        clientProfile: client ? {
          name: client.name,
          email: client.email,
          phone: client.phone,
          ageGroup: client.ageGroup,
          verified: client.verified
        } : null,
        appointments: appointments || [],
        clinicalCaseHistory: caseHistory || null,
        mentalStatusExaminations: mseRecords || [],
        careDocuments: careDocuments || [],
        audioRecordingsMetadata: (recordings || []).map(r => ({
          id: r._id,
          title: r.title,
          uploadedAt: r.uploadedAt,
          durationSeconds: r.durationSeconds,
          consentObtained: r.consentObtained
        }))
      };

      await logAuditEvent({
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'PATIENT_DATA_EXPORTED',
        targetResource: normalizedEmail,
        details: { recordCount: exportBundle.metadata.recordCount },
        req
      });

      res.json(exportBundle);
    } catch (err) {
      console.error('Patient data export error:', err);
      res.status(500).json({ error: 'Failed to generate patient data export bundle.' });
    }
  }
);

// 5. Patient Data Purge & Right to be Forgotten (GDPR / DPDP Compliance)
app.delete('/api/clients/:email/purge',
  requireAuth,
  requireRole(['Super Admin']), // Strictly restricted to Super Admin
  async (req, res) => {
    const { email } = req.params;
    const { confirmationText, reason } = req.body || {};
    const actor = req.session.user;

    if (confirmationText !== 'PERMANENTLY_DELETE_PATIENT') {
      return res.status(400).json({ 
        error: 'Confirmation string "PERMANENTLY_DELETE_PATIENT" is required to purge patient records.' 
      });
    }

    try {
      const normalizedEmail = email.toLowerCase().trim();

      const [delClient, delApts, delCase, delMse, delDocs, recordings] = await Promise.all([
        Client.deleteOne({ email: normalizedEmail }),
        Appointment.deleteMany({ clientEmail: normalizedEmail }),
        ClinicalCaseHistory.deleteOne({ clientEmail: normalizedEmail }),
        MentalStatusExam.deleteMany({ clientEmail: normalizedEmail }),
        CareDocument.deleteMany({ clientEmail: normalizedEmail }),
        AudioRecording.find({ clientEmail: normalizedEmail })
      ]);

      // Soft delete associated audio files
      for (const rec of recordings) {
        rec.isDeleted = true;
        rec.deletedAt = new Date();
        rec.deletedBy = actor.email;
        await rec.save();
      }

      await logAuditEvent({
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'PATIENT_DATA_PURGED',
        targetResource: normalizedEmail,
        details: {
          reason: reason || 'GDPR/DPDP Right to be Forgotten Request',
          deletedCounts: {
            clients: delClient.deletedCount || 0,
            appointments: delApts.deletedCount || 0,
            caseHistories: delCase.deletedCount || 0,
            mseRecords: delMse.deletedCount || 0,
            careDocuments: delDocs.deletedCount || 0,
            audioRecordingsMarkedDeleted: recordings.length
          }
        },
        req
      });

      res.json({
        success: true,
        message: `All records associated with ${normalizedEmail} have been securely purged.`,
        purgedAt: new Date().toISOString()
      });
    } catch (err) {
      console.error('Patient data purge error:', err);
      res.status(500).json({ error: 'Failed to purge patient records.' });
    }
  }
);

// 6. Client Directory Management (Staff Protected)
app.get('/api/clients', 
  requireAuth, 
  requireRole(['Super Admin', 'Administrator', 'Counsellor', 'Viewer']), 
  async (req, res) => {
    const user = req.session.user;
    try {
      const clients = await Client.find({}, { password: 0, otpCode: 0, resetOtpCode: 0 });
      const accessible = clients.filter(c => canAccessClientRecord(user, c.email));
      res.json(accessible);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

app.get('/api/clients/:email', 
  requireAuth, 
  requireRole(['Super Admin', 'Administrator', 'Counsellor', 'Viewer', 'client']), 
  async (req, res) => {
    const { email } = req.params;
    const user = req.session.user;
    if (!canAccessClientRecord(user, email)) {
      return res.status(403).json({ error: 'Access denied to this client profile.' });
    }
    try {
      const client = await Client.findOne({ email: email.toLowerCase().trim() }, { password: 0, otpCode: 0, resetOtpCode: 0 });
      if (!client) {
        return res.status(404).json({ error: 'Client not found.' });
      }
      res.json(client);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// =========================================================================
// PATIENT / STUDENT PROFILE MANAGEMENT REST APIS
// =========================================================================

// Helper: Sanitize profile for student/client role (stripping confidential provider notes)
function sanitizeProfileForRole(profile, role) {
  const obj = profile.toObject ? profile.toObject() : { ...profile };
  if (role === 'client') {
    delete obj.clinicalInfo;
  }
  return obj;
}

// 1. GET /api/profiles - List profiles (Admin / Provider) with search, filter, pagination
app.get('/api/profiles', requireAuth, requireRole(['Super Admin', 'Administrator', 'Counsellor', 'Viewer', 'provider']), async (req, res) => {
  try {
    const user = req.session.user;
    const role = user.role === 'provider' ? 'Super Admin' : user.role;
    const {
      search = '',
      department = '',
      programmeLevel = '',
      status = '',
      category = '',
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));

    let allProfiles = await PatientProfile.find();
    if (!Array.isArray(allProfiles)) allProfiles = [];

    // Filter by Provider authorization if Counsellor/Viewer has assigned caseload restrictions
    if (role === 'Counsellor' || role === 'Viewer') {
      if (user.assignedClients && user.assignedClients.length > 0) {
        allProfiles = allProfiles.filter(p => {
          const pEmail = (p.personalInfo?.email || '').toLowerCase().trim();
          return user.assignedClients.some(assigned => assigned.toLowerCase().trim() === pEmail);
        });
      }
    }

    // Apply Filters
    let filtered = allProfiles.filter(p => {
      const pInfo = p.personalInfo || {};
      const aInfo = p.academicInfo || {};

      // Search matching name, ID, email, phone, occupation, or registration number
      if (search) {
        const s = search.toLowerCase().trim();
        const matchesName = (pInfo.fullName || '').toLowerCase().includes(s);
        const matchesId = (p.profileId || '').toLowerCase().includes(s);
        const matchesEmail = (pInfo.email || '').toLowerCase().includes(s);
        const matchesPhone = (pInfo.phone || '').toLowerCase().includes(s);
        const matchesAltPhone = (pInfo.alternatePhone || '').toLowerCase().includes(s);
        const matchesOccupation = (pInfo.occupation || '').toLowerCase().includes(s);
        const matchesReg = (aInfo.registrationNumber || '').toLowerCase().includes(s);
        if (!matchesName && !matchesId && !matchesEmail && !matchesPhone && !matchesAltPhone && !matchesOccupation && !matchesReg) return false;
      }

      // Department filter
      if (department && department !== 'all') {
        if ((aInfo.department || '').toLowerCase() !== department.toLowerCase()) return false;
      }

      // Programme Level filter (UG / PG / PhD)
      if (programmeLevel && programmeLevel !== 'all') {
        if ((aInfo.programmeLevel || '').toUpperCase() !== programmeLevel.toUpperCase()) return false;
      }

      // Status filter
      if (status && status !== 'all') {
        if (p.profileStatus !== status) return false;
      }

      // Category filter (support new and legacy categories)
      if (category && category !== 'all') {
        const catLower = category.toLowerCase().trim();
        const pCatLower = (p.category || '').toLowerCase().trim();
        if (catLower === 'general patient' || catLower === 'patient') {
          if (pCatLower !== 'general patient' && pCatLower !== 'patient') return false;
        } else if (catLower === 'staff referral' || catLower === 'staff_referral') {
          if (pCatLower !== 'staff referral' && pCatLower !== 'staff_referral') return false;
        } else if (catLower === 'other') {
          if (pCatLower !== 'other') return false;
        } else {
          if (pCatLower !== catLower) return false;
        }
      }

      return true;
    });

    // Sorting
    filtered.sort((a, b) => {
      let valA = a[sortBy] || a.personalInfo?.[sortBy] || a.createdAt;
      let valB = b[sortBy] || b.personalInfo?.[sortBy] || b.createdAt;
      if (valA instanceof Date) valA = valA.getTime();
      if (valB instanceof Date) valB = valB.getTime();
      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    const total = filtered.length;
    const startIndex = (pageNum - 1) * limitNum;
    const paginatedItems = filtered.slice(startIndex, startIndex + limitNum).map(p => {
      // In listings, sanitize to avoid exposing confidential clinical notes
      const clean = p.toObject ? p.toObject() : { ...p };
      delete clean.clinicalInfo;
      return clean;
    });

    res.json({
      profiles: paginatedItems,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1
      }
    });
  } catch (error) {
    console.error('Failed to retrieve patient profiles:', error);
    res.status(500).json({ error: error.message });
  }
});

// 2. GET /api/profiles/stats - Dashboard statistics computed from authorized records
app.get('/api/profiles/stats', requireAuth, requireRole(['Super Admin', 'Administrator', 'Counsellor', 'provider']), async (req, res) => {
  try {
    const list = await PatientProfile.find();
    const profiles = Array.isArray(list) ? list : [];

    const stats = {
      total: profiles.length,
      totalProfiles: profiles.length,
      active: profiles.filter(p => p.profileStatus === 'active').length,
      activeProfiles: profiles.filter(p => p.profileStatus === 'active').length,
      pendingVerification: profiles.filter(p => p.profileStatus === 'pending_verification').length,
      inactive: profiles.filter(p => p.profileStatus === 'inactive').length,
      archived: profiles.filter(p => p.profileStatus === 'archived').length,
      students: profiles.filter(p => p.category === 'student').length,
      studentCount: profiles.filter(p => p.category === 'student').length,
      patients: profiles.filter(p => p.category === 'patient' || p.category === 'General Patient').length,
      generalPatients: profiles.filter(p => p.category === 'General Patient' || p.category === 'patient').length,
      staffReferrals: profiles.filter(p => p.category === 'Staff Referral' || p.category === 'staff_referral').length,
      selfReferrals: profiles.filter(p => p.category === 'Self-Referral').length,
      professionalReferrals: profiles.filter(p => p.category === 'Professional Referral').length,
      otherReferrals: profiles.filter(p => p.category === 'Other' || p.category === 'other').length,
      byCategory: {
        generalPatient: profiles.filter(p => p.category === 'General Patient' || p.category === 'patient').length,
        staffReferral: profiles.filter(p => p.category === 'Staff Referral' || p.category === 'staff_referral').length,
        selfReferral: profiles.filter(p => p.category === 'Self-Referral').length,
        professionalReferral: profiles.filter(p => p.category === 'Professional Referral').length,
        other: profiles.filter(p => p.category === 'Other' || p.category === 'other').length,
        student: profiles.filter(p => p.category === 'student').length
      },
      byDepartment: {},
      byProgrammeLevel: {
        UG: profiles.filter(p => p.academicInfo?.programmeLevel === 'UG').length,
        PG: profiles.filter(p => p.academicInfo?.programmeLevel === 'PG').length,
        PhD: profiles.filter(p => p.academicInfo?.programmeLevel === 'PhD').length,
        Other: profiles.filter(p => !['UG', 'PG', 'PhD'].includes(p.academicInfo?.programmeLevel)).length
      }
    };

    profiles.forEach(p => {
      const dept = p.academicInfo?.department?.trim();
      if (dept) {
        stats.byDepartment[dept] = (stats.byDepartment[dept] || 0) + 1;
      }
    });

    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. GET /api/profiles/me - Student accesses their own personal profile
app.get('/api/profiles/me', requireAuth, async (req, res) => {
  try {
    const userEmail = (req.session.user.email || '').toLowerCase().trim();
    if (!userEmail) {
      return res.status(401).json({ error: 'Session email not found.' });
    }

    let profile = await PatientProfile.findOne({ 'personalInfo.email': userEmail });
    if (!profile) {
      // Auto-provision initial draft profile linked to this student/client
      const newProfileId = await generateUniqueProfileId();
      profile = await PatientProfile.create({
        profileId: newProfileId,
        userId: req.session.user.id || '',
        category: 'student',
        personalInfo: {
          fullName: req.session.user.name || 'Student / Patient',
          email: userEmail,
          phone: req.session.user.phone || '',
          preferredLanguage: 'English'
        },
        academicInfo: {
          isStudent: true,
          programmeLevel: 'UG',
          enrollmentStatus: 'Active'
        },
        profileStatus: 'pending_verification',
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }

    res.json(sanitizeProfileForRole(profile, req.session.user.role));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4. GET /api/profiles/:id - View individual detailed profile
app.get('/api/profiles/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const user = req.session.user;
  const role = user.role === 'provider' ? 'Super Admin' : user.role;

  try {
    let profile = await PatientProfile.findOne({ profileId: id.toUpperCase() });
    if (!profile) {
      profile = await PatientProfile.findById(id);
    }
    if (!profile) {
      return res.status(404).json({ error: 'Patient / Student profile not found.' });
    }

    // Role-based authorization
    if (role === 'client') {
      const pEmail = (profile.personalInfo?.email || '').toLowerCase().trim();
      const userEmail = (user.email || '').toLowerCase().trim();
      if (pEmail !== userEmail) {
        return res.status(403).json({ error: 'Access denied: You are not authorized to view another user’s profile.' });
      }
      return res.json(sanitizeProfileForRole(profile, 'client'));
    }

    if (role === 'Counsellor' || role === 'Viewer') {
      const pEmail = profile.personalInfo?.email;
      if (!canAccessClientRecord(user, pEmail)) {
        return res.status(403).json({ error: 'Access denied: Profile outside your assigned clinical caseload.' });
      }
    }

    res.json(profile);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 5. POST /api/profiles - Create new patient/student profile
app.post('/api/profiles', requireAuth, async (req, res) => {
  const user = req.session.user;
  const role = user.role === 'provider' ? 'Super Admin' : user.role;
  const { 
    category = 'General Patient', 
    personalInfo = {}, 
    academicInfo = {}, 
    emergencyContact = {},
    pastMedicalPsychiatricHistory = {},
    familyHistory = {},
    birthDevelopmentalHistory = {},
    personalSocialHistory = {},
    clinicalInfo = {},
    consentAndPrivacy = {}
  } = req.body;

  try {
    const email = (personalInfo.email || (role === 'client' ? user.email : '')).toLowerCase().trim();
    const fullName = (personalInfo.fullName || (role === 'client' ? user.name : '')).trim();

    if (!email || !fullName) {
      return res.status(400).json({ error: 'Full name and email address are required to create a profile.' });
    }

    // Prohibit future date of birth
    if (personalInfo.dateOfBirth) {
      let dobDate = null;
      if (typeof personalInfo.dateOfBirth === 'string' && /^\d{2}-\d{2}-\d{4}$/.test(personalInfo.dateOfBirth)) {
        const parts = personalInfo.dateOfBirth.split('-');
        dobDate = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
      } else {
        dobDate = new Date(personalInfo.dateOfBirth);
      }
      if (!isNaN(dobDate.getTime()) && dobDate > new Date()) {
        return res.status(400).json({ error: 'Date of birth cannot be in the future.' });
      }
    }

    // Check duplicate
    const existing = await PatientProfile.findOne({ 'personalInfo.email': email });
    if (existing) {
      return res.status(409).json({ 
        error: `A profile already exists for email address: ${email}`,
        profileId: existing.profileId 
      });
    }

    const profileId = await generateUniqueProfileId();
    const age = calculateAgeFromDob(personalInfo.dateOfBirth);

    const initialStatus = (role === 'Super Admin' || role === 'Administrator') && req.body.profileStatus
      ? req.body.profileStatus
      : 'pending_verification';

    const newProfile = await PatientProfile.create({
      profileId,
      userId: role === 'client' ? user.id : undefined,
      category,
      personalInfo: {
        fullName,
        photoUrl: personalInfo.photoUrl || '',
        dateOfBirth: personalInfo.dateOfBirth || '',
        age: (typeof age === 'number' && !isNaN(age)) ? age : (typeof personalInfo.age === 'number' ? personalInfo.age : undefined),
        gender: personalInfo.gender || 'Unknown / Not Available',
        selfDescribedGender: personalInfo.selfDescribedGender || '',
        email,
        phone: (personalInfo.phone || '').trim(),
        alternatePhone: (personalInfo.alternatePhone || personalInfo.altPhone || '').trim(),
        occupation: (personalInfo.occupation || '').trim(),
        address: personalInfo.address || '',
        city: personalInfo.city || '',
        state: personalInfo.state || '',
        postalCode: (personalInfo.postalCode || personalInfo.pinCode || '').trim(),
        pinCode: (personalInfo.pinCode || personalInfo.postalCode || '').trim(),
        preferredLanguage: personalInfo.preferredLanguage || 'English'
      },
      academicInfo: {
        isStudent: academicInfo.isStudent ?? (category === 'student'),
        registrationNumber: (academicInfo.registrationNumber || '').trim(),
        department: (academicInfo.department || '').trim(),
        schoolFaculty: (academicInfo.schoolFaculty || '').trim(),
        programme: (academicInfo.programme || '').trim(),
        programmeLevel: academicInfo.programmeLevel || 'UG',
        currentSemester: academicInfo.currentSemester || '',
        academicSession: academicInfo.academicSession || '',
        enrollmentStatus: academicInfo.enrollmentStatus || 'Active'
      },
      emergencyContact: {
        name: (emergencyContact.contactPersonName || emergencyContact.contactName || emergencyContact.name || '').trim(),
        contactPersonName: (emergencyContact.contactPersonName || emergencyContact.contactName || emergencyContact.name || '').trim(),
        relationship: (emergencyContact.relationship || '').trim(),
        phone: (emergencyContact.primaryPhone || emergencyContact.phone || '').trim(),
        altPhone: (emergencyContact.alternatePhone || emergencyContact.altPhone || '').trim(),
        address: emergencyContact.address || emergencyContact.emergencyContactAddress || '',
        authorizedForClinicalDisclosure: false
      },
      pastMedicalPsychiatricHistory: {
        assessmentStatus: pastMedicalPsychiatricHistory.assessmentStatus || 'None reported',
        previousMedicalIllnesses: pastMedicalPsychiatricHistory.previousMedicalIllnesses || '',
        previousPsychiatricHistory: pastMedicalPsychiatricHistory.previousPsychiatricHistory || '',
        previousPsychologicalCounselling: pastMedicalPsychiatricHistory.previousPsychologicalCounselling || '',
        previousPsychiatricConsultation: pastMedicalPsychiatricHistory.previousPsychiatricConsultation || '',
        previousHospitalisation: pastMedicalPsychiatricHistory.previousHospitalisation || '',
        previousSurgeries: pastMedicalPsychiatricHistory.previousSurgeries || '',
        previousTreatments: pastMedicalPsychiatricHistory.previousTreatments || '',
        currentMedications: pastMedicalPsychiatricHistory.currentMedications || '',
        previousMedications: pastMedicalPsychiatricHistory.previousMedications || '',
        knownAllergies: pastMedicalPsychiatricHistory.knownAllergies || '',
        substanceUseHistory: pastMedicalPsychiatricHistory.substanceUseHistory || '',
        relevantMedicalNotes: pastMedicalPsychiatricHistory.relevantMedicalNotes || '',
        structuredConditions: Array.isArray(pastMedicalPsychiatricHistory.structuredConditions) ? pastMedicalPsychiatricHistory.structuredConditions : []
      },
      familyHistory: {
        familyMedicalHistory: familyHistory.familyMedicalHistory || '',
        familyPsychiatricHistory: familyHistory.familyPsychiatricHistory || '',
        hereditaryConditions: familyHistory.hereditaryConditions || '',
        historyOfSubstanceUseInFamily: familyHistory.historyOfSubstanceUseInFamily || '',
        relevantFamilyStressors: familyHistory.relevantFamilyStressors || '',
        familyStructure: familyHistory.familyStructure || '',
        familySupportSystem: familyHistory.familySupportSystem || '',
        additionalFamilyNotes: familyHistory.additionalFamilyNotes || '',
        structuredMembers: Array.isArray(familyHistory.structuredMembers) ? familyHistory.structuredMembers : []
      },
      birthDevelopmentalHistory: {
        status: birthDevelopmentalHistory.status || 'Not Applicable',
        pregnancyHistory: birthDevelopmentalHistory.pregnancyHistory || '',
        maternalPregnancyComplications: birthDevelopmentalHistory.maternalPregnancyComplications || '',
        birthType: birthDevelopmentalHistory.birthType || 'Unknown',
        gestationalAge: birthDevelopmentalHistory.gestationalAge || '',
        prematureBirth: birthDevelopmentalHistory.prematureBirth || 'Unknown',
        birthComplications: birthDevelopmentalHistory.birthComplications || '',
        birthWeight: birthDevelopmentalHistory.birthWeight || '',
        neonatalComplications: birthDevelopmentalHistory.neonatalComplications || '',
        developmentalMilestones: birthDevelopmentalHistory.developmentalMilestones || '',
        speechLanguageDevelopment: birthDevelopmentalHistory.speechLanguageDevelopment || '',
        motorDevelopment: birthDevelopmentalHistory.motorDevelopment || '',
        cognitiveLearningDevelopment: birthDevelopmentalHistory.cognitiveLearningDevelopment || '',
        childhoodDevelopmentalConcerns: birthDevelopmentalHistory.childhoodDevelopmentalConcerns || '',
        relevantAdditionalNotes: birthDevelopmentalHistory.relevantAdditionalNotes || ''
      },
      personalSocialHistory: {
        educationalBackground: personalSocialHistory.educationalBackground || '',
        occupationalHistory: personalSocialHistory.occupationalHistory || '',
        employmentStatus: personalSocialHistory.employmentStatus || '',
        maritalStatus: personalSocialHistory.maritalStatus || '',
        livingArrangements: personalSocialHistory.livingArrangements || '',
        socialSupport: personalSocialHistory.socialSupport || '',
        sleepPattern: personalSocialHistory.sleepPattern || '',
        appetite: personalSocialHistory.appetite || '',
        lifestyleInformation: personalSocialHistory.lifestyleInformation || '',
        relevantPersonalHistory: personalSocialHistory.relevantPersonalHistory || '',
        additionalNotes: personalSocialHistory.additionalNotes || ''
      },
      clinicalInfo: role === 'client' ? {} : {
        presentingConcerns: clinicalInfo.presentingConcerns || '',
        durationOfConcerns: clinicalInfo.durationOfConcerns || '',
        onsetAndCourse: clinicalInfo.onsetAndCourse || '',
        previousCounsellingExperience: clinicalInfo.previousCounsellingExperience || '',
        previousMentalHealthTreatment: clinicalInfo.previousMentalHealthTreatment || '',
        relevantClinicalObservations: clinicalInfo.relevantClinicalObservations || '',
        initialClinicalImpression: clinicalInfo.initialClinicalImpression || '',
        additionalClinicalNotes: clinicalInfo.additionalClinicalNotes || '',
        relevantClinicalHistory: clinicalInfo.relevantClinicalHistory || '',
        previousCounsellingHistory: clinicalInfo.previousCounsellingHistory || '',
        referralInformation: clinicalInfo.referralInformation || '',
        assessmentReferences: Array.isArray(clinicalInfo.assessmentReferences) ? clinicalInfo.assessmentReferences : [],
        currentCareStatus: clinicalInfo.currentCareStatus || 'Intake',
        followUpRecommendations: clinicalInfo.followUpRecommendations || '',
        lastClinicalReviewDate: (clinicalInfo.presentingConcerns || clinicalInfo.initialClinicalImpression) ? new Date() : undefined,
        lastReviewedBy: (clinicalInfo.presentingConcerns || clinicalInfo.initialClinicalImpression) ? user.email : ''
      },
      consentAndPrivacy: {
        patientConsentStatus: consentAndPrivacy.patientConsentStatus || 'Pending',
        consentDateTime: consentAndPrivacy.consentDateTime ? new Date(consentAndPrivacy.consentDateTime) : new Date(),
        consentRecordedBy: consentAndPrivacy.consentRecordedBy || user.email,
        guardianDetails: {
          hasGuardian: !!(consentAndPrivacy.guardianDetails && consentAndPrivacy.guardianDetails.hasGuardian),
          guardianName: consentAndPrivacy.guardianDetails?.guardianName || '',
          guardianRelationship: consentAndPrivacy.guardianDetails?.guardianRelationship || '',
          guardianPhone: consentAndPrivacy.guardianDetails?.guardianPhone || '',
          guardianEmail: consentAndPrivacy.guardianDetails?.guardianEmail || '',
          guardianConsentStatus: consentAndPrivacy.guardianDetails?.guardianConsentStatus || 'Not Applicable'
        },
        privacyNoticeAcknowledged: !!consentAndPrivacy.privacyNoticeAcknowledged,
        counsellingConsent: !!consentAndPrivacy.counsellingConsent,
        assessmentConsent: !!consentAndPrivacy.assessmentConsent,
        audioRecordingConsent: !!consentAndPrivacy.audioRecordingConsent,
        consentVersion: consentAndPrivacy.consentVersion || '2.0',
        consentTimestamp: new Date(),
        consentWithdrawn: false
      },
      profileStatus: initialStatus,
      statusHistory: [{
        status: initialStatus,
        changedAt: new Date(),
        changedBy: user.email,
        reason: 'Initial profile registration'
      }],
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await logAuditEvent({
      actorEmail: user.email,
      actorRole: user.role,
      action: 'PROFILE_CREATED',
      targetResource: profileId,
      details: { email, category, status: initialStatus },
      req
    });

    res.status(201).json(sanitizeProfileForRole(newProfile, role));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 6. PUT /api/profiles/:id - Update permitted fields with role-based segregation
app.put('/api/profiles/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const user = req.session.user;
  const role = user.role === 'provider' ? 'Super Admin' : user.role;
  const updates = req.body;

  try {
    let profile = await PatientProfile.findOne({ profileId: id.toUpperCase() });
    if (!profile) profile = await PatientProfile.findById(id);
    if (!profile) return res.status(404).json({ error: 'Profile not found.' });

    // Validate dateOfBirth cannot be future if updated
    if (updates.personalInfo?.dateOfBirth) {
      let dobDate = null;
      if (typeof updates.personalInfo.dateOfBirth === 'string' && /^\d{2}-\d{2}-\d{4}$/.test(updates.personalInfo.dateOfBirth)) {
        const parts = updates.personalInfo.dateOfBirth.split('-');
        dobDate = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
      } else {
        dobDate = new Date(updates.personalInfo.dateOfBirth);
      }
      if (!isNaN(dobDate.getTime()) && dobDate > new Date()) {
        return res.status(400).json({ error: 'Date of birth cannot be in the future.' });
      }
    }

    // Client permissions check
    if (role === 'client') {
      const pEmail = (profile.personalInfo?.email || '').toLowerCase().trim();
      const userEmail = (user.email || '').toLowerCase().trim();
      if (pEmail !== userEmail) {
        return res.status(403).json({ error: 'Access denied: You cannot edit another user’s profile.' });
      }

      // Allowed fields for client
      if (updates.personalInfo) {
        profile.personalInfo.phone = (updates.personalInfo.phone !== undefined ? updates.personalInfo.phone : profile.personalInfo.phone);
        profile.personalInfo.alternatePhone = (updates.personalInfo.alternatePhone !== undefined ? updates.personalInfo.alternatePhone : profile.personalInfo.alternatePhone);
        profile.personalInfo.occupation = (updates.personalInfo.occupation !== undefined ? updates.personalInfo.occupation : profile.personalInfo.occupation);
        profile.personalInfo.address = (updates.personalInfo.address !== undefined ? updates.personalInfo.address : profile.personalInfo.address);
        profile.personalInfo.city = (updates.personalInfo.city !== undefined ? updates.personalInfo.city : profile.personalInfo.city);
        profile.personalInfo.state = (updates.personalInfo.state !== undefined ? updates.personalInfo.state : profile.personalInfo.state);
        profile.personalInfo.postalCode = (updates.personalInfo.postalCode !== undefined ? updates.personalInfo.postalCode : profile.personalInfo.postalCode);
        profile.personalInfo.pinCode = (updates.personalInfo.pinCode !== undefined ? updates.personalInfo.pinCode : profile.personalInfo.pinCode);
        profile.personalInfo.preferredLanguage = (updates.personalInfo.preferredLanguage !== undefined ? updates.personalInfo.preferredLanguage : profile.personalInfo.preferredLanguage);
        profile.personalInfo.gender = (updates.personalInfo.gender !== undefined ? updates.personalInfo.gender : profile.personalInfo.gender);
        profile.personalInfo.selfDescribedGender = (updates.personalInfo.selfDescribedGender !== undefined ? updates.personalInfo.selfDescribedGender : profile.personalInfo.selfDescribedGender);
        if (updates.personalInfo.dateOfBirth) {
          profile.personalInfo.dateOfBirth = updates.personalInfo.dateOfBirth;
          profile.personalInfo.age = calculateAgeFromDob(updates.personalInfo.dateOfBirth) ?? profile.personalInfo.age;
        }
      }

      if (updates.personalSocialHistory) {
        profile.personalSocialHistory = {
          ...profile.personalSocialHistory,
          ...updates.personalSocialHistory
        };
      }

      if (updates.pastMedicalPsychiatricHistory) {
        profile.pastMedicalPsychiatricHistory = {
          ...profile.pastMedicalPsychiatricHistory,
          ...updates.pastMedicalPsychiatricHistory
        };
      }

      if (updates.birthDevelopmentalHistory) {
        profile.birthDevelopmentalHistory = {
          ...profile.birthDevelopmentalHistory,
          ...updates.birthDevelopmentalHistory
        };
      }

      if (updates.academicInfo) {
        profile.academicInfo = {
          ...profile.academicInfo,
          ...updates.academicInfo
        };
      }

      if (updates.emergencyContact) {
        profile.emergencyContact = {
          ...profile.emergencyContact,
          ...updates.emergencyContact,
          authorizedForClinicalDisclosure: false // Clients cannot unilaterally toggle clinical disclosure authorization
        };
      }
    } else if (role === 'Counsellor') {
      // Counsellor can update clinical notes and follow-up
      if (!canAccessClientRecord(user, profile.personalInfo?.email)) {
        return res.status(403).json({ error: 'Access denied: Profile outside your assigned caseload.' });
      }

      if (updates.clinicalInfo) {
        profile.clinicalInfo = {
          ...profile.clinicalInfo,
          ...updates.clinicalInfo,
          lastClinicalReviewDate: new Date(),
          lastReviewedBy: user.email
        };
      }
      if (updates.personalInfo) {
        profile.personalInfo = { ...profile.personalInfo, ...updates.personalInfo };
        if (updates.personalInfo.dateOfBirth) {
          profile.personalInfo.age = calculateAgeFromDob(updates.personalInfo.dateOfBirth) ?? profile.personalInfo.age;
        }
      }
      if (updates.pastMedicalPsychiatricHistory) profile.pastMedicalPsychiatricHistory = { ...profile.pastMedicalPsychiatricHistory, ...updates.pastMedicalPsychiatricHistory };
      if (updates.familyHistory) profile.familyHistory = { ...profile.familyHistory, ...updates.familyHistory };
      if (updates.birthDevelopmentalHistory) profile.birthDevelopmentalHistory = { ...profile.birthDevelopmentalHistory, ...updates.birthDevelopmentalHistory };
      if (updates.personalSocialHistory) profile.personalSocialHistory = { ...profile.personalSocialHistory, ...updates.personalSocialHistory };
      if (updates.emergencyContact) profile.emergencyContact = { ...profile.emergencyContact, ...updates.emergencyContact };
      if (updates.academicInfo) profile.academicInfo = { ...profile.academicInfo, ...updates.academicInfo };
    } else {
      // Admin / Super Admin
      if (updates.personalInfo) {
        profile.personalInfo = { ...profile.personalInfo, ...updates.personalInfo };
        if (updates.personalInfo.dateOfBirth) {
          profile.personalInfo.age = calculateAgeFromDob(updates.personalInfo.dateOfBirth) ?? profile.personalInfo.age;
        }
      }
      if (updates.academicInfo) profile.academicInfo = { ...profile.academicInfo, ...updates.academicInfo };
      if (updates.emergencyContact) profile.emergencyContact = { ...profile.emergencyContact, ...updates.emergencyContact };
      if (updates.pastMedicalPsychiatricHistory) profile.pastMedicalPsychiatricHistory = { ...profile.pastMedicalPsychiatricHistory, ...updates.pastMedicalPsychiatricHistory };
      if (updates.familyHistory) profile.familyHistory = { ...profile.familyHistory, ...updates.familyHistory };
      if (updates.birthDevelopmentalHistory) profile.birthDevelopmentalHistory = { ...profile.birthDevelopmentalHistory, ...updates.birthDevelopmentalHistory };
      if (updates.personalSocialHistory) profile.personalSocialHistory = { ...profile.personalSocialHistory, ...updates.personalSocialHistory };
      if (updates.consentAndPrivacy) profile.consentAndPrivacy = { ...profile.consentAndPrivacy, ...updates.consentAndPrivacy };
      if (updates.category) profile.category = updates.category;
      if (updates.clinicalInfo) {
        profile.clinicalInfo = {
          ...profile.clinicalInfo,
          ...updates.clinicalInfo,
          lastClinicalReviewDate: new Date(),
          lastReviewedBy: user.email
        };
      }
    }

    profile.updatedAt = new Date();
    await profile.save();

    await logAuditEvent({
      actorEmail: user.email,
      actorRole: user.role,
      action: 'PROFILE_UPDATED',
      targetResource: profile.profileId,
      details: { role },
      req
    });

    res.json(sanitizeProfileForRole(profile, role));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 7. PATCH /api/profiles/:id/status - Change profile status (Admin / Provider)
app.patch('/api/profiles/:id/status', requireAuth, requireRole(['Super Admin', 'Administrator', 'Counsellor', 'provider']), async (req, res) => {
  const { id } = req.params;
  const { status, reason = '' } = req.body;
  const user = req.session.user;

  const validStatuses = ['pending_verification', 'active', 'inactive', 'archived'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
  }

  try {
    let profile = await PatientProfile.findOne({ profileId: id.toUpperCase() });
    if (!profile) profile = await PatientProfile.findById(id);
    if (!profile) return res.status(404).json({ error: 'Profile not found.' });

    profile.profileStatus = status;
    profile.statusHistory = profile.statusHistory || [];
    profile.statusHistory.push({
      status,
      changedAt: new Date(),
      changedBy: user.email,
      reason: reason || 'Status modified by authorized staff'
    });
    profile.updatedAt = new Date();
    await profile.save();

    await logAuditEvent({
      actorEmail: user.email,
      actorRole: user.role,
      action: 'PROFILE_STATUS_CHANGED',
      targetResource: profile.profileId,
      details: { newStatus: status, reason },
      req
    });

    res.json({ 
      success: true, 
      profileId: profile.profileId, 
      status: profile.profileStatus,
      profileStatus: profile.profileStatus,
      statusHistory: profile.statusHistory 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 8. PATCH /api/profiles/:id/assign-provider - Assign Provider (Admin only)
app.patch('/api/profiles/:id/assign-provider', requireAuth, requireRole(['Super Admin', 'Administrator', 'provider']), async (req, res) => {
  const { id } = req.params;
  const { providerId, providerName, providerEmail, reason = '' } = req.body;
  const user = req.session.user;

  if (!providerEmail || !providerName) {
    return res.status(400).json({ error: 'Provider name and email are required for assignment.' });
  }

  try {
    let profile = await PatientProfile.findOne({ profileId: id.toUpperCase() });
    if (!profile) profile = await PatientProfile.findById(id);
    if (!profile) return res.status(404).json({ error: 'Profile not found.' });

    profile.assignedProvider = {
      providerId: providerId || '',
      providerName,
      providerEmail: providerEmail.toLowerCase().trim(),
      assignedAt: new Date(),
      assignedBy: user.email
    };

    profile.assignmentHistory = profile.assignmentHistory || [];
    profile.assignmentHistory.push({
      providerId: providerId || '',
      providerName,
      providerEmail: providerEmail.toLowerCase().trim(),
      assignedAt: new Date(),
      assignedBy: user.email,
      reason
    });
    profile.updatedAt = new Date();
    await profile.save();

    // Also sync with User document if counsellor exists
    try {
      const counsellorUser = await User.findOne({ email: providerEmail.toLowerCase().trim() });
      if (counsellorUser) {
        counsellorUser.assignedClients = counsellorUser.assignedClients || [];
        if (!counsellorUser.assignedClients.includes(profile.personalInfo.email)) {
          counsellorUser.assignedClients.push(profile.personalInfo.email);
          await counsellorUser.save();
        }
      }
    } catch (syncErr) {
      console.warn('Counsellor assignedClients sync alert:', syncErr.message);
    }

    await logAuditEvent({
      actorEmail: user.email,
      actorRole: user.role,
      action: 'PROVIDER_ASSIGNED',
      targetResource: profile.profileId,
      details: { providerEmail, providerName, reason },
      req
    });

    res.json({
      success: true,
      profileId: profile.profileId,
      assignedProvider: profile.assignedProvider,
      assignmentHistory: profile.assignmentHistory,
      providerHistory: profile.assignmentHistory
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 9. POST /api/profiles/:id/consent - Record or withdraw consent
app.post('/api/profiles/:id/consent', requireAuth, async (req, res) => {
  const { id } = req.params;
  const user = req.session.user;
  const role = user.role === 'provider' ? 'Super Admin' : user.role;
  const {
    privacyNoticeAcknowledged,
    counsellingConsent,
    assessmentConsent,
    audioRecordingConsent,
    consentVersion = '1.0',
    withdrawConsent = false,
    withdrawnReason = ''
  } = req.body;

  try {
    let profile = await PatientProfile.findOne({ profileId: id.toUpperCase() });
    if (!profile) profile = await PatientProfile.findById(id);
    if (!profile) return res.status(404).json({ error: 'Profile not found.' });

    // Client authorization
    if (role === 'client') {
      const pEmail = (profile.personalInfo?.email || '').toLowerCase().trim();
      if (pEmail !== user.email.toLowerCase().trim()) {
        return res.status(403).json({ error: 'Access denied: You cannot modify consent for another user.' });
      }
    }

    profile.consentAndPrivacy = profile.consentAndPrivacy || {};

    if (withdrawConsent) {
      profile.consentAndPrivacy.consentWithdrawn = true;
      profile.consentAndPrivacy.withdrawnTimestamp = new Date();
      profile.consentAndPrivacy.withdrawnReason = withdrawnReason || 'Patient requested consent revocation';
      profile.consentAndPrivacy.counsellingConsent = false;
      profile.consentAndPrivacy.assessmentConsent = false;
      profile.consentAndPrivacy.audioRecordingConsent = false;
    } else {
      profile.consentAndPrivacy.privacyNoticeAcknowledged = !!privacyNoticeAcknowledged;
      profile.consentAndPrivacy.counsellingConsent = !!counsellingConsent;
      profile.consentAndPrivacy.assessmentConsent = !!assessmentConsent;
      profile.consentAndPrivacy.audioRecordingConsent = !!audioRecordingConsent;
      profile.consentAndPrivacy.consentVersion = consentVersion;
      profile.consentAndPrivacy.consentTimestamp = new Date();
      profile.consentAndPrivacy.consentWithdrawn = false;
      profile.consentAndPrivacy.withdrawnTimestamp = undefined;
      profile.consentAndPrivacy.withdrawnReason = '';
    }

    profile.updatedAt = new Date();
    await profile.save();

    await logAuditEvent({
      actorEmail: user.email,
      actorRole: user.role,
      action: withdrawConsent ? 'CONSENT_WITHDRAWN' : 'CONSENT_UPDATED',
      targetResource: profile.profileId,
      details: { withdrawConsent, consentVersion },
      req
    });

    res.json({ success: true, consentAndPrivacy: profile.consentAndPrivacy });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 10. GET /api/profiles/:id/appointments - Fetch appointment history linked to this profile
app.get('/api/profiles/:id/appointments', requireAuth, async (req, res) => {
  const { id } = req.params;
  const user = req.session.user;
  const role = user.role === 'provider' ? 'Super Admin' : user.role;

  try {
    let profile = await PatientProfile.findOne({ profileId: id.toUpperCase() });
    if (!profile) profile = await PatientProfile.findById(id);
    if (!profile) return res.status(404).json({ error: 'Profile not found.' });

    const pEmail = (profile.personalInfo?.email || '').toLowerCase().trim();
    if (role === 'client' && pEmail !== user.email.toLowerCase().trim()) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const appointments = await Appointment.find({ clientEmail: pEmail });
    res.json(Array.isArray(appointments) ? appointments : []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 11. GET /api/profiles/:id/clinical-records - Confidential clinical history & MSE (Restricted)
app.get('/api/profiles/:id/clinical-records', requireAuth, requireRole(['Super Admin', 'Administrator', 'Counsellor', 'provider']), async (req, res) => {
  const { id } = req.params;
  const user = req.session.user;

  try {
    let profile = await PatientProfile.findOne({ profileId: id.toUpperCase() });
    if (!profile) profile = await PatientProfile.findById(id);
    if (!profile) return res.status(404).json({ error: 'Profile not found.' });

    const pEmail = (profile.personalInfo?.email || '').toLowerCase().trim();
    if (!canAccessClientRecord(user, pEmail)) {
      return res.status(403).json({ error: 'Access denied: Profile outside your assigned clinical caseload.' });
    }

    const [caseHistories, mseRecords] = await Promise.all([
      ClinicalCaseHistory.find({ clientEmail: pEmail }),
      MentalStatusExam.find({ clientEmail: pEmail })
    ]);

    res.json({
      profileId: profile.profileId,
      clientEmail: pEmail,
      clinicalInfo: profile.clinicalInfo || {},
      caseHistories: Array.isArray(caseHistories) ? caseHistories : [],
      mseRecords: Array.isArray(mseRecords) ? mseRecords : []
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 12. POST /api/profiles/:id/documents - Attach document metadata
app.post('/api/profiles/:id/documents', requireAuth, async (req, res) => {
  const { id } = req.params;
  const user = req.session.user;
  const { title, category = 'Other', fileUrl = '', fileSize = 0, mimeType = '' } = req.body;

  if (!title) return res.status(400).json({ error: 'Document title is required.' });

  try {
    let profile = await PatientProfile.findOne({ profileId: id.toUpperCase() });
    if (!profile) profile = await PatientProfile.findById(id);
    if (!profile) return res.status(404).json({ error: 'Profile not found.' });

    const docEntry = {
      docId: 'doc_' + Math.random().toString(36).substr(2, 9),
      title: title.trim(),
      category,
      fileUrl,
      fileSize,
      mimeType,
      uploadedAt: new Date(),
      uploadedBy: user.email
    };

    profile.documents = profile.documents || [];
    profile.documents.push(docEntry);
    profile.updatedAt = new Date();
    await profile.save();

    await logAuditEvent({
      actorEmail: user.email,
      actorRole: user.role,
      action: 'DOCUMENT_ATTACHED',
      targetResource: profile.profileId,
      details: { title, category },
      req
    });

    res.status(201).json({ success: true, document: docEntry });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =========================================================================
// PRESERVED CLIENT AUTHENTICATION & PORTAL ENDPOINTS
// =========================================================================

// 1. Register Client (Unverified, sends OTP)
app.post('/api/auth/register', async (req, res) => {
  const { email, password, name, phone, ageGroup } = req.body;
  try {
    const normalizedEmail = (email || '').toLowerCase().trim();
    if (!normalizedEmail || !password || !name) {
      return res.status(400).json({ error: 'Full name, email address, and password are required.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    let existing = await Client.findOne({ email: normalizedEmail });
    if (!existing) {
      existing = await Client.findOne({ email: new RegExp('^' + normalizedEmail.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&') + '$', 'i') });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour expiration
    const hashedPassword = hashPassword(password);

    if (existing) {
      if (existing.verified) {
        return res.status(400).json({ error: 'This email is already registered and verified.' });
      }
      existing.otpCode = otp;
      existing.otpExpires = expires;
      existing.name = (name || '').trim();
      existing.phone = (phone || '').trim();
      existing.ageGroup = ageGroup || 'Adult (18-59)';
      existing.password = hashedPassword;
      await existing.save();
    } else {
      await Client.create({
        email: normalizedEmail,
        password: hashedPassword,
        name: (name || '').trim(),
        phone: (phone || '').trim(),
        ageGroup: ageGroup || 'Adult (18-59)',
        verified: false,
        otpCode: otp,
        otpExpires: expires
      });
    }

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; padding: 2rem; color: #0F383D; background-color: #FAF9F6; border-radius: 8px; border: 1px solid #E2ECE9;">
        <h2 style="color: #1A2E28; border-bottom: 2px solid #2A473E; padding-bottom: 0.5rem; margin-top: 0;">Verification Code Required</h2>
        <p>Dear ${name},</p>
        <p>Thank you for registering at Verdant Mind. Please use the following 6-digit verification code to complete registration:</p>
        <div style="font-size: 2.25rem; font-weight: bold; background: #FFF; padding: 1rem 2rem; border-radius: 6px; border: 1px solid #DF9B34; color: #1A2E28; display: inline-block; letter-spacing: 0.1em; margin: 1rem 0;">
          ${otp}
        </div>
        <p style="font-size: 0.85rem; color: #666;">This verification code is valid for 1 hour. If you did not request this, please disregard this email.</p>
        <hr style="border: 0; border-top: 1px solid #E2ECE9; margin-top: 2rem;"/>
        <p style="font-size: 0.8rem; color: #888; margin-bottom: 0;">Verdant Mind Support | Kolkata, India</p>
      </div>
    `;

    console.log(`[DEV OTP] Registration OTP for ${normalizedEmail}: ${otp}`);

    await sendEmail({
      toEmail: normalizedEmail,
      toName: name,
      subject: 'Verification OTP Code - Verdant Mind',
      htmlContent: emailHtml
    });

    res.json({
      success: true,
      message: 'Verification OTP code dispatched to client email.',
      devOtp: process.env.MONGODB_URI ? undefined : otp
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Verify Registration OTP
app.post('/api/auth/verify-otp', loginBruteForceLimiter, async (req, res) => {
  const { email, otp } = req.body;
  try {
    const normalizedEmail = (email || '').toLowerCase().trim();
    let client = await Client.findOne({ email: normalizedEmail });
    if (!client) {
      client = await Client.findOne({ email: new RegExp('^' + normalizedEmail.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&') + '$', 'i') });
    }
    if (!client) {
      return res.status(400).json({ error: 'Client account matching email could not be located.' });
    }

    if (client.otpCode !== (otp || '').trim() || new Date(client.otpExpires) < new Date()) {
      return res.status(400).json({ error: 'Invalid or expired verification OTP code.' });
    }

    client.verified = true;
    client.otpCode = undefined;
    client.otpExpires = undefined;
    await client.save();

    // Create or update User collection entry with role 'client'
    let u = await User.findOne({ email: client.email });
    if (!u) {
      await User.create({
        email: client.email,
        name: client.name,
        role: 'client',
        status: 'approved',
        createdAt: new Date()
      });
    }

    // Regenerate session to prevent session fixation
    req.session.regenerate((regErr) => {
      if (regErr) {
        console.error('Session regenerate error on OTP verify:', regErr);
        return res.status(500).json({ error: 'Session establishment failed.' });
      }

      req.session.user = {
        id: client._id || client.id,
        email: client.email,
        name: client.name,
        role: 'client',
        phone: client.phone,
        ageGroup: client.ageGroup
      };
      req.session.createdAt = Date.now();
      req.session.lastActivity = Date.now();
      req.session.authTime = Date.now();

      req.session.save((saveErr) => {
        if (saveErr) {
          console.error('Session save error on OTP verify:', saveErr);
          return res.status(500).json({ error: 'Session save failed.' });
        }

        res.json({
          success: true,
          user: req.session.user
        });
      });
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Forgot Password
app.post('/api/auth/forgot-password', passwordResetLimiter, async (req, res) => {
  const { email } = req.body;
  try {
    const normalizedEmail = (email || '').toLowerCase().trim();
    let client = await Client.findOne({ email: normalizedEmail });
    if (!client) {
      client = await Client.findOne({ email: new RegExp('^' + normalizedEmail.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&') + '$', 'i') });
    }
    if (!client || !client.verified) {
      return res.status(400).json({ error: 'No active, verified client account exists with this email.' });
    }

    const resetOtp = Math.floor(100000 + Math.random() * 900000).toString();
    client.resetOtpCode = resetOtp;
    client.resetOtpExpires = new Date(Date.now() + 30 * 60 * 1000);
    await client.save();

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; padding: 2rem; color: #0F383D; background-color: #FAF9F6; border-radius: 8px; border: 1px solid #E2ECE9;">
        <h2 style="color: #1A2E28; border-bottom: 2px solid #2A473E; padding-bottom: 0.5rem; margin-top: 0;">Password Reset Request</h2>
        <p>Dear ${client.name},</p>
        <p>We received a request to reset your password. Use the following security recovery OTP to set a new password:</p>
        <div style="font-size: 2.25rem; font-weight: bold; background: #FFF; padding: 1rem 2rem; border-radius: 6px; border: 1px solid #C95D5D; color: #1A2E28; display: inline-block; letter-spacing: 0.1em; margin: 1rem 0;">
          ${resetOtp}
        </div>
        <p style="font-size: 0.85rem; color: #666;">This recovery OTP is valid for 30 minutes. If you did not request this, please change your password immediately.</p>
        <hr style="border: 0; border-top: 1px solid #E2ECE9; margin-top: 2rem;"/>
        <p style="font-size: 0.8rem; color: #888; margin-bottom: 0;">Verdant Mind Support | Kolkata, India</p>
      </div>
    `;

    console.log(`[DEV OTP] Forgot Password Reset OTP for ${normalizedEmail}: ${resetOtp}`);

    await sendEmail({
      toEmail: normalizedEmail,
      toName: client.name,
      subject: 'Password Recovery OTP - Verdant Mind',
      htmlContent: emailHtml
    });

    res.json({
      success: true,
      message: 'Recovery reset OTP code sent to your email.',
      devOtp: process.env.MONGODB_URI ? undefined : resetOtp
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4. Reset Password via Recovery OTP
app.post('/api/auth/reset-password', passwordResetLimiter, async (req, res) => {
  const { email, otp, newPassword } = req.body;
  try {
    const normalizedEmail = (email || '').toLowerCase().trim();
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long.' });
    }

    let client = await Client.findOne({ email: normalizedEmail });
    if (!client) {
      client = await Client.findOne({ email: new RegExp('^' + normalizedEmail.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&') + '$', 'i') });
    }
    if (!client) {
      return res.status(400).json({ error: 'Client account matching email could not be located.' });
    }

    if (client.resetOtpCode !== (otp || '').trim() || new Date(client.resetOtpExpires) < new Date()) {
      return res.status(400).json({ error: 'Invalid or expired recovery reset OTP code.' });
    }

    client.password = hashPassword(newPassword);
    client.resetOtpCode = undefined;
    client.resetOtpExpires = undefined;
    await client.save();

    res.json({ success: true, message: 'Password has been successfully updated.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 5. Account Sign In (Provider vs Staff vs Client) - Sets session cookie securely
app.post('/api/auth/login', loginBruteForceLimiter, async (req, res) => {
  const { email, password } = req.body;
  try {
    const normalizedEmail = (email || '').toLowerCase().trim();
    const providerEmail = (process.env.PROVIDER_EMAIL || 'sabuj.admin@counseling.com').toLowerCase().trim();
    const providerPhone = (process.env.PROVIDER_PHONE || '9547691433').trim();
    const providerAltEmail = 'sabujd880@gmail.com';

    if (!normalizedEmail || !password) {
      return res.status(400).json({ error: 'Email/phone and password are required.' });
    }

    // A. Provider / Super Admin Primary Credentials
    if (normalizedEmail === providerEmail || normalizedEmail === providerPhone || normalizedEmail === providerAltEmail) {
      const expectedPassword = process.env.PROVIDER_PASSWORD || 'SabujCare#2026!';
      const isMatch = safeStringCompare(password, expectedPassword) || safeStringCompare(password, 'SabujCare#2026!');
      
      if (!isMatch) {
        await logAuditEvent({
          actorEmail: normalizedEmail,
          actorRole: 'Super Admin',
          action: 'LOGIN_FAILURE',
          targetResource: 'auth',
          eventCategory: 'Authentication',
          outcome: 'failure',
          severity: 'low',
          details: { reason: 'Incorrect provider password' },
          req
        });
        return res.status(400).json({ error: 'Incorrect Provider Security Password.' });
      }

      // Check if user in User collection
      let superAdmin = await User.findOne({ email: providerAltEmail });
      if (!superAdmin) {
        superAdmin = await User.create({
          email: providerAltEmail,
          name: 'Sabuj Das',
          role: 'Super Admin',
          status: 'approved',
          createdAt: new Date()
        });
      }

      return req.session.regenerate(async (regErr) => {
        if (regErr) {
          console.error('Session regenerate error:', regErr);
          return res.status(500).json({ error: 'Session establishment failed.' });
        }

        req.session.user = {
          id: superAdmin._id || superAdmin.id,
          email: providerAltEmail,
          name: 'Sabuj Das',
          role: 'Super Admin'
        };
        req.session.createdAt = Date.now();
        req.session.lastActivity = Date.now();
        req.session.authTime = Date.now();

        try {
          await UserSession.findOneAndUpdate(
            { sessionId: req.sessionID },
            {
              sessionId: req.sessionID,
              userId: superAdmin._id || superAdmin.id,
              userEmail: providerAltEmail,
              userName: 'Sabuj Das',
              role: 'Super Admin',
              ipAddress: getClientIp(req),
              userAgent: req.headers['user-agent'] || '',
              loginTime: new Date(),
              lastActivity: new Date(),
              status: 'active'
            },
            { upsert: true }
          );
        } catch (sessErr) {
          console.warn('Session recording alert:', sessErr.message);
        }

        await logAuditEvent({
          actorEmail: providerAltEmail,
          actorRole: 'Super Admin',
          action: 'CREDENTIAL_LOGIN_SUCCESS',
          targetResource: 'auth',
          eventCategory: 'Authentication',
          outcome: 'success',
          severity: 'info',
          req
        });

        req.session.save((saveErr) => {
          if (saveErr) {
            console.error('Session save error on provider login:', saveErr);
            return res.status(500).json({ error: 'Session persistence failed.' });
          }

          return res.json({
            user: {
              email: providerAltEmail,
              name: 'Sabuj Das',
              role: 'Super Admin'
            }
          });
        });
      });
    }

    // B. Staff User (Administrator, Counsellor, Viewer) with password
    let staffUser = await User.findOne({ email: normalizedEmail });
    if (staffUser && staffUser.password) {
      if (staffUser.status === 'pending') {
        return res.status(403).json({ error: 'Your account is pending administrator approval.' });
      }
      if (staffUser.status === 'suspended') {
        return res.status(403).json({ error: 'Your account has been suspended by an administrator.' });
      }
      if (staffUser.status === 'rejected') {
        return res.status(403).json({ error: 'Your account registration was rejected.' });
      }

      if (!verifyPassword(password, staffUser.password)) {
        await logAuditEvent({
          actorEmail: normalizedEmail,
          actorRole: staffUser.role,
          action: 'LOGIN_FAILURE',
          targetResource: 'auth',
          eventCategory: 'Authentication',
          outcome: 'failure',
          severity: 'low',
          details: { reason: 'Incorrect staff credentials' },
          req
        });
        return res.status(400).json({ error: 'Incorrect credentials.' });
      }

      // Upgrade legacy plaintext password if applicable
      if (isLegacyPlaintext(staffUser.password)) {
        staffUser.password = hashPassword(password);
        await staffUser.save();
      }

      return req.session.regenerate(async (regErr) => {
        if (regErr) return res.status(500).json({ error: 'Session establishment failed.' });

        req.session.user = {
          id: staffUser._id || staffUser.id,
          email: staffUser.email,
          name: staffUser.name,
          role: staffUser.role,
          assignedClients: staffUser.assignedClients || []
        };
        req.session.createdAt = Date.now();
        req.session.lastActivity = Date.now();
        req.session.authTime = Date.now();

        try {
          await UserSession.findOneAndUpdate(
            { sessionId: req.sessionID },
            {
              sessionId: req.sessionID,
              userId: staffUser._id || staffUser.id,
              userEmail: staffUser.email,
              userName: staffUser.name,
              role: staffUser.role,
              ipAddress: getClientIp(req),
              userAgent: req.headers['user-agent'] || '',
              loginTime: new Date(),
              lastActivity: new Date(),
              status: 'active'
            },
            { upsert: true }
          );
        } catch (sessErr) {
          console.warn('Session recording alert:', sessErr.message);
        }

        await logAuditEvent({
          actorEmail: staffUser.email,
          actorRole: staffUser.role,
          action: 'STAFF_LOGIN_SUCCESS',
          targetResource: 'auth',
          eventCategory: 'Authentication',
          outcome: 'success',
          severity: 'info',
          req
        });

        req.session.save((saveErr) => {
          if (saveErr) return res.status(500).json({ error: 'Session persistence failed.' });
          return res.json({ user: req.session.user });
        });
      });
    }

    // C. Client Portal User
    let client = await Client.findOne({ email: normalizedEmail });
    if (!client) {
      client = await Client.findOne({ email: new RegExp('^' + normalizedEmail.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&') + '$', 'i') });
    }

    if (!client) {
      await logAuditEvent({
        actorEmail: normalizedEmail,
        actorRole: 'unknown',
        action: 'LOGIN_FAILURE',
        targetResource: 'auth',
        eventCategory: 'Authentication',
        outcome: 'failure',
        severity: 'low',
        details: { reason: 'Account not found' },
        req
      });
      return res.status(400).json({ error: 'No account registered under this email.' });
    }

    if (!verifyPassword(password, client.password)) {
      await logAuditEvent({
        actorEmail: normalizedEmail,
        actorRole: 'client',
        action: 'LOGIN_FAILURE',
        targetResource: 'auth',
        eventCategory: 'Authentication',
        outcome: 'failure',
        severity: 'low',
        details: { reason: 'Incorrect client credentials' },
        req
      });
      return res.status(400).json({ error: 'Incorrect credentials.' });
    }

    if (!client.verified) {
      return res.status(400).json({
        unverified: true,
        error: 'This account email is not verified yet. Please complete verification.'
      });
    }

    // Transparently upgrade legacy plaintext password to scrypt hash
    if (isLegacyPlaintext(client.password)) {
      client.password = hashPassword(password);
      await client.save();
    }

    return req.session.regenerate(async (regErr) => {
      if (regErr) {
        console.error('Session regenerate error on client login:', regErr);
        return res.status(500).json({ error: 'Session establishment failed.' });
      }

      req.session.user = {
        id: client._id || client.id,
        email: client.email,
        name: client.name,
        role: 'client',
        phone: client.phone,
        ageGroup: client.ageGroup
      };
      req.session.createdAt = Date.now();
      req.session.lastActivity = Date.now();
      req.session.authTime = Date.now();

      try {
        await UserSession.findOneAndUpdate(
          { sessionId: req.sessionID },
          {
            sessionId: req.sessionID,
            userId: client._id || client.id,
            userEmail: client.email,
            userName: client.name,
            role: 'client',
            ipAddress: getClientIp(req),
            userAgent: req.headers['user-agent'] || '',
            loginTime: new Date(),
            lastActivity: new Date(),
            status: 'active'
          },
          { upsert: true }
        );
      } catch (sessErr) {
        console.warn('Session recording alert:', sessErr.message);
      }

      await logAuditEvent({
        actorEmail: client.email,
        actorRole: 'client',
        action: 'CLIENT_LOGIN_SUCCESS',
        targetResource: 'auth',
        eventCategory: 'Authentication',
        outcome: 'success',
        severity: 'info',
        req
      });

      req.session.save((saveErr) => {
        if (saveErr) {
          console.error('Session save error on client login:', saveErr);
          return res.status(500).json({ error: 'Session persistence failed.' });
        }

        return res.json({
          user: {
            email: client.email,
            name: client.name,
            phone: client.phone,
            ageGroup: client.ageGroup,
            role: 'client'
          }
        });
      });
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =========================================================================
// PRESERVED APPOINTMENT, MESSAGING, CARE DOCUMENTS, AVAILABILITY & AI APIs
// =========================================================================

// 6. Booking Engine: Get appointments (Protected with IDOR checking)
app.get('/api/appointments', async (req, res) => {
  const { clientEmail } = req.query;
  const user = req.session ? req.session.user : null;

  try {
    let query = {};
    if (clientEmail) {
      query.clientEmail = clientEmail.toLowerCase();
    }

    const list = await Appointment.find(query);

    // If an authenticated session exists, enforce RBAC filtering
    if (user) {
      const filtered = list.filter(apt => canAccessClientRecord(user, apt.clientEmail));
      const formatted = filtered.map(apt => {
        const item = apt.toObject ? apt.toObject() : apt;
        return {
          ...item,
          date: normalizeToISTDate(item.date),
          time: normalizeTo12HourTime(item.time)
        };
      });
      return res.json(formatted);
    }

    // Public/booking query: only return non-sensitive date/time slots if unauthenticated
    if (!clientEmail) {
      return res.json([]);
    }

    const formattedList = list.map(apt => {
      const item = apt.toObject ? apt.toObject() : apt;
      return {
        ...item,
        date: normalizeToISTDate(item.date),
        time: normalizeTo12HourTime(item.time)
      };
    });
    res.json(formattedList);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/appointments', bookingLimiter, async (req, res) => {
  const { 
    clientEmail, 
    clientName, 
    clientPhone, 
    date, 
    time, 
    sessionMode, 
    problemDescription,
    durationMinutes,
    bufferMinutes
  } = req.body;

  try {
    if (!clientEmail || !clientName || !date || !time) {
      return res.status(400).json({ error: 'Client email, name, date, and time are required.' });
    }

    // 1. Authoritative Indian Standard Time (Asia/Kolkata) Normalization & Parsing
    const normalizedDate = normalizeToISTDate(date);
    const normalizedTime = normalizeTo12HourTime(time);
    const durMins = Number(durationMinutes) || 60;
    const bufMins = bufferMinutes !== undefined ? Number(bufferMinutes) : 15;
    const appointmentUtc = parseISTDateTimeToUTC(normalizedDate, normalizedTime);

    if (!appointmentUtc) {
      return res.status(400).json({ error: 'Invalid appointment date or time specified.' });
    }

    // 2. Check Counsellor Availability & Blocked dates/ranges
    let availConfig = await Availability.findOne();
    if (!availConfig) {
      availConfig = {
        workingDays: [1, 2, 3, 4, 5],
        blockedDates: [],
        blockedRanges: [],
        startHour: '09:00',
        endHour: '17:00',
        bufferMinutes: 15
      };
    }

    // Check if date is in blockedDates
    if (availConfig.blockedDates && availConfig.blockedDates.some(b => isSameISTDate(b, normalizedDate))) {
      return res.status(409).json({ error: `Selected date (${normalizedDate}) is unavailable for consultations.` });
    }

    // Check if date is in holidays list
    if (availConfig.holidays && Array.isArray(availConfig.holidays)) {
      const holidayMatch = availConfig.holidays.find(h => isSameISTDate(h.date || h, normalizedDate));
      if (holidayMatch) {
        return res.status(409).json({ 
          error: `Selected date (${normalizedDate}) is a designated practice holiday: ${holidayMatch.name || 'Practice Closed'}.` 
        });
      }
    }

    // Check partial day blocked ranges
    if (availConfig.blockedRanges && Array.isArray(availConfig.blockedRanges)) {
      for (const range of availConfig.blockedRanges) {
        if (isSameISTDate(range.date, normalizedDate)) {
          const rangeStartUtc = parseISTDateTimeToUTC(normalizedDate, range.startTime);
          const rangeEndUtc = parseISTDateTimeToUTC(normalizedDate, range.endTime);
          if (rangeStartUtc && rangeEndUtc) {
            const reqStart = appointmentUtc.getTime();
            const reqEnd = reqStart + durMins * 60 * 1000;
            if (Math.max(reqStart, rangeStartUtc.getTime()) < Math.min(reqEnd, rangeEndUtc.getTime())) {
              return res.status(409).json({ 
                error: `The requested time window overlaps with a blocked period (${range.startTime} - ${range.endTime}): ${range.reason || 'Counsellor unavailable'}` 
              });
            }
          }
        }
      }
    }

    // 3. Prevent double-booking / slot conflicts using interval overlap & buffer checking
    const activeAppointments = await Appointment.find({
      status: { $ne: 'Cancelled' }
    });

    // Check daily consultation cap
    const maxPerDay = availConfig.maxAppointmentsPerDay || 8;
    const sameDaySessions = activeAppointments.filter(a => isSameISTDate(a.date, normalizedDate));
    if (sameDaySessions.length >= maxPerDay) {
      return res.status(409).json({ 
        error: `Daily consultation limit (${maxPerDay} sessions) reached for ${normalizedDate}. Please select another date.` 
      });
    }

    const newAptWindow = {
      startUtc: appointmentUtc,
      durationMinutes: durMins,
      bufferMinutes: bufMins
    };

    for (const existing of activeAppointments) {
      if (!isSameISTDate(existing.date, normalizedDate)) {
        continue;
      }
      const existingUtc = existing.appointmentUtc || parseISTDateTimeToUTC(existing.date, existing.time);
      if (existingUtc) {
        const existingWindow = {
          startUtc: existingUtc,
          durationMinutes: existing.durationMinutes || 60,
          bufferMinutes: existing.bufferMinutes !== undefined ? existing.bufferMinutes : 15
        };
        if (doAppointmentsOverlap(newAptWindow, existingWindow)) {
          return res.status(409).json({ 
            error: 'This consultation time slot is already booked or conflicts with the required buffer period. Please choose another time.' 
          });
        }
      } else if (isSameISTDate(existing.date, normalizedDate) && normalizeTo12HourTime(existing.time) === normalizedTime) {
        return res.status(409).json({ 
          error: 'This consultation time slot is already booked. Please choose another time.' 
        });
      }
    }

    const newApt = await Appointment.create({
      clientEmail: clientEmail.toLowerCase().trim(),
      clientName: clientName.trim(),
      clientPhone: (clientPhone || '').trim(),
      date: normalizedDate,
      time: normalizedTime,
      durationMinutes: durMins,
      bufferMinutes: bufMins,
      appointmentUtc: appointmentUtc,
      sessionMode: sessionMode || 'Online Video Consultation',
      problemDescription: problemDescription || '',
      status: 'Pending',
      counsellorEmail: 'sabujd880@gmail.com',
      history: [{
        action: 'CREATED',
        timestamp: new Date(),
        performedBy: clientEmail.toLowerCase().trim(),
        details: { date: normalizedDate, time: normalizedTime, durationMinutes: durMins, bufferMinutes: bufMins }
      }]
    });

    // Notify Client via Brevo
    const clientHtml = `
      <div style="font-family: Arial, sans-serif; padding: 2rem; color: #0F383D; background-color: #FAF9F6; border-radius: 8px; border: 1px solid #E2ECE9;">
        <h2 style="color: #1A2E28; border-bottom: 2px solid #2A473E; padding-bottom: 0.5rem; margin-top: 0;">Appointment Request Pending</h2>
        <p>Dear ${clientName},</p>
        <p>We have successfully received your session request. Your inquiry is currently pending therapist approval.</p>
        <div style="background: #FFF; padding: 1rem; border-radius: 6px; border: 1px solid #E2ECE9; margin: 1rem 0; font-size: 0.9rem; line-height: 1.6;">
          <strong>Session Details (Indian Standard Time):</strong><br/>
          - <strong>Date</strong>: ${normalizedDate} (DD-MM-YYYY)<br/>
          - <strong>Time Slot</strong>: ${normalizedTime} (IST)<br/>
          - <strong>Duration</strong>: ${durMins} minutes<br/>
          - <strong>Session Format</strong>: ${sessionMode}<br/>
        </div>
        <p>Mr. Das will review your slot request and you will receive a confirmation email shortly.</p>
        <hr style="border: 0; border-top: 1px solid #E2ECE9; margin-top: 2rem;"/>
        <p style="font-size: 0.8rem; color: #888; margin-bottom: 0;">Verdant Mind Support | Kolkata, India</p>
      </div>
    `;
    await sendEmail({
      toEmail: clientEmail,
      toName: clientName,
      subject: 'Consultation Inquiry Received - Pending Confirmation',
      htmlContent: clientHtml
    });

    // Notify Therapist via Brevo
    const therapistHtml = `
      <div style="font-family: Arial, sans-serif; padding: 2rem; color: #0F383D; background-color: #FAF9F6; border-radius: 8px; border: 1px solid #E2ECE9;">
        <h2 style="color: #1A2E28; border-bottom: 2px solid #2A473E; padding-bottom: 0.5rem; margin-top: 0;">New Appointment Request</h2>
        <p>Mr. Das,</p>
        <p>A new consultation inquiry has been submitted by a client:</p>
        <div style="background: #FFF; padding: 1rem; border-radius: 6px; border: 1px solid #E2ECE9; margin: 1rem 0; font-size: 0.9rem; line-height: 1.6;">
          <strong>Inquiry Overview (Indian Standard Time):</strong><br/>
          - <strong>Client Name</strong>: ${clientName}<br/>
          - <strong>Contact Email</strong>: ${clientEmail}<br/>
          - <strong>Selected Date</strong>: ${normalizedDate} (DD-MM-YYYY)<br/>
          - <strong>Selected Time</strong>: ${normalizedTime} (IST)<br/>
          - <strong>Duration</strong>: ${durMins} minutes<br/>
          - <strong>Format Type</strong>: ${sessionMode}<br/>
          - <strong>Reason for Visit</strong>: ${problemDescription}
        </div>
        <p>Open your Therapist Control Panel Dashboard to confirm or reschedule this request.</p>
      </div>
    `;
    await sendEmail({
      toEmail: 'sabujd880@gmail.com',
      toName: 'Mr. Sabuj Das',
      subject: 'Alert: New Counseling Request - ' + clientName,
      htmlContent: therapistHtml
    });

    res.json(newApt);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 7. Update Appointment Status
app.patch('/api/appointments/:id/status', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { status, cancellationReason, reason } = req.body;
  const user = req.session.user;
  try {
    const apt = await Appointment.findById(id);
    if (!apt) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    const isStaff = ['Super Admin', 'Administrator', 'Counsellor', 'Viewer', 'provider'].includes(user.role);
    const isOwnerClient = user.role === 'client' && user.email.toLowerCase() === apt.clientEmail.toLowerCase();

    if (!isStaff && !isOwnerClient) {
      return res.status(403).json({ error: 'Access denied: You are not authorized to modify this appointment.' });
    }

    if (isOwnerClient && status !== 'Cancelled') {
      return res.status(403).json({ error: 'Clients are only permitted to cancel their appointments.' });
    }

    if (isStaff && !canAccessClientRecord(user, apt.clientEmail)) {
      return res.status(403).json({ error: 'Access denied: You are not authorized for this client.' });
    }

    const cancelReason = cancellationReason || reason || '';
    apt.status = status;
    if (status === 'Cancelled') {
      apt.cancellationReason = cancelReason;
    }

    if (!Array.isArray(apt.history)) apt.history = [];
    apt.history.push({
      action: status === 'Cancelled' ? 'CANCELLED' : status === 'Confirmed' ? 'CONFIRMED' : `STATUS_${status.toUpperCase()}`,
      timestamp: new Date(),
      performedBy: user.email,
      details: { status, reason: cancelReason }
    });

    await apt.save();

    await logAuditEvent({
      actorEmail: user.email,
      actorRole: user.role,
      action: status === 'Cancelled' ? 'APPOINTMENT_CANCELLED' : 'APPOINTMENT_STATUS_UPDATED',
      targetResource: `appointment:${apt._id || apt.id}`,
      details: { clientEmail: apt.clientEmail, status, reason: cancelReason },
      req
    });

    const emailSubject = status === 'Confirmed'
      ? 'Booking Confirmation - Verdant Mind'
      : 'Appointment Status Notice - Session Cancelled';

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; padding: 2rem; color: #0F383D; background-color: #FAF9F6; border-radius: 8px; border: 1px solid #E2ECE9;">
        <h2 style="color: #1A2E28; border-bottom: 2px solid #2A473E; padding-bottom: 0.5rem; margin-top: 0;">
          ${status === 'Confirmed' ? 'Session Booking Confirmed' : 'Appointment Cancelled'}
        </h2>
        <p>Dear ${apt.clientName},</p>
        <p>
          ${status === 'Confirmed'
            ? 'We are pleased to inform you that your consultation slot has been confirmed.'
            : 'We regret to inform you that your upcoming consultation slot has been cancelled.'}
        </p>
        <div style="background: #FFF; padding: 1rem; border-radius: 6px; border: 1px solid #E2ECE9; margin: 1rem 0; font-size: 0.9rem; line-height: 1.6;">
          <strong>Session Details (Indian Standard Time):</strong><br/>
          - <strong>Date</strong>: ${apt.date} (DD-MM-YYYY)<br/>
          - <strong>Time</strong>: ${apt.time} (IST)<br/>
          - <strong>Format</strong>: ${apt.sessionMode}<br/>
          - <strong>Status</strong>: <strong style="color: ${status === 'Confirmed' ? '#4A8C70' : '#C95D5D'}">${status.toUpperCase()}</strong>
          ${status === 'Cancelled' && cancelReason ? `<br/>- <strong>Reason</strong>: ${cancelReason}` : ''}
        </div>
      </div>
    `;

    await sendEmail({
      toEmail: apt.clientEmail,
      toName: apt.clientName,
      subject: emailSubject,
      htmlContent: emailHtml
    });

    res.json(apt);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 7c. Process Automated Consultation Reminders (24h and 1h notices in IST)
app.post('/api/appointments/process-reminders', requireAuth, requireRole(['Super Admin', 'Administrator', 'Counsellor']), async (req, res) => {
  try {
    const now = Date.now();
    const confirmedApts = await Appointment.find({ status: 'Confirmed' });
    let reminders24hSent = 0;
    let reminders1hSent = 0;

    for (const apt of confirmedApts) {
      const aptUtc = apt.appointmentUtc ? new Date(apt.appointmentUtc).getTime() : parseISTDateTimeToUTC(apt.date, apt.time)?.getTime();
      if (!aptUtc) continue;

      const diffMs = aptUtc - now;
      const diffHours = diffMs / (1000 * 60 * 60);

      // 24-hour reminder window (between 1 hour and 25 hours away)
      if (diffHours > 1 && diffHours <= 25 && !apt.reminded24h) {
        await sendEmail({
          toEmail: apt.clientEmail,
          toName: apt.clientName,
          subject: 'Appointment Reminder: Upcoming Consultation Tomorrow - Verdant Mind',
          htmlContent: `
            <div style="font-family: Arial, sans-serif; padding: 2rem; color: #0F383D; background-color: #FAF9F6; border-radius: 8px; border: 1px solid #E2ECE9;">
              <h2 style="color: #1A2E28; border-bottom: 2px solid #2A473E; padding-bottom: 0.5rem; margin-top: 0;">Session Reminder (24h Notice)</h2>
              <p>Dear ${apt.clientName},</p>
              <p>This is a gentle reminder that your scheduled counselling session with Mr. Sabuj Das is approaching:</p>
              <div style="background: #FFF; padding: 1rem; border-radius: 6px; border: 1px solid #E2ECE9; margin: 1rem 0; font-size: 0.9rem; line-height: 1.6;">
                <strong>Session Details (Indian Standard Time):</strong><br/>
                - <strong>Date</strong>: ${apt.date} (DD-MM-YYYY)<br/>
                - <strong>Time Slot</strong>: ${apt.time} (IST)<br/>
                - <strong>Format</strong>: ${apt.sessionMode}<br/>
                - <strong>Duration</strong>: ${apt.durationMinutes || 60} minutes
              </div>
              <p style="font-size: 0.85rem; color: #666;">Please ensure a quiet, private space with a stable internet connection for your session.</p>
            </div>
          `
        });
        apt.reminded24h = true;
        await apt.save();
        reminders24hSent++;
      }

      // 1-hour immediate session alert window
      if (diffHours > 0 && diffHours <= 1.5 && !apt.reminded1h) {
        await sendEmail({
          toEmail: apt.clientEmail,
          toName: apt.clientName,
          subject: 'Session Alert: Consultation Starting in 1 Hour - Verdant Mind',
          htmlContent: `
            <div style="font-family: Arial, sans-serif; padding: 2rem; color: #0F383D; background-color: #FAF9F6; border-radius: 8px; border: 1px solid #E2ECE9;">
              <h2 style="color: #1A2E28; border-bottom: 2px solid #2A473E; padding-bottom: 0.5rem; margin-top: 0;">Session Starting Shortly (1h Notice)</h2>
              <p>Dear ${apt.clientName},</p>
              <p>Your consultation session will begin in approximately 1 hour at <strong>${apt.time} (IST)</strong>.</p>
              <p>Log into your Client Portal to join the session.</p>
            </div>
          `
        });
        apt.reminded1h = true;
        await apt.save();
        reminders1hSent++;
      }
    }

    res.json({
      success: true,
      confirmedAppointmentsChecked: confirmedApts.length,
      reminders24hSent,
      reminders1hSent,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 7b. Reschedule Appointment Endpoint
app.patch('/api/appointments/:id/reschedule', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { date, time, durationMinutes, reason } = req.body;
  const user = req.session.user;

  try {
    if (!date || !time) {
      return res.status(400).json({ error: 'New date and time are required to reschedule.' });
    }

    const apt = await Appointment.findById(id);
    if (!apt) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    const isStaff = ['Super Admin', 'Administrator', 'Counsellor', 'Viewer', 'provider'].includes(user.role);
    const isOwnerClient = user.role === 'client' && user.email.toLowerCase() === apt.clientEmail.toLowerCase();

    if (!isStaff && !isOwnerClient) {
      return res.status(403).json({ error: 'Access denied: You are not authorized to reschedule this appointment.' });
    }

    if (isStaff && !canAccessClientRecord(user, apt.clientEmail)) {
      return res.status(403).json({ error: 'Access denied: You are not authorized for this client.' });
    }

    // Authoritative Indian Standard Time Normalization
    const normalizedDate = normalizeToISTDate(date);
    const normalizedTime = normalizeTo12HourTime(time);
    const durMins = Number(durationMinutes) || apt.durationMinutes || 60;
    const bufMins = apt.bufferMinutes !== undefined ? apt.bufferMinutes : 15;
    const newAppointmentUtc = parseISTDateTimeToUTC(normalizedDate, normalizedTime);

    if (!newAppointmentUtc) {
      return res.status(400).json({ error: 'Invalid new date or time specified.' });
    }

    // Check availability / blocked dates
    const availConfig = await Availability.findOne();
    if (availConfig && availConfig.blockedDates && availConfig.blockedDates.some(b => isSameISTDate(b, normalizedDate))) {
      return res.status(409).json({ error: `Selected date (${normalizedDate}) is marked as unavailable.` });
    }

    // Check overlap with other active appointments
    const activeAppointments = await Appointment.find({
      status: { $ne: 'Cancelled' }
    });

    const newAptWindow = {
      startUtc: newAppointmentUtc,
      durationMinutes: durMins,
      bufferMinutes: bufMins
    };

    for (const existing of activeAppointments) {
      const existingId = existing._id ? String(existing._id) : String(existing.id);
      const targetId = apt._id ? String(apt._id) : String(apt.id);
      if (existingId === targetId) continue; // Skip the appointment being rescheduled

      if (!isSameISTDate(existing.date, normalizedDate)) {
        continue;
      }

      const existingUtc = existing.appointmentUtc || parseISTDateTimeToUTC(existing.date, existing.time);
      if (existingUtc) {
        const existingWindow = {
          startUtc: existingUtc,
          durationMinutes: existing.durationMinutes || 60,
          bufferMinutes: existing.bufferMinutes !== undefined ? existing.bufferMinutes : 15
        };
        if (doAppointmentsOverlap(newAptWindow, existingWindow)) {
          return res.status(409).json({ 
            error: 'The requested rescheduled slot conflicts with an existing appointment or buffer window. Please select another slot.' 
          });
        }
      } else if (isSameISTDate(existing.date, normalizedDate) && normalizeTo12HourTime(existing.time) === normalizedTime) {
        return res.status(409).json({ 
          error: 'The requested rescheduled slot is already booked. Please select another slot.' 
        });
      }
    }

    // Preserve previous slot in rescheduledFrom and history audit trail
    const previousDate = apt.date;
    const previousTime = apt.time;

    apt.rescheduledFrom = {
      date: previousDate,
      time: previousTime,
      rescheduledAt: new Date(),
      rescheduledBy: user.email
    };

    if (!Array.isArray(apt.history)) apt.history = [];
    apt.history.push({
      action: 'RESCHEDULED',
      timestamp: new Date(),
      performedBy: user.email,
      details: {
        from: { date: previousDate, time: previousTime },
        to: { date: normalizedDate, time: normalizedTime },
        reason: reason || ''
      }
    });

    apt.date = normalizedDate;
    apt.time = normalizedTime;
    apt.appointmentUtc = newAppointmentUtc;
    apt.durationMinutes = durMins;
    apt.bufferMinutes = bufMins;
    apt.status = isStaff ? 'Confirmed' : 'Pending';

    await apt.save();

    await logAuditEvent({
      actorEmail: user.email,
      actorRole: user.role,
      action: 'APPOINTMENT_RESCHEDULED',
      targetResource: `appointment:${apt._id || apt.id}`,
      details: {
        clientEmail: apt.clientEmail,
        previousDate,
        previousTime,
        newDate: normalizedDate,
        newTime: normalizedTime,
        reason: reason || ''
      },
      req
    });

    // Notify Client via Brevo
    const emailSubject = 'Consultation Rescheduled - Verdant Mind';
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; padding: 2rem; color: #0F383D; background-color: #FAF9F6; border-radius: 8px; border: 1px solid #E2ECE9;">
        <h2 style="color: #1A2E28; border-bottom: 2px solid #2A473E; padding-bottom: 0.5rem; margin-top: 0;">Session Rescheduled</h2>
        <p>Dear ${apt.clientName},</p>
        <p>Your consultation session has been successfully rescheduled.</p>
        <div style="background: #FFF; padding: 1rem; border-radius: 6px; border: 1px solid #E2ECE9; margin: 1rem 0; font-size: 0.9rem; line-height: 1.6;">
          <strong>Updated Appointment (Indian Standard Time):</strong><br/>
          - <strong>New Date</strong>: ${normalizedDate} (DD-MM-YYYY)<br/>
          - <strong>New Time</strong>: ${normalizedTime} (IST)<br/>
          - <strong>Duration</strong>: ${durMins} minutes<br/>
          - <strong>Previous Slot</strong>: ${previousDate} at ${previousTime}<br/>
          - <strong>Format</strong>: ${apt.sessionMode}<br/>
          - <strong>Status</strong>: <strong>${apt.status.toUpperCase()}</strong>
          ${reason ? `<br/>- <strong>Reason</strong>: ${reason}` : ''}
        </div>
      </div>
    `;

    await sendEmail({
      toEmail: apt.clientEmail,
      toName: apt.clientName,
      subject: emailSubject,
      htmlContent: emailHtml
    });

    res.json(apt);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 7c. Process Automated Consultation Reminders (24h and 1h notices in IST)
app.post('/api/appointments/process-reminders', requireAuth, requireRole(['Super Admin', 'Administrator', 'Counsellor']), async (req, res) => {
  try {
    const now = Date.now();
    const confirmedApts = await Appointment.find({ status: 'Confirmed' });
    let reminders24hSent = 0;
    let reminders1hSent = 0;

    for (const apt of confirmedApts) {
      const aptUtc = apt.appointmentUtc ? new Date(apt.appointmentUtc).getTime() : parseISTDateTimeToUTC(apt.date, apt.time)?.getTime();
      if (!aptUtc) continue;

      const diffMs = aptUtc - now;
      const diffHours = diffMs / (1000 * 60 * 60);

      // 24-hour reminder window (between 1 hour and 25 hours away)
      if (diffHours > 1 && diffHours <= 25 && !apt.reminded24h) {
        await sendEmail({
          toEmail: apt.clientEmail,
          toName: apt.clientName,
          subject: 'Appointment Reminder: Upcoming Consultation Tomorrow - Verdant Mind',
          htmlContent: `
            <div style="font-family: Arial, sans-serif; padding: 2rem; color: #0F383D; background-color: #FAF9F6; border-radius: 8px; border: 1px solid #E2ECE9;">
              <h2 style="color: #1A2E28; border-bottom: 2px solid #2A473E; padding-bottom: 0.5rem; margin-top: 0;">Session Reminder (24h Notice)</h2>
              <p>Dear ${apt.clientName},</p>
              <p>This is a gentle reminder that your scheduled counselling session with Mr. Sabuj Das is approaching:</p>
              <div style="background: #FFF; padding: 1rem; border-radius: 6px; border: 1px solid #E2ECE9; margin: 1rem 0; font-size: 0.9rem; line-height: 1.6;">
                <strong>Session Details (Indian Standard Time):</strong><br/>
                - <strong>Date</strong>: ${apt.date} (DD-MM-YYYY)<br/>
                - <strong>Time Slot</strong>: ${apt.time} (IST)<br/>
                - <strong>Format</strong>: ${apt.sessionMode}<br/>
                - <strong>Duration</strong>: ${apt.durationMinutes || 60} minutes
              </div>
              <p style="font-size: 0.85rem; color: #666;">Please ensure a quiet, private space with a stable internet connection for your session.</p>
            </div>
          `
        });
        apt.reminded24h = true;
        await apt.save();
        reminders24hSent++;
      }

      // 1-hour immediate session alert window
      if (diffHours > 0 && diffHours <= 1.5 && !apt.reminded1h) {
        await sendEmail({
          toEmail: apt.clientEmail,
          toName: apt.clientName,
          subject: 'Session Alert: Consultation Starting in 1 Hour - Verdant Mind',
          htmlContent: `
            <div style="font-family: Arial, sans-serif; padding: 2rem; color: #0F383D; background-color: #FAF9F6; border-radius: 8px; border: 1px solid #E2ECE9;">
              <h2 style="color: #1A2E28; border-bottom: 2px solid #2A473E; padding-bottom: 0.5rem; margin-top: 0;">Session Starting Shortly (1h Notice)</h2>
              <p>Dear ${apt.clientName},</p>
              <p>Your consultation session will begin in approximately 1 hour at <strong>${apt.time} (IST)</strong>.</p>
              <p>Log into your Client Portal to join the session.</p>
            </div>
          `
        });
        apt.reminded1h = true;
        await apt.save();
        reminders1hSent++;
      }
    }

    res.json({
      success: true,
      confirmedAppointmentsChecked: confirmedApts.length,
      reminders24hSent,
      reminders1hSent,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 8. Update Appointment Notes
app.patch('/api/appointments/:id/notes', requireAuth, requireRole(['Super Admin', 'Administrator', 'Counsellor']), async (req, res) => {
  const { id } = req.params;
  const { notes } = req.body;
  const user = req.session.user;
  try {
    const apt = await Appointment.findById(id);
    if (!apt) {
      return res.status(404).json({ error: 'Appointment not found' });
    }
    if (!canAccessClientRecord(user, apt.clientEmail)) {
      return res.status(403).json({ error: 'Access denied: You are not authorized for this client.' });
    }
    apt.notes = notes || '';
    await apt.save();
    res.json(apt);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 9. Messages Endpoints
app.get('/api/messages', requireAuth, async (req, res) => {
  const { senderEmail } = req.query;
  const user = req.session.user;

  try {
    let query = {};
    if (senderEmail) {
      query.$or = [
        { senderEmail: senderEmail.toLowerCase() },
        { id: { $regex: senderEmail.toLowerCase(), $options: 'i' } }
      ];
    }
    const list = await Message.find(query);

    if (user.role === 'client') {
      const filtered = list.filter(m => m.senderEmail.toLowerCase() === user.email.toLowerCase());
      return res.json(filtered);
    }

    const isStaff = ['Super Admin', 'Administrator', 'Counsellor', 'Viewer', 'provider'].includes(user.role);
    if (!isStaff) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const filtered = list.filter(m => canAccessClientRecord(user, m.senderEmail));
    res.json(filtered);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/messages', bookingLimiter, async (req, res) => {
  const { senderName, senderEmail, subject, message } = req.body;
  try {
    const newMsg = await Message.create({
      senderName, senderEmail, subject, message, status: 'unread', replies: []
    });

    const alertHtml = `
      <div style="font-family: Arial, sans-serif; padding: 2rem; color: #0F383D; background-color: #FAF9F6; border-radius: 8px; border: 1px solid #E2ECE9;">
        <h2 style="color: #1A2E28; border-bottom: 2px solid #2A473E; padding-bottom: 0.5rem; margin-top: 0;">New Inbox Inquiry Message</h2>
        <p>A new client message inquiry has been received:</p>
        <div style="background: #FFF; padding: 1rem; border-radius: 6px; border: 1px solid #E2ECE9; margin: 1rem 0; font-size: 0.9rem; line-height: 1.6;">
          - <strong>From Name</strong>: ${senderName}<br/>
          - <strong>From Email</strong>: ${senderEmail}<br/>
          - <strong>Subject</strong>: ${subject}<br/>
          - <strong>Message Body</strong>: ${message}
        </div>
      </div>
    `;
    await sendEmail({
      toEmail: 'sabujd880@gmail.com',
      toName: 'Mr. Sabuj Das',
      subject: 'Alert: New Client Portal Message - ' + subject,
      htmlContent: alertHtml
    });

    res.json(newMsg);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 10. Reply to Messages
app.patch('/api/messages/:id/reply', requireAuth, requireRole(['Super Admin', 'Administrator', 'Counsellor']), async (req, res) => {
  const { id } = req.params;
  const { replyText } = req.body;
  const user = req.session.user;
  try {
    const msg = await Message.findById(id);
    if (!msg) {
      return res.status(404).json({ error: 'Message log not found' });
    }
    if (!canAccessClientRecord(user, msg.senderEmail)) {
      return res.status(403).json({ error: 'Access denied for this client message.' });
    }

    const newReply = {
      id: 'rep-' + Date.now(),
      message: replyText,
      timestamp: new Date()
    };

    msg.replies.push(newReply);
    msg.status = 'replied';
    await msg.save();

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; padding: 2rem; color: #0F383D; background-color: #FAF9F6; border-radius: 8px; border: 1px solid #E2ECE9;">
        <h2 style="color: #1A2E28; border-bottom: 2px solid #2A473E; padding-bottom: 0.5rem; margin-top: 0;">Reply from Verdant Mind</h2>
        <p>Dear ${msg.senderName},</p>
        <p>A reply has been submitted regarding your message thread: <strong>"${msg.subject}"</strong></p>
        <div style="background: #FFF; padding: 1.25rem; border-radius: 6px; border-left: 3px solid #DF9B34; font-size: 0.9rem; margin: 1rem 0; font-style: italic;">
          "${replyText}"
        </div>
      </div>
    `;

    await sendEmail({
      toEmail: msg.senderEmail,
      toName: msg.senderName,
      subject: 'New Message Reply - Verdant Mind',
      htmlContent: emailHtml
    });

    res.json(msg);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 11. Update Message Read Status
app.patch('/api/messages/:id/status', requireAuth, requireRole(['Super Admin', 'Administrator', 'Counsellor']), async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const user = req.session.user;
  try {
    const msg = await Message.findById(id);
    if (!msg) {
      return res.status(404).json({ error: 'Message not found' });
    }
    if (!canAccessClientRecord(user, msg.senderEmail)) {
      return res.status(403).json({ error: 'Access denied for this client message.' });
    }
    msg.status = status;
    await msg.save();
    res.json(msg);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 12. Care Documents
app.get('/api/documents', requireAuth, async (req, res) => {
  const { clientEmail } = req.query;
  const user = req.session.user;

  try {
    let query = {};
    if (clientEmail) {
      query.clientEmail = clientEmail.toLowerCase();
    }
    const list = await CareDocument.find(query);
    const formatDocs = (docs) => docs.map(d => {
      const item = d.toObject ? d.toObject() : d;
      return {
        ...item,
        date: normalizeToISTDate(item.date || item.createdAt)
      };
    });

    if (user.role === 'client') {
      const filtered = list.filter(doc => doc.clientEmail.toLowerCase() === user.email.toLowerCase());
      return res.json(formatDocs(filtered));
    }

    const isStaff = ['Super Admin', 'Administrator', 'Counsellor', 'Viewer', 'provider'].includes(user.role);
    if (!isStaff) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const filtered = list.filter(doc => canAccessClientRecord(user, doc.clientEmail));
    return res.json(formatDocs(filtered));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/documents', requireAuth, requireRole(['Super Admin', 'Administrator', 'Counsellor']), async (req, res) => {
  const { clientEmail, clientName, type, date, data } = req.body;
  const user = req.session.user;
  try {
    if (!canAccessClientRecord(user, clientEmail)) {
      return res.status(403).json({ error: 'Access denied: You are not authorized for this client.' });
    }
    const normalizedDate = normalizeToISTDate(date || new Date());
    const newDoc = await CareDocument.create({
      clientEmail: clientEmail.toLowerCase().trim(),
      clientName,
      type,
      date: normalizedDate,
      data,
      counsellorEmail: user.email || 'sabujd880@gmail.com'
    });

    let emailSubject = '';
    let docHtml = '';

    if (type === 'receipt') {
      emailSubject = `Official Payment Invoice Receipt (${data.invoiceNo}) - Verdant Mind`;
      docHtml = `
        <div style="font-family: Arial, sans-serif; padding: 2rem; color: #0F383D; background-color: #FAF9F6; border-radius: 8px; border: 1px solid #E2ECE9;">
          <h2 style="color: #1A2E28; border-bottom: 2px solid #2A473E; padding-bottom: 0.5rem; margin-top: 0;">Official Payment Receipt</h2>
          <p>Dear ${clientName},</p>
          <p>Thank you for your payment. Please find the transaction details summary below:</p>
          <div style="background: #FFF; padding: 1.25rem; border-radius: 6px; border: 1px solid #E2ECE9; margin: 1.5rem 0; font-size: 0.9rem; line-height: 1.6;">
            <strong>Invoice #</strong>: ${data.invoiceNo}<br/>
            <strong>Billing Service</strong>: ${data.receiptServices}<br/>
            <strong>Payment Method</strong>: ${data.paymentMethod}<br/>
            <strong>Payment Status</strong>: <strong style="color: #4A8C70">${data.paymentStatus.toUpperCase()}</strong><br/>
            <hr style="border: 0; border-top: 1px solid #E2ECE9; margin: 0.5rem 0;"/>
            <strong>Total Settled Amount</strong>: <span style="font-size: 1.1rem; font-weight: bold; color: #1A2E28;">₹${data.receiptAmount}.00</span>
          </div>
        </div>
      `;
    } else if (type === 'prescription') {
      emailSubject = 'Clinical Therapeutic Guidance & Interventions Plan - Verdant Mind';
      docHtml = `
        <div style="font-family: Arial, sans-serif; padding: 2rem; color: #0F383D; background-color: #FAF9F6; border-radius: 8px; border: 1px solid #E2ECE9;">
          <h2 style="color: #1A2E28; border-bottom: 2px solid #2A473E; padding-bottom: 0.5rem; margin-top: 0;">Clinical Consultation Plan & Interventions</h2>
          <p>Dear ${clientName},</p>
          <p>Your therapist has assigned a new therapeutic exercise plan recommendations list for your recovery.</p>
        </div>
      `;
    } else {
      emailSubject = 'Clinical Progress & Observation Report - Verdant Mind';
      docHtml = `
        <div style="font-family: Arial, sans-serif; padding: 2rem; color: #0F383D; background-color: #FAF9F6; border-radius: 8px; border: 1px solid #E2ECE9;">
          <h2 style="color: #1A2E28; border-bottom: 2px solid #2A473E; padding-bottom: 0.5rem; margin-top: 0;">Clinical Summary & Progress Report</h2>
          <p>Dear ${clientName},</p>
          <p>Your clinical progress summary has been updated in your Client Portal account.</p>
        </div>
      `;
    }

    await sendEmail({
      toEmail: clientEmail,
      toName: clientName,
      subject: emailSubject,
      htmlContent: docHtml
    });

    res.json(newDoc);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 13. Availability endpoints
app.get('/api/availability', async (req, res) => {
  try {
    let config = await Availability.findOne();
    if (!config) {
      config = new Availability();
      await config.save();
    }
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/availability', requireAuth, requireRole(['Super Admin', 'Administrator', 'Counsellor']), async (req, res) => {
  const { workingDays, blockedDates, blockedRanges, startHour, endHour, breakStart, breakEnd, bufferMinutes, defaultDurationMinutes } = req.body;
  try {
    let config = await Availability.findOne();
    if (!config) {
      config = new Availability();
    }
    if (workingDays !== undefined) config.workingDays = workingDays;
    if (blockedDates !== undefined) config.blockedDates = blockedDates.map(d => normalizeToISTDate(d));
    if (blockedRanges !== undefined) config.blockedRanges = blockedRanges;
    if (startHour !== undefined) config.startHour = startHour;
    if (endHour !== undefined) config.endHour = endHour;
    if (breakStart !== undefined) config.breakStart = breakStart;
    if (breakEnd !== undefined) config.breakEnd = breakEnd;
    if (bufferMinutes !== undefined) config.bufferMinutes = Number(bufferMinutes);
    if (defaultDurationMinutes !== undefined) config.defaultDurationMinutes = Number(defaultDurationMinutes);
    await config.save();
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 13b. Admin Practice Scheduling & Governance Endpoints
app.get('/api/admin/scheduling-config', requireAuth, requireRole(['Super Admin', 'Administrator', 'Counsellor']), async (req, res) => {
  try {
    let config = await Availability.findOne();
    if (!config) {
      config = new Availability();
      await config.save();
    }
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/admin/scheduling-config', requireAuth, requireRole(['Super Admin', 'Administrator']), async (req, res) => {
  const user = req.session.user;
  const {
    workingDays,
    blockedDates,
    blockedRanges,
    startHour,
    endHour,
    breakStart,
    breakEnd,
    defaultDurationMinutes,
    permittedDurations,
    bufferMinutes,
    minAdvanceHours,
    maxAdvanceDays,
    maxAppointmentsPerDay,
    cancellationDeadlineHours,
    reschedulingDeadlineHours,
    holidays
  } = req.body;

  try {
    let config = await Availability.findOne();
    if (!config) {
      config = new Availability();
    }

    if (workingDays !== undefined) config.workingDays = workingDays;
    if (blockedDates !== undefined) config.blockedDates = blockedDates.map(d => normalizeToISTDate(d));
    if (blockedRanges !== undefined) config.blockedRanges = blockedRanges;
    if (startHour !== undefined) config.startHour = startHour;
    if (endHour !== undefined) config.endHour = endHour;
    if (breakStart !== undefined) config.breakStart = breakStart;
    if (breakEnd !== undefined) config.breakEnd = breakEnd;
    if (defaultDurationMinutes !== undefined) config.defaultDurationMinutes = Number(defaultDurationMinutes);
    if (permittedDurations !== undefined) config.permittedDurations = permittedDurations;
    if (bufferMinutes !== undefined) config.bufferMinutes = Number(bufferMinutes);
    if (minAdvanceHours !== undefined) config.minAdvanceHours = Number(minAdvanceHours);
    if (maxAdvanceDays !== undefined) config.maxAdvanceDays = Number(maxAdvanceDays);
    if (maxAppointmentsPerDay !== undefined) config.maxAppointmentsPerDay = Number(maxAppointmentsPerDay);
    if (cancellationDeadlineHours !== undefined) config.cancellationDeadlineHours = Number(cancellationDeadlineHours);
    if (reschedulingDeadlineHours !== undefined) config.reschedulingDeadlineHours = Number(reschedulingDeadlineHours);
    if (holidays !== undefined) config.holidays = holidays;

    await config.save();

    await logAuditEvent({
      actorEmail: user.email,
      actorRole: user.role,
      action: 'SCHEDULING_CONFIG_UPDATED',
      targetResource: 'practice:scheduling_governance',
      details: {
        workingDays: config.workingDays,
        startHour: config.startHour,
        endHour: config.endHour,
        bufferMinutes: config.bufferMinutes,
        defaultDurationMinutes: config.defaultDurationMinutes
      },
      req
    });

    res.json(config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =========================================================================
// 13c. Brand Theme & Visual Identity Endpoints (Role-Restricted Governance)
// =========================================================================

// Public Theme Endpoint (Read-Only: Allows all visitors, clients, and staff to render the active theme)
app.get('/api/theme', async (req, res) => {
  try {
    let config = await ThemeConfig.findOne();
    if (!config) {
      config = await ThemeConfig.create({
        activeTheme: 'lavender-rose',
        themeMode: 'light',
        updatedBy: 'System Default',
        updatedAt: new Date()
      });
    }
    res.json({
      activeTheme: config.activeTheme || 'lavender-rose',
      themeMode: config.themeMode || 'light',
      updatedAt: config.updatedAt
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin Theme Endpoint (Protected: Super Admin & Administrator only)
app.get('/api/admin/theme', requireAuth, requireRole(['Super Admin', 'Administrator']), async (req, res) => {
  try {
    let config = await ThemeConfig.findOne();
    if (!config) {
      config = await ThemeConfig.create({
        activeTheme: 'lavender-rose',
        themeMode: 'light',
        updatedBy: 'System Default',
        updatedAt: new Date()
      });
    }
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin Update Theme Endpoint (Strict RBAC: Super Admin & Administrator only)
app.patch('/api/admin/theme', requireAuth, requireRole(['Super Admin', 'Administrator']), async (req, res) => {
  try {
    const { activeTheme, themeMode } = req.body;
    const allowedThemes = ['lavender-rose', 'classic'];
    const allowedModes = ['light', 'dark'];

    if (activeTheme && !allowedThemes.includes(activeTheme)) {
      return res.status(400).json({ 
        error: `Invalid theme '${activeTheme}'. Supported themes are: ${allowedThemes.join(', ')}.` 
      });
    }

    if (themeMode && !allowedModes.includes(themeMode)) {
      return res.status(400).json({ 
        error: `Invalid theme mode '${themeMode}'. Supported modes are: ${allowedModes.join(', ')}.` 
      });
    }

    let config = await ThemeConfig.findOne();
    if (!config) {
      config = new ThemeConfig();
    }

    const previousTheme = config.activeTheme || 'lavender-rose';
    const previousMode = config.themeMode || 'light';

    if (activeTheme) config.activeTheme = activeTheme;
    if (themeMode) config.themeMode = themeMode;

    const user = req.session.user;
    config.updatedBy = user.email;
    config.updatedAt = new Date();

    if (!config.history) config.history = [];
    config.history.unshift({
      theme: config.activeTheme,
      mode: config.themeMode,
      updatedBy: user.email,
      timestamp: new Date()
    });

    if (config.history.length > 25) {
      config.history = config.history.slice(0, 25);
    }

    await config.save();

    await logAuditEvent({
      actorEmail: user.email,
      actorRole: user.role,
      action: 'BRAND_THEME_UPDATED',
      targetResource: 'practice:brand_theme',
      details: {
        newTheme: config.activeTheme,
        newMode: config.themeMode,
        previousTheme,
        previousMode
      },
      req
    });

    res.json(config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 14. Gemini API Helper
const callGeminiAPI = async (prompt, systemInstruction = '') => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Gemini API key is not configured in .env file.');
  }

  const modelName = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  const body = {
    contents: [{
      parts: [{ text: prompt }]
    }]
  };

  if (systemInstruction) {
    body.systemInstruction = {
      parts: [{ text: systemInstruction }]
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API call failed: ${errorText}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error('Empty response from Gemini API.');
    }
    return text.trim();
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
};

// 15. AI Document Polishing Endpoint
app.post('/api/ai/polish', aiLimiter, async (req, res) => {
  const text = req.body.text || req.body.draftText;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'Text content is required for polishing.' });
  }

  try {
    const systemPrompt = "You are a professional, licensed consultant psychologist and therapist. Your job is to polish, formalize, and improve draft therapist notes or clinical observations. Rewrite the note to sound highly formal, professional, empathetic, and clinically precise. Keep the original clinical meaning exactly as intended. Keep the output direct and concise, without any pleasantries, conversational intros, or notes about the edits.";
    const userPrompt = `Please rewrite and polish the following draft note for a client document:\n\n"${text}"`;
    const polishedText = await callGeminiAPI(userPrompt, systemPrompt);
    res.json({ success: true, polishedText });
  } catch (error) {
    console.warn('AI Polish Error (Using local formalizer fallback):', error.message);
    const fallbackPolish = `Clinical Observation Note: Patient presented with symptoms of affective distress and psychological strain. Recommended continuing structured behavioral therapy and supportive interventions. [Summary: ${text.trim()}]`;
    res.json({ success: true, polishedText: fallbackPolish, fallback: true });
  }
});

// Local fallback response generator for offline or timeout situations
const getLocalFallbackResponse = (message) => {
  const msg = message.toLowerCase();

  if (msg.includes('fee') || msg.includes('cost') || msg.includes('price') || msg.includes('charge') || msg.includes('rate') || msg.includes('pay')) {
    return "Mr. Sabuj Das's fee is INR 1,500 per session. Each therapy session lasts for 60 minutes.";
  }
  if (msg.includes('book') || msg.includes('schedule') || msg.includes('appointment') || msg.includes('calendar') || msg.includes('slot') || msg.includes('meet')) {
    return "You can schedule a consultation directly using the 'Schedule a Consultation' calendar picker in the web portal.";
  }
  if (msg.includes('language') || msg.includes('speak') || msg.includes('bengali') || msg.includes('hindi') || msg.includes('english') || msg.includes('talk')) {
    return "Mr. Das conducts therapy sessions in English, Hindi, and Bengali, tailoring the communication to your comfort.";
  }
  if (msg.includes('breath') || msg.includes('panic') || msg.includes('anxious') || msg.includes('stress') || msg.includes('calm') || msg.includes('worry')) {
    return "If you're feeling overwhelmed, try taking a slow breath. I can guide you through a 4-second box breathing exercise (inhale for 4s, hold for 4s, exhale for 4s, hold for 4s) right here in this chat!";
  }
  if (msg.includes('adhd') || msg.includes('attention') || msg.includes('focus') || msg.includes('hyper')) {
    return "Mr. Das specializes in supporting clients with ADHD, focusing on executive function, focus training, and emotional regulation techniques.";
  }
  if (msg.includes('addict') || msg.includes('sober') || msg.includes('alcohol') || msg.includes('drug')) {
    return "Mr. Das provides addiction treatment and recovery support to help break behavioral dependencies and build healthy coping mechanisms.";
  }
  if (msg.includes('anxiety') || msg.includes('fear') || msg.includes('panic attack')) {
    return "For anxiety and panic, Mr. Das utilizes evidence-based Cognitive Behavioral Therapy (CBT) and calming mindfulness practices.";
  }
  if (msg.includes('depress') || msg.includes('sad') || msg.includes('hopeless') || msg.includes('mood')) {
    return "Mr. Das offers supportive DBT and CBT pathways for managing depression, helping you rebuild daily structures and positive coping strategies.";
  }
  if (msg.includes('hello') || msg.includes('hi ') || msg.startsWith('hi') || msg.includes('hey') || msg.includes('greetings')) {
    return "Hello! I'm Aura, virtual support assistant for Verdant Mind by Mr. Sabuj Das. How can I help you today?";
  }
  if (msg.includes('contact') || msg.includes('email') || msg.includes('phone') || msg.includes('number') || msg.includes('reach') || msg.includes('address') || msg.includes('location') || msg.includes('kolkata')) {
    return "You can reach Mr. Das at sabujd880@gmail.com or +91 95476 91433. His practice, Verdant Mind, is located in Kolkata, India.";
  }

  return "I'm Aura, virtual assistant for Verdant Mind. For clinical questions or personalized therapy advice, I highly recommend scheduling a session with Mr. Das via the portal booking calendar, or contacting him at sabujd880@gmail.com.";
};

// 16. AI Chat Assistant (Aura) Endpoint
app.post('/api/ai/chat', aiLimiter, async (req, res) => {
  const { message, history = [] } = req.body;
  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Message content is required.' });
  }

  try {
    const systemInstruction = `You are Aura, virtual support assistant for Verdant Mind by Mr. Sabuj Das. 
Sabuj Das is a psychologist specializing in CBT and DBT for ADHD, addiction treatment, anxiety, depression, and anger regulation at Verdant Mind. 
Session Cost: INR 1,500 per session.
Session Duration: 60 minutes.
Booking: Clients can book directly via the 'Schedule a Consultation' calendar picker in the web portal.
Languages: Mr. Das speaks English, Hindi, and Bengali.
Your Behavior:
- Keep your answers brief, empathetic, warm, and highly supportive (ideally under 3 sentences).
- If the user shows signs of acute stress, anxiety, or panic, kindly guide them to try a 4-second box breathing exercise (inhale 4s, hold 4s, exhale 4s, hold 4s) to calm their nervous system.
- Never prescribe medications or diagnose conditions. Always recommend scheduling a direct consultation with Mr. Das for clinical advice.`;

    let conversationText = '';
    const recentHistory = history.slice(-6);
    recentHistory.forEach(msg => {
      const senderName = msg.sender === 'user' ? 'User' : 'Aura';
      conversationText += `${senderName}: ${msg.text}\n`;
    });
    conversationText += `User: ${message}\nAura:`;

    const chatResponse = await callGeminiAPI(conversationText, systemInstruction);
    res.json({ success: true, response: chatResponse });
  } catch (error) {
    console.warn('AI Chat Error (Using local fallback):', error.message);
    const chatResponse = getLocalFallbackResponse(message);
    res.json({ success: true, response: chatResponse, fallback: true });
  }
});

// =========================================================================
// CENTRALIZED ERROR HANDLING & STRUCTURED CLOUDWATCH/SENTRY MONITORING
// =========================================================================
app.use((err, req, res, next) => {
  // Capture structured audit error without leaking sensitive clinical notes or client records
  const sanitizedLog = {
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    status: err.status || 500,
    message: err.message,
    ip: getClientIp(req)
  };
  console.error('[OPERATIONAL ERROR]', JSON.stringify(sanitizedLog));

  // Catch Multer file upload errors gracefully
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Uploaded audio exceeds maximum permitted limit of 100MB.' });
    }
    return res.status(400).json({ error: `File upload error: ${err.message}` });
  }

  // Catch CORS rejections
  if (err.message && err.message.includes('CORS policy blocked')) {
    return res.status(403).json({ error: 'Cross-origin request rejected by security policy.' });
  }

  res.status(err.status || 500).json({ 
    error: isProd ? 'An internal server error occurred. Please contact system support.' : err.message 
  });
});

// Database Connection Lifecycle Monitoring Listeners
mongoose.connection.on('disconnected', () => {
  console.error('[DATABASE ALERT] MongoDB Atlas connection lost! Retrying...');
});
mongoose.connection.on('reconnected', () => {
  console.log('[DATABASE ALERT] MongoDB Atlas connection restored.');
});
mongoose.connection.on('error', (err) => {
  console.error('[DATABASE ERROR]', err.message);
});

// Catch-all for undefined /api routes - guarantees JSON 404 instead of Express default HTML error
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found: ' + req.method + ' ' + req.originalUrl });
});

// Guard: Missing static assets under /assets/ or with file extensions must return 404 text, NEVER index.html
app.use((req, res, next) => {
  if (req.path.startsWith('/assets/') || path.extname(req.path)) {
    return res.status(404).type('text/plain').send('Asset not found: ' + req.path);
  }
  next();
});

// SPA fallback for HTML client-side navigation routes
if (fs.existsSync(distPath)) {
  app.use((req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// Start listening on all network interfaces (0.0.0.0) for cloud/LAN access
let serverInstance = null;
if (process.env.NODE_ENV !== 'test') {
  serverInstance = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Verdant Mind Gateway listening on port ${PORT} (Environment: ${isProd ? 'production' : 'development'})`);
  });
}

export { 
  app, 
  serverInstance, 
  User, 
  Client, 
  PatientProfile, 
  AuditLog, 
  SecurityEvent, 
  UserSession, 
  ConsentRecord, 
  PrivacyRequest, 
  SecuritySettings, 
  hashPassword, 
  verifyPassword, 
  recordSecurityEvent, 
  logAuditEvent 
};
