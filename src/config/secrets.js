import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

/**
 * Loads production application secrets from AWS Secrets Manager
 * Injects retrieved key-value pairs securely into process.env at server startup.
 */
export async function loadSecrets() {
  const secretName = process.env.AWS_SECRET_NAME;
  const region = process.env.AWS_REGION || 'ap-south-1';
  const isProd = process.env.NODE_ENV === 'production';

  if (!secretName) {
    if (isProd && !process.env.MONGODB_URI) {
      console.warn('[SECURITY] AWS_SECRET_NAME is not set. Relying on container/environment variables.');
    }
    return;
  }

  try {
    console.log(`[SECRETS] Retrieving configuration from AWS Secrets Manager (SecretId: ${secretName}, Region: ${region})...`);
    
    const client = new SecretsManagerClient({
      region,
      ...(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY ? {
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
        }
      } : {})
    });

    const response = await client.send(
      new GetSecretValueCommand({
        SecretId: secretName,
        VersionStage: 'AWSCURRENT',
      })
    );

    if (response.SecretString) {
      const secrets = JSON.parse(response.SecretString);
      let loadedKeys = 0;
      for (const [key, value] of Object.entries(secrets)) {
        // Do not log secret values!
        process.env[key] = String(value);
        loadedKeys++;
      }
      console.log(`[SECRETS] Successfully synchronized ${loadedKeys} secrets from AWS Secrets Manager.`);
    } else if (response.SecretBinary) {
      const buff = Buffer.from(response.SecretBinary, 'base64');
      const decodedBinarySecret = buff.toString('ascii');
      const secrets = JSON.parse(decodedBinarySecret);
      for (const [key, value] of Object.entries(secrets)) {
        process.env[key] = String(value);
      }
      console.log('[SECRETS] Successfully loaded binary secrets from AWS Secrets Manager.');
    }
  } catch (error) {
    console.error(`[SECRETS ERROR] Unable to load secrets from AWS Secrets Manager: ${error.message}`);
    if (isProd) {
      throw new Error(`Production startup aborted: Failed to retrieve secrets from AWS Secrets Manager (${secretName}): ${error.message}`);
    }
  }
}

