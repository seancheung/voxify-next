import { Job } from "sidequest";
import { runDesign } from "./design-voice.worker";
import type { ExportJobData } from "./export-project.server";
import { renderExport } from "./export-render.server";
import { processTTSJob } from "./generate-segment.worker";

export class GenerateSegment extends Job {
  run(segmentId: number) {
    return processTTSJob(segmentId, this.abortSignal);
  }
}
export class DesignVoice extends Job {
  run(designId: number) {
    return runDesign(designId);
  }
}
export class ExportProject extends Job {
  run(data: ExportJobData) {
    return renderExport(data, this.abortSignal);
  }
}
