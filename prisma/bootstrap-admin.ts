import "dotenv/config";
import { createLocalAccountIssuer } from "@better-auth/core/db";
import { auth } from "../src/lib/auth";
import { prisma } from "../src/lib/prisma";

export function validateBootstrapInput(
  rawEmail?: string,
  rawPassword?: string,
) {
  const email = rawEmail?.trim();
  const password = rawPassword;

  if (!email || !password) {
    throw new Error(
      "BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD must be set before running bootstrap-admin.ts",
    );
  }

  if (password.length < 12) {
    throw new Error(
      "BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters long",
    );
  }

  return { email, password };
}

export async function bootstrapAdmin() {
  const { email, password } = validateBootstrapInput(
    process.env.BOOTSTRAP_ADMIN_EMAIL,
    process.env.BOOTSTRAP_ADMIN_PASSWORD,
  );

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new Error(`Admin email already exists: ${email}`);
  }

  const context = await auth.$context;
  const user = await context.internalAdapter.createUser(
    {
      name: "Administrator SMART",
      email,
      emailVerified: true,
      role: "ADMIN",
      isActive: true,
      mustChangePassword: true,
    },
    { method: "admin" },
  );

  try {
    const passwordHash = await context.password.hash(password);
    await context.internalAdapter.createAccount({
      accountId: user.id,
      providerId: "credential",
      issuer: createLocalAccountIssuer("credential"),
      userId: user.id,
      password: passwordHash,
    });
    console.log(`Bootstrap admin created: ${user.id} (${user.email})`);
    return user;
  } catch (error) {
    await context.internalAdapter.deleteUser(user.id);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

const isMainScript =
  Boolean((import.meta as { main?: boolean }).main) ||
  (Boolean(process.argv[1]) &&
    !process.argv[1].includes(".test.") &&
    (process.argv[1].endsWith("bootstrap-admin.ts") ||
      process.argv[1].endsWith("bootstrap-admin")));

if (isMainScript) {
  bootstrapAdmin().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
