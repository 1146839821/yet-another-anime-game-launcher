import { eq } from "semver";
import { Aria2 } from "@aria2";
import { CommonUpdateProgram } from "@common-update-ui";
import {
  mkdirp,
  resolve,
  humanFileSize,
  setKey,
  getKeyOrDefault,
  fileOrDirExists,
  doStreamUnzip,
  forceMove,
  readBinary,
  writeBinary,
  writeFile,
  rmrf_dangerously,
  exec,
  removeFile,
} from "@utils";
import { Wine } from "@wine";
import { join } from "path-browserify";
import type {
  Github,
  GithubActionsArtifactInfo,
  GithubWorkflowRunInfo,
} from "./github";

const CURRENT_MVK_VERSION = "1.2.2";

export async function* checkAndDownloadMoltenVK(
  aria2: Aria2
): CommonUpdateProgram {
  if (
    (await fileOrDirExists("./moltenvk/libMoltenVK.dylib")) &&
    eq(
      CURRENT_MVK_VERSION,
      await getKeyOrDefault("installed_moltenvk_version", "0.0.0")
    )
  ) {
    return;
  }

  await mkdirp("./moltenvk");
  yield ["setStateText", "DOWNLOADING_ENVIRONMENT"];
  for await (const progress of aria2.doStreamingDownload({
    uri: "https://github.com/3Shain/winecx/releases/download/gi-wine-1.0/libMoltenVK.dylib",
    absDst: resolve("./moltenvk/libMoltenVK.dylib"),
  })) {
    yield [
      "setProgress",
      Number((progress.completedLength * BigInt(100)) / progress.totalLength),
    ];
    yield [
      "setStateText",
      "DOWNLOADING_ENVIRONMENT_SPEED",
      `${humanFileSize(Number(progress.downloadSpeed))}`,
    ];
  }
  setKey("installed_moltenvk_version", CURRENT_MVK_VERSION);
}

export const DXVK_FILES = [
  "d3d9.dll",
  "d3d10core.dll",
  "d3d11.dll",
  "dxgi.dll",
];
const CURRENT_DXVK_VERSION = "1.10.4-alpha.20230402"; // there is no 1.10.4! I have to make up something greater than 1.10.3
const CURRENT_JADEITE_VERSION = "4.1.0";

export async function* checkAndDownloadDXVK(aria2: Aria2): CommonUpdateProgram {
  if (
    eq(
      CURRENT_DXVK_VERSION,
      await getKeyOrDefault("installed_dxvk_version", "0.0.0")
    )
  ) {
    return;
  }

  await mkdirp("./dxvk");
  yield ["setStateText", "DOWNLOADING_ENVIRONMENT"];
  for (const file of DXVK_FILES) {
    for await (const progress of aria2.doStreamingDownload({
      uri: `https://github.com/3Shain/winecx/releases/download/gi-wine-1.0/${file}`,
      absDst: resolve(`./dxvk/${file}`),
    })) {
      yield [
        "setProgress",
        Number((progress.completedLength * BigInt(100)) / progress.totalLength),
      ];
      yield [
        "setStateText",
        "DOWNLOADING_ENVIRONMENT_SPEED",
        `${humanFileSize(Number(progress.downloadSpeed))}`,
      ];
    }
  }

  setKey("installed_dxvk_version", CURRENT_DXVK_VERSION);
}

export async function* checkAndDownloadJadeite(
  aria2: Aria2
): CommonUpdateProgram {
  if (
    eq(
      CURRENT_JADEITE_VERSION,
      await getKeyOrDefault("installed_jadeite_version", "0.0.0")
    )
  ) {
    return;
  }

  await rmrf_dangerously(resolve(`./jadeite`));

  await mkdirp("./jadeite");
  yield ["setStateText", "DOWNLOADING_ENVIRONMENT"];
  for await (const progress of aria2.doStreamingDownload({
    uri: `https://codeberg.org/mkrsym1/jadeite/releases/download/v4.1.0/v4.1.0.zip`,
    absDst: resolve(`./jadeite/archive.zip`),
  })) {
    yield [
      "setProgress",
      Number((progress.completedLength * BigInt(100)) / progress.totalLength),
    ];
    yield [
      "setStateText",
      "DOWNLOADING_ENVIRONMENT_SPEED",
      `${humanFileSize(Number(progress.downloadSpeed))}`,
    ];
  }

  for await (const [dec, total] of doStreamUnzip(
    resolve(`./jadeite/archive.zip`),
    resolve(`./jadeite`)
  )) {
    yield ["setProgress", (dec / total) * 100];
  }

  setKey("installed_jadeite_version", CURRENT_JADEITE_VERSION);
}

