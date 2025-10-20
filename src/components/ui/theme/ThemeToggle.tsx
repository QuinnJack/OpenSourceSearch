import { Moon01, Sun } from "@untitledui/icons";

import { Button } from "@/components/ui/buttons/button";
import { ButtonUtility } from "@/components/ui/buttons/button-utility";
import { useTheme } from "@/app/providers/theme-provider";

type ThemeToggleVariant = "default" | "utility";

interface ThemeToggleProps {
    variant?: ThemeToggleVariant;
}

export function ThemeToggle({ variant = "default" }: ThemeToggleProps) {
    const { theme, setTheme } = useTheme();
    const Icon = theme === "light" ? Moon01 : Sun;

    if (variant === "utility") {
        return (
            <ButtonUtility
                tooltip="Toggle theme"
                size="xs"
                color="secondary"
                icon={Icon}
                onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            />
        );
    }

    return (
        <Button
            aria-label="Toggle theme"
            color="secondary"
            size="sm"
            iconLeading={Icon}
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
        />
    );
}
