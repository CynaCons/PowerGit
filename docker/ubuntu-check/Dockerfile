# PowerGit Linux smoke check (Ubuntu).
# Builds an image with .NET 10 + Node 22 + Playwright deps, mounts the repo,
# runs engine tests + headless e2e against a real Linux git.
#
# Usage (from repo root, Docker Desktop running):
#   pwsh scripts/ubuntu-check.ps1
FROM mcr.microsoft.com/dotnet/sdk:10.0-noble

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
        curl ca-certificates git \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Playwright chromium dependencies (headless shell libs)
RUN npx -y playwright@latest install-deps chromium || true

WORKDIR /repo
COPY check.sh /usr/local/bin/check.sh
# Windows checkouts carry CRLF (core.autocrlf); a CRLF shebang cannot exec.
RUN sed -i 's/\r$//' /usr/local/bin/check.sh && chmod +x /usr/local/bin/check.sh
ENTRYPOINT ["/usr/local/bin/check.sh"]
