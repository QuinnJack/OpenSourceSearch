import type { CSSProperties } from "react";

import { cx } from "@/shared/utils/cx";

export interface ProgressBarProps {
    /**
     * The current value of the progress bar.
     */
    value: number;
    /**
     * The minimum value of the progress bar.
     * @default 0
     */
    min?: number;
    /**
     * The maximum value of the progress bar.
     * @default 100
     */
    max?: number;
    /**
     * Optional additional CSS class names for the progress bar container.
     */
    className?: string;
    /**
     * Optional additional CSS class names for the progress bar indicator element.
     */
    progressClassName?: string;
    /**
     * Optional inline styles for the progress bar indicator element.
     * Useful for setting dynamic colors like oklch() values.
     */
    progressStyle?: CSSProperties;
    /**
     * Optional function to format the displayed value.
     * It receives the raw value and the calculated percentage.
     */
    valueFormatter?: (value: number, valueInPercentage: number) => string | number;
}

/**
 * A basic progress bar component.
 */
export const ProgressBarBase = ({ value, min = 0, max = 100, className, progressClassName, progressStyle }: ProgressBarProps) => {
    const percentage = ((value - min) * 100) / (max - min);

    return (
        <div
            role="progressbar"
            aria-valuenow={value}
            aria-valuemin={min}
            aria-valuemax={max}
            className={cx("h-2 w-full overflow-hidden rounded-md bg-quaternary", className)}
        >
            <div
                // Use transform instead of width to avoid layout thrashing (and for smoother animation)
                style={{ transform: `translateX(-${100 - percentage}%)`, ...progressStyle }}
                className={cx("size-full rounded-md bg-fg-brand-primary transition duration-75 ease-linear", progressClassName)}
            />
        </div>
    );
};

type ProgressBarLabelPosition = "right" | "bottom" | "top-floating" | "bottom-floating";

export interface ProgressIndicatorWithTextProps extends Omit<ProgressBarProps, "value"> {
    /**
     * The current value of the progress bar when rendering a single bar.
     * Optional because in multi-item modes (items/overlap) we don't need it.
     */
    value?: number;
    /**
     * Specifies the layout of the text relative to the progress bar.
     * - `right`: Text is displayed to the right of the progress bar.
     * - `bottom`: Text is displayed below the progress bar, aligned to the right.
     * - `top-floating`: Text is displayed in a floating tooltip above the progress indicator.
     * - `bottom-floating`: Text is displayed in a floating tooltip below the progress indicator.
     */
    labelPosition?: ProgressBarLabelPosition;
    /**
     * If true, the value/label text is hidden until the bar is hovered.
     */
    showTextOnHover?: boolean;
    /**
     * Render multiple progress bars with labels and colors.
     * When provided, the component renders a vertical list of bars.
     */
    items?: Array<{
        label: string;
        value: number;
        /** Optional color for the filled portion e.g., "oklch(51.15% 0.204 260.17)" */
        color?: string;
        /** Override container classes per item */
        className?: string;
        /** Override progress classes per item */
        progressClassName?: string;
        /** Inline styles for progress indicator (e.g., backgroundColor) */
        progressStyle?: CSSProperties;
        /** Optional per-item bounds; falls back to top-level min/max */
        min?: number;
        max?: number;
    }>;
    /**
     * When true and `items` is provided, render a single bar that overlays
     * each item as stacked segments. Default view shows the average as a
     * black bar; on hover, the colored segments appear and labels show below.
     */
    overlapSegments?: boolean;
}

/**
 * A progress bar component that displays the value text in various configurable layouts.
 */
