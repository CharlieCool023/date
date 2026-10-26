import { VeilLoader } from "@/components/loaders";

export default function Loading() {
  return <main className="shell"><VeilLoader caption="Fetching the review queues" /></main>;
}
