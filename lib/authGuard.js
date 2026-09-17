import { readSession, SESSION_COOKIE } from "./session.js";

export async function getSessionUser(request) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  return await readSession(token); // { userId } or null
}
