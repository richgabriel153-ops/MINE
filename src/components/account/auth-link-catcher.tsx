"use client";

import { useEffect } from "react";

import { CONFIRM_PATH } from "@/lib/auth";

/**
 * If an email link lands on any other page (e.g. Supabase sent it to the Site URL),
 * pass it on to the confirm page so the person is still logged in.
 */
export function AuthLinkCatcher() {
  useEffect(() => {
    const { hash, pathname, search } = window.location;
    if (pathname === CONFIRM_PATH) return;
    if (/(^|[#&])(access_token|error_description)=/.test(hash) || /[?&]token_hash=/.test(search)) {
      window.location.replace(`${CONFIRM_PATH}${search}${hash}`);
    }
  }, []);
  return null;
}
