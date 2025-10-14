"use client";

import type { PropsWithChildren } from "react";

import { Card } from "@/shared/components/base/card/card";
import { cx } from "@/shared/utils/cx";

export function AnalysisCardFrame({ children, className }: PropsWithChildren<{ className?: string }>) {
  return (
    <div className="relative">
      <div className={cx("pointer-events-none absolute inset-0 size-full rounded-xl ring-1 ring-secondary ring-inset")} />
      <Card className={cx("relative bg-primary text-secondary", className)}>{children}</Card>
    </div>
  );
}

export default AnalysisCardFrame;
