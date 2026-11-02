/**
 * Automated Database Backup & Snapshot Script
 * Dumps all MongoDB collections into a timestamped, compressed JSON archive.
 * Can be run standalone, as an OS cron job, or scheduled in AWS ECS/EventBridge.
 *
 * Usage:
 *   node scripts/backup-db.js
 */

import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import dns from 'dns';
import dotenv from 'dotenv';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

dotenv.config();

try {
  dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
} catch (e) {}

const BACKUP_DIR = path.join(process.cwd(), 'backups');
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

async function performBackup() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('[ERROR] MONGODB_URI is not set. Cannot perform database backup.');
    process.exit(1);
  }

  console.log('Connecting to MongoDB Atlas for snapshot generation...');
  await mongoose.connect(mongoUri, { family: 4 });
  const db = mongoose.connection.db;

  const collections = await db.listCollections().toArray();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupArchive = {
    generatedAt: new Date().toISOString(),
    databaseName: db.databaseName,
    collections: {}
  };

  for (const col of collections) {
    const colName = col.name;
    if (colName === 'app_sessions') continue; // Skip ephemeral sessions
    console.log(`Dumping collection: ${colName}...`);
    const records = await db.collection(colName).find({}).toArray();
    backupArchive.collections[colName] = records;
  }

  const rawJson = JSON.stringify(backupArchive, null, 2);
  const compressedGzip = zlib.gzipSync(rawJson);
  const localFileName = `counselling_backup_${timestamp}.json.gz`;
  const localFilePath = path.join(BACKUP_DIR, localFileName);

  fs.writeFileSync(localFilePath, compressedGzip);
  console.log(`✓ Backup successfully saved locally: ${localFilePath} (${Math.round(compressedGzip.length / 1024)} KB)`);

  // Optional: Upload offsite to AWS S3 backup bucket if configured
  const s3Bucket = process.env.AWS_BACKUP_S3_BUCKET || process.env.AWS_S3_BUCKET;
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && s3Bucket) {
    try {
      const s3Client = new S3Client({
        region: process.env.AWS_REGION || 'ap-south-1',
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
        }
      });
      const s3Key = `database_backups/${localFileName}`;
      await s3Client.send(new PutObjectCommand({
        Bucket: s3Bucket,
        Key: s3Key,
        Body: compressedGzip,
        ContentType: 'application/gzip',
        ServerSideEncryption: 'AES256'
      }));
      console.log(`✓ Offsite backup mirrored to AWS S3: s3://${s3Bucket}/${s3Key}`);
    } catch (s3Err) {
      console.warn(`[WARN] S3 backup mirroring skipped/failed: ${s3Err.message}`);
    }
  }

  await mongoose.disconnect();
  console.log('Database snapshot complete.');
}

performBackup().catch(err => {
  console.error('[FATAL] Backup failed:', err);
  process.exit(1);
});
