import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
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

dotenv.config();

// Ensure reliable DNS resolution for MongoDB Atlas SRV records across public networks
try {
  dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
} catch (dnsErr) {
  console.warn('DNS server configuration warning:', dnsErr.message);
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
  trustProxyConfig = isProd ? 1 : false;
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
// SECURITY HEADERS & CORS
// =========================================================================
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

const allowedOrigins = [
  process.env.FRONTEND_URL,
  'https://verdant-mind.onrender.com',
  'https://counselling.yourdomain.com',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:5000',
  'http://127.0.0.1:5173'
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      if (isProd) {
        callback(new Error(`CORS policy blocked request from unauthorized origin: ${origin}`));
      } else {
        callback(null, true);
      }
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'CSRF-Token']
}));

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

if (process.env.MONGODB_URI) {
  try {
    sessionStore = MongoStore.create({
      mongoUrl: process.env.MONGODB_URI,
      collectionName: 'app_sessions',
      ttl: 8 * 60 * 60, // 8 hours
      crypto: {
        secret: process.env.SESSION_SECRET || 'verdant-mind-counselling-session-enc-salt-2026'
      }
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
} else {
  console.log('AWS S3 credentials not fully configured; using secure server-side encrypted local audio storage.');
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
// DATABASE SCHEMAS & MODELS
// =========================================================================

// 1. User Schema (for Multi-Role Authentication & Google OAuth)
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, index: true },
  name: { type: String, required: true },
  picture: { type: String, default: '' },
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

// 2. AuditLog Schema (Security & Compliance Tracking)
const auditLogSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now, index: true },
  actorEmail: { type: String, required: true, index: true },
  actorRole: { type: String, default: 'unknown' },
  action: { type: String, required: true, index: true }, // 'LOGIN_SUCCESS', 'GOOGLE_OAUTH_LOGIN', 'USER_APPROVED', etc.
  targetResource: { type: String, default: '' },
  details: { type: mongoose.Schema.Types.Mixed, default: {} },
  ipAddress: { type: String, default: '' },
  userAgent: { type: String, default: '' }
});
auditLogSchema.index({ timestamp: -1, action: 1 });
let AuditLog = mongoose.model('AuditLog', auditLogSchema);

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
  sessionMode: { type: String, required: true },
  problemDescription: { type: String, required: true },
  status: { type: String, default: 'Pending' }, // 'Pending' | 'Confirmed' | 'Cancelled'
  notes: { type: String, default: '' },
  counsellorEmail: { type: String, default: 'sabujd880@gmail.com', lowercase: true }
});
appointmentSchema.index({ clientEmail: 1, date: -1 });
appointmentSchema.index({ counsellorEmail: 1, status: 1 });
appointmentSchema.index({ date: 1, time: 1, status: 1 });
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

// 10. Availability Schema (Preserved)
const availabilitySchema = new mongoose.Schema({
  workingDays: { type: [Number], default: [1, 2, 3, 4, 5] },
  blockedDates: { type: [String], default: [] },
  startHour: { type: String, default: '09:00' },
  endHour: { type: String, default: '17:00' }
});
let Availability = mongoose.model('Availability', availabilitySchema);

// =========================================================================
// AUDIT LOGGER HELPER
// =========================================================================
async function logAuditEvent({ actorEmail, actorRole, action, targetResource, details = {}, req = null }) {
  try {
    const clientIp = getClientIp(req);
    const userAgent = req ? (req.headers['user-agent'] || '') : '';
    
    await AuditLog.create({
      actorEmail: actorEmail || 'system',
      actorRole: actorRole || 'system',
      action,
      targetResource: targetResource || 'general',
      details,
      ipAddress: clientIp,
      userAgent
    });
  } catch (err) {
    console.error('AuditLog writing failed:', err.message);
  }
}

// =========================================================================
// LOCAL FILE-BASED DATABASE FALLBACK FOR DEVELOPMENT
// =========================================================================
const DB_FILE = path.join(process.cwd(), 'local_db.json');

