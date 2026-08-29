import {
  FormControl,
  FormLabel,
  Select,
  SelectContent,
  SelectIcon,
  SelectListbox,
  SelectOption,
  SelectOptionIndicator,
  SelectOptionText,
  SelectPlaceholder,
  SelectTrigger,
  SelectValue,
} from "@hope-ui/solid";
import { createEffect, createSignal, For } from "solid-js";
import { Locale } from "@locale";
import { getKeyOrDefault, setKey, timeout } from "@utils";
import { Config } from "@config/config-def";
import type { Github } from "../../../../github";
import {
  DEFAULT_DXMT_BUILD,
  getDXMTBuilds,
} from "../../../../downloadable-resource";
import type { DXMTBuild } from "../../../../downloadable-resource";

declare module "@config/config-def" {
  interface Config {
    dxmtBuild: DXMTBuild;
  }
}

const CONFIG_KEY = "config_dxmt_build";

export default async function ({
  locale,
  config,
  github,
}: {
  locale: Locale;
  config: Partial<Config>;
  github: Github;
}) {
  let builds: DXMTBuild[] = [];
  try {
    builds = await Promise.race([getDXMTBuilds(github), timeout(10000)]);
  } catch {
    // Keep the built-in version available when GitHub is temporarily unavailable.
  }

  const versions = [DEFAULT_DXMT_BUILD, ...builds];
  const storedBuildId = await getKeyOrDefault(CONFIG_KEY, "");
  const initialBuild =
    versions.find(build => build.id == storedBuildId) ?? versions[0];
  config.dxmtBuild = initialBuild;

  const [value, setValue] = createSignal(initialBuild.id);

  async function onSave() {
    const selectedBuild = versions.find(build => build.id == value());
    if (!selectedBuild) return;
    config.dxmtBuild = selectedBuild;
    if (selectedBuild.id != storedBuildId) {
      await setKey(CONFIG_KEY, selectedBuild.id);
    }
  }

  createEffect(() => {
    value();
    onSave();
  });

  return [
    function UI() {
      return (
        <FormControl id="dxmtVersion">
          <FormLabel>{locale.get("SETTING_DXMT_VERSION")}</FormLabel>
          <Select value={value()} onChange={setValue}>
            <SelectTrigger>
              <SelectPlaceholder>Choose an option</SelectPlaceholder>
              <SelectValue />
              <SelectIcon />
            </SelectTrigger>
            <SelectContent>
              <SelectListbox>
                <For each={versions}>
                  {item => (
                    <SelectOption value={item.id}>
                      <SelectOptionText>{item.displayName}</SelectOptionText>
                      <SelectOptionIndicator />
                    </SelectOption>
                  )}
                </For>
              </SelectListbox>
            </SelectContent>
          </Select>
        </FormControl>
      );
    },
  ] as const;
}
