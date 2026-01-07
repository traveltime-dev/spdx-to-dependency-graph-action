# SPDX to Dependency Graph Action

This repository makes it easy to upload an SPDX SBOM to GitHub's dependency submission API. This lets you quickly receive Dependabot alerts for package manifests which GitHub doesn't directly support like pnpm or Paket by using existing off-the-shelf SBOM generators.
Make sure to bump the `version` in [package.json](package.json) and run `npm run prepare` before any release.

### Example workflow

```yaml
name: SBOM Submission to Dependabot

on:
  push:
    branches:
      - master
  workflow_dispatch: {}

permissions:
  id-token: write
  contents: write

jobs:
  submit_sboms:
    name: "Submit SBOMs to Dependabot"
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Generate SBOMs
        run: |
          # Generate your SBOM files here using your preferred tool
          # Examples: syft, microsoft/sbom-tool, cdxgen, etc.
          ./tools/generate_sboms.sh

      - name: Submit SBOMs to GitHub Dependency Graph
        uses: traveltime-dev/spdx-to-dependency-graph-action@v0.0.4
        with:
          filePath: ./sboms/
          filePattern: "*.json"
```
