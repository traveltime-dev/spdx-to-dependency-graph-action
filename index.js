const core = require('@actions/core');
const github = require('@actions/github');
const fs = require('fs');
const glob = require('glob');
const { version } = require('./package.json');

import {
  PackageCache,
  BuildTarget,
  Package,
  Snapshot,
  Manifest,
  submitSnapshot
} from '@github/dependency-submission-toolkit'

async function run() {
  let manifests = getManifestsFromSpdxFiles(searchFiles());
  
  let snapshot = new Snapshot({
      name: "spdx-to-dependency-graph-action",
      version: version,
      url: "https://github.com/traveltime-dev/spdx-to-dependency-graph-action",
  }, 
  github.context,
  {
    correlator:`${github.context.job}`,
    id: github.context.runId.toString()
  });

  manifests?.forEach(manifest => {
    snapshot.addManifest(manifest);
  });

  submitSnapshot(snapshot);
}

function getManifestFromSpdxFile(document, fileName) {
  core.debug(`getManifestFromSpdxFile processing ${fileName}`);

  let manifest = new Manifest(document.name, fileName);

  core.debug(`Processing ${document.packages?.length} packages`);

  document.packages?.forEach(pkg => {
    let packageName = pkg.name;
    let packageVersion = pkg.packageVersion;
    let referenceLocator = pkg.externalRefs?.find(ref => ref.referenceCategory === "PACKAGE-MANAGER" && ref.referenceType === "purl")?.referenceLocator;
    let genericPurl = `pkg:generic/${packageName}@${packageVersion}`;
    // SPDX 2.3 defines a purl field 
    let purl;
    if (pkg.purl != undefined) {
      purl = pkg.purl;
    } else if (referenceLocator != undefined) {
      purl = referenceLocator;
    } else {
      purl = genericPurl;
    }  

    // Working around weird encoding issues from an SBOM generator
    // Find the last instance of %40 and replace it with @
    purl = replaceVersionEscape(purl);
    purl = encodeVersion(purl);

    let relationships = document.relationships?.find(rel => rel.relatedSpdxElement == pkg.SPDXID && rel.relationshipType == "DEPENDS_ON" && rel.spdxElementId != "SPDXRef-RootPackage");
    if (relationships != null && relationships.length > 0) {
      manifest.addIndirectDependency(new Package(purl));
    } else {
      manifest.addDirectDependency(new Package(purl));
    }
  });
  return manifest;
}

function getManifestsFromSpdxFiles(files) {
  core.debug(`Processing ${files.length} files`);
  let manifests = [];
  files?.forEach(file => {
    core.debug(`Processing ${file}`);
    manifests.push(getManifestFromSpdxFile(JSON.parse(fs.readFileSync(file)), file));
  });
  return manifests;
}

function searchFiles() {
  let filePath = core.getInput('filePath');
  let filePattern = core.getInput('filePattern');

  return glob.sync(`${filePath}/${filePattern}`, {});
}

// Fixes issues with an escaped version string
function replaceVersionEscape(purl) {
  // Some tools are failing to escape the namespace, so we will escape it to work around that
  purl = purl.replace("/@", "/%40");

  //If there's an "@" in the purl, then we don't need to do anything.
  if (purl != null && purl != undefined && !purl?.includes("@")) {
    let index = purl.lastIndexOf("%40");
    if (index > 0) {
      purl = purl.substring(0, index) + "@" + purl.substring(index + 3);
    }
  }
  return purl;
}

// Percent-encode the version component of a purl
function encodeVersion(purl) {
  if (!purl || !purl.includes("@")) {
    return purl;
  }

  // Find the @ that separates name from version
  const atIndex = purl.lastIndexOf("@");
  const beforeVersion = purl.substring(0, atIndex + 1);
  const afterAt = purl.substring(atIndex + 1);

  // Version ends at ? (qualifiers) or # (subpath) or end of string
  let versionEnd = afterAt.length;
  const qualifierIndex = afterAt.indexOf("?");
  const subpathIndex = afterAt.indexOf("#");

  if (qualifierIndex !== -1) {
    versionEnd = qualifierIndex;
  }
  if (subpathIndex !== -1 && subpathIndex < versionEnd) {
    versionEnd = subpathIndex;
  }

  const version = afterAt.substring(0, versionEnd);
  const suffix = afterAt.substring(versionEnd);

  // Encode special characters in version
  const encodedVersion = version
    .replace(/%(?![0-9A-Fa-f]{2})/g, "%25") // encode % that aren't already part of encoding
    .replace(/\+/g, "%2B")
    .replace(/ /g, "%20");

  return beforeVersion + encodedVersion + suffix;
}

run();
