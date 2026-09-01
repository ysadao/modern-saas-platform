export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export type Role = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";

export const ROLE_RANK: Record<Role, number> = {
  VIEWER: 1,
  MEMBER: 2,
  ADMIN: 3,
  OWNER: 4,
};

export function publicUser(user: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  emailVerifiedAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}
