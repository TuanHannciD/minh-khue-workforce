import { writeFile, appendFile, mkdtemp, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  apiSourceFingerprint,
  validServices,
  same,
} from "./gateway-policy.mjs";
import { validVerifiedState } from "./auto-rollback.mjs";
import { resolveExactRelease } from "./resolve-release.mjs";
import { createGithubApi } from "./github-actions.mjs";
import { parseJsonStrict } from "./validate-manifest.mjs";

export async function selectApiReuse(
  {
    previous,
    sha,
    repository,
    postgresImage,
    fingerprintAt,
    verifyAttestation,
    inspectApi,
  },
  api,
) {
  const currentFingerprint = fingerprintAt(sha);
  const normal = {
    mode: "build",
    apiSourceFingerprint: currentFingerprint,
    apiSourceSha: sha,
  };
  if (
    !previous?.manifest?.buildInputs ||
    !validVerifiedState(previous) ||
    !validServices(previous.runtimeServices, previous.manifest)
  )
    return normal;
  const inputs = previous.manifest.buildInputs;
  if (
    currentFingerprint !== inputs.apiSourceFingerprint ||
    postgresImage !== previous.manifest.postgresImage
  )
    return normal;
  // Equal candidate digests are insufficient: check producer, source and signing.
  const o = previous.ownership;
  await resolveExactRelease(
    {
      sha: previous.releaseSha,
      repository,
      dispatchRef: "refs/heads/main",
      artifactId: o.artifactId,
      runId: o.runId,
    },
    api,
  );
  const artifact = await api.artifact(o.artifactId),
    run = await api.run(o.runId);
  const manifest = await api.jsonFromArtifact(
    o.artifactId,
    "release-manifest.json",
  );
  const metadata = await api.jsonFromArtifact(
    o.artifactId,
    "build-metadata.json",
  );
  if (
    String(run.run_attempt) !== o.runAttempt ||
    artifact.digest !== o.artifactDigest ||
    !same(manifest, previous.manifest) ||
    run.repository?.full_name !== repository ||
    run.head_repository?.full_name !== repository ||
    metadata.apiDigest !== manifest.apiImage.split("@")[1] ||
    fingerprintAt(previous.releaseSha) !== currentFingerprint ||
    fingerprintAt(inputs.apiSourceSha) !== currentFingerprint
  )
    throw new Error("API reuse provenance/source mismatch");
  if (!(await verifyAttestation(manifest)))
    throw new Error(
      "API reuse requires verified canonical manifest attestation",
    );
  const identity = await inspectApi(manifest.apiImage);
  if (
    identity.image !== manifest.apiImage ||
    identity.revision !== inputs.apiSourceSha ||
    identity.source !== `https://github.com/${repository}`
  )
    throw new Error("API reuse image labels/source mismatch");
  return {
    mode: "gateway-only",
    apiImage: manifest.apiImage,
    apiDigest: manifest.apiImage.split("@")[1],
    apiSourceFingerprint: currentFingerprint,
    apiSourceSha: inputs.apiSourceSha,
    previous,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = await mkdtemp(join(tmpdir(), "mkw-api-reuse-"));
  try {
    const previous = process.env.PREVIOUS_STATE
      ? parseJsonStrict(process.env.PREVIOUS_STATE)
      : null;
    const result = await selectApiReuse(
      {
        previous,
        sha: process.env.GITHUB_SHA,
        repository: process.env.GITHUB_REPOSITORY,
        postgresImage: process.env.POSTGRES_IMAGE,
        fingerprintAt: (ref) => apiSourceFingerprint(process.cwd(), ref),
        verifyAttestation: async (manifest) => {
          const path = join(dir, "release-manifest.json");
          // Preserve canonical bytes: the build producer uses two-space JSON + LF.
          await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
          try {
            execFileSync(
              "gh",
              [
                "attestation",
                "verify",
                path,
                "--repo",
                process.env.GITHUB_REPOSITORY,
                "--signer-workflow",
                `${process.env.GITHUB_REPOSITORY}/.github/workflows/build-release.yml`,
              ],
              { stdio: "pipe" },
            );
            return true;
          } catch {
            return false;
          }
        },
        inspectApi: async (image) => {
          execFileSync("docker", ["pull", "--quiet", image], { stdio: "pipe" });
          const [info] = JSON.parse(
            execFileSync("docker", ["image", "inspect", image], {
              encoding: "utf8",
            }),
          );
          return {
            image: info.RepoDigests?.includes(image) ? image : "unknown",
            revision:
              info.Config?.Labels?.["org.opencontainers.image.revision"],
            source: info.Config?.Labels?.["org.opencontainers.image.source"],
          };
        },
      },
      createGithubApi({
        repository: process.env.GITHUB_REPOSITORY,
        token: process.env.GH_TOKEN,
      }),
    );
    await writeFile("api-selection.json", `${JSON.stringify(result)}\n`);
    for (const [key, value] of Object.entries({
      mode: result.mode,
      api_image: result.apiImage ?? "",
      digest: result.apiDigest ?? "",
      api_source_fingerprint: result.apiSourceFingerprint,
      api_source_sha: result.apiSourceSha,
    }))
      await appendFile(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
