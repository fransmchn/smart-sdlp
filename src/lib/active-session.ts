import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export interface ActiveSessionOptions {
  allowMustChangePassword?: boolean;
}

export interface ActiveSessionUser {
  id: string;
  name?: string | null;
  email: string;
  role?: string | null;
  isActive?: boolean;
  mustChangePassword?: boolean | null;
  nip?: string | null;
  jabatan?: string | null;
  unitKerja?: string | null;
}

export interface ActiveSessionPayload {
  user: ActiveSessionUser;
  session: {
    id: string;
    userId: string;
  };
}

let mockSessionForTesting: ActiveSessionPayload | null = null;

export function __setMockSessionForTest(mock: ActiveSessionPayload | null) {
  mockSessionForTesting = mock;
}

export async function getActiveSession() {
  if (mockSessionForTesting !== null) {
    return mockSessionForTesting;
  }
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return null;
    const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { isActive: true, mustChangePassword: true, nip: true, jabatan: true, unitKerja: true } });
    return user?.isActive ? { ...session, user: { ...session.user, mustChangePassword: user.mustChangePassword } } : null;
  } catch {
    return null;
  }
}

export function assertActionSession<
  T extends { user: { isActive?: boolean; mustChangePassword?: boolean | null; role?: string | null } },
>(session: T | null, options?: ActiveSessionOptions): T | null {
  if (!session) return null;
  if (session.user.mustChangePassword && !options?.allowMustChangePassword) {
    throw new Error("Wajib ganti kata sandi terlebih dahulu.");
  }
  return session;
}

export async function getActionSession(options?: ActiveSessionOptions) {
  const session = await getActiveSession();
  return assertActionSession(session, options);
}

export function assertActiveSession<
  T extends { user: { isActive?: boolean; mustChangePassword?: boolean | null; role?: string | null } },
>(session: T | null, options?: ActiveSessionOptions): T {
  if (!session) throw new Error("Sesi tidak valid atau akun tidak aktif.");
  if (session.user.mustChangePassword && !options?.allowMustChangePassword) {
    throw new Error("Wajib ganti kata sandi terlebih dahulu.");
  }
  return session;
}

export function assertAdminSession<
  T extends { user: { isActive?: boolean; mustChangePassword?: boolean | null; role?: string | null } },
>(session: T | null, options?: ActiveSessionOptions): T {
  const activeSession = assertActiveSession(session, options);
  if (activeSession.user.role?.toLowerCase() !== "admin") throw new Error("Hanya admin yang diizinkan.");
  return activeSession;
}

export async function requireActiveSession(options?: ActiveSessionOptions) {
  const session = await getActiveSession();
  return assertActiveSession(session, options);
}

export async function requireAdminSession(options?: ActiveSessionOptions) {
  const session = await requireActiveSession(options);
  if (session.user.role?.toLowerCase() !== "admin") throw new Error("Hanya admin yang diizinkan.");
  return session;
}
