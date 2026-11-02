import { withCleanup } from "../../../scripts/product/cleanup.mjs";

// Test instrumentation only. Always attempt the original destructor, retaining
// the check error as well as any destructor error through the shared owner helper.
export async function runCheckedDestroy({ check, destroy }) {
  let result;
  await withCleanup(check, async () => {
    result = await destroy();
  });
  return result;
}