const CURRENT_DXMT_VERSION = "0.80.0";
const DXMT_REPOSITORY_OWNER = "1146839821";
const DXMT_REPOSITORY_NAME = "dxmt";
const DXMT_ARTIFACT_PREFIX = "dxmt-";

export const DXMT_FILES = ["d3d10core.dll", "d3d11.dll", "dxgi.dll"] as const;

export const DXMT_FILES_WITH_D3D12 = [...DXMT_FILES, "d3d12.dll"] as const;

export const DXMT_I386_FILES = DXMT_FILES;

export const DXMT_ARCHITECTURE_DIRS = [
  "i386-windows",
  "x86_64-unix",
  "x86_64-windows",
] as const;

export interface DXMTBuild {
  id: string;
  version: string;
  displayName: string;
  downloadUrl: string;
  packageName?: string;
}

export const DEFAULT_DXMT_BUILD: DXMTBuild = {
  id: "builtin-0.80.0",
  version: CURRENT_DXMT_VERSION,
  displayName: `DXMT ${CURRENT_DXMT_VERSION} (built-in)`,
  downloadUrl:
    "https://github.com/3Shain/dxmt/releases/download/v0.80/dxmt-v0.80-builtin.tar.gz",
};

interface GithubWorkflowRunsResponse {
  workflow_runs?: GithubWorkflowRunInfo[];
}

interface GithubActionsArtifactsResponse {
  artifacts?: GithubActionsArtifactInfo[];
}

export async function getDXMTBuilds(github: Github): Promise<DXMTBuild[]> {
  const [runsResponse, artifactsResponse] = (await Promise.all([
    github.api(
      `/repos/${DXMT_REPOSITORY_OWNER}/${DXMT_REPOSITORY_NAME}/actions/runs?status=completed&per_page=100`
    ),
    github.api(
      `/repos/${DXMT_REPOSITORY_OWNER}/${DXMT_REPOSITORY_NAME}/actions/artifacts?per_page=100`
    ),
  ])) as [GithubWorkflowRunsResponse, GithubActionsArtifactsResponse];

  const successfulRuns = new Map(
    (runsResponse.workflow_runs ?? [])
      .filter(run => run.conclusion == "success")
      .map(run => [run.id, run])
  );

  return (artifactsResponse.artifacts ?? [])
    .map(artifact => {
      if (
        artifact.expired ||
        !artifact.name.startsWith(DXMT_ARTIFACT_PREFIX) ||
        artifact.workflow_run == null
      ) {
        return null;
      }

      const run = successfulRuns.get(artifact.workflow_run.id);
      const version = artifact.name.slice(DXMT_ARTIFACT_PREFIX.length);
      if (!run || version == "") return null;

      const downloadUrl =
        run.check_suite_id == null
          ? artifact.archive_download_url
          : `https://nightly.link/${DXMT_REPOSITORY_OWNER}/${DXMT_REPOSITORY_NAME}/suites/${run.check_suite_id}/artifacts/${artifact.id}`;

      const build: DXMTBuild = {
        id: `${artifact.id}`,
        version,
        displayName: `DXMT ${version.slice(0, 12)} (${run.head_branch}) #${
          run.run_number
        }`,
        downloadUrl,
        packageName: artifact.name,
      };
      return {
        artifact,
        build,
      };
    })
    .filter(
      (
        item
      ): item is {
        artifact: GithubActionsArtifactInfo;
        build: DXMTBuild;
      } => item != null
    )
    .sort((a, b) => b.artifact.created_at.localeCompare(a.artifact.created_at))
    .map(item => item.build);
}

