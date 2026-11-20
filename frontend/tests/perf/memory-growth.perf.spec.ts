import { expect, test } from '@playwright/test';
import { mockAnalyze, mockAuth, mockHealth, signIn } from '../e2e/fixtures/mock-api';

/**
 * Re-runs the full analyze flow 10 times in one session and measures the Chrome JS heap after a
 * forced GC between runs (via CDP `HeapProfiler.collectGarbage`, which needs no `--expose-gc`
 * flag), to check for the listener/layer leak the review's lens calls out
 * (`GridOverlay`/`map-controller.ts`/`map-actions.ts` were inspected first — see
 * `docs/BENCHMARKS.md` for that code-reading finding). A monotonically, substantially growing
 * heap after GC across 10 runs would indicate a real leak; a flat or noisy-but-bounded series
 * would not.
 *
 * Caveats stated honestly in BENCHMARKS.md: `performance.memory`/CDP heap metrics are coarse,
 * one run is one sample, and MapLibre's own WebGL/GPU memory is not visible to the JS heap at all
 * — this measures the React/application-side heap only.
 */

test('memory growth across 10 analyze re-runs', async ({ page }) => {
  await mockHealth(page);
  await mockAuth(page);
  await mockAnalyze(page);
  await signIn(page);

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');

  const heapAfterGc = async (): Promise<number> => {
    await cdp.send('HeapProfiler.collectGarbage');
    const { metrics } = await cdp.send('Performance.getMetrics');
    const entry = metrics.find((metric) => metric.name === 'JSHeapUsedSize');
    return entry?.value ?? 0;
  };

  await page.getByRole('button', { name: /load sample field/i }).click();
  const cropCombobox = page.getByRole('combobox', { name: 'Crop' });
  await cropCombobox.click();
  await cropCombobox.fill('Wheat');
  await page.getByRole('option', { name: /^Wheat/ }).click();
  await page.getByRole('button', { name: /Step 3: Period/ }).click();
  await page.getByRole('button', { name: /Select dates/ }).click();
  await page.getByRole('button', { name: 'Last 30 days' }).click();

  const analyzeButton = page.getByRole('button', { name: 'Analyze' });
  await expect(analyzeButton).toBeEnabled();

  const samplesBytes: number[] = [await heapAfterGc()];
  const RUNS = 10;
  for (let run = 1; run <= RUNS; run += 1) {
    await analyzeButton.click();
    await expect(page.getByText(/cells needing attention/i)).toBeVisible({ timeout: 10_000 });
    // Let microtasks/effects (feature-state sync, etc.) settle before measuring.
    await page.waitForTimeout(100);
    samplesBytes.push(await heapAfterGc());
  }

  const mb = (bytes: number) => Math.round((bytes / (1024 * 1024)) * 100) / 100;
  const samplesMb = samplesBytes.map(mb);
  const firstAfterRun1 = samplesMb[1] ?? 0;
  const last = samplesMb[samplesMb.length - 1] ?? 0;
  const growthMb = Math.round((last - firstAfterRun1) * 100) / 100;

  console.log(
    `[perf] JS heap after GC, before run 1 then after each of ${String(RUNS)} runs (MB): ${JSON.stringify(samplesMb)}`,
  );

  console.log(
    `[perf] heap growth from after-run-1 to after-run-${String(RUNS)}: ${String(growthMb)} MB`,
  );
});
