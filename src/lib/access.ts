import { getProStatus } from "./db";
import { permissionsFor, type Permissions, type Role } from "./permissions";

export type ProSource = "legacy" | "subscription" | "comp";

export interface Access {
  /** "local": records on this phone only. "cloud": signed in to a business account. */
  mode: "local" | "cloud";
  isPro: boolean;
  proSource: ProSource | null;
  role: Role;
  can: Permissions;
}

/** Work out what the current user can do. */
export async function loadAccess(): Promise<Access> {
  const legacy = await getProStatus();
  const isPro = legacy.unlocked;
  return {
    mode: "local",
    isPro,
    proSource: isPro ? "legacy" : null,
    role: "owner",
    can: permissionsFor("owner", isPro),
  };
}
