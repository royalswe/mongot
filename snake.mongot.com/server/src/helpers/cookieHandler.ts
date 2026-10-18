import { Cookie } from '../models/cookie';
import sessions from 'client-sessions';

/**
 * Get cookie by its name
 * @param req 
 * @param name 
 * @returns 
 */
export function getCookie(req: any, name: string): string | null {
  // @ts-ignore
  return (req.cookies ??= req.getHeader('cookie')).match(getCookie[name] ??= new RegExp(`(^|;)\\s*${name}\\s*=\\s*([^;]+)`))?.[2];
}

/**
 * generate cookie string
 * @param options 
 * @returns 
 */
export function createSetCookie(options: Cookie): string {
  const {
    maxAge = new Date().getTime() + 1000 * 60 * 60 * 24 * 365, // one year
    domain = 'mongot.com',
    path = '/',
    secure = true,
    httpOnly = true,
    sameSite = 'lax'
  } = options;

  return `${options.name}=${options.value}`
    + `; Max-Age=${maxAge}`
    + `; Domain=${domain}`
    + `; Path=${path}`
    + `${secure ? '; Secure' : ''}`
    + `${httpOnly ? '; HttpOnly' : ''}`
    + `; SameSite=${sameSite}`;
}

/**
 * Returns user object from encrypted cookie
 * @param req 
 * @returns 
 */
export function getUserByCookie(req: any) {
  const cookie = getCookie(req, 'session');

  if (cookie == null) {
    return null; // no session cookie
  }

  const user = sessions.util.decode({
    cookieName: "session",
    secret: process.env.COOKIE_SECRET || "", // Random string as secret
    duration: 3600 * 1000 * 24 * 365, // cookie expires after one year
    activeDuration: 3600 * 1000 * 24 * 30, // cookie expire after 30 days if user is not active
  }, cookie);

  return user?.content?.user || null;

}