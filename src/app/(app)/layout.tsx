import { AccessProvider } from "@/components/access/access-provider";
import { BottomNav } from "@/components/layout/bottom-nav";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <AccessProvider>
      <div className="flex min-h-dvh flex-col md:flex-col-reverse md:justify-end">
        <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-24 has-[form[data-sticky-save]]:pb-0 md:pb-10">
          {children}
        </main>
        <BottomNav />
      </div>
    </AccessProvider>
  );
}
