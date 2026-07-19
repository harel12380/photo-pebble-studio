/**
 * The settings dialog, opened from the gear button in the header. Front and
 * center: app appearance (language + theme) as segmented controls. Below it,
 * everything that applies to the whole card rather than one photo — global
 * dithering defaults, color, the slideshow schedule, and card options — via
 * <GlobalSettings>. Keeping these out of the main layout leaves the editor
 * itself to the currently selected photo.
 */
import { type Component } from "solid-js";
import { useI18n, LOCALES, localeLabel, type Locale } from "../i18n";
import { theme, setTheme, type Theme } from "../theme";
import { Modal, Section, Segmented } from "./ui";
import { GlobalSettings } from "./GlobalSettings";

export const SettingsModal: Component<{ open: boolean; onClose: () => void }> = (props) => {
  const { t, locale, setLocale } = useI18n();
  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title={t("settings.title")}
      maxWidth="max-w-lg"
    >
      <div class="flex flex-col gap-3">
        <Section title={t("settings.appearance")}>
          <div class="flex flex-col gap-3">
            <div class="flex items-center justify-between gap-3">
              <span class="text-sm text-slate-600 dark:text-slate-300">
                {t("settings.language")}
              </span>
              <Segmented<Locale>
                size="sm"
                options={LOCALES.map((l) => ({ value: l, label: localeLabel(l) }))}
                value={locale()}
                onChange={setLocale}
              />
            </div>
            <div class="flex items-center justify-between gap-3">
              <span class="text-sm text-slate-600 dark:text-slate-300">{t("settings.theme")}</span>
              <Segmented<Theme>
                size="sm"
                options={[
                  { value: "light", label: t("theme.light") },
                  { value: "dark", label: t("theme.dark") },
                ]}
                value={theme()}
                onChange={setTheme}
              />
            </div>
          </div>
        </Section>
        <GlobalSettings />
      </div>
    </Modal>
  );
};
