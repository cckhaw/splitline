import { readAdminSession, ADMIN_SESSION_COOKIE } from "./adminSession.js";

export async function getAdminSession(request) {
  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  return await readAdminSession(token); // { admin: true } or null
}
