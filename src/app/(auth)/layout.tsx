import Link from "next/link";
import { ReceiptText } from "lucide-react";

/** Sign up, log in and password reset: a simple page without the app's menu. */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="mx-auto flex w-full max-w-md items-center px-4 py-5">
        <Link href="/" className="flex min-h-11 items-center gap-2 text-lg font-bold">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ReceiptText className="size-5" />
          </span>
          InCeipt
        </Link>
      </header>
      <main className="mx-auto w-full max-w-md flex-1 px-4 pb-10">{children}</main>
    </div>
  );
}
