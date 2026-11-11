import { Sidequest } from "sidequest";
import { jobClasses } from "./queue.server";
export async function addDesignVoiceJob({ designId }: { designId: number }) {
  const { DesignVoice } = await jobClasses();
  return Sidequest.build(DesignVoice)
    .queue("design-voice")
    .unique({ withArgs: true })
    .maxAttempts(1)
    .enqueue(designId);
}
