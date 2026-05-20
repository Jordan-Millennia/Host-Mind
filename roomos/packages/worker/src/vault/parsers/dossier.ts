import matter from "gray-matter"
import type { VaultMemberDossier } from "../types"

export function parseDossier(content: string, filePath: string): VaultMemberDossier {
  const { data } = matter(content)
  const str = (k: string): string | null => {
    const v = data[k]
    return v === undefined || v === null || v === "" ? null : String(v)
  }
  const num = (k: string): number | null => {
    const v = data[k]
    if (v === undefined || v === null || v === "") return null
    const n = typeof v === "number" ? v : Number(v)
    return Number.isFinite(n) ? n : null
  }
  return {
    filePath,
    memberId: str("member-id"),
    name: str("name") ?? "",
    email: str("email-cached"),
    phone: str("phone-cached"),
    weeklyRate: num("weekly-rate"),
    moveInDate: str("move-in-date"),
    status: str("status"),
    balance: num("balance"),
    lastPaymentDate: str("last-payment-date"),
    lastPaymentAmount: num("last-payment-amount"),
  }
}
