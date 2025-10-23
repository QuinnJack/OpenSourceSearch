import type { ReactNode } from "react";

import { FlipBackward, Scan } from "@untitledui/icons";

import { ButtonUtility } from "@/components/ui/buttons/button-utility";

interface MediaVerificationHeaderProps {
  onBack: () => void;
  headerActions?: ReactNode;
}

const HEADER_ICON_CLASS = "size-5 text-primary";

export function MediaVerificationHeader({ onBack, headerActions }: MediaVerificationHeaderProps) {
  return (
    <header className="border-b border-secondary bg-primary">
      <div className="mx-auto max-w-full px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-active">
              <Scan className={HEADER_ICON_CLASS} />
            </div>
            <div>
              <h1 className="text-base font-semibold text-secondary">Media Verification Tool</h1>
              <p className="text-xs text-tertiary mr-7">AI-Assisted Image Analysis</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {headerActions}
            <ButtonUtility
              color="secondary"
              tooltip="Back"
              icon={FlipBackward}
              size="xs"
              className="mt-0 self-start"
              onClick={onBack}
            />
          </div>
        </div>
      </div>
    </header>
  );
}

