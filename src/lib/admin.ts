// Solo-project "admin" — a real roles/permissions system is unwarranted
// scope for one operator. An email allowlist is the whole access-control
// model, checked both in the page (UX) and every server action (the
// actual security boundary).
const ADMIN_EMAILS = ["aish.iiitb@gmail.com", "aishsocial1@gmail.com"];

export function isAdminEmail(email: string | null | undefined): boolean {
  return !!email && ADMIN_EMAILS.includes(email);
}
