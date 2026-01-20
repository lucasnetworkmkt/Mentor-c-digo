
import { UserProfile } from "../types";

// KEYS FOR STORAGE - Version 2 to ensure clean slate
const DB_USERS_KEY = 'mentor_db_users_v2';
const SESSION_KEY = 'mentor_auth_session_v2';

// UTILS
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper: Convert ArrayBuffer to Hex String
const bufferToHex = (buffer: ArrayBuffer): string => {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
};

// SECURITY: Generate a random salt
const generateSalt = (): string => {
  const array = new Uint8Array(16);
  window.crypto.getRandomValues(array);
  return bufferToHex(array.buffer);
};

// SECURITY: Hash password with Salt using SHA-256
const hashPasswordWithSalt = async (password: string, salt: string): Promise<string> => {
  const encoder = new TextEncoder();
  // Combine password and salt
  const data = encoder.encode(password + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return bufferToHex(hashBuffer);
};

interface StoredUser {
  id: string;
  email: string;
  passwordHash: string;
  salt: string; // Store the unique salt per user
  name: string;
  createdAt: string;
  lastLogin: string;
}

export const authService = {
  
  /**
   * Registers a new user with Salted Password Hashing
   */
  async register(name: string, email: string, password: string): Promise<UserProfile> {
    await delay(1000); // Realistic delay

    const db = JSON.parse(localStorage.getItem(DB_USERS_KEY) || '{}');
    const normalizedEmail = email.toLowerCase().trim();

    if (db[normalizedEmail]) {
      throw new Error('Este e-mail já está em uso no sistema.');
    }

    const id = crypto.randomUUID();
    const salt = generateSalt(); // Generate unique salt
    const passwordHash = await hashPasswordWithSalt(password, salt); // Hash with salt
    const now = new Date().toISOString();

    const newUser: StoredUser = {
      id,
      email: normalizedEmail,
      name: name.trim(),
      passwordHash,
      salt,
      createdAt: now,
      lastLogin: now
    };

    // Save to "DB"
    db[normalizedEmail] = newUser;
    try {
        localStorage.setItem(DB_USERS_KEY, JSON.stringify(db));
    } catch (e) {
        throw new Error('Falha no armazenamento local. Espaço insuficiente ou bloqueado.');
    }

    // Create session
    const profile: UserProfile = {
      id: newUser.id,
      email: newUser.email,
      name: newUser.name,
      createdAt: newUser.createdAt,
      lastLogin: newUser.lastLogin
    };
    
    localStorage.setItem(SESSION_KEY, JSON.stringify(profile));
    return profile;
  },

  /**
   * Authenticates a user verifying Salted Hash
   */
  async login(email: string, password: string): Promise<UserProfile> {
    await delay(1000); // Realistic delay

    const db = JSON.parse(localStorage.getItem(DB_USERS_KEY) || '{}');
    const normalizedEmail = email.toLowerCase().trim();
    const user = db[normalizedEmail] as StoredUser;

    // Generic error message for security (prevents user enumeration)
    const authError = new Error('Credenciais inválidas. Verifique e-mail e senha.');

    if (!user) {
      console.warn('Auth: User not found');
      throw authError;
    }

    // Re-create the hash using the STORED salt and the INPUT password
    const inputHash = await hashPasswordWithSalt(password, user.salt);

    if (inputHash !== user.passwordHash) {
      console.warn('Auth: Hash mismatch');
      throw authError;
    }

    // Update last login
    user.lastLogin = new Date().toISOString();
    db[normalizedEmail] = user;
    localStorage.setItem(DB_USERS_KEY, JSON.stringify(db));

    const profile: UserProfile = {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin
    };

    localStorage.setItem(SESSION_KEY, JSON.stringify(profile));
    return profile;
  },

  async getSession(): Promise<UserProfile | null> {
    await delay(200);
    const sessionStr = localStorage.getItem(SESSION_KEY);
    if (!sessionStr) return null;
    try {
      return JSON.parse(sessionStr);
    } catch {
      return null;
    }
  },

  async logout(): Promise<void> {
    await delay(200);
    localStorage.removeItem(SESSION_KEY);
  }
};
