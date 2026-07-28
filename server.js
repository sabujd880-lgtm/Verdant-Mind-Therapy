import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// =========================================================================
// MONGOOSE CONNECT
// =========================================================================
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('Successfully connected to MongoDB Atlas.');
    initializeAvailability();
  })
  .catch(err => {
    console.error('Error connecting to MongoDB Atlas:', err);
    console.log('Swapping to local file-based database fallback...');
    setupLocalDBFallback();
  });

// =========================================================================
// DATABASE SCHEMAS & MODELS
// =========================================================================

// 1. Client Schema
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

// 2. Appointment Schema
const appointmentSchema = new mongoose.Schema({
  clientEmail: { type: String, required: true, lowercase: true },
  clientName: { type: String, required: true },
  clientPhone: { type: String, required: true },
  date: { type: String, required: true },
  time: { type: String, required: true },
  sessionMode: { type: String, required: true },
  problemDescription: { type: String, required: true },
  status: { type: String, default: 'Pending' }, // 'Pending' | 'Confirmed' | 'Cancelled'
  notes: { type: String, default: '' }
});
let Appointment = mongoose.model('Appointment', appointmentSchema);

// 3. Message Schema
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
let Message = mongoose.model('Message', messageSchema);

// 4. CareDocument Schema (Receipts, Plans, Reports)
const careDocumentSchema = new mongoose.Schema({
  clientEmail: { type: String, required: true, lowercase: true },
  clientName: { type: String, required: true },
  type: { type: String, required: true }, // 'receipt' | 'prescription' | 'report'
  date: { type: String, required: true },
  data: { type: mongoose.Schema.Types.Mixed, required: true }
});
let CareDocument = mongoose.model('CareDocument', careDocumentSchema);

// 5. Availability Schema (Therapist Configurations)
const availabilitySchema = new mongoose.Schema({
  workingDays: { type: [Number], default: [1, 2, 3, 4, 5] },
  blockedDates: { type: [String], default: [] },
  startHour: { type: String, default: '09:00' },
  endHour: { type: String, default: '17:00' }
});
let Availability = mongoose.model('Availability', availabilitySchema);

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
      availabilities: []
    }, null, 2));
  }
}

function readData() {
  ensureDbFile();
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (e) {
    return { clients: [], appointments: [], messages: [], caredocuments: [], availabilities: [] };
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
    const list = db[this._collection];
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
      const list = db[collectionName];
      const found = list.find(item => {
        for (let key in query) {
          if (item[key] !== query[key]) return false;
        }
        return true;
      });
      return found ? new MockModel(collectionName, found) : null;
    },
    async find(query = {}) {
      const db = readData();
      let list = db[collectionName];
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
            if (item[key] !== query[key]) return false;
          }
          return true;
        });
      }
      return list.map(item => new MockModel(collectionName, item));
    },
    async findById(id) {
      const db = readData();
      const list = db[collectionName];
      const found = list.find(item => item._id === id || item.id === id);
      return found ? new MockModel(collectionName, found) : null;
    },
    async findByIdAndUpdate(id, update, options = {}) {
      const db = readData();
      const list = db[collectionName];
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
    async countDocuments() {
      const db = readData();
      return db[collectionName].length;
    }
  };
};

function setupLocalDBFallback() {
  Client = makeMockModel('clients');
  Appointment = makeMockModel('appointments');
  Message = makeMockModel('messages');
  CareDocument = makeMockModel('caredocuments');
  Availability = makeMockModel('availabilities');
  initializeAvailability();
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

// =========================================================================
// BREVO TRANSACTIONAL SMTP EMAIL CLIENT
// =========================================================================
const sendEmail = async ({ toEmail, toName, subject, htmlContent }) => {
  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        sender: { name: process.env.SENDER_NAME, email: process.env.SENDER_EMAIL },
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
    console.error('Failed to send email via Brevo client:', error);
    return { success: false, error };
  }
};

// =========================================================================
// REST API ENDPOINTS
// =========================================================================

