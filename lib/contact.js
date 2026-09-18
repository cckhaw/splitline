// The address /privacy and /terms point people to for data requests and
// legal notices. Configurable via CONTACT_EMAIL — no NEXT_PUBLIC_ prefix
// needed since both pages are server components rendered at request time,
// never shipped into the client bundle.
export const CONTACT_EMAIL = process.env.CONTACT_EMAIL || "splitline@khaw.cc";
