/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Worked-sample registry. Loading the demo brings in BOTH samples so the
 * workspace has more than one tender — enough for Client & Sector Memory
 * to group, and for the tender switcher to feel real. The Bluewater
 * sample is the one the user lands on (mid-workflow, imperfect); Riverside
 * is a finished, won tender in the background.
 */
import { loadWorkedSample as loadBluewater, SAMPLE_TENDER_ID, WorkedSample } from './bluewaterSample';
import { loadRiversideSample, RIVERSIDE_TENDER_ID } from './riversideSample';

export { SAMPLE_TENDER_ID, RIVERSIDE_TENDER_ID };

/** The sample the user is taken to after loading. */
export const PRIMARY_SAMPLE_ID = SAMPLE_TENDER_ID;

/** Loads all worked samples (fresh copies). */
export function loadAllSamples(): WorkedSample[] {
  return [loadBluewater(), loadRiversideSample()];
}
