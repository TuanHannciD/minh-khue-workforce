param([string]$EvidencePath = '.agent-runs/push-main-completion/docker')
$ErrorActionPreference = 'Stop'
$taskEngine = 'mkw-cd-completion-engine-8849e8d4'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$evidenceRoot = [IO.Path]::GetFullPath((Join-Path $repoRoot $EvidencePath))
if (-not $evidenceRoot.StartsWith((Join-Path $repoRoot '.agent-runs') + [IO.Path]::DirectorySeparatorChar)) { throw 'Evidence must stay inside this worktree .agent-runs' }
New-Item -ItemType Directory -Force $evidenceRoot | Out-Null
docker info --format '{{.ServerVersion}}' | Out-File (Join-Path $evidenceRoot 'docker-version.txt')
if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop must be available for this explicit local-only entry' }
$existing = docker ps -a --filter "name=^/$taskEngine`$" --format '{{.ID}}'
if (-not $existing) {
  docker run -d --privileged --name $taskEngine --label com.mkw.owner=push-main-completion --label com.mkw.task=8849e8d4 -e DOCKER_TLS_CERTDIR= docker:29-dind --storage-driver=overlay2 --log-level=error
  if ($LASTEXITCODE -ne 0) { throw 'Cannot create owned isolated engine' }
}
$engineInfo = docker inspect $taskEngine | ConvertFrom-Json
if ($engineInfo.Config.Labels.'com.mkw.owner' -ne 'push-main-completion' -or $engineInfo.Config.Labels.'com.mkw.task' -ne '8849e8d4') { throw 'Refusing another task engine' }
$engineInfo | Select-Object Id,Name,Mounts | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $evidenceRoot 'owned-engine.json')
for ($attempt = 0; $attempt -lt 30; $attempt++) {
  docker exec $taskEngine docker info --format '{{.ServerVersion}}' 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) { break }
  Start-Sleep -Seconds 1
}
docker exec $taskEngine apk add --no-cache bash nodejs coreutils util-linux curl openssl git jq *> (Join-Path $evidenceRoot 'setup.log')
if ($LASTEXITCODE -ne 0) { throw 'Owned engine prerequisite installation failed' }
$bundlePath = Join-Path $evidenceRoot 'source.tgz'
$listPath = Join-Path $evidenceRoot 'source-files.txt'
$sourceFiles = git -C $repoRoot ls-files --cached --others --exclude-standard
[IO.File]::WriteAllLines($listPath, $sourceFiles, [Text.UTF8Encoding]::new($false))
tar -czf $bundlePath -C $repoRoot -T $listPath
if ($LASTEXITCODE -ne 0) { throw 'Local source bundle failed' }
docker cp $bundlePath "${taskEngine}:/source.tgz"
docker exec $taskEngine sh -c 'rm -rf /workspace; mkdir -p /workspace; tar -xzf /source.tgz -C /workspace; printf 8849e8d4 > /mkw-local-owned'
$ErrorActionPreference = 'Continue'
docker exec -w /workspace $taskEngine node scripts/product/local-rehearsal-driver.mjs *> (Join-Path $evidenceRoot 'rehearsal.log')
$runExit = $LASTEXITCODE
$ErrorActionPreference = 'Stop'
docker cp "${taskEngine}:/local-evidence/." $evidenceRoot
if ($runExit -ne 0) { throw "Local rehearsal failed; owned engine retained for diagnosis: $taskEngine" }
# Evidence is retained before removing only this exact task engine and its mounts.
$current = docker inspect $taskEngine | ConvertFrom-Json
if ($current.Id -ne $engineInfo.Id -or $current.Config.Labels.'com.mkw.owner' -ne 'push-main-completion') { throw 'Cleanup ownership changed' }
docker rm -f -v $taskEngine | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Owned engine cleanup failed' }
'LOCAL_REHEARSAL_OK: real containers/backup/restore; GitHub ownership/signing simulated only at external boundary'
