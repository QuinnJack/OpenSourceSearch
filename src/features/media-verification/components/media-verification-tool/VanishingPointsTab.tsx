import type { MediaVerificationFile } from "./MediaVerificationTool.types";
import { AnalysisCardFrame } from "@/components/analysis/shared/AnalysisCardFrame";
import { VanishingPointsTool } from "./VanishingPointsTool";
import { cx } from "@/utils/cx";

interface VanishingPointsTabProps {
    activeTab: string;
    file: MediaVerificationFile | null;
}

export function VanishingPointsTab({ activeTab, file }: VanishingPointsTabProps) {
    const isActive = activeTab === "vanishing-points";

    return (
        <AnalysisCardFrame
            className={cx("h-full flex flex-col min-h-0", isActive ? "flex" : "hidden")}
        >
            <VanishingPointsTool file={file} isActive={isActive} />
        </AnalysisCardFrame>
    );
}
