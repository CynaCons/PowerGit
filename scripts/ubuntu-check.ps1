# Builds and runs the Ubuntu smoke-check container against this repo.
# Requires Docker Desktop.
#
# frontend/node_modules is shadowed by a named volume so Linux-native
# binaries (esbuild etc.) never clobber the Windows install on the host.
$ErrorActionPreference = "Stop"

$repo = (Resolve-Path "$PSScriptRoot\..").Path
docker build -t powergit-ubuntu-check "$repo\docker\ubuntu-check"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

docker run --rm `
  -v "${repo}:/repo" `
  -v "powergit-frontend-modules:/repo/frontend/node_modules" `
  -e GIT_CONFIG_COUNT=2 `
  -e GIT_CONFIG_KEY_0=user.email -e GIT_CONFIG_VALUE_0=ci@powergit.local `
  -e GIT_CONFIG_KEY_1=user.name -e GIT_CONFIG_VALUE_1="PowerGit CI" `
  powergit-ubuntu-check
exit $LASTEXITCODE