export async function* checkAndDownloadDXMT(
  aria2: Aria2,
  build: DXMTBuild = DEFAULT_DXMT_BUILD
): CommonUpdateProgram {
  if (
    build.version == (await getKeyOrDefault("installed_dxmt_version", "0.0.0"))
  ) {
    return;
  }

  const dxmtDir = resolve("./dxmt");
  await rmrf_dangerously(dxmtDir);
  await mkdirp(dxmtDir);

  const packageName = build.packageName;
  if (packageName) {
    yield* downloadDXMTBuildArtifact(aria2, dxmtDir, {
      ...build,
      packageName,
    });
  } else {
    yield* downloadBuiltinDXMT(aria2, dxmtDir);
  }

  await setKey("installed_dxmt_version", build.version);
}

async function* downloadDXMTBuildArtifact(
  aria2: Aria2,
  dxmtDir: string,
  build: DXMTBuild & { packageName: string }
): CommonUpdateProgram {
  const packageName = build.packageName;
  const packageRoot = getDXMTPackageRoot(packageName);
  const artifactZip = join(dxmtDir, "artifact.zip");
  const artifactDir = join(dxmtDir, "artifact");

  yield ["setStateText", "DOWNLOADING_ENVIRONMENT"];
  for await (const progress of aria2.doStreamingDownload({
    uri: build.downloadUrl,
    absDst: artifactZip,
  })) {
    yield [
      "setProgress",
      Number((progress.completedLength * BigInt(100)) / progress.totalLength),
    ];
    yield [
      "setStateText",
      "DOWNLOADING_ENVIRONMENT_SPEED",
      `${humanFileSize(Number(progress.downloadSpeed))}`,
    ];
  }

  yield ["setStateText", "EXTRACT_ENVIRONMENT"];
  yield ["setUndeterminedProgress"];
  await mkdirp(artifactDir);
  for await (const [dec, total] of doStreamUnzip(artifactZip, artifactDir)) {
    yield ["setProgress", (dec / total) * 100];
  }

  const packageArchive = join(artifactDir, `${packageName}.tar.gz`);
  await exec([
    "tar",
    "-xzf",
    packageArchive,
    "-C",
    dxmtDir,
    ...DXMT_ARCHITECTURE_DIRS.map(directory => join(packageRoot, directory)),
  ]);

  for (const directory of DXMT_ARCHITECTURE_DIRS) {
    await forceMove(
      join(dxmtDir, packageRoot, directory),
      join(dxmtDir, directory)
    );
  }

  await rmrf_dangerously(join(dxmtDir, packageRoot));
  await rmrf_dangerously(artifactDir);
  await removeFile(artifactZip);
}

async function* downloadBuiltinDXMT(
  aria2: Aria2,
  dxmtDir: string
): CommonUpdateProgram {
  const archiveName = "dxmt-v0.80-builtin.tar.gz";
  yield ["setStateText", "DOWNLOADING_ENVIRONMENT"];
  for await (const progress of aria2.doStreamingDownload({
    uri: DEFAULT_DXMT_BUILD.downloadUrl,
    absDst: join(dxmtDir, archiveName),
  })) {
    yield [
      "setProgress",
      Number((progress.completedLength * BigInt(100)) / progress.totalLength),
    ];
    yield [
      "setStateText",
      "DOWNLOADING_ENVIRONMENT_SPEED",
      `${humanFileSize(Number(progress.downloadSpeed))}`,
    ];
  }

  yield ["setStateText", "EXTRACT_ENVIRONMENT"];
  yield ["setUndeterminedProgress"];
  await exec(["tar", "-xvf", join(dxmtDir, archiveName), "-C", dxmtDir]);

  // Keep the flattened layout for the built-in build. Other game clients
  // still consume the legacy DXMT files directly from ./dxmt.
  await exec([
    "sh",
    "-c",
    `mv "${join(dxmtDir, "v0.80", "x86_64-windows")}"* "${dxmtDir}/"`,
  ]);
  await exec([
    "sh",
    "-c",
    `mv "${join(dxmtDir, "v0.80", "x86_64-unix")}"* "${dxmtDir}/"`,
  ]);
  await rmrf_dangerously(join(dxmtDir, "v0.80"));
  await removeFile(join(dxmtDir, archiveName));
}

