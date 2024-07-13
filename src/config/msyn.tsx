import { FormControl, FormLabel, Box, Checkbox } from "@hope-ui/solid";
import { createEffect, createSignal } from "solid-js";
import { Locale } from "../locale";
import { assertValueDefined, getKey, setKey } from "../utils";
import { Config, NOOP } from "./config-def";

declare module "./config-def" {
  interface Config {
    WINEMSYNC: boolean;
  }
}

export async function createMsyncConfig({
  locale,
  config,
}: {
  config: Partial<Config>;
  locale: Locale;
}) {
  try {
    config.WINEMSYNC = (await getKey("config_Msync")) == "true";
  } catch {
    config.WINEMSYNC = true; // default value
  }

  const [value, setValue] = createSignal(config.WINEMSYNC);

  async function onSave(apply: boolean) {
    assertValueDefined(config.WINEMSYNC);
    if (!apply) {
      setValue(config.WINEMSYNC);
      return NOOP;
    }
    if (config.WINEMSYNC == value()) return NOOP;
    config.WINEMSYNC = value();
    await setKey("config_Msync", config.WINEMSYNC ? "true" : "false");
    return NOOP;
  }

  createEffect(() => {
    value();
    onSave(true);
  });

  return [
    function UI() {
      return (
        <FormControl id="WINEMSYNC">
          <FormLabel>{locale.get("SETTING_MSYNC")}</FormLabel>
          <Box>
            <Checkbox
              checked={value()}
              onChange={() => setValue(x => !x)}
              size="md"
            >
              {locale.get("SETTING_ENABLED")}
            </Checkbox>
          </Box>
        </FormControl>
      );
    },
  ] as const;
}