export const ProgressBar = ({
    value,
    min = 0,
    max = 100,
    valueFormatter,
    labelPosition,
    className,
    progressClassName,
    progressStyle,
    items,
    showTextOnHover,
    overlapSegments,
}: ProgressIndicatorWithTextProps) => {
    // Helper to compute label text
    const formatValue = (val: number, mi: number, ma: number) => {
        const pct = ((val - mi) * 100) / (ma - mi);
        const formatted = valueFormatter ? valueFormatter(val, pct) : `${pct.toFixed(0)}%`;
        return { pct, formatted };
    };

    // Render a single progress bar (back-compat)
    if (!items || items.length === 0) {
        const safeValue = value ?? 0;
        const { pct, formatted } = formatValue(safeValue, min, max);
        const baseProgressBar = (
            <ProgressBarBase
                min={min}
                max={max}
                value={safeValue}
                className={className}
                progressClassName={progressClassName}
                progressStyle={progressStyle}
            />
        );

        const hoverClasses = showTextOnHover ? "opacity-0 group-hover:opacity-100 transition-opacity duration-150" : "";

        switch (labelPosition) {
            case "right":
                return (
                    <div className={"group flex items-center gap-3"}>
                        {baseProgressBar}
                        <span className={cx("shrink-0 text-sm font-medium text-secondary tabular-nums", hoverClasses)}>{formatted}</span>
                    </div>
                );
            case "bottom":
                return (
                    <div className={"group flex flex-col items-end gap-2"}>
                        {baseProgressBar}
                        <span className={cx("text-sm font-medium text-secondary tabular-nums", hoverClasses)}>{formatted}</span>
                    </div>
                );
            case "top-floating":
                return (
                    <div className={"group relative flex flex-col items-end gap-2"}>
                        {baseProgressBar}
                        <div
                            style={{ left: `${pct}%` }}
                            className={cx(
                                "absolute -top-2 -translate-x-1/2 -translate-y-full rounded-lg bg-primary_alt px-3 py-2 shadow-lg ring-1 ring-secondary_alt",
                                hoverClasses,
                            )}
                        >
                            <div className="text-xs font-semibold text-secondary tabular-nums">{formatted}</div>
                        </div>
                    </div>
                );
            case "bottom-floating":
                return (
                    <div className={"group relative flex flex-col items-end gap-2"}>
                        {baseProgressBar}
                        <div
                            style={{ left: `${pct}%` }}
                            className={cx(
                                "absolute -bottom-2 -translate-x-1/2 translate-y-full rounded-lg bg-primary_alt px-3 py-2 shadow-lg ring-1 ring-secondary_alt",
                                hoverClasses,
                            )}
                        >
                            <div className="text-xs font-semibold text-secondary">{formatted}</div>
                        </div>
                    </div>
                );
            default:
                return baseProgressBar;
        }
    }

    // Render overlapped single progress bar with segments on hover
    if (items && items.length > 0 && overlapSegments) {
        const mi = min;
        const ma = max;
        const percs = items.map((it) => ((it.value - (it.min ?? mi)) * 100) / ((it.max ?? ma) - (it.min ?? mi)));
        const avgPct = percs.reduce((a, b) => a + b, 0) / percs.length;

        // Map z-index so the lowest value sits on top (highest z)
        const sortedAsc = [...items]
            .map((it, i) => ({ i, v: percs[i] }))
            .sort((a, b) => a.v - b.v)
            .map((entry, rank) => ({ ...entry, rank }));
        const zIndexMap = new Map<number, number>();
        sortedAsc.forEach(({ i, rank }) => {
            // higher z for lower value
            zIndexMap.set(i, items.length - rank);
        });

        const labelsOnHover = showTextOnHover ?? true; // default to hover-only in overlap mode

        return (
            <div className={cx("group flex flex-col gap-2", className)}>
                <div className="relative h-2 w-full overflow-hidden rounded-md bg-quaternary">
                    {/* Average (theme-aware) base, fades out on hover */}
                    <div
                        className="size-full rounded-md bg-secondary-solid transition-opacity duration-150 ease-linear group-hover:opacity-0"
                        style={{ transform: `translateX(-${100 - avgPct}%)` }}
                    />

                    {/* Colored segments, revealed on hover */}
                    {items.map((it, idx) => {
                        const mi2 = it.min ?? mi;
                        const ma2 = it.max ?? ma;
                        const pct = ((it.value - mi2) * 100) / (ma2 - mi2);
                        const overlayStyle: CSSProperties = it.color
                            ? { backgroundColor: it.color, ...(it.progressStyle ?? {}) }
                            : it.progressStyle ?? {};
                        const z = zIndexMap.get(idx) ?? 1;
                        return (
                            <div
                                key={idx}
                                className={cx(
                                    "pointer-events-none absolute inset-0 rounded-md transition-opacity duration-150 ease-linear opacity-0 group-hover:opacity-100",
                                    it.progressClassName ?? progressClassName,
                                )}
                                style={{ transform: `translateX(-${100 - pct}%)`, zIndex: z, ...overlayStyle }}
                            />
                        );
                    })}
                </div>

                {/* Labels under bar, shown on hover */}
                <div className={cx("flex flex-wrap items-center gap-x-4 gap-y-1", labelsOnHover ? "opacity-0 group-hover:opacity-100 transition-opacity duration-150" : undefined)}>
                    {items.map((it, idx) => (
                        <span key={`lbl-${idx}`} className="text-xs font-medium text-secondary tabular-nums">
                            {it.label} {Math.round(percs[idx])}%
                        </span>
                    ))}
                </div>
            </div>
        );
    }

    // Render multiple progress bars
    return (
        <div className={cx("flex flex-col gap-3", className)}>
            {items.map((item, idx) => {
                const mi = item.min ?? min;
                const ma = item.max ?? max;
                const { pct, formatted } = formatValue(item.value, mi, ma);
                const displayText = `${item.label} ${typeof formatted === "number" ? `${formatted}` : formatted}`;
                const colorStyle: CSSProperties = item.color
                    ? { backgroundColor: item.color, ...(item.progressStyle ?? {}) }
                    : item.progressStyle ?? {};

                const bar = (
                    <ProgressBarBase
                        key={`bar-${idx}`}
                        min={mi}
                        max={ma}
                        value={item.value}
                        className={cx("w-full", item.className)}
                        progressClassName={item.progressClassName ?? progressClassName}
                        progressStyle={colorStyle}
                    />
                );

                const hoverClasses = showTextOnHover ? "opacity-0 group-hover:opacity-100 transition-opacity duration-150" : "";

                switch (labelPosition) {
                    case "right":
                        return (
                            <div key={idx} className="group flex items-center gap-3">
                                {bar}
                                <span className={cx("shrink-0 text-xs font-medium text-secondary tabular-nums", hoverClasses)}>
                                    {displayText}
                                </span>
                            </div>
                        );
                    case "bottom":
                        return (
                            <div key={idx} className="group flex flex-col items-end gap-2">
                                {bar}
                                <span className={cx("text-xs font-medium text-secondary tabular-nums", hoverClasses)}>
                                    {displayText}
                                </span>
                            </div>
                        );
                    case "top-floating":
                        return (
                            <div key={idx} className="group relative flex flex-col items-end gap-2">
                                {bar}
                                <div
                                    style={{ left: `${pct}%` }}
                                    className={cx(
                                        "absolute -top-2 -translate-x-1/2 -translate-y-full rounded-lg bg-primary_alt px-3 py-2 shadow-lg ring-1 ring-secondary_alt",
                                        hoverClasses,
                                    )}
                                >
                                    <div className="text-xs font-semibold text-secondary tabular-nums">{displayText}</div>
                                </div>
                            </div>
                        );
                    case "bottom-floating":
                        return (
                            <div key={idx} className="group relative flex flex-col items-end gap-2">
                                {bar}
                                <div
                                    style={{ left: `${pct}%` }}
                                    className={cx(
                                        "absolute -bottom-2 -translate-x-1/2 translate-y-full rounded-lg bg-primary_alt px-3 py-2 shadow-lg ring-1 ring-secondary_alt",
                                        hoverClasses,
                                    )}
                                >
                                    <div className="text-xs font-semibold text-secondary tabular-nums">{displayText}</div>
                                </div>
                            </div>
                        );
                    default:
                        return (
                            <div key={idx} className="group">
                                {bar}
                            </div>
                        );
                }
            })}
        </div>
    );
};
