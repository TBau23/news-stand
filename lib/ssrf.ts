import { lookup } from "dns/promises";

const BLOCKED_IPV4_RANGES = [
  { prefix: "127.", mask: 8 },
  { prefix: "10.", mask: 8 },
  { prefix: "0.", mask: 8 },
  { prefix: "169.254.", mask: 16 },
  { prefix: "192.168.", mask: 16 },
];

// 172.16.0.0/12 covers 172.16.x.x – 172.31.x.x
function isIn172Range(ip: string): boolean {
  if (!ip.startsWith("172.")) return false;
  const second = parseInt(ip.split(".")[1], 10);
  return second >= 16 && second <= 31;
}

const BLOCKED_IPV6 = ["::1", "::"];

function isBlockedIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (BLOCKED_IPV6.includes(normalized)) return true;
  // fc00::/7 (unique local) and fe80::/10 (link-local)
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (normalized.startsWith("fe80")) return true;
  return false;
}

export function isPrivateIP(ip: string): boolean {
  if (isIn172Range(ip)) return true;
  if (BLOCKED_IPV4_RANGES.some(({ prefix }) => ip.startsWith(prefix))) return true;
  if (isBlockedIPv6(ip)) return true;
  return false;
}

/**
 * Resolves a hostname and checks that it does not point to a private/reserved IP.
 * Throws if the hostname resolves to a blocked address.
 */
export async function assertPublicHost(hostname: string): Promise<void> {
  // Block literal "localhost"
  if (hostname === "localhost" || hostname === "localhost.") {
    throw new SSRFError("Blocked host");
  }

  try {
    const { address } = await lookup(hostname);
    if (isPrivateIP(address)) {
      throw new SSRFError("Blocked host");
    }
  } catch (err) {
    if (err instanceof SSRFError) throw err;
    throw new SSRFError("DNS resolution failed");
  }
}

export class SSRFError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SSRFError";
  }
}
