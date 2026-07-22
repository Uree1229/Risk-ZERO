import { Dashboard } from "./Dashboard";
import { buildDemoSnapshot } from "@/lib/demo-runtime";

export default async function Home() {
  const initialSnapshot = await buildDemoSnapshot("normal");
  return <Dashboard initialSnapshot={initialSnapshot} />;
}
