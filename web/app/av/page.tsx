import { Dashboard } from "../Dashboard";
import { buildDemoSnapshot } from "@/lib/demo-runtime";

export default async function AudioVisualPage() {
  return <Dashboard initialSnapshot={await buildDemoSnapshot("normal")} />;
}
