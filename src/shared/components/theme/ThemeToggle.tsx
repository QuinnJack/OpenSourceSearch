import { Moon01, Sun } from "@untitledui/icons";

import { useTheme } from "@/app/providers/theme-provider";
import { Button } from "@/shared/components/base/buttons/button";

export function ThemeToggle() {
    const { theme, setTheme } = useTheme();

    return (
        <Button
            aria-label="Toggle theme"
            color="secondary"
            size="sm"
            iconLeading={theme === "light" ? Moon01 : Sun}
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
        />
    );
}
