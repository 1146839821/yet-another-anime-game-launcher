import { gt } from "semver";
import { dirname, join } from "path-browserify";
import { CommonUpdateProgram } from "@common-update-ui";
import { Server } from "@constants";
import {
  writeBinary,
  forceMove,
  removeFile,
  log,
  getKey,
  setKey,
  cp,
  resolve,
  removeFileIfExists,
  fileOrDirExists,
  getKeyOrDefault,
  mkdirp,
  xdelta3,
} from "@utils";
import { Config } from "@config";
import { disableUnityFeature } from "./unity";
import { Wine } from "@wine";
import {
  DXMT_FILES,
  DXMT_FILES_WITH_D3D12,
  DXMT_I386_FILES,
  DXVK_FILES,
} from "src/downloadable-resource";

export async function putLocal(url: string, dest: string) {
  return await writeBinary(dest, await (await fetch(url)).arrayBuffer());
}

export async function* patchProgram(
  gameDir: string,
  wine: Wine,
  server: Server,
  config: Config
): CommonUpdateProgram {
  if ((await getKeyOrDefault("patched", "NOTFOUND")) != "NOTFOUND") {
    return;
  }
  if (!config.patchOff) {
    for (const file of server.patched) {
      if (file.tag === "workaround3" && config.workaround3) continue;
      await forceMove(
        join(gameDir, file.file),
        join(gameDir, file.file + ".bak")
      );
      await putLocal(file.diffUrl, join(gameDir, file.file + ".diff"));
      await xdelta3(
        join(gameDir, file.file + ".bak"),
        join(gameDir, file.file + ".diff"),
        join(gameDir, file.file)
      );
      await log("patched " + file.file);
      await removeFile(join(gameDir, file.file + ".diff"));
    }
    for (const { file, tag } of server.removed) {
      if (tag === "workaround3" && config.workaround3) continue;
      if (await fileOrDirExists(join(gameDir, file))) {
        await forceMove(join(gameDir, file), join(gameDir, file + ".bak"));
      }
    }
    for (const file of server.added) {
      await mkdirp(join(gameDir, dirname(file.file)));
      await putLocal(file.url, join(gameDir, file.file));
    }
  }

  const system32Dir = join(wine.prefix, "drive_c", "windows", "system32");
  const syswow64Dir = join(wine.prefix, "drive_c", "windows", "syswow64");

  await replaceDXMTFiles(
    "x86_64-windows",
    config.useD3D12 ? DXMT_FILES_WITH_D3D12 : DXMT_FILES
  );

  const i386WineDir = resolve("./wine/lib/wine/i386-windows");
  const i386DXMTDir = resolve("./dxmt/i386-windows");
  if (
    (await fileOrDirExists(i386WineDir)) &&
    (await fileOrDirExists(i386DXMTDir))
  ) {
    await replaceDXMTFiles("i386-windows", DXMT_I386_FILES);
    await replaceDXMTFile("i386-windows", "winemetal.dll");
  }

  // winemetal files always go to Wine lib directories
  const winemetalDll = await findDXMTFile("x86_64-windows", "winemetal.dll");
  if (!winemetalDll) {
    throw new Error("DXMT build is missing x86_64-windows/winemetal.dll");
  }
  await cp(
    winemetalDll,
    resolve("./wine/lib/wine/x86_64-windows/winemetal.dll")
  );

  const winemetalSo = await findDXMTFile("x86_64-unix", "winemetal.so");
  if (!winemetalSo) {
    throw new Error("DXMT build is missing x86_64-unix/winemetal.so");
  }
  await cp(winemetalSo, resolve("./wine/lib/wine/x86_64-unix/winemetal.so"));

  // winemetal.dll also to system32 for both native and builtin
  await cp(winemetalDll, join(system32Dir, "winemetal.dll"));

  if (server.id.startsWith("hkrpg") || config.enableDLSS) {
    await copyDXMTFileToWine("nvngx.dll", system32Dir);
  }
  if (config.enableDLSS) {
    await copyDXMTFileToWine("nvapi64.dll", system32Dir);
  }

  if (config.reshade) {
    await cp(resolve("./reshade/dxgi.dll"), join(gameDir, "dxgi.dll"));
    await cp(
      resolve("./reshade/d3dcompiler_47.dll"),
      join(gameDir, "d3dcompiler_47.dll")
    );
  }

  if (!server.id.startsWith("hkrpg")) {
    await cp(
      resolve("./sidecar/protonextras/steam64.exe"),
      join(system32Dir, "steam.exe")
    );
    await cp(
      resolve("./sidecar/protonextras/steam32.exe"),
      join(syswow64Dir, "steam.exe")
    );
    await cp(
      resolve("./sidecar/protonextras/lsteamclient64.dll"),
      join(system32Dir, "lsteamclient.dll")
    );
    await cp(
      resolve("./sidecar/protonextras/lsteamclient32.dll"),
      join(syswow64Dir, "lsteamclient.dll")
    );
  }

  setKey("patched", "1");
}

