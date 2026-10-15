import { test, expect } from "@playwright/test";
import { db } from "./db";
import {
  clearPjAuthAttempts,
  cleanupE2EData,
  getAdminUser,
  getPjUser,
  login,
  loginAdmin,
  testPj,
  waitBetweenAuthOperations,
} from "./helpers";

const uniqueEmail = () => `e2e-must-change-${Date.now()}@example.test`;

 test.describe.serial("Auth", () => {
  test.beforeAll(async () => {
    await clearPjAuthAttempts();
  });

  test.afterEach(async () => {
    await clearPjAuthAttempts();
    await cleanupE2EData();
    await waitBetweenAuthOperations();
  });

  test("login valid admin succeeds", async ({ page }) => {
    await loginAdmin(page);
    await waitBetweenAuthOperations();
    await expect(page.getByText("Dashboard", { exact: true }).first()).toBeVisible();
  });

  test("login invalid password shows error without locking admin", async ({ page }) => {
    const account = testPj();
    await login(page, account.email, `${account.password}-wrong`);
    await expect(page.getByText(/Email atau kata sandi tidak valid|Invalid email or password/i)).toBeVisible();
    await clearPjAuthAttempts();
  });

  // TODO: Tests 3-5 can hit Better Auth's built-in auth rate-limit when run back-to-back.
  // Rerun after ~15 minutes, or run this file separately with a pause; do not change production rateLimit.
  test("user with mustChangePassword is forced to change password", async ({ page }) => {
    await loginAdmin(page);
    await waitBetweenAuthOperations();
    const email = uniqueEmail();
    const name = "[E2E] Must Change Password";

    await page.goto("/admin/users");
    await page.getByRole("button", { name: "Tambah User", exact: true }).click();
    await page.getByPlaceholder("Nama").fill(name);
    await page.getByPlaceholder("NIP").fill(`E2E-${Date.now()}`);
    await page.getByPlaceholder("Email").fill(email);
    let temporaryPassword = "";
    page.once("dialog", async (dialog) => {
      const match = dialog.message().match(/Password sementara:\s*(.+)/);
      if (match) {
        temporaryPassword = match[1].trim();
      }
      await dialog.accept();
    });
    await page.getByRole("button", { name: "Buat User", exact: true }).click();
    await expect.poll(async () => db<{ mustChangePassword: boolean } | null>("getUserPasswordState", { email })).toMatchObject({ mustChangePassword: true });
    expect(temporaryPassword.length).toBeGreaterThanOrEqual(12);

    await page.getByRole("button", { name: "Keluar Sistem", exact: true }).click();
    await waitBetweenAuthOperations();
    await expect(page).toHaveURL(/\/login/);
    await login(page, email, temporaryPassword);
    await expect(page).toHaveURL(/\/account\/change-password/);

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/account\/change-password/);
  });

  test("sixth failed PJ login is rate-limited, never admin", async ({ page }) => {
    // Deliberately use dedicated TEST_PJ account. Never lock TEST_ADMIN_EMAIL.
    const account = testPj();
    await clearPjAuthAttempts();

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await login(page, account.email, `${account.password}-wrong-${attempt}`);
      await expect(page.getByText(/Email atau kata sandi tidak valid|Invalid email or password/i)).toBeVisible();
    }

    await login(page, account.email, `${account.password}-wrong-sixth`);
    await expect(page.getByText(/Terlalu banyak percobaan|coba lagi/i)).toBeVisible();
    await expect(page.getByText(/Coba lagi dalam \d+:\d{2}/i)).toBeVisible();
    await clearPjAuthAttempts();
  });

  test("PJ appears in assignment dropdown while admin does not", async ({ page }) => {
    await loginAdmin(page);
    await waitBetweenAuthOperations();
    const pj = await getPjUser();
    const admin = await getAdminUser();

    await page.goto("/admin/master");
    await page.getByRole("button", { name: "Tambah Kegiatan Baru", exact: true }).click();
    const pjSelect = page.getByLabel("PJ Kegiatan");
    await expect(pjSelect.locator("option", { hasText: pj.name })).toHaveCount(1);
    await expect(pjSelect.locator("option", { hasText: admin.name })).toHaveCount(0);
  });
});


