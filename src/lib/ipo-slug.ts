/** Both ipowatch.in and sahi.com use the same company-name-to-slug convention. */
export function toIpoSlug(companyName: string): string {
  return companyName
    .replace(/\b(Ltd\.?|Limited|Pvt\.?\s*Ltd\.?|Private Limited)\b/gi, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
