param([string]$EvidencePath, [string]$TaskId = [guid]::NewGuid().ToString())
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
if (-not $EvidencePath) { $EvidencePath = ".agent-runs/MKW-DEPLOY-ACCOUNT-001/$TaskId" }
$evidenceInput = if ([IO.Path]::IsPathRooted($EvidencePath)) { $EvidencePath } else { Join-Path $repoRoot $EvidencePath }
$evidenceRoot = [IO.Path]::GetFullPath($evidenceInput)
if (-not $evidenceRoot.StartsWith((Join-Path $repoRoot '.agent-runs') + [IO.Path]::DirectorySeparatorChar)) { throw 'Evidence must stay inside this worktree .agent-runs' }
& node (Join-Path $PSScriptRoot 'local-rehearsal-engine.mjs') $evidenceRoot $TaskId
exit $LASTEXITCODE
