import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import type { Request, Response, NextFunction } from "express";

export interface PublicUser {
  username: string;
  role: "admin" | "user";
  vip: boolean;
  vipUntil?: string | null;
}

interface StoredUser extends PublicUser {
  salt: string;
  passwordHash: string;
  createdAt: string;
}

interface TokenPayload {
  sub: string;
  role: "admin" | "user";
  vip?: boolean;
  vipUntil?: string | null;
  exp: number;
}

export interface AuthenticatedRequest extends Request {
  user?: PublicUser;
}

const dataDir = path.resolve(process.cwd(), "data");
const usersFile = path.join(dataDir, "users.json");
const tokenSecret = process.env.AUTH_SECRET || "alum4k-local-dev-secret";
const adminPassword = process.env.ADMIN_PASSWORD || "admin123456";
let pendingWrite: Promise<unknown> = Promise.resolve();

function mutateUsers<T>(update: (users: StoredUser[]) => Promise<T>) {
  const next = pendingWrite.then(async () => update(await readUsers()));
  pendingWrite = next.catch(() => undefined);
  return next;
}

function base64url(input: Buffer | string) {
  return Buffer.from(input).toString("base64url");
}

function sign(value: string) {
  return crypto.createHmac("sha256", tokenSecret).update(value).digest("base64url");
}

function hashPassword(password: string, salt = crypto.randomBytes(16).toString("hex")) {
  const passwordHash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, passwordHash };
}

