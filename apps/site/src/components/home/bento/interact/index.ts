/**
 * Entry of the bento interactions: registers every interactive scene and
 * exposes the one function the Features section calls.
 */
import { initFlagToggle } from "./flag-toggle";
import { initApproval } from "./hold-approve";
import { registerScene } from "./registry";
import { initReviewGate } from "./review-gate";
import { initSpotlight } from "./spotlight";

registerScene("spotlight", initSpotlight);
registerScene("approval", initApproval);
registerScene("review", initReviewGate);
registerScene("flags", initFlagToggle);

export { initBentoInteractions } from "./registry";
