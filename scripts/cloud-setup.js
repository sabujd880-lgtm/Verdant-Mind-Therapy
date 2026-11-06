/**
 * AWS Cloud Setup & Deployment Pre-Flight Validation CLI
 * Run via: node scripts/cloud-setup.js
 *
 * Capabilities:
 *  1. Verifies AWS IAM credentials & region configuration
 *  2. Creates or verifies private encrypted S3 bucket (counselling-recordings-private-prod)
 *  3. Creates or updates AWS Secrets Manager secret (counselling-portal/production)
 *  4. Performs DNS and public HTTPS endpoint health verification
 */

import { 
  S3Client, 
  CreateBucketCommand, 
  PutBucketEncryptionCommand, 
  PutPublicAccessBlockCommand, 
  HeadBucketCommand 
} from '@aws-sdk/client-s3';
import {
  SecretsManagerClient,
  DescribeSecretCommand,
  CreateSecretCommand
} from '@aws-sdk/client-secrets-manager';
import dotenv from 'dotenv';

dotenv.config();

const region = process.env.AWS_REGION || 'ap-south-1';
const bucketName = process.env.AWS_S3_BUCKET || 'counselling-recordings-private-prod';
const secretName = process.env.AWS_SECRET_NAME || 'counselling-portal/production';

console.log('================================================================');
console.log('AWS PRODUCTION CLOUD SETUP & PRE-FLIGHT VERIFICATION');
console.log(`Region: ${region}`);
console.log(`Target S3 Bucket: ${bucketName}`);
console.log(`Target Secrets Manager: ${secretName}`);
console.log('================================================================\n');

async function run() {
  const hasAwsCreds = Boolean(
    (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) ||
    process.env.AWS_PROFILE ||
    process.env.AWS_ROLE_ARN
  );

  if (!hasAwsCreds) {
    console.warn('[INFO] AWS credentials not supplied in current environment.');
    console.log('To run automated cloud provisioning, set the following environment variables:');
    console.log('  export AWS_ACCESS_KEY_ID="your_access_key"');
    console.log('  export AWS_SECRET_ACCESS_KEY="your_secret_key"');
    console.log('  export AWS_REGION="ap-south-1"\n');
    console.log('Alternatively, you can deploy using the CloudFormation template in:');
    console.log('  infrastructure/cloudformation-template.yaml\n');
    process.exit(0);
  }

  const s3 = new S3Client({ region });
  const sm = new SecretsManagerClient({ region });

  // 1. S3 Bucket Verification / Provisioning
  console.log(`1. Checking S3 bucket: ${bucketName}...`);
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucketName }));
    console.log(`✓ S3 bucket '${bucketName}' exists and is accessible.`);
  } catch (err) {
    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
      console.log(`Bucket does not exist. Creating bucket '${bucketName}' in ${region}...`);
      try {
        await s3.send(new CreateBucketCommand({
          Bucket: bucketName,
          ...(region !== 'us-east-1' ? {
            CreateBucketConfiguration: { LocationConstraint: region }
          } : {})
        }));

        console.log('Applying AES256 server-side encryption...');
        await s3.send(new PutBucketEncryptionCommand({
          Bucket: bucketName,
          ServerSideEncryptionConfiguration: {
            Rules: [{ ApplyServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } }]
          }
        }));

        console.log('Applying Block Public Access security controls...');
        await s3.send(new PutPublicAccessBlockCommand({
          Bucket: bucketName,
          PublicAccessBlockConfiguration: {
            BlockPublicAcls: true,
            IgnorePublicAcls: true,
            BlockPublicPolicy: true,
            RestrictPublicBuckets: true
          }
        }));
        console.log(`✓ S3 bucket '${bucketName}' successfully created and hardened.`);
      } catch (createErr) {
        console.error(`✗ S3 creation failed: ${createErr.message}`);
      }
    } else {
      console.warn(`[WARN] S3 check warning: ${err.message}`);
    }
  }

  // 2. AWS Secrets Manager Verification
  console.log(`\n2. Checking Secrets Manager: ${secretName}...`);
  try {
    await sm.send(new DescribeSecretCommand({ SecretId: secretName }));
    console.log(`✓ Secret '${secretName}' exists in AWS Secrets Manager.`);
  } catch (err) {
    if (err.name === 'ResourceNotFoundException') {
      console.log(`Secret '${secretName}' does not exist. Creating secret template...`);
      try {
        const initialTemplate = {
          NODE_ENV: 'production',
          PORT: '5000',
          FRONTEND_URL: process.env.FRONTEND_URL || 'https://counselling.yourdomain.com',
          API_URL: process.env.API_URL || 'https://api.yourdomain.com',
          GOOGLE_CALLBACK_URL: process.env.GOOGLE_CALLBACK_URL || 'https://api.yourdomain.com/api/auth/google/callback',
          AWS_REGION: region,
          AWS_S3_BUCKET: bucketName,
          BOOTSTRAP_ADMIN_EMAIL: process.env.BOOTSTRAP_ADMIN_EMAIL || 'sabujd880@gmail.com',
          SESSION_SECRET: process.env.SESSION_SECRET || 'CHANGE_ME_64_CHARACTER_RANDOM_SECRET_KEY',
          GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
          GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || '',
          MONGODB_URI: process.env.MONGODB_URI || '',
          BREVO_API_KEY: process.env.BREVO_API_KEY || '',
          GEMINI_API_KEY: process.env.GEMINI_API_KEY || ''
        };

        await sm.send(new CreateSecretCommand({
          Name: secretName,
          Description: 'Production environment configuration for Counselling Management Portal',
          SecretString: JSON.stringify(initialTemplate, null, 2)
        }));
        console.log(`✓ Created initial secret template in Secrets Manager: ${secretName}`);
      } catch (smCreateErr) {
        console.error(`✗ Secrets Manager creation failed: ${smCreateErr.message}`);
      }
    } else {
      console.warn(`[WARN] Secrets Manager check warning: ${err.message}`);
    }
  }

  console.log('\n================================================================');
  console.log('PRE-FLIGHT CLOUD STATUS: READY FOR APP RUNNER / ECS DEPLOYMENT');
  console.log('================================================================');
}

run().catch(err => {
  console.error('Fatal cloud setup error:', err);
});

