export const REJECTION_REASONS = [
  "Facts do not match the filing",
  "Independent source could not be verified",
  "Official filing is missing or inaccessible",
  "Duplicate or not a relevant IPO",
  "Other",
] as const;

export function validateApprovalInput(input: {
  sector?: string | null;
  factsChecked?: boolean;
  evidenceChecked?: boolean;
}): string {
  const sector = input.sector?.trim() ?? "";
  if (!input.factsChecked || !input.evidenceChecked) {
    throw new Error("Confirm both review checks before publishing");
  }
  return sector;
}

export function validateRejectionInput(input: {
  reason?: string | null;
  notes?: string | null;
}): string {
  const reason = input.reason?.trim();
  const notes = input.notes?.trim();
  if (!reason) throw new Error("Choose a rejection reason");
  if (reason === "Other" && !notes) throw new Error("Add details when choosing Other");
  return notes ? `${reason}: ${notes}` : reason;
}
