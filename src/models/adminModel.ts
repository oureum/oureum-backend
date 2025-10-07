import { query } from "../db";

export async function getAdminByWallet(address: string) {
  const res = await query<{ wallet_address: string }>(
    "SELECT wallet_address FROM admins WHERE lower(wallet_address) = lower($1) LIMIT 1",
    [address]
  );
  return res.rows[0] || null;
}

export async function insertAdmin(address: string) {
  await query(
    "INSERT INTO admins(wallet_address) VALUES($1) ON CONFLICT DO NOTHING",
    [address]
  );
}