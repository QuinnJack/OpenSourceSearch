import { Moon01, Sun } from "@untitledui/icons";

import { Button } from '@/components/base/buttons/button';
import { useTheme } from '@/providers/theme-provider';

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