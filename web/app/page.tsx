import { DoorHubMonitor } from "./DoorHubMonitor";
import { buildDoorHubDemo } from "@/lib/door-hub-demo";

export default async function Home() {
  return <DoorHubMonitor initialSnapshot={buildDoorHubDemo("delivery")} />;
}