function getDXMTPackageRoot(packageName: string) {
  if (!packageName.startsWith(DXMT_ARTIFACT_PREFIX)) {
    throw new Error(`Unexpected DXMT artifact name: ${packageName}`);
  }
  const packageRoot = packageName.slice(DXMT_ARTIFACT_PREFIX.length);
  if (
    packageRoot == "." ||
    packageRoot == ".." ||
    !/^[a-zA-Z0-9._-]+$/.test(packageRoot)
  ) {
    throw new Error(`Unexpected DXMT package root: ${packageRoot}`);
  }
  return packageRoot;
}

const CURRENT_RESHADE_VERSION = "5.8.0";

export async function* checkAndDownloadReshade(
  aria2: Aria2,
  wine: Wine,
  gameDir: string
): CommonUpdateProgram {
  const reshaderDir = resolve("./reshade");

  if (
    eq(
      CURRENT_RESHADE_VERSION,
      await getKeyOrDefault("installed_reshade", "0.0.0")
    )
  ) {
    return;
  }

  await mkdirp(reshaderDir);
  await mkdirp(join(reshaderDir, "Shaders"));
  await mkdirp(join(reshaderDir, "Textures"));
  yield ["setStateText", "DOWNLOADING_ENVIRONMENT"];
  for await (const progress of aria2.doStreamingDownload({
    uri: `https://reshade.me/downloads/ReShade_Setup_${CURRENT_RESHADE_VERSION}_Addon.exe`,
    absDst: join(reshaderDir, "install.exe"),
  })) {
    yield [
      "setProgress",
      Number((progress.completedLength * BigInt(100)) / progress.totalLength),
    ];
    yield [
      "setStateText",
      "DOWNLOADING_ENVIRONMENT_SPEED",
      `${humanFileSize(Number(progress.downloadSpeed))}`,
    ];
  }
  for await (const progress of aria2.doStreamingDownload({
    uri: `https://lutris.net/files/tools/dll/d3dcompiler_47.dll`,
    absDst: join(reshaderDir, "d3dcompiler_47.dll"),
  })) {
    yield [
      "setProgress",
      Number((progress.completedLength * BigInt(100)) / progress.totalLength),
    ];
    yield [
      "setStateText",
      "DOWNLOADING_ENVIRONMENT_SPEED",
      `${humanFileSize(Number(progress.downloadSpeed))}`,
    ];
  }
  yield ["setStateText", "EXTRACT_ENVIRONMENT"];
  yield ["setUndeterminedProgress"];
  const b = await readBinary(join(reshaderDir, "install.exe"));
  const s = new Uint8Array(b);
  const offset = s.findIndex((v, idx, arr) => {
    return (
      v == 0x50 &&
      arr[idx + 1] == 0x4b &&
      arr[idx + 2] == 0x03 &&
      arr[idx + 3] == 0x04
    );
  });
  await writeBinary(join(reshaderDir, "install.zip"), b.slice(offset));

  for await (const [dec, total] of doStreamUnzip(
    join(reshaderDir, "install.zip"),
    reshaderDir
  )) {
    yield ["setProgress", (dec / total) * 100];
  }

  await forceMove(
    join(reshaderDir, "ReShade64.dll"),
    join(reshaderDir, "dxgi.dll")
  );

  writeFile(
    join(gameDir, "ReShade.ini"),
    `[GENERAL]
EffectSearchPaths=${wine.toWinePath(resolve("./reshade/Shaders"))}
TextureSearchPaths=${wine.toWinePath(resolve("./reshade/Textures"))}`
  );

  setKey("installed_reshade", CURRENT_RESHADE_VERSION);
}
