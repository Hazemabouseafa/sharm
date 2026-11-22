import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

function loadEnv() {
  const envPath = path.join(rootDir, '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

loadEnv();

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        out[key] = next;
        i += 1;
      } else {
        out[key] = 'true';
      }
    }
  }
  return out;
}

function generateStrongPassword() {
  const raw = crypto.randomBytes(18).toString('base64url');
  return `SP!${raw}#9aA`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const email = (args.email || process.env.INITIAL_ADMIN_EMAIL || 'owner@sharmpharaoh.com').trim().toLowerCase();
  const username = (args.username || process.env.INITIAL_ADMIN_USERNAME || '').trim().toLowerCase() || undefined;
  const fullName = (args.name || process.env.INITIAL_ADMIN_NAME || 'Sharm Pharaoh Owner').trim();
  const role = (args.role || 'OWNER').trim().toUpperCase();
  const allowedRoles = ['OWNER', 'MANAGER', 'RESERVATIONS_AGENT', 'CONTENT_EDITOR', 'FINANCE', 'READ_ONLY'];
  if (!allowedRoles.includes(role)) {
    throw new Error(`Invalid role "${role}". Allowed roles: ${allowedRoles.join(', ')}`);
  }

  let password = args.password || process.env.INITIAL_ADMIN_PASSWORD || '';
  let generated = false;
  if (!password) {
    password = generateStrongPassword();
    generated = true;
  }

  if (password.length < 12) {
    throw new Error('Admin password must be at least 12 characters long.');
  }

  const prisma = new PrismaClient();
  try {
    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    const user = await prisma.staffUser.upsert({
      where: { email },
      update: {
        ...(username !== undefined ? { username } : {}),
        fullName,
        role,
        passwordHash,
        isActive: true,
        suspendedAt: null,
      },
      create: {
        email,
        ...(username !== undefined ? { username } : {}),
        fullName,
        role,
        passwordHash,
        isActive: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: user.id,
        actorRole: user.role,
        action: 'ADMIN_BOOTSTRAP_UPSERT',
        targetType: 'StaffUser',
        targetId: user.id,
        afterRedactedJson: {
          email: user.email,
          role: user.role,
          generatedPassword: generated,
        },
      },
    });

    if (generated) {
      const bootstrapFile = path.join(rootDir, '.local-admin-bootstrap.json');
      fs.writeFileSync(
        bootstrapFile,
        JSON.stringify(
          {
            email: user.email,
            role: user.role,
            password,
            createdAt: new Date().toISOString(),
            note: 'Delete this local gitignored file after storing the credentials in your password manager.',
          },
          null,
          2,
        ),
        { mode: 0o600 },
      );
      console.log(`Admin account provisioned (${user.email}, role=${user.role}). One-time generated credentials written to .local-admin-bootstrap.json`);
    } else {
      console.log(`Admin account provisioned (${user.email}, role=${user.role}) using supplied password.`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Failed to provision admin user:', err.message || err);
  process.exit(1);
});
