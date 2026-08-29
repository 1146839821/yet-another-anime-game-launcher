import { FormControl, FormLabel, Box, Checkbox } from "@hope-ui/solid";
import { createEffect, createSignal } from "solid-js";
import { Locale } from "@locale";
import { assertValueDefined, getKey, setKey } from "@utils";
import { Config, NOOP } from "@config/config-def";

declare module "@config/config-def" {
  interface Config {
    enableDLSS: boolean;
  }
}

const CONFIG_KEY = "config_enable_dlss";

export default async function ({
  locale,
  config,
}: {
  config: Partial<Config>;
  locale: Locale;
}) {
  try {
    config.enableDLSS = (await getKey(CONFIG_KEY)) == "true";
  } catch {
    config.enableDLSS = false;
  }

  const [value, setValue] = createSignal(config.enableDLSS);

  async function onSave(apply: boolean) {
    assertValueDefined(config.enableDLSS);
    if (!apply) {
      setValue(config.enableDLSS);
      return NOOP;
    }
    if (config.enableDLSS == value()) return NOOP;
    config.enableDLSS = value();
    await setKey(CONFIG_KEY, config.enableDLSS ? "true" : "false");
    return NOOP;
  }

  createEffect(() => {
    value();
    onSave(true);
  });

  return [
    function UI() {
      return (
        <FormControl id="enableDLSS">
          <FormLabel>{locale.get("SETTING_ENABLE_DLSS")}</FormLabel>
          <Box>
            <Checkbox
              checked={value()}
              onChange={() => setValue(current => !current)}
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
