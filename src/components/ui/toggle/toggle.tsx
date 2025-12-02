import { Switch as AriaSwitch } from "react-aria-components";
import type { SwitchProps as AriaSwitchProps } from "react-aria-components";
import type { ReactNode } from "react";
import { cx } from "@/utils/cx";

interface ToggleBaseProps {
    size?: "sm" | "md";
    slim?: boolean;
    className?: string;
    isHovered?: boolean;
    isFocusVisible?: boolean;
    isSelected?: boolean;
    isDisabled?: boolean;
    selectedColor?: string;
    selectedHoverColor?: string;
}

export const ToggleBase = ({
    className,
    isHovered,
    isDisabled,
    isFocusVisible,
    isSelected,
    slim,
    size = "sm",
    selectedColor = "#1f1f1f",
    selectedHoverColor = "#343434",
}: ToggleBaseProps) => {
    const styles = {
        default: {
            sm: {
                root: "h-5 w-9 p-0.5",
                switch: cx("size-4", isSelected && "translate-x-4"),
            },
            md: {
                root: "h-6 w-11 p-0.5",
                switch: cx("size-5", isSelected && "translate-x-5"),
            },
        },
        slim: {
            sm: {
                root: "h-4 w-8",
                switch: cx("size-4", isSelected && "translate-x-4"),
            },
            md: {
                root: "h-5 w-10",
                switch: cx("size-5", isSelected && "translate-x-5"),
            },
        },
    };

    const classes = slim ? styles.slim[size] : styles.default[size];

    return (
        <div
            className={cx(
                "cursor-pointer rounded-full bg-tertiary outline-focus-ring transition duration-150 ease-linear",
                isDisabled && "cursor-not-allowed bg-disabled",
                isFocusVisible && "outline-2 outline-offset-2",

                slim && "ring-1 ring-secondary ring-inset",
                slim && isSelected && "ring-transparent",
                classes.root,
                className,
            )}
            style={
                isSelected
                    ? {
                        backgroundColor: isHovered ? selectedHoverColor : selectedColor,
                    }
                    : undefined
            }
        >
            <div
                style={{
                    transition: "transform 0.15s ease-in-out, translate 0.15s ease-in-out, border-color 0.1s linear, background-color 0.1s linear",
                }}
                className={cx(
                    "rounded-full bg-fg-white shadow-sm",
                    isDisabled && "bg-toggle-button-fg_disabled",

                    slim && "shadow-xs",
                    slim && "border border-toggle-border",
                    slim && isSelected && "border-toggle-slim-border_pressed",
                    slim && isSelected && isHovered && "border-toggle-slim-border_pressed-hover",

                    classes.switch,
                )}
            />
        </div>
    );
};

interface ToggleProps extends AriaSwitchProps {
    size?: "sm" | "md";
    label?: string;
    hint?: ReactNode;
    slim?: boolean;
    activeColor?: string;
    activeHoverColor?: string;
}

export const Toggle = ({
    label,
    hint,
    className,
    size = "sm",
    slim,
    activeColor,
    activeHoverColor,
    ...ariaSwitchProps
}: ToggleProps) => {
    const sizes = {
        sm: {
            root: "gap-3",
            textWrapper: "gap-1",
            label: "text-sm font-medium",
            hint: "text-sm",
        },
        md: {
            root: "gap-4",
            textWrapper: "gap-1",
            label: "text-md font-medium",
            hint: "text-md",
        },
    };

    return (
        <AriaSwitch
            {...ariaSwitchProps}
            className={(renderProps) =>
                cx(
                    "flex items-start",
                    renderProps.isDisabled && "cursor-not-allowed",
                    sizes[size].root,
                    typeof className === "function" ? className(renderProps) : className,
                )
            }
        >
            {({ isSelected, isDisabled, isFocusVisible, isHovered }) => (
                <div className="flex w-full items-center justify-between gap-3">
                    {(label || hint) && (
                        <div className={cx("flex min-w-0 flex-1 flex-col text-left", sizes[size].textWrapper)}>
                            {label && <p className={cx("text-secondary select-none break-words", sizes[size].label)}>{label}</p>}
                            {hint && (
                                <span className={cx("text-tertiary break-words", sizes[size].hint)} onClick={(event) => event.stopPropagation()}>
                                    {hint}
                                </span>
                            )}
                        </div>
                    )}

                    <ToggleBase
                        slim={slim}
                        size={size}
                        isHovered={isHovered}
                        isDisabled={isDisabled}
                        isFocusVisible={isFocusVisible}
                        isSelected={isSelected}
                        selectedColor={activeColor}
                        selectedHoverColor={activeHoverColor}
                        className={slim ? "mt-0.5" : ""}
                    />
                </div>
            )}
        </AriaSwitch>
    );
};
