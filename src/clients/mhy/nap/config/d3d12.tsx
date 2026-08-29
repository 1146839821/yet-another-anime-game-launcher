import { FormControl, FormLabel, Box, Checkbox } from "@hope-ui/solid";
import { createEffect, createSignal } from "solid-js";
import { Locale } from "@locale";
import { assertValueDefined, getKey, setKey } from "@utils";
import { Config, NOOP } from "@config/config-def";

declare module "@config/config-def" {
  interface Config {
    useD3D12: boolean;
  }
}

const CONFIG_KEY = "config_use_d3d12";

export default async function ({
  locale,
  config,
}: {
  config: Partial<Config>;
  locale: Locale;
}) {
  try {
    config.useD3D12 = (await getKey(CONFIG_KEY)) == "true";
  } catch {
    config.useD3D12 = false;
  }

  const [value, setValue] = createSignal(config.useD3D12);

  async function onSave(apply: boolean) {
    assertValueDefined(config.useD3D12);
    if (!apply) {
      setValue(config.useD3D12);
      return NOOP;
    }
    if (config.useD3D12 == value()) return NOOP;
    config.useD3D12 = value();
    await setKey(CONFIG_KEY, config.useD3D12 ? "true" : "false");
    return NOOP;
  }

  createEffect(() => {
    value();
    onSave(true);
  });

  return [
    function UI() {
      return (
        <FormControl id="useD3D12">
          <FormLabel>{locale.get("SETTING_USE_D3D12")}</FormLabel>
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