function verifyPassword(password: string, user: StoredUser) {
  const { passwordHash } = hashPassword(password, user.salt);
  const left = Buffer.from(passwordHash, "hex");
  const right = Buffer.from(user.passwordHash, "hex");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

async function readUsers(): Promise<StoredUser[]> {
  try {
    const raw = await readFile(usersFile, "utf-8");
    const users = JSON.parse(raw) as Array<StoredUser | Omit<StoredUser, "vip" | "vipUntil">>;
    return users.map((user) => ({
      ...user,
      vip: user.role === "admin" || Boolean("vip" in user ? user.vip : false),
      vipUntil: user.role === "admin" ? null : "vipUntil" in user ? user.vipUntil ?? null : null
    }));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function writeUsers(users: StoredUser[]) {
  await mkdir(dataDir, { recursive: true });
  const temporaryFile = `${usersFile}.${crypto.randomUUID()}.tmp`;
  await writeFile(temporaryFile, `${JSON.stringify(users, null, 2)}\n`, { encoding: "utf-8", mode: 0o600 });
  await rename(temporaryFile, usersFile);
}

function isVipActive(user: Pick<StoredUser, "role" | "vip" | "vipUntil">) {
  if (user.role === "admin") return true;
  if (!user.vip) return false;
  if (!user.vipUntil) return true;
  const expiresAt = Date.parse(user.vipUntil);
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

function publicUser(user: StoredUser): PublicUser {
  return {
    username: user.username,
    role: user.role,
    vip: isVipActive(user),
    vipUntil: user.role === "admin" ? null : user.vipUntil ?? null
  };
}

function createToken(user: PublicUser) {
  const payload: TokenPayload = {
    sub: user.username,
    role: user.role,
    vip: user.role === "admin" || Boolean(user.vip),
    vipUntil: user.vipUntil ?? null,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7
  };
  const encodedPayload = base64url(JSON.stringify(payload));
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

function parseToken(token: string): TokenPayload | null {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature || sign(encodedPayload) !== signature) return null;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf-8")) as TokenPayload;
    if (!payload.sub || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

async function userFromToken(token: string) {
  const payload = parseToken(token);
  if (!payload) return null;

  const users = await readUsers();
  const user = users.find((entry) => entry.username === payload.sub.trim().toLowerCase());
  return user ? publicUser(user) : null;
}

export async function userFromRequest(request: Request): Promise<PublicUser | null> {
  const authHeader = request.headers.authorization;
  const queryToken = typeof request.query.token === "string" ? request.query.token : "";
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : queryToken;
  return token ? userFromToken(token) : null;
}

export async function ensureAdminUser() {
  return mutateUsers(async (users) => {
    const admin = users.find((user) => user.username === "admin");
    if (admin) {
      admin.vip = true;
      await writeUsers(users);
      return;
    }

    const hash = hashPassword(adminPassword);
    users.unshift({
      username: "admin",
      role: "admin",
      vip: true,
      vipUntil: null,
      salt: hash.salt,
      passwordHash: hash.passwordHash,
      createdAt: new Date().toISOString()
    });
    await writeUsers(users);
  });
}

function validateAccount(username: string, password: string, minimum = 6) {
  const normalized = username.trim().toLowerCase();
  if (!/^[a-z0-9_\u4e00-\u9fa5]{3,20}$/i.test(normalized)) {
    throw new Error("用户名需为 3-20 位，可包含中文、字母、数字或下划线。");
  }
  if (password.length < minimum || password.length > 128) throw new Error(`密码需为 ${minimum}-128 位。`);
  return normalized;
}

async function createAccount(username: string, password: string, role: "user" | "admin") {
  const normalized = validateAccount(username, password, role === "admin" ? 10 : 6);
  if (normalized === "admin") throw new Error("admin 是内置管理员账号。");
  return mutateUsers(async (users) => {
    if (users.some((user) => user.username === normalized)) {
      throw new Error("用户名已存在。");
    }

    const hash = hashPassword(password);
    const user: StoredUser = {
      username: normalized,
      role,
      vip: role === "admin",
      vipUntil: null,
      salt: hash.salt,
      passwordHash: hash.passwordHash,
      createdAt: new Date().toISOString()
    };
    users.push(user);
    await writeUsers(users);

    return publicUser(user);
  });
}

export async function createAdminUser(username: string, password: string) {
  return createAccount(username, password, "admin");
}

export async function registerUser(username: string, password: string) {
  const safe = await createAccount(username, password, "user");
  return { user: safe, token: createToken(safe) };
}

export async function loginUser(username: string, password: string) {
  const users = await readUsers();
  const user = users.find((entry) => entry.username === username.trim().toLowerCase());
  if (!user || !verifyPassword(password, user)) {
    throw new Error("用户名或密码不正确。");
  }

  const safe = publicUser(user);
  return { user: safe, token: createToken(safe) };
}

export async function listUsers() {
  const users = await readUsers();
  return users.map((user) => ({
    username: user.username,
    role: user.role,
    vip: isVipActive(user),
    vipUntil: user.role === "admin" ? null : user.vipUntil ?? null,
    createdAt: user.createdAt
  }));
}

function normalizeVipUntil(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null || value === "" || value === "permanent") return null;
  const text = String(value).trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(`${text}T23:59:59.999+08:00`) : new Date(text);
  if (Number.isNaN(date.getTime())) {
    throw new Error("VIP 到期时间格式不正确。");
  }
  return date.toISOString();
}

export async function setUserVip(username: string, vip: boolean, vipUntil?: unknown) {
  return mutateUsers(async (users) => {
    const user = users.find((entry) => entry.username === username.trim().toLowerCase());
    if (!user) {
      throw new Error("用户不存在。");
    }

    const normalizedUntil = normalizeVipUntil(vipUntil);
    user.vip = user.role === "admin" ? true : vip;
    user.vipUntil = user.role === "admin" ? null : vip ? normalizedUntil === undefined ? user.vipUntil ?? null : normalizedUntil : null;
    await writeUsers(users);
    return {
      username: user.username,
      role: user.role,
      vip: isVipActive(user),
      vipUntil: user.role === "admin" ? null : user.vipUntil ?? null,
      createdAt: user.createdAt
    };
  });
}

export async function requireAuth(request: AuthenticatedRequest, response: Response, next: NextFunction) {
  try {
    const user = await userFromRequest(request);

    if (!user) {
      response.status(401).json({ message: "请先登录。" });
      return;
    }

    request.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

export async function requireAdmin(request: AuthenticatedRequest, response: Response, next: NextFunction) {
  try {
    const user = await userFromRequest(request);

    if (!user) {
      response.status(401).json({ message: "请先登录。" });
      return;
    }

    if (user.role !== "admin") {
      response.status(403).json({ message: "需要管理员权限。" });
      return;
    }

    request.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

export async function requireVip(request: AuthenticatedRequest, response: Response, next: NextFunction) {
  try {
    const user = await userFromRequest(request);

    if (!user) {
      response.status(401).json({ message: "请先登录。" });
      return;
    }

    if (!user.vip && user.role !== "admin") {
      response.status(403).json({ message: "需要 VIP 会员权限。" });
      return;
    }

    request.user = user;
    next();
  } catch (error) {
    next(error);
  }
}
