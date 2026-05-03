import { Sidebar } from "@/components/shell/sidebar";
import { TabBar } from "@/components/shell/tab-bar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <Sidebar />
      <main className="md:ml-60 pb-24 md:pb-12 min-h-screen">{children}</main>
      <TabBar />
    </div>
  );
}
