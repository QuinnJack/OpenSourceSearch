"use client";

import { CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/base/card/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/base/accordion/accordion";
import { BadgeWithIcon } from "@/components/base/badges/badges";
import { XCircle } from "@untitledui/icons";
import AnalysisCardFrame from "@/components/analysis/shared/AnalysisCardFrame";
import type { MetadataData, MetadataEntry } from "@/types/analysis";

export interface MetadataExifCardProps {
  data: MetadataData;
  entries?: MetadataEntry[];
}

export function MetadataExifCard({ data, entries }: MetadataExifCardProps) {
  const items: MetadataEntry[] = entries ?? [
    { label: "EXIF Data", value: data.exifStripped ? "Stripped" : "Present", tone: data.exifStripped ? "error" : "success" },
    { label: "GPS Coordinates", value: data.gpsData ? "Found" : "Not Found", tone: data.gpsData ? "success" : "error" },
  ];

  const toneToClass = (tone?: MetadataEntry["tone"]) =>
    tone === "error"
      ? "text-fg-error-primary"
      : tone === "success"
        ? "text-success-primary"
        : tone === "warning"
          ? "text-fg-warning-primary"
          : "text-tertiary";

  return (
    <AnalysisCardFrame>
      <CardHeader className="border-b pb-2">
        <CardTitle className="text-sm mr-14">Metadata / EXIF</CardTitle>
        <CardDescription className="text-xs mr-12">Technical image data</CardDescription>
        <CardAction>
          <BadgeWithIcon type="modern" color={data.status === "error" ? "error" : data.status === "warning" ? "warning" : "gray"} iconTrailing={XCircle} className="px-2 py-0.5">
            <span className="text-xs font-medium">{data.exifStripped || !data.gpsData ? "Missing" : "OK"}</span>
          </BadgeWithIcon>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3 pt-4">
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="exif-details">
            <AccordionTrigger>Details</AccordionTrigger>
            <AccordionContent>
              <div className="space-y-2">
                {items.map((item) => (
                  <div key={item.label} className="flex items-center justify-between rounded-md bg-secondary_alt px-3 py-2">
                    <span className="text-sm text-tertiary">{item.label}</span>
                    <span className={`text-sm font-medium ${toneToClass(item.tone)}`}>{item.value}</span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-sm leading-relaxed text-tertiary">{data.details}</p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </AnalysisCardFrame>
  );
}

export default MetadataExifCard;