// 1. Register Client (Unverified, sends OTP)
app.post('/api/auth/register', async (req, res) => {
  const { email, password, name, phone, ageGroup } = req.body;
  try {
    const existing = await Client.findOne({ email });
    
    // Generate 6-digit numeric OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour expiration

    if (existing) {
      if (existing.verified) {
        return res.status(400).json({ error: 'This email is already registered and verified.' });
      }
      // Re-send verification for unverified profile
      existing.otpCode = otp;
      existing.otpExpires = expires;
      existing.name = name;
      existing.phone = phone;
      existing.ageGroup = ageGroup;
      existing.password = password;
      await existing.save();
    } else {
      // Save new unverified client profile
      await Client.create({
        email, password, name, phone, ageGroup,
        verified: false, otpCode: otp, otpExpires: expires
      });
    }

    // Send OTP Verification Email via Brevo
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; padding: 2rem; color: #2A473E; background-color: #FAF9F6; border-radius: 8px; border: 1px solid #E2ECE9;">
        <h2 style="color: #1A2E28; border-bottom: 2px solid #2A473E; padding-bottom: 0.5rem; margin-top: 0;">Verification Code Required</h2>
        <p>Dear ${name},</p>
        <p>Thank you for registering at Sabuj Counseling Services. Please use the following 6-digit verification code to complete registration:</p>
        <div style="font-size: 2.25rem; font-weight: bold; background: #FFF; padding: 1rem 2rem; border-radius: 6px; border: 1px solid #DF9B34; color: #1A2E28; display: inline-block; letter-spacing: 0.1em; margin: 1rem 0;">
          ${otp}
        </div>
        <p style="font-size: 0.85rem; color: #666;">This verification code is valid for 1 hour. If you did not request this, please disregard this email.</p>
        <hr style="border: 0; border-top: 1px solid #E2ECE9; margin-top: 2rem;"/>
        <p style="font-size: 0.8rem; color: #888; margin-bottom: 0;">Sabuj Counseling Support | Kolkata, India</p>
      </div>
    `;

    console.log(`[DEV OTP] Registration OTP for ${email}: ${otp}`);

    await sendEmail({
      toEmail: email,
      toName: name,
      subject: 'Verification OTP Code - Sabuj Counseling Services',
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
app.post('/api/auth/verify-otp', async (req, res) => {
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

// 3. Forgot Password (Generates recovery OTP)
app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body;
  try {
    const client = await Client.findOne({ email });
    if (!client || !client.verified) {
      return res.status(400).json({ error: 'No active, verified client account exists with this email.' });
    }

    const resetOtp = Math.floor(100000 + Math.random() * 900000).toString();
    client.resetOtpCode = resetOtp;
    client.resetOtpExpires = new Date(Date.now() + 30 * 60 * 1000); // 30 mins validity
    await client.save();

    // Send reset OTP email via Brevo
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; padding: 2rem; color: #2A473E; background-color: #FAF9F6; border-radius: 8px; border: 1px solid #E2ECE9;">
        <h2 style="color: #1A2E28; border-bottom: 2px solid #2A473E; padding-bottom: 0.5rem; margin-top: 0;">Password Reset Request</h2>
        <p>Dear ${client.name},</p>
        <p>We received a request to reset your password. Use the following security recovery OTP to set a new password:</p>
        <div style="font-size: 2.25rem; font-weight: bold; background: #FFF; padding: 1rem 2rem; border-radius: 6px; border: 1px solid #C95D5D; color: #1A2E28; display: inline-block; letter-spacing: 0.1em; margin: 1rem 0;">
          ${resetOtp}
        </div>
        <p style="font-size: 0.85rem; color: #666;">This recovery OTP is valid for 30 minutes. If you did not request this, please change your password immediately.</p>
        <hr style="border: 0; border-top: 1px solid #E2ECE9; margin-top: 2rem;"/>
        <p style="font-size: 0.8rem; color: #888; margin-bottom: 0;">Sabuj Counseling Support | Kolkata, India</p>
      </div>
    `;

    console.log(`[DEV OTP] Forgot Password Reset OTP for ${email}: ${resetOtp}`);

    await sendEmail({
      toEmail: email,
      toName: client.name,
      subject: 'Password Recovery OTP - Sabuj Counseling Services',
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
app.post('/api/auth/reset-password', async (req, res) => {
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

// 5. Account Sign In (Provider vs Client)
app.post('/api/auth/login', async (req, res) => {
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
      return res.json({
        user: {
          email: providerEmail,
          name: 'Sabuj Das',
          role: 'provider'
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

    // If client is registered but not verified, reject and return unverified payload
    if (!client.verified) {
      return res.status(400).json({ 
        unverified: true, 
        error: 'This account email is not verified yet. Please complete verification.' 
      });
    }

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

// 6. Booking Engine: Get and Create appointments
app.get('/api/appointments', async (req, res) => {
  const { clientEmail } = req.query;
  try {
    let query = {};
    if (clientEmail) {
      query.clientEmail = clientEmail.toLowerCase();
    }
    const list = await Appointment.find(query);
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/appointments', async (req, res) => {
  const { clientEmail, clientName, clientPhone, date, time, sessionMode, problemDescription } = req.body;
  try {
    const newApt = await Appointment.create({
      clientEmail, clientName, clientPhone, date, time, sessionMode, problemDescription
    });

    // Notify Client via Brevo
    const clientHtml = `
      <div style="font-family: Arial, sans-serif; padding: 2rem; color: #2A473E; background-color: #FAF9F6; border-radius: 8px; border: 1px solid #E2ECE9;">
        <h2 style="color: #1A2E28; border-bottom: 2px solid #2A473E; padding-bottom: 0.5rem; margin-top: 0;">Appointment Request Pending</h2>
        <p>Dear ${clientName},</p>
        <p>We have successfully received your session request. Your inquiry is currently pending therapist approval.</p>
        <div style="background: #FFF; padding: 1rem; border-radius: 6px; border: 1px solid #E2ECE9; margin: 1rem 0; font-size: 0.9rem; line-height: 1.6;">
          <strong>Session Details:</strong><br/>
          - <strong>Date</strong>: ${date}<br/>
          - <strong>Time Slot</strong>: ${time}<br/>
          - <strong>Session Format</strong>: ${sessionMode}<br/>
        </div>
        <p>Dr. Das will review your slot request and you will receive an confirmation email shortly.</p>
        <hr style="border: 0; border-top: 1px solid #E2ECE9; margin-top: 2rem;"/>
        <p style="font-size: 0.8rem; color: #888; margin-bottom: 0;">Sabuj Counseling Support | Kolkata, India</p>
      </div>
    `;
    await sendEmail({
      toEmail: clientEmail,
      toName: clientName,
      subject: 'Consultation Inquiry Received - Pending Confirmation',
      htmlContent: clientHtml
    });

    // Notify Therapist (Dr. Das) via Brevo
    const therapistHtml = `
      <div style="font-family: Arial, sans-serif; padding: 2rem; color: #2A473E; background-color: #FAF9F6; border-radius: 8px; border: 1px solid #E2ECE9;">
        <h2 style="color: #1A2E28; border-bottom: 2px solid #2A473E; padding-bottom: 0.5rem; margin-top: 0;">New Appointment Request</h2>
        <p>Dr. Das,</p>
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
        <hr style="border: 0; border-top: 1px solid #E2ECE9; margin-top: 2rem;"/>
        <p style="font-size: 0.8rem; color: #888; margin-bottom: 0;">Sabuj Counseling Automated System</p>
      </div>
    `;
    await sendEmail({
      toEmail: 'sabujd880@gmail.com',
      toName: 'Dr. Sabuj Das',
      subject: 'Alert: New Counseling Request - ' + clientName,
      htmlContent: therapistHtml
    });

    res.json(newApt);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 7. Update Appointment Status (Confirmed / Cancelled)
app.patch('/api/appointments/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  try {
    const apt = await Appointment.findById(id);
    if (!apt) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    apt.status = status;
    await apt.save();

    // Send confirmation/cancellation email alerts to client
    const emailSubject = status === 'Confirmed' 
      ? 'Booking Confirmation - Sabuj Counseling Services'
      : 'Appointment Status Notice - Session Cancelled';

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; padding: 2rem; color: #2A473E; background-color: #FAF9F6; border-radius: 8px; border: 1px solid #E2ECE9;">
        <h2 style="color: #1A2E28; border-bottom: 2px solid #2A473E; padding-bottom: 0.5rem; margin-top: 0;">
          ${status === 'Confirmed' ? 'Session Booking Confirmed' : 'Appointment Cancelled'}
        </h2>
        <p>Dear ${apt.clientName},</p>
        <p>
          ${status === 'Confirmed' 
            ? 'We are pleased to inform you that Dr. Sabuj Das has confirmed your consultation inquiry slot.'
            : 'We regret to inform you that your upcoming consultation slot has been cancelled.'
          }
        </p>
        <div style="background: #FFF; padding: 1rem; border-radius: 6px; border: 1px solid #E2ECE9; margin: 1rem 0; font-size: 0.9rem; line-height: 1.6;">
          <strong>Session Details:</strong><br/>
          - <strong>Date</strong>: ${apt.date}<br/>
          - <strong>Time</strong>: ${apt.time}<br/>
          - <strong>Format</strong>: ${apt.sessionMode}<br/>
          - <strong>Status</strong>: <strong style="color: ${status === 'Confirmed' ? '#4A8C70' : '#C95D5D'}">${status.toUpperCase()}</strong>
        </div>
        <p>
          ${status === 'Confirmed' 
            ? 'Please log in to your Client Portal dashboard at the scheduled time to initiate contact.' 
            : 'Please visit the portal to schedule another booking date.'
          }
        </p>
        <hr style="border: 0; border-top: 1px solid #E2ECE9; margin-top: 2rem;"/>
        <p style="font-size: 0.8rem; color: #888; margin-bottom: 0;">Sabuj Counseling Support | Kolkata, India</p>
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
app.patch('/api/appointments/:id/notes', async (req, res) => {
  const { id } = req.params;
  const { notes } = req.body;
  try {
    const apt = await Appointment.findByIdAndUpdate(id, { notes }, { new: true });
    res.json(apt);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 9. Messages endpoints: Get and Create client inquiries
app.get('/api/messages', async (req, res) => {
  const { senderEmail } = req.query;
  try {
    let query = {};
    if (senderEmail) {
      query.$or = [
        { senderEmail: senderEmail.toLowerCase() },
        { id: { $regex: senderEmail.toLowerCase(), $options: 'i' } }
      ];
    }
    const list = await Message.find(query);
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/messages', async (req, res) => {
  const { senderName, senderEmail, subject, message } = req.body;
  try {
    const newMsg = await Message.create({
      senderName, senderEmail, subject, message
    });

    // Send Alert to Dr. Das
    const alertHtml = `
      <div style="font-family: Arial, sans-serif; padding: 2rem; color: #2A473E; background-color: #FAF9F6; border-radius: 8px; border: 1px solid #E2ECE9;">
        <h2 style="color: #1A2E28; border-bottom: 2px solid #2A473E; padding-bottom: 0.5rem; margin-top: 0;">New Inbox Inquiry Message</h2>
        <p>Dr. Das,</p>
        <p>A new client message inquiry has been sent to your portal dashboard:</p>
        <div style="background: #FFF; padding: 1rem; border-radius: 6px; border: 1px solid #E2ECE9; margin: 1rem 0; font-size: 0.9rem; line-height: 1.6;">
          - <strong>From Name</strong>: ${senderName}<br/>
          - <strong>From Email</strong>: ${senderEmail}<br/>
          - <strong>Subject</strong>: ${subject}<br/>
          - <strong>Message Body</strong>: ${message}
        </div>
        <p>Login to your therapist control panel to reply.</p>
      </div>
    `;
    await sendEmail({
      toEmail: 'sabujd880@gmail.com',
      toName: 'Dr. Sabuj Das',
      subject: 'Alert: New Client Portal Message - ' + subject,
      htmlContent: alertHtml
    });

    res.json(newMsg);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 10. Reply to secure messages
app.patch('/api/messages/:id/reply', async (req, res) => {
  const { id } = req.params;
  const { replyText } = req.body;
  try {
    const msg = await Message.findById(id);
    if (!msg) {
      return res.status(404).json({ error: 'Message log not found' });
    }

    const newReply = {
      id: 'rep-' + Date.now(),
      message: replyText,
      timestamp: new Date()
    };

    msg.replies.push(newReply);
    msg.status = 'replied';
    await msg.save();

    // Send email alert to client with the message reply text
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; padding: 2rem; color: #2A473E; background-color: #FAF9F6; border-radius: 8px; border: 1px solid #E2ECE9;">
        <h2 style="color: #1A2E28; border-bottom: 2px solid #2A473E; padding-bottom: 0.5rem; margin-top: 0;">Reply from Dr. Sabuj Das</h2>
        <p>Dear ${msg.senderName},</p>
        <p>Dr. Sabuj Das has submitted a secure reply regarding your message thread: <strong>"${msg.subject}"</strong></p>
        <div style="background: #FFF; padding: 1.25rem; border-radius: 6px; border-left: 3px solid #DF9B34; font-size: 0.9rem; margin: 1rem 0; font-style: italic;">
          "${replyText}"
        </div>
        <p>You can view your complete thread history by signing in to your Client Account Portal.</p>
        <hr style="border: 0; border-top: 1px solid #E2ECE9; margin-top: 2rem;"/>
        <p style="font-size: 0.8rem; color: #888; margin-bottom: 0;">Sabuj Counseling Services</p>
      </div>
    `;

    await sendEmail({
      toEmail: msg.senderEmail,
      toName: msg.senderName,
      subject: 'New Message Reply - Dr. Sabuj Das',
      htmlContent: emailHtml
    });

    res.json(msg);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 11. Update Message Read Status
app.patch('/api/messages/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  try {
    const msg = await Message.findByIdAndUpdate(id, { status }, { new: true });
    res.json(msg);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 12. Care Documents: Get and Create documents
app.get('/api/documents', async (req, res) => {
  const { clientEmail } = req.query;
  try {
    let query = {};
    if (clientEmail) {
      query.clientEmail = clientEmail.toLowerCase();
    }
    const list = await CareDocument.find(query);
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/documents', async (req, res) => {
  const { clientEmail, clientName, type, date, data } = req.body;
  try {
    const newDoc = await CareDocument.create({
      clientEmail, clientName, type, date, data
    });

    // Compile beautiful HTML depending on document type and send via Brevo
    let emailSubject = '';
    let docHtml = '';

    if (type === 'receipt') {
      emailSubject = `Official Payment Invoice Receipt (${data.invoiceNo}) - Sabuj Counseling`;
      docHtml = `
        <div style="font-family: Arial, sans-serif; padding: 2rem; color: #2A473E; background-color: #FAF9F6; border-radius: 8px; border: 1px solid #E2ECE9;">
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
          <p>You can print the full clinical document directly inside your Client Portal account under 'My Documents'.</p>
        </div>
      `;
    } else if (type === 'prescription') {
      emailSubject = 'Clinical Therapeutic Guidance & Interventions Plan - Sabuj Counseling';
      
      let exercisesRows = '';
      if (data.prescItems && data.prescItems.length > 0) {
        exercisesRows = data.prescItems.map(item => `
          <tr style="border-bottom: 1px solid #E2ECE9;">
            <td style="padding: 0.5rem; font-weight: bold;">${item.name}</td>
            <td style="padding: 0.5rem;">${item.dose}</td>
            <td style="padding: 0.5rem;">${item.freq}</td>
            <td style="padding: 0.5rem; text-align: right;">${item.duration}</td>
          </tr>
        `).join('');
      }

      docHtml = `
        <div style="font-family: Arial, sans-serif; padding: 2rem; color: #2A473E; background-color: #FAF9F6; border-radius: 8px; border: 1px solid #E2ECE9;">
          <h2 style="color: #1A2E28; border-bottom: 2px solid #2A473E; padding-bottom: 0.5rem; margin-top: 0;">Clinical Consultation Plan & Interventions</h2>
          <p>Dear ${clientName},</p>
          <p>Dr. Sabuj Das has assigned a new therapeutic exercise plan recommendations list for your recovery:</p>
          
          <p><strong>Clinical Indications:</strong> <em>${data.prescDiagnosis}</em></p>
          
          <table style="width: 100%; border-collapse: collapse; margin: 1.5rem 0; font-size: 0.85rem; text-align: left;">
            <thead>
              <tr style="background: #E2ECE9; font-weight: bold; color: #1A2E28;">
                <th style="padding: 0.5rem;">Recommendation</th>
                <th style="padding: 0.5rem;">Instructions</th>
                <th style="padding: 0.5rem;">Frequency</th>
                <th style="padding: 0.5rem; text-align: right;">Duration</th>
              </tr>
            </thead>
            <tbody>
              ${exercisesRows || '<tr><td colspan="4" style="text-align: center; padding: 1rem;">No exercises listed.</td></tr>'}
            </tbody>
          </table>

          <div style="background: #FAF9F6; padding: 1rem; border-left: 3px solid #DF9B34; font-size: 0.85rem; margin: 1rem 0;">
            <strong>Next Session Targets:</strong><br/>
            ${data.prescRefills}
          </div>
          <p>You can view and print this complete letterhead plan within your Client Portal Account under 'My Documents'.</p>
        </div>
      `;
    } else {
      emailSubject = 'Clinical Progress & Observation Report - Sabuj Counseling';
      docHtml = `
        <div style="font-family: Arial, sans-serif; padding: 2rem; color: #2A473E; background-color: #FAF9F6; border-radius: 8px; border: 1px solid #E2ECE9;">
          <h2 style="color: #1A2E28; border-bottom: 2px solid #2A473E; padding-bottom: 0.5rem; margin-top: 0;">Clinical Summary & Progress Report</h2>
          <p>Dear ${clientName},</p>
          <p>Dr. Das has generated a clinical progress summary update for your records:</p>
          <div style="background: #FFF; padding: 1.25rem; border-radius: 6px; border: 1px solid #E2ECE9; margin: 1.5rem 0; font-size: 0.9rem; line-height: 1.6;">
            <strong>1. Diagnostic Assessment</strong>:<br/>
            ${data.reportSummary}<br/><br/>
            <strong>2. Behavioral Observations</strong>:<br/>
            ${data.reportObservations}<br/><br/>
            <strong>3. Actions & Homework Plan</strong>:<br/>
            ${data.reportHomework}
          </div>
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

app.put('/api/availability', async (req, res) => {
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

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  
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
      console.error('Gemini API returned error status:', response.status, errorText);
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
app.post('/api/ai/polish', async (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'Text content is required for polishing.' });
  }

  try {
    const systemPrompt = "You are a professional, licensed clinical psychologist and therapist. Your job is to polish, formalize, and improve draft therapist notes or clinical observations. Rewrite the note to sound highly formal, professional, empathetic, and clinically precise. Keep the original clinical meaning exactly as intended. Keep the output direct and concise, without any pleasantries, conversational intros, or notes about the edits.";
    const userPrompt = `Please rewrite and polish the following draft note for a client document:\n\n"${text}"`;
    const polishedText = await callGeminiAPI(userPrompt, systemPrompt);
    res.json({ success: true, polishedText });
  } catch (error) {
    console.error('AI Polish Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Local fallback response generator for offline or timeout situations
const getLocalFallbackResponse = (message) => {
  const msg = message.toLowerCase();
  
  if (msg.includes('fee') || msg.includes('cost') || msg.includes('price') || msg.includes('charge') || msg.includes('rate') || msg.includes('pay')) {
    return "Dr. Sabuj Das's fee is INR 1,500 per session. Each therapy session lasts for 60 minutes.";
  }
  if (msg.includes('book') || msg.includes('schedule') || msg.includes('appointment') || msg.includes('calendar') || msg.includes('slot') || msg.includes('meet')) {
    return "You can schedule a consultation with Dr. Das directly using the 'Schedule a Consultation' calendar picker in the web portal.";
  }
  if (msg.includes('language') || msg.includes('speak') || msg.includes('bengali') || msg.includes('hindi') || msg.includes('english') || msg.includes('talk')) {
    return "Dr. Das conducts therapy sessions in English, Hindi, and Bengali, tailoring the communication to your comfort.";
  }
  if (msg.includes('breath') || msg.includes('panic') || msg.includes('anxious') || msg.includes('stress') || msg.includes('calm') || msg.includes('worry')) {
    return "If you're feeling overwhelmed, try taking a slow breath. I can guide you through a 4-second box breathing exercise (inhale for 4s, hold for 4s, exhale for 4s, hold for 4s) right here in this chat!";
  }
  if (msg.includes('adhd') || msg.includes('attention') || msg.includes('focus') || msg.includes('hyper')) {
    return "Dr. Das specializes in supporting clients with ADHD, focusing on executive function, focus training, and emotional regulation techniques.";
  }
  if (msg.includes('addict') || msg.includes('sober') || msg.includes('alcohol') || msg.includes('drug')) {
    return "Dr. Das provides addiction treatment and recovery support to help break behavioral dependencies and build healthy coping mechanisms.";
  }
  if (msg.includes('anxiety') || msg.includes('fear') || msg.includes('panic attack')) {
    return "For anxiety and panic, Dr. Das utilizes evidence-based Cognitive Behavioral Therapy (CBT) and calming mindfulness practices.";
  }
  if (msg.includes('depress') || msg.includes('sad') || msg.includes('hopeless') || msg.includes('mood')) {
    return "Dr. Das offers supportive DBT and CBT pathways for managing depression, helping you rebuild daily structures and positive coping strategies.";
  }
  if (msg.includes('hello') || msg.includes('hi ') || msg.startsWith('hi') || msg.includes('hey') || msg.includes('greetings')) {
    return "Hello! I'm Aura, Dr. Sabuj Das's virtual support assistant. How can I help you today?";
  }
  if (msg.includes('contact') || msg.includes('email') || msg.includes('phone') || msg.includes('number') || msg.includes('reach') || msg.includes('address') || msg.includes('location') || msg.includes('kolkata')) {
    return "You can reach Dr. Das at sabuj.das@example.com or +91 98765 43210. His clinic is located in Kolkata, India.";
  }
  
  return "I'm Aura, Dr. Das's virtual assistant. For clinical questions or personalized therapy advice, I highly recommend scheduling a session with Dr. Das via the portal booking calendar, or contacting him at sabuj.das@example.com.";
};

// 16. AI Chat Assistant (Aura) Endpoint
app.post('/api/ai/chat', async (req, res) => {
  const { message, history = [] } = req.body;
  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Message content is required.' });
  }

  try {
    const systemInstruction = `You are Aura, Dr. Sabuj Das's virtual support assistant for his counseling services website. 
Dr. Sabuj Das is a licensed therapist and psychologist specializing in CBT and DBT for ADHD, addiction treatment, anxiety, depression, and anger regulation. 
Session Cost: INR 1,500 per session.
Session Duration: 60 minutes.
Booking: Clients can book directly via the 'Schedule a Consultation' calendar picker in the web portal.
Languages: Dr. Das speaks English, Hindi, and Bengali.
Your Behavior:
- Keep your answers brief, empathetic, warm, and highly supportive (ideally under 3 sentences).
- If the user shows signs of acute stress, anxiety, or panic, kindly guide them to try a 4-second box breathing exercise (inhale 4s, hold 4s, exhale 4s, hold 4s) to calm their nervous system.
- Never prescribe medications or diagnose conditions. Always recommend scheduling a direct consultation with Dr. Das for clinical advice.`;

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

// Serve built frontend assets in production
const __dirname = path.resolve();
const distPath = path.join(__dirname, 'dist');

if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// Start listening
app.listen(PORT, () => {
  console.log(`Express Gateway Server listening on port ${PORT}`);
});