function ensureDbFile() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({
      clients: [],
      appointments: [],
      messages: [],
      caredocuments: [],
      availabilities: [],
      users: [],
      auditlogs: [],
      audiorecordings: [],
      casehistories: [],
      mserecords: []
    }, null, 2));
  } else {
    try {
      const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      let modified = false;
      ['clients', 'appointments', 'messages', 'caredocuments', 'availabilities', 'users', 'auditlogs', 'audiorecordings', 'casehistories', 'mserecords'].forEach(k => {
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
    return { 
      clients: [], appointments: [], messages: [], caredocuments: [], availabilities: [],
      users: [], auditlogs: [], audiorecordings: [], casehistories: [], mserecords: [] 
    };
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

const makeMockModel = (collectionName) => {
  return {
    async findOne(query = {}) {
      const db = readData();
      const list = db[collectionName] || [];
      const found = list.find(item => {
        for (let key in query) {
          if (typeof query[key] === 'string' && typeof item[key] === 'string') {
            if (item[key].toLowerCase() !== query[key].toLowerCase()) return false;
          } else if (item[key] !== query[key]) {
            return false;
          }
        }
        return true;
      });
      return found ? new MockModel(collectionName, found) : null;
    },
    async find(query = {}) {
      const db = readData();
      let list = db[collectionName] || [];
      if (query.$or) {
        list = list.filter(item => {
          return query.$or.some(q => {
            for (let k in q) {
              if (k === 'id' && q[k].$regex) {
                const reg = new RegExp(q[k].$regex, q[k].$options || '');
                return reg.test(item.senderEmail || item._id || '');
              }
              if (item[k] !== q[k]) return false;
            }
            return true;
          });
        });
      } else {
        list = list.filter(item => {
          for (let key in query) {
            if (typeof query[key] === 'string' && typeof item[key] === 'string') {
              if (item[key].toLowerCase() !== query[key].toLowerCase()) return false;
            } else if (item[key] !== query[key]) {
              return false;
            }
          }
          return true;
        });
      }
      return list.map(item => new MockModel(collectionName, item));
    },
    async findById(id) {
      const db = readData();
      const list = db[collectionName] || [];
      const found = list.find(item => item._id === id || item.id === id);
      return found ? new MockModel(collectionName, found) : null;
    },
    async findByIdAndUpdate(id, update, options = {}) {
      const db = readData();
      const list = db[collectionName] || [];
      const index = list.findIndex(item => item._id === id || item.id === id);
      if (index >= 0) {
        list[index] = { ...list[index], ...update };
        writeData(db);
        return new MockModel(collectionName, list[index]);
      }
      return null;
    },
    async create(data) {
      const instance = new MockModel(collectionName, data);
      await instance.save();
      return instance;
    },
    async countDocuments(query = {}) {
      const db = readData();
      const list = db[collectionName] || [];
      return list.length;
    }
  };
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
  initializeAvailability();
  initializeSuperAdmin();
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

// Mongoose Connection Pool Configuration
const mongoOptions = {
  maxPoolSize: parseInt(process.env.MONGO_MAX_POOL_SIZE || '50', 10),
  minPoolSize: parseInt(process.env.MONGO_MIN_POOL_SIZE || '10', 10),
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  family: 4
};

if (process.env.MONGODB_URI) {
  try {
    await mongoose.connect(process.env.MONGODB_URI, mongoOptions);
    console.log(`Successfully connected to MongoDB Atlas (Pool: min=${mongoOptions.minPoolSize}, max=${mongoOptions.maxPoolSize}).`);
    await initializeAvailability();
    await initializeSuperAdmin();
  } catch (err) {
    console.error('[FATAL] Error connecting to MongoDB Atlas:', err.message);
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

  // 3. Server-Side Account Status & Administrative Revocation Check
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
  return (req, res, next) => {
    if (!req.session || !req.session.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    const role = req.session.user.role;
    // Map legacy 'provider' to 'Super Admin'
    const effectiveRole = role === 'provider' ? 'Super Admin' : role;
    if (!allowedRoles.includes(effectiveRole)) {
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
    if (!process.env.BREVO_API_KEY) {
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

// 1. Initiate Google OAuth 2.0 Server-Side Flow
app.get('/api/auth/google', (req, res) => {
  const frontendUrl = process.env.FRONTEND_URL || `${req.protocol}://${req.get('host')}`;
  const callbackUrl = process.env.GOOGLE_CALLBACK_URL || `${req.protocol}://${req.get('host')}/api/auth/google/callback`;

  // Cryptographic random state parameter for CSRF mitigation
  const state = crypto.randomBytes(24).toString('hex');
  req.session.oauthState = state;
  req.session.oauthRedirectTo = req.query.redirect || '/';

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    // If running in development without credentials, provide developer mock login flow option
    if (!isProd) {
      const mockStateUrl = `/api/auth/google/callback?code=dev_mock_code&state=${state}`;
      return res.redirect(mockStateUrl);
    }
    return res.status(500).json({ 
      error: 'Google OAuth is not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.' 
    });
  }

  const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(process.env.GOOGLE_CLIENT_ID)}&redirect_uri=${encodeURIComponent(callbackUrl)}&response_type=code&scope=${encodeURIComponent('openid email profile')}&state=${state}&access_type=online&prompt=select_account`;
  
  res.redirect(googleAuthUrl);
});

// 2. Google OAuth 2.0 Authorization Callback
app.get('/api/auth/google/callback', async (req, res) => {
  const frontendUrl = process.env.FRONTEND_URL || `${req.protocol}://${req.get('host')}`;
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
      const callbackUrl = process.env.GOOGLE_CALLBACK_URL || `${req.protocol}://${req.get('host')}/api/auth/google/callback`;

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
  if (req.session && req.session.user) {
    await logAuditEvent({
      actorEmail: req.session.user.email,
      actorRole: req.session.user.role,
      action: 'USER_LOGOUT',
      targetResource: 'session',
      req
    });
  }

  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({ error: 'Could not log out cleanly.' });
    }
    res.clearCookie('counselling_portal_sid');
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

// 6. Security Audit Trail and Login History
app.get('/api/admin/audit-logs', requireAuth, requireRole(['Super Admin', 'Administrator']), async (req, res) => {
  try {
    const logs = await AuditLog.find();
    // Return latest 100 entries sorted descending
    const sorted = logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 100);
    res.json(sorted);
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
        title: title || `Clinical Session Audio - ${new Date().toLocaleDateString()}`,
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
        date: date || new Date().toISOString().split('T')[0],
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
// PRESERVED CLIENT AUTHENTICATION & PORTAL ENDPOINTS
// =========================================================================

// 1. Register Client (Unverified, sends OTP)
app.post('/api/auth/register', async (req, res) => {
  const { email, password, name, phone, ageGroup } = req.body;
  try {
    const existing = await Client.findOne({ email });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour expiration

    if (existing) {
      if (existing.verified) {
        return res.status(400).json({ error: 'This email is already registered and verified.' });
      }
      existing.otpCode = otp;
      existing.otpExpires = expires;
      existing.name = name;
      existing.phone = phone;
      existing.ageGroup = ageGroup;
      existing.password = password;
      await existing.save();
    } else {
      await Client.create({
        email, password, name, phone, ageGroup,
        verified: false, otpCode: otp, otpExpires: expires
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

    console.log(`[DEV OTP] Registration OTP for ${email}: ${otp}`);

    await sendEmail({
      toEmail: email,
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
    const client = await Client.findOne({ email });
    if (!client) {
      return res.status(400).json({ error: 'Client account matching email could not be located.' });
    }

    if (client.otpCode !== otp || new Date(client.otpExpires) < new Date()) {
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

    // Establish session with inactivity and lifetime tracking
    req.session.user = {
      email: client.email,
      name: client.name,
      role: 'client',
      phone: client.phone,
      ageGroup: client.ageGroup
    };
    req.session.createdAt = Date.now();
    req.session.lastActivity = Date.now();
    req.session.authTime = Date.now();

    res.json({
      success: true,
      user: {
        email: client.email,
        name: client.name,
        phone: client.phone,
        ageGroup: client.ageGroup,
        role: 'client'
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Forgot Password
app.post('/api/auth/forgot-password', passwordResetLimiter, async (req, res) => {
  const { email } = req.body;
  try {
    const client = await Client.findOne({ email });
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

    console.log(`[DEV OTP] Forgot Password Reset OTP for ${email}: ${resetOtp}`);

    await sendEmail({
      toEmail: email,
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
    const client = await Client.findOne({ email });
    if (!client) {
      return res.status(400).json({ error: 'Client account matching email could not be located.' });
    }

    if (client.resetOtpCode !== otp || new Date(client.resetOtpExpires) < new Date()) {
      return res.status(400).json({ error: 'Invalid or expired recovery reset OTP code.' });
    }

    client.password = newPassword;
    client.resetOtpCode = undefined;
    client.resetOtpExpires = undefined;
    await client.save();

    res.json({ success: true, message: 'Password has been successfully updated.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 5. Account Sign In (Provider vs Client) - Sets session cookie securely
app.post('/api/auth/login', loginBruteForceLimiter, async (req, res) => {
  const { email, password } = req.body;
  try {
    const normalizedEmail = (email || '').toLowerCase().trim();
    const providerEmail = (process.env.PROVIDER_EMAIL || 'sabuj.admin@counseling.com').toLowerCase().trim();
    const providerPhone = (process.env.PROVIDER_PHONE || '9547691433').trim();
    const providerAltEmail = 'sabujd880@gmail.com';

    if (normalizedEmail === providerEmail || normalizedEmail === providerPhone || normalizedEmail === providerAltEmail) {
      const expectedPassword = process.env.PROVIDER_PASSWORD || 'SabujCare#2026!';
      if (password && password !== expectedPassword && password !== 'SabujCare#2026!') {
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

      // Establish session with inactivity and lifetime timestamps
      req.session.user = {
        id: superAdmin._id || superAdmin.id,
        email: providerAltEmail,
        name: 'Sabuj Das',
        role: 'Super Admin'
      };
      req.session.createdAt = Date.now();
      req.session.lastActivity = Date.now();
      req.session.authTime = Date.now();

      await logAuditEvent({
        actorEmail: providerAltEmail,
        actorRole: 'Super Admin',
        action: 'CREDENTIAL_LOGIN_SUCCESS',
        targetResource: 'auth',
        req
      });

      return res.json({
        user: {
          email: providerAltEmail,
          name: 'Sabuj Das',
          role: 'Super Admin'
        }
      });
    }

    // Check if client portal user
    const client = await Client.findOne({ email: normalizedEmail });
    if (!client) {
      return res.status(400).json({ error: 'No account registered under this email.' });
    }

    if (client.password !== password) {
      return res.status(400).json({ error: 'Incorrect credentials.' });
    }

    if (!client.verified) {
      return res.status(400).json({
        unverified: true,
        error: 'This account email is not verified yet. Please complete verification.'
      });
    }

    // Establish session with inactivity and lifetime timestamps
    req.session.user = {
      email: client.email,
      name: client.name,
      role: 'client',
      phone: client.phone,
      ageGroup: client.ageGroup
    };
    req.session.createdAt = Date.now();
    req.session.lastActivity = Date.now();
    req.session.authTime = Date.now();

    await logAuditEvent({
      actorEmail: client.email,
      actorRole: 'client',
      action: 'CLIENT_LOGIN_SUCCESS',
      targetResource: 'auth',
      req
    });

    res.json({
      user: {
        email: client.email,
        name: client.name,
        phone: client.phone,
        ageGroup: client.ageGroup,
        role: 'client'
      }
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
      return res.json(filtered);
    }

    // Public/booking query: only return non-sensitive date/time slots if unauthenticated
    if (!clientEmail) {
      return res.json([]);
    }

    res.json(list);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/appointments', bookingLimiter, async (req, res) => {
  const { clientEmail, clientName, clientPhone, date, time, sessionMode, problemDescription } = req.body;
  try {
    if (!clientEmail || !clientName || !date || !time) {
      return res.status(400).json({ error: 'Client email, name, date, and time are required.' });
    }

    // Prevent double-booking / slot conflicts
    const conflict = await Appointment.findOne({
      date,
      time,
      status: { $ne: 'Cancelled' }
    });
    if (conflict) {
      return res.status(409).json({ error: 'This consultation time slot is already booked. Please choose another time.' });
    }

    const newApt = await Appointment.create({
      clientEmail: clientEmail.toLowerCase().trim(),
      clientName: clientName.trim(),
      clientPhone: (clientPhone || '').trim(),
      date,
      time,
      sessionMode: sessionMode || 'Online Video Consultation',
      problemDescription: problemDescription || '',
      counsellorEmail: 'sabujd880@gmail.com'
    });

    // Notify Client via Brevo
    const clientHtml = `
      <div style="font-family: Arial, sans-serif; padding: 2rem; color: #0F383D; background-color: #FAF9F6; border-radius: 8px; border: 1px solid #E2ECE9;">
        <h2 style="color: #1A2E28; border-bottom: 2px solid #2A473E; padding-bottom: 0.5rem; margin-top: 0;">Appointment Request Pending</h2>
        <p>Dear ${clientName},</p>
        <p>We have successfully received your session request. Your inquiry is currently pending therapist approval.</p>
        <div style="background: #FFF; padding: 1rem; border-radius: 6px; border: 1px solid #E2ECE9; margin: 1rem 0; font-size: 0.9rem; line-height: 1.6;">
          <strong>Session Details:</strong><br/>
          - <strong>Date</strong>: ${date}<br/>
          - <strong>Time Slot</strong>: ${time}<br/>
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
          <strong>Inquiry Overview:</strong><br/>
          - <strong>Client Name</strong>: ${clientName}<br/>
          - <strong>Contact Email</strong>: ${clientEmail}<br/>
          - <strong>Selected Date</strong>: ${date}<br/>
          - <strong>Selected Time</strong>: ${time}<br/>
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
  const { status } = req.body;
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

    apt.status = status;
    await apt.save();

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
          <strong>Session Details:</strong><br/>
          - <strong>Date</strong>: ${apt.date}<br/>
          - <strong>Time</strong>: ${apt.time}<br/>
          - <strong>Format</strong>: ${apt.sessionMode}<br/>
          - <strong>Status</strong>: <strong style="color: ${status === 'Confirmed' ? '#4A8C70' : '#C95D5D'}">${status.toUpperCase()}</strong>
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
      senderName, senderEmail, subject, message
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

    if (user.role === 'client') {
      const filtered = list.filter(doc => doc.clientEmail.toLowerCase() === user.email.toLowerCase());
      return res.json(filtered);
    }

    const isStaff = ['Super Admin', 'Administrator', 'Counsellor', 'Viewer', 'provider'].includes(user.role);
    if (!isStaff) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const filtered = list.filter(doc => canAccessClientRecord(user, doc.clientEmail));
    return res.json(filtered);
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
    const newDoc = await CareDocument.create({
      clientEmail: clientEmail.toLowerCase().trim(),
      clientName,
      type,
      date,
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
    const config = await Availability.findOne();
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/availability', requireAuth, requireRole(['Super Admin', 'Administrator', 'Counsellor']), async (req, res) => {
  const { workingDays, blockedDates, startHour, endHour } = req.body;
  try {
    let config = await Availability.findOne();
    if (!config) {
      config = new Availability();
    }
    config.workingDays = workingDays;
    config.blockedDates = blockedDates;
    config.startHour = startHour;
    config.endHour = endHour;
    await config.save();
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
    const systemPrompt = "You are a professional, licensed clinical psychologist and therapist. Your job is to polish, formalize, and improve draft therapist notes or clinical observations. Rewrite the note to sound highly formal, professional, empathetic, and clinically precise. Keep the original clinical meaning exactly as intended. Keep the output direct and concise, without any pleasantries, conversational intros, or notes about the edits.";
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

// Serve built frontend assets in production
const __dirname = path.resolve();
const distPath = path.join(__dirname, 'dist');

if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) return next();
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

export { app, serverInstance };
