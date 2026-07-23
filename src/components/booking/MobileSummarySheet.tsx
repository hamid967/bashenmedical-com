import { useState } from "react";
import { ClipboardList } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { SummarySidebar } from "./SummarySidebar";
import type { State } from "./types";

/**
 * MobileSummarySheet — floating "Summary" button (md:hidden) that opens a
 * bottom sheet with the same content as SummarySidebar. Keeps the wizard
 * card clean on small viewports while still letting users audit and edit
 * previous steps in one tap. Sheet closes automatically after an edit jump.
 */
export function MobileSummarySheet({
  lang,
  state,
  branches,
  specialties,
  doctors,
  onEdit,
}: {
  lang: "ar" | "en";
  state: State;
  branches: any[];
  specialties: any[];
  doctors: any[];
  onEdit: (step: number) => void;
}) {
  const { t } = useTranslation("booking");
  const [open, setOpen] = useState(false);
  // Only render when there is at least one filled field to summarise.
  const hasContent =
    !!state.serviceType ||
    !!state.branchId ||
    !!state.specialtyId ||
    !!state.doctorId ||
    !!state.date ||
    !!state.time ||
    !!state.patient.name;
  if (!hasContent) return null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          type="button"
          size="lg"
          className="md:hidden fixed bottom-4 inset-x-4 z-40 shadow-lg gap-2 h-12 rounded-full"
          aria-label={t("summary.title")}
        >
          <ClipboardList className="h-4 w-4" aria-hidden="true" />
          <span>{t("summary.title")}</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[80vh] overflow-y-auto">
        <SheetHeader className="text-start">
          <SheetTitle>{t("summary.title")}</SheetTitle>
        </SheetHeader>
        <div className="mt-4">
          <SummarySidebar
            lang={lang}
            state={state}
            branches={branches}
            specialties={specialties}
            doctors={doctors}
            onEdit={(step) => {
              setOpen(false);
              onEdit(step);
            }}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
