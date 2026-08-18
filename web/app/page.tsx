import { TrajectoryMonitor } from "./TrajectoryMonitor";
import { buildTrajectorySnapshot } from "@/lib/trajectory-demo";

export default async function Home() {
  return <TrajectoryMonitor initialSnapshot={await buildTrajectorySnapshot("normal-delivery")} />;
}