export async function* patchRevertProgram(
  gameDir: string,
  wine: Wine,
  server: Server,
  config: Config
): CommonUpdateProgram {
  try {
    await getKey("patched");
  } catch {
    return;
  }
  if (!config.patchOff) {
    for (const file of server.patched) {
      if (await fileOrDirExists(join(gameDir, file.file + ".bak"))) {
        await forceMove(
          join(gameDir, file.file + ".bak"),
          join(gameDir, file.file)
        );
      }
    }
    for (const { file } of server.removed) {
      if (await fileOrDirExists(join(gameDir, file + ".bak"))) {
        await forceMove(join(gameDir, file + ".bak"), join(gameDir, file));
      }
    }
    for (const file of server.added) {
      if (await fileOrDirExists(join(gameDir, file.file))) {
        await removeFile(join(gameDir, file.file));
      }
    }
  }

  const system32Dir = join(wine.prefix, "drive_c", "windows", "system32");
  if (wine.attributes.renderBackend == "dxmt") {
    for (const f of DXMT_FILES_WITH_D3D12) {
      const wineLibPath = resolve(`./wine/lib/wine/x86_64-windows/${f}`);
      if (await fileOrDirExists(wineLibPath + ".bak")) {
        await forceMove(wineLibPath + ".bak", wineLibPath);
      }
    }
    const i386WineDir = resolve("./wine/lib/wine/i386-windows");
    if (await fileOrDirExists(i386WineDir)) {
      for (const f of [...DXMT_I386_FILES, "winemetal.dll"]) {
        const wineLibPath = resolve(`./wine/lib/wine/i386-windows/${f}`);
        if (await fileOrDirExists(wineLibPath + ".bak")) {
          await forceMove(wineLibPath + ".bak", wineLibPath);
        }
      }
    }
  }
  if (config.reshade) {
    await removeFileIfExists(join(gameDir, "dxgi.dll"));
    await removeFileIfExists(join(gameDir, "d3dcompiler_47.dll"));
  }
  setKey("patched", null);
}

async function replaceDXMTFiles(
  architecture: "i386-windows" | "x86_64-windows",
  files: readonly string[]
) {
  for (const file of files) {
    await replaceDXMTFile(architecture, file);
  }
}

async function replaceDXMTFile(
  architecture: "i386-windows" | "x86_64-windows",
  file: string
) {
  const source = await findDXMTFile(architecture, file);
  if (!source) {
    throw new Error(`DXMT build is missing ${architecture}/${file}`);
  }

  const wineLibPath = resolve(`./wine/lib/wine/${architecture}/${file}`);
  if (await fileOrDirExists(wineLibPath)) {
    await forceMove(wineLibPath, wineLibPath + ".bak");
  }
  await cp(source, wineLibPath);
}

async function findDXMTFile(
  architecture: "i386-windows" | "x86_64-unix" | "x86_64-windows",
  file: string
) {
  const architecturePath = resolve(`./dxmt/${architecture}/${file}`);
  if (await fileOrDirExists(architecturePath)) return architecturePath;

  // Compatibility with the flattened layout used by older DXMT downloads.
  if (architecture == "x86_64-windows" || architecture == "x86_64-unix") {
    const legacyPath = resolve(`./dxmt/${file}`);
    if (await fileOrDirExists(legacyPath)) return legacyPath;
  }
  return null;
}

async function copyDXMTFileToWine(
  file: "nvapi64.dll" | "nvngx.dll",
  system32Dir: string
) {
  const source = await findDXMTFile("x86_64-windows", file);
  if (!source) {
    throw new Error(`DXMT build is missing x86_64-windows/${file}`);
  }
  await cp(source, resolve(`./wine/lib/wine/x86_64-windows/${file}`));
  await cp(source, join(system32Dir, file));
}
