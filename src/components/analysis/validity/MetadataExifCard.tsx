"use client";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion/accordion";
import { CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card/card";
import { FileQuestion01, Image04 } from "@untitledui/icons";

import AnalysisCardFrame from "@/components/analysis/shared/AnalysisCardFrame";
import { BadgeWithIcon } from "@/components/ui/badges/badges";
import type { MetadataData } from "@/shared/types/analysis";

export interface MetadataExifCardProps {
  data: MetadataData;
}

export function MetadataExifCard({ data }: MetadataExifCardProps) {
  return (
    <AnalysisCardFrame>
      <CardHeader className='flex items-center gap-3'>
        <div className='flex flex-col gap-0.5 flex-1 min-w-0 text-left'>

          <CardTitle className="text-sm mr-14">Metadata</CardTitle>
          {data.details && (
            <CardDescription className="text-xs whitespace-pre-wrap mr-12 text-tertiary">
              {data.details}
            </CardDescription>
          )}
        </div>
        <CardAction>
          {data.exifStripped ? (
            <BadgeWithIcon type="modern" color="warning" size="sm" iconLeading={FileQuestion01}>
              <span className="text-sm font-regular truncate">Missing</span>

            </BadgeWithIcon>
          ) : (
            <BadgeWithIcon type="modern" color="success" size="sm" iconLeading={Image04}>
              <span className="text-sm font-regular truncate">Found</span>
            </BadgeWithIcon>
          )}
        </CardAction>
      </CardHeader>
      <CardContent className={data.groups && data.groups.length > 0 ? "pt-2" : "pt-2 pb-2"}>
        {data.groups && data.groups.length > 0 ? (
          <Accordion
            type="multiple"
            defaultValue={[data.groups[0].title]}
            className="rounded-xl border border-secondary/20 bg-primary/40"
          >
            {data.groups.map((group) => (
              <AccordionItem key={group.title} value={group.title} className="px-2 text-secondary">
                <AccordionTrigger className="px-2 text-xs font-semibold uppercase tracking-wide text-secondary">
                  {group.title}
                </AccordionTrigger>
                <AccordionContent className="px-2 pb-4">
                  <dl className="grid gap-3 sm:grid-cols-2">
                    {group.entries.map((entry) => (
                      <div
                        key={`${group.title}-${entry.label}-${entry.value}`}
                        className="rounded-lg border border-secondary/20 bg-secondary_alt/40 px-3 py-2"
                      >
                        <dt className="text-[11px] font-medium uppercase tracking-wider text-tertiary">{entry.label}</dt>
                        <dd className="mt-1 text-sm text-secondary">{entry.value}</dd>
                      </div>
                    ))}
                  </dl>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        ) : (
          <div className="rounded-lg border border-dashed border-secondary/30 bg-secondary/5 px-3 py-3 text-sm text-tertiary">
            No structured EXIF properties were detected in this image.
          </div>
        )}
      </CardContent>
    </AnalysisCardFrame>
  );
}

export default MetadataExifCard;
