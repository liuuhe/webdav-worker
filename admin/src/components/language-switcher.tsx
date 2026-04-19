import { LanguagesIcon } from "lucide-react"

import { useI18n } from "@/lib/i18n"
import { Button } from "@/components/ui/button"

export function LanguageSwitcher() {
  const { locale, setLocale, text } = useI18n()

  return (
    <div className="flex items-center gap-1 rounded-lg border bg-background/90 p-1 shadow-sm backdrop-blur">
      <LanguagesIcon className="mx-1 text-muted-foreground" />
      <Button
        size="sm"
        variant={locale === "en" ? "default" : "ghost"}
        onClick={() => setLocale("en")}
        type="button"
      >
        EN
      </Button>
      <Button
        size="sm"
        variant={locale === "zh-CN" ? "default" : "ghost"}
        onClick={() => setLocale("zh-CN")}
        type="button"
      >
        中文
      </Button>
      <span className="sr-only">{text("Language switcher", "语言切换")}</span>
    </div>
  )
}
