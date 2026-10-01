import { isValidUnlockCode } from "@/lib/unlock-codes";

// TEMPORARY: see src/lib/unlock-codes.ts. Replace with a real backend before scaling.
export async function POST(request: Request) {
  let code = "";
  try {
    const body: unknown = await request.json();
    if (typeof body === "object" && body !== null && "code" in body && typeof body.code === "string") code = body.code;
  } catch {
    // fall through to "invalid"
  }

  // A small pause makes guessing codes slow.
  await new Promise((r) => setTimeout(r, 400));

  if (!isValidUnlockCode(code, process.env.PRO_UNLOCK_CODES)) {
    return Response.json({ ok: false, error: "That code didn't work. Check it and try again." }, { status: 400 });
  }
  return Response.json({ ok: true });
}
