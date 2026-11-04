"use client";

import { useEffect } from "react";

import { ErrorScreen } from "@/components/errors/error-screen";
import { reportError } from "@/lib/report-error";

export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => reportError(error, "screen"), [error]);
  return <ErrorScreen retry={retry} />;
}
